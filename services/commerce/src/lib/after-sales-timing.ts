import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { verifyOrderPolicyAcceptance } from "./policy-consent";
import { publicShopPolicy } from "./shop-policy";

const instant = z.coerce.date().transform(value => value.toISOString());
const nativeDelivery = z.object({
  canceled_at: instant.nullable(), delivered_at: instant.nullable(),
  items: z.array(z.object({ line_item_id: z.string().nullable() })),
});
export const afterSalesTimingOrder = z.object({
  id: z.string(), customer_id: z.string(), created_at: instant,
  metadata: z.record(z.string(), z.unknown()).nullish(),
  fulfillments: z.array(nativeDelivery),
});
export type AfterSalesTimingOrder = z.infer<typeof afterSalesTimingOrder>;
export type ReturnWindow = {
  policyVersion: number | null; returnWindowDays: number | null; approvedDispatchDays: number | null;
  requestedOn: string; requiresException: boolean;
  lines: { id: string; status: "within_window" | "expired" | "manual"; earliestDeadline: string | null; latestDeadline: string | null }[];
};
type Connection = { raw(sql: string, values: string[]): Promise<{ rows: unknown[] }> };
const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
export function pacificCalendarDate(value: string) {
  const date = z.iso.datetime().parse(value);
  const parts = localDate.formatToParts(new Date(date));
  const part = (name: string) => parts.find(value => value.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function calendarDeadline(value: string, days: number) {
  z.number().int().min(1).max(365).parse(days);
  const date = new Date(`${pacificCalendarDate(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function assessReturnWindow(order: AfterSalesTimingOrder, items: { id: string }[], reason: string, at: string, terms: { version: number; return_window_days: number; approved_dispatch_days: number } | null): ReturnWindow {
  const requestedOn = pacificCalendarDate(at);
  const lines = items.map(({ id }) => {
    const relevant = order.fulfillments.filter(value => !value.canceled_at && value.items.some(line => line.line_item_id === id));
    const deliveries = relevant.flatMap(value => value.delivered_at ? [value.delivered_at] : []);
    if (!terms || !deliveries.length || deliveries.some(value => Date.parse(value) < Date.parse(order.created_at) || Date.parse(value) > Date.parse(at))) return { id, status: "manual" as const, earliestDeadline: null, latestDeadline: null };
    const deadlines = deliveries.map(value => calendarDeadline(value, terms.return_window_days)).sort();
    const earliestDeadline = deadlines[0], latestDeadline = deadlines[deadlines.length - 1];
    const status = requestedOn <= earliestDeadline ? "within_window" as const : requestedOn > latestDeadline ? "expired" as const : "manual" as const;
    return { id, status, earliestDeadline, latestDeadline };
  });
  // A quality/incorrect-item case is reviewed on its merits, never automatically rejected for age.
  const requiresException = !["quality", "incorrect"].includes(reason) && lines.some(line => line.status !== "within_window");
  return { policyVersion: terms?.version ?? null, returnWindowDays: terms?.return_window_days ?? null, approvedDispatchDays: terms?.approved_dispatch_days ?? null, requestedOn, requiresException, lines };
}
export async function verifiedOrderPurchasePolicy(scope: MedusaContainer, order: AfterSalesTimingOrder) {
  let receipt: ReturnType<typeof verifyOrderPolicyAcceptance> | undefined;
  if (order.metadata?.snowforce_policy_acceptance) {
    const db = scope.resolve<Connection>(ContainerRegistrationKeys.PG_CONNECTION);
    const links = z.array(z.object({ cart_id: z.string() })).parse((await db.raw("select cart_id from commerce.order_cart where order_id=? and deleted_at is null limit 2", [order.id])).rows);
    if (links.length === 1) {
      try { receipt = verifyOrderPolicyAcceptance(order, links[0].cart_id); }
      catch (error) { if (!(error instanceof z.ZodError) && !(error instanceof MedusaError)) throw error; }
    }
  }
  if (receipt) {
    // A newer publication cannot shorten the terms accepted for this purchase.
    const original = await publicShopPolicy(scope, receipt.accepted_at, receipt.policy.version);
    if (original && JSON.stringify(original) === JSON.stringify(receipt.policy)) return receipt.policy;
  }
  return null;
}
export async function afterSalesTiming(scope: MedusaContainer, order: AfterSalesTimingOrder, items: { id: string }[], reason: string, requestedAt: string) {
  const policy = await verifiedOrderPurchasePolicy(scope, order);
  const terms = policy ? { version: policy.version, ...policy.content.terms } : null;
  return assessReturnWindow(order, items, reason, requestedAt, terms);
}
export function assertReturnWindowReview(window: ReturnWindow, exception: boolean, note: string) {
  if (window.requiresException && (!exception || note.trim().length < 5)) throw new MedusaError(MedusaError.Types.CONFLICT, "Review the purchase policy and delivery dates; record an explicit policy exception before approving.");
  if (window.requiresException && note.length > 3950) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Keep the policy exception note within 3,950 characters.");
}
