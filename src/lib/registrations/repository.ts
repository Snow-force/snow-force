import type { Registration, RegistrationAnswers, RegistrationFinance } from "../types";
import { createClient } from "@supabase/supabase-js";
import { incrementRegistrationCount } from "../events/repository";
import { createJsonArrayStore, workspaceDataPath } from "../server/json-store";
import {
  applyRegistrationFinanceInput,
  defaultRegistrationFinance,
  normalizeRegistrationFinance,
  type RegistrationFinanceInput,
} from "./finance";

export type NewRegistration = Omit<
  Registration,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "status"
  | "attendanceStatus"
  | "attendanceSource"
  | "attendanceMarkedAt"
>;

export type RegistrationSource = {
  list(eventSlug?: string): Promise<Registration[]>;
  get(id: string): Promise<Registration | undefined>;
  listForMember(memberId: string): Promise<Registration[]>;
  countForEvent(eventSlug: string): Promise<number>;
  create(data: NewRegistration): Promise<Registration>;
  updateStatus(id: string, status: Registration["status"]): Promise<Registration | undefined>;
  updateFinance(id: string, finance: RegistrationFinanceInput): Promise<Registration | undefined>;
  deleteCancelled(id: string): Promise<Registration | undefined>;
};

type RegistrationRow = {
  id: string;
  event_slug: string;
  member_id: string | null;
  booker_member_id?: string | null;
  registration_kind?: Registration["registrationKind"];
  attendee_email?: string | null;
  attendee_confirmation_status?: Registration["attendeeConfirmationStatus"];
  approval_status?: Registration["approvalStatus"];
  client_request_key?: string | null;
  pending_registration_id?: string | null;
  creation_source?: Registration["creationSource"];
  booking_id?: string | null;
  waiver_participant_id?: string | null;
  answers: RegistrationAnswers;
  consent_given: boolean;
  contact_email: string;
  contact_name: string;
  contact_phone: string | null;
  status: Registration["status"];
  attendance_status: Registration["attendanceStatus"] | null;
  attendance_source: Registration["attendanceSource"];
  attendance_marked_at: string | null;
  deposit_amount: number | null;
  deposit_status: RegistrationFinance["depositStatus"] | null;
  deposit_paid_at: string | null;
  payment_method: string | null;
  payment_currency: RegistrationFinance["paymentCurrency"] | null;
  payment_note: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  refunded_amount: number | null;
  lodging_assignment: string | null;
  final_amount: number | null;
  settlement_amount: number | null;
  settlement_status: RegistrationFinance["settlementStatus"] | null;
  settlement_note: string | null;
  coupon_code: string | null;
  discount_amount: number | null;
  created_at: string;
  updated_at: string;
};

function throwSupabaseError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is not configured.");
  return url;
}

function createAdminRegistrationClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Supabase admin writes are not configured.");

  return createClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function rowToRegistration(row: RegistrationRow): Registration {
  return {
    id: row.id,
    eventSlug: row.event_slug,
    memberId: row.member_id,
    bookerMemberId: row.booker_member_id ?? row.member_id,
    registrationKind: row.registration_kind ?? "self",
    attendeeEmail: row.attendee_email ?? null,
    attendeeConfirmationStatus: row.attendee_confirmation_status ?? "not_required",
    approvalStatus: row.approval_status ?? "not_required",
    clientRequestKey: row.client_request_key ?? null,
    pendingRegistrationId: row.pending_registration_id ?? null,
    creationSource: row.creation_source ?? "legacy",
    bookingId: row.booking_id ?? null,
    waiverParticipantId: row.waiver_participant_id ?? null,
    answers: row.answers,
    consentGiven: row.consent_given,
    contactEmail: row.contact_email,
    contactName: row.contact_name,
    contactPhone: row.contact_phone ?? "",
    status: row.status,
    attendanceStatus: row.attendance_status ?? "unmarked",
    attendanceSource: row.attendance_source ?? null,
    attendanceMarkedAt: row.attendance_marked_at,
    finance: normalizeRegistrationFinance({
      depositAmount: row.deposit_amount,
      depositStatus: row.deposit_status ?? defaultRegistrationFinance.depositStatus,
      depositPaidAt: row.deposit_paid_at ?? "",
      paymentMethod: row.payment_method ?? "",
      paymentCurrency: row.payment_currency ?? "",
      paymentNote: row.payment_note ?? "",
      stripeCheckoutSessionId: row.stripe_checkout_session_id ?? "",
      stripePaymentIntentId: row.stripe_payment_intent_id ?? "",
      refundedAmount: row.refunded_amount ?? 0,
      lodgingAssignment: row.lodging_assignment ?? "",
      finalAmount: row.final_amount,
      settlementAmount: row.settlement_amount,
      settlementStatus: row.settlement_status ?? defaultRegistrationFinance.settlementStatus,
      settlementNote: row.settlement_note ?? "",
      ...(row.coupon_code ? { couponCode: row.coupon_code } : {}),
      ...(row.discount_amount ? { discountAmount: row.discount_amount } : {}),
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function registrationToInsert(data: NewRegistration) {
  return {
    event_slug: data.eventSlug,
    member_id: data.memberId,
    booker_member_id: data.bookerMemberId ?? data.memberId,
    registration_kind: data.registrationKind ?? "self",
    attendee_email: data.attendeeEmail ?? null,
    attendee_confirmation_status: data.attendeeConfirmationStatus ?? "not_required",
    client_request_key: data.clientRequestKey ?? null,
    pending_registration_id: data.pendingRegistrationId ?? null,
    creation_source: data.creationSource ?? "member",
    answers: data.answers,
    consent_given: data.consentGiven,
    contact_email: data.contactEmail,
    contact_name: data.contactName,
    contact_phone: data.contactPhone,
    deposit_amount: data.finance?.depositAmount ?? null,
    deposit_status: data.finance?.depositStatus ?? defaultRegistrationFinance.depositStatus,
    deposit_paid_at: data.finance?.depositPaidAt || null,
    payment_method: data.finance?.paymentMethod ?? "",
    payment_currency: data.finance?.paymentCurrency || null,
    payment_note: data.finance?.paymentNote ?? "",
    stripe_checkout_session_id: data.finance?.stripeCheckoutSessionId || null,
    stripe_payment_intent_id: data.finance?.stripePaymentIntentId || null,
    refunded_amount: data.finance?.refundedAmount ?? 0,
    lodging_assignment: data.finance?.lodgingAssignment ?? "",
    final_amount: data.finance?.finalAmount ?? null,
    settlement_amount: data.finance?.settlementAmount ?? null,
    settlement_status: data.finance?.settlementStatus ?? defaultRegistrationFinance.settlementStatus,
    settlement_note: data.finance?.settlementNote ?? "",
    coupon_code: data.finance?.couponCode || null,
    discount_amount: data.finance?.discountAmount ?? 0,
  };
}

function financeToUpdate(finance: RegistrationFinance) {
  return {
    deposit_amount: finance.depositAmount,
    deposit_status: finance.depositStatus,
    deposit_paid_at: finance.depositPaidAt || null,
    payment_method: finance.paymentMethod,
    payment_currency: finance.paymentCurrency || null,
    payment_note: finance.paymentNote,
    stripe_checkout_session_id: finance.stripeCheckoutSessionId || null,
    stripe_payment_intent_id: finance.stripePaymentIntentId || null,
    refunded_amount: finance.refundedAmount,
    lodging_assignment: finance.lodgingAssignment,
    final_amount: finance.finalAmount,
    settlement_amount: finance.settlementAmount,
    settlement_status: finance.settlementStatus,
    settlement_note: finance.settlementNote,
    coupon_code: finance.couponCode || null,
    discount_amount: finance.discountAmount ?? 0,
  };
}

export function createRegistrationStore(filePath: string): RegistrationSource {
  const store = createJsonArrayStore<Registration>(filePath);

  return {
    async list(eventSlug?: string) {
      const registrations = await store.read();
      return eventSlug
        ? registrations.filter((registration) => registration.eventSlug === eventSlug)
        : registrations;
    },
    async get(id: string) {
      return (await store.read()).find((registration) => registration.id === id);
    },
    async listForMember(memberId: string) {
      return (await store.read()).filter((registration) =>
        registration.memberId === memberId || registration.bookerMemberId === memberId);
    },
    async countForEvent(eventSlug: string) {
      return (await store.read()).filter(
        (registration) =>
          registration.eventSlug === eventSlug && registration.status !== "cancelled",
      ).length;
    },
    async create(data: NewRegistration) {
      const registrations = await store.read();
      const existing = registrations.find((row) => data.clientRequestKey && row.clientRequestKey === data.clientRequestKey);
      if (existing) return existing;
      const now = new Date().toISOString();
      const registration: Registration = {
        ...data,
        id: `reg_${Date.now()}_${crypto.randomUUID()}`,
        status: "confirmed",
        attendanceStatus: "unmarked",
        attendanceSource: null,
        attendanceMarkedAt: null,
        finance: normalizeRegistrationFinance(data.finance),
        createdAt: now,
        updatedAt: now,
      };

      await store.write([...registrations, registration]);
      incrementRegistrationCount(data.eventSlug);
      return registration;
    },
    async updateStatus(id: string, status: Registration["status"]) {
      const registrations = await store.read();
      const index = registrations.findIndex((registration) => registration.id === id);
      if (index === -1) return undefined;
      registrations[index] = {
        ...registrations[index],
        status,
        updatedAt: new Date().toISOString(),
      };
      await store.write(registrations);
      return registrations[index];
    },
    async updateFinance(id: string, financeInput: RegistrationFinanceInput) {
      const registrations = await store.read();
      const index = registrations.findIndex((registration) => registration.id === id);
      if (index === -1) return undefined;
      registrations[index] = {
        ...registrations[index],
        finance: applyRegistrationFinanceInput(registrations[index].finance, financeInput),
        updatedAt: new Date().toISOString(),
      };
      await store.write(registrations);
      return registrations[index];
    },
    async deleteCancelled(id: string) {
      const registrations = await store.read();
      const index = registrations.findIndex((registration) => registration.id === id);
      if (index === -1 || registrations[index].status !== "cancelled") return undefined;
      const [deleted] = registrations.splice(index, 1);
      await store.write(registrations);
      return deleted;
    },
  };
}

function createSupabaseRegistrationSource(): RegistrationSource {
  return {
    async list(eventSlug) {
      let query = createAdminRegistrationClient()
        .from("registrations")
        .select("*")
        .order("created_at", { ascending: true });
      if (eventSlug) query = query.eq("event_slug", eventSlug);

      const { data, error } = await query;
      throwSupabaseError(error);
      return ((data ?? []) as RegistrationRow[]).map(rowToRegistration);
    },
    async get(id) {
      const { data, error } = await createAdminRegistrationClient()
        .from("registrations")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      throwSupabaseError(error);
      return data ? rowToRegistration(data as RegistrationRow) : undefined;
    },
    async listForMember(memberId) {
      const { data, error } = await createAdminRegistrationClient()
        .from("registrations")
        .select("*")
        .or(`member_id.eq.${memberId},booker_member_id.eq.${memberId}`)
        .order("created_at", { ascending: true });
      throwSupabaseError(error);
      return ((data ?? []) as RegistrationRow[]).map(rowToRegistration);
    },
    async countForEvent(eventSlug) {
      const { count, error } = await createAdminRegistrationClient()
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("event_slug", eventSlug)
        .neq("status", "cancelled");
      throwSupabaseError(error);
      return count ?? 0;
    },
    async create(data) {
      const { data: row, error } = await createAdminRegistrationClient()
        .from("registrations")
        .insert(registrationToInsert(data))
        .select("*")
        .single();
      throwSupabaseError(error);
      return rowToRegistration(row as RegistrationRow);
    },
    async updateStatus(id, status) {
      const { data, error } = await createAdminRegistrationClient()
        .from("registrations")
        .update({ status })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      throwSupabaseError(error);
      return data ? rowToRegistration(data as RegistrationRow) : undefined;
    },
    async updateFinance(id, financeInput) {
      const { data: existingRow, error: getError } = await createAdminRegistrationClient()
        .from("registrations")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      throwSupabaseError(getError);
      const existing = existingRow ? rowToRegistration(existingRow as RegistrationRow) : undefined;
      if (!existing) return undefined;
      const finance = applyRegistrationFinanceInput(existing.finance, financeInput);
      const { data, error } = await createAdminRegistrationClient()
        .from("registrations")
        .update(financeToUpdate(finance))
        .eq("id", id)
        .select("*")
        .maybeSingle();
      throwSupabaseError(error);
      return data ? rowToRegistration(data as RegistrationRow) : undefined;
    },
    async deleteCancelled(id) {
      const { data, error } = await createAdminRegistrationClient()
        .from("registrations")
        .delete()
        .eq("id", id)
        .eq("status", "cancelled")
        .select("*")
        .maybeSingle();
      throwSupabaseError(error);
      return data ? rowToRegistration(data as RegistrationRow) : undefined;
    },
  };
}

export function createRegistrationRepository(source: RegistrationSource) {
  return {
    getRegistrations: source.list,
    getRegistration: source.get,
    getRegistrationsByMember: source.listForMember,
    getRegistrationCountForEvent: source.countForEvent,
    updateRegistrationStatus: source.updateStatus,
    updateRegistrationFinance: source.updateFinance,
    deleteCancelledRegistration: source.deleteCancelled,
    async createRegistration(data: NewRegistration) {
      try {
        return { success: true as const, registration: await source.create(data) };
      } catch (error) {
        if (!data.pendingRegistrationId && !data.clientRequestKey) throw error;
        const existing = (await source.list(data.eventSlug)).find((row) =>
          data.pendingRegistrationId ? row.pendingRegistrationId === data.pendingRegistrationId : row.clientRequestKey === data.clientRequestKey);
        if (!existing || existing.memberId !== data.memberId ||
          (existing.bookerMemberId ?? existing.memberId) !== (data.bookerMemberId ?? data.memberId) ||
          (existing.finance?.stripePaymentIntentId || "") !== (data.finance?.stripePaymentIntentId || "")) throw error;
        return { success: true as const, registration: existing };
      }
    },
  };
}

const registrationStore = hasSupabaseConfig()
  ? createSupabaseRegistrationSource()
  : createRegistrationStore(workspaceDataPath("registrations.json"));
const repository = createRegistrationRepository(registrationStore);

export const getRegistrations = repository.getRegistrations;
export const getRegistration = repository.getRegistration;
export const getRegistrationsByMember = repository.getRegistrationsByMember;
export const getRegistrationCountForEvent = repository.getRegistrationCountForEvent;
export const updateRegistrationStatus = repository.updateRegistrationStatus;
export const updateRegistrationFinance = repository.updateRegistrationFinance;
export const deleteCancelledRegistration = repository.deleteCancelledRegistration;
export async function createRegistration(data: NewRegistration) {
  const result = await repository.createRegistration(data);
  if (result.registration.waiverParticipantId) {
    try { const { scheduleRegistrationWaiver } = await import("./v2/schedule"); await scheduleRegistrationWaiver(result.registration.id); }
    catch { console.error("[waiver] delivery deferred; durable assignment retained"); }
  }
  return result;
}
