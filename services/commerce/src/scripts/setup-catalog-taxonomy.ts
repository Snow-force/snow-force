import type { ExecArgs, IProductModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { batchLinkProductsToCategoryWorkflow, createProductCategoriesWorkflow } from "@medusajs/medusa/core-flows";
import { initializeCatalogTaxonomy } from "../lib/catalog-taxonomy-setup";

export default async function setupCatalogTaxonomy({ container }: ExecArgs) {
  const module = container.resolve<IProductModuleService>(Modules.PRODUCT);
  const result = await initializeCatalogTaxonomy({
    categories: async () => {
      const all = [];
      for (let skip = 0; ; skip += 100) {
        const rows = await module.listProductCategories({}, { skip, take: 100 });
        all.push(...rows.map(row => ({ id: row.id, handle: row.handle, parent_category_id: row.parent_category_id ?? null, is_active: row.is_active, is_internal: row.is_internal })));
        if (rows.length < 100) return all;
        if (skip >= 9900) throw new Error("Review catalog size before migration.");
      }
    },
    create: async input => {
      const { result } = await createProductCategoriesWorkflow(container).run({ input: { product_categories: [input] } });
      const row = result[0];
      return { id: row.id, handle: row.handle, parent_category_id: row.parent_category_id ?? null, is_active: row.is_active, is_internal: row.is_internal };
    },
    products: async () => {
      const all = [];
      for (let skip = 0; ; skip += 100) {
        const rows = await module.listProducts({}, { skip, take: 100, relations: ["categories"] });
        all.push(...rows.map(row => ({ id: row.id, metadata: row.metadata ?? null, categoryIds: row.categories?.map(category => category.id) ?? [] })));
        if (rows.length < 100) return all;
        if (skip >= 9900) throw new Error("Review catalog size before migration.");
      }
    },
    // Native additive workflow preserves any category associations made while
    // the migration is running, and never changes commercial product fields.
    add: async (id, productId) => { await batchLinkProductsToCategoryWorkflow(container).run({ input: { id, add: [productId], remove: [] } }); },
  });
  console.log(`Catalog taxonomy: ${result.created} created, ${result.linked} legacy associations added, ${result.preserved} existing assignments preserved, ${result.unmapped} left for operator review.`);
}
