import "server-only";
import { Resend } from "resend";
import { generalContactEmail } from "@/lib/contact";

function escape(value: string) { return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
export type WaiverEmailData = { kind: "invitation" | "verification" | "reminder" | "signed" | "declined"; name: string; event: string; role: string; lang: "en" | "zh"; token?: string; code?: string };
export function buildWaiverEmail(data: WaiverEmailData) {
  const zh = data.lang === "zh";
  const heading = data.kind === "verification" ? zh ? "验证签署邮箱" : "Verify your signing email"
    : data.kind === "signed" ? zh ? "免责签署已记录" : "Waiver signature recorded"
    : data.kind === "declined" ? zh ? "已记录拒签" : "Waiver declined"
    : data.role === "guardian" ? zh ? "请父母或法定监护人签署活动免责" : "Parent / legal guardian waiver required" : zh ? "请亲自签署活动免责" : "Your personal event waiver";
  let action = "";
  const ageNotice = data.role === "unconfirmed" ? `<p>${zh ? "签署时请确认参加者是否已满 18 岁。成年人勾选后亲自签署，无需监护人；未成年人由父母或法定监护人验证自己的邮箱并签署。无需填写出生日期。" : "Confirm whether the attendee is 18 or older when signing. Adults check the box and sign personally, without a guardian signature. For a minor, a parent or legal guardian must verify their own email and sign. No birth date is required."}</p>` : "";
  if (data.kind === "verification") {
    if (!data.code || !/^\d{6}$/.test(data.code)) throw new Error("Invalid waiver verification payload");
    action = `<p>${zh ? "验证码（10 分钟内有效）" : "Verification code (valid for 10 minutes)"}: <strong>${data.code}</strong></p>`;
  } else if (["invitation", "reminder"].includes(data.kind)) {
    if (!data.token || !/^[a-f0-9]{64}$/.test(data.token)) throw new Error("Invalid waiver invitation payload");
    const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://snow-force.com");
    if (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("Invalid waiver site URL");
    // Fragments stay in the recipient's browser, outside HTTP access-log paths and referrers.
    const link = new URL(`/events/waivers#${data.token}`, origin).href;
    action = `<p><a href="${escape(link)}">${zh ? "查看并签署个人免责" : "Review and sign the personal waiver"}</a></p><p>${zh ? "请在活动签到前完成。此私人链接仅供指定参加者或监护人使用；打开后还需验证此邮箱。" : "Complete before event check-in. This private link is for the designated attendee or guardian only; you must also verify this email after opening it."}</p>`;
  }
  return { subject: `${heading} — ${data.event.replace(/[\r\n]/g, " ")}`, html: `<!doctype html><html lang="${zh ? "zh-CN" : "en"}" dir="ltr"><head><meta charset="utf-8"><title>${escape(heading)}</title></head><body style="font-family:Arial,sans-serif;color:#1d1d1f;line-height:1.6"><div lang="${zh ? "zh-CN" : "en"}" dir="ltr"><h1>${escape(heading)}</h1><p>${escape(data.name)} · ${escape(data.event)}</p>${action}${ageNotice}<p>${zh ? "每位参加者均须单独签署。监护人以自己的姓名签署，且不因此获得活动名额。此邮件不包含营销订阅或肖像授权。" : "Each attendee needs an individual waiver. Guardians sign using their own name and do not receive an attendee place by signing. This email does not grant marketing or photo consent."}</p><p>${zh ? "活动支持" : "Event support"}: <a href="mailto:${generalContactEmail}">${generalContactEmail}</a></p></div></body></html>` };
}
export async function sendWaiverEmail(to: string, data: WaiverEmailData, idempotencyKey: string) {
  if (!process.env.RESEND_API_KEY) return { success: false as const, errorCode: "provider_not_configured" };
  try {
    const { data: sent, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: "SnowForce <noreply@notifications.snow-force.com>", replyTo: generalContactEmail, to, tags: [{ name: "stream", value: "event-waiver-v2" }], ...buildWaiverEmail(data) }, { idempotencyKey });
    if (error || !sent?.id) return { success: false as const, errorCode: "provider_rejected" };
    return { success: true as const, messageId: sent.id };
  } catch { return { success: false as const, errorCode: "provider_unavailable" }; }
}
