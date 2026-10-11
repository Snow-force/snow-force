import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { Footer } from "./footer";

describe("Footer", () => {
  it("links to the dedicated refund policy route without embedding the agreement", () => {
    document.cookie = "lang=en;path=/";
    render(
      <LanguageProvider>
        <Footer />
      </LanguageProvider>,
    );

    expect(screen.getByRole("link", { name: "Refund Policy" })).toHaveAttribute("href", "/refund-policy");
    expect(screen.getByRole("link", { name: "Shop Shipping & Returns" })).toHaveAttribute("href", "/shop/policies");
    expect(screen.queryByText(/Refund and itinerary change statement/)).not.toBeInTheDocument();
  });

  it.each(["en", "zh"] as const)("shows the full shop email and keeps community contact in %s", (lang) => {
    const view = render(<LanguageProvider initialLang={lang}><Footer /></LanguageProvider>);
    expect(screen.getByText(lang === "zh" ? "商城客服" : "Shop customer service")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "shop@snow-force.com" })).toHaveAttribute("href", "mailto:shop@snow-force.com");
    expect(screen.getByRole("link", { name: "hello@snow-force.com" })).toHaveAttribute("href", "mailto:hello@snow-force.com");
    view.unmount();

    render(<LanguageProvider initialLang={lang}><Footer supportEmail="updated@example.test" /></LanguageProvider>);
    expect(screen.getByRole("link", { name: "updated@example.test" })).toHaveAttribute("href", "mailto:updated@example.test");
    expect(screen.queryByText("shop@snow-force.com")).not.toBeInTheDocument();
  });
});
