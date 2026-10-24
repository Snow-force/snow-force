import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWaiverEmail, sendWaiverEmail, type WaiverEmailData } from "./waiver";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
const data: WaiverEmailData = { kind: "invitation", name: '<img src="x">', event: "Snow <event>", role: "attendee", lang: "en", token: "a".repeat(64) };
beforeEach(() => { mocks.send.mockReset(); vi.stubEnv("RESEND_API_KEY", "isolated-key"); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://snow-force.com"); });
afterEach(() => vi.unstubAllEnvs());
describe("strict private waiver delivery", () => {
  it("never reports missing configuration or rejected/network sends as successful", async () => {
    vi.stubEnv("RESEND_API_KEY", ""); expect((await sendWaiverEmail("test@example.test", data, "stable-key")).success).toBe(false); expect(mocks.send).not.toHaveBeenCalled();
    vi.stubEnv("RESEND_API_KEY", "key"); mocks.send.mockResolvedValueOnce({ error: { message: "rejected" } }).mockRejectedValueOnce(new Error("network"));
    expect((await sendWaiverEmail("test@example.test", data, "stable-key")).success).toBe(false);
    expect((await sendWaiverEmail("test@example.test", data, "stable-key")).success).toBe(false);
  });
  it("keeps a stable provider idempotency key and returns accepted message ID without claiming delivery", async () => {
    mocks.send.mockResolvedValue({ data: { id: "mail-1" }, error: null });
    expect(await sendWaiverEmail("friend@example.test", data, "waiver/assignment/1")).toEqual({ success: true, messageId: "mail-1" });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: "friend@example.test", replyTo: "hello@snow-force.com" }), { idempotencyKey: "waiver/assignment/1" });
  });
  it("escapes attendee content and uses a private official link with no other group members", () => {
    const email = buildWaiverEmail(data); expect(email.html).toContain("&lt;img"); expect(email.html).not.toContain('<img src="x">');
    expect(email.html).toContain(`https://snow-force.com/events/waivers#${data.token}`); expect(email.html).toContain('lang="en"');
    expect(email.html).toContain("does not grant marketing or photo consent");
  });
  it.each(["en", "zh"] as const)("separates guardian, OTP and signature receipts in %s", (lang) => {
    expect(buildWaiverEmail({ ...data, role: "guardian", lang }).subject).toMatch(/guardian|监护/);
    const otp = buildWaiverEmail({ ...data, kind: "verification", code: "123456", lang }); expect(otp.html).toContain("123456"); expect(otp.html).not.toContain(data.token!);
    expect(buildWaiverEmail({ ...data, kind: "signed", lang }).subject).toMatch(/recorded|已记录/);
    expect(otp.html).toContain(`<div lang="${lang === "zh" ? "zh-CN" : "en"}" dir="ltr">`);
  });
  it("rejects unsafe URLs and malformed capabilities or verification codes", () => {
    expect(() => buildWaiverEmail({ ...data, token: "invalid" })).toThrow();
    expect(() => buildWaiverEmail({ ...data, kind: "verification", code: "wrong" })).toThrow();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://untrusted.example"); expect(() => buildWaiverEmail(data)).toThrow();
  });
});
