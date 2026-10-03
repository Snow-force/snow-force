import { beforeEach, describe, expect, it, vi } from "vitest";

const publishedPolicy = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("./policy-repository", () => ({ getShopPublishedPolicy: publishedPolicy }));
import { getShopSupportEmail } from "./support-repository";

describe("public shop support contact", () => {
  beforeEach(() => { publishedPolicy.mockReset(); });

  it("uses the contact from the validated effective policy", async () => {
    publishedPolicy.mockResolvedValue({ content: { customer_service_email: "updated@example.test" } });
    await expect(getShopSupportEmail()).resolves.toBe("updated@example.test");
  });

  it("shows the confirmed contact before a policy is published", async () => {
    publishedPolicy.mockResolvedValue(null);
    await expect(getShopSupportEmail()).resolves.toBe("Shop@snow-force.com");
  });

  it("keeps contact available when configuration, transport or policy validation fails", async () => {
    publishedPolicy.mockRejectedValue(new Error("private configuration detail"));
    await expect(getShopSupportEmail()).resolves.toBe("Shop@snow-force.com");
  });
});
