import { createClient } from "@supabase/supabase-js";
import type { CheckoutAttempt } from "@/lib/payments/checkout-attempt";

import type { RegistrationAnswers } from "@/lib/types";
import { createJsonArrayStore, workspaceDataPath } from "../server/json-store";

export type PendingRegistration = {
  id: string;
  eventSlug: string;
  memberId: string | null;
  registrationKind?: "self" | "proxy";
  preferredLanguage?: "en" | "zh";
  participantKey?: string;
  attendeeEmail?: string | null;
  holdExpiresAt?: string;
  fulfillmentState?: "pending" | "paid_requires_review";
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
  handwrittenSignatureDataUrl?: string | null;
  couponCode?: string | null;
  checkoutAttempt?: CheckoutAttempt | null;
  fulfilledRegistrationId?: string | null;
};

export type NewPendingRegistration = Omit<PendingRegistration, "id" | "createdAt" | "checkoutAttempt" | "fulfilledRegistrationId">;

export type PendingRegistrationSource = {
  createOrRefresh(data: NewPendingRegistration): Promise<PendingRegistration>;
  getById(id: string): Promise<PendingRegistration | undefined>;
  getByTokenHash(tokenHash: string): Promise<PendingRegistration | undefined>;
  listForMember(memberId: string, now?: Date): Promise<PendingRegistration[]>;
  hasForEmail(eventSlug: string, email: string, now?: Date): Promise<boolean>;
  hasForMember(eventSlug: string, memberId: string, now?: Date): Promise<boolean>;
  delete(id: string): Promise<void>;
  compareCheckout(id: string, tokenHash: string, expectedAttemptId: string | null, attempt: CheckoutAttempt | null): Promise<PendingRegistration | undefined>;
  complete(id: string, registrationId: string): Promise<void>;
};

type PendingRegistrationRow = {
  id: string;
  event_slug: string;
  member_id: string | null;
  registration_kind?: "self" | "proxy";
  preferred_language?: "en" | "zh";
  participant_key?: string;
  attendee_email?: string | null;
  hold_expires_at?: string;
  fulfillment_state?: "pending" | "paid_requires_review";
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
  handwritten_signature_data_url: string | null;
  coupon_code: string | null;
  checkout_attempt: CheckoutAttempt | null;
  fulfilled_registration_id: string | null;
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
    registrationKind: row.registration_kind ?? "self",
    preferredLanguage: row.preferred_language ?? "en",
    participantKey: row.participant_key ?? "self",
    attendeeEmail: row.attendee_email ?? null,
    holdExpiresAt: row.hold_expires_at,
    fulfillmentState: row.fulfillment_state ?? "pending",
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
    handwrittenSignatureDataUrl: row.handwritten_signature_data_url ?? null,
    couponCode: row.coupon_code ?? null,
    checkoutAttempt: row.checkout_attempt ?? null,
    fulfilledRegistrationId: row.fulfilled_registration_id ?? null,
  };
}

function pendingRegistrationToRow(data: NewPendingRegistration) {
  return {
    event_slug: data.eventSlug,
    member_id: data.memberId,
    registration_kind: data.registrationKind ?? "self",
    preferred_language: data.preferredLanguage ?? "en",
    participant_key: data.participantKey ?? "self",
    attendee_email: data.attendeeEmail ?? null,
    hold_expires_at: data.holdExpiresAt ?? data.expiresAt,
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
    handwritten_signature_data_url: data.handwrittenSignatureDataUrl ?? null,
    coupon_code: data.couponCode?.trim().toUpperCase() || null,
  };
}

export function createPendingRegistrationStore(filePath: string): PendingRegistrationSource {
  const store = createJsonArrayStore<PendingRegistration>(filePath);
  // Local JSON fallback only. Production concurrency is enforced by Postgres.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work);
    queue = next.catch(() => undefined);
    return next;
  }

  return {
    async createOrRefresh(data) {
      return serial(async () => {
      const normalizedEmail = normalizeEmail(data.contactEmail);
      const rows = await store.read();
      const existing = rows.find(
        (row) =>
          row.eventSlug === data.eventSlug &&
          !row.fulfilledRegistrationId &&
          (row.participantKey ?? "self") === (data.participantKey ?? "self") &&
          (data.memberId
            ? row.memberId === data.memberId
            : normalizeEmail(row.contactEmail) === normalizedEmail),
      );
      if (existing?.checkoutAttempt || existing?.fulfilledRegistrationId) return existing;
      const now = new Date().toISOString();
      const pending: PendingRegistration = {
        ...data,
        contactEmail: normalizedEmail,
        id: existing?.id ?? crypto.randomUUID(),
        createdAt: existing?.createdAt ?? now,
      };
      await store.write([...rows.filter((row) => row.id !== pending.id), pending]);
      return pending;
      });
    },
    async getById(id) {
      return (await store.read()).find((row) => row.id === id);
    },
    async getByTokenHash(tokenHash) {
      return (await store.read()).find((row) => row.tokenHash === tokenHash);
    },
    async listForMember(memberId, now = new Date()) {
      return (await store.read()).filter(
        (row) =>
          row.memberId === memberId &&
          !row.fulfilledRegistrationId &&
          (Boolean(row.checkoutAttempt) || Date.parse(row.expiresAt) > now.getTime()),
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
      await serial(async () => {
        const rows = await store.read();
        const row = rows.find((item) => item.id === id);
        if (row?.checkoutAttempt || row?.fulfilledRegistrationId) throw new Error("Checkout records must be retained");
        await store.write(rows.filter((item) => item.id !== id));
      });
    },
    async compareCheckout(id, tokenHash, expectedAttemptId, attempt) {
      return serial(async () => {
        const rows = await store.read();
        const row = rows.find((item) => item.id === id && item.tokenHash === tokenHash &&
          (item.checkoutAttempt?.id ?? null) === expectedAttemptId && !item.fulfilledRegistrationId);
        if (!row) return undefined;
        row.checkoutAttempt = attempt;
        await store.write(rows);
        return row;
      });
    },
    async complete(id, registrationId) {
      await serial(async () => {
        const rows = await store.read();
        const row = rows.find((item) => item.id === id);
        if (!row || (row.fulfilledRegistrationId && row.fulfilledRegistrationId !== registrationId)) throw new Error("Checkout completion conflict");
        row.fulfilledRegistrationId = registrationId;
        await store.write(rows);
      });
    },
  };
}

function createSupabasePendingRegistrationSource(): PendingRegistrationSource {
  return {
    async createOrRefresh(data) {
      const client = createAdminPendingRegistrationClient();
      const normalizedEmail = normalizeEmail(data.contactEmail);
      const findExisting = async () => {
        let query = client.from("pending_registrations").select("*").eq("event_slug", data.eventSlug)
          .eq("participant_key", data.participantKey ?? "self").is("fulfilled_registration_id", null);
        query = data.memberId ? query.eq("member_id", data.memberId) : query.eq("contact_email", normalizedEmail);
        const result = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
        throwSupabaseError(result.error);
        return result.data as PendingRegistrationRow | null;
      };
      let existing = await findExisting();
      if (!existing) {
        const inserted = await client
        .from("pending_registrations")
        .insert(pendingRegistrationToRow({ ...data, contactEmail: normalizedEmail }))
        .select("*")
        .maybeSingle();
        if (!inserted.error && inserted.data) return rowToPendingRegistration(inserted.data as PendingRegistrationRow);
        if (inserted.error?.code !== "23505") throwSupabaseError(inserted.error);
        // A concurrent insert won the member/event unique constraint.
        existing = await findExisting();
      }
      if (!existing) throw new Error("Pending registration could not be saved");
      if (existing.checkout_attempt || existing.fulfilled_registration_id) return rowToPendingRegistration(existing);
      const { data: row, error } = await client.from("pending_registrations")
        .update(pendingRegistrationToRow({ ...data, contactEmail: normalizedEmail }))
        .eq("id", existing.id).is("checkout_attempt", null).is("fulfilled_registration_id", null)
        .select("*").maybeSingle();
      throwSupabaseError(error);
      const current = row ?? await findExisting();
      if (!current) throw new Error("Pending registration changed; please retry");
      return rowToPendingRegistration(current as PendingRegistrationRow);
    },
    async getById(id) {
      const { data, error } = await createAdminPendingRegistrationClient()
        .from("pending_registrations")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      throwSupabaseError(error);
      return data ? rowToPendingRegistration(data as PendingRegistrationRow) : undefined;
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
        .is("fulfilled_registration_id", null)
        .order("created_at", { ascending: true });
      if (isMissingPendingRegistrationsTableError(error)) return [];
      throwSupabaseError(error);
      return ((data ?? []) as PendingRegistrationRow[])
        .map(rowToPendingRegistration)
        .filter((row) => Boolean(row.checkoutAttempt) || Date.parse(row.expiresAt) > now.getTime());
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
    async compareCheckout(id, tokenHash, expectedAttemptId, attempt) {
      let query = createAdminPendingRegistrationClient().from("pending_registrations")
        .update({ checkout_attempt: attempt }).eq("id", id).eq("token_hash", tokenHash)
        .is("fulfilled_registration_id", null);
      query = expectedAttemptId === null
        ? query.is("checkout_attempt", null)
        : query.contains("checkout_attempt", { id: expectedAttemptId });
      const { data, error } = await query.select("*").maybeSingle();
      throwSupabaseError(error);
      return data ? rowToPendingRegistration(data as PendingRegistrationRow) : undefined;
    },
    async complete(id, registrationId) {
      const client = createAdminPendingRegistrationClient();
      const { data, error } = await client.from("pending_registrations")
        .update({ fulfilled_registration_id: registrationId }).eq("id", id)
        .is("fulfilled_registration_id", null)
        .select("id").maybeSingle();
      throwSupabaseError(error);
      if (data) return;
      const current = await client.from("pending_registrations")
        .select("fulfilled_registration_id").eq("id", id).maybeSingle();
      throwSupabaseError(current.error);
      if (current.data?.fulfilled_registration_id !== registrationId) throw new Error("Checkout completion conflict");
    },
  };
}

export function createPendingRegistrationRepository(source: PendingRegistrationSource) {
  return {
    createOrRefreshPendingRegistration: source.createOrRefresh,
    getPendingRegistrationById: source.getById,
    getPendingRegistrationByTokenHash: source.getByTokenHash,
    getPendingRegistrationsByMember: source.listForMember,
    hasPendingRegistrationForEmail: source.hasForEmail,
    hasPendingRegistrationForMember: source.hasForMember,
    deletePendingRegistration: source.delete,
    comparePendingCheckout: source.compareCheckout,
    completePendingCheckout: source.complete,
  };
}

const pendingRegistrationStore = hasSupabaseConfig()
  ? createSupabasePendingRegistrationSource()
  : createPendingRegistrationStore(workspaceDataPath("pending-registrations.json"));
const repository = createPendingRegistrationRepository(pendingRegistrationStore);

export const createOrRefreshPendingRegistration = repository.createOrRefreshPendingRegistration;
export const getPendingRegistrationById = repository.getPendingRegistrationById;
export const getPendingRegistrationByTokenHash = repository.getPendingRegistrationByTokenHash;
export const getPendingRegistrationsByMember = repository.getPendingRegistrationsByMember;
export const hasPendingRegistrationForEmail = repository.hasPendingRegistrationForEmail;
export const hasPendingRegistrationForMember = repository.hasPendingRegistrationForMember;
export const deletePendingRegistration = repository.deletePendingRegistration;
export const comparePendingCheckout = repository.comparePendingCheckout;
export const completePendingCheckout = repository.completePendingCheckout;
