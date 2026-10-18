import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { stripeWarmupConfig } from "./stripe-warmup-config";
afterEach(() => vi.unstubAllEnvs());
it("is disabled unless explicitly enabled and only serializes the public key and bounded rate", () => {
  vi.stubEnv("SHOP_STRIPE_PREWARM", "false"); vi.stubEnv("NEXT_PUBLIC_COMMERCE_STRIPE_PUBLISHABLE_KEY", "pk_test_fixture"); expect(stripeWarmupConfig()).toBeUndefined();
  vi.stubEnv("SHOP_STRIPE_PREWARM", "true"); vi.stubEnv("SHOP_STRIPE_PREWARM_SAMPLE_RATE", undefined); expect(stripeWarmupConfig()).toEqual({ publishableKey: "pk_test_fixture", sampleRate: .1 });
  vi.stubEnv("SHOP_STRIPE_PREWARM_SAMPLE_RATE", "1"); expect(stripeWarmupConfig()?.sampleRate).toBe(1);
  vi.stubEnv("SHOP_STRIPE_PREWARM_SAMPLE_RATE", "2"); expect(stripeWarmupConfig()).toBeUndefined();
  vi.stubEnv("SHOP_STRIPE_PREWARM_SAMPLE_RATE", ".1"); vi.stubEnv("NEXT_PUBLIC_COMMERCE_STRIPE_PUBLISHABLE_KEY", "sk_test_fixture"); expect(stripeWarmupConfig()).toBeUndefined();
});
