import "server-only";
import { z } from "zod";

export class CommerceUnavailableError extends Error {
  constructor() { super("The commerce service is unavailable."); this.name = "CommerceUnavailableError"; }
}
export class CommerceAuthorizationError extends Error {
  constructor() { super("A verified SnowForce account is required."); this.name = "CommerceAuthorizationError"; }
}
export class CommerceNotFoundError extends Error {
  constructor() { super("The commerce record was not found."); this.name = "CommerceNotFoundError"; }
}
export class CommerceRejectedError extends Error {
  constructor() { super("The requested commerce change was rejected."); this.name = "CommerceRejectedError"; }
}
export class CommerceCheckoutLockedError extends CommerceRejectedError {
  constructor() { super(); this.name = "CommerceCheckoutLockedError"; this.message = "Review the existing checkout before changing this cart."; }
}
export class CommerceSalesDisabledError extends CommerceRejectedError {
  constructor() { super(); this.name = "CommerceSalesDisabledError"; this.message = "Shopping is temporarily paused."; }
}
const salesDisabledResponse = z.object({
  type: z.literal("not_allowed"),
  message: z.literal("The shop is open for administration only. Sales and payment operations are disabled."),
});
const checkoutLockedResponse = z.object({
  type: z.literal("conflict"),
  message: z.literal("Check the current quote and payment before changing this cart."),
});
export type CommerceConfig = { backendUrl: string; publishableKey: string };
export type CommerceRequest = <Schema extends z.ZodTypeAny>(path: string, response: Schema, options?: { method?: "GET" | "POST" | "DELETE"; body?: unknown; token?: string }) => Promise<z.output<Schema>>;

export function createCommerceClient(config: CommerceConfig, fetcher: typeof fetch = fetch): CommerceRequest {
  let url: URL;
  try { url = new URL(config.backendUrl); } catch { throw new CommerceUnavailableError(); }
  const local = ["127.0.0.1", "localhost"].includes(url.hostname);
  if (!config.publishableKey || !((local && url.protocol === "http:") || url.protocol === "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new CommerceUnavailableError();
  return async (path, responseSchema, options = {}) => {
    // Only fixed API roots on the configured backend can receive credentials.
    let decoded: string;
    try { decoded = decodeURIComponent(path.split("?")[0]); } catch { throw new CommerceUnavailableError(); }
    if (!/^\/(store|auth)\//.test(decoded) || decoded.includes("\\") || decoded.includes("..") || /[\u0000-\u001f\u007f]/.test(decoded)) throw new CommerceUnavailableError();
    let response: Response;
    try {
      response = await fetcher(`${url.origin}${path}`, {
        // Native checkout updates may refresh pricing, promotions and shipping.
        // Do not abandon these writes while the backend is still committing.
        method: options.method ?? "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(options.method && options.method !== "GET" && (/^\/store\/snowforce\/checkout\/cart_[A-Za-z0-9]+(?:\/(?:pickup|quote|edit))?$/.test(decoded) || /^\/store\/carts(?:\/cart_[A-Za-z0-9]+(?:\/(?:shipping-methods|promotions|line-items(?:\/cali_[A-Za-z0-9]+)?))?)?$/.test(decoded)) ? 60_000 : 15_000),
        headers: { "Content-Type": "application/json", "x-publishable-api-key": config.publishableKey, ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch { throw new CommerceUnavailableError(); }
    if (response.status === 401 || response.status === 403) throw new CommerceAuthorizationError();
    if (response.status === 404) throw new CommerceNotFoundError();
    if ([400, 409, 422].includes(response.status)) {
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 400 && salesDisabledResponse.safeParse(body).success) {
        console.warn("[shop.commerce] sales-disabled", { method: options.method ?? "GET", path: decoded, httpStatus: response.status });
        throw new CommerceSalesDisabledError();
      }
      // This exact edit boundary can reject payment sessions OR quote evidence.
      // Do not label unrelated inventory, pricing or validation errors as locks.
      if (response.status === 409 && options.method === "POST" && /^\/store\/snowforce\/checkout\/cart_[A-Za-z0-9]+\/edit$/.test(decoded) && checkoutLockedResponse.safeParse(body).success) throw new CommerceCheckoutLockedError();
      throw new CommerceRejectedError();
    }
    if (!response.ok) throw new CommerceUnavailableError();
    try { return responseSchema.parse(await response.json()); } catch { throw new CommerceUnavailableError(); }
  };
}

export function commerceClient() {
  return createCommerceClient({ backendUrl: process.env.MEDUSA_BACKEND_URL ?? "", publishableKey: process.env.MEDUSA_PUBLISHABLE_KEY ?? "" });
}

const authToken = z.object({ token: z.string().min(20).max(8192) });
const customerResult = z.object({ customer: z.object({ id: z.string().regex(/^cus_[a-zA-Z0-9]+$/) }) });
export async function linkCommerceCustomer(accessToken: string, request: CommerceRequest) {
  const credentials = { method: "POST" as const, body: { access_token: accessToken } };
  const initial = await request("/auth/customer/supabase", authToken, credentials);
  // This credential came from our configured backend after its membership check,
  // never from the browser. Existing customers need no linking write or second
  // authentication request. The native profile read still verifies both the
  // JWT and the customer record, including an administratively deleted account.
  let existingId: string | null = null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(initial.token.split(".")[1], "base64url").toString("utf8"));
    const linked = z.object({ actor_type: z.literal("customer"), actor_id: z.string().regex(/^cus_[A-Za-z0-9]+$/), app_metadata: z.object({ customer_id: z.string() }) }).safeParse(claims);
    if (linked.success && linked.data.actor_id === linked.data.app_metadata.customer_id) existingId = linked.data.actor_id;
  } catch { /* First-time registration still uses the locked customer bridge. */ }
  if (existingId) {
    const { customer } = await request("/store/customers/me", customerResult, { token: initial.token });
    if (customer.id !== existingId) throw new CommerceAuthorizationError();
    return { customerId: customer.id, token: initial.token };
  }
  const { customer } = await request("/store/snowforce/customer", customerResult, { method: "POST", token: initial.token, body: {} });
  const refreshed = await request("/auth/customer/supabase", authToken, credentials);
  return { customerId: customer.id, token: refreshed.token };
}
