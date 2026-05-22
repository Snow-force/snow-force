import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRegistrationStore } from "./repository";

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
});
