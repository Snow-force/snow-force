import { createHmac, timingSafeEqual } from "node:crypto";

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminSessionToken(secret: string, now = new Date()) {
  const expiresAt = now.getTime() + ADMIN_SESSION_TTL_MS;
  const payload = `admin:${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAdminSessionToken(
  token: string | undefined,
  secret: string,
  now = new Date(),
) {
  if (!token || !secret) return false;
  const separator = token.lastIndexOf(".");
  if (separator === -1) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const [, expiresAt] = payload.split(":");
  const expected = sign(payload, secret);

  if (!expiresAt || Number(expiresAt) <= now.getTime()) return false;
  if (signature.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
