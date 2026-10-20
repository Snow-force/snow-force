"use client";

import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";

export type StripeWarmupConfig = { publishableKey: string; sampleRate: number };
const clients = new Map<string, Promise<Stripe | null>>();

export function selectStripeWarmup(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0 && rate <= 1 && (rate === 1 || Math.random() < rate);
}

// Cache only the public SDK client. Never retain a secret, cart, Elements or
// authorization result across checkouts. Failed loads are eligible for retry.
export function loadCheckoutStripe(publishableKey: string): Promise<Stripe | null> {
  if (!/^pk_(test|live)_[a-zA-Z0-9]{1,200}$/.test(publishableKey)) return Promise.resolve(null);
  const existing = clients.get(publishableKey);
  if (existing) return existing;
  const promise = Promise.resolve().then(() => loadStripe(publishableKey)).catch(() => null).then(client => {
    if (!client && clients.get(publishableKey) === promise) clients.delete(publishableKey);
    return client;
  });
  // Bound storage even if a tab visits stores with multiple public keys.
  if (clients.size >= 4) clients.delete(clients.keys().next().value!);
  clients.set(publishableKey, promise);
  return promise;
}
