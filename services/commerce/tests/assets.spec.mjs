import { test } from "node:test";
import assert from "node:assert/strict";
import { uploadDraftAssets } from "../scripts/upload-draft-assets.mjs";

function fixture(options = {}) {
  const writes = [];
  const bucket = {
    list: async () => ({ data: [{ name: "existing.webp" }], error: null }),
    upload: async (path, bytes, settings) => { writes.push({ path, bytes, settings }); return { error: options.uploadError || null }; },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://fixture.supabase.co/storage/v1/object/public/shop-products/${path}` } }),
  };
  const storage = { listBuckets: async () => ({ data: [{ id: "shop-products", public: !options.privateBucket }], error: null }), createBucket: () => assert.fail("existing bucket must be preserved"), from: (name) => { assert.equal(name, "shop-products"); return bucket; } };
  return { writes, storage };
}

test("uploads only missing product photos and returns persistent HTTPS paths", async () => {
  const { storage, writes } = fixture();
  const result = await uploadDraftAssets([{ handle: "existing" }, { handle: "new-product" }], storage, async () => Buffer.from("fixture"));
  assert.equal(result.uploaded, 1);
  assert.equal(result.preserved, 1);
  assert.equal(writes[0].path, "drafts/new-product.webp");
  assert.equal(writes[0].settings.upsert, false);
  assert.ok(result.images.get("existing").endsWith("/drafts/existing.webp"));
});

test("does not publish a private bucket or count failed uploads as prepared images", async () => {
  for (const options of [{ privateBucket: true }, { uploadError: { message: "fixture failure" } }]) {
    const { storage } = fixture(options);
    await assert.rejects(uploadDraftAssets([{ handle: "new-product" }], storage, async () => Buffer.from("fixture")));
  }
});
