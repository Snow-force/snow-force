import { createRequire } from "node:module";
import { saleFixture, saleProvider } from "./tax-sale.mjs";
import { quoteCalculation } from "./tax-quote.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { assertTaxSaleTransaction } = require("../../src/lib/tax-sale-contract.ts");
export const saleOperation = "123e4567-e89b-42d3-a456-426614174051";
export const operation = index => `123e4567-e89b-42d3-a456-${String(426614174060 + index)}`;
export function refundFixture({ fee = 0, duplicateSku = false, freeShipping = false, taxCents = 154 } = {}) {
  const { source } = saleFixture();
  source.input.lines[0] = { ...source.input.lines[0], quantity: 3, unit_price_cents: 1000, discount_cents: 1 };
  if (duplicateSku) source.input.lines.push({ ...source.input.lines[0], id: "cali_second", quantity: 2, discount_cents: 0 });
  if (freeShipping) source.input.shipping.amount_cents = 0;
  if (fee) {
    source.input.shipping_address.state = "CO";
    source.input.collecting_states = ["CA", "CO"]; source.input.collecting_retail_fee_states = ["CO"];
  }
  source.calculation = quoteCalculation(source.input);
  const state = source.input.shipping_address.state, shippingTax = freeShipping ? 0 : 37;
  let itemTax = 0;
  for (const line of source.calculation.line_items.data) {
    line.amount_tax = line.quantity === 3 ? taxCents : 102; itemTax += line.amount_tax;
    line.tax_breakdown = [{ amount: line.amount_tax, taxable_amount: line.amount, taxability_reason: "standard_rated",
      jurisdiction: { country: "US", state, level: "state", display_name: "Fixture state" }, sourcing: "destination",
      tax_rate_details: { display_name: "Sales tax", percentage_decimal: "5.125", tax_type: "sales_tax" } }];
  }
  source.calculation.tax_breakdown = [{ amount: itemTax + shippingTax, taxable_amount: 0, inclusive: false, taxability_reason: "standard_rated",
    tax_rate_details: { country: "US", state, percentage_decimal: "5.125", rate_type: "percentage", tax_type: "sales_tax", flat_amount: null } }];
  if (fee) source.calculation.tax_breakdown.push({ amount: fee, taxable_amount: 0, inclusive: false, taxability_reason: "standard_rated",
    tax_rate_details: { country: "US", state: "CO", percentage_decimal: "0", rate_type: "flat_amount", tax_type: "retail_delivery_fee", flat_amount: { amount: fee, currency: "usd" } } });
  source.calculation.shipping_cost.amount_tax = shippingTax + fee;
  source.calculation.tax_amount_exclusive = itemTax + shippingTax + fee;
  source.calculation.amount_total += source.calculation.tax_amount_exclusive;
  source.receipt.total_cents = source.calculation.amount_total;
  const remote = saleProvider(source, saleOperation);
  const sale = { source, operation_id: saleOperation, snapshot: assertTaxSaleTransaction(source, saleOperation, remote.transaction, remote.lines) };
  const orderLines = source.input.lines.map((line, index) => ({ id: `ordli_${index}`, variant_id: line.variant_id, quantity: line.quantity, unit_price: (line.unit_price_cents / 100).toFixed(2),
    tax_lines: [{ provider_id: "snowforce_stripe_tax", metadata: { quote_id: source.quote_id, cart_line_id: line.id } }] }));
  const input = { items: [{ item_id: orderLines[0].id, quantity: 1 }], refund_shipping: false,
    fee_decisions: fee ? [{ state: "CO", refund: false, rationale: "Fixture reviewed fee retention" }] : [] };
  return { sale, orderLines, input };
}
export function reversalFixture(sale, allocation, request) {
  const transaction = { id: "tax_reversal", object: "tax.transaction", type: "reversal", currency: "usd", livemode: sale.source.input.livemode,
    reference: request.reference, metadata: request.metadata, reversal: { original_transaction: request.original_transaction },
    created: sale.source.captured_at + 10, posted_at: sale.source.captured_at + 10, tax_date: sale.source.input.tax_date,
    shipping_cost: request.shipping_cost ? { ...request.shipping_cost, tax_behavior: "exclusive", tax_code: sale.source.input.shipping.tax_code } : null };
  const lines = (request.line_items ?? []).map((line, index) => ({ id: `tax_li_reversal${index}`, object: "tax.transaction_line_item", type: "reversal",
    amount: line.amount, amount_tax: line.amount_tax, quantity: line.quantity, reference: line.reference, livemode: transaction.livemode, tax_behavior: "exclusive",
    tax_code: sale.snapshot.lines.find(original => original.id === line.original_line_item).tax_code, reversal: { original_line_item: line.original_line_item } }));
  return { transaction, lines };
}
