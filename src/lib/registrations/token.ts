import { createHash, randomBytes } from "node:crypto";

export function createRegistrationVerificationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashRegistrationVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
