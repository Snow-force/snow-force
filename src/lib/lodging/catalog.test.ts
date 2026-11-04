import { expect, it } from "vitest";
import { propertySchema, roomSchema, offerSchema, draftOfferTotal, parseCatalogForm } from "./catalog";
const id = "11111111-1111-4111-8111-111111111111";
const name = { en: "Hotel", zh: "酒店" };
const offer = { event_slug: "trip", room_type_id: id, check_in: "2027-01-01", check_out: "2027-01-03", nightly_amount: 10001, mandatory_fee: 2000, tax_basis_points: 1000, policy: name };
it("keeps date-only nights and rounds tax to cents", () => {
 expect(draftOfferTotal(offer)).toEqual({ nights: 2, subtotal: 22002, tax: 2200, total: 24202 });
});
it.each(["2027-02-29", "2027-01-01", "2026-12-31", "2027-02-10"])("rejects invalid/reversed/too long dates: %s", value => {
 expect(offerSchema.safeParse({ ...offer, check_out: value }).success).toBe(false);
});
it.each([-1, 0.5, 100000001, NaN])("rejects unsafe amounts %s", nightly_amount => expect(offerSchema.safeParse({ ...offer, nightly_amount }).success).toBe(false));
it("requires bilingual data, valid timezone and safe image URLs", () => {
 const p = { name, address: "1 Road", timezone: "America/Los_Angeles", photo_url: "https://example.test/image.jpg" };
 expect(propertySchema.safeParse(p).success).toBe(true);
 for (const patch of [{ timezone: "Bad/Zone" }, { photo_url: "javascript:alert(1)" }, { name: { en: "only" } }]) expect(propertySchema.safeParse({ ...p, ...patch }).success).toBe(false);
});
it("requires explicit room capacity", () => {
 expect(roomSchema.safeParse({ property_id: id, name, beds: name, max_guests: 0 }).success).toBe(false);
});
it("does not accept hidden sales fields from a direct action request", () => {
 const f = new FormData();
 for (const [k,v] of Object.entries({ name_en: "Hotel", name_zh: "酒店", address: "Road", timezone: "UTC", version: "1", sales_enabled: "true", updated_by: "attacker" })) f.set(k,v);
 const r = parseCatalogForm("property",f);
 expect(r.success).toBe(true);
 expect(r.success && r.data).not.toHaveProperty("sales_enabled");
 expect(r.success && r.data).not.toHaveProperty("updated_by");
});
