import type { Event, RegistrationAnswers } from "@/lib/types";
import { validateRegistrationAnswers } from "../validation";

export type SignerRole = "attendee" | "guardian";
export type ParticipantInput = {
  key: string;
  kind: "self" | "proxy";
  dateOfBirth: string;
  attendeeEmail: string;
  guardianName: string;
  guardianEmail: string;
  guardianRelationship: string;
  accompanyingGuardianName?: string;
  accompanyingGuardianPhone?: string;
  accompanyingGuardianRelationship?: string;
  guardianWillAttend?: boolean;
  answers: RegistrationAnswers;
  couponCode?: string;
};
export type WaiverPolicy = {
  eventSlug: string;
  eventDate: string;
  timeZone: string;
  version: string;
  adultText: string;
  guardianText: string;
  approved: boolean;
  enableGroupForm: boolean;
  requireEmailedWaiver: boolean;
};
export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** Date-only birth dates are compared with the event's local calendar day, never the visitor's current clock. */
export function ageOnDate(dateOfBirth: string, eventDate: string): number | null {
  if (!validDate(dateOfBirth) || !validDate(eventDate) || dateOfBirth > eventDate) return null;
  const years = Number(eventDate.slice(0, 4)) - Number(dateOfBirth.slice(0, 4));
  if (years > 120) return null;
  return years - (eventDate.slice(5) < dateOfBirth.slice(5) ? 1 : 0);
}

export function signerRoleOnEventDate(dateOfBirth: string, eventDate: string): SignerRole | null {
  const age = ageOnDate(dateOfBirth, eventDate);
  return age === null ? null : age >= 18 ? "attendee" : "guardian";
}

export function localCalendarDate(timeZone = "America/Los_Angeles", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map((type) => parts.find((p) => p.type === type)?.value).join("-");
}

export function validateParticipants(event: Event, input: unknown, bookerEmail: string, today = localCalendarDate()) {
  if (!Array.isArray(input) || !input.length || input.length > (event.maxProxyRegistrations ?? 5) + 1) return { error: "Invalid participant count" };
  const participants: Array<ParticipantInput & { signerRole: SignerRole; recipientEmail: string; name: string }> = [];
  const keys = new Set<string>();
  const identities = new Set<string>();
  let selfCount = 0;
  let proxyCount = 0;
  let duplicateWarning = false;
  for (const value of input) {
    if (!value || typeof value !== "object") return { error: "Invalid participant" };
    const p = value as Partial<ParticipantInput>;
    if (typeof p.key !== "string" || !uuidPattern.test(p.key) || keys.has(p.key) || !["self", "proxy"].includes(p.kind ?? "")) return { error: "Invalid participant key" };
    keys.add(p.key);
    if (p.kind === "self") selfCount++; else proxyCount++;
    if (selfCount > 1 || proxyCount > (event.maxProxyRegistrations ?? 5) || (proxyCount > 0 && !event.allowProxyRegistrations)) return { error: "Participant limit exceeded" };
    const dateOfBirth = typeof p.dateOfBirth === "string" ? p.dateOfBirth : "";
    const signerRole = signerRoleOnEventDate(dateOfBirth, event.eventDate);
    if (!signerRole || dateOfBirth > today) return { error: "Provide an existing, valid birth date for every participant" };
    const accompanyingGuardianName = typeof p.accompanyingGuardianName === "string" ? p.accompanyingGuardianName.trim() : "";
    const accompanyingGuardianPhone = typeof p.accompanyingGuardianPhone === "string" ? p.accompanyingGuardianPhone.trim() : "";
    const accompanyingGuardianRelationship = typeof p.accompanyingGuardianRelationship === "string" ? p.accompanyingGuardianRelationship : "";
    const needsAccompaniment = ageOnDate(dateOfBirth, event.eventDate)! < 14;
    if (needsAccompaniment && (p.guardianWillAttend !== true || accompanyingGuardianName.length < 2 || accompanyingGuardianName.length > 200
      || !/^[+()\d .-]{7,40}$/.test(accompanyingGuardianPhone) || !["parent", "legal_guardian"].includes(accompanyingGuardianRelationship))) {
      return { error: "Under 14: provide the accompanying parent or legal guardian’s name and phone, and confirm they will stay throughout the activity" };
    }
    const attendeeEmail = (p.kind === "self" ? bookerEmail : typeof p.attendeeEmail === "string" ? p.attendeeEmail : "").trim().toLowerCase();
    const guardianEmail = (typeof p.guardianEmail === "string" ? p.guardianEmail : "").trim().toLowerCase();
    const guardianName = (typeof p.guardianName === "string" ? p.guardianName : "").trim();
    const guardianRelationship = (typeof p.guardianRelationship === "string" ? p.guardianRelationship : "").trim();
    const recipientEmail = signerRole === "guardian" ? guardianEmail : attendeeEmail;
    if (recipientEmail.length > 254 || !emailPattern.test(recipientEmail)) return { error: "Provide the adult attendee’s or guardian’s valid email" };
    if (p.kind === "proxy" && signerRole === "attendee" && recipientEmail === bookerEmail.trim().toLowerCase()) return { error: "An adult friend must use their own email" };
    if (signerRole === "guardian" && (guardianName.length < 2 || guardianName.length > 200 || !["parent", "legal_guardian"].includes(guardianRelationship))) return { error: "Provide the legal guardian’s name and relationship" };
    if (!p.answers || typeof p.answers !== "object" || Array.isArray(p.answers)) return { error: "Complete each participant’s answers" };
    // The signer's email is separate from the attendee's questionnaire. A child's email is never required.
    const answers = { ...p.answers };
    delete answers.email;
    if (attendeeEmail) answers.email = attendeeEmail;
    const checked = validateRegistrationAnswers(event.registrationQuestions, answers, "proxy");
    if (!checked.success) return { error: Object.values(checked.errors)[0] };
    const name = String(checked.data.name ?? "").trim();
    if (name.length < 2 || name.length > 200) return { error: "Provide each participant’s full name" };
    const identity = `${name.normalize("NFKC").toLocaleLowerCase()}|${dateOfBirth}`;
    if (identities.has(identity)) duplicateWarning = true;
    identities.add(identity);
    const couponCode = typeof p.couponCode === "string" ? p.couponCode.trim().toUpperCase() : "";
    if (couponCode && !/^[A-Z0-9_-]{1,32}$/.test(couponCode)) return { error: "Invalid coupon code" };
    participants.push({ key: p.key, kind: p.kind as "self" | "proxy", dateOfBirth, attendeeEmail, guardianEmail, guardianName, guardianRelationship, answers: checked.data, signerRole, recipientEmail, name, couponCode,
      ...(needsAccompaniment ? { accompanyingGuardianName, accompanyingGuardianPhone, accompanyingGuardianRelationship, guardianWillAttend: true } : {}) });
  }
  return { participants, duplicateWarning };
}
