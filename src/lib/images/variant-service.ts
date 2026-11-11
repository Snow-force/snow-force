import { createHash } from "node:crypto";
import { MEDIA_WIDTHS, MEDIA_MAX_SOURCE_BYTES, MEDIA_MAX_VARIANT_BYTES, MEDIA_VERSION, type MediaWidth, type publicMediaSource } from "./delivery-policy";

type Source = NonNullable<ReturnType<typeof publicMediaSource>>;
export type VariantStore = {
  read(bucket: string, path: string): Promise<Buffer | null>;
  write(bucket: string, path: string, data: Buffer): Promise<void>;
  original(url: string): Promise<Buffer>;
  resize(data: Buffer, width: MediaWidth): Promise<Buffer>;
};

export function variantPath(source: Source, width: MediaWidth) {
  const hash = createHash("sha256").update(source.url).digest("hex");
  return `_web/${MEDIA_VERSION}/${hash}/${width}.webp`;
}

/** Storage is durable; this small LRU only avoids extra storage reads within a process. */
export function createVariantService(store: VariantStore, memoryBudget = 16 * 1024 * 1024) {
  const memory = new Map<string, Buffer>();
  const inFlight = new Map<string, Promise<boolean>>();
  const failures = new Map<string, number>();
  let memoryBytes = 0;
  function remember(key: string, data: Buffer) {
    if (!data.length || data.length > MEDIA_MAX_VARIANT_BYTES) throw new Error("Invalid preview size");
    const previous = memory.get(key);
    if (previous) memoryBytes -= previous.length;
    memory.delete(key);
    memory.set(key, data);
    memoryBytes += data.length;
    while (memoryBytes > memoryBudget && memory.size) {
      const oldest = memory.keys().next().value;
      if (oldest === undefined) break;
      memoryBytes -= memory.get(oldest)!.length;
      memory.delete(oldest);
    }
  }
  // Serialize generation so a burst of misses cannot start unbounded image decodes.
  let generationTail: Promise<void> = Promise.resolve();
  let queuedGenerations = 0;
  async function generate(source: Source) {
    const input = await store.original(source.url);
    if (!input.length || input.length > MEDIA_MAX_SOURCE_BYTES) throw new Error("Invalid source size");
    for (const width of MEDIA_WIDTHS) {
      const data = await store.resize(input, width);
      if (!data.length || data.length > MEDIA_MAX_VARIANT_BYTES) throw new Error("Invalid preview size");
      const path = variantPath(source, width);
      await store.write(source.bucket, path, data);
      remember(`${source.bucket}/${path}`, data);
    }
  }
  async function get(source: Source, width: MediaWidth): Promise<{ data: Buffer; cache: string }> {
    const path = variantPath(source, width);
    const key = `${source.bucket}/${path}`;
    const cached = memory.get(key);
    if (cached) {
      memory.delete(key); memory.set(key, cached);
      return { data: cached, cache: "memory" };
    }
    if ((failures.get(source.url) ?? 0) > Date.now()) throw new Error("Preview temporarily unavailable");
    let work = inFlight.get(source.url);
    const joined = Boolean(work);
    if (!work) {
      // Include lookup in the shared job: a delayed cache miss cannot regenerate.
      if (inFlight.size >= 128) throw new Error("Preview lookup busy");
      work = (async () => {
        const stored = await store.read(source.bucket, path);
        if (stored) { remember(key, stored); return false; }
        if (queuedGenerations >= 12) throw new Error("Preview generation busy");
        queuedGenerations++;
        const generation = generationTail.then(() => generate(source));
        generationTail = generation.catch(() => undefined);
        try { await generation; return true; }
        finally { queuedGenerations--; }
      })().finally(() => { inFlight.delete(source.url); });
      inFlight.set(source.url, work);
    }
    try {
      const generated = await work;
      const data = memory.get(key) ?? await store.read(source.bucket, path);
      // A joined lookup may have found a different width from a partial earlier job.
      if (!data) { if (!generated) return get(source, width); throw new Error("Preview not persisted"); }
      return { data, cache: generated ? joined ? "coalesced" : "generated" : "storage" };
    } catch (error) {
      failures.set(source.url, Date.now() + 30_000);
      // Failed requests are bounded just like successful cached objects.
      if (failures.size > 100) failures.delete(failures.keys().next().value!);
      throw error;
    }
  }
  return { get };
}
