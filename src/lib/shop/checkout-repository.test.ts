import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createCheckoutRepository } from "./checkout-repository";
import type { CommerceRequest } from "./commerce-client";

const customer = { customerId: "cus_fixture", token: "trusted-token", email: "verified@example.test" };
describe("checkout payment-state recovery transport", () => {
  it("sends a validated pickup contact without client location, amount or cart overrides", async () => {
    const calls: unknown[] = [];
    const request: CommerceRequest = async (path, schema, options) => { calls.push({ path, options }); return schema.parse({ status: "pickup-saved" }); };
    const contact = { name: "Test Rider", phone: "5551234567", appointmentConfirmed: true as const };
    expect(await createCheckoutRepository(request, customer, "cart_fixture").pickup(contact)).toEqual({ status: "pickup-saved" });
    expect(calls).toEqual([{ path: "/store/snowforce/checkout/cart_fixture/pickup", options: { token: "trusted-token", method: "POST", body: contact } }]);
  });
  it("posts only the recovery command for the server-owned cart and bearer session", async () => {
    const requests: { path: string; options: unknown }[] = [];
    const request: CommerceRequest = async (path, schema, options) => {
      requests.push({ path, options });
      return schema.parse({ status: "recovered", unlocked: true });
    };
    expect(await createCheckoutRepository(request, customer, "cart_fixture").recover()).toEqual({ status: "recovered", unlocked: true });
    expect(requests).toEqual([{ path: "/store/snowforce/checkout/cart_fixture", options: { token: "trusted-token", method: "POST", body: { kind: "recover" } } }]);
  });
  it("accepts an existing order without interpreting Stripe return parameters", async () => {
    const request: CommerceRequest = async (_path, schema) => schema.parse({ status: "complete", order: { id: "order_fixture", number: "1001", total: 89.9 } });
    expect(await createCheckoutRepository(request, customer, "cart_fixture").recover()).toMatchObject({ status: "complete", order: { id: "order_fixture" } });
  });
  it("rejects a recovery response that tries to restore a payment secret", async () => {
    const request: CommerceRequest = async (_path, schema) => schema.parse({ status: "recovered", unlocked: true, clientSecret: "pi_old_secret_fixture" });
    await expect(createCheckoutRepository(request, customer, "cart_fixture").recover()).rejects.toThrow();
  });
});
