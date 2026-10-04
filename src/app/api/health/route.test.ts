import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("website container liveness", () => {
  it("returns a fresh non-sensitive response without depending on external services", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok", service: "snowforce-web" });
  });
});
