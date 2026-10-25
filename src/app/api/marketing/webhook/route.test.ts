import { afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ verify: vi.fn(), request: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { webhooks = { verify: m.verify }; } }));
vi.mock("@/lib/marketing/client", () => ({ marketingRequest: m.request }));
import { POST } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it("routes verified waiver callbacks away from marketing while retaining marketing delivery handling", async () => {
  vi.stubEnv("MARKETING_WEBHOOK_SECRET", "configured");
  m.verify.mockReturnValue({ type: "email.delivered", data: { email_id: "waiver", tags: { stream: "event-waiver-v2" } } });
  expect((await POST(new Request("https://snow-force.com/api/marketing/webhook", { method: "POST", body: "{}" }))).status).toBe(200);
  expect(m.request).not.toHaveBeenCalled();
  m.verify.mockReturnValue({ type: "email.delivered", data: { email_id: "marketing" } });
  expect((await POST(new Request("https://snow-force.com/api/marketing/webhook", { method: "POST", body: "{}" }))).status).toBe(200);
  expect(m.request).toHaveBeenCalledWith(expect.objectContaining({ event: expect.objectContaining({ emailId: "marketing" }) }));
});
