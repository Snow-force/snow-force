import type { MedusaContainer, ILockingModule, IPromotionModuleService, CreatePromotionDTO, PromotionDTO } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, MedusaError } from "@medusajs/framework/utils";
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows";
import { z } from "zod";
import { createHash } from "node:crypto";
import { verifyMarketing } from "./marketing-policy";
import { orderMemberId } from "./order-sync";
import { newcomerCode, newcomerPolicy, newcomerPolicySchema, newcomerPromotion } from "./newcomer-policy";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { queueNewcomerEmail } from "./newcomer-email";

const assertion = z.object({ kind: z.literal("newcomer"), userId: z.uuid(), email: z.email(), createdAt: z.iso.datetime() }).strict();
export function newcomerEmailHash(email: string) {
  return createHash("sha256").update(z.email().parse(email.trim().toLowerCase())).digest("hex");
}
type Creation = (scope: MedusaContainer, input: CreatePromotionDTO) => Promise<PromotionDTO>;
const nativeCreation: Creation = async (scope, input) => {
  const { result } = await createPromotionsWorkflow(scope).run({ input: { promotionsData: [input] } });
  if (!result[0]) throw new Error("Welcome offer is unavailable.");
  return result[0];
};
export async function claimNewcomer(scope: MedusaContainer, customerId: string, envelope: unknown, now = new Date(), create: Creation = nativeCreation) {
  const policy = newcomerPolicy();
  if (!policy) return { status: "disabled" as const };
  const signed = verifyMarketing(envelope, process.env.NEWCOMER_SIGNING_SECRET ?? "", now.getTime());
  const member = assertion.parse(signed.payload);
  // A signed website assertion cannot be used with a different customer's JWT.
  if (await orderMemberId(customerId, scope) !== member.userId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in through SnowForce.");
  if (new Date(member.createdAt) > now || (policy.eligibility === "new_accounts" && Date.parse(member.createdAt) < Date.parse(policy.registeredAfter ?? ""))) return { status: "ineligible" as const };
  const locking = scope.resolve<ILockingModule>(Modules.LOCKING);
  return locking.execute(`snowforce-newcomer:${member.userId}`, async signal => {
    const db = scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
    const promotions = scope.resolve<IPromotionModuleService>(Modules.PROMOTION);
    const code = newcomerCode(member.userId);
    // Include soft-deleted promotions: deletion must never grant a second welcome code.
    const previous = await db.raw("select id,deleted_at from commerce.promotion where code=?", [code]);
    let promotion;
    if (previous.rows.length) {
      const row = z.object({ id: z.string(), deleted_at: z.unknown() }).parse(previous.rows[0]);
      if (row.deleted_at) return { status: "expired" as const };
      promotion = await promotions.retrievePromotion(row.id, { relations: ["campaign", "rules.values", "application_method"] });
    } else {
      const orders = await db.raw('select id from commerce."order" where customer_id=? and is_draft_order=false limit 1', [customerId]);
      if (orders.rows.length) return { status: "ineligible" as const };
      if (signal?.aborted) throw new Error("Welcome offer lock expired.");
      // Unique constraints serialize claims across different accounts with the same verified email.
      // Keep this record even if native promotion creation fails; the same owner can retry.
      await db.raw(`insert into commerce.snowforce_newcomer_claims(member_id,email_hash,customer_id,code)
        values (?,?,?,?) on conflict do nothing`, [member.userId, newcomerEmailHash(member.email), customerId, code]);
      const claim = await db.raw("select customer_id,code from commerce.snowforce_newcomer_claims where member_id=?", [member.userId]);
      const owner = z.array(z.object({ customer_id: z.string(), code: z.string() })).parse(claim.rows);
      if (owner.length !== 1 || owner[0].customer_id !== customerId || owner[0].code !== code) return { status: "ineligible" as const };
      if (signal?.aborted) throw new Error("Welcome offer lock expired.");
      promotion = await create(scope, newcomerPromotion(member.userId, customerId, policy, now));
      // Re-read campaign relations instead of relying on workflow response expansion.
      promotion = await promotions.retrievePromotion(promotion.id, { relations: ["campaign", "rules.values", "application_method"] });
    }
    const bound = promotion.rules?.some(rule => rule.attribute === "customer_id" && rule.operator === "eq" && rule.values?.length === 1 && rule.values[0].value === customerId);
    if (!bound || promotion.metadata?.snowforce_member_id !== member.userId || promotion.limit !== 1) throw new Error("Welcome offer ownership is invalid.");
    if ((promotion.used ?? 0) >= 1) return { status: "used" as const };
    const endsAt = promotion.campaign?.ends_at ? new Date(promotion.campaign.ends_at).toISOString() : null;
    if (promotion.status !== "active" || !endsAt || new Date(endsAt) <= now) return { status: "expired" as const };
    const issuedPolicy = newcomerPolicySchema.parse(promotion.metadata?.snowforce_newcomer_policy);
    const emailStatus = await queueNewcomerEmail(scope, member.userId, customerId, member.email, code, endsAt);
    return { status: "ready" as const, code, endsAt, policy: issuedPolicy, emailStatus };
  }, { timeout: 15, expire: 60 });
}
