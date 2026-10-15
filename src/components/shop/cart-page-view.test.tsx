import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
vi.mock("./shop-provider", () => ({ CartContents: ({ presentation }: { presentation: string }) => <div data-testid="cart-layout">{presentation}</div> }));
import { CartPageView } from "./cart-page-view";
it("uses the full cart layout with a separate order summary", () => {
  render(<LanguageProvider initialLang="en"><CartPageView /></LanguageProvider>);
  expect(screen.getByRole("heading", { name: "Your gear cart" })).toBeVisible();
  expect(screen.getByTestId("cart-layout")).toHaveTextContent("page");
});
