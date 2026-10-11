import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ session: vi.fn(), request: vi.fn() }));
vi.mock("./commerce-auth", () => ({ getCommerceCustomerSession: mocks.session }));
vi.mock("./commerce-client", async importOriginal => ({ ...await importOriginal<typeof import("./commerce-client")>(), commerceClient: () => mocks.request }));
import { claimNewcomerAction } from "./newcomer-actions";
import { getNewcomerPolicy } from "./newcomer";
import { verifyMarketing } from "@/lib/marketing/protocol";
import { CommerceAuthorizationError } from "./commerce-client";
import { newcomerPolicySchema, newcomerResultSchema, newcomerSavings } from "./newcomer-contract";
const secret = "newcomer-fixture-secret-longer-than-32";
const policy = { type: "percentage" as const, value: 10, minimum: 0, days: 30, eligibility: "no_orders" as const, registeredAfter: null };
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NEWCOMER_SIGNING_SECRET", secret); mocks.session.mockResolvedValue({ userId: "123e4567-e89b-42d3-a456-426614174001", createdAt: "2026-10-10T10:00:00+00:00", email: "member@example.com", token: "verified-token", request: mocks.request }); });
it("signs the verified session identity and creation time and sends it with the customer JWT", async () => {
  mocks.request.mockResolvedValue({ status: "ready", code: `WELCOME-${"A".repeat(32)}`, endsAt: "2026-11-10T10:00:00Z", policy });
  expect((await claimNewcomerAction()).status).toBe("ready");
  const [path, , options] = mocks.request.mock.calls[0];
  expect(path).toBe("/store/snowforce/newcomer"); expect(options.token).toBe("verified-token");
  expect(verifyMarketing(options.body, secret).payload).toEqual({ kind: "newcomer", userId: "123e4567-e89b-42d3-a456-426614174001", email: "member@example.com", createdAt: "2026-10-10T10:00:00.000Z" });
});
it("fails safely without a verified account or configured signing secret", async () => {
  mocks.session.mockRejectedValue(new CommerceAuthorizationError()); expect(await claimNewcomerAction()).toEqual({ status: "signed-out" }); expect(mocks.request).not.toHaveBeenCalled();
  mocks.session.mockResolvedValue({ createdAt: "2026-10-10T00:00:00Z" }); vi.stubEnv("NEWCOMER_SIGNING_SECRET", "");
  expect(await claimNewcomerAction()).toEqual({ status: "unavailable" });
});
it("hides the offer if commerce is unavailable and rejects malformed financial claims", async () => {
  mocks.request.mockResolvedValue({ policy }); expect(await getNewcomerPolicy()).toEqual(policy);
  mocks.request.mockRejectedValue(new Error("offline")); expect(await getNewcomerPolicy()).toBeNull();
  expect(newcomerResultSchema.safeParse({ status: "ready", code: "SHARED", policy, endsAt: "invalid" }).success).toBe(false);
  expect(newcomerPolicySchema.safeParse({ ...policy, value: 0.001 }).success).toBe(false);
  expect(newcomerPolicySchema.safeParse({ ...policy, value: 101 }).success).toBe(false);
  expect(newcomerSavings(policy, "en")).toBe("10% off"); expect(newcomerSavings(policy, "zh")).toBe("新人九折"); expect(newcomerPolicySchema.safeParse({ ...policy, minimum: 1 }).success).toBe(false); expect(newcomerPolicySchema.safeParse({ ...policy, value: 20 }).success).toBe(false);
  mocks.request.mockClear(); vi.stubEnv("NEWCOMER_SIGNING_SECRET", ""); expect(await getNewcomerPolicy()).toBeNull(); expect(mocks.request).not.toHaveBeenCalled();
});
