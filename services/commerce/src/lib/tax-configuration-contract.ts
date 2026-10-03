import { z } from "zod";
import { taxCodeId, taxCodeSchema, taxFingerprint } from "./tax-classification-contract";
import { taxQuoteAddress } from "./tax-quote-contract";

// Exact categories verified against Stripe's official list; never inferred from nearby IDs.
export const shippingTaxCodeIds = ["txcd_92010000", "txcd_92010001"] as const;
export const taxConfigurationKey = "snowforce_tax_configuration";
export const taxConfigurationContentSchema = z.object({
  legal_seller_name: z.string().trim().max(200),
  stock_location_id: z.string().regex(/^sloc_[A-Za-z0-9]+$/).nullable(),
  shipping_tax_code: taxCodeId.nullable(),
  california_permit_confirmed: z.boolean(), obligations_reviewed: z.boolean(),
  shipping_tax_treatment_reviewed: z.boolean(), review_note: z.string().trim().max(2000),
}).strict();
export type TaxConfigurationContent = z.infer<typeof taxConfigurationContentSchema>;
export const taxWarehouseSchema = z.object({ id: z.string().regex(/^sloc_[A-Za-z0-9]+$/), name: z.string(), address_id: z.string().nullable(),
  address: z.object({ address_1: z.string(), address_2: z.string().nullable(), city: z.string().nullable(), province: z.string().nullable(), postal_code: z.string().nullable(), country_code: z.string() }).nullable(),
}).strict();
export type TaxWarehouse = z.infer<typeof taxWarehouseSchema>;
export const taxConfigurationPublicationSchema = z.object({
  revision: z.number().int().positive(), content: taxConfigurationContentSchema,
  source_fingerprint: taxFingerprint, ship_from_address: taxQuoteAddress,
  shipping_code: taxCodeSchema, stock_location_id: z.string().regex(/^sloc_[A-Za-z0-9]+$/),
  policy_version: z.number().int().positive(),
  account_id: z.string().regex(/^acct_[A-Za-z0-9]+$/), livemode: z.boolean(), setup_fingerprint: taxFingerprint,
  reviewed_at: z.iso.datetime(), reviewed_by: z.string().regex(/^user_[A-Za-z0-9]+$/),
}).strict();
export type TaxConfigurationPublication = z.infer<typeof taxConfigurationPublicationSchema>;
const commandName = z.enum(["save_draft", "activate"]);
export const taxConfigurationStateSchema = z.object({ schema_version: z.literal(1), revision: z.number().int().min(0).max(1_000_000),
  draft: taxConfigurationContentSchema, active_revision: z.number().int().positive().nullable(),
  publications: z.array(taxConfigurationPublicationSchema).max(100),
  receipts: z.array(z.object({ request_id: z.uuid(), digest: taxFingerprint, revision: z.number().int().positive(), command: commandName }).strict()).max(64),
}).strict().superRefine((state,ctx)=>{
  const revisions=state.publications.map(p=>p.revision);
  if(new Set(revisions).size!==revisions.length||state.publications.some((p,i)=>p.revision>state.revision||i>0&&(p.revision<=state.publications[i-1].revision||p.reviewed_at<state.publications[i-1].reviewed_at))||state.active_revision!==null&&!revisions.includes(state.active_revision)||new Set(state.receipts.map(r=>r.request_id)).size!==state.receipts.length||state.receipts.some(r=>r.revision>state.revision))ctx.addIssue({code:"custom",message:"Tax configuration history is inconsistent."});
});
export type TaxConfigurationState = z.infer<typeof taxConfigurationStateSchema>;
const base={request_id:z.uuid(),expected_revision:z.number().int().min(0).max(999_999)};
export const taxConfigurationCommandSchema=z.discriminatedUnion("command",[
  z.object({...base,command:z.literal("save_draft"),content:taxConfigurationContentSchema}).strict(),
  z.object({...base,command:z.literal("activate"),source_fingerprint:taxFingerprint,confirm_review:z.literal(true)}).strict(),
]);
export type TaxConfigurationCommand=z.infer<typeof taxConfigurationCommandSchema>;
export const adminTaxConfigurationSchema=z.object({store_id:z.string(),persisted:z.boolean(),state:taxConfigurationStateSchema,
  warehouse:taxWarehouseSchema.nullable(),source_fingerprint:taxFingerprint,policy_seller_name:z.string().nullable(),policy_version:z.number().int().positive().nullable(),
  replayed:z.boolean().optional(),applied_revision:z.number().int().positive().optional(),
}).strict();
