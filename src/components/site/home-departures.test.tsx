import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LanguageProvider, type Lang } from "@/lib/language";
import type { HomeEvent } from "@/lib/home/types";
import { seedEvents } from "@/lib/events/seed";
import { HomeDepartures } from "./home-departures";

const ride: HomeEvent = {
  ...seedEvents[0], slug: "mountain-day", status: "published", registrationState: "open",
  title: { en: "Mountain day", zh: "一起上山" }, coverImage: "/event-poster.jpg",
};

function show(events: HomeEvent[] = [ride], lang: Lang = "en", loadError = false) {
  return render(<LanguageProvider initialLang={lang}><HomeDepartures events={events} loadError={loadError} /></LanguageProvider>);
}

describe("homepage event entry", () => {
  it.each(["en", "zh"] as const)("puts the actionable details before the linked poster in %s reading order", lang => {
    show([ride], lang);
    const cta = screen.getByRole("link", { name: lang === "en" ? "View event details" : "查看活动详情" });
    const poster = screen.getByRole("link", { name: lang === "en" ? "View event poster: Mountain day" : "查看活动海报：一起上山" });
    expect(cta).toHaveAttribute("href", "/events/mountain-day");
    expect(poster).toHaveAttribute("href", "/events/mountain-day");
    expect(cta.compareDocumentPosition(poster) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(poster).getByRole("img")).toHaveAttribute("loading", "lazy");
  });

  it("updates both event entry points when a different departure is selected by keyboard", async () => {
    const user = userEvent.setup();
    show([ride, { ...ride, slug: "second-day", title: { en: "Second day", zh: "第二程" } }]);
    const choice = screen.getByRole("button", { name: /Second day/ });
    choice.focus();
    await user.keyboard("{Enter}");
    expect(choice).toHaveAttribute("aria-pressed", "true");
    for (const name of ["View event details", "View event poster: Second day"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", "/events/second-day");
    }
  });

  it.each([false, true])("keeps an honest recovery path without an event poster link (load error: %s)", loadError => {
    show(loadError ? [ride] : [], "en", loadError);
    expect(screen.queryByRole("link", { name: /View event poster/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View event details" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: loadError ? "Try the event board" : "Meet the crew" })).toHaveAttribute("href", loadError ? "/events" : "/recaps");
  });

  it("keeps the event action usable when both the poster and fallback fail", () => {
    show();
    const poster = screen.getByRole("link", { name: "View event poster: Mountain day" });
    fireEvent.error(within(poster).getByRole("img"));
    fireEvent.error(within(poster).getByRole("img"));
    expect(within(poster).getByRole("img", { name: /Photo unavailable/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View event details" })).toHaveAttribute("href", "/events/mountain-day");
  });
});
