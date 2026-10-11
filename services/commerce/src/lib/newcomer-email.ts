import type { ILockingModule, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { z } from "zod";
import { deliverMarketing, marketingOrigin, unsubscribeToken } from "./marketing-policy";
import type { TaxQuoteConnection } from "./tax-quote-ledger";

const dbFor = (scope: MedusaContainer) => scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
const codeSchema = z.string().regex(/^WELCOME-[A-F0-9]{32}$/);
const rowSchema = z.object({ code: codeSchema, email: z.email(), ends_at: z.coerce.date(), status: z.string(), first_attempt_at: z.coerce.date().nullable(), attempts: z.number().int(), message: z.unknown().nullable() });
export function newcomerEmailConfiguration(env: NodeJS.ProcessEnv = process.env) {
  if (env.NEWCOMER_EMAIL_ENABLED !== "true") return null;
  const from = env.NEWCOMER_EMAIL_FROM ?? env.MARKETING_SHOP_EMAIL_FROM ?? env.MARKETING_EMAIL_FROM ?? "";
  const reply = env.NEWCOMER_REPLY_TO ?? env.MARKETING_SHOP_REPLY_TO ?? env.MARKETING_REPLY_TO ?? "";
  const key = env.NEWCOMER_RESEND_API_KEY ?? env.MARKETING_RESEND_API_KEY ?? "";
  const address = env.MARKETING_POSTAL_ADDRESS ?? "", secret = env.MARKETING_UNSUBSCRIBE_SECRET ?? "";
  const rate = Number(env.MARKETING_SENDS_PER_MINUTE ?? "30");
  if (!key || !address.trim() || secret.length < 32 || !z.email().safeParse(reply).success || !/^[^\r\n]+<[^<>\s]+@[^<>\s]+>$/.test(from) || from.includes("resend.dev") || !Number.isInteger(rate) || rate < 1 || rate > 120) return null;
  try { return { from, reply, key, address, secret, rate, origin: marketingOrigin(env.SNOWFORCE_STOREFRONT_URL ?? "") }; }
  catch { return null; }
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
export function renderNewcomerEmail(email: string, code: string, endsAt: Date, config: NonNullable<ReturnType<typeof newcomerEmailConfiguration>>) {
  z.email().parse(email); codeSchema.parse(code);
  const expires = endsAt.toISOString().replace("T", " ").replace(".000Z", " UTC");
  const shop = `${config.origin}/shop`, welcome = `${config.origin}/member/welcome`;
  const unsubscribe = `${config.origin}/marketing/unsubscribe?token=${encodeURIComponent(unsubscribeToken(email, config.secret))}`;
  const en = "Welcome to SnowForce! Your account is ready. Here is the personal shop code you requested: 10% off regular-price USD merchandise, with no minimum spend. Cannot be combined with other promotions. One use per person, account and verified email. Shipping and tax are excluded.";
  const zh = "欢迎加入 SnowForce！你的账户已就绪，以下是为你领取的个人商城新人折扣码：九折（10%），无最低消费，仅限美元计价原价商品，不与其他优惠叠加。每人、每个账户及已验证邮箱仅限一次，不含运费和税费。";
  const subject = "Welcome to SnowForce — your 10% shop code / 欢迎加入，你的新人九折码";
  const text = `${en}\n\n${zh}\n\n${code}\nExpires / 有效期至: ${expires}\nShop / 前往商城: ${shop}\nYour code / 查看折扣码: ${welcome}\n\nSnowForce\n${config.address}\nContact / 联系我们: ${config.reply}\nUnsubscribe / 取消推广邮件: ${unsubscribe}`;
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f5f5f7;font-family:Arial,sans-serif;color:#272729"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:white"><tr><td style="padding:32px;line-height:1.6"><h1>Welcome to SnowForce</h1><h2 lang="zh">欢迎加入 SnowForce</h2><p>${escapeHtml(en)}</p><p lang="zh">${escapeHtml(zh)}</p><p style="font-size:20px;font-weight:bold;word-break:break-all">${escapeHtml(code)}</p><p>Expires / <span lang="zh">有效期至</span>: ${escapeHtml(expires)}</p><p><a href="${escapeHtml(shop)}" style="display:inline-block;background:#0066cc;color:white;padding:14px 20px">Shop / 前往商城</a></p><p><a href="${escapeHtml(welcome)}">View your code / 查看折扣码</a></p><hr><p style="font-size:13px">SnowForce<br>${escapeHtml(config.address)}<br><a href="mailto:${escapeHtml(config.reply)}">Contact / 联系我们</a><br><a href="${escapeHtml(unsubscribe)}">Unsubscribe / 取消推广邮件</a></p></td></tr></table></td></tr></table></body></html>`;
  return { from: config.from, reply_to: config.reply, to: [email], subject, html, text,
    headers: { "List-Unsubscribe": `<${unsubscribe.replace("/marketing/unsubscribe?", "/api/marketing/unsubscribe?")}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}

export async function queueNewcomerEmail(scope: MedusaContainer, memberId: string, customerId: string, email: string, code: string, endsAt: string) {
  const db = dbFor(scope), normalized = z.email().parse(email.trim().toLowerCase());
  await db.raw(`insert into commerce.snowforce_newcomer_emails(code,email,ends_at)
    select code,?,cast(? as timestamptz) from commerce.snowforce_newcomer_claims where member_id=? and customer_id=? and code=?
    on conflict(code) do nothing`, [normalized, endsAt, memberId, customerId, codeSchema.parse(code)]);
  const rows = z.array(z.object({ status: z.string(), delivery_status: z.string().nullable() })).parse((await db.raw("select status,delivery_status from commerce.snowforce_newcomer_emails where code=?", [code])).rows);
  if (rows.length !== 1) throw new Error("Welcome email could not be queued.");
  if (["failed", "soft_bounced", "bounced", "complained"].includes(rows[0].delivery_status ?? "")) return "unavailable" as const;
  if (rows[0].status === "accepted") return "accepted" as const;
  if (!newcomerEmailConfiguration() || ["failed", "suppressed", "expired", "attention"].includes(rows[0].status)) return "unavailable" as const;
  return "pending" as const;
}

export async function applyNewcomerEmailEvents(db: TaxQuoteConnection) {
  await db.transaction(async tx => {
    const events = z.array(z.object({ id: z.string(), code: codeSchema, email: z.email(), type: z.enum(["delivered", "failed", "soft_bounced", "bounced", "complained"]) })).parse((await tx.raw("select e.id,w.code,w.email,e.type from commerce.snowforce_marketing_events e join commerce.snowforce_newcomer_emails w on w.provider_id=e.email_id where not e.processed order by e.created_at for update of e,w skip locked limit 100")).rows);
    for (const event of events) {
      await tx.raw("update commerce.snowforce_newcomer_emails set delivery_status=? where code=? and (delivery_status is null or delivery_status not in ('failed','bounced','complained') or ? in ('bounced','complained'))", [event.type, event.code, event.type]);
      if (event.type === "bounced" || event.type === "complained") await tx.raw("insert into commerce.snowforce_marketing_suppressions(email,reason) values(?,?) on conflict(email) do update set reason=excluded.reason", [event.email, event.type]);
      await tx.raw("update commerce.snowforce_marketing_events set processed=true where id=?", [event.id]);
    }
  });
}

export async function processNewcomerEmails(scope: MedusaContainer, send: typeof deliverMarketing = deliverMarketing) {
  const config = newcomerEmailConfiguration();
  if (!config) return;
  const db = dbFor(scope), locking = scope.resolve<ILockingModule>(Modules.LOCKING);
  // Share the sender budget and worker lock with event/shop campaigns.
  return locking.execute("snowforce-marketing-worker", async signal => {
    await applyNewcomerEmailEvents(db);
    const started = Date.now();
    for (let index = 0; index < Math.min(config.rate, 10); index++) {
      if (signal?.aborted || Date.now() - started > 45000) break;
      if (!(await db.raw("insert into commerce.snowforce_marketing_rate_windows(minute,attempts) values(date_trunc('minute',now()),1) on conflict(minute) do update set attempts=snowforce_marketing_rate_windows.attempts+1 where snowforce_marketing_rate_windows.attempts<? returning minute", [config.rate])).rows.length) break;
      const row = await db.transaction(async tx => {
        const rows = (await tx.raw("select * from commerce.snowforce_newcomer_emails where (status='queued' and next_attempt_at<=now()) or (status='sending' and lease_until<now()) order by next_attempt_at for update skip locked limit 1")).rows;
        if (!rows.length) return null;
        const recipient = rowSchema.parse(rows[0]);
        // Stop before the provider's 24-hour idempotency cache expires.
        if (recipient.first_attempt_at && Date.now() - recipient.first_attempt_at.getTime() > 23 * 3600000) {
          await tx.raw("update commerce.snowforce_newcomer_emails set status='attention',error_code='idempotency_window',lease_until=null where code=?", [recipient.code]); return null;
        }
        await tx.raw("update commerce.snowforce_newcomer_emails set status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_until=now()+interval '2 minutes' where code=?", [recipient.code]);
        return recipient;
      });
      if (!row) break;
      try {
        const active = (await db.raw("select id from commerce.promotion where code=? and deleted_at is null and status='active' and used=0", [row.code])).rows.length > 0;
        if (!active || row.ends_at.getTime() <= Date.now()) {
          await db.raw("update commerce.snowforce_newcomer_emails set status='expired',lease_until=null where code=?", [row.code]); continue;
        }
        if ((await db.raw("select email from commerce.snowforce_marketing_suppressions where email=? and reason in ('bounced','complained')", [row.email])).rows.length) {
          await db.raw("update commerce.snowforce_newcomer_emails set status='suppressed',lease_until=null where code=?", [row.code]); continue;
        }
        if (signal?.aborted) break;
        const message = row.message ?? renderNewcomerEmail(row.email, row.code, row.ends_at, config);
        await db.raw("update commerce.snowforce_newcomer_emails set message=cast(? as jsonb) where code=? and message is null", [JSON.stringify(message), row.code]);
        if (signal?.aborted) break;
        const result = await send(message, `newcomer-welcome/${row.code}`, config.key);
        if (result.status === "accepted") await db.raw("update commerce.snowforce_newcomer_emails set status='accepted',provider_id=?,lease_until=null,error_code=null where code=?", [result.id, row.code]);
        else await db.raw("update commerce.snowforce_newcomer_emails set status=?,error_code=?,lease_until=null,next_attempt_at=now()+(? * interval '1 second') where code=?", [result.status === "failed" ? "failed" : "queued", result.code, Math.min(3600, 60 * 2 ** Math.min(row.attempts, 6)), row.code]);
      } catch {
        await db.raw("update commerce.snowforce_newcomer_emails set status='queued',error_code='service_unavailable',lease_until=null,next_attempt_at=now()+interval '2 minutes' where code=? and status='sending'", [row.code]);
      }
    }
    await applyNewcomerEmailEvents(db);
  }, { timeout: 1, expire: 180 });
}
