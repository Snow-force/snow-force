import { z } from "zod";
import { taxCodeId, taxFingerprint, taxProductId } from "./tax-classification-contract";

export const taxMoneyCents = z.number().int().nonnegative().max(99_999_999);
export const taxQuoteState = z.enum("AL AR AZ CA CO CT DE DC FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));
export const taxQuoteAddress = z.object({ country: z.literal("US"), state: taxQuoteState, city: z.string().trim().min(1).max(200), line1: z.string().trim().min(1).max(300), line2: z.string().trim().max(300).default(""), postal_code: z.string().regex(/^\d{5}(?:-\d{4})?$/) }).strict();
const nativeLineId = z.string().regex(/^cali_[A-Za-z0-9]+$/).max(120);
export const taxQuoteInputSchema = z.object({
  cart_id: z.string().regex(/^cart_[A-Za-z0-9]+$/), customer_id: z.string().regex(/^cus_[A-Za-z0-9]+$/),
  cart_fingerprint: taxFingerprint, configuration_revision: z.number().int().positive(),
  account_id: z.string().regex(/^acct_[A-Za-z0-9]+$/), livemode: z.boolean(), tax_date: z.number().int().positive(),
  policy_confirmed: z.literal(true), california_permit_confirmed: z.literal(true), obligations_reviewed: z.literal(true),
  collecting_states: z.array(taxQuoteState).min(1).max(49), collecting_retail_fee_states: z.array(z.enum(["CO","MN"])).max(2),
  shipping_address: taxQuoteAddress, ship_from_address: taxQuoteAddress,
  lines: z.array(z.object({
    id: nativeLineId, product_id: taxProductId, variant_id: z.string().regex(/^variant_[A-Za-z0-9]+$/), title: z.string().min(1).max(300),
    quantity: z.number().int().positive().max(10_000), unit_price_cents: taxMoneyCents, discount_cents: taxMoneyCents,
    tax_code: taxCodeId, classification_revision: z.number().int().positive().max(100), classification_fingerprint: taxFingerprint,
  }).strict()).min(1).max(100),
  shipping: z.object({ id: z.string().regex(/^casm_[A-Za-z0-9]+$/), amount_cents: taxMoneyCents, tax_code: taxCodeId }).strict(),
}).strict().superRefine((value, ctx) => {
  const ids=value.lines.map(line=>line.id), states=value.collecting_states, fees=value.collecting_retail_fee_states;
  if (new Set(ids).size!==ids.length || new Set(states).size!==states.length || !states.includes("CA") || new Set(fees).size!==fees.length || fees.some(state=>!states.includes(state))) ctx.addIssue({ code:"custom", message:"Unique reviewed lines and active California registrations are required." });
  let total=BigInt(value.shipping.amount_cents);
  for(const line of value.lines) { const gross=BigInt(line.unit_price_cents)*BigInt(line.quantity);if(gross>99_999_999n||BigInt(line.discount_cents)>gross)ctx.addIssue({code:"custom",message:"Invalid merchandise amount."});total+=gross-BigInt(line.discount_cents); }
  if(total<0n||total>99_999_999n)ctx.addIssue({code:"custom",message:"Cart amount exceeds the supported USD range."});
});
export type TaxQuoteInput = z.infer<typeof taxQuoteInputSchema>;
const percent=z.string().regex(/^\d+(?:\.\d+)?$/).max(40);
export const taxQuoteBreakdownSchema = z.object({
  amount: taxMoneyCents, inclusive: z.literal(false), taxable_amount: taxMoneyCents,
  taxability_reason: z.string().min(1).max(100),
  tax_rate_details: z.object({ country:z.literal("US"),state:taxQuoteState.nullable(),percentage_decimal:percent,
    rate_type:z.enum(["percentage","flat_amount"]).nullable().optional(),tax_type:z.string().max(100).nullable(),
    flat_amount:z.object({amount:taxMoneyCents,currency:z.literal("usd")}).nullable().optional(),
  }),
});
export const taxQuoteLineBreakdownSchema=z.object({
  amount:taxMoneyCents,taxable_amount:taxMoneyCents,taxability_reason:z.string().min(1).max(100),
  jurisdiction:z.object({country:z.literal("US"),state:taxQuoteState.nullable(),level:z.string().max(100),display_name:z.string().max(500)}),
  sourcing:z.enum(["origin","destination"]),tax_rate_details:z.object({display_name:z.string().max(500),percentage_decimal:percent,tax_type:z.literal("sales_tax")}).nullable(),
});
export const stripeTaxCalculationSchema=z.object({
  id:z.string().regex(/^taxcalc_[A-Za-z0-9]+$/),object:z.literal("tax.calculation"),currency:z.literal("usd"),livemode:z.boolean(),
  amount_total:taxMoneyCents,tax_amount_exclusive:taxMoneyCents,tax_amount_inclusive:z.literal(0),tax_date:z.number().int().positive(),expires_at:z.number().int().positive(),
  customer_details:z.object({address:taxQuoteAddress.omit({line2:true}).extend({line2:z.string().nullable().optional()}),address_source:z.literal("shipping"),taxability_override:z.literal("none").optional()}),
  ship_from_details:z.object({address:taxQuoteAddress.omit({line2:true}).extend({line2:z.string().nullable().optional()})}),
  line_items:z.object({has_more:z.literal(false),total_count:z.number().int().nonnegative(),data:z.array(z.object({
    id:z.string().regex(/^tax_li_[A-Za-z0-9]+$/),reference:nativeLineId,amount:taxMoneyCents,amount_tax:taxMoneyCents,quantity:z.number().int().positive(),
    tax_code:taxCodeId,tax_behavior:z.literal("exclusive"),livemode:z.boolean(),tax_breakdown:z.array(taxQuoteLineBreakdownSchema).min(1).max(100),
  })).min(1).max(100)}),
  shipping_cost:z.object({amount:taxMoneyCents,amount_tax:taxMoneyCents,tax_code:taxCodeId,tax_behavior:z.literal("exclusive")}),
  tax_breakdown:z.array(taxQuoteBreakdownSchema).min(1).max(500),
});
