import { Resend } from "resend";
import { marketingRequest } from "@/lib/marketing/client";
export async function POST(request: Request) {
  const secret = process.env.MARKETING_WEBHOOK_SECRET;
  if (!secret) return new Response(null, { status: 503 });
  const payload = await request.text();
  if (payload.length > 200000) return new Response(null, { status: 413 });
  let event;
  try {
    event = new Resend(process.env.RESEND_API_KEY ?? "webhook-verification-only").webhooks.verify({ payload, headers: { id: request.headers.get("svix-id") ?? "", timestamp: request.headers.get("svix-timestamp") ?? "", signature: request.headers.get("svix-signature") ?? "" }, webhookSecret: secret });
  } catch { return new Response(null, { status: 400 }); }
  if ("tags" in event.data && event.data.tags?.stream === "event-waiver-v2") return Response.json({ received: true });
  if (!["email.delivered", "email.bounced", "email.complained", "email.failed"].includes(event.type)) return Response.json({ received: true });
  try {
    if (!("email_id" in event.data)) return new Response(null, { status: 400 });
    await marketingRequest({ kind: "webhook", event: { id: request.headers.get("svix-id"), type: event.type, emailId: event.data.email_id, ...(event.type === "email.bounced" ? { bounceType: event.data.bounce.type } : {}) } });
    return Response.json({ received: true });
  } catch { return new Response(null, { status: 503 }); }
}
