import "server-only";
import { commerceClient, CommerceUnavailableError, type CommerceRequest } from "./commerce-client";
import { shopPublishedPolicyResponseSchema } from "./policies";

export async function loadShopPublishedPolicy(request: CommerceRequest, at = new Date()) {
  const { policy } = await request("/store/snowforce/policies", shopPublishedPolicyResponseSchema);
  if (policy && Date.parse(policy.effective_at) > at.getTime()) throw new CommerceUnavailableError();
  return policy;
}

export async function getShopPublishedPolicy() {
  return loadShopPublishedPolicy(commerceClient());
}
