import { describe, expect, it } from "vitest";
import { classifyStaffLoginError, staffLoginErrorMessage } from "./staff-login-errors";

describe("staff login error classification", () => {
  it("distinguishes service quota restrictions from invalid credentials", () => {
    expect(classifyStaffLoginError({ status: 402, message: "exceed_egress_quota" })).toBe("quota");
    expect(classifyStaffLoginError({ status: 400, code: "invalid_credentials" })).toBe("credentials");
    expect(classifyStaffLoginError({ status: 503, code: "invalid_credentials" })).toBe("unavailable");
    expect(classifyStaffLoginError(null)).toBe("credentials");
  });
  it("distinguishes rate limits, unverified email and unexpected failures", () => {
    expect(classifyStaffLoginError({ status: 429 })).toBe("rate-limit");
    expect(classifyStaffLoginError({ code: "email_not_confirmed" })).toBe("unconfirmed");
    expect(classifyStaffLoginError(new Error("private provider detail"))).toBe("unavailable");
    expect(classifyStaffLoginError("private provider detail")).toBe("unavailable");
  });
  it("only renders whitelisted bilingual messages, never raw provider or query text", () => {
    expect(staffLoginErrorMessage("quota").zh).toContain("配额限制");
    for (const code of ["credentials", "quota", "unavailable", "rate-limit", "unconfirmed", "unauthorized"]) {
      expect(staffLoginErrorMessage(code).en).not.toBe("");
      expect(staffLoginErrorMessage(code).zh).not.toBe("");
    }
    for (const code of ["constructor", "__proto__", "<script>secret</script>"]) expect(staffLoginErrorMessage(code)).toEqual(staffLoginErrorMessage("unavailable"));
  });
});
