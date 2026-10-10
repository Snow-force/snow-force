import type Stripe from "stripe";
import { z } from "zod";
import { taxMoneyCents } from "./tax-quote-contract";
import { exactTaxUsdCents, taxQuoteMerchandiseRefund } from "./tax-quote-money";
import { assertTaxSaleTransaction, checkedTaxSaleSource, saleTransactionId, taxSaleFingerprint, taxSaleSourceSchema } from "./tax-sale-contract";

const cartLineId = z.string().regex(/^cali_[A-Za-z0-9]+$/), orderLineId = z.string().regex(/^ordli_[A-Za-z0-9]+$/);
const taxLineId = z.string().regex(/^tax_li_[A-Za-z0-9]+$/), quantity = z.number().int().positive().max(10000);
const feeState = z.enum(["CO", "MN"]);
const feeDecisionSchema = z.object({ state: feeState, refund: z.boolean(), rationale: z.string().trim().min(5).max(1000) }).strict();
export class TaxRefundConflict extends Error { constructor() { super("Original refund amounts and tax evidence need reconciliation."); } }
const fail = () => new TaxRefundConflict();
export const taxRefundInputSchema = z.object({
  items: z.array(z.object({ item_id: orderLineId, quantity }).strict()).max(100),
  refund_shipping: z.boolean(),
  fee_decisions: z.array(feeDecisionSchema).max(2),
}).strict();
const saleSchema = z.object({ source: taxSaleSourceSchema, operation_id: z.uuid(), snapshot: z.unknown() }).strict();
const orderLineSchema = z.object({ id: orderLineId, variant_id: z.string(), quantity: z.coerce.number().int().positive().max(10000),
  unit_price: z.unknown().transform(exactTaxUsdCents),
  tax_lines: z.array(z.object({ provider_id: z.literal("snowforce_stripe_tax"),
    metadata: z.object({ quote_id: z.uuid(), cart_line_id: cartLineId }),
  })).length(1),
});
const allocationSchema = z.object({
  schema_version: z.literal(1), operation_id: z.uuid(), order_id: z.string(), sale_transaction_id: saleTransactionId,
  sale_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  lines: z.array(z.object({ item_id: orderLineId, cart_line_id: cartLineId, original_line_item: taxLineId,
    already_returned: z.number().int().nonnegative().max(10000), quantity, net_cents: taxMoneyCents, sales_tax_cents: taxMoneyCents,
  }).strict()).max(100),
  shipping_cents: taxMoneyCents, shipping_tax_cents: taxMoneyCents,
  refund_shipping: z.boolean(), fee_decisions: z.array(feeDecisionSchema).max(2),
  fees: z.array(z.object({ state: feeState, amount_cents: taxMoneyCents, rationale: z.string().trim().min(5).max(1000) }).strict()).max(2),
  total_cents: taxMoneyCents,
}).strict().superRefine((allocation, ctx) => {
  const sum = allocation.lines.reduce((value, line) => value + line.net_cents + line.sales_tax_cents, 0) + allocation.shipping_cents + allocation.shipping_tax_cents + allocation.fees.reduce((value, fee) => value + fee.amount_cents, 0);
  const duplicated = (values: string[]) => new Set(values).size !== values.length;
  if (!allocation.total_cents || sum !== allocation.total_cents || duplicated(allocation.lines.map(line => line.item_id)) ||
    duplicated(allocation.lines.map(line => line.cart_line_id)) || duplicated(allocation.lines.map(line => line.original_line_item)) ||
    duplicated(allocation.fees.map(fee => fee.state)) || duplicated(allocation.fee_decisions.map(fee => fee.state)))
    ctx.addIssue({ code: "custom", message: "Unique original refund components and exact total cents are required." });
});
export type TaxRefundAllocation = z.infer<typeof allocationSchema>;
export function checkedRefundSale(raw: unknown) {
  const sale = saleSchema.parse(raw), { quote } = checkedTaxSaleSource(sale.source);
  const snapshot = z.object({ transaction: z.unknown(), lines: z.unknown() }).parse(sale.snapshot);
  const original = assertTaxSaleTransaction(sale.source, sale.operation_id, snapshot.transaction, snapshot.lines);
  return { ...sale, quote, original, fingerprint: taxSaleFingerprint({ source: sale.source, operation_id: sale.operation_id, snapshot: original }) };
}
function unique(values: string[]) { if (new Set(values).size !== values.length) throw fail(); }
const total = (values: number[]) => taxMoneyCents.parse(values.reduce((sum, cents) => sum + cents, 0));
export function assertTaxRefundAllocation(rawSale: unknown, rawAllocation: unknown) {
  return checkedAllocation(checkedRefundSale(rawSale), rawAllocation);
}
function checkedAllocation(sale: ReturnType<typeof checkedRefundSale>, rawAllocation: unknown) {
  const allocation = allocationSchema.parse(rawAllocation);
  if (allocation.order_id !== sale.source.order_id || allocation.sale_transaction_id !== sale.original.transaction.id || allocation.sale_fingerprint !== sale.fingerprint ||
    allocation.total_cents > sale.quote.amounts.total_cents || allocation.fee_decisions.length !== sale.quote.fees.length ||
    allocation.fee_decisions.some(fee => !sale.quote.fees.some(value => value.state === fee.state))) throw fail();
  for (const line of allocation.lines) {
    const original = sale.quote.lines.find(value => value.id === line.cart_line_id), transactionLine = sale.original.lines.find(value => value.reference === line.cart_line_id);
    if (!original || transactionLine?.id !== line.original_line_item) throw fail();
    const expected = taxQuoteMerchandiseRefund(original, line.already_returned, line.quantity);
    if (expected.net_cents !== line.net_cents || expected.sales_tax_cents !== line.sales_tax_cents) throw fail();
  }
  if (allocation.shipping_cents !== (allocation.refund_shipping ? sale.quote.shipping.amount_cents : 0) ||
    allocation.shipping_tax_cents !== (allocation.refund_shipping ? sale.quote.shipping.sales_tax_cents : 0)) throw fail();
  const refundedDecisions = allocation.fee_decisions.filter(value => value.refund);
  if (refundedDecisions.length !== allocation.fees.length) throw fail();
  for (const fee of allocation.fees) {
    const original = sale.quote.fees.find(value => value.state === fee.state), decision = refundedDecisions.find(value => value.state === fee.state);
    if (!original || !decision || original.amount_cents !== fee.amount_cents || !fee.amount_cents || decision.rationale !== fee.rationale) throw fail();
  }
  return allocation;
}
/** Order IDs are new IDs. The quote marker is copied by native prepareLineItemData
 * into the order tax line; variant matching alone is ambiguous for duplicate SKUs. */
export function bindRefundOrderLines(rawSale: unknown, rawLines: unknown) {
  const sale = checkedRefundSale(rawSale), lines = z.array(orderLineSchema).max(100).parse(rawLines);
  if (lines.length !== sale.quote.lines.length) throw fail();
  unique(lines.map(line => line.id)); unique(lines.map(line => line.tax_lines[0].metadata.cart_line_id));
  return lines.map(line => {
    const marker = line.tax_lines[0].metadata, original = sale.quote.lines.find(item => item.id === marker.cart_line_id);
    if (!original || marker.quote_id !== sale.source.quote_id || line.variant_id !== original.variant_id ||
      line.quantity !== original.quantity || line.unit_price !== original.unit_price_cents) throw fail();
    return { item_id: line.id, cart_line_id: original.id };
  });
}
/** Validates each immutable prior allocation in order. Pending reservations must
 * be included by the caller so another operation cannot spend the same units. */
function checkedHistory(sale: ReturnType<typeof checkedRefundSale>, bindings: ReturnType<typeof bindRefundOrderLines>, raw: unknown) {
  const history = z.array(allocationSchema).max(10000).parse(raw), returned = new Map<string, number>(), feeReturned = new Set<string>();
  unique(history.map(value => value.operation_id)); let shippingReturned = false;
  for (const allocation of history) {
    checkedAllocation(sale, allocation);
    if (allocation.order_id !== sale.source.order_id || allocation.sale_transaction_id !== sale.original.transaction.id || allocation.sale_fingerprint !== sale.fingerprint) throw fail();
    unique(allocation.lines.map(line => line.item_id)); unique(allocation.fees.map(fee => fee.state));
    for (const line of allocation.lines) {
      const binding = bindings.find(value => value.item_id === line.item_id), original = sale.quote.lines.find(value => value.id === line.cart_line_id);
      const transactionLine = sale.original.lines.find(value => value.reference === line.cart_line_id);
      if (!binding || binding.cart_line_id !== line.cart_line_id || !original || transactionLine?.id !== line.original_line_item || line.already_returned !== (returned.get(line.cart_line_id) ?? 0)) throw fail();
      const expected = taxQuoteMerchandiseRefund(original, line.already_returned, line.quantity);
      if (expected.net_cents !== line.net_cents || expected.sales_tax_cents !== line.sales_tax_cents) throw fail();
      returned.set(line.cart_line_id, line.already_returned + line.quantity);
    }
    if (allocation.refund_shipping) {
      if (shippingReturned || allocation.shipping_cents !== sale.quote.shipping.amount_cents || allocation.shipping_tax_cents !== sale.quote.shipping.sales_tax_cents) throw fail();
      shippingReturned = true;
    }
    for (const fee of allocation.fees) {
      const original = sale.quote.fees.find(value => value.state === fee.state);
      if (!original || !fee.amount_cents || original.amount_cents !== fee.amount_cents || feeReturned.has(fee.state)) throw fail();
      feeReturned.add(fee.state);
    }
    if (!allocation.total_cents || allocation.total_cents !== total([...allocation.lines.flatMap(line => [line.net_cents, line.sales_tax_cents]), allocation.shipping_cents, allocation.shipping_tax_cents, ...allocation.fees.map(fee => fee.amount_cents)])) throw fail();
  }
  return { history, returned, shippingReturned, feeReturned };
}
/** Client/staff input selects quantities and reviewed delivery decisions, never
 * prices, tax rates or cents. All amounts come from the committed original sale. */
export function buildTaxRefundAllocation(rawSale: unknown, rawOrderLines: unknown, rawHistory: unknown, rawInput: unknown, operationId: string): TaxRefundAllocation {
  const sale = checkedRefundSale(rawSale), bindings = bindRefundOrderLines(rawSale, rawOrderLines);
  const previous = checkedHistory(sale, bindings, rawHistory), input = taxRefundInputSchema.parse(rawInput), operation = z.uuid().parse(operationId);
  if (previous.history.some(value => value.operation_id === operation)) throw fail();
  unique(input.items.map(item => item.item_id)); unique(input.fee_decisions.map(fee => fee.state));
  if (input.fee_decisions.length !== sale.quote.fees.length || input.fee_decisions.some(fee => !sale.quote.fees.some(value => value.state === fee.state))) throw fail();
  const lines = input.items.map(item => {
    const binding = bindings.find(value => value.item_id === item.item_id), original = sale.quote.lines.find(value => value.id === binding?.cart_line_id);
    if (!binding || !original) throw fail();
    const already_returned = previous.returned.get(original.id) ?? 0, part = taxQuoteMerchandiseRefund(original, already_returned, item.quantity);
    return { ...binding, original_line_item: sale.original.lines.find(value => value.reference === original.id)!.id, already_returned,
      quantity: item.quantity, net_cents: part.net_cents, sales_tax_cents: part.sales_tax_cents };
  }).sort((a, b) => a.cart_line_id.localeCompare(b.cart_line_id));
  if (input.refund_shipping && previous.shippingReturned) throw fail();
  const shipping_cents = input.refund_shipping ? sale.quote.shipping.amount_cents : 0, shipping_tax_cents = input.refund_shipping ? sale.quote.shipping.sales_tax_cents : 0;
  const fees = input.fee_decisions.filter(fee => fee.refund).map(fee => {
    if (previous.feeReturned.has(fee.state)) throw fail();
    return { state: fee.state, amount_cents: sale.quote.fees.find(value => value.state === fee.state)!.amount_cents, rationale: fee.rationale };
  }).sort((a, b) => a.state.localeCompare(b.state));
  const total_cents = total([...lines.flatMap(line => [line.net_cents, line.sales_tax_cents]), shipping_cents, shipping_tax_cents, ...fees.map(fee => fee.amount_cents)]);
  if (!total_cents || total([...previous.history.map(value => value.total_cents), total_cents]) > sale.quote.amounts.total_cents) throw fail();
  return allocationSchema.parse({ schema_version: 1, operation_id: operation, order_id: sale.source.order_id, sale_transaction_id: sale.original.transaction.id,
    sale_fingerprint: sale.fingerprint, lines, refund_shipping: input.refund_shipping, fee_decisions: input.fee_decisions, shipping_cents, shipping_tax_cents, fees, total_cents });
}
/** Only call after matching this allocation to a succeeded native/Stripe refund.
 * A tax reversal records tax liability; it does not return customer funds. */
export function taxRefundReversalRequest(rawSale: unknown, rawAllocation: unknown): Stripe.Tax.TransactionCreateReversalParams {
  const allocation = assertTaxRefundAllocation(rawSale, rawAllocation);
  if (!allocation.total_cents) throw fail();
  const shippingTax = total([allocation.shipping_tax_cents, ...allocation.fees.map(fee => fee.amount_cents)]);
  return { mode: "partial", original_transaction: allocation.sale_transaction_id, reference: `snowforce-refund:${allocation.operation_id}`,
    metadata: { snowforce_operation: allocation.operation_id, snowforce_order: allocation.order_id },
    ...(allocation.lines.some(line => line.net_cents || line.sales_tax_cents) ? { line_items: allocation.lines.filter(line => line.net_cents || line.sales_tax_cents).map(line => ({
      original_line_item: line.original_line_item, reference: `${allocation.operation_id}:${line.cart_line_id}`, quantity: line.quantity, amount: -line.net_cents, amount_tax: -line.sales_tax_cents,
    })) } : {}),
    ...(allocation.shipping_cents || shippingTax ? { shipping_cost: { amount: -allocation.shipping_cents, amount_tax: -shippingTax } } : {}),
  };
}
const negativeCents = z.number().int().max(0).min(-99_999_999), epoch = z.number().int().positive().safe();
export const taxReversalLineSchema = z.object({ id: taxLineId, object: z.literal("tax.transaction_line_item"), type: z.literal("reversal"),
  amount: negativeCents, amount_tax: negativeCents, quantity, reference: z.string(), livemode: z.boolean(), tax_behavior: z.literal("exclusive"), tax_code: z.string(),
  reversal: z.object({ original_line_item: taxLineId }),
});
export function assertTaxRefundReversalHeader(rawSale: unknown, rawAllocation: unknown, rawTransaction: unknown) {
  const sale = checkedRefundSale(rawSale), allocation = assertTaxRefundAllocation(rawSale, rawAllocation), request = taxRefundReversalRequest(rawSale, allocation);
  if (sale.fingerprint !== allocation.sale_fingerprint || allocation.sale_transaction_id !== sale.original.transaction.id || allocation.order_id !== sale.source.order_id) throw fail();
  const transaction = z.object({ id: saleTransactionId, object: z.literal("tax.transaction"), type: z.literal("reversal"), currency: z.literal("usd"), livemode: z.boolean(),
    reference: z.string(), metadata: z.record(z.string(), z.string()), reversal: z.object({ original_transaction: saleTransactionId }),
    created: epoch, posted_at: epoch, tax_date: epoch,
    shipping_cost: z.object({ amount: negativeCents, amount_tax: negativeCents, tax_behavior: z.literal("exclusive"), tax_code: z.string() }).nullable(),
  }).parse(rawTransaction);
  if (transaction.id === sale.original.transaction.id || transaction.livemode !== sale.source.input.livemode || transaction.reference !== request.reference ||
    transaction.reversal.original_transaction !== request.original_transaction || transaction.created < sale.source.captured_at || transaction.posted_at < sale.source.captured_at ||
    transaction.posted_at > transaction.created || transaction.tax_date !== sale.original.transaction.tax_date ||
    Object.entries(request.metadata!).some(([key, value]) => transaction.metadata[key] !== value)) throw fail();
  const shipping = request.shipping_cost ?? { amount: 0, amount_tax: 0 }, actualShipping = transaction.shipping_cost;
  if (actualShipping ? actualShipping.amount !== shipping.amount || actualShipping.amount_tax !== shipping.amount_tax || actualShipping.tax_code !== sale.quote.shipping.tax_code : shipping.amount || shipping.amount_tax) throw fail();
  return transaction;
}
export function assertTaxRefundReversal(rawSale: unknown, rawAllocation: unknown, rawTransaction: unknown, rawLines: unknown) {
  const sale = checkedRefundSale(rawSale), allocation = assertTaxRefundAllocation(rawSale, rawAllocation), request = taxRefundReversalRequest(rawSale, allocation);
  const transaction = assertTaxRefundReversalHeader(rawSale, allocation, rawTransaction), actualShipping = transaction.shipping_cost;
  const lines = z.array(taxReversalLineSchema).max(100).parse(rawLines), expected = request.line_items ?? [];
  if (lines.length !== expected.length) throw fail();
  unique(lines.map(line => line.id)); unique(lines.map(line => line.reversal.original_line_item));
  for (const line of lines) {
    const original = sale.original.lines.find(value => value.id === line.reversal.original_line_item), requested = expected.find(value => value.original_line_item === line.reversal.original_line_item);
    if (!requested || !original || line.amount !== requested.amount || line.amount_tax !== requested.amount_tax || line.quantity !== requested.quantity ||
      line.reference !== requested.reference || line.livemode !== sale.source.input.livemode || line.tax_code !== original.tax_code || line.id === original.id) throw fail();
  }
  if (-(lines.reduce((sum, line) => sum + line.amount + line.amount_tax, 0) + (actualShipping?.amount ?? 0) + (actualShipping?.amount_tax ?? 0)) !== allocation.total_cents) throw fail();
  return { schema_version: 1 as const, transaction, lines, total_cents: allocation.total_cents };
}
