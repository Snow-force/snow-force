import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createCommerceClient, CommerceUnavailableError } from "./commerce-client";
import { loadShopPublishedPolicy } from "./policy-repository";
import { shopPolicySections } from "./policies";

const config = { backendUrl: "https://commerce.example.test", publishableKey: "pk_fixture" };
function policy() {
  return {
    schema_version: 1, version: 3, effective_at: "2026-09-29T12:00:00.000Z",
    content: {
      seller_name: "Fixture Gear LLC", customer_service_email: "support@example.test",
      terms: { return_window_days: 30, approved_dispatch_days: 14, review_business_days: 2, refund_business_days: 5, processing_business_days_min: 1, processing_business_days_max: 2, transit_business_days_min: 3, transit_business_days_max: 7 },
      copy: Object.fromEntries(shopPolicySections.map((section) => [section, { en: `Published ${section}`, zh: `已发布 ${section}` }])),
    },
  };
}
const now = new Date("2026-10-01T12:00:00.000Z");

describe("public shop policy repository", () => {
  it("reads the published-only endpoint without caching or a customer token", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ policy: policy() })));
    expect((await loadShopPublishedPolicy(createCommerceClient(config, fetcher), now))?.version).toBe(3);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://commerce.example.test/store/snowforce/policies");
    expect(options).toMatchObject({ method: "GET", cache: "no-store", redirect: "error" });
    expect(options.headers).not.toHaveProperty("Authorization");
  });
  it("keeps an unpublished result separate from transport failure", async () => {
    await expect(loadShopPublishedPolicy(createCommerceClient(config, vi.fn().mockResolvedValue(new Response('{"policy":null}'))), now)).resolves.toBeNull();
    await expect(loadShopPublishedPolicy(createCommerceClient(config, vi.fn().mockRejectedValue(new Error("private database problem"))), now)).rejects.toThrow(CommerceUnavailableError);
  });
  it("fails closed on draft/private data, malformed responses and future effectiveness", async () => {
    for (const response of [
      { policy: { ...policy(), effective_at: "2026-12-01T12:00:00.000Z" } },
      { policy: { ...policy(), published_by: "private-staff" } },
      { policy: { ...policy(), content: { ...policy().content, seller_name: "" } } },
      { policy: { draft: policy() } }, {},
    ]) {
      const request = createCommerceClient(config, vi.fn().mockResolvedValue(new Response(JSON.stringify(response))));
      await expect(loadShopPublishedPolicy(request, now)).rejects.toThrow(CommerceUnavailableError);
    }
  });
});
