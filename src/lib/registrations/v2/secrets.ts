import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function randomToken() { return randomBytes(32).toString("hex"); }
export function waiverEncryptionKey() {
  const key = process.env.EVENT_WAIVER_ENCRYPTION_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error("Waiver delivery encryption is not configured");
  return Buffer.from(key, "hex");
}
export function encryptDelivery(payload: object) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", waiverEncryptionKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}
export function decryptDelivery(payload: string): unknown {
  const data = Buffer.from(payload, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", waiverEncryptionKey(), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString("utf8"));
}
