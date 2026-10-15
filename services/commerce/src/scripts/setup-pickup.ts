import type { ExecArgs, IFulfillmentModuleService, IStoreModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createLocationFulfillmentSetWorkflow, createServiceZonesWorkflow, createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import { z } from "zod";
import { uniqueSetupRecord } from "../lib/fulfillment-setup";
import { pickupShippingPolicy, snowforcePickupCode, snowforceShippingCode, snowforceShippingProviderId } from "../lib/shipping-policy";
import { persistPickupOption, readPickupOffer } from "../lib/local-pickup";
import { configureSnowforceShippingWorkflow } from "../workflows/update-shipping-policy";

/** Adds appointment pickup at the existing reviewed warehouse. It does not
 * change delivery options, catalog prices, inventory or operating-mode flags. */
export default async function setupPickup({ container }: ExecArgs) {
  const store = uniqueSetupRecord(await container.resolve<IStoreModuleService>(Modules.STORE).listStores({}, { take: 2 }), "store");
  const locationId = z.string().regex(/^sloc_[A-Za-z0-9]+$/).parse(store?.metadata?.snowforce_fulfillment_location_id);
  if (!store || store.default_location_id !== locationId) throw new Error("Review the default fulfillment warehouse before enabling pickup.");
  if (store.metadata?.snowforce_pickup_option_id) {
    await readPickupOffer(container);
    console.log("Existing reviewed pickup option preserved.");
    return;
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  async function readLocation() {
    const { data } = await query.graph({ entity: "stock_location", filters: { id: locationId }, fields: ["id", "address.*", "fulfillment_sets.id", "fulfillment_sets.name", "fulfillment_sets.type", "fulfillment_providers.id", "sales_channels.id"] });
    return z.object({ id: z.literal(locationId), address: z.object({ country_code: z.literal("us"), province: z.literal("ca"), address_1: z.string().min(1), city: z.string().min(1), postal_code: z.string().regex(/^\d{5}(?:-\d{4})?$/) }), fulfillment_sets: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })), fulfillment_providers: z.array(z.object({ id: z.string() })), sales_channels: z.array(z.object({ id: z.string() })) }).parse(data[0]);
  }
  let location = await readLocation();
  if (!location.fulfillment_providers.some(provider => provider.id === snowforceShippingProviderId) || !location.sales_channels.some(channel => channel.id === store.default_sales_channel_id)) throw new Error("Review warehouse provider and sales-channel links.");
  const setName = "SnowForce appointment pickup";
  let set = uniqueSetupRecord(location.fulfillment_sets.filter(value => value.name === setName && value.type === "pickup"), "pickup set");
  if (!set) {
    await createLocationFulfillmentSetWorkflow(container).run({ input: { location_id: locationId, fulfillment_set_data: { name: setName, type: "pickup" } } });
    location = await readLocation();
    set = uniqueSetupRecord(location.fulfillment_sets.filter(value => value.name === setName && value.type === "pickup"), "pickup set");
  }
  if (!set) throw new Error("Pickup set was not linked to the warehouse.");
  const fulfillment = container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT);
  let zone = uniqueSetupRecord(await fulfillment.listServiceZones({ fulfillment_set: { id: set.id }, name: setName }, { relations: ["geo_zones"] }), "pickup zone");
  if (!zone) {
    const { result } = await createServiceZonesWorkflow(container).run({ input: { data: [{ name: setName, fulfillment_set_id: set.id, geo_zones: [{ type: "country", country_code: "us" }] }] } });
    zone = result[0];
  }
  if (!zone || zone.geo_zones.length !== 1 || zone.geo_zones[0].type !== "country" || zone.geo_zones[0].country_code !== "us") throw new Error("Review pickup service-zone coverage.");
  let option = uniqueSetupRecord((await fulfillment.listShippingOptions({ service_zone: { id: zone.id } }, { relations: ["type"] })).filter(value => value.type?.code === snowforcePickupCode), "pickup option");
  if (option && (option.provider_id !== snowforceShippingProviderId || option.price_type !== "calculated")) throw new Error("Review existing pickup configuration before changing it.");
  if (!option) {
    const shippingZoneId = z.string().parse(store.metadata?.snowforce_service_zone_id);
    const delivery = uniqueSetupRecord((await fulfillment.listShippingOptions({ service_zone: { id: shippingZoneId } }, { relations: ["type"] })).filter(value => value.type?.code === snowforceShippingCode), "reviewed delivery option");
    if (!delivery || delivery.provider_id !== snowforceShippingProviderId) throw new Error("Configure the reviewed delivery option first.");
    const profile = await fulfillment.retrieveShippingProfile(delivery.shipping_profile_id);
    if (profile.type !== "default") throw new Error("Review the shared delivery and pickup shipping profile.");
    const { result } = await createShippingOptionsWorkflow(container).run({ input: [{ name: "Appointment pickup — free", service_zone_id: zone.id, shipping_profile_id: profile.id, provider_id: snowforceShippingProviderId, price_type: "calculated", data: { id: snowforcePickupCode }, type: { label: "Pickup", description: "Contact SnowForce to arrange pickup before paying", code: snowforcePickupCode }, rules: [{ attribute: "enabled_in_store", operator: "eq", value: "true" }, { attribute: "is_return", operator: "eq", value: "false" }] }] });
    option = result[0];
  }
  if (!option) throw new Error("Pickup option was not created.");
  await configureSnowforceShippingWorkflow(container).run({ input: { id: option.id, code: snowforcePickupCode, policy: pickupShippingPolicy, data: option.data } });
  await persistPickupOption(container.resolve(ContainerRegistrationKeys.PG_CONNECTION), { storeId: store.id, locationId, serviceZoneId: z.string().parse(store.metadata?.snowforce_service_zone_id), optionId: option.id });
  await readPickupOffer(container);
  console.log("Free appointment pickup configured at the existing reviewed warehouse.");
}
