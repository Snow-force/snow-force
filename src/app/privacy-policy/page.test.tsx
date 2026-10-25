import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/language";
import PrivacyPolicyPage from "./page";

describe("PrivacyPolicyPage", () => {
  it("explains the required member consents and privacy choices", () => {
    render(<LanguageProvider initialLang="en"><PrivacyPolicyPage /></LanguageProvider>);

    expect(screen.getByRole("heading", { name: "Privacy Notice" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Marketing email choices/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Event photos and videos/ })).toBeInTheDocument();
    expect(screen.getByText(/We do not sell personal information/i)).toBeInTheDocument();
    expect(screen.getByText(/new event bookings do not request a birth date/i)).toBeInTheDocument();
    expect(screen.getByText(/under-14 participants need a parent or legal guardian present throughout/i)).toBeInTheDocument();
    expect(screen.getByText(/hello@snow-force.com/i)).toBeInTheDocument();
  });
});
