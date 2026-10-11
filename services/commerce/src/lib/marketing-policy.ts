import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export function signMarketing(payload: unknown, secret: string, now = Date.now()) {
  if (secret.length < 32) throw new Error("Marketing service is not configured.");
  const timestamp = Math.floor(now / 1000), nonce = randomUUID(), body = JSON.stringify(payload);
  return { timestamp, nonce, body, signature: createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex") };
}
export function verifyMarketing(value: unknown, secret: string, now = Date.now()) {
  const entry = z.object({ timestamp: z.number().int(), nonce: z.uuid(), body: z.string().max(2_000_000), signature: z.string().regex(/^[0-9a-f]{64}$/) }).parse(value);
  if (secret.length < 32 || Math.abs(now / 1000 - entry.timestamp) > 300) throw new Error("Invalid service request.");
  const expected = createHmac("sha256", secret).update(`${entry.timestamp}.${entry.nonce}.${entry.body}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(entry.signature, "hex"))) throw new Error("Invalid service request.");
  return { nonce: entry.nonce, payload: JSON.parse(entry.body) as unknown };
}
export function marketingOrigin(value: string, production = process.env.NODE_ENV === "production") {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || !(url.protocol === "https:" || (!production && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("Invalid marketing service origin.");
  return url.origin;
}
const httpsImage = z.union([z.literal(""), z.string().url().max(2000).refine(value => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; })]);
export const marketingContent = z.object({ subject: z.string().trim().min(1).max(150).refine(value => !/[\r\n]/.test(value)), preheader: z.string().trim().max(200), heading: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(15000), image: httpsImage, button: z.string().trim().min(1).max(80), path: z.string().max(1000).regex(/^\/(events|shop)\//).refine(value => !value.includes("..") && !value.includes("\\") && !/[\u0000-\u0020\u007f]/.test(value)) }).strict();
export const marketingSource = z.object({ kind: z.enum(["event", "product", "collection", "promotion"]), id: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(200) }).strict();
export const marketingCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("sources") }),
  z.object({ action: z.literal("create"), source: marketingSource, requestKey: z.uuid() }),
  z.object({ action: z.literal("get"), id: z.uuid() }),
  z.object({ action: z.literal("save"), id: z.uuid(), version: z.number().int().positive(), content: marketingContent }),
  z.object({ action: z.literal("preview"), id: z.uuid(), version: z.number().int().positive() }),
  z.object({ action: z.literal("test"), id: z.uuid(), version: z.number().int().positive(), email: z.email() }),
  z.object({ action: z.literal("send"), id: z.uuid(), version: z.number().int().positive(), requestKey: z.uuid(), audienceHash: z.string().regex(/^[0-9a-f]{64}$/) }),
  z.object({ action: z.literal("copy"), id: z.uuid(), requestKey: z.uuid() }),
]);
export type MarketingContent = z.infer<typeof marketingContent>;
export const contactSchema = z.object({ email: z.email(), sources: z.array(z.string()), subscribed: z.boolean(), optedOut: z.boolean() });
export function classifyContact(contact: z.infer<typeof contactSchema>, suppressed: boolean) {
  return suppressed || contact.optedOut ? "suppressed" : contact.subscribed ? "eligible" : "pending";
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
export function renderMarketing(content: MarketingContent, origin: string, address: string, unsubscribe: string) {
  marketingContent.parse(content);
  const link = new URL(content.path, origin);
  if (link.origin !== origin) throw new Error("Invalid destination.");
  const text = `${content.heading}\n\n${content.body}\n\n${content.button}: ${link.href}\n\nSnowForce promotional email\n${address}\nUnsubscribe: ${unsubscribe}`;
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(content.subject)}</title></head><body style="margin:0;background:#f5f5f7;font-family:Arial,sans-serif;color:#272729"><div style="display:none;max-height:0;overflow:hidden">${escape(content.preheader)}</div><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:white"><tr><td style="padding:24px;font-size:16px;line-height:1.6"><p>SnowForce</p>${content.image ? `<img src="${escape(content.image)}" alt="${escape(content.heading)}" width="552" style="width:100%;height:auto">` : ""}<h1>${escape(content.heading)}</h1>${content.body.split(/\n\n+/).map(paragraph => `<p>${escape(paragraph).replace(/\n/g, "<br>")}</p>`).join("")}<p><a href="${escape(link.href)}" style="display:inline-block;background:#006bd6;color:white;padding:14px 20px">${escape(content.button)}</a></p><hr><p style="font-size:13px">SnowForce promotional email<br>${escape(address)}<br><a href="${escape(unsubscribe)}">Unsubscribe from SnowForce marketing emails</a></p></td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
export function unsubscribeToken(email: string, secret: string) {
  if (secret.length < 32) throw new Error("Unsubscribe signing is not configured.");
  const value = Buffer.from(z.email().parse(email.toLowerCase())).toString("base64url");
  return `${value}.${createHmac("sha256", secret).update(`unsubscribe.v1.${value}`).digest("hex")}`;
}
export function verifyUnsubscribe(token: string, secret: string) {
  if (secret.length < 32 || token.length > 1000) throw new Error("Invalid unsubscribe link.");
  const [value, signature, extra] = token.split(".");
  if (extra || !value || !signature || !/^[0-9a-f]{64}$/.test(signature)) throw new Error("Invalid unsubscribe link.");
  const expected = createHmac("sha256", secret).update(`unsubscribe.v1.${value}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) throw new Error("Invalid unsubscribe link.");
  return z.email().parse(Buffer.from(value, "base64url").toString());
}
export async function deliverMarketing(payload: unknown, key: string, apiKey: string, fetcher: typeof fetch = fetch) {
  if (!apiKey) throw new Error("Marketing delivery is not configured.");
  try {
    const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([name, entry]) => [name, canonical(entry)])) : value;
    const response = await fetcher("https://api.resend.com/emails", { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(canonical(payload)) });
    if (!response.ok) return { status: response.status === 429 || response.status >= 500 ? "retry" as const : "failed" as const, code: `http_${response.status}` };
    const parsed = z.object({ id: z.string().min(1) }).safeParse(await response.json().catch(() => null));
    return parsed.success ? { status: "accepted" as const, id: parsed.data.id } : { status: "retry" as const, code: "unknown_response" };
  } catch { return { status: "retry" as const, code: "network_unknown" }; }
}
