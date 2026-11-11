// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MEDIA_MAX_SOURCE_BYTES, MEDIA_MAX_VARIANT_BYTES, publicMediaSource } from "./delivery-policy";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), upload: vi.fn(), resize: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ storage: { from: () => ({ upload: mocks.upload }) } }) }));
vi.mock("./encode-preview", () => ({ encodePreview: mocks.resize }));
const source = publicMediaSource("https://media.example.test/storage/v1/object/public/recap-media/photo.jpg", "https://media.example.test")!;
const missing = { statusCode: "404", code: "NoSuchKey", error: "not_found", message: "Object not found" };
const json = (data: unknown, status = 400) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.upload.mockResolvedValue({ error: null });
  mocks.resize.mockResolvedValue(Buffer.from("webp-preview"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function get() { return (await import("./variant-runtime")).publicVariants.get(source, 640); }
function withMiss(response: () => Response) {
  mocks.fetch.mockImplementation(async (url: string) => url.includes("/_web/") ? response() : new Response("original", { headers: { "Content-Type": "image/jpeg" } }));
}

describe("Storage HTTP image adapter", () => {
  it.each([missing, { statusCode: "404", error: "not_found", message: "Object not found" }])("generates previews for Supabase transport-400 object misses: %j", async (body) => {
    withMiss(() => json(body));
    expect((await get()).cache).toBe("generated");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.upload).toHaveBeenCalledTimes(4);
  });
  it("also accepts a transport-404 miss without sending a server credential on public reads", async () => {
    withMiss(() => new Response(null, { status: 404 }));
    expect((await get()).cache).toBe("generated");
    expect(mocks.fetch).toHaveBeenCalledWith(expect.any(String), { redirect: "error", signal: expect.any(AbortSignal), cache: "no-store" });
  });
  it.each([
    { status: 400, body: { statusCode: "403", error: "not_found" } },
    { status: 400, body: { statusCode: "404", code: "NoSuchBucket", message: "Bucket not found" } },
    { status: 400, body: { message: "Invalid request" } },
    { status: 402, body: missing }, { status: 403, body: missing }, { status: 500, body: missing },
  ])("fails closed on quota, permission, bucket and other service errors: %j", async ({ status, body }) => {
    withMiss(() => json(body, status));
    await expect(get()).rejects.toThrow();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("bounds JSON error bodies before classifying misses", async () => {
    withMiss(() => json({ ...missing, extra: "x".repeat(5000) }));
    await expect(get()).rejects.toThrow();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each(["header", "stream"])("bounds stored preview bytes using the %s", async (mode) => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array(MEDIA_MAX_VARIANT_BYTES + 1), { headers: { "Content-Type": "image/webp", ...(mode === "header" ? { "Content-Length": String(MEDIA_MAX_VARIANT_BYTES + 1) } : {}) } }));
    await expect(get()).rejects.toThrow("Image too large");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects oversized originals before decoding or uploading", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(new Response("small body", { headers: { "Content-Type": "image/jpeg", "Content-Length": String(MEDIA_MAX_SOURCE_BYTES + 1) } }));
    await expect(get()).rejects.toThrow("Image too large");
    expect(mocks.resize).not.toHaveBeenCalled();
  });
  it("requires image MIME and successful durable writes", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("not a photo", { headers: { "Content-Type": "text/html" } }));
    await expect(get()).rejects.toThrow("Image service unavailable");
    vi.resetModules();
    withMiss(() => new Response(null, { status: 404 }));
    mocks.upload.mockResolvedValue({ error: { message: "permission denied" } });
    await expect(get()).rejects.toThrow("Preview storage unavailable");
  });
});
