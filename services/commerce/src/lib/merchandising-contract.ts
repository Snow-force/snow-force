import { z } from "zod";

export const merchandisingKind = z.enum(["product", "category", "collection"]);
const image = z.string().trim().max(2000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}, "Use a public HTTPS image URL.");
const common = { name_zh: z.string().trim().max(200), image };
export const merchandisingFields = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("product"), brand: z.string().trim().max(80) }).strict(),
  z.object({ kind: z.literal("category"), ...common, section: z.enum(["auto", "men", "women", "kids", "ski-snowboard", "accessories"]) }).strict(),
  z.object({ kind: z.literal("collection"), ...common, section: z.enum(["featured", "sale", "hidden"]), rank: z.number().int().min(0).max(10000), promotion_code: z.string().trim().max(100) }).strict(),
]);
export type MerchandisingFields = z.infer<typeof merchandisingFields>;
export const merchandisingRecord = z.object({ id: z.string(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), fields: merchandisingFields }).strict();
export const merchandisingCommand = z.object({ expected_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), fields: merchandisingFields }).strict();
