import "server-only";
import { encodePreview } from "./encode-preview";
import { createAdminClient } from "@/lib/supabase/server";
import { MEDIA_MAX_SOURCE_BYTES, MEDIA_MAX_VARIANT_BYTES } from "./delivery-policy";
import { createVariantService } from "./variant-service";

async function imageBytes(url: string, max: number): Promise<Buffer | null> {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (response.status === 404) { await response.body?.cancel(); return null; }
  // Storage's REST API reports missing objects as HTTP 400 with a 404 JSON code.
  if (response.status === 400 && response.headers.get("content-type")?.startsWith("application/json")) {
    const detail: unknown = JSON.parse((await responseBytes(response, 4096)).toString("utf8"));
    if (detail && typeof detail === "object" && "statusCode" in detail && String(detail.statusCode) === "404" && (("code" in detail && detail.code === "NoSuchKey") || ("error" in detail && detail.error === "not_found"))) return null;
    throw new Error("Image service unavailable");
  }
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) { await response.body?.cancel(); throw new Error("Image service unavailable"); }
  return responseBytes(response, max);
}

async function responseBytes(response: Response, max: number): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > max) { await response.body?.cancel(); throw new Error("Image too large"); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Image unavailable");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > max) throw new Error("Image too large");
      chunks.push(result.value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}

export const publicVariants = createVariantService({
  async read(bucket, path) {
    const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
    return imageBytes(`${origin}/storage/v1/object/public/${bucket}/${path}`, MEDIA_MAX_VARIANT_BYTES);
  },
  async original(url) {
    const data = await imageBytes(url, MEDIA_MAX_SOURCE_BYTES);
    if (!data) throw new Error("Source not found");
    return data;
  },
  async write(bucket, path, data) {
    const { error } = await createAdminClient().storage.from(bucket).upload(path, data, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
    if (error && !/already exists|duplicate/i.test(error.message)) throw new Error("Preview storage unavailable");
  },
  resize: encodePreview,
});
