import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { PendingRegistrationSource, PendingRegistration } from "./pending-repository";
import {
  createPendingRegistrationRepository,
  createPendingRegistrationStore,
  getPendingRegistrationById,
  isMissingPendingRegistrationsTableError,
} from "./pending-repository";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("pending registration repository", () => {
  it("keeps each friend separate, retries the same key, and retains checkout snapshots", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "snowforce-friends-")); tempDirs.push(dir);
    const store = createPendingRegistrationStore(path.join(dir, "pending.json"));
    const data = { eventSlug: "ride", memberId: "booker", registrationKind: "proxy" as const,
      participantKey: "11111111-1111-4111-8111-111111111111", answers: { name: "Friend One" }, consentGiven: true,
      contactEmail: "payer@example.test", contactName: "Friend One", contactPhone: "", tokenHash: "one", expiresAt: "2099-01-01" };
    const first = await store.createOrRefresh(data);
    const second = await store.createOrRefresh({ ...data, participantKey: "22222222-2222-4222-8222-222222222222", contactName: "Friend Two", tokenHash: "two" });
    expect(second.id).not.toBe(first.id);
    expect((await store.createOrRefresh(data)).id).toBe(first.id);
    const attempt = { id: "attempt", createdAt: "2026-10-22", amount: 10, currency: "usd" as const,
      paymentModel: "deposit" as const, couponCode: "", discountAmount: 0, params: {} };
    await store.compareCheckout(first.id, first.tokenHash, null, attempt);
    expect(await store.createOrRefresh({ ...data, contactName: "Replacement" })).toMatchObject({ contactName: "Friend One", checkoutAttempt: attempt });
    await store.complete(first.id, "ticket");
    expect((await store.listForMember("booker")).map((row) => row.id)).toEqual([second.id]);
    expect((await store.createOrRefresh({ ...data, tokenHash: "new" })).id).not.toBe(first.id);
  });
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

  it("refreshes pending registrations for the same event and member", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "snowforce-pending-"));
    tempDirs.push(dir);
    const repository = createPendingRegistrationRepository(
      createPendingRegistrationStore(path.join(dir, "pending.json")),
    );

    await repository.createOrRefreshPendingRegistration({
      eventSlug: "big-bear-day",
      memberId: "member-1",
      answers: { name: "Tai", email: "old@example.com" },
      consentGiven: true,
      contactName: "Tai",
      contactEmail: "old@example.com",
      contactPhone: "",
      tokenHash: "hash-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    await repository.createOrRefreshPendingRegistration({
      eventSlug: "big-bear-day",
      memberId: "member-1",
      answers: { name: "Tai", email: "new@example.com" },
      consentGiven: true,
      contactName: "Tai",
      contactEmail: "new@example.com",
      contactPhone: "",
      tokenHash: "hash-2",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    expect(await repository.hasPendingRegistrationForMember("big-bear-day", "member-1")).toBe(true);
    expect(await repository.getPendingRegistrationByTokenHash("hash-1")).toBeUndefined();
    expect((await repository.getPendingRegistrationsByMember("member-1")).map((row) => row.contactEmail)).toEqual(["new@example.com"]);
  });

  it("retains the original details after a Checkout attempt has been claimed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "snowforce-pending-"));
    tempDirs.push(dir);
    const repository = createPendingRegistrationRepository(
      createPendingRegistrationStore(path.join(dir, "pending.json")),
    );
    const original = await repository.createOrRefreshPendingRegistration({
      eventSlug: "big-bear-day", memberId: "member-1",
      answers: { name: "Tai", email: "old@example.com" }, consentGiven: true,
      contactName: "Tai", contactEmail: "old@example.com", contactPhone: "",
      tokenHash: "hash-1", expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const attempt = {
      id: "attempt-1", createdAt: "2026-01-01T00:00:00.000Z", amount: 99,
      currency: "usd" as const, paymentModel: "deposit" as const, couponCode: "", discountAmount: 0,
      params: { mode: "payment" as const, success_url: "https://snow-force.com/member", cancel_url: "https://snow-force.com/events/big-bear-day", line_items: [] },
    };
    await repository.comparePendingCheckout(original.id, original.tokenHash, null, attempt);

    const refreshed = await repository.createOrRefreshPendingRegistration({
      eventSlug: "big-bear-day", memberId: "member-1",
      answers: { name: "Tai", email: "new@example.com" }, consentGiven: true,
      contactName: "Tai", contactEmail: "new@example.com", contactPhone: "",
      tokenHash: "hash-2", expiresAt: "2099-01-02T00:00:00.000Z",
    });

    expect(refreshed).toMatchObject({ id: original.id, tokenHash: "hash-1", contactEmail: "old@example.com" });
    expect(refreshed.checkoutAttempt?.id).toBe("attempt-1");
  });

  it("retrieves a pending registration by ID and returns undefined for unknown IDs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "snowforce-pending-"));
    tempDirs.push(dir);
    const repository = createPendingRegistrationRepository(
      createPendingRegistrationStore(path.join(dir, "pending.json")),
    );

    const created = await repository.createOrRefreshPendingRegistration({
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

    const found = await repository.getPendingRegistrationById(created.id);
    expect(found?.id).toBe(created.id);
    expect(found?.contactEmail).toBe("tai@example.com");

    const notFound = await repository.getPendingRegistrationById("non-existent-id");
    expect(notFound).toBeUndefined();
  });
});
