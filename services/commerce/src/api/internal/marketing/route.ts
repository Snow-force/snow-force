import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "zod";
import { marketingOperation, marketingPreference, marketingWebhook, unsubscribeMarketing } from "../../../lib/marketing";
import { verifyMarketing } from "../../../lib/marketing-policy";
import type { TaxQuoteConnection } from "../../../lib/tax-quote-ledger";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { nonce, payload } = verifyMarketing(req.body, process.env.MARKETING_INTERNAL_SECRET ?? "");
  const db = req.scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
  if (!(await db.raw("insert into commerce.snowforce_marketing_nonces(nonce) values(?) on conflict do nothing returning nonce", [nonce])).rows.length) return res.status(409).json({ error: "Replayed request." });
  const command = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("event"), actor: z.string().min(1), command: z.unknown() }),
    z.object({ kind: z.literal("unsubscribe"), token: z.string().max(1000) }),
    z.object({ kind: z.literal("webhook"), event: z.unknown() }),
    z.object({ kind: z.literal("preference"), email: z.email(), optIn: z.boolean() }),
  ]).parse(payload);
  if (command.kind === "unsubscribe") return res.json(await unsubscribeMarketing(req.scope, command.token));
  if (command.kind === "webhook") return res.json(await marketingWebhook(req.scope, command.event));
  if (command.kind === "preference") return res.json(await marketingPreference(req.scope, command.email, command.optIn));
  return res.json(await marketingOperation(req.scope, "event", command.actor, command.command));
}
