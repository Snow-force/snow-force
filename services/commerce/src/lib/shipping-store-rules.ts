import { z } from "zod";

const rulesSchema = z.array(z.object({ id: z.string().min(1), attribute: z.string(), operator: z.enum(["eq", "ne", "in", "nin", "gt", "gte", "lt", "lte"]), value: z.string() }));

/** Medusa 2.21 supplies enabled_in_store when listing a cart's shipping options. */
export function shippingStoreRuleUpdates(value: unknown) {
  const rules = rulesSchema.parse(value);
  const legacy = rules.filter(rule => rule.attribute === "is_enabled_in_store");
  if (!legacy.length) return [];
  if (legacy.length !== 1 || rules.some(rule => rule.attribute === "enabled_in_store")) throw new Error("Review conflicting storefront shipping rules before updating them.");
  return legacy.map(rule => ({ ...rule, attribute: "enabled_in_store" }));
}
