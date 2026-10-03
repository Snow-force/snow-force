import { describe, expect, it } from "vitest";
import { parseShippingAddressForm, shippingAddressInputSchema } from "./shipping-addresses";
import { previewAddresses } from "@/lib/members/member-center-preview";

describe("US shipping address validation", () => {
  it("normalizes fields and only accepts US delivery addresses", () => {
    const parsed = shippingAddressInputSchema.parse({ ...previewAddresses[0], name: "  Alex  ", state: "ca", postalCode: "90001-1234" });
    expect(parsed.name).toBe("Alex"); expect(parsed.state).toBe("CA");
    expect(shippingAddressInputSchema.safeParse({ ...previewAddresses[0], countryCode: "CN" }).success).toBe(false);
  });
  it.each([{ state: "ZZ" }, { postalCode: "123" }, { name: " " }, { phone: "phone" }])("rejects invalid address fields %j", (change) => {
    expect(shippingAddressInputSchema.safeParse({ ...previewAddresses[0], ...change }).success).toBe(false);
  });
  it("ignores caller-supplied ownership and normalizes a new form", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(previewAddresses[0])) if (key !== "id") form.set(key, String(value));
    form.set("isDefault", "on"); form.set("user_id", "someone-else");
    const parsed = parseShippingAddressForm(form);
    expect(parsed.success).toBe(true);
    if (parsed.success) { expect(parsed.data.id).toBeUndefined(); expect(parsed.data.isDefault).toBe(true); expect(parsed.data).not.toHaveProperty("userId"); }
  });
});
