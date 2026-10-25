import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ verify: vi.fn(), rpc: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { webhooks = { verify: m.verify }; } }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc: m.rpc }) }));
import { POST } from "./route";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("RESEND_WAIVER_WEBHOOK_SECRET", "configured-secret"); });
afterEach(() => vi.unstubAllEnvs());
describe("waiver delivery event authentication", () => {
  it("acknowledges other email streams without touching waiver delivery records", async () => {
    for (const tags of [undefined, { stream: "marketing" }]) {
      m.verify.mockReturnValue({ type: "email.delivered", data: { email_id: "marketing-mail", tags } });
      expect((await POST(new Request("https://snow-force.com/api/resend/waivers", { method: "POST", body: "{}" }))).status).toBe(200);
    }
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("rejects unsigned/forged events without updating delivery state", async () => {
    m.verify.mockImplementation(() => { throw new Error("forged"); });
    const r = await POST(new Request("https://snow-force.com/api/resend/waivers", { method: "POST", body: '{"type":"email.delivered"}' }));
    expect(r.status).toBe(400); expect(m.rpc).not.toHaveBeenCalled();
    vi.stubEnv("RESEND_WAIVER_WEBHOOK_SECRET", ""); expect((await POST(new Request("https://snow-force.com/api/resend/waivers", { method: "POST" }))).status).toBe(503);
  });
  it("verifies the raw body and records a provider event with its signed delivery ID", async () => {
    m.verify.mockReturnValue({ type: "email.delivered", data: { tags: { stream: "event-waiver-v2" }, email_id: "mail-1" } }); m.rpc.mockResolvedValue({ error: null });
    const raw = '{ "type": "email.delivered" }';
    const r = await POST(new Request("https://snow-force.com/api/resend/waivers", { method: "POST", headers: { "svix-id": "event-1", "svix-timestamp": "time", "svix-signature": "signature" }, body: raw }));
    expect(r.status).toBe(200); expect(m.verify).toHaveBeenCalledWith(expect.objectContaining({ payload: raw, headers: { id: "event-1", timestamp: "time", signature: "signature" } }));
    expect(m.rpc).toHaveBeenCalledWith("record_event_waiver_delivery", { event_id_input: "event-1", message_id_input: "mail-1", type_input: "email.delivered" });
  });
  it("allows provider retry when storage is not ready and ignores unrelated events", async () => {
    m.verify.mockReturnValue({ type: "email.bounced", data: { tags: { stream: "event-waiver-v2" }, email_id: "mail-1" } }); m.rpc.mockResolvedValue({ error: { message: "not ready" } });
    expect((await POST(new Request("https://snow-force.com/api/resend/waivers", { method: "POST", body: "{}" }))).status).toBe(503);
    m.rpc.mockClear(); m.verify.mockReturnValue({ type: "contact.created", data: {} });
    expect((await POST(new Request("https://snow-force.com/api/resend/waivers", { method: "POST", body: "{}" }))).status).toBe(200); expect(m.rpc).not.toHaveBeenCalled();
  });
});
