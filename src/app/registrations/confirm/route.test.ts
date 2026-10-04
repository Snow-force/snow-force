import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("registration confirmation route", () => {
  it("redirects legacy guest confirmation links to member confirmation", async () => {
    const response = await GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/member?registration=member-only");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new URL(response.headers.get("location")!, "https://snow-force.com/registrations/confirm?token=abc").href)
      .toBe("https://snow-force.com/member?registration=member-only");
  });
});
