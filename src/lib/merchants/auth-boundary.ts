/**
 * Merchant authentication boundary.
 *
 * This module enforces a hard separation between the merchant account flow
 * and the existing rider/member account flow. The two flows share the same
 * `auth.users` table but must not be conflated:
 *
 *   1. A merchant account is identified by the existence of a
 *      `merchant_profiles` row owned by the auth user. A merchant is never
 *      assumed to have a `member_profiles` row.
 *   2. Authorization decisions for merchant actions are derived exclusively
 *      from the `merchant_profiles` row (server-side) and the verified
 *      `auth.users.email_confirmed_at` flag. They MUST NOT use
 *      `auth.users.raw_user_meta_data` because that field is user-editable
 *      via the Supabase sign-up options and would let any merchant
 *      self-claim a role.
 *   3. Branded types make it a compile error to pass a merchant account
 *      payload into the member pipeline (or vice versa).
 *
 * The runtime helpers in this file are intentionally cheap and pure so they
 * can be invoked from server actions, server components, and tests without
 * pulling in the Supabase client.
 */

import type { User } from "@supabase/supabase-js";
import type { MerchantProfile } from "./types";

declare const merchantAuthSymbol: unique symbol;
declare const memberAuthSymbol: unique symbol;

export type MerchantBranded<T> = T & { readonly [merchantAuthSymbol]: true };
export type MemberBranded<T> = T & { readonly [memberAuthSymbol]: true };

/**
 * Runtime brand marker. Stored as a non-enumerable property so the branded
 * type is invisible to JSON serialization and structural iteration, but the
 * brand check `MERCHANT_AUTH_BRAND in value` works at runtime.
 */
const MERCHANT_AUTH_BRAND: unique symbol = Symbol.for(
  "@snowforce/merchants.auth-account-brand",
);

/**
 * Minimal shape of a Supabase auth user that the merchant flow needs.
 * Keeping this interface narrow (rather than depending on the full Supabase
 * `User`) prevents accidental leakage of irrelevant auth fields into the
 * merchant domain.
 */
export interface MerchantAuthUserFields {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
}

/**
 * Branded merchant account payload. Constructed only by
 * `createMerchantAuthAccount()` so the boundary is not bypassed.
 */
export type MerchantAuthAccount = MerchantBranded<{
  user: MerchantAuthUserFields;
  profile: MerchantProfile | null;
  emailConfirmed: boolean;
}>;

export function toMerchantAuthUserFields(user: User): MerchantAuthUserFields {
  return {
    id: user.id,
    email: user.email ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? null,
  };
}

export function createMerchantAuthAccount(input: {
  user: User;
  profile: MerchantProfile | null;
}): MerchantAuthAccount {
  const fields = toMerchantAuthUserFields(input.user);
  const account = {
    user: fields,
    profile: input.profile,
    emailConfirmed: Boolean(fields.emailConfirmedAt),
  } as MerchantAuthAccount;
  Object.defineProperty(account, MERCHANT_AUTH_BRAND, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return account;
}

/**
 * Type guard ensuring a value is a branded merchant account. Combines a
 * structural shape check with the runtime brand marker so a hand-rolled
 * object (even one with the right field names) cannot pass.
 */
export function isMerchantAuthAccount(value: unknown): value is MerchantAuthAccount {
  if (!value || typeof value !== "object") return false;
  if ((value as Record<symbol, unknown>)[MERCHANT_AUTH_BRAND] !== true) return false;
  const candidate = value as Record<string, unknown>;
  if (!candidate.user || typeof candidate.user !== "object") return false;
  const user = candidate.user as Record<string, unknown>;
  if (typeof user.id !== "string") return false;
  if (typeof user.emailConfirmedAt !== "string" && user.emailConfirmedAt !== null) return false;
  if (typeof candidate.emailConfirmed !== "boolean") return false;
  if (candidate.profile !== null && typeof candidate.profile !== "object") return false;
  return true;
}

/**
 * Runtime assertion. Use this in code paths that may receive an `unknown`
 * payload (e.g. JSON, request bodies, test fixtures). Throws when the
 * payload is not a properly branded merchant account.
 */
export function assertMerchantAuthBoundary(account: unknown): asserts account is MerchantAuthAccount {
  if (!isMerchantAuthAccount(account)) {
    throw new MerchantAuthBoundaryError("Merchant authorization boundary rejected an unknown payload.");
  }
}

export class MerchantAuthBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MerchantAuthBoundaryError";
  }
}

/**
 * Disallowed metadata keys for authorization. Any code that uses any of
 * these keys to decide whether a merchant can perform an action is a bug.
 * Tests assert this list stays empty for merchant authorization calls.
 */
export const merchantAuthzMetadataKeys = [
  "is_merchant",
  "merchant",
  "role",
  "roles",
  "vendor",
  "booth_owner",
] as const;

/**
 * Returns true when the metadata object is safe to consult for non-authorization
 * purposes only (e.g. display name hints, locale preference). It is NEVER safe
 * to consult `metadata` for merchant authorization. The runtime helper exists
 * so test code can document the boundary in a single place.
 */
export function hasUnsafeMerchantAuthMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const record = metadata as Record<string, unknown>;
  return merchantAuthzMetadataKeys.some((key) => key in record);
}
