// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createVariantService, variantPath, type VariantStore } from "./variant-service";
import { MEDIA_WIDTHS, MEDIA_MAX_SOURCE_BYTES, publicMediaSource } from "./delivery-policy";
const source = publicMediaSource("https://media.example.test/storage/v1/object/public/recap-media/day/photo.jpg", "https://media.example.test")!;
function fixture() {
  const files = new Map<string, Buffer>();
  const store: VariantStore = {
    read: vi.fn(async (bucket, path) => files.get(`${bucket}/${path}`) ?? null),
    write: vi.fn(async (bucket, path, data) => { files.set(`${bucket}/${path}`, data); }),
    original: vi.fn(async () => Buffer.alloc(7_000_000)),
    resize: vi.fn(async (_data, width) => Buffer.alloc(width * 30, 1)),
  };
  return { files, store };
}
describe("durable public image previews", () => {
  it("coalesces different display sizes into one original download and persists every size", async () => {
    const { store, files } = fixture();
    const service = createVariantService(store);
    const results = await Promise.all(MEDIA_WIDTHS.map((width) => service.get(source, width)));
    expect(store.original).toHaveBeenCalledTimes(1);
    expect(store.resize).toHaveBeenCalledTimes(4);
    expect(files.size).toBe(4);
    expect(results.map((r) => r.data.length)).toEqual(MEDIA_WIDTHS.map((width) => width * 30));
    expect(results.some((r) => r.cache === "coalesced")).toBe(true);
    expect((await service.get(source, 640)).cache).toBe("memory");
    expect(store.original).toHaveBeenCalledTimes(1);
  });
  it("survives a process restart without downloading or decoding the original again", async () => {
    const { store } = fixture();
    await createVariantService(store).get(source, 320);
    const restarted = createVariantService(store);
    expect((await restarted.get(source, 1920)).cache).toBe("storage");
    expect(store.original).toHaveBeenCalledTimes(1);
    expect(store.resize).toHaveBeenCalledTimes(4);
  });
  it.each([16 * 1024 * 1024, 0])("does not regenerate when a stale missing-object read resolves late (memory budget %i)", async (budget) => {
    const { store, files } = fixture();
    const read = store.read;
    let finishLateRead: ((value: Buffer | null) => void) | undefined;
    let held = false;
    store.read = vi.fn(async (bucket, path) => {
      if (path.endsWith("/1920.webp") && !held && !files.has(`${bucket}/${path}`)) {
        held = true;
        return new Promise<Buffer | null>((resolve) => { finishLateRead = resolve; });
      }
      return read(bucket, path);
    });
    const service = createVariantService(store, budget);
    const first = service.get(source, 320);
    const delayed = service.get(source, 1920);
    await first;
    finishLateRead?.(null);
    await delayed;
    expect(store.original).toHaveBeenCalledTimes(1);
    expect(store.resize).toHaveBeenCalledTimes(4);
  });
  it("uses a new preview key when a replacement photo has a new immutable name", () => {
    const replacement = { ...source, url: source.url.replace("photo.jpg", "replacement.jpg") };
    expect(variantPath(source, 640)).not.toBe(variantPath(replacement, 640));
  });
  it("recovers a missing width when another width survived a partial earlier generation", async () => {
    const { store, files } = fixture();
    files.set(`${source.bucket}/${variantPath(source, 320)}`, Buffer.from("stored-small-preview"));
    const service = createVariantService(store);
    const results = await Promise.all([service.get(source, 320), service.get(source, 1920)]);
    expect(results[0].data.toString()).toBe("stored-small-preview");
    expect(results[1].data.length).toBe(1920 * 30);
    expect(store.original).toHaveBeenCalledTimes(1);
  });
  it("bounds memory and reads evicted previews from durable storage", async () => {
    const { store } = fixture();
    const service = createVariantService(store, 10);
    expect((await service.get(source, 640)).data.length).toBe(640 * 30);
    expect((await service.get(source, 640)).cache).toBe("storage");
    expect(store.original).toHaveBeenCalledTimes(1);
  });
  it("fails closed on unavailable storage and backs off failed generation", async () => {
    const { store } = fixture();
    vi.mocked(store.write).mockRejectedValue(new Error("restricted"));
    const service = createVariantService(store);
    await expect(service.get(source, 640)).rejects.toThrow("restricted");
    await expect(service.get(source, 640)).rejects.toThrow("temporarily unavailable");
    expect(store.original).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized sources and variants", async () => {
    const { store } = fixture();
    vi.mocked(store.original).mockResolvedValue(Buffer.alloc(MEDIA_MAX_SOURCE_BYTES + 1));
    await expect(createVariantService(store).get(source, 640)).rejects.toThrow("Invalid source size");
    vi.mocked(store.original).mockResolvedValue(Buffer.alloc(1));
    vi.mocked(store.resize).mockResolvedValue(Buffer.alloc(400 * 1024));
    await expect(createVariantService(store).get(source, 640)).rejects.toThrow("Invalid preview size");
    expect(store.write).not.toHaveBeenCalled();
  });
});
