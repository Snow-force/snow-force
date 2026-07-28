import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { MemberResendVerification } from "./member-resend-verification";

vi.mock("@/lib/members/actions", () => ({
  resendMemberVerification: "/member",
}));

beforeEach(() => {
  document.cookie = "lang=en;path=/";
});

describe("MemberResendVerification", () => {
  describe("compact variant", () => {
    it("renders inline layout with sr-only label, placeholder, and subdued button", () => {
      render(
        <LanguageProvider>
          <MemberResendVerification variant="compact" />
        </LanguageProvider>,
      );

      const input = screen.getByRole("textbox", { name: /Resend verification email/ });
      expect(input).toHaveAttribute("type", "email");
      expect(input).toHaveAttribute("autocomplete", "email");
      expect(input).toBeRequired();
      expect(input).toHaveAttribute("placeholder", "Resend verification email");

      const button = screen.getByRole("button", { name: "Resend" });
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute("aria-busy", "false");
    });

    it("shows bilingual English label and placeholder", () => {
      render(
        <LanguageProvider>
          <MemberResendVerification variant="compact" />
        </LanguageProvider>,
      );

      expect(screen.getByRole("textbox", { name: /Resend verification email/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Resend" })).toBeInTheDocument();
    });

    it("shows bilingual Chinese label, placeholder, and button", () => {
      document.cookie = "lang=zh;path=/";

      render(
        <LanguageProvider>
          <MemberResendVerification variant="compact" />
        </LanguageProvider>,
      );

      expect(screen.getByRole("textbox", { name: /重新发送验证邮件/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "重新发送" })).toBeInTheDocument();
    });
  });

  describe("prominent variant", () => {
    it("renders space-y-3 layout with visible label, full-width input, and primary button", () => {
      render(
        <LanguageProvider>
          <MemberResendVerification variant="prominent" />
        </LanguageProvider>,
      );

      const input = screen.getByRole("textbox", { name: /Resend verification email/ });
      expect(input).toHaveAttribute("type", "email");
      expect(input).toHaveAttribute("autocomplete", "email");
      expect(input).toBeRequired();

      const label = screen.getByText("Resend verification email");
      expect(label.tagName).toBe("LABEL");
      expect(label).toHaveAttribute("for", input.id);

      const button = screen.getByRole("button", { name: "Resend" });
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute("aria-busy", "false");
    });

    it("shows bilingual English visible label and button", () => {
      render(
        <LanguageProvider>
          <MemberResendVerification variant="prominent" />
        </LanguageProvider>,
      );

      expect(screen.getByText("Resend verification email")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Resend" })).toBeInTheDocument();
    });

    it("shows bilingual Chinese visible label and button", () => {
      document.cookie = "lang=zh;path=/";

      render(
        <LanguageProvider>
          <MemberResendVerification variant="prominent" />
        </LanguageProvider>,
      );

      expect(screen.getByText("重新发送验证邮件")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "重新发送" })).toBeInTheDocument();
    });
  });

  describe("pending state", () => {
    it("disables the button, sets aria-busy, and shows bilingual sending text after submit", () => {
      render(
        <LanguageProvider>
          <MemberResendVerification variant="prominent" />
        </LanguageProvider>,
      );

      const button = screen.getByRole("button", { name: "Resend" });
      const form = button.closest("form");
      if (!(form instanceof HTMLFormElement)) {
        throw new Error("Expected the submit button to belong to a form.");
      }

      fireEvent.submit(form);

      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(button).toHaveTextContent("Sending...");
    });

    it("shows Chinese sending text after submit", () => {
      document.cookie = "lang=zh;path=/";

      render(
        <LanguageProvider>
          <MemberResendVerification variant="prominent" />
        </LanguageProvider>,
      );

      const button = screen.getByRole("button", { name: "重新发送" });
      const form = button.closest("form");
      if (!(form instanceof HTMLFormElement)) {
        throw new Error("Expected the submit button to belong to a form.");
      }

      fireEvent.submit(form);

      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(button).toHaveTextContent("发送中...");
    });
  });
});
