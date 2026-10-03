import { BigNumber, MathBN, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";

export const afterSalesStatuses = ["pending", "approved", "processing", "completed", "rejected", "cancelled"] as const;
export const afterSalesKinds = ["return", "exchange"] as const;
export const afterSalesReasons = ["size", "quality", "incorrect", "other"] as const;
const quantity = z.union([z.instanceof(BigNumber), z.number().finite(), z.string().regex(/^\d+(?:\.0+)?$/)])
  .transform((value) => MathBN.convert(value).toNumber()).pipe(z.number().int().min(0).max(10000));
const item = z.object({ id: z.string().regex(/^ordli_[A-Za-z0-9]+$/), quantity: z.number().int().positive().max(10000) }).strict();
export const afterSalesInput = z.object({ requestKey: z.string().uuid(), kind: z.enum(afterSalesKinds), reason: z.enum(afterSalesReasons), description: z.string().trim().min(5).max(2000), items: z.array(item).min(1).max(100) }).strict().refine((value) => new Set(value.items.map((line) => line.id)).size === value.items.length, "Duplicate items");
export const afterSalesReview = z.discriminatedUnion("command", [
  z.object({ command: z.literal("review"), version: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), message: z.string().trim().min(5).max(2000), internalNote: z.string().max(4000).default(""), policyException: z.boolean().default(false) }).strict(),
  z.object({ command: z.literal("link"), version: z.number().int().positive(), nativeId: z.string().regex(/^(return|oexc)_[A-Za-z0-9]+$/) }).strict(),
  z.object({ command: z.literal("complete"), version: z.number().int().positive(), message: z.string().trim().min(5).max(2000) }).strict(),
]);
export const afterSalesCustomerUpdate = z.discriminatedUnion("command", [
  z.object({ command: z.literal("cancel"), version: z.number().int().positive() }).strict(),
  z.object({ command: z.literal("tracking"), version: z.number().int().positive(), carrier: z.string().trim().min(1).max(100), trackingNumber: z.string().trim().min(1).max(200) }).strict(),
]);
export function returnableQuantity(detail: Record<string, unknown> | null | undefined): number {
  // Native returns keep pending and received quantities separately; damaged receipts also count as written off.
  const quantities = ["delivered_quantity", "return_requested_quantity", "return_received_quantity", "written_off_quantity"].map((field) => {
    return quantity.parse(detail?.[field] ?? 0);
  });
  return Math.max(0, quantities[0] - quantities[1] - quantities[2] - quantities[3]);
}
export function assertAfterSalesItems(order: { status: string; currency_code: string; items: { id: string; detail?: Record<string, unknown> | null }[] }, input: z.infer<typeof afterSalesInput>) {
  if (order.status === "canceled" || order.currency_code !== "usd") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This order cannot accept a return or exchange.");
  for (const line of input.items) {
    const source = order.items.find((value) => value.id === line.id);
    if (!source || line.quantity > returnableQuantity(source.detail)) throw new MedusaError(MedusaError.Types.CONFLICT, "Selected quantities are no longer available for return.");
  }
}

const date = z.coerce.date().transform((value) => value.toISOString());
export const afterSalesRow = z.object({
  id: z.string().uuid(), order_id: z.string(), customer_id: z.string(), member_id: z.string().uuid(),
  kind: z.enum(afterSalesKinds), reason: z.enum(afterSalesReasons), description: z.string(), items: z.array(item),
  status: z.enum(afterSalesStatuses), version: z.number().int().positive(), customer_message: z.string(), internal_note: z.string(),
  native_id: z.string().nullable(), return_carrier: z.string(), return_tracking_number: z.string(),
  created_at: date, updated_at: date, reviewed_by: z.string().nullable(), reviewed_at: date.nullable(),
  history: z.array(z.object({status:z.enum(afterSalesStatuses),message:z.string(),at:date})),
});
export type AfterSalesRow = z.infer<typeof afterSalesRow>;
export function customerAfterSales(row: AfterSalesRow) {
  const { customer_id: _customer, member_id: _member, internal_note: _internal, reviewed_by: _staff, native_id: _native, ...safe } = row;
  return safe;
}
export function assertCustomerUpdate(row: AfterSalesRow, command: z.infer<typeof afterSalesCustomerUpdate>) {
  const allowed = command.command === "cancel" ? row.status === "pending" : ["approved", "processing"].includes(row.status);
  if (!allowed || row.version !== command.version) throw new MedusaError(MedusaError.Types.CONFLICT, "This request changed; refresh before continuing.");
}
