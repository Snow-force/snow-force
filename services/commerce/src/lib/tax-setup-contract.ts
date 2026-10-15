import { z } from "zod";

export const taxRegistrationId = z.string().regex(/^taxreg_[A-Za-z0-9]+$/).max(120);
const timestamp = z.number().int().positive().safe();
export const taxSetupRegistrationSchema = z.object({
  id: taxRegistrationId, country: z.string().regex(/^[A-Z]{2}$/),
  state: z.string().regex(/^[A-Z]{2}$/).nullable(), type: z.string().min(1).max(100).nullable(),
  active_from: timestamp, expires_at: timestamp.nullable(), status: z.enum(["active", "expired", "scheduled"]),
});
export const taxSetupSnapshotSchema = z.object({
  schema_version: z.literal(1), account_id: z.string().regex(/^acct_[A-Za-z0-9]+$/), livemode: z.boolean(),
  observed_at: timestamp, fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  settings: z.object({ status: z.enum(["active", "pending"]), provider: z.string(),
    head_office_country: z.string().nullable(), head_office_state: z.string().nullable(), missing_fields: z.array(z.string()).max(100),
  }),
  registrations: z.array(taxSetupRegistrationSchema).max(2000),
  collecting_states: z.array(z.string().regex(/^[A-Z]{2}$/)).max(51),
  collecting_retail_fee_states: z.array(z.enum(["CO", "MN"])).max(2),
  blockers: z.array(z.enum(["settings_pending", "unsupported_provider", "us_head_office_required", "california_registration_required", "registration_expiring", "unsupported_active_registration", "duplicate_active_registration", "retail_fee_without_sales_tax"])),
  api_ready: z.boolean(),
}).strict();
export type TaxSetupSnapshot = z.infer<typeof taxSetupSnapshotSchema>;
export const adminTaxSetupSchema = z.object({ snapshot: taxSetupSnapshotSchema, policy_confirmed: z.boolean(),
  integration_ready: z.literal(true),
  // Runtime gates only. Every checkout still verifies its policy, items, address and quote.
  checkout_ready: z.boolean(),
}).strict().refine(value => !value.checkout_ready || value.policy_confirmed && value.snapshot.api_ready,
  { message: "Checkout runtime gates require verified tax setup and operator confirmation." });
