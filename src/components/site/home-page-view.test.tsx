import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider, type Lang } from "@/lib/language";
import { HomePageView } from "./home-page-view";

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
      <HomePageView events={[]} recaps={[]} />
    </LanguageProvider>,
  );
}

describe("HomePageView public story", () => {
  beforeEach(() => {
    playMock.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: playMock });
  });

  it("keeps the hero video user initiated and preserves both conversion links", () => {
    renderHome("en");

    expect(playMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play mountain video" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("link", { name: "View open events" })).toHaveAttribute("href", "#open-events");
    expect(screen.getByRole("link", { name: "See how it works" })).toHaveAttribute("href", "#how-we-ride");
    expect(screen.getByRole("region", { name: "Recap reel" })).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "查看正在报名" })).toHaveAttribute("href", "#open-events");
    expect(screen.getByRole("button", { name: "播放雪山视频" })).toBeInTheDocument();
  });
});
