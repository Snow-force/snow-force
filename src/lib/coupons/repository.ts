import "server-only";

import { createClient } from "@supabase/supabase-js";

export type CouponDiscountType = "percent" | "fixed";

export type EventCoupon = {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  maxRedemptions: number | null;
  createdAt: string;
};

type CouponRow = {
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  max_redemptions: number | null;
  created_at: string;
};

export type CouponInput = Omit<EventCoupon, "createdAt">;

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin writes are not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function throwError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function fromRow(row: CouponRow): EventCoupon {
  return {
    code: row.code,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    active: row.active,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    maxRedemptions: row.max_redemptions,
    createdAt: row.created_at,
  };
}

export async function getCoupon(code: string): Promise<EventCoupon | undefined> {
  const { data, error } = await getClient()
    .from("event_coupon_codes")
    .select("code,discount_type,discount_value,active,starts_at,expires_at,max_redemptions,created_at")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  throwError(error);
  return data ? fromRow(data as CouponRow) : undefined;
}

export async function getCoupons(): Promise<EventCoupon[]> {
  const { data, error } = await getClient()
    .from("event_coupon_codes")
    .select("code,discount_type,discount_value,active,starts_at,expires_at,max_redemptions,created_at")
    .order("created_at", { ascending: false });
  throwError(error);
  return (data ?? []).map((row) => fromRow(row as CouponRow));
}

export async function saveCoupon(input: CouponInput): Promise<EventCoupon> {
  const { data, error } = await getClient()
    .from("event_coupon_codes")
    .upsert({
      code: input.code.trim().toUpperCase(),
      discount_type: input.discountType,
      discount_value: input.discountValue,
      active: input.active,
      starts_at: input.startsAt,
      expires_at: input.expiresAt,
      max_redemptions: input.maxRedemptions,
      updated_at: new Date().toISOString(),
    })
    .select("code,discount_type,discount_value,active,starts_at,expires_at,max_redemptions,created_at")
    .single();
  throwError(error);
  return fromRow(data as CouponRow);
}

export async function deleteCoupon(code: string) {
  const { error } = await getClient().from("event_coupon_codes").delete().eq("code", code);
  throwError(error);
}

export async function getCouponRedemptionCount(code: string) {
  const { count, error } = await getClient()
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("coupon_code", code)
    .neq("status", "cancelled");
  throwError(error);
  return count ?? 0;
}
