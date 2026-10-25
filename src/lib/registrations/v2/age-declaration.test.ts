import { expect, it } from "vitest";
import { seedEvents } from "@/lib/events/seed";
import { parseAgeDeclaration, validateDeclaredParticipants } from "./age-declaration";
const event = { ...seedEvents[0], registrationQuestions: [], allowProxyRegistrations: true, maxProxyRegistrations: 5 };
const friend = { key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "proxy", signerEmail: "friend@example.test", answers: { name: "Friend" } };
it("collects only participant answers and the signing address, ignoring booker-supplied birthdays and age assertions", () => {
  const result = validateDeclaredParticipants(event, [{ ...friend, dateOfBirth: "2000-01-01", adultConfirmed: true, guardianName: "untrusted", answers: { name: "Friend", dateOfBirth: "2000-01-01", email: "child@example.test" } }], "payer@example.test");
  expect(result.participants?.[0]).toEqual({ ...friend, recipientEmail: friend.signerEmail, name: "Friend", couponCode: "" });
  expect(JSON.stringify(result)).not.toMatch(/dateOfBirth|adultConfirmed|guardianName|child@example/);
  expect(validateDeclaredParticipants(event, [{ ...friend, signerEmail: "payer@example.test" }], "payer@example.test").participants).toHaveLength(1); // Parent may sign for a child; adult friend ownership is checked at signing.
});
it("preserves member/friend caps, participant key uniqueness, email and coupon validation", () => {
  for (const input of [null, [], [null], [friend, friend], [{ ...friend, key: "invalid" }], [{ ...friend, signerEmail: "invalid" }], [{ ...friend, couponCode: "!" }], [{ ...friend, answers: {} }]]) expect(validateDeclaredParticipants(event, input, "payer@example.test").error).toBeTruthy();
  expect(validateDeclaredParticipants({ ...event, allowProxyRegistrations: false }, [friend], "payer@example.test").error).toBeTruthy();
  const self = { ...friend, kind: "self", signerEmail: "payer@example.test" };
  expect(validateDeclaredParticipants(event, [self, { ...self, key: crypto.randomUUID() }], "payer@example.test").error).toBeTruthy();
});
it("an explicit adult checkbox requires no guardian details and cannot carry conflicting guardian claims", () => {
  const form = new FormData(); form.set("adultConfirmed", "on"); form.set("minorUnder14", "yes"); form.set("guardianRelationship", "friend");
  expect(parseAgeDeclaration(form)).toEqual({ adultConfirmed: true, under14: false });
});
it("an unchecked adult checkbox requires a guardian's authority and explicit under-14 classification", () => {
  const form = new FormData(); expect(parseAgeDeclaration(form)).toBeNull();
  form.set("guardianAttested", "on"); form.set("guardianRelationship", "parent"); expect(parseAgeDeclaration(form)).toBeNull();
  form.set("minorUnder14", "no"); expect(parseAgeDeclaration(form)).toEqual({ adultConfirmed: false, under14: false, guardianRelationship: "parent" });
  form.set("guardianRelationship", "friend"); expect(parseAgeDeclaration(form)).toBeNull();
});
it("under 14 requires an accompanying parent/legal guardian and a usable contact number", () => {
  const form = new FormData(); for (const [k, v] of Object.entries({ minorUnder14: "yes", guardianAttested: "on", guardianRelationship: "parent", accompanyingGuardianName: "Legal Parent", accompanyingGuardianPhone: "+1 555 010 0100", accompanyingGuardianRelationship: "parent" })) form.set(k, v);
  expect(parseAgeDeclaration(form)).toBeNull(); form.set("guardianWillAttend", "on");
  expect(parseAgeDeclaration(form)).toMatchObject({ adultConfirmed: false, under14: true, guardianWillAttend: true });
  form.set("accompanyingGuardianPhone", "-------"); expect(parseAgeDeclaration(form)).toBeNull();
});
