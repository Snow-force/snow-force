import "server-only";
import { cache } from "react";
import { shopSupportEmail } from "./contact";
import { getShopPublishedPolicy } from "./policy-repository";

// Reuse the effective public policy within a render, without caching across requests.
export const getShopSupportEmail = cache(async () => {
  try {
    const policy = await getShopPublishedPolicy();
    return policy?.content.customer_service_email ?? shopSupportEmail;
  } catch {
    return shopSupportEmail;
  }
});
