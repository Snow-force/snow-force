import type { Registration } from "../types";
import { incrementRegistrationCount } from "../events/repository";
import { createJsonArrayStore, workspaceDataPath } from "../server/json-store";

type NewRegistration = Omit<Registration, "id" | "createdAt" | "updatedAt" | "status">;

export function createRegistrationStore(filePath: string) {
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

const registrationStore = createRegistrationStore(workspaceDataPath("registrations.json"));

export const getRegistrations = registrationStore.list;
export const getRegistration = registrationStore.get;
export const getRegistrationsByMember = registrationStore.listForMember;
export const getRegistrationCountForEvent = registrationStore.countForEvent;
export const updateRegistrationStatus = registrationStore.updateStatus;

export async function createRegistration(data: NewRegistration) {
  return { success: true as const, registration: await registrationStore.create(data) };
}
