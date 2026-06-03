"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { hasRemainingCapacity, isEventOpen } from "@/lib/events/availability";
import { getEvent } from "@/lib/events/repository";
import { buildRegistrationVerificationEmail, sendEmail } from "@/lib/email/adapter";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { canSubmitMemberRegistration } from "@/lib/registrations/member-gate";
import {
  createOrRefreshPendingRegistration,
  hasPendingRegistrationForEmail,
} from "@/lib/registrations/pending-repository";
import { getRegistrationCountForEvent, getRegistrations } from "@/lib/registrations/repository";
import {
  createRegistrationVerificationToken,
  hashRegistrationVerificationToken,
} from "./token";
import { validateRegistrationAnswers } from "@/lib/registrations/validation";
import type { RegistrationAnswers } from "@/lib/types";

type RegisterInput = {
  answers: RegistrationAnswers;
  consentGiven: boolean;
  lang: "en" | "zh";
};

export type RegisterForEventResult =
  | { success: true; pending: true; email: string; confirmation: "email" | "member" }
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

function confirmationOrigin() {
  return headers().get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export async function registerForEvent(
  eventSlug: string,
  input: RegisterInput,
): Promise<RegisterForEventResult> {
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
  const account = await getCurrentMemberAccount();
  const memberDecision = canSubmitMemberRegistration(
    account?.profile ? { profile: account.profile, emailConfirmed: account.emailConfirmed } : null,
  );
  if (!memberDecision.allowed) {
    return { success: false, error: memberDecision.error };
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
      (registration) => normalizeEmail(registration.contactEmail) === normalizedContactEmail,
    )
  ) {
    return { success: false, error: "This email is already registered for this event." };
  }

  if (await hasPendingRegistrationForEmail(event.slug, normalizedContactEmail)) {
    return {
      success: false,
      error: memberDecision.memberId
        ? "Confirm this registration in your member home before submitting again."
        : "Check your email to confirm this registration before submitting again.",
    };
  }

  const token = createRegistrationVerificationToken();

  await createOrRefreshPendingRegistration({
    eventSlug,
    memberId: memberDecision.memberId,
    answers,
    consentGiven: input.consentGiven,
    contactEmail: normalizedContactEmail,
    contactName,
    contactPhone,
    tokenHash: hashRegistrationVerificationToken(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  if (memberDecision.memberId) {
    revalidatePath("/member");
    return {
      success: true,
      pending: true,
      email: normalizedContactEmail,
      confirmation: "member",
    };
  }

  const confirmationUrl = new URL("/registrations/confirm", confirmationOrigin());
  confirmationUrl.searchParams.set("token", token);
  const eventTitle =
    input.lang === "zh" ? event.title.zh || event.title.en : event.title.en || event.title.zh;

  await sendEmail(
    buildRegistrationVerificationEmail(
      normalizedContactEmail,
      eventTitle,
      confirmationUrl.toString(),
      input.lang,
    ),
  );

  return {
    success: true,
    pending: true,
    email: normalizedContactEmail,
    confirmation: "email",
  };
}
