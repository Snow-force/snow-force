import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const supportEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/shop/support-repository", () => ({ getShopSupportEmail: supportEmail }));
import { LanguageProvider } from "@/lib/language";
import { ShopSupportFooter } from "./shop-support-footer";

it("renders the server-resolved shop contact in the shared footer", async () => {
  supportEmail.mockResolvedValue("updated@example.test");
  render(<LanguageProvider initialLang="en">{await ShopSupportFooter()}</LanguageProvider>);
  expect(screen.getByRole("link", { name: "updated@example.test" })).toHaveAttribute("href", "mailto:updated@example.test");
  expect(screen.queryByText("Shop@snow-force.com")).not.toBeInTheDocument();
});
