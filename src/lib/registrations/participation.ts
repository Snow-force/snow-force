import type { EventRegistrationQuestion, Registration } from "@/lib/types";
import type { PendingRegistration } from "./pending-repository";
import { ensureRequiredRegistrationQuestions } from "../events/required-registration-questions";

export function participantQuestions(questions: EventRegistrationQuestion[], kind: "self" | "proxy") {
  return ensureRequiredRegistrationQuestions(questions).map((question) =>
    kind === "proxy" && question.key === "email"
      ? { ...question, required: false, label: { en: "Friend’s email (optional)", zh: "朋友邮箱（选填）" } }
      : question,
  );
}

/** Pending.memberId is the payer. Registration.memberId is always the attendee. */
export function pendingParticipantIdentity(pending: PendingRegistration) {
  const proxy = pending.registrationKind === "proxy";
  return {
    memberId: proxy ? null : pending.memberId,
    bookerMemberId: pending.memberId,
    registrationKind: proxy ? "proxy" as const : "self" as const,
    attendeeEmail: pending.attendeeEmail ?? (proxy ? null : pending.contactEmail),
    attendeeConfirmationStatus: proxy ? "pending" as const : "not_required" as const,
    clientRequestKey: pending.id,
    pendingRegistrationId: pending.id,
  };
}

export function belongsToBooker(registration: Registration, memberId: string) {
  return (registration.bookerMemberId ?? registration.memberId) === memberId;
}

export function hasActiveSelfRegistration(registrations: Registration[], memberId: string) {
  return registrations.some((row) => row.memberId === memberId && row.status !== "cancelled");
}
