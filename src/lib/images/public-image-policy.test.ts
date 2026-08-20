import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PUBLIC_IMAGE_CACHE_CONTROL,
  PUBLIC_IMAGE_SOURCE_MAX_BYTES,
  PUBLIC_IMAGE_UPLOAD_MAX_BYTES,
} from "./public-image-policy";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260820023355_tighten_public_image_upload_limits.sql",
);

describe("public image policy", () => {
  it("limits stored images to 2 MB and source images to 50 MB", () => {
    expect(PUBLIC_IMAGE_UPLOAD_MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(PUBLIC_IMAGE_SOURCE_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(PUBLIC_IMAGE_CACHE_CONTROL).toBe("31536000");
  });

  it("keeps the storage bucket limits aligned with the application", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("file_size_limit = 2097152");
    expect(sql).toContain("where id in ('event-covers', 'recap-media')");
    expect(sql).toContain("'image/jpeg', 'image/png', 'image/webp', 'image/gif'");
    expect(sql).toContain("Public image bucket upload policy was not applied to both buckets");
  });

  it("keeps Next image optimization cached for one year", async () => {
    const config = await readFile(path.join(process.cwd(), "next.config.js"), "utf8");

    expect(config).toContain("minimumCacheTTL: 31536000");
  });
});
