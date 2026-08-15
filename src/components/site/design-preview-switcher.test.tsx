import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "@/lib/language";
import { DesignPreviewSwitcher } from "./design-preview-switcher";

const usePathname = vi.fn(() => "/design-preview/home");

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

describe("DesignPreviewSwitcher", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/design-preview/home");
  });

  it("links all three local preview surfaces and marks the current one", () => {
    render(
      <LanguageProvider initialLang="en">
        <DesignPreviewSwitcher />
      </LanguageProvider>,
    );

    expect(screen.getByRole("link", { name: "Home reel" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Recap index" })).toHaveAttribute("href", "/design-preview/recaps");
    expect(screen.getByRole("link", { name: "Recap detail" })).toHaveAttribute("href", "/design-preview/recap-detail");
  });

  it("uses Chinese labels when the preview is opened in Chinese", () => {
    render(
      <LanguageProvider initialLang="zh">
        <DesignPreviewSwitcher />
      </LanguageProvider>,
    );

    expect(screen.getByRole("navigation", { name: "设计预览页面" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "首页回放" })).toBeInTheDocument();
  });
});
