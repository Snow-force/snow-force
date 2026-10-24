import { describe, expect, it } from "vitest";
import { seedEvents } from "@/lib/events/seed";
import { signerRoleOnEventDate, validDate, validateParticipants, type ParticipantInput } from "./participants";

const event = { ...seedEvents[0], eventDate: "2026-11-07", registrationQuestions: [], allowProxyRegistrations: true, maxProxyRegistrations: 5 };
const friend = (patch: Partial<ParticipantInput> = {}): ParticipantInput => ({ key: crypto.randomUUID(), kind: "proxy", dateOfBirth: "1990-01-01", attendeeEmail: "friend@example.test", guardianName: "", guardianEmail: "", guardianRelationship: "parent", answers: { name: "Friend" }, ...patch });

describe("event-date age and participant identity", () => {
  it.each([
    ["2008-11-07", "2026-11-07", "attendee"], ["2008-11-08", "2026-11-07", "guardian"],
    ["2008-02-29", "2026-02-28", "guardian"], ["2008-02-29", "2026-03-01", "attendee"],
    ["2026-02-30", "2026-11-07", null], ["2027-01-01", "2026-11-07", null],
    ["not-a-date", "2026-11-07", null], ["1900-01-01", "2026-11-07", null],
  ])("%s on local event day %s requires %s", (birth, day, role) => expect(signerRoleOnEventDate(birth, day)).toBe(role));
  it("rejects invalid dates rather than allowing JavaScript date rollover", () => {
    expect(validDate("2026-02-29")).toBe(false); expect(validDate("2028-02-29")).toBe(true); expect(validDate("2026-1-1")).toBe(false);
  });
  it("allows friends-only and self-plus-friends without counting the booker twice", () => {
    expect(validateParticipants(event, [friend(), friend({ answers: { name: "Other" } })], "payer@example.test").participants).toHaveLength(2);
    const self = friend({ kind: "self", attendeeEmail: "forged@example.test" });
    const result = validateParticipants(event, [self, friend()], "payer@example.test");
    expect(result.participants?.[0]).toMatchObject({ recipientEmail: "payer@example.test", kind: "self" });
    expect(validateParticipants(event, [self, friend({ kind: "self" })], "payer@example.test").error).toBeTruthy();
  });
  it("requires the adult’s own email and the designated guardian for a minor", () => {
    expect(validateParticipants(event, [friend({ attendeeEmail: "" })], "payer@example.test").error).toBeTruthy();
    expect(validateParticipants(event, [friend({ attendeeEmail: "payer@example.test" })], "payer@example.test").error).toBeTruthy();
    const child = friend({ dateOfBirth: "2015-01-01", attendeeEmail: "", guardianName: "Legal Parent", guardianEmail: "PARENT@example.test" });
    expect(validateParticipants(event, [child], "payer@example.test").participants?.[0]).toMatchObject({ signerRole: "guardian", recipientEmail: "parent@example.test" });
    expect(validateParticipants(event, [child], "payer@example.test").participants?.[0].answers).not.toHaveProperty("dateOfBirth");
    expect(validateParticipants(event, [{ ...child, guardianRelationship: "friend" }], "payer@example.test").error).toBeTruthy();
  });
  it("allows siblings to share a guardian address; candidate identity matches prompt review rather than proving identity", () => {
    const a = friend({ dateOfBirth: "2015-01-01", guardianName: "Parent", guardianEmail: "parent@example.test", attendeeEmail: "" });
    const b = { ...a, key: crypto.randomUUID(), answers: { name: "Sibling" } };
    expect(validateParticipants(event, [a, b], "payer@example.test").participants).toHaveLength(2);
    expect(validateParticipants(event, [a, { ...a, key: crypto.randomUUID() }], "payer@example.test").duplicateWarning).toBe(true);
    expect(validateParticipants(event, [a, a], "payer@example.test").error).toBeTruthy();
  });
  it("enforces the event’s proxy limit and rejects missing or malformed participants", () => {
    for (const input of [null, {}, [], [null], [friend({ key: "invalid" })], Array.from({ length: 6 }, () => friend())]) expect(validateParticipants(event, input, "payer@example.test").error).toBeTruthy();
    expect(validateParticipants({ ...event, allowProxyRegistrations: false }, [friend()], "payer@example.test").error).toBeTruthy();
  });
});
