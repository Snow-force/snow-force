import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStaffNotificationEmail, sendEmail } from "./adapter";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

describe("event and general email identity", () => {
  beforeEach(() => { vi.stubEnv("RESEND_API_KEY", "isolated-test-key"); send.mockReset(); });
  afterEach(() => vi.unstubAllEnvs());
  it("uses the verified noreply sender and hello reply address", async () => {
    send.mockResolvedValue({ error: null });
    await expect(sendEmail({ to: "recipient@example.test", subject: "Test", html: "<p>Test</p>" })).resolves.toEqual({ success: true });
    expect(send).toHaveBeenCalledWith({ from: "SnowForce <noreply@notifications.snow-force.com>", replyTo: "hello@snow-force.com", to: "recipient@example.test", subject: "Test", html: "<p>Test</p>" });
  });
  it("sends event staff notifications to the general mailbox", () => {
    expect(buildStaffNotificationEmail("Snow day", "Rider").to).toBe("hello@snow-force.com");
  });
});
