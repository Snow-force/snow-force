import { describe, expect, it } from "vitest";
import { buildAdminMerchantOperationsView } from "./admin-view";

const records = [
  {
    application: { id: "app-a", merchantProfileId: "merchant-a", eventSlug: "summit", boothProgramId: "program-a", requestedPlanId: "plan-a", businessName: "Summit Wax", contactName: "Avery", contactEmail: "avery@example.com", contactPhone: "", category: "Equipment", description: "", status: "approved" as const, quotedAmount: 250, quotedCurrency: "usd" as const, createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-02T00:00:00.000Z" },
    plan: null, allocation: null, booth: null, payment: null,
    availableBooths: [{ id: "booth-a", boothProgramId: "program-a", boothPlanId: "plan-a", boothCode: "A-01", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" }],
  },
  {
    application: { id: "app-b", merchantProfileId: "merchant-b", eventSlug: "valley", boothProgramId: "program-b", requestedPlanId: "plan-b", businessName: "Valley Snacks", contactName: "Bao", contactEmail: "bao@example.com", contactPhone: "", category: "Food", description: "", status: "paid" as const, quotedAmount: 180, quotedCurrency: "cny" as const, createdAt: "2026-07-03T00:00:00.000Z", updatedAt: "2026-07-04T00:00:00.000Z" },
    plan: null, allocation: null, booth: null, payment: null, availableBooths: [],
  },
];

describe("buildAdminMerchantOperationsView", () => {
  it("filters applications by event and state while retaining only matching booths", () => {
    const view = buildAdminMerchantOperationsView({ records, programs: [], requestedEventSlug: "summit", requestedStatus: "approved" });
    expect(view.records).toHaveLength(1);
    expect(view.records[0]?.application.id).toBe("app-a");
    expect(view.records[0]?.availableBooths.map((booth) => booth.boothCode)).toEqual(["A-01"]);
    expect(view.records[0]).not.toHaveProperty("finance");
  });

  it("does not expose another merchant's application when staff filter selects a different event", () => {
    const view = buildAdminMerchantOperationsView({ records, programs: [], requestedEventSlug: "valley" });
    expect(view.records.map((record) => record.application.businessName)).toEqual(["Valley Snacks"]);
    expect(view.records.map((record) => record.application.contactEmail)).not.toContain("avery@example.com");
  });
});
