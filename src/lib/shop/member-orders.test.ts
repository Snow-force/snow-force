import { describe, expect, it } from "vitest";
import { previewOrderRows } from "@/lib/members/member-center-preview";
import { formatOrderDate, formatOrderMoney, normalizeShopOrder, orderStatusesForFilter, parseOrderFilter, safeTrackingUrl } from "./member-orders";

describe("member order snapshots", () => {
  it("preserves calendar event dates while showing order instants in Pacific time", () => {
    expect(formatOrderDate("2026-09-30", "en")).toBe("Sep 30, 2026");
    expect(formatOrderDate("2026-09-30T00:00:00Z", "en")).toBe("Sep 29, 2026");
  });
  it("preserves the order price, selected variant and owner rather than looking up current catalog prices", () => {
    const order = normalizeShopOrder(previewOrderRows[0]);
    expect(order.userId).toBe(previewOrderRows[0].user_id);
    expect(order.totalCents).toBe(11404);
    expect(order.items[0].variant.zh).toBe("晨曦粉 / M");
    expect(formatOrderMoney(order.totalCents)).toBe("$114.04");
  });
  it("rejects another currency, negative amounts and inconsistent totals", () => {
    for (const change of [{ currency: "cny" }, { total_cents: -1 }, { total_cents: 11405 }]) {
      expect(() => normalizeShopOrder({ ...previewOrderRows[0], ...change })).toThrow();
    }
  });
  it("rejects inconsistent or duplicate line items", () => {
    expect(() => normalizeShopOrder({ ...previewOrderRows[0], items: [{ ...previewOrderRows[0].items[0], totalCents: 1 }] })).toThrow();
    expect(() => normalizeShopOrder({ ...previewOrderRows[0], items: [previewOrderRows[0].items[0], previewOrderRows[0].items[0]] })).toThrow();
  });
  it("does not turn a label-created package into a shipped one", () => {
    const shipment = { ...previewOrderRows[0].shipments[0], status: "preparing", shippedAt: null };
    const order = normalizeShopOrder({ ...previewOrderRows[0], status: "processing", shipments: [shipment] });
    expect(order.status).toBe("processing");
    expect(order.shipments[0].status).toBe("preparing");
    expect(order.shipments[0].shippedAt).toBeNull();
  });
  it.each(["javascript:alert(1)", "data:text/html,unsafe", "http://carrier.example/track", "https://secret@carrier.example/track", "//carrier.example/track"])("rejects unsafe tracking links %s", (value) => {
    expect(safeTrackingUrl(value)).toBeNull();
  });
  it("accepts HTTPS carrier links but strips unsafe image sources", () => {
    expect(safeTrackingUrl("https://www.ups.com/track")).toBe("https://www.ups.com/track");
    const row = { ...previewOrderRows[0], items: [{ ...previewOrderRows[0].items[0], image: "javascript:alert(1)" }] };
    expect(normalizeShopOrder(row).items[0].image).toBe("");
  });
  it("uses explicit status filters and treats unknown values as all", () => {
    expect(parseOrderFilter("anything")).toBe("all");
    expect(parseOrderFilter("shipped")).toBe("shipped");
    expect(orderStatusesForFilter("after-sales")).toEqual(["cancelled", "refunded"]);
  });
});
