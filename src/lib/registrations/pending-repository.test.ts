import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createPendingRegistrationRepository,
  createPendingRegistrationStore,
  isMissingPendingRegistrationsTableError,
} from "./pending-repository";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("pending registration repository", () => {
  it("recognizes Supabase schema-cache errors for missing pending table", () => {
    expect(
      isMissingPendingRegistrationsTableError({
        message: "Could not find the table 'public.pending_registrations' in the schema cache",
      }),
    ).toBe(true);
  });

  it("refreshes pending registrations for the same event and email", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "snowforce-pending-"));
    tempDirs.push(dir);
    const repository = createPendingRegistrationRepository(
      createPendingRegistrationStore(path.join(dir, "pending.json")),
    );

    await repository.createOrRefreshPendingRegistration({
      eventSlug: "big-bear-day",
      memberId: null,
      answers: { name: "Tai", email: "tai@example.com" },
      consentGiven: true,
      contactName: "Tai",
      contactEmail: "tai@example.com",
      contactPhone: "",
      tokenHash: "hash-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    await repository.createOrRefreshPendingRegistration({
      eventSlug: "big-bear-day",
      memberId: null,
      answers: { name: "Tai", email: "tai@example.com" },
      consentGiven: true,
      contactName: "Tai",
      contactEmail: "tai@example.com",
      contactPhone: "",
      tokenHash: "hash-2",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    expect(await repository.hasPendingRegistrationForEmail("big-bear-day", "TAI@example.com")).toBe(true);
    expect(await repository.getPendingRegistrationByTokenHash("hash-1")).toBeUndefined();
    expect((await repository.getPendingRegistrationByTokenHash("hash-2"))?.contactEmail).toBe("tai@example.com");
  });

  it("lists active pending registrations for a member", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "snowforce-pending-"));
    tempDirs.push(dir);
    const repository = createPendingRegistrationRepository(
      createPendingRegistrationStore(path.join(dir, "pending.json")),
    );

    await repository.createOrRefreshPendingRegistration({
      eventSlug: "big-bear-day",
      memberId: "member-1",
      answers: { name: "Tai", email: "tai@example.com" },
      consentGiven: true,
      contactName: "Tai",
      contactEmail: "tai@example.com",
      contactPhone: "",
      tokenHash: "hash-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    await repository.createOrRefreshPendingRegistration({
      eventSlug: "expired-trip",
      memberId: "member-1",
      answers: { name: "Tai", email: "tai@example.com" },
      consentGiven: true,
      contactName: "Tai",
      contactEmail: "tai@example.com",
      contactPhone: "",
      tokenHash: "hash-2",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    await repository.createOrRefreshPendingRegistration({
      eventSlug: "other-member-trip",
      memberId: "member-2",
      answers: { name: "Other", email: "other@example.com" },
      consentGiven: true,
      contactName: "Other",
      contactEmail: "other@example.com",
      contactPhone: "",
      tokenHash: "hash-3",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const rows = await repository.getPendingRegistrationsByMember("member-1", new Date("2026-01-01T00:00:00.000Z"));

    expect(rows.map((row) => row.eventSlug)).toEqual(["big-bear-day"]);
  });
});
