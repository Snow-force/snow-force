import { z } from "zod";

// Public admin response only; keep Node/Stripe/native database code out of the browser bundle.
export const taxSaleAdminSchema = z.object({ tasks: z.array(z.object({ id: z.uuid(), order_id: z.string().regex(/^order_[A-Za-z0-9]{1,114}$/),
  state: z.enum(["queued", "running", "retry", "reconcile_required", "ready"]), attempts: z.number().int().nonnegative(),
  total_cents: z.number().int().nonnegative().max(99_999_999), livemode: z.boolean(), transaction_id: z.string().regex(/^tax_[A-Za-z0-9]+$/).nullable(),
  created_at: z.string(), updated_at: z.string(), error_code: z.enum(["provider_unavailable", "evidence_changed", "request_aged", "transaction_mismatch"]).nullable(),
})).max(100), unrecorded_orders: z.array(z.object({ order_id: z.string().regex(/^order_[A-Za-z0-9]{1,114}$/) })).max(20) });
