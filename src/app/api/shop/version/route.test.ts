import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
afterEach(() => vi.unstubAllEnvs());
it("returns only the valid public runtime revision without caching", async () => {
  vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "a".repeat(40));
  const response = await GET();
  expect(await response.json()).toEqual({ service: "snowforce-web", revision: "a".repeat(40) });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it.each(["", "private-invalid-value", "a".repeat(41)])("does not expose malformed configuration %s", async value => {
  vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", value);
  expect(await (await GET()).json()).toEqual({ service: "snowforce-web", revision: "unknown" });
});
