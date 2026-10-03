import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { commerceId } from "./storefront";

export const CART_COOKIE_NAME = "snowforce_shop_cart";
export const CART_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
const payloadSchema = z.object({ version: z.literal(1), userId: z.string().uuid(), cartId: commerceId("cart"), expiresAt: z.number().int().positive() }).strict();
function signature(payload: string, secret: string) {
  if (!/^[a-f0-9]{64,}$/i.test(secret)) throw new Error("Shop cart cookie configuration is unavailable.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
export function signCartCookie(cartId: string, userId: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify(payloadSchema.parse({ version: 1, cartId, userId, expiresAt: now + CART_COOKIE_MAX_AGE * 1000 }))).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}
export function readCartCookie(value: string | undefined, userId: string, secret: string, now = Date.now()): string | null {
  if (!value || value.length > 600) return null;
  const parts = value.split(".");
  if (parts.length !== 2 || !/^[a-zA-Z0-9_-]+$/.test(parts[0]) || !/^[a-zA-Z0-9_-]{43}$/.test(parts[1])) return null;
  const expected = Buffer.from(signature(parts[0], secret));
  const received = Buffer.from(parts[1]);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = payloadSchema.parse(JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")));
    return payload.userId === userId && payload.expiresAt > now && payload.expiresAt <= now + CART_COOKIE_MAX_AGE * 1000 ? payload.cartId : null;
  } catch { return null; }
}
