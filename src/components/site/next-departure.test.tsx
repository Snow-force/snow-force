import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { seedEvents } from "@/lib/events/seed";
import type { Event } from "@/lib/types";
import { NextDeparture } from "./next-departure";

const first: Event = { ...seedEvents[0], slug: "first", title: { en: "First ride", zh: "第一程" }, eventDate: "2027-01-10", registrationCloseAt: "", coverImage: "", capacity: 10, registrationCount: 3 };
const second: Event = { ...first, slug: "second", title: { en: "Second ride", zh: "第二程" }, eventDate: "2027-02-10", activityLocation: { en: "Bear Mountain", zh: "熊山" }, feeAmount: "$50" };

function show(events = [second, first], lang: "en" | "zh" = "en", loadError = false) {
  return render(<LanguageProvider initialLang={lang}><NextDeparture events={events} loadError={loadError} /></LanguageProvider>);
}

describe("homepage departure board", () => {
  it("starts with the earliest published ride and switches the complete briefing using the keyboard", async () => {
    const user = userEvent.setup();
    show();
    const preview = screen.getByRole("region", { name: "Departure preview" });
    expect(within(preview).getByRole("heading", { name: "First ride" })).toBeVisible();
    expect(within(preview).getByText("7 spots left", { exact: false })).toBeVisible();
    expect(within(preview).getByText(first.paymentInstructions.en)).toBeVisible();
    const choice = screen.getByRole("button", { name: /Second ride/ });
    choice.focus();
    await user.keyboard("{Enter}");
    expect(choice).toHaveAttribute("aria-pressed", "true");
    expect(within(preview).getByRole("heading", { name: "Second ride" })).toBeVisible();
    expect(within(preview).getByText("Bear Mountain")).toBeVisible();
    expect(within(preview).getByText("$50")).toBeVisible();
    expect(within(preview).getByRole("link", { name: "See the plan & join" })).toHaveAttribute("href", "/events/second");
  });

  it("never markets a full or expired event as available", async () => {
    const user = userEvent.setup();
    show([{ ...first, registrationState: "full", registrationCount: 10 }, { ...second, registrationCloseAt: "2000-01-01T00:00:00Z" }]);
    const preview = screen.getByRole("region", { name: "Departure preview" });
    expect(within(preview).getByText(/Registration closed/)).toBeVisible();
    expect(within(preview).queryByRole("link", { name: "See the plan & join" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /First ride/ }));
    expect(within(preview).getByText(/Full/)).toBeVisible();
    expect(within(preview).getByRole("link", { name: "View event details" })).toHaveAttribute("href", "/events/first");
  });

  it("bounds the early preview to three public rides and excludes drafts and archived events", () => {
    show([first, second, { ...first, slug: "third" }, { ...first, slug: "fourth" }, { ...first, slug: "draft", status: "draft" }, { ...first, slug: "archived", status: "archived" }]);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Full ride board" })).toHaveAttribute("href", "/events");
  });

  it("handles unlimited capacity and missing logistics without inventing facts", () => {
    show([{ ...first, capacity: 0, eventDate: "", activityLocation: { en: "", zh: "" }, meetTime: "", meetLocation: { en: "", zh: "" }, feeAmount: "" }]);
    const preview = screen.getByRole("region", { name: "Departure preview" });
    expect(within(preview).getByText(/Registration open/)).toBeVisible();
    expect(within(preview).getByText(/Date to be announced/)).toBeVisible();
    expect(within(preview).getAllByText("To be announced")).toHaveLength(2);
    expect(within(preview).getByText("See event details")).toBeVisible();
  });

  it("renders Chinese choices and the same actionable facts", async () => {
    const user = userEvent.setup();
    show(undefined, "zh");
    await user.click(screen.getByRole("button", { name: /第二程/ }));
    const preview = screen.getByRole("region", { name: "出发预览" });
    expect(within(preview).getByText("熊山")).toBeVisible();
    expect(within(preview).getByText(/剩余 7 个名额/)).toBeVisible();
    expect(within(preview).getByRole("link", { name: "查看安排并报名" })).toHaveAttribute("href", "/events/second");
  });

  it("shows an honest empty state and a useful route into the community", () => {
    show([]);
    expect(screen.getByText("The next ride is in the making.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Meet the crew" })).toHaveAttribute("href", "/recaps");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("removes a failed cover without losing the briefing or event link", () => {
    show([{ ...first, coverImage: "/missing.jpg" }]);
    fireEvent.error(screen.getByRole("img", { name: "First ride" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the plan & join" })).toHaveAttribute("href", "/events/first");
  });

  it("withholds stale event previews when loading fails", () => {
    show([first], "en", true);
    expect(screen.getByText("The schedule is taking a moment.")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Departure preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try the event board" })).toHaveAttribute("href", "/events");
  });
});
