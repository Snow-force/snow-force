import { createHmac } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc }) }));
import { POST } from "./route";
afterEach(() => { vi.unstubAllEnvs(); rpc.mockClear(); });
it("uses the installed provider verifier to reject altered bodies and stale timestamps", async () => {
  const key = Buffer.alloc(32, 7); vi.stubEnv("RESEND_WAIVER_WEBHOOK_SECRET", `whsec_${key.toString("base64")}`);
  const payload = JSON.stringify({ type: "email.delivered", created_at: new Date().toISOString(), data: { tags: { stream: "event-waiver-v2" }, email_id: "fixture-message", from: "sender@example.test", to: ["recipient@example.test"], subject: "Fixture" } });
  function request(body: string, seconds = Math.floor(Date.now() / 1000)) {
    const id = "msg_fixture"; const signature = createHmac("sha256", key).update(`${id}.${seconds}.${payload}`).digest("base64");
    return new Request("https://snow-force.com/api/resend/waivers", { method: "POST", body, headers: { "svix-id": id, "svix-timestamp": String(seconds), "svix-signature": `v1,${signature}` } });
  }
  expect((await POST(request(payload + " "))).status).toBe(400); expect((await POST(request(payload, Math.floor(Date.now() / 1000) - 3600))).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
  expect((await POST(request(payload))).status).toBe(200); expect(rpc).toHaveBeenCalledWith("record_event_waiver_delivery", expect.objectContaining({ event_id_input: "msg_fixture", message_id_input: "fixture-message" }));
});
