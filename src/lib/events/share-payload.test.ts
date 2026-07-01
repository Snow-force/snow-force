import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildShareUrl, buildQrCodeDataUrl } from "./share-payload";

describe("buildShareUrl", () => {
  it('returns full URL for valid origin and slug', () => {
    expect(buildShareUrl("https://snowforce.app", "tahoe-trip-2026"))
      .toBe("https://snowforce.app/events/tahoe-trip-2026");
  });

  it('throws on invalid slug with uppercase and spaces', () => {
    expect(() => buildShareUrl("https://snowforce.app", "Tahoe Trip!"))
      .toThrow("invalid slug");
  });

  it('throws on origin missing protocol', () => {
    expect(() => buildShareUrl("snowforce.app", "tahoe"))
      .toThrow("origin must start with http:// or https://");
  });

  it('allows http:// origin (not just https)', () => {
    expect(buildShareUrl("http://localhost:3000", "event-1"))
      .toBe("http://localhost:3000/events/event-1");
  });
});

describe("buildQrCodeDataUrl", () => {
  it('returns dataUrl starting with PNG prefix and correct dimensions', async () => {
    const result = await buildQrCodeDataUrl("hello");
    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.width).toBe(240);
    expect(result.height).toBe(240);
  });

  it('generates a non-empty PNG for a real event URL', async () => {
    const result = await buildQrCodeDataUrl(
      "https://snowforce.app/events/tahoe-trip-2026"
    );
    // PNG base64 payload should be well over 100 chars
    const base64 = result.dataUrl.replace(/^data:image\/png;base64,/, "");
    expect(base64.length).toBeGreaterThan(100);
    expect(result.width).toBe(240);
    expect(result.height).toBe(240);
  });
});
