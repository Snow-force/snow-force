import { createRequire } from "node:module";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
require("ts-node").register({ transpileOnly: true, project: resolve("tsconfig.json") });
const { products } = require("../../../src/lib/shop/catalog.ts");
const { draftManifestSchema } = require("../src/lib/draft-manifest.ts");
const manifest = draftManifestSchema.parse(products.map((product) => ({
  handle: product.slug, brand: product.brand, category: product.category, name: product.name, description: product.description,
  image: `https://snow-force.com/shop/${product.slug}.webp`,
  candidate_colors: product.colors, candidate_sizes: product.sizes, source: product.source,
})));
// This is a reviewed import artifact, not an operational product data source.
await writeFile("draft-products.json", JSON.stringify(manifest, null, 2) + "\n", { encoding: "utf8" });
console.log(`Exported ${manifest.length} draft descriptions. Prices and stock are intentionally absent.`);
