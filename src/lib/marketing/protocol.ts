import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export function signMarketing(payload: unknown, secret: string, now = Date.now()) {
  if (secret.length < 32) throw new Error("Marketing service is not configured.");
  const timestamp = Math.floor(now / 1000), nonce = randomUUID(), body = JSON.stringify(payload);
  return { timestamp, nonce, body, signature: createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex") };
}
export function verifyMarketing(value: unknown, secret: string, now = Date.now()): { nonce: string; payload: unknown } {
  if (!value || typeof value !== "object" || secret.length < 32) throw new Error("Invalid service request.");
  const entry = value as Record<string, unknown>;
  if (typeof entry.timestamp !== "number" || !Number.isInteger(entry.timestamp) || Math.abs(now / 1000 - entry.timestamp) > 300 || typeof entry.nonce !== "string" || !/^[0-9a-f-]{36}$/i.test(entry.nonce) || typeof entry.body !== "string" || entry.body.length > 2_000_000 || typeof entry.signature !== "string" || !/^[0-9a-f]{64}$/.test(entry.signature)) throw new Error("Invalid service request.");
  const expected = createHmac("sha256", secret).update(`${entry.timestamp}.${entry.nonce}.${entry.body}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(entry.signature, "hex"))) throw new Error("Invalid service request.");
  return { nonce: entry.nonce, payload: JSON.parse(entry.body) as unknown };
}
export function marketingOrigin(value: string, production = process.env.NODE_ENV === "production") {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || !(url.protocol === "https:" || (!production && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("Invalid marketing service origin.");
  return url.origin;
}
