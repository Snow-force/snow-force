import { z } from "zod";

const localized = z.object({ en: z.string().trim().min(1).max(2000), zh: z.string().trim().min(1).max(2000) });
export const draftManifestSchema = z.array(z.object({
  handle: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  brand: z.string().trim().min(1).max(80), category: z.enum(["outerwear", "kids", "goggles", "accessories"]),
  name: localized, description: localized,
  image: z.string().url().refine((value) => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }, "Use a public HTTPS image URL"),
  candidate_colors: z.array(localized).max(40), candidate_sizes: z.array(z.string().min(1).max(80)).max(40),
  source: z.object({ file: z.string().min(1).max(255), page: z.number().int().positive() }),
}).strict()).min(1).max(100).superRefine((products, ctx) => {
  if (new Set(products.map((product) => product.handle)).size !== products.length) ctx.addIssue({ code: "custom", message: "Duplicate product handles" });
});
export type DraftManifestProduct = z.infer<typeof draftManifestSchema>[number];

export function draftProductInput(product: DraftManifestProduct, shippingProfileId: string) {
  return {
    title: product.name.en, handle: product.handle, description: product.description.en,
    status: "draft" as const, thumbnail: product.image, images: [{ url: product.image }],
    shipping_profile_id: shippingProfileId,
    // Options describe catalog candidates. No price, inventory, or saleable variant is inferred.
    options: [{ title: "Color", values: product.candidate_colors.length ? product.candidate_colors.map((color) => color.en) : ["To confirm"] }],
    variants: [],
    metadata: {
      snowforce_name: product.name, snowforce_description: product.description,
      snowforce_brand: product.brand, snowforce_category: product.category,
      snowforce_candidate_colors: product.candidate_colors, snowforce_candidate_sizes: product.candidate_sizes,
      snowforce_catalog_source: product.source, snowforce_review_required: true,
    },
  };
}

export async function importDraftManifest(products: DraftManifestProduct[], dependencies: {
  find: (handle: string) => Promise<boolean>;
  create: (product: DraftManifestProduct) => Promise<void>;
}) {
  const result = { created: 0, skipped: 0 };
  for (const product of products) {
    if (await dependencies.find(product.handle)) { result.skipped++; continue; }
    await dependencies.create(product);
    result.created++;
  }
  return result;
}
