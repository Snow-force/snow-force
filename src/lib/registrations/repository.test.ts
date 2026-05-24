import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRegistrationRepository, createRegistrationStore, type RegistrationSource } from "./repository";
import type { Registration } from "../types";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("registration store", () => {
  it("persists registrations so a later store instance can read them", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "snowforce-registrations-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "registrations.json");
    const firstStore = createRegistrationStore(filePath);

    const created = await firstStore.create({
      eventSlug: "snowforce-kickoff-2026",
      memberId: null,
      answers: {
        name: "Tai",
        email: "tai@example.com",
        phone: "555-0100",
      },
      consentGiven: true,
      contactEmail: "tai@example.com",
      contactName: "Tai",
      contactPhone: "555-0100",
    });

    const secondStore = createRegistrationStore(filePath);

    expect((await secondStore.list()).map((registration) => registration.id)).toEqual([
      created.id,
    ]);
  });

  it("creates registrations through a source-backed repository", async () => {
    const rows: Registration[] = [];
    const source: RegistrationSource = {
      list: async (eventSlug) =>
        eventSlug ? rows.filter((registration) => registration.eventSlug === eventSlug) : rows,
      get: async (id) => rows.find((registration) => registration.id === id),
      listForMember: async (memberId) =>
        rows.filter((registration) => registration.memberId === memberId),
      countForEvent: async (eventSlug) =>
        rows.filter(
          (registration) =>
            registration.eventSlug === eventSlug && registration.status !== "cancelled",
        ).length,
      create: async (data) => {
        const registration: Registration = {
          ...data,
          id: "reg_db_1",
          status: "confirmed",
          createdAt: "2026-05-24T00:00:00.000Z",
          updatedAt: "2026-05-24T00:00:00.000Z",
        };
        rows.push(registration);
        return registration;
      },
      updateStatus: async (id, status) => {
        const registration = rows.find((item) => item.id === id);
        if (!registration) return undefined;
        registration.status = status;
        return registration;
      },
    };
    const repository = createRegistrationRepository(source);

    const result = await repository.createRegistration({
      eventSlug: "snowforce-kickoff-2026",
      memberId: null,
      answers: {
        name: "Tai",
        email: "tai@example.com",
        phone: "555-0100",
      },
      consentGiven: true,
      contactEmail: "tai@example.com",
      contactName: "Tai",
      contactPhone: "555-0100",
    });

    expect(result.registration.id).toBe("reg_db_1");
    expect(await repository.getRegistrationCountForEvent("snowforce-kickoff-2026")).toBe(1);
    expect((await repository.getRegistrations()).map((registration) => registration.contactEmail)).toEqual([
      "tai@example.com",
    ]);
  });
});
