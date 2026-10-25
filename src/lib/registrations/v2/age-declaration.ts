import type { Event, RegistrationAnswers } from "@/lib/types";
import { validateRegistrationAnswers } from "../validation";
import { uuidPattern } from "./participants";

export type DeclaredParticipantInput = {
  key: string; kind: "self" | "proxy"; signerEmail: string; answers: RegistrationAnswers; couponCode?: string;
};
export type AgeDeclaration = {
  adultConfirmed: boolean; under14: boolean; guardianRelationship?: "parent" | "legal_guardian";
  accompanyingGuardianName?: string; accompanyingGuardianPhone?: string;
  accompanyingGuardianRelationship?: "parent" | "legal_guardian"; guardianWillAttend?: boolean;
};
const relationships = ["parent", "legal_guardian"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** New bookings collect a signing address, not birth dates or a booker's age assertion. */
export function validateDeclaredParticipants(event: Event, input: unknown, bookerEmail: string) {
  if (!Array.isArray(input) || !input.length || input.length > (event.maxProxyRegistrations ?? 5) + 1) return { error: "Invalid participant count" };
  const participants: Array<DeclaredParticipantInput & { recipientEmail: string; name: string }> = [];
  const keys = new Set<string>(); let self = 0; let friends = 0;
  for (const value of input) {
    if (!value || typeof value !== "object") return { error: "Invalid participant" };
    const p = value as Partial<DeclaredParticipantInput>;
    if (typeof p.key !== "string" || !uuidPattern.test(p.key) || keys.has(p.key) || !["self", "proxy"].includes(p.kind ?? "")) return { error: "Invalid participant key" };
    keys.add(p.key);
    if (p.kind === "self") self++; else friends++;
    if (self > 1 || friends > (event.maxProxyRegistrations ?? 5) || (friends > 0 && !event.allowProxyRegistrations)) return { error: "Participant limit exceeded" };
    const recipientEmail = (typeof p.signerEmail === "string" ? p.signerEmail : p.kind === "self" ? bookerEmail : "").trim().toLowerCase();
    if (recipientEmail.length > 254 || !emailPattern.test(recipientEmail)) return { error: "Provide the attendee’s or parent/legal guardian’s signing email" };
    if (!p.answers || typeof p.answers !== "object" || Array.isArray(p.answers)) return { error: "Complete each participant’s answers" };
    const checked = validateRegistrationAnswers(event.registrationQuestions, p.answers, "proxy");
    if (!checked.success) return { error: Object.values(checked.errors)[0] };
    // Email belongs to the signer, who may be the child's guardian. Never label it as the child's email.
    delete checked.data.email;
    delete checked.data.dateOfBirth;
    delete checked.data.date_of_birth;
    const name = String(checked.data.name ?? "").trim();
    if (name.length < 2 || name.length > 200) return { error: "Provide each participant’s full name" };
    const couponCode = typeof p.couponCode === "string" ? p.couponCode.trim().toUpperCase() : "";
    if (couponCode && !/^[A-Z0-9_-]{1,32}$/.test(couponCode)) return { error: "Invalid coupon code" };
    participants.push({ key: p.key, kind: p.kind as "self" | "proxy", signerEmail: recipientEmail, recipientEmail, name, answers: checked.data, couponCode });
  }
  return { participants };
}

export function parseAgeDeclaration(form: FormData): AgeDeclaration | null {
  if (form.get("adultConfirmed") === "on") return { adultConfirmed: true, under14: false };
  const under14 = form.get("minorUnder14");
  const relationship = String(form.get("guardianRelationship") ?? "");
  if (!["yes", "no"].includes(String(under14)) || form.get("guardianAttested") !== "on" || !relationships.includes(relationship)) return null;
  const declaration: AgeDeclaration = { adultConfirmed: false, under14: under14 === "yes", guardianRelationship: relationship as "parent" | "legal_guardian" };
  if (declaration.under14) {
    const name = String(form.get("accompanyingGuardianName") ?? "").trim();
    const phone = String(form.get("accompanyingGuardianPhone") ?? "").trim();
    const relation = String(form.get("accompanyingGuardianRelationship") ?? "");
    if (name.length < 2 || name.length > 200 || !/^[+()\d .-]{7,40}$/.test(phone) || phone.replace(/\D/g, "").length < 7
      || !relationships.includes(relation) || form.get("guardianWillAttend") !== "on") return null;
    Object.assign(declaration, { accompanyingGuardianName: name, accompanyingGuardianPhone: phone, accompanyingGuardianRelationship: relation, guardianWillAttend: true });
  }
  return declaration;
}
