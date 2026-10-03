import { beforeEach, describe, expect, it, vi } from "vitest";
const getPolicy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/shop/policy-repository", () => ({ getShopPublishedPolicy: getPolicy }));
vi.mock("@/components/shop/shop-policy-view", () => ({ ShopPolicyView: () => null }));
import ShopPoliciesPage from "./page";

describe("public shop policy page", () => {
  beforeEach(() => { getPolicy.mockReset(); });
  it("passes only the server's currently published policy", async () => {
    const published = { version: 3, content: { seller_name: "Fixture Gear LLC" } };
    getPolicy.mockResolvedValue(published);
    expect((await ShopPoliciesPage()).props).toEqual({ policy: published, unavailable: false });
    expect(getPolicy).toHaveBeenCalledTimes(1);
  });
  it("does not substitute default terms when the shop has no effective publication", async () => {
    getPolicy.mockResolvedValue(null);
    expect((await ShopPoliciesPage()).props).toEqual({ policy: null, unavailable: false });
  });
  it("renders an unavailable state without exposing a backend error or draft", async () => {
    getPolicy.mockRejectedValue(new Error("private schema and credentials"));
    const page = await ShopPoliciesPage();
    expect(page.props).toEqual({ policy: null, unavailable: true });
    expect(JSON.stringify(page.props)).not.toContain("private");
  });
});
