import { z } from "zod";

export const usStates = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const required = (max: number) => z.string().trim().min(1).max(max);
export const shippingAddressInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: required(100),
  phone: z.string().trim().min(7).max(30).regex(/^[+\d\s().-]+$/),
  address1: required(200),
  address2: z.string().trim().max(200),
  city: required(100),
  state: z.string().trim().toUpperCase().refine((value) => usStates.includes(value)),
  postalCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/),
  countryCode: z.literal("US"),
  isDefault: z.boolean(),
});
export type ShippingAddressInput = z.infer<typeof shippingAddressInputSchema>;
export type ShippingAddress = ShippingAddressInput & { id: string; userId: string; createdAt: string };

export function parseShippingAddressForm(form: FormData) {
  return shippingAddressInputSchema.safeParse({
    id: String(form.get("id") || "") || undefined,
    name: String(form.get("name") || ""), phone: String(form.get("phone") || ""),
    address1: String(form.get("address1") || ""), address2: String(form.get("address2") || ""),
    city: String(form.get("city") || ""), state: String(form.get("state") || ""),
    postalCode: String(form.get("postalCode") || ""), countryCode: String(form.get("countryCode") || ""),
    isDefault: form.get("isDefault") === "on",
  });
}

export const shippingAddressRowSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), name: z.string(), phone: z.string(),
  address1: z.string(), address2: z.string(), city: z.string(), state: z.string(), postal_code: z.string(),
  country_code: z.literal("US"), is_default: z.boolean(), created_at: z.string().datetime({ offset: true }),
});

export function normalizeShippingAddress(value: unknown): ShippingAddress {
  const row = shippingAddressRowSchema.parse(value);
  const input = shippingAddressInputSchema.parse({ ...row, postalCode: row.postal_code, countryCode: row.country_code, isDefault: row.is_default });
  return { ...input, id: row.id, userId: row.user_id, createdAt: row.created_at };
}
