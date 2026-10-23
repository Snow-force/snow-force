"use server";

import { revalidatePath } from "next/cache";

import { getCoupon, getCouponRedemptionCount } from "@/lib/coupons/repository";
import { quoteCoupon } from "@/lib/coupons/validation";
import { hasRemainingCapacity, isEventOpen } from "@/lib/events/availability";
import { getEvent } from "@/lib/events/repository";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { canSubmitMemberRegistration } from "@/lib/registrations/member-gate";
import {
  createOrRefreshPendingRegistration,
} from "@/lib/registrations/pending-repository";
import { getRegistrationCountForEvent, getRegistrations } from "@/lib/registrations/repository";
import { validateRegistrationAnswers } from "@/lib/registrations/validation";
import { getActiveWaiverForEvent } from "@/lib/registrations/waiver-repository";
import { computeWaiverSha } from "@/lib/registrations/waiver";
import { hasActiveSelfRegistration } from "./participation";
import type { PaymentCurrency, RegistrationAnswers } from "@/lib/types";

type RegisterInput = {
  answers: RegistrationAnswers;
  consentGiven: boolean;
  lang: "en" | "zh";
  waiverTextEn?: string;
  waiverTextSha?: string;
  typedName?: string;
  handwrittenSignatureDataUrl?: string;
  couponCode?: string;
  registrationKind?: "self" | "proxy";
  clientRequestKey?: string;
  proxyConsent?: boolean;
};

export type RegisterForEventResult =
  | {
      success: true;
      pending: true;
      email: string;
      confirmation: "member";
      pendingRegistrationId: string;
      paymentQuote?: {
        code: string;
        originalAmount: number;
        discountAmount: number;
        finalAmount: number;
        currency: PaymentCurrency;
      };
      duplicateWarning?: boolean;
    }
  | { success: false; error: string };

function getStringAnswer(answers: RegistrationAnswers, key: string) {
  const value = answers[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidHandwrittenSignature(value: string | undefined) {
  return Boolean(
    value &&
      value.length <= 1_000_000 &&
      /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value),
  );
}

export async function registerForEvent(
  eventSlug: string,
  input: RegisterInput,
): Promise<RegisterForEventResult> {
  try {
  const kind = input.registrationKind ?? "self";
  if (input.lang !== "en" && input.lang !== "zh") return { success: false, error: "Invalid language" };
  if (kind !== "self" && kind !== "proxy") return { success: false, error: "Invalid registration kind" };
  if (!input.consentGiven) {
    return { success: false, error: "Consent is required" };
  }

  const event = await getEvent(eventSlug);
  if (!event) {
    return { success: false, error: "Event not found" };
  }

  if (kind === "proxy") {
    if (!event.allowProxyRegistrations) {
      return { success: false, error: "Friend registration is not available for this event." };
    }
    if (!input.proxyConsent) return { success: false, error: "Your friend’s permission to submit their details is required." };
    if (!input.clientRequestKey || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.clientRequestKey)) {
      return { success: false, error: "Invalid registration request. Please reload the form." };
    }
    if (input.typedName || input.handwrittenSignatureDataUrl) {
      return { success: false, error: "Your friend must sign their own waiver using the invitation link." };
    }
  }

  if (!isEventOpen(event)) {
    return { success: false, error: "Event is not open for registration" };
  }

  const registrationCount = await getRegistrationCountForEvent(event.slug);
  if (!hasRemainingCapacity({ ...event, registrationCount })) {
    return { success: false, error: "Event is not open for registration" };
  }

  const answerValidation = validateRegistrationAnswers(event.registrationQuestions, input.answers, kind);
  if (!answerValidation.success) {
    const [error] = Object.values(answerValidation.errors);
    return { success: false, error: error ?? "Invalid registration answers" };
  }

  const answers = answerValidation.data;

  let resolvedWaiverTextEn: string | undefined;
  let resolvedWaiverTextSha: string | undefined;
  let resolvedHandwrittenSignatureDataUrl: string | undefined;

  if (event.waiverTextEn) {
    if (kind === "self" && !input.typedName?.trim()) {
      return { success: false, error: "Electronic signature is required" };
    }
    if (input.handwrittenSignatureDataUrl && !isValidHandwrittenSignature(input.handwrittenSignatureDataUrl)) {
      return { success: false, error: "Handwritten signature is invalid" };
    }
    const activeWaiver = await getActiveWaiverForEvent(event.slug);
    if (!activeWaiver) {
      return { success: false, error: "Waiver not available for this event" };
    }
    const serverSha = await computeWaiverSha(activeWaiver.text);
    resolvedWaiverTextEn = activeWaiver.text;
    resolvedWaiverTextSha = serverSha;
    resolvedHandwrittenSignatureDataUrl = input.handwrittenSignatureDataUrl || undefined;
  }
  const account = await getCurrentMemberAccount();
  const memberDecision = canSubmitMemberRegistration(
    account?.profile ? { profile: account.profile, emailConfirmed: account.emailConfirmed } : null,
  );
  if (!memberDecision.allowed) {
    return {
      success: false,
      error: account?.profile
        ? memberDecision.error
        : "Sign in as a verified SnowForce member before registering for events.",
    };
  }

  if (!memberDecision.memberId) {
    return { success: false, error: "Sign in as a verified SnowForce member before registering for events." };
  }

  const contactName = getStringAnswer(answers, "name");
  const attendeeEmail = normalizeEmail(getStringAnswer(answers, "email"));
  const contactEmail = kind === "proxy"
    ? account?.user?.email ?? account?.profile?.email ?? ""
    : attendeeEmail;
  const contactPhone = getStringAnswer(answers, "phone");
  const normalizedContactEmail = normalizeEmail(contactEmail);

  if (!normalizedContactEmail) {
    return { success: false, error: "Email is required" };
  }

  if (!isValidEmail(normalizedContactEmail)) {
    return { success: false, error: "Email is invalid" };
  }

  const existingRegistrations = await getRegistrations(event.slug);
  const duplicateWarning = kind === "proxy" && existingRegistrations.some((row) => row.status !== "cancelled" &&
    row.contactName.trim().toLowerCase() === contactName.toLowerCase() &&
    ((contactPhone && row.contactPhone === contactPhone) || (attendeeEmail && row.attendeeEmail?.toLowerCase() === attendeeEmail)));
  if (kind === "self" && hasActiveSelfRegistration(existingRegistrations, memberDecision.memberId)) {
    return { success: false, error: "You are already registered for this event." };
  }

  const normalizedCouponCode = input.couponCode?.trim().toUpperCase() || "";
  let paymentQuote: Extract<RegisterForEventResult, { success: true }>["paymentQuote"];

  if (normalizedCouponCode) {
    if (event.paymentModel === "free") {
      return { success: false, error: "This event does not require a coupon" };
    }

    const originalAmount = event.paymentModel === "deposit" ? event.depositAmount : event.fullPaymentAmount;
    if (originalAmount === null || originalAmount <= 0) {
      return { success: false, error: "Invalid payment amount" };
    }

    const coupon = await getCoupon(normalizedCouponCode);
    if (!coupon) {
      return { success: false, error: "Coupon code is invalid" };
    }

    const quote = quoteCoupon(
      coupon,
      originalAmount,
      await getCouponRedemptionCount(coupon.code),
      event.slug,
    );
    if ("error" in quote) {
      return { success: false, error: quote.error };
    }

    paymentQuote = {
      ...quote,
      originalAmount,
      currency: event.depositCurrency,
    };
  }

  const pending = await createOrRefreshPendingRegistration({
    eventSlug,
    memberId: memberDecision.memberId,
    registrationKind: kind,
    preferredLanguage: input.lang,
    participantKey: kind === "proxy" ? input.clientRequestKey!.toLowerCase() : "self",
    attendeeEmail: attendeeEmail || null,
    holdExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    answers,
    consentGiven: input.consentGiven,
    contactEmail: normalizedContactEmail,
    contactName,
    contactPhone,
    tokenHash: `member-pending-${crypto.randomUUID()}`,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    waiverTextEn: resolvedWaiverTextEn ?? null,
    waiverTextSha: resolvedWaiverTextSha ?? null,
    typedName: kind === "self" ? input.typedName?.trim() ?? null : null,
    handwrittenSignatureDataUrl: resolvedHandwrittenSignatureDataUrl ?? null,
    couponCode: normalizedCouponCode || null,
  });

  revalidatePath("/member");
  // Resubmitting cannot change the quote or identity of an in-flight checkout.
  if (pending.checkoutAttempt) {
    const attempt = pending.checkoutAttempt;
    paymentQuote = { code: attempt.couponCode, originalAmount: attempt.amount + attempt.discountAmount,
      discountAmount: attempt.discountAmount, finalAmount: attempt.amount, currency: attempt.currency };
  }
  return {
    success: true,
    pending: true,
    email: pending.contactEmail,
    confirmation: "member",
    pendingRegistrationId: pending.id,
    ...(paymentQuote ? { paymentQuote } : {}),
    ...(duplicateWarning ? { duplicateWarning: true } : {}),
  };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("proxy_registration_limit")) return { success: false, error: "You have reached this event’s friend registration limit." };
    if (message.includes("registration_capacity_exceeded")) return { success: false, error: "No unreserved places remain. Please try again later." };
    console.error("registerForEvent failed");
    return { success: false, error: "Something went wrong. Please try again later." };
  }
}
