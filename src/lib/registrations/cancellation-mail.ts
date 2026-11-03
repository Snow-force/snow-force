import "server-only";
import { after } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/server";
import { generalContactEmail } from "@/lib/contact";
type Mail = {
  id: string;
  registration_id: string;
  audience: "member" | "staff";
  subject: string;
  body: string;
  attempts: number;
};
export function escapeMailText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export async function dispatchCancellationMail() {
  if (!process.env.RESEND_API_KEY) return;
  const client = createAdminClient();
  const { data, error } = await client.rpc("claim_cancellation_mail");
  if (error) throw new Error("Cancellation mail unavailable");
  for (const mail of (data ?? []) as Mail[]) {
    const { data: r, error: readError } = await client
      .from("registrations")
      .select("contact_email,contact_name,event_slug")
      .eq("id", mail.registration_id)
      .single();
    if (readError || !r)
      throw new Error("Cancellation mail registration unavailable");
    const to =
      mail.audience === "staff"
        ? process.env.STAFF_NOTIFICATION_EMAIL || generalContactEmail
        : r.contact_email;
    const path =
      mail.audience === "staff"
        ? "/admin/registrations#cancellations"
        : "/member/trips#cancellations";
    let sent = false;
    let permanent = false;
    try {
      const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
        {
          from: "SnowForce <noreply@notifications.snow-force.com>",
          replyTo: generalContactEmail,
          to,
          subject: mail.subject,
          text: `${r.contact_name} · ${r.event_slug}\n${mail.body}\nhttps://snow-force.com${path}`,
          html: `<h2>${escapeMailText(mail.subject)}</h2><p>${escapeMailText(r.contact_name)} · ${escapeMailText(r.event_slug)}</p><p>${escapeMailText(mail.body)}</p><p><a href="https://snow-force.com${path}">View status / 查看状态</a></p>`,
        },
        { idempotencyKey: `cancellation-mail/${mail.id}` },
      );
      sent = !result.error;
      const code = result.error?.statusCode;
      permanent = Boolean(code && code >= 400 && code < 500 && code !== 429);
    } catch {
      /* Durable queue retains transient provider failures. */
    }
    const { error: saveError } = await client
      .from("registration_cancellation_mail")
      .update({
        status: sent
          ? "sent"
          : permanent || mail.attempts >= 8
            ? "failed"
            : "queued",
        sent_at: sent ? new Date().toISOString() : null,
        available_at: new Date(
          Date.now() + Math.min(3600000, 30000 * 2 ** mail.attempts),
        ).toISOString(),
      })
      .eq("id", mail.id)
      .eq("attempts", mail.attempts);
    if (saveError) throw new Error("Cancellation mail receipt unavailable");
  }
}
export function scheduleCancellationMail() {
  after(async () => {
    try {
      await dispatchCancellationMail();
    } catch {
      console.error("[cancellation] mail deferred; durable queue retained");
    }
  });
}
