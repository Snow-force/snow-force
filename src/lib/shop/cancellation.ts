import { z } from "zod";

export const cartCancellationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("confirmation-required"), token: z.string().regex(/^[a-f0-9]{64}$/), amountCents: z.number().int().positive().safe(), currency: z.literal("usd") }).strict(),
  z.object({ status: z.literal("editable") }).strict(),
  z.object({ status: z.literal("canceled") }).strict(),
  z.object({ status: z.literal("blocked"), code: z.enum(["payment-review", "payment-processing", "payment-authorized", "checkout-changed", "verification-unavailable", "recovery-pending"]) }).strict(),
  z.object({ status: z.literal("pending"), code: z.enum(["payment-review", "payment-processing", "payment-authorized", "checkout-changed", "verification-unavailable", "recovery-pending"]) }).strict(),
]);
export type CartCancellation = z.infer<typeof cartCancellationSchema>;
