/**
 * Merchant profile persistence.
 *
 * Provides server-side CRUD against `public.merchant_profiles`. The Supabase
 * implementation is the production source; a JSON-fallback source is
 * available for tests and local development. This module never writes to
 * `public.member_profiles`, never reads `auth.users.raw_user_meta_data`, and
 * never exposes a Supabase service-role client.
 *
 * All callers MUST go through the public exports so the merchant account
 * boundary is enforced in one place.
 */

import { createClient } from "@/lib/supabase/server";
import {
  createJsonArrayStore,
  workspaceDataPath,
} from "@/lib/server/json-store";
import type { MerchantProfile, MerchantProfileRow } from "./types";

export type NewMerchantProfile = Omit<MerchantProfile, "id" | "createdAt" | "updatedAt">;
export type MerchantProfilePatch = Partial<
  Omit<NewMerchantProfile, "userId">
>;

type WritableMerchantProfileUpdate = {
  -readonly [K in keyof MerchantProfileRow]: MerchantProfileRow[K];
};

export class MerchantProfileError extends Error {
  readonly code: "duplicate" | "missing" | "forbidden";

  constructor(code: "duplicate" | "missing" | "forbidden", message: string) {
    super(message);
    this.name = "MerchantProfileError";
    this.code = code;
  }
}

export type MerchantProfileSource = {
  findByUserId(userId: string): Promise<MerchantProfileRow | undefined>;
  create(row: Omit<MerchantProfileRow, "id" | "created_at" | "updated_at">): Promise<MerchantProfileRow>;
  update(
    userId: string,
    patch: Partial<Omit<MerchantProfileRow, "id" | "user_id" | "created_at" | "updated_at">>,
  ): Promise<MerchantProfileRow | undefined>;
};

const merchantProfileColumns = [
  "id",
  "user_id",
  "business_name",
  "contact_name",
  "contact_email",
  "contact_phone",
  "category",
  "description",
  "created_at",
  "updated_at",
].join(",");

function throwSupabaseError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function mapRowToProfile(row: MerchantProfileRow): MerchantProfile {
  return {
    id: row.id,
    userId: row.user_id,
    businessName: row.business_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    category: row.category,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingMerchantProfileTableError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("merchant_profiles") &&
      error.message.includes("schema cache"),
  );
}

function createSupabaseMerchantProfileSource(): MerchantProfileSource {
  return {
    async findByUserId(userId) {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("merchant_profiles")
        .select(merchantProfileColumns)
        .eq("user_id", userId)
        .maybeSingle<MerchantProfileRow>();
      if (isMissingMerchantProfileTableError(error)) return undefined;
      throwSupabaseError(error);
      return data ?? undefined;
    },
    async create(row) {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("merchant_profiles")
        .insert(row)
        .select(merchantProfileColumns)
        .single<MerchantProfileRow>();
      if (isMissingMerchantProfileTableError(error)) {
        throw new MerchantProfileError(
          "missing",
          "merchant_profiles table is unavailable; cannot create profile.",
        );
      }
      if (error?.code === "23505") {
        throw new MerchantProfileError(
          "duplicate",
          "A merchant profile already exists for this user.",
        );
      }
      throwSupabaseError(error);
      if (!data) {
        throw new MerchantProfileError(
          "missing",
          "Merchant profile insert returned no row.",
        );
      }
      return data;
    },
    async update(userId, patch) {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("merchant_profiles")
        .update(patch)
        .eq("user_id", userId)
        .select(merchantProfileColumns)
        .maybeSingle<MerchantProfileRow>();
      if (isMissingMerchantProfileTableError(error)) return undefined;
      throwSupabaseError(error);
      return data ?? undefined;
    },
  };
}

function createJsonMerchantProfileSource(): MerchantProfileSource {
  const store = createJsonArrayStore<MerchantProfileRow>(
    workspaceDataPath("merchant-profiles.json"),
  );
  let sequence = 0;
  return {
    async findByUserId(userId) {
      const rows = await store.read();
      return rows.find((row) => row.user_id === userId);
    },
    async create(row) {
      const rows = await store.read();
      if (rows.some((existing) => existing.user_id === row.user_id)) {
        throw new MerchantProfileError(
          "duplicate",
          "A merchant profile already exists for this user.",
        );
      }
      sequence += 1;
      const now = new Date().toISOString();
      const next: MerchantProfileRow = {
        ...row,
        id: `merchant-profile-${sequence}`,
        created_at: now,
        updated_at: now,
      };
      await store.write([...rows, next]);
      return next;
    },
    async update(userId, patch) {
      const rows = await store.read();
      const index = rows.findIndex((row) => row.user_id === userId);
      if (index === -1) return undefined;
      const current = rows[index]!;
      const updated: MerchantProfileRow = {
        ...current,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      const next = [...rows];
      next[index] = updated;
      await store.write(next);
      return updated;
    },
  };
}

function hasSupabaseConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

let activeSourceOverride: MerchantProfileSource | undefined;

function activeSource(): MerchantProfileSource {
  if (activeSourceOverride) return activeSourceOverride;
  return hasSupabaseConfig()
    ? createSupabaseMerchantProfileSource()
    : createJsonMerchantProfileSource();
}

/**
 * Test seam: lets a test swap the persistence source to a JSON-fallback store
 * (or any custom source) for deterministic behaviour without needing
 * Supabase. Always reset between tests.
 */
export function __setMerchantProfileSourceForTests(
  next: MerchantProfileSource | null,
): void {
  activeSourceOverride = next ?? undefined;
}

export async function getMerchantProfileByUserId(
  userId: string,
): Promise<MerchantProfile | null> {
  const row = await activeSource().findByUserId(userId);
  return row ? mapRowToProfile(row) : null;
}

export async function createMerchantProfile(
  input: NewMerchantProfile,
): Promise<MerchantProfile> {
  const row = await activeSource().create({
    user_id: input.userId,
    business_name: input.businessName,
    contact_name: input.contactName,
    contact_email: input.contactEmail,
    contact_phone: input.contactPhone,
    category: input.category,
    description: input.description,
  });
  return mapRowToProfile(row);
}

export async function updateMerchantProfile(
  userId: string,
  patch: MerchantProfilePatch,
): Promise<MerchantProfile | null> {
  const update: Partial<WritableMerchantProfileUpdate> = {};
  if (patch.businessName !== undefined) update.business_name = patch.businessName;
  if (patch.contactName !== undefined) update.contact_name = patch.contactName;
  if (patch.contactEmail !== undefined) update.contact_email = patch.contactEmail;
  if (patch.contactPhone !== undefined) update.contact_phone = patch.contactPhone;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.description !== undefined) update.description = patch.description;
  const row = await activeSource().update(userId, update);
  return row ? mapRowToProfile(row) : null;
}
