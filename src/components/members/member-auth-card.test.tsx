import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { registerMemberProfile } from "@/lib/members/actions";
import { MemberAuthCard } from "./member-auth-card";

vi.mock("@/lib/members/actions", () => ({
  loginMemberProfile: vi.fn(),
  loginMemberWithGoogle: "/member",
  registerMemberProfile: vi.fn(),
  requestMemberMagicLink: vi.fn(),
  requestMemberPasswordReset: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = "lang=en;path=/";
});

describe("MemberAuthCard registration", () => {
  it("renders the approved four required signup fields", () => {
    render(<LanguageProvider><MemberAuthCard searchParams={{ mode: "register" }} /></LanguageProvider>);

    expect(screen.getByLabelText("Display name")).toBeRequired();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("autocomplete", "new-password");
  });

  it("disables registration while the server action is pending", async () => {
    let resolveRegistration: (() => void) | undefined;
    vi.mocked(registerMemberProfile).mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveRegistration = resolve; }),
    );

    render(<LanguageProvider><MemberAuthCard searchParams={{ mode: "register" }} /></LanguageProvider>);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Kai" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "kai@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret1" } });

    const form = screen.getByRole("button", { name: "Create SnowForce account" }).closest("form");
    if (!(form instanceof HTMLFormElement)) throw new Error("Expected a registration form.");
    await act(async () => { fireEvent.submit(form); });

    expect(screen.getByRole("button", { name: /Creating account/ })).toBeDisabled();
    expect(registerMemberProfile).toHaveBeenCalledTimes(1);
    const resolve = resolveRegistration;
    if (!resolve) throw new Error("Expected registration action to remain pending.");
    await act(async () => { resolve(); });
  });
});

describe("MemberAuthCard verification experience", () => {
  it("does not render a verification resend form", () => {
    render(<LanguageProvider><MemberAuthCard searchParams={{ error: "callback" }} /></LanguageProvider>);

    expect(screen.queryByRole("textbox", { name: "Resend verification email" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend" })).not.toBeInTheDocument();
  });
});
