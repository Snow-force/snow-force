import "server-only";
import { performanceSampleRate } from "./performance-contract";
import type { StripeWarmupConfig } from "./stripe-loader";

export function stripeWarmupConfig(): StripeWarmupConfig | undefined {
  const sampleRate = performanceSampleRate(process.env.SHOP_STRIPE_PREWARM, process.env.SHOP_STRIPE_PREWARM_SAMPLE_RATE);
  const publishableKey = process.env.NEXT_PUBLIC_COMMERCE_STRIPE_PUBLISHABLE_KEY ?? "";
  if (!sampleRate || !/^pk_(test|live)_[a-zA-Z0-9]{1,200}$/.test(publishableKey)) return;
  return { publishableKey, sampleRate };
}
