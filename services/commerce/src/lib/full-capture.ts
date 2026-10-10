import { createHash } from "node:crypto";
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { stripeProviderId } from "./checkout-policy";
import { exactTaxUsdCents, taxUsdAmount } from "./tax-quote-money";

const money = z.unknown().transform(exactTaxUsdCents);
const nativePayment = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]+$/), provider_id: z.literal(stripeProviderId), currency_code: z.literal("usd"),
  amount: money, raw_amount: z.object({ value: money }), canceled: z.literal(false),
  captures: z.array(z.object({ amount: money, raw_amount: z.object({ value: money }) })).max(1),
});
const body = z.object({ amount: taxUsdAmount.optional() }).strict();
const conflict = () => new MedusaError(MedusaError.Types.CONFLICT, "Capture the full original USD payment once. Reconcile any existing partial or inconsistent capture before continuing.");
type Connection = { raw(sql: string, values?: string[]): Promise<{ rows: unknown[] }> };

export function assertFullCapture(rawPayment: unknown, rawBody: unknown) {
  try {
    const payment = nativePayment.parse(rawPayment), input = body.parse(rawBody ?? {});
    if (payment.amount <= 0 || payment.raw_amount.value !== payment.amount ||
      input.amount !== undefined && exactTaxUsdCents(input.amount) !== payment.amount ||
      payment.captures.some(capture => capture.amount !== payment.amount || capture.raw_amount.value !== payment.amount)) throw conflict();
    return payment;
  } catch { throw conflict(); }
}
function admin(auth: unknown) {
  if (!z.object({ actor_type: z.literal("user"), actor_id: z.string().regex(/^user_[A-Za-z0-9]+$/) }).safeParse(auth).success)
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in to the shop admin.");
}
export async function useFullCaptureBoundary(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  admin("auth_context" in req ? req.auth_context : undefined);
  const id = z.string().regex(/^pay_[A-Za-z0-9]+$/).safeParse(req.params.id);
  if (!id.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter a valid payment ID.");
  try {
    const db = req.scope.resolve<Connection>(ContainerRegistrationKeys.PG_CONNECTION);
    const result = await db.raw(`select p.id,p.provider_id,p.currency_code,p.amount,p.raw_amount,p.canceled_at is not null as canceled,
      coalesce((select jsonb_agg(jsonb_build_object('amount',c.amount,'raw_amount',c.raw_amount) order by c.id)
        from commerce.capture c where c.payment_id=p.id and c.deleted_at is null),'[]'::jsonb) as captures
      from commerce.payment p where p.id=? and p.deleted_at is null`, [id.data]);
    if (result.rows.length !== 1) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Payment not found.");
    assertFullCapture(result.rows[0], req.body);
  } catch (error) {
    if (error instanceof MedusaError) throw error;
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Payment capture review is unavailable. Reload before retrying.");
  }
  next();
}

// Matches the canonical PL/pgSQL body in the versioned migration. Startup checks
// the actual enabled trigger and body, so an unapplied or changed guard cannot
// silently leave direct native-module capture paths unprotected in sales mode.
export const fullCaptureGuardBodyHash = "0b59533d654b9d7c6528d8f385047505c204858b8312a072b32789fd7f2732e4";
export const fullCaptureGuardFingerprint = (body: string) => createHash("sha256").update(body.replace(/\r\n/g, "\n").trim()).digest("hex");
export async function assertFullCaptureGuard(scope: MedusaContainer) {
  const db = scope.resolve<Connection>(ContainerRegistrationKeys.PG_CONNECTION);
  const result = await db.raw(`select t.tgenabled,t.tgtype,t.tgnargs,t.tgattr::text as columns,t.tgqual is null as unconditional,
    p.prosrc,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner
    from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where t.tgrelid='commerce.capture'::regclass and t.tgname='guard_single_full_stripe_capture'
      and not t.tgisinternal and n.nspname='commerce' and p.proname='guard_single_full_stripe_capture'`);
  const row = z.object({ tgenabled: z.enum(["O", "A"]), tgtype: z.literal(23), tgnargs: z.literal(0), columns: z.literal(""), unconditional: z.literal(true),
    prosrc: z.string(), prosecdef: z.literal(false), proconfig: z.tuple([z.literal('search_path=""')]), owner: z.literal("snowforce_commerce") });
  const parsed = z.array(row).length(1).safeParse(result.rows);
  if (!parsed.success || fullCaptureGuardFingerprint(parsed.data[0].prosrc) !== fullCaptureGuardBodyHash)
    throw new Error("Apply the reviewed SnowForce single-full-capture migration before enabling commerce sales.");
}
