import type { Bilingual, Event, EventRecap, Registration } from "@/lib/types";
import type { CancellationRequest } from "@/lib/registrations/cancellation-types";

export type OperationKind = "cancellation" | "refund" | "approval" | "balance" | "deposit" | "event" | "recap";
export type OperationGroup = "people" | "payments" | "publishing";
export type Operation = {
  id: string;
  kind: OperationKind;
  group: OperationGroup;
  priority: "review" | "prepare";
  title: Bilingual;
  context: Bilingual;
  href: string;
  date: string;
};

export function buildAdminOperations({ events, registrations, recaps, cancellations }: {
  events: Event[];
  registrations: Registration[];
  recaps: EventRecap[];
  cancellations: CancellationRequest[];
}): Operation[] {
  const eventMap = new Map(events.map((event) => [event.slug, event]));
  const pending = new Map(cancellations.filter((request) => request.status === "pending").map((request) => [request.registration_id, request]));
  const operations: Operation[] = [];

  for (const registration of registrations) {
    const event = eventMap.get(registration.eventSlug);
    const finance = registration.finance;
    const cancellation = pending.get(registration.id);
    // Show the next decision per attendee; money review still applies after cancellation.
    const kind: OperationKind | undefined = cancellation ? "cancellation"
      : finance?.settlementStatus === "pending_refund" ? "refund"
      : registration.status === "cancelled" ? undefined
      : registration.approvalStatus === "pending" ? "approval"
      : finance?.settlementStatus === "pending_balance" ? "balance"
      : registration.status === "confirmed" && event?.paymentModel !== "free" && event && finance?.depositStatus === "pending" && (finance.depositAmount ?? 0) > 0 ? "deposit"
      : undefined;
    if (!kind) continue;
    const query = new URLSearchParams({ event: registration.eventSlug, q: registration.contactEmail || registration.contactName });
    operations.push({
      id: `registration:${registration.id}`,
      kind,
      group: kind === "cancellation" || kind === "approval" ? "people" : "payments",
      priority: "review",
      title: { en: registration.contactName, zh: registration.contactName },
      context: event?.title ?? { en: registration.eventSlug, zh: registration.eventSlug },
      href: `/admin/registrations?${query}`,
      date: cancellation?.created_at ?? registration.updatedAt,
    });
  }

  for (const event of events.filter((event) => event.status === "draft")) {
    operations.push({ id: `event:${event.slug}`, kind: "event", group: "publishing", priority: "prepare", title: event.title,
      context: { en: event.eventDate, zh: event.eventDate }, href: `/admin/events/${encodeURIComponent(event.slug)}/edit`, date: event.eventDate });
  }
  for (const recap of recaps.filter((recap) => recap.status === "draft")) {
    operations.push({ id: `recap:${recap.slug}`, kind: "recap", group: "publishing", priority: "prepare", title: recap.title,
      context: { en: recap.date, zh: recap.date }, href: `/admin/recaps/${encodeURIComponent(recap.slug)}/edit`, date: recap.date });
  }
  const rank: Record<OperationKind, number> = { cancellation: 0, refund: 1, approval: 2, balance: 3, deposit: 4, event: 5, recap: 6 };
  return operations.sort((a, b) => rank[a.kind] - rank[b.kind] || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function buildShiftBrief(operations: Operation[], labels: Record<OperationKind, string>, lang: "en" | "zh", incomplete: boolean) {
  const counts = new Map<OperationKind, number>();
  for (const operation of operations) counts.set(operation.kind, (counts.get(operation.kind) ?? 0) + 1);
  return [
    lang === "en" ? "SnowForce / Shift brief" : "SnowForce / 交班简报",
    ...(incomplete ? [lang === "en" ? "Incomplete data — reload the operations desk before making decisions." : "数据不完整，请刷新工作台后再做决定。"] : []),
    ...Array.from(counts, ([kind, count]) => `${labels[kind]}: ${count}`),
    ...(counts.size === 0 ? [lang === "en" ? "No queued work in loaded data." : "已加载数据中暂无待办。"] : []),
    lang === "en" ? "Review current records at /admin. This is a snapshot; no actions have been taken." : "请在 /admin 核对最新记录。本简报仅为快照，尚未执行任何操作。",
  ].join("\n");
}
