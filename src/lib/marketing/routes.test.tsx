import { createHmac } from "node:crypto";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ request: vi.fn(), sourceClient: vi.fn(), source: vi.fn(), admin: vi.fn(), update: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("./client", () => ({ marketingRequest: mocks.request }));
vi.mock("./source", () => ({ marketingSourceClient: mocks.sourceClient, readMarketingSource: mocks.source }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }));
import { signMarketing } from "./protocol";
import { POST as sourcePost } from "@/app/api/marketing/source/route";
import { POST as staffPost } from "@/app/admin/events/promotion/api/route";
import { POST as webhookPost } from "@/app/api/marketing/webhook/route";
import { POST as unsubscribePost } from "@/app/api/marketing/unsubscribe/route";
import { POST as confirmPost } from "@/app/marketing/unsubscribe/confirm/route";
import UnsubscribePage from "@/app/marketing/unsubscribe/page";
import { unsubscribeMarketingCustomer } from "./unsubscribe";
const secret = "fixture-marketing-internal-secret-at-least-32";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("MARKETING_INTERNAL_SECRET", secret);
  mocks.request.mockResolvedValue({ campaigns: [] }); mocks.admin.mockResolvedValue({ userId: "verified-staff" }); mocks.source.mockResolvedValue({ contacts: [] });
  const nonces = new Set<string>();
  mocks.update.mockReturnValue({ ilike: vi.fn(async () => ({ error: null })) });
  mocks.sourceClient.mockReturnValue({ from: () => ({ delete: () => ({ lt: vi.fn(async () => ({ error: null })) }), insert: async ({ nonce }: { nonce: string }) => { const duplicate = nonces.has(nonce); nonces.add(nonce); return { error: duplicate ? { code: "duplicate" } : null }; }, update: mocks.update }) });
});
afterEach(() => { vi.unstubAllEnvs(); cleanup(); });
describe("marketing boundaries", () => {
  it("rejects invalid and replayed source requests before reading customers", async () => {
    const body = JSON.stringify(signMarketing({ action: "directory" }, secret));
    const request = () => new Request("https://snow-force.com/api/marketing/source", { method: "POST", body });
    expect((await sourcePost(request())).status).toBe(200);
    expect((await sourcePost(request())).status).toBe(409);
    expect(mocks.source).toHaveBeenCalledTimes(1);
    expect((await sourcePost(new Request(request().url, { method: "POST", body: "{}" }))).status).toBe(400);
    expect((await sourcePost(new Request(request().url, { method: "POST", body: "x".repeat(2_100_001) }))).status).toBe(413);
  });
  it("staff identity comes from requireAdmin and never from the request", async () => {
    const response = await staffPost(new Request("https://snow-force.com/admin/events/promotion/api", { method: "POST", body: JSON.stringify({ action: "list", actor: "attacker" }) }));
    expect(response.status).toBe(200); expect(mocks.request).toHaveBeenCalledWith({ kind: "event", actor: "verified-staff", command: { action: "list", actor: "attacker" } });
    mocks.admin.mockRejectedValue(new Error("unauthorized"));
    await expect(staffPost(new Request("https://snow-force.com/admin/events/promotion/api", { method: "POST", body: "{}" }))).rejects.toThrow("unauthorized");
    mocks.admin.mockResolvedValue({ userId: "verified-staff" }); mocks.request.mockRejectedValue(new Error("unavailable"));
    expect((await staffPost(new Request("https://snow-force.com/admin/events/promotion/api", { method: "POST", body: "{}" }))).status).toBe(409);
  });
  it("verifies real Resend signatures over the raw body and rejects tampering", async () => {
    const key = Buffer.from("fixture-webhook-secret").toString("base64"); vi.stubEnv("MARKETING_WEBHOOK_SECRET", `whsec_${key}`);
    const timestamp = String(Math.floor(Date.now() / 1000)), id = "msg_fixture";
    const payload = JSON.stringify({ type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: "email_fixture", from: "news@example.com", to: ["member@example.com"], subject: "Future ride", created_at: new Date().toISOString() } });
    const signature = createHmac("sha256", Buffer.from(key, "base64")).update(`${id}.${timestamp}.${payload}`).digest("base64");
    const request = (body = payload) => new Request("https://snow-force.com/api/marketing/webhook", { method: "POST", headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` }, body });
    expect((await webhookPost(request())).status).toBe(200);
    expect(mocks.request).toHaveBeenCalledWith({ kind: "webhook", event: { id, type: "email.delivered", emailId: "email_fixture" } });
    expect((await webhookPost(request(payload + " "))).status).toBe(400);
    mocks.request.mockRejectedValue(new Error("unavailable")); expect((await webhookPost(request())).status).toBe(503);
    vi.stubEnv("MARKETING_WEBHOOK_SECRET", ""); expect((await webhookPost(request())).status).toBe(503);
  });
  it("GET renders a confirmation without changing preference; signed POST suppresses before updating member", async () => {
    const token = `${Buffer.from("member@example.com").toString("base64url")}.verified-signature`;
    render(await UnsubscribePage({ searchParams: Promise.resolve({ token }) }));
    expect(screen.getByRole("button", { name: "Unsubscribe" })).toBeInTheDocument(); expect(mocks.request).not.toHaveBeenCalled();
    await unsubscribeMarketingCustomer(token);
    expect(mocks.request).toHaveBeenCalledWith({ kind: "unsubscribe", token }); expect(mocks.update).toHaveBeenCalledWith({ marketing_email_opt_in: false });
    expect(mocks.request.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
    mocks.request.mockRejectedValue(new Error("invalid token")); await expect(unsubscribeMarketingCustomer(token)).rejects.toThrow();
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it("one-click validates the request and confirmation responses report failures", async () => {
    const token = `${Buffer.from("member@example.com").toString("base64url")}.verified-signature`;
    const url = `https://snow-force.com/api/marketing/unsubscribe?token=${token}`;
    expect((await unsubscribePost(new Request(url, { method: "POST", body: "wrong" }))).status).toBe(400);
    expect((await unsubscribePost(new Request(url, { method: "POST", body: "List-Unsubscribe=One-Click" }))).status).toBe(200);
    const confirmation = () => new Request("https://snow-force.com/marketing/unsubscribe/confirm", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
    expect((await confirmPost(confirmation())).headers.get("location")).toContain("done=1");
    mocks.request.mockRejectedValue(new Error("unavailable"));
    expect((await unsubscribePost(new Request(url, { method: "POST", body: "List-Unsubscribe=One-Click" }))).status).toBe(503);
    expect((await confirmPost(confirmation())).headers.get("location")).toContain("error=1");
  });
});
