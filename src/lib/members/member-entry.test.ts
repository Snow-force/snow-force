import { describe, expect, it } from "vitest";
import { parseMemberEntry } from "./member-entry";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  Object.entries(entries).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("member entry", () => {
  it("requires a display name for registration", () => {
    expect(
      parseMemberEntry(
        "register",
        formData({ email: "member@example.com", displayName: "", password: "snowforce-pass" }),
      ),
    ).toEqual({ success: false, error: "register_fields" });
  });

  it("requires a password for registration", () => {
    expect(
      parseMemberEntry(
        "register",
        formData({ email: "member@example.com", displayName: "Tai Yu", password: "" }),
      ),
    ).toEqual({ success: false, error: "password" });
  });

  it("accepts an existing member login with email and password", () => {
    expect(
      parseMemberEntry("login", formData({ email: "member@example.com", password: "snowforce-pass" })),
    ).toEqual({
      success: true,
      email: "member@example.com",
      displayName: "",
      password: "snowforce-pass",
    });
  });
});
