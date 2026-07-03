import { createClient } from "@supabase/supabase-js";

import type { RegistrationAnswers } from "@/lib/types";
import { createJsonArrayStore, workspaceDataPath } from "../server/json-store";

export type PendingRegistration = {
  id: string;
  eventSlug: string;
  memberId: string | null;
  answers: RegistrationAnswers;
  consentGiven: boolean;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  waiverTextEn?: string | null;
  waiverTextSha?: string | null;
  typedName?: string | null;
};

export type NewPendingRegistration = Omit<PendingRegistration, "id" | "createdAt">;

export type PendingRegistrationSource = {
  createOrRefresh(data: NewPendingRegistration): Promise<PendingRegistration>;
  getByTokenHash(tokenHash: string): Promise<PendingRegistration | undefined>;
  listForMember(memberId: string, now?: Date): Promise<PendingRegistration[]>;
  hasForEmail(eventSlug: string, email: string, now?: Date): Promise<boolean>;
  hasForMember(eventSlug: string, memberId: string, now?: Date): Promise<boolean>;
  delete(id: string): Promise<void>;
};

type PendingRegistrationRow = {
  id: string;
  event_slug: string;
  member_id: string | null;
  answers: RegistrationAnswers;
  consent_given: boolean;
  contact_email: string;
  contact_name: string;
  contact_phone: string | null;
  token_hash: string;
  expires_at: string;
  created_at: string;
  waiver_text_en: string | null;
  waiver_text_sha: string | null;
  typed_name: string | null;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function throwSupabaseError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function isMissingPendingRegistrationsTableError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("pending_registrations") &&
      error.message.includes("schema cache"),
  );
}

function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is not configured.");
  return url;
}

function createAdminPendingRegistrationClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Supabase admin writes are not configured.");

  return createClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function rowToPendingRegistration(row: PendingRegistrationRow): PendingRegistration {
  return {
    id: row.id,
    eventSlug: row.event_slug,
    memberId: row.member_id,
    answers: row.answers,
    consentGiven: row.consent_given,
    contactEmail: row.contact_email,
    contactName: row.contact_name,
    contactPhone: row.contact_phone ?? "",
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    waiverTextEn: row.waiver_text_en ?? null,
    waiverTextSha: row.waiver_text_sha ?? null,
    typedName: row.typed_name ?? null,
  };
}

function pendingRegistrationToRow(data: NewPendingRegistration) {
  return {
    event_slug: data.eventSlug,
    member_id: data.memberId,
    answers: data.answers,
    consent_given: data.consentGiven,
    contact_email: data.contactEmail,
    contact_name: data.contactName,
    contact_phone: data.contactPhone,
    token_hash: data.tokenHash,
    expires_at: data.expiresAt,
    waiver_text_en: data.waiverTextEn ?? null,
    waiver_text_sha: data.waiverTextSha ?? null,
    typed_name: data.typedName ?? null,
  };
}

export function createPendingRegistrationStore(filePath: string): PendingRegistrationSource {
  const store = createJsonArrayStore<PendingRegistration>(filePath);

  return {
    async createOrRefresh(data) {
      const normalizedEmail = normalizeEmail(data.contactEmail);
      const rows = (await store.read()).filter(
        (row) =>
          row.eventSlug !== data.eventSlug ||
          (data.memberId
            ? row.memberId !== data.memberId
            : normalizeEmail(row.contactEmail) !== normalizedEmail),
      );
      const now = new Date().toISOString();
      const pending: PendingRegistration = {
        ...data,
        contactEmail: normalizedEmail,
        id: `pending_${Date.now()}_${crypto.randomUUID()}`,
        createdAt: now,
      };
      await store.write([...rows, pending]);
      return pending;
    },
    async getByTokenHash(tokenHash) {
      return (await store.read()).find((row) => row.tokenHash === tokenHash);
    },
    async listForMember(memberId, now = new Date()) {
      return (await store.read()).filter(
        (row) =>
          row.memberId === memberId &&
          Date.parse(row.expiresAt) > now.getTime(),
      );
    },
    async hasForEmail(eventSlug, email, now = new Date()) {
      const normalizedEmail = normalizeEmail(email);
      return (await store.read()).some(
        (row) =>
          row.eventSlug === eventSlug &&
          normalizeEmail(row.contactEmail) === normalizedEmail &&
          Date.parse(row.expiresAt) > now.getTime(),
      );
    },
    async hasForMember(eventSlug, memberId, now = new Date()) {
      return (await store.read()).some(
        (row) =>
          row.eventSlug === eventSlug &&
          row.memberId === memberId &&
          Date.parse(row.expiresAt) > now.getTime(),
      );
    },
    async delete(id) {
      await store.write((await store.read()).filter((row) => row.id !== id));
    },
  };
}

function createSupabasePendingRegistrationSource(): PendingRegistrationSource {
  return {
    async createOrRefresh(data) {
      const client = createAdminPendingRegistrationClient();
      const normalizedEmail = normalizeEmail(data.contactEmail);
      let deleteQuery = client
        .from("pending_registrations")
        .delete()
        .eq("event_slug", data.eventSlug);
      deleteQuery = data.memberId
        ? deleteQuery.eq("member_id", data.memberId)
        : deleteQuery.eq("contact_email", normalizedEmail);
      const { error: deleteError } = await deleteQuery;
      throwSupabaseError(deleteError);

      const { data: row, error } = await client
        .from("pending_registrations")
        .insert(pendingRegistrationToRow({ ...data, contactEmail: normalizedEmail }))
        .select("*")
        .single();
      throwSupabaseError(error);
      return rowToPendingRegistration(row as PendingRegistrationRow);
    },
    async getByTokenHash(tokenHash) {
      const { data, error } = await createAdminPendingRegistrationClient()
        .from("pending_registrations")
        .select("*")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      throwSupabaseError(error);
      return data ? rowToPendingRegistration(data as PendingRegistrationRow) : undefined;
    },
    async listForMember(memberId, now = new Date()) {
      const { data, error } = await createAdminPendingRegistrationClient()
        .from("pending_registrations")
        .select("*")
        .eq("member_id", memberId)
        .gt("expires_at", now.toISOString())
        .order("created_at", { ascending: true });
      if (isMissingPendingRegistrationsTableError(error)) return [];
      throwSupabaseError(error);
      return ((data ?? []) as PendingRegistrationRow[]).map(rowToPendingRegistration);
    },
    async hasForEmail(eventSlug, email, now = new Date()) {
      const { data, error } = await createAdminPendingRegistrationClient()
        .from("pending_registrations")
        .select("id")
        .eq("event_slug", eventSlug)
        .eq("contact_email", normalizeEmail(email))
        .gt("expires_at", now.toISOString())
        .limit(1);
      throwSupabaseError(error);
      return (data ?? []).length > 0;
    },
    async hasForMember(eventSlug, memberId, now = new Date()) {
      const { data, error } = await createAdminPendingRegistrationClient()
        .from("pending_registrations")
        .select("id")
        .eq("event_slug", eventSlug)
        .eq("member_id", memberId)
        .gt("expires_at", now.toISOString())
        .limit(1);
      throwSupabaseError(error);
      return (data ?? []).length > 0;
    },
    async delete(id) {
      const { error } = await createAdminPendingRegistrationClient()
        .from("pending_registrations")
        .delete()
        .eq("id", id);
      throwSupabaseError(error);
    },
  };
}

export function createPendingRegistrationRepository(source: PendingRegistrationSource) {
  return {
    createOrRefreshPendingRegistration: source.createOrRefresh,
    getPendingRegistrationByTokenHash: source.getByTokenHash,
    getPendingRegistrationsByMember: source.listForMember,
    hasPendingRegistrationForEmail: source.hasForEmail,
    hasPendingRegistrationForMember: source.hasForMember,
    deletePendingRegistration: source.delete,
  };
}

const pendingRegistrationStore = hasSupabaseConfig()
  ? createSupabasePendingRegistrationSource()
  : createPendingRegistrationStore(workspaceDataPath("pending-registrations.json"));
const repository = createPendingRegistrationRepository(pendingRegistrationStore);

export const createOrRefreshPendingRegistration = repository.createOrRefreshPendingRegistration;
export const getPendingRegistrationByTokenHash = repository.getPendingRegistrationByTokenHash;
export const getPendingRegistrationsByMember = repository.getPendingRegistrationsByMember;
export const hasPendingRegistrationForEmail = repository.hasPendingRegistrationForEmail;
export const hasPendingRegistrationForMember = repository.hasPendingRegistrationForMember;
export const deletePendingRegistration = repository.deletePendingRegistration;
