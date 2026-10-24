import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.RESEND_WAIVER_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook unavailable" }, { status: 503 });
  let event: ReturnType<Resend["webhooks"]["verify"]>;
  try {
    event = new Resend(process.env.RESEND_API_KEY ?? "verification-only").webhooks.verify({ payload: await request.text(),
      headers: { id: request.headers.get("svix-id") ?? "", timestamp: request.headers.get("svix-timestamp") ?? "", signature: request.headers.get("svix-signature") ?? "" }, webhookSecret: secret });
  } catch { return Response.json({ error: "Invalid signature" }, { status: 400 }); }
  if (!["email.delivered", "email.bounced", "email.complained", "email.failed"].includes(event.type) || !("email_id" in event.data)) return Response.json({ ignored: true });
  const { error } = await createAdminClient().rpc("record_event_waiver_delivery", { event_id_input: request.headers.get("svix-id"), message_id_input: event.data.email_id, type_input: event.type });
  return error ? Response.json({ error: "Delivery event deferred" }, { status: 503 }) : Response.json({ received: true });
}
