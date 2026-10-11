import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { marketingRequest } from "./client";
import { verifyMarketing } from "./protocol";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("sends authenticated commands only to the configured backend without following redirects", async () => {
  vi.stubEnv("MEDUSA_BACKEND_URL", "https://commerce.example.com"); vi.stubEnv("MARKETING_INTERNAL_SECRET", "fixture-marketing-secret-at-least-32");
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ campaigns: [] }))); vi.stubGlobal("fetch", fetcher);
  expect(await marketingRequest({ kind: "event", actor: "staff", command: { action: "list" } })).toEqual({ campaigns: [] });
  const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://commerce.example.com/internal/marketing"); expect(options.redirect).toBe("error");
  expect(verifyMarketing(JSON.parse(String(options.body)), "fixture-marketing-secret-at-least-32").payload).toMatchObject({ actor: "staff" });
  for (const code of [409, 503]) { fetcher.mockResolvedValueOnce(new Response(null, { status: code })); await expect(marketingRequest({})).rejects.toThrow(); }
  vi.stubEnv("MEDUSA_BACKEND_URL", "https://commerce.example.com/attacker"); await expect(marketingRequest({})).rejects.toThrow();
});
