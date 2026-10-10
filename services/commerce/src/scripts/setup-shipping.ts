import type { ExecArgs, IFulfillmentModuleService, IStoreModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { batchLinksWorkflow, createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import { z } from "zod";
import { initialShippingPolicy, readShippingPolicy, snowforceShippingCode, snowforceShippingProviderId } from "../lib/shipping-policy";
import { uniqueSetupRecord } from "../lib/fulfillment-setup";
import { configureSnowforceShippingWorkflow } from "../workflows/update-shipping-policy";
import { shippingStoreRuleUpdates } from "../lib/shipping-store-rules";

export default async function setupShipping({ container }: ExecArgs) {
  const [store] = await container.resolve<IStoreModuleService>(Modules.STORE).listStores({}, { take: 1 });
  const serviceZoneId = process.env.SNOWFORCE_SERVICE_ZONE_ID || store?.metadata?.snowforce_service_zone_id;
  if (typeof serviceZoneId !== "string") throw new Error("Configure a reviewed US service zone first.");
  if (!serviceZoneId) throw new Error("Configure a real US stock location and service zone in Medusa, then set SNOWFORCE_SERVICE_ZONE_ID.");
  const fulfillment = container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT);
  const zone = await fulfillment.retrieveServiceZone(serviceZoneId, { relations: ["geo_zones"] });
  if (!zone.geo_zones.length || zone.geo_zones.some((area) => area.type !== "province" || area.country_code !== "us" || !area.province_code || ["ak", "hi"].includes(area.province_code.toLowerCase()))) throw new Error("Initial shipping excludes Alaska and Hawaii and requires reviewed US state zones.");
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const locationId = z.string().regex(/^sloc_[a-zA-Z0-9]+$/).parse(store?.metadata?.snowforce_fulfillment_location_id);
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id", "fulfillment_providers.id"], filters: { id: locationId } });
  const location = z.object({ id: z.literal(locationId), fulfillment_providers: z.array(z.object({ id: z.string() })) }).parse(locations[0]);
  if (!location.fulfillment_providers.some((value) => value.id === snowforceShippingProviderId)) await batchLinksWorkflow(container).run({ input: { create: [{ [Modules.STOCK_LOCATION]: { stock_location_id: locationId }, [Modules.FULFILLMENT]: { fulfillment_provider_id: snowforceShippingProviderId } }] } });
  const existing = uniqueSetupRecord((await fulfillment.listShippingOptions({ service_zone: { id: serviceZoneId } }, { relations: ["type", "rules"] })).filter((option) => option.type?.code === snowforceShippingCode), "SnowForce shipping option");
  if (existing) {
    const ruleUpdates = shippingStoreRuleUpdates(existing.rules);
    if (ruleUpdates.length) await fulfillment.updateShippingOptionRules(ruleUpdates);
    if (existing.provider_id === snowforceShippingProviderId && existing.price_type === "calculated" && existing.data?.snowforce_option_id === existing.id) { console.log("Existing database shipping policy preserved."); return; }
    if (existing.provider_id !== "manual_manual" || existing.price_type !== "flat") throw new Error("Review operator shipping changes before upgrading the calculation method.");
    const { data } = await query.graph({ entity: "shipping_option", fields: ["id", "prices.*", "prices.price_rules.*"], filters: { id: existing.id } });
    const policy = readShippingPolicy(z.object({ prices: z.array(z.unknown()) }).parse(data[0]).prices);
    await configureSnowforceShippingWorkflow(container).run({ input: { id: existing.id, policy, data: existing.data } });
    console.log("Shipping calculation upgraded to exclude merchandise tax; database fee and threshold values preserved.");
    return;
  }
  const [profile] = await fulfillment.listShippingProfiles({ type: "default" });
  if (!profile) throw new Error("Import draft products to establish the shipping profile first.");
  const { result } = await createShippingOptionsWorkflow(container).run({ input: [{
    name: "SnowForce US standard", service_zone_id: serviceZoneId, shipping_profile_id: profile.id,
    provider_id: snowforceShippingProviderId, price_type: "calculated", data: { id: snowforceShippingCode },
    type: { label: "Standard", description: "US self fulfillment", code: snowforceShippingCode },
    rules: [{ attribute: "enabled_in_store", operator: "eq", value: "true" }, { attribute: "is_return", operator: "eq", value: "false" }],
  }] });
  const option = result[0];
  if (!option) throw new Error("Shipping option creation did not return a record.");
  await configureSnowforceShippingWorkflow(container).run({ input: { id: option.id, policy: initialShippingPolicy } });
  console.log("Initial USD shipping policy saved to Medusa pricing. Manage future changes in SnowForce shipping settings.");
}
