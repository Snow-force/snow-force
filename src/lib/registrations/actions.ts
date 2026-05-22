"use server";

import { isEventOpen } from "@/lib/events/availability";
import { getEvent } from "@/lib/events/repository";
import { createRegistration, getRegistrationCountForEvent } from "@/lib/registrations/repository";
import { sendEmail, buildConfirmationEmail, buildStaffNotificationEmail } from "@/lib/email/adapter";
import { getCurrentMemberProfile } from "@/lib/members/actions";

type RegisterInput = {
  answers: Record<string, string>;
  consentGiven: boolean;
  lang: "en" | "zh";
};

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

  if (!isEventOpen(event) || (await getRegistrationCountForEvent(event.slug)) >= event.capacity) {
    return { success: false, error: "Event is not open for registration" };
  }

  // Validate required fields
  for (const field of event.registrationFields) {
    if (field.required) {
      const value = input.answers[field.key];
      if (!value || !value.trim()) {
        return { success: false, error: `${field.key} is required` };
      }
      if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return { success: false, error: "Invalid email format" };
      }
    }
  }

  const contactName = input.answers["name"] || "";
  const contactEmail = input.answers["email"] || "";
  const contactPhone = input.answers["phone"] || "";

  // Persist registration first
  const member = await getCurrentMemberProfile();
  const result = await createRegistration({
    eventSlug,
    memberId: member?.id ?? null,
    answers: input.answers,
    consentGiven: input.consentGiven,
    contactEmail,
    contactName,
    contactPhone,
  });

  // Fire-and-forget notifications — failure must not affect the registration
  const eventTitle = input.lang === "zh" ? event.title.zh : event.title.en;
  const eventDate = new Date(event.eventStartAt).toLocaleDateString(
    input.lang === "zh" ? "zh-CN" : "en-US",
  );

  sendEmail(buildConfirmationEmail(contactEmail, eventTitle, eventDate, input.lang)).catch(() => {});
  sendEmail(buildStaffNotificationEmail(eventTitle, contactName)).catch(() => {});

  return { success: true, registrationId: result.registration.id };
}
