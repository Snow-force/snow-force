import { readFile } from "node:fs/promises";
import type { ExecArgs, IFulfillmentModuleService, IStockLocationService, IStoreModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { batchLinksWorkflow, createLocationFulfillmentSetWorkflow, createServiceZonesWorkflow, createStockLocationsWorkflow, linkSalesChannelsToStockLocationWorkflow, updateStoresWorkflow } from "@medusajs/medusa/core-flows";
import { z } from "zod";
import { fulfillmentManifestSchema, initialGeoZones, uniqueSetupRecord } from "../lib/fulfillment-setup";
import setupShipping from "./setup-shipping";

export default async function setupFulfillment(args: ExecArgs) {
  const { container } = args;
  const storeModule = container.resolve<IStoreModuleService>(Modules.STORE);
  const store = uniqueSetupRecord(await storeModule.listStores({}, { take: 2 }), "store");
  if (!store?.default_sales_channel_id) throw new Error("Initialize the native default sales channel first.");
  if (store.metadata?.snowforce_fulfillment_initialized === true) {
    console.log("Existing warehouse, returns address, coverage and pricing preserved. Edit them in Admin.");
    return;
  }
  if (!process.env.SNOWFORCE_FULFILLMENT_MANIFEST) throw new Error("Set SNOWFORCE_FULFILLMENT_MANIFEST to the reviewed warehouse and coverage JSON file.");
  const manifest = fulfillmentManifestSchema.parse(JSON.parse(await readFile(process.env.SNOWFORCE_FULFILLMENT_MANIFEST, "utf8")));
  const locationModule = container.resolve<IStockLocationService>(Modules.STOCK_LOCATION);
  const fulfillment = container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: providerData } = await query.graph({ entity: "fulfillment_provider", fields: ["id", "is_enabled"], filters: { id: "manual_manual" } });
  const provider = z.object({ id: z.literal("manual_manual"), is_enabled: z.literal(true) }).parse(providerData[0]);

  let location = uniqueSetupRecord(await locationModule.listStockLocations({ name: manifest.location_name }, { relations: ["address"] }), "warehouse");
  if (location) {
    // Only resume this initializer's partial run; never adopt an unrelated operator location.
    if (location.metadata?.snowforce_fulfillment_seed !== true || Object.entries(manifest.address).some(([key, value]) => location?.address?.[key as keyof typeof manifest.address] !== value)) throw new Error("An existing warehouse differs from the reviewed initialization. Inspect it in Admin.");
  } else {
    const { result } = await createStockLocationsWorkflow(container).run({ input: { locations: [{ name: manifest.location_name, address: manifest.address, metadata: { snowforce_fulfillment_seed: true } }] } });
    location = result[0];
  }
  if (!location) throw new Error("Warehouse creation did not return a location.");
  const linksSchema = z.object({ fulfillment_sets: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })), fulfillment_providers: z.array(z.object({ id: z.string() })), sales_channels: z.array(z.object({ id: z.string() })) });
  async function locationLinks() {
    const { data } = await query.graph({ entity: "stock_location", fields: ["id", "fulfillment_sets.id", "fulfillment_sets.name", "fulfillment_sets.type", "fulfillment_providers.id", "sales_channels.id"], filters: { id: location!.id } });
    return linksSchema.parse(data[0]);
  }
  let links = await locationLinks();
  const setName = "SnowForce contiguous US shipping";
  let set = uniqueSetupRecord(links.fulfillment_sets.filter((value) => value.name === setName && value.type === "shipping"), "shipping fulfillment set");
  if (!set) {
    await createLocationFulfillmentSetWorkflow(container).run({ input: { location_id: location.id, fulfillment_set_data: { name: setName, type: "shipping" } } });
    links = await locationLinks();
    set = uniqueSetupRecord(links.fulfillment_sets.filter((value) => value.name === setName && value.type === "shipping"), "shipping fulfillment set");
  }
  if (!set) throw new Error("The fulfillment set was not linked to the warehouse.");
  const zoneName = "48 states + DC";
  let zone = uniqueSetupRecord(await fulfillment.listServiceZones({ fulfillment_set: { id: set.id }, name: zoneName }, { relations: ["geo_zones"] }), "service zone");
  const geoZones = initialGeoZones(manifest);
  if (!zone) {
    const { result } = await createServiceZonesWorkflow(container).run({ input: { data: [{ name: zoneName, fulfillment_set_id: set.id, geo_zones: geoZones }] } });
    zone = result[0];
  }
  if (!zone || zone.geo_zones.length !== 49 || new Set(zone.geo_zones.map((area) => area.province_code)).size !== 49 || zone.geo_zones.some((area) => area.type !== "province" || area.country_code !== "us" || !geoZones.some((expected) => expected.province_code === area.province_code))) throw new Error("Review existing service-zone coverage before initializing shipping.");
  if (!links.fulfillment_providers.some((value) => value.id === provider.id)) await batchLinksWorkflow(container).run({ input: { create: [{ [Modules.STOCK_LOCATION]: { stock_location_id: location.id }, [Modules.FULFILLMENT]: { fulfillment_provider_id: provider.id } }] } });
  if (!links.sales_channels.some((value) => value.id === store.default_sales_channel_id)) await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id: location.id, add: [store.default_sales_channel_id] } });

  // Store only native IDs. Runtime addresses, coverage and prices remain editable database records.
  const metadata = { ...store.metadata, snowforce_fulfillment_location_id: location.id, snowforce_returns_location_id: location.id, snowforce_service_zone_id: zone.id };
  await updateStoresWorkflow(container).run({ input: { selector: { id: store.id }, update: { metadata, ...(!store.default_location_id ? { default_location_id: location.id } : {}) } } });
  await setupShipping(args);
  await updateStoresWorkflow(container).run({ input: { selector: { id: store.id }, update: { metadata: { ...metadata, snowforce_fulfillment_initialized: true } } } });
  console.log("Warehouse, shared returns address, 48-state + DC coverage, manual fulfillment and USD shipping pricing saved. Products remain drafts; checkout tax gate remains unchanged.");
}
