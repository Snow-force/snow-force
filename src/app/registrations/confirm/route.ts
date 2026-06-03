import { hasRemainingCapacity, isEventOpen } from "@/lib/events/availability";
import { getEvent } from "@/lib/events/repository";
import { buildStaffNotificationEmail, sendEmail } from "@/lib/email/adapter";
import {
  deletePendingRegistration,
  getPendingRegistrationByTokenHash,
} from "@/lib/registrations/pending-repository";
import {
  createRegistration,
  getRegistrationCountForEvent,
  getRegistrations,
} from "@/lib/registrations/repository";
import { hashRegistrationVerificationToken } from "../../../lib/registrations/token";

function redirectTo(request: Request, path: string) {
  return Response.redirect(new URL(path, request.url), 307);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) return redirectTo(request, "/events?registration=invalid");

  const pending = await getPendingRegistrationByTokenHash(hashRegistrationVerificationToken(token));
  if (!pending) return redirectTo(request, "/events?registration=invalid");

  if (Date.parse(pending.expiresAt) <= Date.now()) {
    return redirectTo(request, "/events?registration=expired");
  }

  const event = await getEvent(pending.eventSlug);
  if (!event || !isEventOpen(event)) {
    return redirectTo(request, `/events/${pending.eventSlug}?registration=unavailable`);
  }

  const registrationCount = await getRegistrationCountForEvent(event.slug);
  if (!hasRemainingCapacity({ ...event, registrationCount })) {
    return redirectTo(request, `/events/${pending.eventSlug}?registration=unavailable`);
  }

  const existingRegistrations = await getRegistrations(event.slug);
  if (
    existingRegistrations.some(
      (registration) =>
        normalizeEmail(registration.contactEmail) === normalizeEmail(pending.contactEmail),
    )
  ) {
    return redirectTo(request, `/events/${pending.eventSlug}?registration=duplicate`);
  }

  await createRegistration({
    eventSlug: pending.eventSlug,
    memberId: pending.memberId,
    answers: pending.answers,
    consentGiven: pending.consentGiven,
    contactName: pending.contactName,
    contactEmail: normalizeEmail(pending.contactEmail),
    contactPhone: pending.contactPhone,
  });
  await deletePendingRegistration(pending.id);

  const eventTitle = event.title.en || event.title.zh || event.slug;
  await sendEmail(buildStaffNotificationEmail(eventTitle, pending.contactName)).catch(() => {});

  return redirectTo(request, `/events/${pending.eventSlug}?registration=confirmed`);
}
