import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { pickupContactSchema } from "./local-pickup";
import { detailsVersionSchema } from "./checkout-details-version";
export class CheckoutDraftChangedError extends Error {constructor(){super("Checkout details or estimate changed.");this.name="CheckoutDraftChangedError";}}

export const draftAddressSchema = z.object({first_name:z.string().trim().min(1).max(100),last_name:z.string().trim().max(100),phone:z.string().trim().min(7).max(30).regex(/^[+\d\s().-]+$/),address_1:z.string().trim().min(1).max(200),address_2:z.string().trim().max(200),city:z.string().trim().min(1).max(100),province:z.string().regex(/^[a-z]{2}$/),postal_code:z.string().regex(/^\d{5}(?:-\d{4})?$/),country_code:z.literal("us")}).strict();
export const checkoutDraftSchema = z.discriminatedUnion("kind",[
  z.object({kind:z.literal("delivery"),version:detailsVersionSchema,address:draftAddressSchema,optionId:z.string().regex(/^so_[A-Za-z0-9]+$/).optional()}).strict(),
  z.object({kind:z.literal("pickup"),version:detailsVersionSchema,contact:pickupContactSchema}).strict(),
]);
export type CheckoutDraft = z.infer<typeof checkoutDraftSchema>;
const tokenSchema=z.object({version:z.literal(1),cartId:z.string().regex(/^cart_[A-Za-z0-9]+$/),customerId:z.string().regex(/^cus_[A-Za-z0-9]+$/),baseline:detailsVersionSchema,identity:detailsVersionSchema,draft:checkoutDraftSchema,optionId:z.string().regex(/^so_[A-Za-z0-9]+$/),quoteId:z.uuid(),setup:detailsVersionSchema,namespace:detailsVersionSchema,policyVersion:z.number().int().positive(),policyFingerprint:detailsVersionSchema,expiresAt:z.number().int().positive()}).strict();
export type CheckoutDraftToken=z.infer<typeof tokenSchema>;
export const draftTokenString=z.string().min(40).max(12000).regex(/^draft1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
function key(){if((process.env.JWT_SECRET?.length??0)<32)throw Error("Draft signing is unavailable.");return createHash("sha256").update("snowforce/checkout-draft/v1\0"+process.env.JWT_SECRET).digest();}
export function draftBaseline(raw:unknown){return createHash("sha256").update(JSON.stringify(raw)).digest("hex");}
/** Opaque authenticated encryption: no address or internal quote evidence in public URLs/logs. */
export function sealCheckoutDraft(raw:CheckoutDraftToken){const input=tokenSchema.parse(raw),iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv);cipher.setAAD(Buffer.from("snowforce/checkout-draft/v1"));const bytes=Buffer.concat([cipher.update(JSON.stringify(input),"utf8"),cipher.final()]);return draftTokenString.parse(["draft1",iv.toString("base64url"),bytes.toString("base64url"),cipher.getAuthTag().toString("base64url")].join("."));}
export function openCheckoutDraft(raw:unknown,cartId:string,customerId:string,now=Math.floor(Date.now()/1000)){
  const parts=draftTokenString.parse(raw).split("."),iv=Buffer.from(parts[1],"base64url"),tag=Buffer.from(parts[3],"base64url");if(iv.length!==12||tag.length!==16)throw Error("Invalid draft.");
  const decipher=createDecipheriv("aes-256-gcm",key(),iv);decipher.setAAD(Buffer.from("snowforce/checkout-draft/v1"));decipher.setAuthTag(tag);const bytes=Buffer.concat([decipher.update(Buffer.from(parts[2],"base64url")),decipher.final()]);
  const token=tokenSchema.parse(JSON.parse(bytes.toString("utf8")));if(token.cartId!==cartId||token.customerId!==customerId||now+60>=token.expiresAt)throw Error("Review the latest draft.");return token;
}
