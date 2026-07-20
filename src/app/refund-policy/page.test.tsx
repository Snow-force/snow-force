import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/language";
import RefundPolicyPage from "./page";

function renderInLanguage(ui: React.ReactNode, language: "en" | "zh") {
  document.cookie = `lang=${language};path=/`;
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe("RefundPolicyPage", () => {
  beforeEach(() => {
    document.cookie = "lang=en;path=/";
  });

  it("renders the English policy and fee schedule", () => {
    renderInLanguage(<RefundPolicyPage />, "en");

    expect(screen.getByRole("heading", { level: 1, name: "Refund Policy" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "14–8 days before the event" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "50%" })).toBeInTheDocument();
  });

  it("renders the Chinese policy and fee schedule", () => {
    renderInLanguage(<RefundPolicyPage />, "zh");

    expect(screen.getByRole("heading", { level: 1, name: "退款政策" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "活动开始前 14–8 日" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "50%" })).toBeInTheDocument();
  });
});
