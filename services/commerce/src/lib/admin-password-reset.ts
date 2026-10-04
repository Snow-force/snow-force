import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const ADMIN_ORIGIN = "https://snowforce-commerce-production.up.railway.app";
const eventSchema = z.object({ actor_type: z.literal("user"), entity_id: z.string().email().max(254), token: z.string().min(1).max(8192) });
const claimsSchema = z.object({ actor_type: z.literal("user"), provider: z.literal("emailpass"), purpose: z.literal("reset"), entity_id: z.string().email(), jti: z.string().min(1), exp: z.number().int(), iat: z.number().int() });
type ResetEnvironment = { COMMERCE_RESEND_API_KEY?: string; JWT_SECRET?: string };
type Dependencies = { fetch: typeof fetch; now?: () => number; sleep?: (milliseconds: number) => Promise<void> };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

// Only a server-generated, unexpired native admin token may become an email link.
// Event metadata and request origins never control the destination or sender.
export function resetMessage(data: unknown, secret: string, now = Date.now()) {
  try {
    const event = eventSchema.parse(data);
    const parts = event.token.split(".");
    if (parts.length !== 3 || !secret) throw new Error();
    const header: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (!z.object({ alg: z.literal("HS256") }).safeParse(header).success) throw new Error();
    const signature = Buffer.from(parts[2], "base64url");
    const expected = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new Error();
    const claims = claimsSchema.parse(JSON.parse(Buffer.from(parts[1], "base64url").toString()));
    if (claims.entity_id !== event.entity_id || claims.exp * 1000 <= now || claims.iat * 1000 > now + 30000) throw new Error();
    const url = new URL("/app/reset-password", ADMIN_ORIGIN);
    url.searchParams.set("token", event.token);
    const link = url.toString();
    return {
      key: `admin-reset-${createHash("sha256").update(event.token).digest("hex")}`,
      payload: {
        from: "SnowForce Shop <shop@notifications.snow-force.com>",
        reply_to: "Shop@snow-force.com",
        to: [event.entity_id],
        subject: "Reset your SnowForce shop admin password / 重置商城后台密码",
        text: `Reset your SnowForce shop admin password using this link:\n${link}\n\nThis link expires 15 minutes after your request and can be used once. A new request replaces the previous link.\nIf you did not request this, ignore this email. Your password has not changed.\n\n请通过以上链接重置商城后台密码。链接自申请起 15 分钟内有效，仅可使用一次；再次申请会使旧链接失效。若非本人申请，请忽略此邮件，你的密码未改变。\nCustomer service: Shop@snow-force.com`,
        html: `<html lang="en"><body style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6"><h1>Reset your shop admin password</h1><p>重置 SnowForce 商城后台密码</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 20px;background:#006bd6;color:white">Reset password / 重置密码</a></p><p>This link expires 15 minutes after your request and can be used once. A new request replaces the previous link.</p><p>链接自申请起 15 分钟内有效，仅可使用一次；再次申请会使旧链接失效。</p><p>If you did not request this, ignore this email. Your password has not changed.</p><p>若非本人申请，请忽略此邮件，你的密码未改变。</p><p>Customer service: <a href="mailto:Shop@snow-force.com">Shop@snow-force.com</a></p></body></html>`,
      },
    };
  } catch { throw new Error("Invalid admin password reset event"); }
}

export async function sendAdminReset(data: unknown, env: ResetEnvironment, dependencies: Dependencies = { fetch }) {
  const message = resetMessage(data, env.JWT_SECRET ?? "", dependencies.now?.());
  if (!env.COMMERCE_RESEND_API_KEY) throw new Error("Commerce password reset email is not configured");
  const sleep = dependencies.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) { await sleep(1000 * 2 ** (attempt - 1)); resetMessage(data, env.JWT_SECRET ?? "", dependencies.now?.()); }
    let response: Response;
    try {
      response = await dependencies.fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${env.COMMERCE_RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": message.key },
        body: JSON.stringify(message.payload), signal: AbortSignal.timeout(10000),
      });
    } catch {
      if (attempt < 2) continue;
      throw new Error("Password reset email delivery failed after retries");
    }
    // Never include provider response bodies, recipient addresses or tokens in errors/logs.
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < 2) continue;
      throw new Error(`Password reset email provider returned HTTP ${response.status}`);
    }
    const result: unknown = await response.json().catch(() => null);
    if (!z.object({ id: z.string().min(1) }).safeParse(result).success) {
      if (attempt < 2) continue;
      throw new Error("Password reset email provider returned an invalid acknowledgement");
    }
    return;
  }
}
