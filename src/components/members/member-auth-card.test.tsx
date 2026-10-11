import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { registerMemberProfile } from "@/lib/members/actions";
import { MemberAuthCard } from "./member-auth-card";
import { MemberAuthPanel } from "./member-auth-panel";

vi.mock("@/lib/members/actions", () => ({
  loginMemberProfile: "/member",
  loginMemberWithGoogle: "/member/google",
  registerMemberProfile: vi.fn(),
  requestMemberMagicLink: "/member/magic",
  requestMemberPasswordReset: "/member/password-reset",
}));

beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = "lang=en;path=/";
});

describe("MemberAuthCard registration", () => {
  it("uses one required checkbox for privacy and event-media permission", () => {
    render(<LanguageProvider><MemberAuthCard searchParams={{ mode: "register" }} /></LanguageProvider>);

    expect(screen.getByLabelText("Display name")).toBeRequired();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText(/I have read and agree to the Privacy Notice, including permission/)).toBeRequired();
    expect(screen.queryByRole("checkbox", { name: /Optional: Allow SnowForce/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create SnowForce account" })).toBeDisabled();
    expect(screen.queryByText(/personal shop discount code|个人商城折扣码/)).not.toBeInTheDocument();
  });

  it("enables registration only after all field rules and the required privacy checkbox are satisfied", async () => {
    let resolveRegistration: (() => void) | undefined;
    vi.mocked(registerMemberProfile).mockImplementationOnce(() => new Promise<void>((resolve) => { resolveRegistration = resolve; }));

    render(<LanguageProvider><MemberAuthCard searchParams={{ mode: "register" }} /></LanguageProvider>);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Kai" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " Kai@Example.COM " } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Secret123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Secret123" } });

    const submitButton = screen.getByRole("button", { name: "Create SnowForce account" });
    expect(submitButton).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I have read and agree to the Privacy Notice, including permission/));
    expect(submitButton).toBeEnabled();
    const form = submitButton.closest("form");
    if (!(form instanceof HTMLFormElement)) throw new Error("Expected a registration form.");
    await act(async () => { fireEvent.submit(form); });

    expect(screen.getByRole("button", { name: /Creating account/ })).toBeDisabled();
    expect(registerMemberProfile).toHaveBeenCalledTimes(1);
    const submitted = vi.mocked(registerMemberProfile).mock.calls[0]?.[0];
    expect(submitted).toBeInstanceOf(FormData);
    expect((submitted as FormData).get("photoSocialMediaConsent")).toBeNull();
    expect((submitted as FormData).get("privacyPolicyAccepted")).toBe("on");
    expect((submitted as FormData).get("marketingEmailOptIn")).toBe("on");
    expect((submitted as FormData).get("email")).toBe("kai@example.com");
    const resolve = resolveRegistration;
    if (!resolve) throw new Error("Expected registration action to remain pending.");
    await act(async () => { resolve(); });
  });

  it("shows field-specific registration errors only after interaction", () => {
    render(<LanguageProvider initialLang="zh"><MemberAuthCard searchParams={{ mode: "register" }} /></LanguageProvider>);

    expect(screen.getByText("至少 8 个字符")).toHaveClass("text-white/40");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "bad email" } });
    fireEvent.blur(screen.getByLabelText("Email"));
    expect(screen.getByText("请输入有效的邮箱地址。")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret12" } });
    expect(screen.getByText("包含一个大写字母")).toHaveClass("text-white/40");
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "other" } });
    fireEvent.blur(screen.getByLabelText("Confirm password"));
    expect(screen.getByText("两次输入的密码不一致。")).toBeInTheDocument();
  });
});

describe("MemberAuthCard Google sign-in", () => {
  it.each(["login", "register", "magic"])("uses one immediate Google identity entry in %s mode", (mode) => {
    render(<LanguageProvider><MemberAuthCard searchParams={{ mode, next: "/events/mammoth-weekend" }} /></LanguageProvider>);

    const buttons = screen.getAllByRole("button", { name: "Continue with Google" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.closest("form")).toHaveAttribute("action", "/member/google");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("MemberAuthPanel responsive layout", () => {
  it("keeps the mobile card flow and adds a wide desktop composition", () => {
    render(<LanguageProvider><MemberAuthPanel searchParams={{}} /></LanguageProvider>);

    const overview = screen.getByRole("region", { name: "SnowForce membership overview" });
    expect(overview).toHaveClass("hidden", "min-[960px]:block");
    expect(overview.parentElement).toHaveClass("max-w-[1320px]", "min-[960px]:grid");
    expect(screen.getByRole("heading", { name: "Built for days that start before sunrise." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Easy Registration" })).toBeInTheDocument();
    expect(screen.getByText("Keep trips, photos and recaps together.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rider Profile" })).toBeInTheDocument();
    expect(screen.queryByText("Faster event registration")).not.toBeInTheDocument();
    expect(overview.querySelectorAll("svg")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Welcome" }).parentElement?.parentElement).toHaveClass("max-w-[420px]", "md:max-w-[520px]", "min-[960px]:max-w-none");
  });
});

describe("MemberAuthCard verification experience", () => {
  it("does not render a verification resend form", () => {
    render(<LanguageProvider><MemberAuthCard searchParams={{ error: "callback" }} /></LanguageProvider>);

    expect(screen.queryByRole("textbox", { name: "Resend verification email" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend" })).not.toBeInTheDocument();
  });
});
