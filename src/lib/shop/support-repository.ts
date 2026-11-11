import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { shopSupportEmail } from "./contact";
import { getShopPublishedPolicy } from "./policy-repository";

// Only the public contact is shared; effective policies used by checkout stay live.
const getCachedSupportEmail = unstable_cache(async () => {
  const policy = await getShopPublishedPolicy();
  return policy?.content.customer_service_email ?? shopSupportEmail;
}, ["public-support-contact-v1", process.env.MEDUSA_BACKEND_URL ?? "unconfigured"], { revalidate: 300 });

export const getShopSupportEmail = cache(async () => {
  try {
    return await getCachedSupportEmail();
  } catch {
    return shopSupportEmail;
  }
});
