import type { StoreDTO } from "@medusajs/framework/types";

export function initialStoreUpdate(store: Pick<StoreDTO, "metadata">) {
  if (store.metadata?.snowforce_initialized === true) return null;
  return {
    name: "SnowForce",
    supported_currencies: [{ currency_code: "usd", is_default: true }],
    metadata: { ...store.metadata, snowforce_initialized: true },
  };
}
