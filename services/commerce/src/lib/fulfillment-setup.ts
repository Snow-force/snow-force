import { z } from "zod";

const usStates = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
export const fulfillmentManifestSchema = z.object({
  location_name: z.string().trim().min(1).max(100),
  address: z.object({
    address_1: z.string().trim().min(1).max(200), address_2: z.string().trim().max(200),
    city: z.string().trim().min(1).max(100), province: z.enum(["ca"]),
    postal_code: z.string().regex(/^\d{5}(?:-\d{4})?$/), country_code: z.literal("us"),
  }).strict(),
  states: z.array(z.string().transform((value) => value.toUpperCase()).refine((value) => usStates.includes(value) && !["AK", "HI"].includes(value))).length(49)
    .refine((values) => new Set(values).size === 49, "Include the 48 contiguous states and DC exactly once."),
}).strict();
export type FulfillmentManifest = z.infer<typeof fulfillmentManifestSchema>;

export function initialGeoZones(manifest: FulfillmentManifest) {
  return fulfillmentManifestSchema.parse(manifest).states.map((state) => ({ type: "province" as const, country_code: "us", province_code: state.toLowerCase() }));
}

export function uniqueSetupRecord<T>(values: T[], description: string): T | undefined {
  if (values.length > 1) throw new Error(`Multiple ${description} records exist. Review them in Admin before initialization.`);
  return values[0];
}
