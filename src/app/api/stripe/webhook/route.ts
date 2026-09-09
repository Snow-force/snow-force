import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { verifyStripeWebhookSignature } from "@/lib/payments/stripe-server";
import {
  createRegistrationRefund,
  getRegistrationRefund,
  getRegistrationRefundByStripeId,
  getRegistrationRefunds,
  updateRegistrationRefund,
} from "@/lib/payments/refund-repository";
import { reconcileStripeRefund } from "@/lib/payments/refunds";
import { getRegistration, getRegistrations, updateRegistrationFinance, updateRegistrationStatus } from "@/lib/registrations/repository";
import { fulfillCheckoutSession, type PaidCheckoutSession } from "@/lib/payments/fulfillment";

export const runtime = "nodejs";

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is not configured.");
  return url;
}

function createWebhookAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Supabase admin writes are not configured.");
  return createClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = verifyStripeWebhookSignature(rawBody, signature);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  // Idempotency: plain INSERT; if the event_id already exists, Supabase returns error code 23505.
  const adminClient = createWebhookAdminClient();
  const { error: insertError } = await adminClient
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, event_type: event.type })
    .select()
    .maybeSingle();

  const webhookAlreadyRecorded = insertError?.code === "23505";
  if (insertError && !webhookAlreadyRecorded) {
    return new Response("Server error", { status: 500 });
  }

  if (event.type === "refund.created" || event.type === "refund.updated" || event.type === "refund.failed") {
    try {
      await reconcileStripeRefund(
        {
          getRegistration,
          getRegistrations,
          updateRegistrationFinance,
          updateRegistrationStatus,
          getRegistrationRefunds,
          getRegistrationRefund,
          getRegistrationRefundByStripeId,
          createRegistrationRefund,
          updateRegistrationRefund,
        },
        event.data.object as Stripe.Refund,
      );
      revalidatePath("/admin/registrations");
      revalidatePath("/member");
      return new Response("OK", { status: 200 });
    } catch {
      return new Response("Server error", { status: 500 });
    }
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return new Response("OK", { status: 200 });
  }
  const session = event.data.object as PaidCheckoutSession;
  if (!session.metadata?.pendingRegistrationId) return new Response("OK", { status: 200 });
  try {
    await fulfillCheckoutSession(session);
    revalidatePath("/member");
    revalidatePath("/member/trips");
    revalidatePath("/admin/registrations");
    if (session.metadata.eventSlug) revalidatePath(`/events/${session.metadata.eventSlug}`);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Stripe checkout fulfillment failed", {
      eventId: event.id, sessionId: session.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
    // Retain the order and let Stripe retry; receipt of an event is not fulfillment.
    return new Response("Checkout requires reconciliation", { status: 500 });
  }
}
