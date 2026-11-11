// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { encodePreview } from "./encode-preview";
import { MEDIA_WIDTHS, MEDIA_MAX_VARIANT_BYTES } from "./delivery-policy";

describe("bounded WebP previews", () => {
  it("encodes real photo data to all supported dimensions without enlarging or retaining metadata", async () => {
    const source = await readFile("public/team/group.jpg");
    for (const width of MEDIA_WIDTHS) {
      const data = await encodePreview(source, width);
      const metadata = await sharp(data).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBeLessThanOrEqual(width);
      expect(metadata.height).toBeLessThanOrEqual(width);
      expect(data.length).toBeLessThanOrEqual(MEDIA_MAX_VARIANT_BYTES);
      expect(metadata.exif).toBeUndefined();
    }
  });
  it("rejects SVG and invalid input rather than turning this into a generic renderer", async () => {
    await expect(encodePreview(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), 640)).rejects.toThrow("Unsupported photo format");
    await expect(encodePreview(Buffer.from("not an image"), 640)).rejects.toThrow();
  });
});
