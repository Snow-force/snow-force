import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, PaymentEvents } from "@medusajs/framework/utils";
import type { TaxQuoteConnection } from "../lib/tax-quote-ledger";
import { eventOrderIds } from "./member-order-sync";
import { enqueueCapturedTaxSale } from "../lib/tax-sale-worker";

export default async function taxSaleCapture({ event, container }: SubscriberArgs<{ id?: string; order_id?: string }>) {
  const ids = await eventOrderIds(event, container.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION));
  // The scheduled discovery also recovers captures whose event preceded order creation.
  for (const id of ids) await enqueueCapturedTaxSale(container, id);
}
export const config: SubscriberConfig = { event: [PaymentEvents.CAPTURED], context: { subscriberId: "snowforce-tax-sales" } };
