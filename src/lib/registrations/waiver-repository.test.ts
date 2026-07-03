import { describe, expect, it } from "vitest";
import type { WaiverAcceptance } from "@/lib/types";
import { computeWaiverSha } from "./waiver";

const testWaiverText = "RELEASE OF LIABILITY — [PLACEHOLDER: consult legal counsel]";

async function buildFakeAcceptance(overrides: Partial<WaiverAcceptance> = {}): Promise<WaiverAcceptance> {
  return {
    id: 1,
    registrationId: "reg-abc-123",
    legalTextSnapshot: testWaiverText,
    waiverTextSha: await computeWaiverSha(testWaiverText),
    typedName: "Jane Rider",
    acceptedAt: "2026-07-01T12:00:00.000Z",
    createdAt: "2026-07-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("WaiverAcceptance domain type", () => {
  it("contains the required fields", async () => {
    const acceptance = await buildFakeAcceptance();
    expect(acceptance.registrationId).toBe("reg-abc-123");
    expect(acceptance.legalTextSnapshot).toBe(testWaiverText);
    expect(acceptance.waiverTextSha).toHaveLength(64);
    expect(acceptance.typedName).toBe("Jane Rider");
    expect(acceptance.acceptedAt).toBeTruthy();
  });

  it("waiver_text_sha matches the legal_text_snapshot", async () => {
    const acceptance = await buildFakeAcceptance();
    const recomputed = await computeWaiverSha(acceptance.legalTextSnapshot);
    expect(acceptance.waiverTextSha).toBe(recomputed);
  });

  it("different typed names are stored separately", async () => {
    const a1 = await buildFakeAcceptance({ typedName: "Alice Snow" });
    const a2 = await buildFakeAcceptance({ typedName: "Bob Ice" });
    expect(a1.typedName).not.toBe(a2.typedName);
  });

  it("different registrations have different IDs", async () => {
    const a1 = await buildFakeAcceptance({ registrationId: "reg-1" });
    const a2 = await buildFakeAcceptance({ registrationId: "reg-2" });
    expect(a1.registrationId).not.toBe(a2.registrationId);
  });
});

describe("computeWaiverSha integrity", () => {
  it("produces a SHA that changes when waiver text changes", async () => {
    const sha1 = await computeWaiverSha("version 1 of the waiver text");
    const sha2 = await computeWaiverSha("version 2 of the waiver text");
    expect(sha1).not.toBe(sha2);
  });

  it("produces the same SHA for the same text (deterministic)", async () => {
    const sha1 = await computeWaiverSha(testWaiverText);
    const sha2 = await computeWaiverSha(testWaiverText);
    expect(sha1).toBe(sha2);
  });
});
