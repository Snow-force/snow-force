import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const projectUrl = "https://bhmwxkynhyhquspiyact.supabase.co";
const bucketName = "shop-products";

export async function uploadDraftAssets(products, storage, readImage) {
  const { data: buckets, error: bucketError } = await storage.listBuckets();
  if (bucketError) throw new Error("Could not inspect product storage.");
  const existingBucket = buckets.find((bucket) => bucket.id === bucketName);
  if (existingBucket && !existingBucket.public) throw new Error("Existing private product bucket preserved; inspect it before continuing.");
  if (!existingBucket) {
    const { error } = await storage.createBucket(bucketName, { public: true, fileSizeLimit: 5_242_880, allowedMimeTypes: ["image/webp", "image/jpeg", "image/png"] });
    if (error) throw new Error("Could not create the public product-image bucket.");
  }
  const bucket = storage.from(bucketName);
  const { data: files, error: listError } = await bucket.list("drafts", { limit: 100 });
  if (listError) throw new Error("Could not inspect draft product images.");
  const existing = new Set(files.map((file) => file.name));
  const images = new Map();
  let uploaded = 0;
  for (const product of products) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.handle)) throw new Error("Invalid product image handle.");
    const name = `${product.handle}.webp`;
    const path = `drafts/${name}`;
    if (!existing.has(name)) {
      const { error } = await bucket.upload(path, await readImage(name), { contentType: "image/webp", cacheControl: "3600", upsert: false });
      if (error) throw new Error(`Could not upload product image ${product.handle}; existing images were preserved.`);
      uploaded++;
    }
    images.set(product.handle, bucket.getPublicUrl(path).data.publicUrl);
  }
  return { images, uploaded, preserved: products.length - uploaded };
}

async function run() {
  const rootEnv = resolve("../../.env.local");
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || process.env.NEXT_PUBLIC_SUPABASE_URL !== projectUrl) throw new Error("Use the protected configuration of the existing SnowForce project.");
  const require = createRequire(import.meta.url);
  require("ts-node/register/transpile-only");
  const { draftManifestSchema } = require("../src/lib/draft-manifest.ts");
  const manifest = draftManifestSchema.parse(JSON.parse(await readFile("draft-products.json", "utf8")));
  // Load all reviewed local images before any remote writes. No original catalog
  // pages are uploaded: these photos contain no CNY price sheet.
  const localImages = new Map();
  for (const product of manifest) localImages.set(`${product.handle}.webp`, await readFile(resolve("../../public/shop", `${product.handle}.webp`)));
  const client = createClient(projectUrl, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await uploadDraftAssets(manifest, client.storage, async (name) => localImages.get(name));
  const updated = draftManifestSchema.parse(manifest.map((product) => ({ ...product, image: result.images.get(product.handle) })));
  await writeFile("draft-products.json", JSON.stringify(updated, null, 2) + "\n");
  console.log(`Product images: ${result.uploaded} uploaded, ${result.preserved} preserved. Draft manifest updated; no product was published.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => { console.error(error instanceof Error ? error.message : "Product-image preparation failed."); process.exitCode = 1; });
}
