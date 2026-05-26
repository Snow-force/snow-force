import type { Registration, RegistrationAnswers } from "../types";
import { createClient } from "@supabase/supabase-js";
import { incrementRegistrationCount } from "../events/repository";
import { createJsonArrayStore, workspaceDataPath } from "../server/json-store";

export type NewRegistration = Omit<Registration, "id" | "createdAt" | "updatedAt" | "status">;

export type RegistrationSource = {
  list(eventSlug?: string): Promise<Registration[]>;
  get(id: string): Promise<Registration | undefined>;
  listForMember(memberId: string): Promise<Registration[]>;
  countForEvent(eventSlug: string): Promise<number>;
  create(data: NewRegistration): Promise<Registration>;
  updateStatus(id: string, status: Registration["status"]): Promise<Registration | undefined>;
};

type RegistrationRow = {
  id: string;
  event_slug: string;
  member_id: string | null;
  answers: RegistrationAnswers;
  consent_given: boolean;
  contact_email: string;
  contact_name: string;
  contact_phone: string | null;
  status: Registration["status"];
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
    answers: row.answers,
    consentGiven: row.consent_given,
    contactEmail: row.contact_email,
    contactName: row.contact_name,
    contactPhone: row.contact_phone ?? "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function registrationToInsert(data: NewRegistration) {
  return {
    event_slug: data.eventSlug,
    member_id: data.memberId,
    answers: data.answers,
    consent_given: data.consentGiven,
    contact_email: data.contactEmail,
    contact_name: data.contactName,
    contact_phone: data.contactPhone,
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
      return (await store.read()).filter((registration) => registration.memberId === memberId);
    },
    async countForEvent(eventSlug: string) {
      return (await store.read()).filter(
        (registration) =>
          registration.eventSlug === eventSlug && registration.status !== "cancelled",
      ).length;
    },
    async create(data: NewRegistration) {
      const registrations = await store.read();
      const now = new Date().toISOString();
      const registration: Registration = {
        ...data,
        id: `reg_${Date.now()}_${crypto.randomUUID()}`,
        status: "confirmed",
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
        .eq("member_id", memberId)
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
  };
}

export function createRegistrationRepository(source: RegistrationSource) {
  return {
    getRegistrations: source.list,
    getRegistration: source.get,
    getRegistrationsByMember: source.listForMember,
    getRegistrationCountForEvent: source.countForEvent,
    updateRegistrationStatus: source.updateStatus,
    async createRegistration(data: NewRegistration) {
      return { success: true as const, registration: await source.create(data) };
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
export const createRegistration = repository.createRegistration;
