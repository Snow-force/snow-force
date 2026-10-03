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
        pass: ["Ikon", "Epic"],
        needsRental: true,
      },
      consentGiven: true,
      contactEmail: "tai@example.com",
      contactName: "Tai",
      contactPhone: "555-0100",
    });

    const secondStore = createRegistrationStore(filePath);

    const registrations = await secondStore.list();

    expect(registrations.map((registration) => registration.id)).toEqual([created.id]);
    expect(registrations[0].answers.pass).toEqual(["Ikon", "Epic"]);
    expect(registrations[0].answers.needsRental).toBe(true);
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
          attendanceStatus: "unmarked",
          attendanceSource: null,
          attendanceMarkedAt: null,
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
      updateFinance: async (id, finance) => {
        const registration = rows.find((item) => item.id === id);
        if (!registration) return undefined;
        registration.finance = { ...registration.finance, ...finance } as Registration["finance"];
        return registration;
      },
      deleteCancelled: async (id) => {
        const index = rows.findIndex((registration) => registration.id === id);
        if (index === -1 || rows[index].status !== "cancelled") return undefined;
        const [deleted] = rows.splice(index, 1);
        return deleted;
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

  it("deletes only cancelled registrations", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "snowforce-registrations-"));
    tempDirs.push(dir);
    const store = createRegistrationStore(path.join(dir, "registrations.json"));
    const confirmed = await store.create({
      eventSlug: "snowforce-kickoff-2026",
      memberId: null,
      answers: {},
      consentGiven: true,
      contactEmail: "confirmed@example.com",
      contactName: "Confirmed",
      contactPhone: "",
    });
    const cancelled = await store.create({
      eventSlug: "snowforce-kickoff-2026",
      memberId: null,
      answers: {},
      consentGiven: true,
      contactEmail: "cancelled@example.com",
      contactName: "Cancelled",
      contactPhone: "",
    });
    const waitlist = await store.create({
      eventSlug: "snowforce-kickoff-2026",
      memberId: null,
      answers: {},
      consentGiven: true,
      contactEmail: "waitlist@example.com",
      contactName: "Waitlist",
      contactPhone: "",
    });
    await store.updateStatus(cancelled.id, "cancelled");
    await store.updateStatus(waitlist.id, "waitlist");
    const repository = createRegistrationRepository(store);

    await expect(repository.deleteCancelledRegistration(confirmed.id)).resolves.toBeUndefined();
    await expect(repository.deleteCancelledRegistration(waitlist.id)).resolves.toBeUndefined();
    const deleted = await repository.deleteCancelledRegistration(cancelled.id);

    expect(deleted?.id).toBe(cancelled.id);
    expect((await repository.getRegistrations()).map((registration) => registration.id)).toEqual([
      confirmed.id,
      waitlist.id,
    ]);
    expect(await repository.getRegistrationCountForEvent("snowforce-kickoff-2026")).toBe(2);
  });

  it("updates finance through an extracted repository function", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "snowforce-registrations-"));
    tempDirs.push(dir);
    const store = createRegistrationStore(path.join(dir, "registrations.json"));
    const created = await store.create({
      eventSlug: "snowforce-kickoff-2026",
      memberId: "member-1",
      answers: {},
      consentGiven: true,
      contactEmail: "member@example.com",
      contactName: "Member",
      contactPhone: "",
    });
    const { updateRegistrationFinance } = createRegistrationRepository(store);

    const updated = await updateRegistrationFinance(created.id, {
      depositAmount: 150,
      finalAmount: 180,
    });

    expect(updated?.finance?.settlementAmount).toBe(30);
    expect(updated?.finance?.settlementStatus).toBe("pending_balance");
  });
});
