import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { verifyStripeWebhookSignature } from "@/lib/payments/stripe-server";
import {
  getPendingRegistrationById,
  deletePendingRegistration,
} from "@/lib/registrations/pending-repository";
import {
  createRegistration,
  getRegistrations,
  getRegistrationCountForEvent,
} from "@/lib/registrations/repository";
import { getEvent } from "@/lib/events/repository";
import { hasRemainingCapacity } from "@/lib/events/availability";
import { defaultRegistrationFinance } from "@/lib/registrations/finance";
import { createWaiverAcceptance } from "@/lib/registrations/waiver-repository";
import type { RegistrationFinance } from "@/lib/types";

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

function isDuplicateRegistrationError(message: string) {
  return (
    message.includes("registrations_one_member_per_event") ||
    message.includes("duplicate key")
  );
}

type CheckoutSessionObject = {
  amount_total: number | null;
  metadata?: Record<string, string | undefined> | null;
};

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

  if (event.type !== "checkout.session.completed") {
    return new Response("OK", { status: 200 });
  }

  const session = event.data.object as unknown as CheckoutSessionObject;
  const pendingRegistrationId = session.metadata?.pendingRegistrationId;
  if (!pendingRegistrationId) {
    return new Response("OK", { status: 200 });
  }

  const pending = await getPendingRegistrationById(pendingRegistrationId);
  if (!pending) {
    return new Response("OK", { status: 200 });
  }

  const dbEvent = await getEvent(pending.eventSlug);
  if (!dbEvent) {
    return new Response("OK", { status: 200 });
  }

  // Re-read paymentModel + currency from the DB (do NOT trust metadata — the event may have been edited).
  const paymentModel = dbEvent.paymentModel;
  const currency = dbEvent.depositCurrency;

  // Re-check capacity.
  const registrationCount = await getRegistrationCountForEvent(dbEvent.slug);
  if (!hasRemainingCapacity({ ...dbEvent, registrationCount })) {
    return new Response("OK", { status: 200 });
  }

  // Re-check duplicate (non-cancelled registrations for this member).
  const existing = await getRegistrations(dbEvent.slug);
  const existingRegistration = existing.find(
    (r) => r.memberId === pending.memberId && r.status !== "cancelled",
  );
  if (existingRegistration) {
    if (pending.waiverTextEn && pending.waiverTextSha && pending.typedName) {
      await createWaiverAcceptance({
        registrationId: existingRegistration.id,
        legalTextSnapshot: pending.waiverTextEn,
        waiverTextSha: pending.waiverTextSha,
        typedName: pending.typedName,
        handwrittenSignatureDataUrl: pending.handwrittenSignatureDataUrl ?? null,
        acceptedAt: new Date().toISOString(),
      });
    }
    await deletePendingRegistration(pending.id);
    return new Response(webhookAlreadyRecorded ? "OK already processed" : "OK", { status: 200 });
  }

  // Compute paid amount from session.amount_total (smallest currency unit) → decimal.
  if (session.amount_total === null || session.amount_total <= 0) {
    return new Response("OK", { status: 200 });
  }
  const paidAmount = currency === "jpy" ? session.amount_total : session.amount_total / 100;

  const baseAmount = paymentModel === "deposit" ? dbEvent.depositAmount : dbEvent.fullPaymentAmount;
  if (baseAmount === null || baseAmount <= 0) return new Response("OK", { status: 200 });
  let couponCode = "";
  let discountAmount = 0;
  if (pending.couponCode) {
    if (paidAmount > baseAmount) return new Response("OK", { status: 200 });
    couponCode = pending.couponCode;
    discountAmount = Math.round((baseAmount - paidAmount) * 100) / 100;
  } else {
    const expectedAmount = currency === "jpy" ? Math.round(baseAmount) : Math.round(baseAmount * 100) / 100;
    if (paidAmount !== expectedAmount) return new Response("OK", { status: 200 });
  }

  const paidAt = new Date().toISOString();
  const finance: RegistrationFinance = {
    ...defaultRegistrationFinance,
    depositStatus: "paid",
    depositAmount: paidAmount,
    depositPaidAt: paidAt,
    paymentMethod: "stripe",
    finalAmount: paymentModel === "full_prepay" ? paidAmount : null,
    settlementAmount: paymentModel === "full_prepay" ? 0 : null,
    settlementStatus: paymentModel === "full_prepay" ? "settled" : "not_started",
    couponCode,
    discountAmount,
  };

  try {
    const result = await createRegistration({
      eventSlug: dbEvent.slug,
      memberId: pending.memberId,
      answers: pending.answers,
      consentGiven: pending.consentGiven,
      contactEmail: pending.contactEmail,
      contactName: pending.contactName,
      contactPhone: pending.contactPhone,
      finance,
    });
    if (pending.waiverTextEn && pending.waiverTextSha && pending.typedName) {
      await createWaiverAcceptance({
        registrationId: result.registration.id,
        legalTextSnapshot: pending.waiverTextEn,
        waiverTextSha: pending.waiverTextSha,
        typedName: pending.typedName,
        handwrittenSignatureDataUrl: pending.handwrittenSignatureDataUrl ?? null,
        acceptedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    // Race-safe: if a parallel webhook delivery already created the registration (unique index
    // registrations_one_member_per_event), treat as success.
    const msg = err instanceof Error ? err.message : String(err);
    if (isDuplicateRegistrationError(msg)) {
      const registration = (await getRegistrations(dbEvent.slug)).find(
        (item) => item.memberId === pending.memberId && item.status !== "cancelled",
      );
      if (!registration) return new Response("Server error", { status: 500 });
      if (pending.waiverTextEn && pending.waiverTextSha && pending.typedName) {
        await createWaiverAcceptance({
          registrationId: registration.id,
          legalTextSnapshot: pending.waiverTextEn,
          waiverTextSha: pending.waiverTextSha,
          typedName: pending.typedName,
          handwrittenSignatureDataUrl: pending.handwrittenSignatureDataUrl ?? null,
          acceptedAt: new Date().toISOString(),
        });
      }
      await deletePendingRegistration(pending.id);
      return new Response("OK", { status: 200 });
    }
    return new Response("Server error", { status: 500 });
  }

  await deletePendingRegistration(pending.id);

  revalidatePath("/member");
  revalidatePath(`/events/${dbEvent.slug}`);

  return new Response("OK", { status: 200 });
}
