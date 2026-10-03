import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, FulfillmentWorkflowEvents, OrderWorkflowEvents, PaymentEvents } from "@medusajs/framework/utils";
import { z } from "zod";
import { publishOrderSnapshot, readOrderSnapshot } from "../lib/order-sync";

type Connection = { raw: (query: string, values: string[]) => Promise<{ rows: unknown[] }> };
export async function eventOrderIds(event: { name: string; data: { id?: string; order_id?: string } }, connection: Connection): Promise<string[]> {
  const id = z.string().min(1).max(120).parse(event.data.order_id ?? event.data.id);
  let orderIds: string[];
  if (event.name.startsWith("order.")) orderIds = [id];
  else {
    const fulfillmentEvent = [FulfillmentWorkflowEvents.SHIPMENT_CREATED, FulfillmentWorkflowEvents.DELIVERY_CREATED].some((name) => name === event.name);
    const sql = fulfillmentEvent
      ? "select order_id from commerce.order_fulfillment where fulfillment_id=? and deleted_at is null"
      : "select o.order_id from commerce.order_payment_collection o join commerce.payment p on p.payment_collection_id=o.payment_collection_id where p.id=? and o.deleted_at is null and p.deleted_at is null";
    const result = await connection.raw(sql, [id]);
    orderIds = z.array(z.object({ order_id: z.string().regex(/^order_[A-Za-z0-9]+$/) })).parse(result.rows).map((row) => row.order_id);
  }
  return [...new Set(orderIds.map((orderId) => z.string().regex(/^order_[A-Za-z0-9]{1,114}$/).parse(orderId)))];
}
export default async function memberOrderSync({ event, container }: SubscriberArgs<{ id?: string; order_id?: string }>) {
  const orderIds = await eventOrderIds(event, container.resolve<Connection>(ContainerRegistrationKeys.PG_CONNECTION));
  for (const orderId of orderIds) { const snapshot = await readOrderSnapshot(orderId, container); if (snapshot) await publishOrderSnapshot(snapshot); }
}
export const config: SubscriberConfig = { event: [
  OrderWorkflowEvents.PLACED, OrderWorkflowEvents.UPDATED, OrderWorkflowEvents.CANCELED,
  OrderWorkflowEvents.FULFILLMENT_CREATED, OrderWorkflowEvents.FULFILLMENT_CANCELED,
  OrderWorkflowEvents.RETURN_REQUESTED, OrderWorkflowEvents.RETURN_RECEIVED, OrderWorkflowEvents.EXCHANGE_CREATED,
  PaymentEvents.CAPTURED, PaymentEvents.REFUNDED,
  FulfillmentWorkflowEvents.SHIPMENT_CREATED, FulfillmentWorkflowEvents.DELIVERY_CREATED,
] };
