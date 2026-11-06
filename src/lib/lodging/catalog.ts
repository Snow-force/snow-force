import { z } from "zod";

const text = z.string().trim().min(1).max(200);
const bilingual = z.object({ en: text, zh: text });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "Invalid calendar date");
const money = z.coerce.number().int().min(0).max(100_000_000);
const record = { id: z.string().uuid().optional(), version: z.coerce.number().int().positive().default(1) };
export const propertySchema = z.object({
  ...record, name: bilingual, address: text,
  timezone: text.refine(v => { try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; } }, "Invalid time zone"),
  photo_url: z.union([z.literal(""), z.string().url().max(2000).refine(v => v.startsWith("https://"))]).default(""),
});
export const roomSchema = z.object({
  ...record, property_id: z.string().uuid(), name: bilingual,
  beds: bilingual, max_guests: z.coerce.number().int().min(1).max(30),
});
export const offerSchema = z.object({
  ...record, event_slug: text, room_type_id: z.string().uuid(),
  check_in: date, check_out: date,
  nightly_amount: money, mandatory_fee: money,
  package_amount: money.positive().nullable().default(null),
  tax_basis_points: z.coerce.number().int().min(0).max(10000),
  policy: z.object({ en: z.string().trim().min(1).max(10000), zh: z.string().trim().min(1).max(10000) }),
}).refine(v => v.check_out > v.check_in, { message: "Check-out must follow check-in", path: ["check_out"] })
  .refine(v => (Date.parse(v.check_out) - Date.parse(v.check_in)) / 86400000 <= 30, { message: "Maximum 30 nights", path: ["check_out"] });
export type Property = z.infer<typeof propertySchema> & { id: string };
export type Room = z.infer<typeof roomSchema> & { id: string };
export type Offer = z.infer<typeof offerSchema> & { id: string; currency: "usd"; sales_enabled: false };
export type Catalog = { properties: Property[]; rooms: Room[]; offers: Offer[] };
export type CatalogKind = "property" | "room" | "offer";
export const catalogTables = { property: "lodging_properties", room: "lodging_room_types", offer: "event_lodging_offers" } as const;
function decimalHundredths(value: FormDataEntryValue | undefined) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(text)) return NaN;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function parseCatalogForm(kind: CatalogKind, form: FormData) {
  const row = Object.fromEntries(form.entries());
  // The form accepts dollars; storage uses integer cents. Never derive a package
  // price by dividing hotel costs by a room's maximum occupancy.
  const packagePrice = String(row.package_price ?? "").trim();
  const value = { ...row,
    nightly_amount: "nightly_price" in row ? decimalHundredths(row.nightly_price) : row.nightly_amount,
    mandatory_fee: "mandatory_price" in row ? decimalHundredths(row.mandatory_price) : row.mandatory_fee,
    tax_basis_points: "tax_percent" in row ? decimalHundredths(row.tax_percent) : row.tax_basis_points,
    package_amount: packagePrice ? decimalHundredths(row.package_price) : null, id: row.id || undefined, name: { en: row.name_en, zh: row.name_zh }, beds: { en: row.beds_en, zh: row.beds_zh }, policy: { en: row.policy_en, zh: row.policy_zh } };
  return (kind === "property" ? propertySchema : kind === "room" ? roomSchema : offerSchema).safeParse(value);
}

export function draftPackageTotal(offer: Pick<Offer, "package_amount">, participants: number) {
  if (offer.package_amount === null || !Number.isSafeInteger(offer.package_amount) || offer.package_amount <= 0
    || !Number.isSafeInteger(participants) || participants < 1 || participants > 1000) return null;
  return offer.package_amount * participants;
}
export function draftOfferTotal(offer: Pick<Offer, "check_in" | "check_out" | "nightly_amount" | "mandatory_fee" | "tax_basis_points">) {
  const nights = (Date.parse(offer.check_out) - Date.parse(offer.check_in)) / 86400000;
  const subtotal = nights * offer.nightly_amount + offer.mandatory_fee;
  return { nights, subtotal, tax: Math.round(subtotal * offer.tax_basis_points / 10000), total: subtotal + Math.round(subtotal * offer.tax_basis_points / 10000) };
}
