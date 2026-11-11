import sharp from "sharp";
import { MEDIA_MAX_VARIANT_BYTES, type MediaWidth } from "./delivery-policy";

export async function encodePreview(input: Buffer, width: MediaWidth) {
  const metadata = await sharp(input, { limitInputPixels: 60_000_000, animated: false }).metadata();
  if (!metadata.format || !["jpeg", "png", "webp", "gif"].includes(metadata.format)) throw new Error("Unsupported photo format");
  // Keep originals untouched. Each preview has a bounded long edge and byte budget.
  for (const scale of [1, 0.75, 0.5]) {
    for (const quality of [72, 58, 42]) {
      const edge = Math.round(width * scale);
      const data = await sharp(input, { limitInputPixels: 60_000_000, animated: false }).rotate().resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true }).webp({ quality, effort: 4 }).toBuffer();
      if (data.length <= MEDIA_MAX_VARIANT_BYTES) return data;
    }
  }
  throw new Error("Preview exceeds byte budget");
}
