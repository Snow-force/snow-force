import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/admin", () => ({ loginStaff: vi.fn() }));
import StaffLoginPage from "./page";

describe("staff login error presentation", () => {
  it("explains quota restrictions in both languages without blaming the password", async () => {
    render(await StaffLoginPage({ searchParams: Promise.resolve({ error: "quota" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("usage limit");
    expect(screen.getByRole("alert")).toHaveTextContent("配额限制");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
  it("shows no error before an attempt", async () => {
    render(await StaffLoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("does not reflect untrusted query text", async () => {
    render(await StaffLoginPage({ searchParams: Promise.resolve({ error: "private-error-text" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.queryByText("private-error-text")).not.toBeInTheDocument();
  });
});
