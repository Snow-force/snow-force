import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const language = vi.hoisted(() => ({ lang: "en" }));
vi.mock("@/lib/language", () => ({ useLanguage: () => language }));
import ShopLoading from "./loading";

afterEach(cleanup);
describe("shop route loading feedback", () => {
  it("announces loading without pretending an order or payment has succeeded", () => {
    language.lang = "en";
    const { container } = render(<ShopLoading />);
    expect(screen.getByRole("status").textContent).toContain("Loading the shop");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent).not.toMatch(/\$|paid|succeeded/i);
  });
  it("uses the selected Chinese language", () => {
    language.lang = "zh";
    render(<ShopLoading />);
    expect(screen.getByRole("status").textContent).toBe("正在加载商城，请稍候…");
  });
});
