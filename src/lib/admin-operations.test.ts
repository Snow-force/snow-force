import { describe, expect, it } from "vitest";
import { buildAdminOperations, buildShiftBrief } from "./admin-operations";
import { defaultRegistrationFinance } from "./registrations/finance";
import type { CancellationRequest } from "./registrations/cancellation-types";
import { seedEvents } from "./events/seed";
import type { EventRecap, Registration } from "./types";
import { adminCopy } from "@/components/admin/admin-copy";

const event = { ...seedEvents[0], slug: "winter-trip", status: "published" as const, paymentModel: "deposit" as const };
const registration = (id: string, changes: Partial<Registration> = {}): Registration => ({
  id, eventSlug: event.slug, memberId: null, answers: {}, consentGiven: true,
  contactEmail: `${id}+guest@example.com`, contactName: `Rider ${id}`, contactPhone: "private-phone",
  status: "confirmed", attendanceStatus: "unmarked", attendanceSource: null, attendanceMarkedAt: null,
  createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", ...changes,
});
const cancellation = (registrationId: string, status: CancellationRequest["status"] = "pending"): CancellationRequest => ({
  id: `cancel-${registrationId}`, registration_id: registrationId, requested_by: null, reason: "private reason", status,
  decision_note: "", reviewed_by: null, reviewed_at: null, refund_amount: 0, refund_operation_id: null,
  created_at: "2026-11-02T00:00:00Z", updated_at: "2026-11-02T00:00:00Z",
});
const recap: EventRecap = { slug: "trip-recap", status: "draft", title: { en: "Trip recap", zh: "活动回顾" }, summary: { en: "", zh: "" }, content: { en: "", zh: "" }, date: "2026-11-01", location: { en: "", zh: "" }, coverImage: "", media: [], tags: { en: [], zh: [] }, seoTitle: { en: "", zh: "" }, seoDescription: { en: "", zh: "" } };
const build = (registrations: Registration[], cancellations: CancellationRequest[] = []) => buildAdminOperations({ events: [event], registrations, cancellations, recaps: [] });

describe("admin operations queue", () => {
  it("prioritizes decisions before drafts and exposes one next decision per attendee", () => {
    const operations = buildAdminOperations({
      events: [event, { ...event, slug: "draft", status: "draft" }], recaps: [recap],
      registrations: [
        registration("deposit", { finance: { ...defaultRegistrationFinance, depositAmount: 40 } }),
        registration("balance", { finance: { ...defaultRegistrationFinance, settlementStatus: "pending_balance" } }),
        registration("approve", { approvalStatus: "pending" }),
        registration("refund", { status: "cancelled", finance: { ...defaultRegistrationFinance, settlementStatus: "pending_refund" } }),
        registration("cancel", { approvalStatus: "pending", finance: { ...defaultRegistrationFinance, settlementStatus: "pending_refund" } }),
      ], cancellations: [cancellation("cancel")],
    });
    expect(operations.map((operation) => operation.kind)).toEqual(["cancellation", "refund", "approval", "balance", "deposit", "event", "recap"]);
    expect(operations[0].group).toBe("people");
    expect(operations[1].group).toBe("payments");
    expect(operations[5].priority).toBe("prepare");
  });

  it("does not invent payment debt for free, waived, paid, absent-finance, or waitlisted records", () => {
    expect(build([
      registration("no-finance"), registration("zero", { finance: defaultRegistrationFinance }),
      registration("paid", { finance: { ...defaultRegistrationFinance, depositAmount: 40, depositStatus: "paid" } }),
      registration("waived", { finance: { ...defaultRegistrationFinance, depositAmount: 40, depositStatus: "waived" } }),
      registration("cancelled", { status: "cancelled", approvalStatus: "pending" }),
      registration("waitlist", { status: "waitlist", finance: { ...defaultRegistrationFinance, depositAmount: 40 } }),
    ])).toEqual([]);
    expect(buildAdminOperations({ events: [{ ...event, paymentModel: "free" }], registrations: [registration("free", { finance: { ...defaultRegistrationFinance, depositAmount: 40 } })], recaps: [], cancellations: [] })).toEqual([]);
  });

  it("keeps financial review when events are unavailable and ignores resolved cancellations", () => {
    expect(build([registration("resolved")], [cancellation("resolved", "approved")])).toEqual([]);
    const operations = buildAdminOperations({ events: [], recaps: [], cancellations: [], registrations: [registration("balance", { finance: { ...defaultRegistrationFinance, settlementStatus: "pending_balance" } })] });
    expect(operations[0].context.en).toBe(event.slug);
    const link = new URL(operations[0].href, "https://example.test");
    expect(link.searchParams.get("event")).toBe(event.slug);
    expect(link.searchParams.get("q")).toBe("balance+guest@example.com");
  });

  it("orders equally urgent work oldest first and excludes published content", () => {
    const operations = build([registration("newer", { approvalStatus: "pending", updatedAt: "2026-11-05" }), registration("older", { approvalStatus: "pending" })]);
    expect(operations.map((operation) => operation.id)).toEqual(["registration:older", "registration:newer"]);
    expect(buildAdminOperations({ events: [event, { ...event, status: "archived" }], recaps: [{ ...recap, status: "published" }], registrations: [], cancellations: [] })).toEqual([]);
  });

  it("creates bilingual aggregate handoffs without attendee details and flags partial data", () => {
    const operations = build([registration("sensitive", { approvalStatus: "pending" })]);
    for (const lang of ["en", "zh"] as const) {
      const labels = Object.fromEntries(Object.entries(adminCopy.operations.kinds).map(([key, value]) => [key, value[lang]])) as Record<typeof operations[number]["kind"], string>;
      const text = buildShiftBrief(operations, labels, lang, true);
      expect(text).toContain(`${labels.approval}: 1`);
      expect(text).toContain(lang === "en" ? "Incomplete data" : "数据不完整");
      expect(text).not.toContain("sensitive");
      expect(text).not.toContain("private-phone");
      expect(buildShiftBrief([], labels, lang, false)).toContain(lang === "en" ? "No queued work" : "暂无待办");
    }
  });
});
