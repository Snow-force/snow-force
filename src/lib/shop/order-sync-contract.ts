import { z } from "zod";
import { normalizeShopOrder, shopOrderRowSchema } from "./member-orders";

export const orderSyncSnapshotSchema = z.object({
  order: shopOrderRowSchema.extend({ id: z.string().regex(/^order_[A-Za-z0-9]+$/).max(120), user_id: z.string().uuid() }).strict(),
  observedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((snapshot, context) => {
  try { normalizeShopOrder(snapshot.order); }
  catch { context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid order snapshot" }); }
});
export type OrderSyncSnapshot = z.infer<typeof orderSyncSnapshotSchema>;
