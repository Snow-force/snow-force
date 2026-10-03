import { createHmac } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows";
import { z } from "zod";
import { orderSnapshot, orderSnapshotFields } from "./order-snapshot";

type Connection = { raw: (query: string, values: string[]) => Promise<{ rows: unknown[] }> };
export async function orderMemberId(customerId: string | null, container: MedusaContainer): Promise<string | null> {
  if (!customerId) return null;
  const connection = container.resolve<Connection>(ContainerRegistrationKeys.PG_CONNECTION);
  // This read stays inside commerce. Identity comes from the Supabase provider's immutable entity_id, never email or customer-editable metadata.
  const result = await connection.raw("select p.entity_id from commerce.auth_identity a join commerce.provider_identity p on p.auth_identity_id=a.id where a.app_metadata->>'customer_id'=? and p.provider='supabase' and a.deleted_at is null and p.deleted_at is null", [customerId]);
  const rows = z.array(z.object({ entity_id: z.string().uuid() })).parse(result.rows);
  if (rows.length > 1) throw new Error("Ambiguous commerce identity");
  return rows[0]?.entity_id ?? null;
}
export async function readOrderSnapshot(orderId: string, container: MedusaContainer, customerId?: string) {
  if (!/^order_[A-Za-z0-9]+$/.test(orderId)) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.");
  const observedAt = new Date().toISOString();
  const { result } = await getOrderDetailWorkflow(container).run({ input: { order_id: orderId, fields: orderSnapshotFields, filters: { is_draft_order: false, ...(customerId ? { customer_id: customerId } : {}) } } });
  if (customerId && result.customer_id !== customerId) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.");
  const userId = await orderMemberId(result.customer_id ?? null, container);
  return userId ? { order: orderSnapshot(result, userId), observedAt } : null;
}
export async function publishOrderSnapshot(snapshot: NonNullable<Awaited<ReturnType<typeof readOrderSnapshot>>>) {
  const secret = process.env.COMMERCE_ORDER_SYNC_SECRET;
  const destination = new URL(process.env.SNOWFORCE_STOREFRONT_URL ?? "");
  const local = ["127.0.0.1", "localhost"].includes(destination.hostname);
  if (!secret || secret.length < 32 || destination.pathname !== "/" || destination.search || destination.hash || destination.username || destination.password || !(destination.protocol === "https:" || (process.env.NODE_ENV !== "production" && local && destination.protocol === "http:"))) throw new Error("Order synchronization is not configured.");
  const body = JSON.stringify(snapshot), timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const response = await fetch(`${destination.origin}/api/shop/order-sync`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", "x-snowforce-timestamp": timestamp, "x-snowforce-signature": signature }, body });
  if (!response.ok) throw new Error("Order synchronization needs a retry.");
}
