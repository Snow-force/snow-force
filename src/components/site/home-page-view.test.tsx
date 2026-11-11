import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider, type Lang } from "@/lib/language";
import { HomePageView } from "./home-page-view";
import { fixtureProducts } from "@/lib/shop/shop.fixtures";

vi.mock("@/components/recaps/mountain-memory-reel", () => ({
  MountainMemoryReel: () => <section aria-label="Recap reel" />,
}));

vi.mock("@/components/events/event-card", () => ({
  EventCard: () => <article aria-label="Event card" />,
}));

const playMock = vi.fn<() => Promise<void>>();

function renderHome(lang: Lang = "en") {
  return render(
    <LanguageProvider initialLang={lang}>
      <HomePageView events={[]} recaps={[]} shopProducts={fixtureProducts} />
    </LanguageProvider>,
  );
}

describe("HomePageView public story", () => {
  beforeEach(() => {
    playMock.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: playMock });
  });

  it.each(["en", "zh"] as const)("keeps the unpublished welcome offer off the %s homepage", (lang) => {
    renderHome(lang);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/10% off|新人九折/)).not.toBeInTheDocument();
    expect(document.querySelector('a[href*="/member/welcome"]')).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("keeps the hero video user initiated and preserves both conversion links", () => {
    renderHome("en");

    expect(playMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play mountain video" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("link", { name: "View open events" })).toHaveAttribute("href", "#next-departures");
    expect(screen.getByRole("link", { name: "See how it works" })).toHaveAttribute("href", "#how-we-ride");
    expect(screen.getByRole("region", { name: "Recent mountain days" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Recap reel" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("SnowForce mountain video")).not.toHaveAttribute("src");
    expect(screen.getByLabelText("SnowForce mountain video")).toHaveAttribute("preload", "none");
    const departureBoard = screen.getByRole("region", { name: "Make the next one yours." });
    expect(screen.getByRole("heading", { level: 1 }).closest("section")?.nextElementSibling).toBe(departureBoard);
  });

  it("plays only after an explicit action and announces the playing state", async () => {
    renderHome("en");

    fireEvent.click(screen.getByRole("button", { name: "Play mountain video" }));
    expect(playMock).toHaveBeenCalledTimes(1);

    fireEvent.play(screen.getByLabelText("SnowForce mountain video"));
    expect(screen.getByRole("button", { name: "Pause mountain video" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps Chinese content at the same hierarchy", () => {
    renderHome("zh");

    expect(screen.getByRole("heading", { level: 1, name: "一起去雪山" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看正在报名" })).toHaveAttribute("href", "#next-departures");
    expect(screen.getByRole("button", { name: "播放雪山视频" })).toBeInTheDocument();
  });

  it.each([
    ["en", "Gear for your next mountain day.", "Explore the gear shop"],
    ["zh", "下一趟滑行，装备就位。", "逛逛装备商城"],
  ] as const)("promotes real shop products in the %s home scroll flow", (lang, title, cta) => {
    renderHome(lang);
    const section = screen.getByRole("region", { name: title });
    expect(within(section).getByRole("link", { name: cta })).toHaveAttribute("href", "/shop");
    expect(section.querySelectorAll("article")).toHaveLength(3);
    for (const slug of fixtureProducts.map((product) => product.slug)) {
      expect(section.querySelector(`a[href="/shop/${slug}"]`)).toBeInTheDocument();
    }
    expect(within(section).getByText("$79.95")).toBeInTheDocument();
    expect(within(section).getByText("$29.95")).toBeInTheDocument();
    expect(within(section).queryByText(/人民币|CNY|¥/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: lang === "zh" ? "最近的雪山日" : "Recent mountain days" }).nextElementSibling).toBe(section);
    expect(document.querySelector("#open-events")).not.toBeInTheDocument();
  });
  it("keeps the home focused on trips when there are no published products", () => {
    render(<LanguageProvider initialLang="zh"><HomePageView events={[]} recaps={[]} shopProducts={[]} /></LanguageProvider>);
    expect(screen.queryByRole("region", { name: "下一趟滑行，装备就位。" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看正在报名" })).toBeInTheDocument();
  });
});
