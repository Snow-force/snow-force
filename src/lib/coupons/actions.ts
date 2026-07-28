"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { deleteCoupon, getCoupon, saveCoupon, type CouponDiscountType } from "./repository";

function optionalDate(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? new Date(text).toISOString() : null;
}

export async function createCouponAction(formData: FormData) {
  await requireAdmin();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const discountType = String(formData.get("discountType") ?? "") as CouponDiscountType;
  const discountValue = Number(formData.get("discountValue"));
  const maxRedemptionsText = String(formData.get("maxRedemptions") ?? "").trim();
  const startsAt = optionalDate(formData.get("startsAt"));
  const expiresAt = optionalDate(formData.get("expiresAt"));
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new Error("Coupon code must be 3–32 letters, numbers, hyphens, or underscores.");
  if (discountType !== "percent" && discountType !== "fixed") throw new Error("Invalid discount type.");
  if (!Number.isFinite(discountValue) || discountValue <= 0 || (discountType === "percent" && discountValue > 100)) throw new Error("Invalid discount value.");
  const maxRedemptions = maxRedemptionsText ? Number(maxRedemptionsText) : null;
  if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions <= 0)) throw new Error("Invalid redemption limit.");
  if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) throw new Error("Expiry must be after start time.");
  await saveCoupon({ code, discountType, discountValue, active: true, startsAt, expiresAt, maxRedemptions });
  revalidatePath("/admin/coupons");
}

export async function setCouponActiveAction(formData: FormData) {
  await requireAdmin();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const coupon = await getCoupon(code);
  if (!coupon) throw new Error("Coupon not found.");
  await saveCoupon({ ...coupon, active: !coupon.active });
  revalidatePath("/admin/coupons");
}

export async function deleteCouponAction(formData: FormData) {
  await requireAdmin();
  await deleteCoupon(String(formData.get("code") ?? "").trim().toUpperCase());
  revalidatePath("/admin/coupons");
}
