import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteCoupon: vi.fn(),
  getCoupon: vi.fn(),
  getEventAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  requireAdmin: vi.fn(),
  saveCoupon: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/events/repository", () => ({ getEventAdmin: mocks.getEventAdmin }));
vi.mock("./repository", () => ({
  deleteCoupon: mocks.deleteCoupon,
  getCoupon: mocks.getCoupon,
  saveCoupon: mocks.saveCoupon,
}));

import { createCouponAction, deleteCouponAction, setCouponActiveAction } from "./actions";

function couponForm(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

describe("coupon admin actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires staff access before creating a coupon", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("staff-required"));

    await expect(createCouponAction(couponForm({}))).rejects.toThrow("staff-required");
    expect(mocks.getEventAdmin).not.toHaveBeenCalled();
    expect(mocks.saveCoupon).not.toHaveBeenCalled();
  });

  it("normalizes and saves a valid event coupon", async () => {
    mocks.getEventAdmin.mockResolvedValue({ slug: "powder-day" });
    mocks.saveCoupon.mockResolvedValue({});

    await createCouponAction(couponForm({
      code: " snow-20 ",
      discountType: "percent",
      discountValue: "20",
      maxRedemptions: "25",
      eventSlug: "powder-day",
      startsAt: "2026-08-01T09:00:00.000Z",
      expiresAt: "2026-08-10T09:00:00.000Z",
    }));

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.saveCoupon).toHaveBeenCalledWith(expect.objectContaining({
      code: "SNOW-20",
      eventSlug: "powder-day",
      discountType: "percent",
      discountValue: 20,
      active: true,
      maxRedemptions: 25,
      startsAt: "2026-08-01T09:00:00.000Z",
      expiresAt: "2026-08-10T09:00:00.000Z",
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/coupons");
  });

  it("rejects invalid event and date ranges without saving", async () => {
    mocks.getEventAdmin.mockResolvedValue(undefined);

    await expect(createCouponAction(couponForm({
      code: "SNOW20",
      discountType: "percent",
      discountValue: "20",
      maxRedemptions: "5",
      eventSlug: "missing-event",
    }))).rejects.toThrow("Select a valid event.");

    mocks.getEventAdmin.mockResolvedValue({ slug: "powder-day" });
    await expect(createCouponAction(couponForm({
      code: "SNOW20",
      discountType: "fixed",
      discountValue: "20",
      maxRedemptions: "5",
      eventSlug: "powder-day",
      startsAt: "2026-08-10T09:00Z",
      expiresAt: "2026-08-01T09:00Z",
    }))).rejects.toThrow("Expiry must be after start time.");

    expect(mocks.saveCoupon).not.toHaveBeenCalled();
  });

  it("rejects usage limits that are not positive whole numbers", async () => {
    mocks.getEventAdmin.mockResolvedValue({ slug: "powder-day" });

    for (const maxRedemptions of ["0", "1.5", "100001"]) {
      await expect(createCouponAction(couponForm({
        code: "SNOW20",
        discountType: "percent",
        discountValue: "20",
        maxRedemptions,
        eventSlug: "powder-day",
      }))).rejects.toThrow("Usage limit must be a whole number from 1 to 100,000.");
    }

    expect(mocks.saveCoupon).not.toHaveBeenCalled();
  });

  it("toggles an existing coupon and deletes normalized codes", async () => {
    mocks.getCoupon.mockResolvedValue({
      code: "SNOW20", eventSlug: "powder-day", discountType: "percent", discountValue: 20,
      active: true, startsAt: null, expiresAt: null, maxRedemptions: 1, createdAt: "2026-01-01T00:00:00.000Z",
    });
    mocks.saveCoupon.mockResolvedValue({});

    await setCouponActiveAction(couponForm({ code: " snow20 " }));
    await deleteCouponAction(couponForm({ code: " snow20 " }));

    expect(mocks.saveCoupon).toHaveBeenCalledWith(expect.objectContaining({ code: "SNOW20", active: false }));
    expect(mocks.deleteCoupon).toHaveBeenCalledWith("SNOW20");
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  });
});
