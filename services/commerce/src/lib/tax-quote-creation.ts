import type { AuthContext } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { withCheckoutCartLease } from "./checkout-cart-lease";
import { z } from "zod";
import { readCartTaxQuoteSource } from "./tax-quote-source";
import { readRecordedTaxQuote, recordTaxQuote, reserveTaxQuote } from "./tax-quote-ledger";
import { buildStripeTaxQuoteRequest, taxQuoteBindingFingerprint } from "./tax-quote-money";
import { collectStripeTaxQuote, createStripeTaxQuoteWriter, taxQuoteWriterRegistration, type StripeTaxQuoteWriter } from "./tax-quote-provider";

const conflict = () => new MedusaError(MedusaError.Types.CONFLICT,
  "The current tax quote needs another review. Existing requests and results have been preserved.");
const lease = (signals: readonly (AbortSignal | undefined)[]) => { if (signals.some(signal => signal?.aborted)) throw conflict(); };
type Source = Awaited<ReturnType<typeof readCartTaxQuoteSource>>;
function sameSource(initial: Source, current: Source) {
  if (initial.source_fingerprint !== current.source_fingerprint || initial.setup.fingerprint !== current.setup.fingerprint ||
    taxQuoteBindingFingerprint(initial.input) !== taxQuoteBindingFingerprint(current.input)) throw conflict();
}

/** Private server operation. A saved quote never makes this cart payable; atomic native application is separate. */
export async function createCartTaxQuote(scope: MedusaContainer, auth: AuthContext | undefined, rawCartId: unknown,
  signals: readonly (AbortSignal | undefined)[] = []) {
  if (auth?.actor_type !== "customer" || !/^cus_[A-Za-z0-9]+$/.test(auth.actor_id)) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in through SnowForce.");
  const parsedId = z.string().regex(/^cart_[A-Za-z0-9]+$/).safeParse(rawCartId);
  if (!parsedId.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid cart.");
  try {
    lease(signals);
    return await withCheckoutCartLease(scope, parsedId.data, async leases => {
      lease(leases);
      const initial = await readCartTaxQuoteSource(scope, auth, parsedId.data, leases);
      const writer = scope.resolve<StripeTaxQuoteWriter | undefined>(taxQuoteWriterRegistration, { allowUnregistered: true }) ?? createStripeTaxQuoteWriter();
      z.object({ namespace: z.string().regex(/^[a-f0-9]{64}$/), livemode: z.literal(initial.input.livemode) }).parse(writer);
      const account = z.object({ object: z.literal("account"), id: z.literal(initial.input.account_id) }).parse(await writer.account());
      if (account.id !== initial.setup.account_id) throw conflict();
      lease(leases);
      // Account checks can overlap native edits. Reserve only after a fresh, still identical server source.
      const current = await readCartTaxQuoteSource(scope, auth, parsedId.data, leases);
      sameSource(initial, current);
      const context = { setup_fingerprint: current.setup.fingerprint, namespace: writer.namespace };
      const operation = await reserveTaxQuote(scope, current.input, context);
      lease(leases);
      let quote;
      if (operation.state === "ready") quote = await readRecordedTaxQuote(scope, operation.id, context);
      else {
        // Rebuild from the validated, persisted original input; JSONB property order cannot alter SDK parameters.
        if (process.env.COMMERCE_TAX_POLICY_CONFIRMED !== "true" || operation.database_now + 30 >= operation.input.tax_date + 900) throw conflict();
        const calculation = await writer.createCalculation(buildStripeTaxQuoteRequest(operation.input), `snowforce-tax-quote:${operation.id}`);
        lease(leases);
        const complete = await collectStripeTaxQuote(writer, operation.input, calculation, leases);
        lease(leases);
        quote = await recordTaxQuote(scope, operation.id, complete, context);
      }
      lease(leases);
      // Preserve completed historical evidence even if edits occurred during the provider POST, but don't return it as current.
      const after = await readCartTaxQuoteSource(scope, auth, parsedId.data, leases);
      sameSource(current, after);
      if (quote.binding_fingerprint !== taxQuoteBindingFingerprint(after.input) || after.input.tax_date >= quote.expires_at) throw conflict();
      lease(leases);
      return { quote_id: operation.id, quote, reused: operation.state === "ready", applied: false as const };
    }, signals);
  } catch { throw conflict(); }
}
