import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createCommerceClient } from "./commerce-client";
import { cartSnapshot, createCartRepository } from "./commerce-cart";
import { fixtureCart } from "./shop.fixtures";
const config = { backendUrl: "https://commerce.example.com", publishableKey: "pk_fixture" };
const customer = { customerId: "cus_fixture", token: "fixture-customer-token" };
describe("customer cart repository", () => {
  it("keeps merchandise subtotal separate from native cart subtotal including delivery", () => {
    const cart = { ...fixtureCart, subtotal: 48.95, shipping_total: 9.95, tax_total: 3.02, total: 51.97, items: [{ ...fixtureCart.items[0], unit_price: 39, quantity: 1, total: 42.02 }] };
    expect(cartSnapshot(cart)).toMatchObject({ subtotal: 39, shippingTotal: 9.95, taxTotal: 3.02, total: 51.97 });
    expect(cartSnapshot({ ...cart, items: [{ ...cart.items[0], unit_price: 19.95, quantity: 3 }] }).subtotal).toBe(59.85);
  });
  it("uses server totals and sends only IDs and quantities for item changes", async () => {
    const fetcher = vi.fn().mockImplementation(async (path: string) => new Response(JSON.stringify(path.endsWith("/edit") ? { status: "editable", quote_removed: true, review_required: true } : { cart: fixtureCart, parent: fixtureCart })));
    const repository = createCartRepository(createCommerceClient(config, fetcher), customer);
    await repository.create("reg_us"); await repository.add("cart_fixture", "variant_pink", 1); await repository.update("cart_fixture", "cali_fixture", 2); await repository.remove("cart_fixture", "cali_fixture");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ region_id: "reg_us", currency_code: "usd" });
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ variant_id: "variant_pink", quantity: 1 });
    expect(fetcher.mock.calls[6][1].method).toBe("POST");
    expect(JSON.parse(fetcher.mock.calls[6][1].body)).toEqual({ quantity: 0 });
    expect(cartSnapshot(fixtureCart)).toMatchObject({ subtotal: 79.95, items: [{ unitPrice: 79.95, total: 79.95 }] });
    expect(cartSnapshot(fixtureCart)).not.toHaveProperty("customer");
    expect(cartSnapshot(fixtureCart)).not.toHaveProperty("id");
  });
  it("rejects another customer's carts and foreign currency before returning data", async () => {
    for (const cart of [{ ...fixtureCart, customer: { id: "cus_other" } }, { ...fixtureCart, currency_code: "eur" }]) {
      const request = createCommerceClient(config, vi.fn().mockResolvedValue(new Response(JSON.stringify({ cart }))));
      await expect(createCartRepository(request, customer).get("cart_fixture")).rejects.toThrow();
    }
    await expect(createCartRepository(createCommerceClient(config, vi.fn().mockResolvedValue(new Response("{}", { status: 404 }))), customer).get("cart_fixture")).resolves.toBeNull();
    await expect(createCartRepository(createCommerceClient(config, vi.fn().mockResolvedValue(new Response(JSON.stringify({ cart: { ...fixtureCart, completed_at: "2026-10-01T00:00:00Z" } })))), customer).get("cart_fixture")).resolves.toBeNull();
  });
  it("does not change items if quote cleanup fails and validates item inputs before clearing any quote", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 409 }));
    const repository = createCartRepository(createCommerceClient(config, fetcher), customer);
    await expect(repository.update("cart_fixture", "cali_fixture", 2)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toContain("/checkout/cart_fixture/edit");
    fetcher.mockClear();
    await expect(repository.add("cart_fixture", "variant_fixture", 0)).rejects.toThrow();
    await expect(repository.remove("cart_fixture", "foreign")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
