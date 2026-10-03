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
});
