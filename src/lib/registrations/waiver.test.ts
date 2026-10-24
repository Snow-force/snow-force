import { describe, expect, it } from "vitest";
import { computeWaiverSha, DEFAULT_WAIVER_TEXT } from "./waiver";

describe("computeWaiverSha", () => {
  it("keeps optional media/marketing grants out of future default liability waivers", () => {
    expect(DEFAULT_WAIVER_TEXT).not.toContain("Media Release");
    expect(DEFAULT_WAIVER_TEXT).not.toContain("permission to use my image");
  });
  it("directs event questions to the confirmed general mailbox", () => {
    expect(DEFAULT_WAIVER_TEXT).toContain("Email: hello@snow-force.com");
    expect(DEFAULT_WAIVER_TEXT).not.toContain("snowforceclub@gmail.com");
  });
  it("returns a 64-character hex string", async () => {
    const sha = await computeWaiverSha("hello");
    expect(sha).toHaveLength(64);
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a deterministic hash for the same input", async () => {
    const sha1 = await computeWaiverSha("test waiver text");
    const sha2 = await computeWaiverSha("test waiver text");
    expect(sha1).toBe(sha2);
  });

  it("returns different hashes for different inputs", async () => {
    const sha1 = await computeWaiverSha("waiver version 1");
    const sha2 = await computeWaiverSha("waiver version 2");
    expect(sha1).not.toBe(sha2);
  });

  it("handles empty string without throwing", async () => {
    const sha = await computeWaiverSha("");
    expect(sha).toHaveLength(64);
  });

  it("handles multi-paragraph waiver text", async () => {
    const longText = [
      "RELEASE OF LIABILITY, WAIVER OF CLAIMS, ASSUMPTION OF RISKS",
      "",
      "By registering for this event, you acknowledge and agree that:",
      "1. Snow sports involve inherent risks of injury or death.",
      "2. You assume all risks associated with participation.",
      "[PLACEHOLDER: consult legal counsel before finalizing]",
    ].join("\n");

    const sha = await computeWaiverSha(longText);
    expect(sha).toHaveLength(64);
  });
});
