import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

vi.mock("server-only", () => ({}));

vi.mock("stripe", () => {
  const constructEvent = vi.fn();
  return {
    default: class StripeMock {
      webhooks = { constructEvent };
    },
  };
});

describe("stripe-server", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("(a) getStripeServer returns the same cached instance on repeated calls", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    const { getStripeServer } = await import("./stripe-server");

    const result1 = getStripeServer();
    const result2 = getStripeServer();

    expect(result1).toBe(result2);
  });

  it("(b) verifyStripeWebhookSignature calls constructEvent and returns the event on success", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fake");
    const { getStripeServer, verifyStripeWebhookSignature } = await import(
      "./stripe-server"
    );

    // Signature verification passes through any signed Stripe event, regardless of its topic.
    const mockEvent: Stripe.Event = {
      id: "evt_1",
      object: "event",
      api_version: null,
      created: 1,
      data: { object: { object: "balance", available: [], pending: [], livemode: false } },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "balance.available",
    };
    const stripe = getStripeServer();
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent);

    const rawBody = '{"test":true}';
    const signature = "t=123,v1=fake_signature";
    const result = verifyStripeWebhookSignature(rawBody, signature);

    expect(result).toStrictEqual(mockEvent);
    expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
      rawBody,
      signature,
      "whsec_fake",
    );
  });

  it("(c) verifyStripeWebhookSignature throws when constructEvent throws (invalid signature)", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fake");
    const { getStripeServer, verifyStripeWebhookSignature } = await import(
      "./stripe-server"
    );

    const stripe = getStripeServer();
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error("invalid signature");
    });

    expect(() =>
      verifyStripeWebhookSignature("{}", "bad_sig"),
    ).toThrow();
  });

  it("(d) getStripeServer throws when STRIPE_SECRET_KEY is not set", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { getStripeServer } = await import("./stripe-server");

    expect(() => getStripeServer()).toThrow("STRIPE_SECRET_KEY");
  });

  it("(e) verifyStripeWebhookSignature throws when STRIPE_WEBHOOK_SECRET is not set", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const { verifyStripeWebhookSignature } = await import(
      "./stripe-server"
    );

    expect(() =>
      verifyStripeWebhookSignature("{}", "sig"),
    ).toThrow("STRIPE_WEBHOOK_SECRET");
  });
});
