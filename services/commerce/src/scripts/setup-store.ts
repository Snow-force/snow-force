import type { ExecArgs, IStoreModuleService, IApiKeyModuleService, ISalesChannelModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { updateStoresWorkflow, linkSalesChannelsToApiKeyWorkflow } from "@medusajs/medusa/core-flows";
import { initialStoreUpdate } from "../lib/store-setup";

export default async function setupStore({ container }: ExecArgs) {
  const storeModule = container.resolve<IStoreModuleService>(Modules.STORE);
  const stores = await storeModule.listStores({}, { take: 2 });
  if (stores.length !== 1) throw new Error("Inspect the native store before initializing SnowForce settings.");
  const store = stores[0];
  const update = initialStoreUpdate(store);
  if (update) await updateStoresWorkflow(container).run({ input: { selector: { id: store.id }, update } });
  // A failed first native boot may leave a default publishable key without its
  // channel link. Repair only that default association; do not expose its token.
  const keys = await container.resolve<IApiKeyModuleService>(Modules.API_KEY).listApiKeys({ type: "publishable", title: "Default Publishable API Key" });
  const channels = await container.resolve<ISalesChannelModuleService>(Modules.SALES_CHANNEL).listSalesChannels({ id: store.default_sales_channel_id || "__missing__" });
  if (keys.length !== 1 || channels.length !== 1) throw new Error("Inspect the native default key and sales channel before linking them.");
  await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: keys[0].id, add: [channels[0].id] } });
  console.log(`Store: ${update ? "USD initialized" : "operator settings preserved"}; default channel access verified. No prices or products were published.`);
}
