"use server";

import { hasRemainingCapacity, isEventOpen } from "@/lib/events/availability";
import { getEvent } from "@/lib/events/repository";
import { createRegistration, getRegistrationCountForEvent } from "@/lib/registrations/repository";
import { sendEmail, buildConfirmationEmail, buildStaffNotificationEmail } from "@/lib/email/adapter";
import { getCurrentMemberProfile } from "@/lib/members/actions";
import { validateRegistrationAnswers } from "@/lib/registrations/validation";
import type { RegistrationAnswers } from "@/lib/types";

type RegisterInput = {
  answers: RegistrationAnswers;
  consentGiven: boolean;
  lang: "en" | "zh";
};

function getStringAnswer(answers: RegistrationAnswers, key: string) {
  const value = answers[key];
  return typeof value === "string" ? value : "";
}

export async function registerForEvent(
  eventSlug: string,
  input: RegisterInput,
): Promise<{ success: true; registrationId: string } | { success: false; error: string }> {
  // Server-side validation
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
  const contactName = getStringAnswer(answers, "name");
  const contactEmail = getStringAnswer(answers, "email");
  const contactPhone = getStringAnswer(answers, "phone");

  // Persist registration first
  const member = await getCurrentMemberProfile();
  const result = await createRegistration({
    eventSlug,
    memberId: member?.id ?? null,
    answers,
    consentGiven: input.consentGiven,
    contactEmail,
    contactName,
    contactPhone,
  });

  // Fire-and-forget notifications — failure must not affect the registration
  const eventTitle =
    input.lang === "zh" ? event.title.zh || event.title.en : event.title.en || event.title.zh;
  const eventDate = new Date(event.eventDate).toLocaleDateString(
    input.lang === "zh" ? "zh-CN" : "en-US",
  );

  sendEmail(buildConfirmationEmail(contactEmail, eventTitle, eventDate, input.lang)).catch(() => {});
  sendEmail(buildStaffNotificationEmail(eventTitle, contactName)).catch(() => {});

  return { success: true, registrationId: result.registration.id };
}
