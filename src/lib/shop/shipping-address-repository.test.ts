import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { previewAddresses, previewUser } from "@/lib/members/member-center-preview";
import { createShippingAddressRepository, type ShippingAddressSource } from "./shipping-address-repository";

const address = previewAddresses[0];
const row = { id: address.id, user_id: address.userId, name: address.name, phone: address.phone, address1: address.address1, address2: address.address2, city: address.city, state: address.state, postal_code: address.postalCode, country_code: "US", is_default: true, created_at: address.createdAt };
const source = (changes: Partial<ShippingAddressSource> = {}): ShippingAddressSource => ({
  list: vi.fn(async () => ({ data: [row], error: null })),
  save: vi.fn(async () => ({ data: row, error: null })),
  remove: vi.fn(async () => ({ data: true, error: null })), ...changes,
});
beforeEach(() => vi.clearAllMocks());

describe("member address repository", () => {
  it("separates empty, unavailable and foreign rows", async () => {
    expect(await createShippingAddressRepository(source({ list: async () => ({ data: [], error: null }) })).list(previewUser.id)).toEqual({ state: "ready", addresses: [] });
    expect((await createShippingAddressRepository(source({ list: async () => ({ data: null, error: new Error("private") }) })).list(previewUser.id)).state).toBe("unavailable");
    expect((await createShippingAddressRepository(source()).list("another-owner")).state).toBe("unavailable");
    expect(await createShippingAddressRepository(source()).save("another-owner", address)).toBeNull();
  });
  it("fails closed for missing auth, malformed data and write errors", async () => {
    const fake = source();
    const repo = createShippingAddressRepository(fake);
    expect((await repo.list("")).state).toBe("unavailable");
    expect(await repo.save("", address)).toBeNull();
    expect(await repo.save(previewUser.id, { ...address, postalCode: "invalid" })).toBeNull();
    expect(await repo.remove(previewUser.id, "-".repeat(36))).toBe(false);
    expect(fake.list).not.toHaveBeenCalled(); expect(fake.save).not.toHaveBeenCalled(); expect(fake.remove).not.toHaveBeenCalled();
    const failed = createShippingAddressRepository(source({ save: async () => ({ data: null, error: "failed" }), remove: async () => { throw new Error("failed"); } }));
    expect(await failed.save(previewUser.id, address)).toBeNull();
    expect(await failed.remove(previewUser.id, address.id)).toBe(false);
  });
  it("filters reads by auth UUID and delegates owner-free RPC arguments", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    query.order.mockReturnValueOnce(query).mockResolvedValueOnce({ data: [row], error: null });
    const client = { from: vi.fn(() => query), rpc: vi.fn().mockResolvedValue({ data: row, error: null }) };
    vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
    const repo = createShippingAddressRepository();
    expect((await repo.list(previewUser.id)).state).toBe("ready");
    expect(client.from).toHaveBeenCalledWith("shop_shipping_addresses");
    expect(query.eq).toHaveBeenCalledWith("user_id", previewUser.id);
    expect(await repo.save(previewUser.id, address)).toEqual(address);
    expect(client.rpc).toHaveBeenCalledWith("shop_save_shipping_address", {
      address_id: address.id, recipient_name: address.name, recipient_phone: address.phone, line_one: address.address1, line_two: address.address2, address_city: address.city, address_state: address.state, zip_code: address.postalCode, make_default: true,
    });
    client.rpc.mockResolvedValue({ data: true, error: null });
    expect(await repo.remove(previewUser.id, address.id)).toBe(true);
    expect(client.rpc).toHaveBeenLastCalledWith("shop_delete_shipping_address", { address_id: address.id });
  });
});
