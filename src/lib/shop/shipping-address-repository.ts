import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeShippingAddress, shippingAddressInputSchema, type ShippingAddress, type ShippingAddressInput } from "./shipping-addresses";

export type ShippingAddressList = { state: "ready"; addresses: ShippingAddress[] } | { state: "unavailable"; addresses: [] };
export type ShippingAddressSource = {
  list: (userId: string) => Promise<{ data: unknown[] | null; error: unknown }>;
  save: (input: ShippingAddressInput) => Promise<{ data: unknown; error: unknown }>;
  remove: (id: string) => Promise<{ data: unknown; error: unknown }>;
};

const source: ShippingAddressSource = {
  async list(userId) {
    return (await createClient()).from("shop_shipping_addresses").select("*").eq("user_id", userId)
      .order("is_default", { ascending: false }).order("created_at", { ascending: false });
  },
  async save(input) {
    return (await createClient()).rpc("shop_save_shipping_address", {
      address_id: input.id ?? null, recipient_name: input.name, recipient_phone: input.phone,
      line_one: input.address1, line_two: input.address2, address_city: input.city,
      address_state: input.state, zip_code: input.postalCode, make_default: input.isDefault,
    });
  },
  async remove(id) { return (await createClient()).rpc("shop_delete_shipping_address", { address_id: id }); },
};

export function createShippingAddressRepository(addressSource: ShippingAddressSource = source) {
  return {
    async list(userId: string): Promise<ShippingAddressList> {
      try {
        if (!userId) throw new Error("Missing authenticated user");
        const { data, error } = await addressSource.list(userId);
        if (error || !data) throw new Error("Address read unavailable");
        const addresses = data.map(normalizeShippingAddress);
        if (addresses.some((address) => address.userId !== userId)) throw new Error("Address ownership mismatch");
        return { state: "ready", addresses };
      } catch { return { state: "unavailable", addresses: [] }; }
    },
    async save(userId: string, input: ShippingAddressInput): Promise<ShippingAddress | null> {
      try {
        if (!userId) return null;
        const parsed = shippingAddressInputSchema.parse(input);
        const { data, error } = await addressSource.save(parsed);
        if (error || !data) return null;
        const address = normalizeShippingAddress(data);
        return address.userId === userId ? address : null;
      } catch { return null; }
    },
    async remove(userId: string, id: string): Promise<boolean> {
      if (!userId || !z.string().uuid().safeParse(id).success) return false;
      try {
        const { data, error } = await addressSource.remove(id);
        return !error && data === true;
      } catch { return false; }
    },
  };
}

export const shippingAddressRepository = createShippingAddressRepository();
