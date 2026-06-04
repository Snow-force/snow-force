import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("registration confirmation route", () => {
  it("redirects legacy guest confirmation links to member confirmation", async () => {
    const response = await GET(new Request("http://localhost:3000/registrations/confirm?token=abc"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/member?registration=member-only");
  });
});
