import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider, type Lang } from "@/lib/language";
import { HomePageView } from "./home-page-view";
import { fixtureProducts } from "@/lib/shop/shop.fixtures";
import { seedEvents } from "@/lib/events/seed";
import { seedRecaps } from "@/lib/recaps/seed";
import userEvent from "@testing-library/user-event";

const playMock = vi.fn<() => Promise<void>>();
const pauseMock = vi.fn();
function renderHome(lang: Lang = "en", withEvent = false) {
  return render(<LanguageProvider initialLang={lang}><HomePageView events={withEvent ? [seedEvents[0]] : []} recaps={[]} shopProducts={fixtureProducts} /></LanguageProvider>);
}
describe("cinematic bilingual homepage", () => {
  beforeEach(() => {
    playMock.mockReset().mockResolvedValue(undefined);
    pauseMock.mockReset();
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: playMock });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pauseMock });
  });
  it.each([["en", "See you up there."], ["zh", "山上见。"]] as const)("renders the selected visual hierarchy in %s without fabricated offers", (lang, title) => {
    renderHome(lang);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/10% off|新人九折/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: lang === "en" ? "Recent mountain days" : "最近的雪山日" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: lang === "en" ? "View open events" : "查看正在报名" })).toHaveAttribute("href", "#next-departures");
  });
  it("preserves the original video without loading it before an explicit play action", async () => {
    renderHome();
    const video = screen.getByLabelText("SnowForce mountain video");
    expect(video).toHaveAttribute("poster", "/videos/snowmountain-poster.jpg");
    expect(video).toHaveAttribute("preload", "none");
    expect(video).not.toHaveAttribute("src");
    expect(video).not.toHaveAttribute("autoplay");
    expect(playMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play mountain video" }));
    expect(video).toHaveAttribute("src", "/videos/snowmountain.mp4");
    expect(playMock).toHaveBeenCalledTimes(1);
    fireEvent.play(video);
    fireEvent.click(screen.getByRole("button", { name: "Pause mountain video" }));
    expect(pauseMock).toHaveBeenCalled();
  });
  it("retains a usable hero and retry when playback fails", async () => {
    renderHome();
    fireEvent.error(screen.getByLabelText("SnowForce mountain video"));
    expect(screen.getByRole("status")).toHaveTextContent("Video unavailable. You can still explore the trips below.");
    expect(screen.getByRole("button", { name: "Play mountain video" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "View open events" })).toBeVisible();
  });
  it("does not promise live seat counts from cached event discovery", () => {
    renderHome("en", true);
    const board = screen.getByRole("region", { name: "Next departure" });
    expect(within(board).queryByText(/spots left/)).not.toBeInTheDocument();
    expect(within(board).getByText("Availability and final pricing are confirmed on the event page.")).toBeInTheDocument();
    expect(within(board).getByRole("link", { name: "View event details" })).toHaveAttribute("href", `/events/${seedEvents[0].slug}`);
  });
  it("switches departure details with the keyboard without loading another page", async () => {
    const user = userEvent.setup();
    const first = { ...seedEvents[0], slug: "first", status: "published" as const, registrationState: "open" as const, title: { en: "First ride", zh: "第一程" } };
    const second = { ...first, slug: "second", title: { en: "Second ride", zh: "第二程" } };
    render(<LanguageProvider initialLang="en"><HomePageView events={[first, second]} recaps={[]} /></LanguageProvider>);
    const choice = screen.getByRole("button", { name: /Second ride/ });
    choice.focus();
    await user.keyboard("{Enter}");
    expect(choice).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("region", { name: "Departure preview" })).getByRole("link", { name: "View event details" })).toHaveAttribute("href", "/events/second");
  });
  it("shows at most three published recap covers without eagerly loading albums", () => {
    const recap = { ...seedRecaps[0], status: "published" as const };
    const recaps = [1, 2, 3, 4].map(index => ({ ...recap, slug: `story-${index}` }));
    render(<LanguageProvider initialLang="en"><HomePageView events={[]} recaps={[{ ...recap, slug: "hidden", status: "hidden" }, ...recaps]} /></LanguageProvider>);
    const archive = screen.getByRole("region", { name: "Recent mountain days" });
    expect(archive.querySelectorAll('a[href^="/recaps/"]')).toHaveLength(3);
    expect(archive.querySelector('a[href="/recaps/hidden"]')).not.toBeInTheDocument();
    expect(archive.querySelector('a[href="/recaps/story-4"]')).not.toBeInTheDocument();
    for (const image of within(archive).getAllByRole("img")) expect(image).toHaveAttribute("loading", "lazy");
  });
  it.each([["en", "Gear for your next mountain day.", "Explore the gear shop"], ["zh", "下一趟滑行，装备就位。", "逛逛装备商城"]] as const)("keeps real commerce and event routes accessible in %s", (lang, title, cta) => {
    renderHome(lang);
    const shop = screen.getByRole("region", { name: title });
    expect(within(shop).getByRole("link", { name: cta })).toHaveAttribute("href", "/shop");
    expect(shop.querySelectorAll("article")).toHaveLength(3);
    expect(screen.getByRole("link", { name: lang === "en" ? "See how it works" : "看看怎么玩" })).toHaveAttribute("href", "#how-we-ride");
  });
});
