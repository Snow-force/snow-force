import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { registerMemberProfile } from "@/lib/members/actions";
import { MemberAuthCard } from "./member-auth-card";
import { MemberStatusMessage } from "./member-status-message";

vi.mock("@/lib/members/actions", () => ({
  loginMemberProfile: vi.fn(),
  loginMemberWithGoogle: "/member",
  registerMemberProfile: vi.fn(),
  requestMemberMagicLink: vi.fn(),
  requestMemberPasswordReset: vi.fn(),
  resendMemberVerification: "/member",
}));

beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = "lang=en;path=/";
});

describe("MemberAuthCard registration", () => {
  it("renders the approved four required signup fields", () => {
    render(
      <LanguageProvider>
        <MemberAuthCard searchParams={{ mode: "register" }} />
      </LanguageProvider>,
    );

    expect(screen.getByLabelText("Display name")).toBeRequired();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");

    const password = screen.getByLabelText("Password");
    const confirmPassword = screen.getByLabelText("Confirm password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(password).toHaveAttribute("minlength", "6");
    expect(confirmPassword).toHaveAttribute("autocomplete", "new-password");
    expect(confirmPassword).toHaveAttribute("minlength", "6");
  });

  it("disables registration while the server action is pending", async () => {
    let resolveRegistration: (() => void) | undefined;
    vi.mocked(registerMemberProfile).mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        resolveRegistration = resolve;
      }),
    );

    render(
      <LanguageProvider>
        <MemberAuthCard searchParams={{ mode: "register" }} />
      </LanguageProvider>,
    );

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Kai" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "kai@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret1" } });

    const form = screen.getByRole("button", { name: "Create SnowForce account" }).closest("form");
    if (!(form instanceof HTMLFormElement)) {
      throw new Error("Expected the registration submit button to belong to a form.");
    }
    await act(async () => {
      fireEvent.submit(form);
    });

    const pendingButton = screen.getByRole("button", { name: /Creating account/ });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    expect(registerMemberProfile).toHaveBeenCalledTimes(1);

    const formData = vi.mocked(registerMemberProfile).mock.calls[0]?.[0];
    if (!(formData instanceof FormData)) {
      throw new Error("Expected registration to receive form data.");
    }
    expect(formData.get("next")).toBe("/member");

    const resolve = resolveRegistration;
    if (!resolve) {
      throw new Error("Expected registration action to remain pending.");
    }
    await act(async () => {
      resolve();
    });

    expect(screen.getByRole("button", { name: "Create SnowForce account" })).toBeEnabled();
  });
});

describe("MemberStatusMessage registration validation", () => {
  it("explains a short registration password in English", () => {
    render(
      <LanguageProvider>
        <MemberStatusMessage searchParams={{ error: "register_password" }} />
      </LanguageProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Password must be at least 6 characters.");
  });

  it("explains a mismatched registration password in Chinese", () => {
    document.cookie = "lang=zh;path=/";

    render(
      <LanguageProvider>
        <MemberStatusMessage searchParams={{ error: "register_confirm" }} />
      </LanguageProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("两次输入的密码不一致。");
  });
});

describe("MemberStatusMessage verification recovery", () => {
  it("warns about too many verification emails in English", () => {
    render(
      <LanguageProvider>
        <MemberStatusMessage searchParams={{ error: "verification-rate" }} />
      </LanguageProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Too many verification emails in a short time. Wait a few minutes and try again.",
    );
  });

  it("warns about too many verification emails in Chinese", () => {
    document.cookie = "lang=zh;path=/";

    render(
      <LanguageProvider>
        <MemberStatusMessage searchParams={{ error: "verification-rate" }} />
      </LanguageProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("短时间内验证邮件发送过多，请稍候几分钟再试。");
  });

  it("warns when the verification email cannot be sent in English", () => {
    render(
      <LanguageProvider>
        <MemberStatusMessage searchParams={{ error: "verification-send" }} />
      </LanguageProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not send the verification email. Please try again shortly.",
    );
  });

  it("warns when the verification email cannot be sent in Chinese", () => {
    document.cookie = "lang=zh;path=/";

    render(
      <LanguageProvider>
        <MemberStatusMessage searchParams={{ error: "verification-send" }} />
      </LanguageProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法发送验证邮件，请稍后重试。");
  });

  it("explains an expired or used verification link in English", () => {
    render(
      <LanguageProvider>
        <MemberStatusMessage searchParams={{ error: "callback" }} />
      </LanguageProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("This verification link has expired or was already used.");
  });

  it("explains an expired or used verification link in Chinese", () => {
    document.cookie = "lang=zh;path=/";

    render(
      <LanguageProvider>
        <MemberStatusMessage searchParams={{ error: "callback" }} />
      </LanguageProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("此验证链接已失效或已被使用。");
  });
});

describe("MemberAuthCard verification resend placement", () => {
  it("renders one compact resend field by default", () => {
    render(
      <LanguageProvider>
        <MemberAuthCard searchParams={{}} />
      </LanguageProvider>,
    );

    expect(screen.getAllByRole("textbox", { name: "Resend verification email" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Resend" })).toHaveClass("rounded-full");
  });

  it("places one prominent resend form immediately after the callback alert", () => {
    render(
      <LanguageProvider>
        <MemberAuthCard searchParams={{ error: "callback" }} />
      </LanguageProvider>,
    );

    const alert = screen.getByRole("alert");
    const resendInput = screen.getByRole("textbox", { name: "Resend verification email" });
    const resendForm = resendInput.closest("form");
    if (!(resendForm instanceof HTMLFormElement)) {
      throw new Error("Expected the resend field to belong to a form.");
    }

    expect(screen.getAllByRole("textbox", { name: "Resend verification email" })).toHaveLength(1);
    expect(screen.getByText("Resend verification email", { selector: "label" })).not.toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "Resend" })).toHaveClass("auth-primary-button");
    expect(alert.nextElementSibling).toBe(resendForm);
  });

  it("keeps one compact resend field after verification is sent", () => {
    render(
      <LanguageProvider>
        <MemberAuthCard searchParams={{ verificationSent: "1" }} />
      </LanguageProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("fresh verification link");
    expect(screen.getAllByRole("textbox", { name: "Resend verification email" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Resend" })).toHaveClass("rounded-full");
  });

  it("renders the prominent resend label in Chinese for callback errors", () => {
    document.cookie = "lang=zh;path=/";

    render(
      <LanguageProvider>
        <MemberAuthCard searchParams={{ error: "callback" }} />
      </LanguageProvider>,
    );

    expect(screen.getByText("重新发送验证邮件", { selector: "label" })).not.toHaveClass("sr-only");
    expect(screen.getAllByRole("textbox", { name: "重新发送验证邮件" })).toHaveLength(1);
  });
});
