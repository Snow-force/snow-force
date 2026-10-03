import { createRequire } from "node:module";
import { setupReaderFixture } from "./tax-setup.mjs";
import { productFixture, stateFixture } from "./tax-classification.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { readStripeTaxSetup } = require("../../src/lib/tax-setup.ts");
const { checkoutFingerprint } = require("../../src/lib/checkout-policy.ts");
const money = require("../../src/lib/tax-quote-money.ts");
const ledger = require("../../src/lib/tax-quote-ledger.ts");
const classification = require("../../src/lib/tax-classification.ts");
export const quoteSetup = await readStripeTaxSetup(setupReaderFixture());
const records = new Map();
export function quoteInput(cart, now = Math.floor(Date.now()/1000)) {
  const address = cart.shipping_address;
  return { cart_id: cart.id, customer_id: cart.customer_id, cart_fingerprint: checkoutFingerprint(cart), configuration_revision: 2, account_id: "acct_fixture", livemode: false, tax_date: now,
    policy_confirmed: true, california_permit_confirmed: true, obligations_reviewed: true, collecting_states: ["CA"], collecting_retail_fee_states: [],
    shipping_address: { country: "US", state: address.province.toUpperCase(), city: address.city, line1: address.address_1, line2: address.address_2 ?? "", postal_code: address.postal_code },
    ship_from_address: { country: "US", state: "CA", city: "Fixture city", line1: "1 Test Street", line2: "", postal_code: "92614" },
    lines: cart.items.map(item => { const source=productFixture();source.variants[0].id=item.variant_id;return { id: item.id, product_id: "prod_fixture", variant_id: item.variant_id, title: item.title, quantity: item.quantity, unit_price_cents: money.exactTaxUsdCents(item.unit_price), discount_cents: 0, tax_code: "txcd_99999999", classification_revision: 1, classification_fingerprint: classification.taxClassificationReviewFingerprint(source.id,stateFixture(source).history[0]) }; }),
    shipping: { id: cart.shipping_methods[0].id, amount_cents: money.exactTaxUsdCents(cart.shipping_methods[0].amount), tax_code: "txcd_92010001" } };
}
export function quoteCalculation(input) {
  const breakdown = { amount: 0, taxable_amount: 0, taxability_reason: "product_exempt", jurisdiction: { country: "US", state: "CA", level: "state", display_name: "Isolated fixture" }, sourcing: "destination", tax_rate_details: null };
  const data = input.lines.map((line,index) => ({ id: `tax_li_${index}`, reference: line.id, amount: line.unit_price_cents*line.quantity-line.discount_cents, amount_tax: 0, quantity: line.quantity, tax_code: line.tax_code, tax_behavior: "exclusive", livemode: false, tax_breakdown: [breakdown] }));
  return { id: "taxcalc_fixture", object: "tax.calculation", currency: "usd", livemode: false, amount_total: data.reduce((a,l)=>a+l.amount,0)+input.shipping.amount_cents,
    tax_amount_exclusive: 0, tax_amount_inclusive: 0, tax_date: input.tax_date, expires_at: input.tax_date+86400,
    customer_details: { address: input.shipping_address, address_source: "shipping", taxability_override: "none" }, ship_from_details: { address: input.ship_from_address },
    line_items: { data, has_more: false, total_count: data.length }, shipping_cost: { amount: input.shipping.amount_cents, amount_tax: 0, tax_code: input.shipping.tax_code, tax_behavior: "exclusive" },
    tax_breakdown: [{ amount: 0, taxable_amount: 0, taxability_reason: "product_exempt", inclusive: false, tax_rate_details: { country: "US", state: "CA", percentage_decimal: "0", rate_type: "percentage", tax_type: "sales_tax", flat_amount: null } }] };
}
export function attachTaxQuote(cart, now) {
  const input = quoteInput(cart, now), calculation = quoteCalculation(input), quote = money.normalizeStripeTaxQuote(input,calculation,input.tax_date);
  const receipt = ledger.sealTaxQuoteReceipt("123e4567-e89b-42d3-a456-426614174001",quote,quoteSetup.fingerprint,cart,taxNativeCart(cart));
  const proof = { id: receipt.quote_id, input, calculation, snapshot: quote, setup_fingerprint: quoteSetup.fingerprint, receipt, database_now: input.tax_date, payment_session_id: null, bound_at: null, payment: null, operation_state: "ready" };
  if(cart.payment_collection?.payment_sessions.length===1) {
    const session=cart.payment_collection.payment_sessions[0];proof.payment_session_id=session.id;proof.bound_at=input.tax_date;
    proof.payment={...session,collection_id:cart.payment_collection.id,created_at:input.tax_date,metadata:{snowforce_payment_creation:{cart_id:cart.id,customer_id:cart.customer_id,quote:receipt.checkout_fingerprint,livemode:false}}};
  }
  records.set(receipt.signature,proof);cart.metadata={...cart.metadata,[ledger.taxQuoteReceiptKey]:receipt};return proof;
}
export function taxQuoteRows(sql,cart) {
  if (!sql.includes("from commerce.snowforce_tax_quotes q join")) return null;
  const proof = records.get(cart.metadata?.[ledger.taxQuoteReceiptKey]?.signature);
  if(!proof)return [];
  const row=structuredClone(proof),session=cart.payment_collection?.payment_sessions[0];
  if(cart.payment_collection?.payment_sessions.length===1) {
    row.payment_session_id=session.id;row.bound_at=proof.input.tax_date;
    row.payment={...session,collection_id:cart.payment_collection.id,created_at:proof.input.tax_date,metadata:{snowforce_payment_creation:{cart_id:cart.id,customer_id:cart.customer_id,quote:proof.receipt.checkout_fingerprint,livemode:false}}};
  } else {row.payment_session_id=null;row.bound_at=null;row.payment=null;}
  return [row];
}
export function taxNativeCart(cart) {
  return { ...cart, item_subtotal:cart.items.reduce((a,l)=>a+l.unit_price*l.quantity,0),shipping_subtotal:cart.shipping_methods[0]?.amount??0,shipping_tax_total:0,discount_subtotal:cart.discount_total,
    items:cart.items.map(item=>({...item,tax_lines:[{rate:0}],tax_total:0,discount_subtotal:0,is_tax_inclusive:false})),shipping_methods:cart.shipping_methods.map(method=>({...method,tax_lines:[{rate:0}],total:method.amount,tax_total:0})) };
}
