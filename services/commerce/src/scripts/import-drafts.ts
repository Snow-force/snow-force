import { readFile } from "node:fs/promises";
import type { ExecArgs, IProductModuleService, IFulfillmentModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createProductsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows";
import { draftManifestSchema, draftProductInput, importDraftManifest } from "../lib/draft-manifest";

export default async function importDrafts({ container }: ExecArgs) {
  if (!process.env.SNOWFORCE_DRAFT_MANIFEST) throw new Error("Set SNOWFORCE_DRAFT_MANIFEST to the reviewed draft manifest path.");
  const manifest = draftManifestSchema.parse(JSON.parse(await readFile(process.env.SNOWFORCE_DRAFT_MANIFEST, "utf8")));
  const productModule = container.resolve<IProductModuleService>(Modules.PRODUCT);
  const fulfillment = container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT);
  const existingProfiles = await fulfillment.listShippingProfiles({ type: "default" });
  let profile = existingProfiles[0];
  if (!profile) {
    const { result } = await createShippingProfilesWorkflow(container).run({ input: { data: [{ name: "SnowForce gear", type: "default" }] } });
    profile = result[0];
  }
  if (!profile) throw new Error("Shipping profile was not created.");
  const imported = await importDraftManifest(manifest, {
    find: async (handle) => (await productModule.listProducts({ handle }, { take: 1 })).length > 0,
    create: async (product) => {
      await createProductsWorkflow(container).run({ input: { products: [draftProductInput(product, profile.id)] } });
    },
  });
  console.log(`Draft import: ${imported.created} created, ${imported.skipped} preserved. No variants, prices, or stock were invented.`);
}
