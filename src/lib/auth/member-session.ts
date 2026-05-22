import { createHmac, timingSafeEqual } from "node:crypto";

const MEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createMemberSessionToken(userId: string, secret: string, now = new Date()) {
  const payload = `${encodeURIComponent(userId)}:${now.getTime() + MEMBER_SESSION_TTL_MS}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function readMemberSessionToken(
  token: string | undefined,
  secret: string,
  now = new Date(),
) {
  if (!token || !secret) return null;
  const separator = token.lastIndexOf(".");
  if (separator === -1) return null;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const [encodedUserId, expiresAt] = payload.split(":");
  const expected = sign(payload, secret);

  if (!encodedUserId || !expiresAt || Number(expiresAt) <= now.getTime()) return null;
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  return decodeURIComponent(encodedUserId);
}
