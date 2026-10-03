import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, PaymentEvents, PaymentWebhookEvents } from "@medusajs/framework/utils";
import { z } from "zod";
import { refundWebhookIntent, saveRefundFundsCheck, verifyOrderRefundFunds, type RefundCheckAudit, type RefundConnection, type StripeRefundReader } from "../lib/refund-finality";

export default async function refundFinality({ event, container }: SubscriberArgs<unknown>, reader?: StripeRefundReader) {
  const db = container.resolve<RefundConnection>(ContainerRegistrationKeys.PG_CONNECTION);
  let sql: string, value: string, audit: RefundCheckAudit;
  if (event.name === PaymentWebhookEvents.WebhookReceived) {
    const refund = refundWebhookIntent(event.data);
    if (!refund) return;
    sql = "select distinct l.order_id from commerce.payment p join commerce.order_payment_collection l on l.payment_collection_id=p.payment_collection_id where p.data->>'id'=? and p.provider_id='pp_stripe_stripe' and p.deleted_at is null and l.deleted_at is null";
    value = refund.intent_id; audit = { source: "stripe_webhook", event_id: refund.event_id };
  } else {
    value = z.object({ id: z.string().min(1).max(120) }).parse(event.data).id;
    sql = "select distinct l.order_id from commerce.payment p join commerce.order_payment_collection l on l.payment_collection_id=p.payment_collection_id where p.id=? and p.provider_id='pp_stripe_stripe' and p.deleted_at is null and l.deleted_at is null";
    audit = { source: "native_payment", payment_id: value };
  }
  const ids = z.array(z.object({ order_id: z.string().regex(/^order_[A-Za-z0-9]+$/) })).max(1).parse((await db.raw(sql, [value])).rows);
  for (const { order_id } of ids) {
    // Read current Stripe state, so duplicate/out-of-order events cannot restore an old refund status.
    const check = await verifyOrderRefundFunds(container, order_id, reader);
    await db.transaction((transaction) => saveRefundFundsCheck(transaction, check, audit));
  }
}
export const config: SubscriberConfig = {
  event: [PaymentWebhookEvents.WebhookReceived, PaymentEvents.REFUNDED],
  context: { subscriberId: "snowforce-refund-finality" },
};
