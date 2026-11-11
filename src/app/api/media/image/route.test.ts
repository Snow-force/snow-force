// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/images/variant-runtime", () => ({ publicVariants: { get } }));
import { GET } from "./route";
const src = "https://media.example.test/storage/v1/object/public/recap-media/day/photo.jpg";
function request(source = src, width = "640", headers?: HeadersInit) {
  return new Request(`https://site.test/api/media/image?${new URLSearchParams({ src: source, w: width, v: "v1" })}`, { headers });
}
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("public preview endpoint", () => {
  it("returns immutable WebP with an ETag and conditional 304", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
    get.mockResolvedValue({ data: Buffer.from("webp-preview"), cache: "storage" });
    const first = await GET(request());
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toContain("immutable");
    expect(first.headers.get("content-type")).toBe("image/webp");
    const second = await GET(request(src, "640", { "If-None-Match": first.headers.get("etag")! }));
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });
  it("rejects unknown hosts, signed URLs, private buckets and arbitrary sizes before any I/O", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
    for (const input of [request(src.replace("media.example.test", "127.0.0.1")), request(`${src}?token=secret`), request(src.replace("recap-media", "waivers")), request(src, "99999")]) expect((await GET(input)).status).toBe(400);
    expect((await GET(new Request(`https://site.test/api/media/image?${new URLSearchParams({ src, w: "640", v: "unknown" })}`))).status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });
  it("does not cache or disclose provider errors", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
    get.mockRejectedValue(new Error("private storage credential detail"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("private");
  });
});
