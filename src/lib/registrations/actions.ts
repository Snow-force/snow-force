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
  if (!input.consentGiven) {
    return { success: false, error: "Consent is required" };
  }

  const event = await getEvent(eventSlug);
  if (!event) {
    return { success: false, error: "Event not found" };
  }

  if (!isEventOpen(event)) {
    return { success: false, error: "Event is not open for registration" };
  }

  const registrationCount = await getRegistrationCountForEvent(event.slug);
  if (!hasRemainingCapacity({ ...event, registrationCount })) {
    return { success: false, error: "Event is not open for registration" };
  }

  const answerValidation = validateRegistrationAnswers(event.registrationQuestions, input.answers);
  if (!answerValidation.success) {
    const [error] = Object.values(answerValidation.errors);
    return { success: false, error: error ?? "Invalid registration answers" };
  }

  const answers = answerValidation.data;

  let resolvedWaiverTextEn: string | undefined;
  let resolvedWaiverTextSha: string | undefined;
  let resolvedHandwrittenSignatureDataUrl: string | undefined;

  if (event.waiverTextEn) {
    if (!input.typedName?.trim()) {
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
  const contactEmail = getStringAnswer(answers, "email");
  const contactPhone = getStringAnswer(answers, "phone");
  const normalizedContactEmail = normalizeEmail(contactEmail);

  if (!normalizedContactEmail) {
    return { success: false, error: "Email is required" };
  }

  if (!isValidEmail(normalizedContactEmail)) {
    return { success: false, error: "Email is invalid" };
  }

  const existingRegistrations = await getRegistrations(event.slug);
  if (
    existingRegistrations.some(
      (registration) => registration.memberId === memberDecision.memberId,
    )
  ) {
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
    answers,
    consentGiven: input.consentGiven,
    contactEmail: normalizedContactEmail,
    contactName,
    contactPhone,
    tokenHash: `member-pending-${crypto.randomUUID()}`,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    waiverTextEn: resolvedWaiverTextEn ?? null,
    waiverTextSha: resolvedWaiverTextSha ?? null,
    typedName: input.typedName?.trim() ?? null,
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
  };
  } catch (e) {
    console.error("registerForEvent failed:", e);
    return { success: false, error: "Something went wrong. Please try again later." };
  }
}
