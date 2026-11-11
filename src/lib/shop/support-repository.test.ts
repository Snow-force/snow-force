import { beforeEach, describe, expect, it, vi } from "vitest";

const publishedPolicy = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ unstable_cache: (read: () => Promise<unknown>) => read }));
vi.mock("server-only", () => ({}));
vi.mock("./policy-repository", () => ({ getShopPublishedPolicy: publishedPolicy }));
import { getShopSupportEmail } from "./support-repository";

describe("public shop support contact", () => {
  beforeEach(() => { publishedPolicy.mockReset(); });

  it("recovers the public contact after a temporary source failure", async () => {
    publishedPolicy.mockRejectedValueOnce(new Error("temporary outage")).mockResolvedValueOnce({ content: { customer_service_email: "recovered@example.test" } });
    await expect(getShopSupportEmail()).resolves.toBe("shop@snow-force.com");
    await expect(getShopSupportEmail()).resolves.toBe("recovered@example.test");
  });

  it("uses the contact from the validated effective policy", async () => {
    publishedPolicy.mockResolvedValue({ content: { customer_service_email: "updated@example.test" } });
    await expect(getShopSupportEmail()).resolves.toBe("updated@example.test");
  });

  it("shows the confirmed contact before a policy is published", async () => {
    publishedPolicy.mockResolvedValue(null);
    await expect(getShopSupportEmail()).resolves.toBe("shop@snow-force.com");
  });

  it("keeps contact available when configuration, transport or policy validation fails", async () => {
    publishedPolicy.mockRejectedValue(new Error("private configuration detail"));
    await expect(getShopSupportEmail()).resolves.toBe("shop@snow-force.com");
  });
});
