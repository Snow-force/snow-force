import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { CommerceAuthorizationError } from "./commerce-client";
import type { getCommerceCustomerSession } from "./commerce-auth";
import { orderSyncSnapshotSchema, type OrderSyncSnapshot } from "./order-sync-contract";

export async function saveOrderSnapshot(input: unknown): Promise<void> {
  const snapshot = orderSyncSnapshotSchema.parse(input);
  const { error } = await createAdminClient().rpc("shop_sync_member_order", {
    member_id: snapshot.order.user_id, snapshot: snapshot.order, observed_at: snapshot.observedAt,
  });
  if (error) throw new Error("Order synchronization unavailable");
}

export async function syncOwnedMemberOrder(customer: Pick<Awaited<ReturnType<typeof getCommerceCustomerSession>>, "request" | "token" | "userId">, orderId: string): Promise<void> {
  if (!/^order_[A-Za-z0-9]{1,114}$/.test(orderId)) throw new CommerceAuthorizationError();
  const snapshot: OrderSyncSnapshot = await customer.request(`/store/snowforce/orders/${orderId}`, orderSyncSnapshotSchema, { token: customer.token });
  if (snapshot.order.user_id !== customer.userId || snapshot.order.id !== orderId) throw new CommerceAuthorizationError();
  await saveOrderSnapshot(snapshot);
}
