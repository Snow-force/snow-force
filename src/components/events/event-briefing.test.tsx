import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { seedEvents } from "@/lib/events/seed";
import type { Event, EventDetailModule } from "@/lib/types";
import { EventBriefing } from "./event-briefing";

const event = seedEvents[0];
const renderBriefing = (
  overrides: Partial<Event> = {},
  lang = "en",
  open = true,
) => {
  document.cookie = `lang=${lang};path=/`;
  return render(
    <LanguageProvider>
      <EventBriefing
        event={{ ...event, ...overrides }}
        formattedDate="November 15, 2026"
        open={open}
      />
    </LanguageProvider>,
  );
};
const moduleRow = (
  type: EventDetailModule["type"],
  displayMode: EventDetailModule["displayMode"] = "rich_text",
): EventDetailModule => ({
  id: type,
  type,
  displayMode,
  title: { en: `${type} title`, zh: `${type}标题` },
  content: { en: `${type} content`, zh: `${type}内容` },
  items: { en: ["First note", "Second note"], zh: ["第一项", "第二项"] },
});

describe("EventBriefing", () => {
  it("opens on the real meetup plan with a safe map and registration destination", () => {
    renderBriefing({
      detailModules: [moduleRow("itinerary"), { ...moduleRow("itinerary", "list"), id: "itinerary-list" }],
    });
    expect(screen.getByText(event.meetLocation.en)).toBeVisible();
    expect(screen.getByText(event.meetTime)).toBeVisible();
    expect(screen.getByText("itinerary content")).toBeVisible();
    expect(screen.getByText("First note")).toBeVisible();
    expect(screen.getByRole("link", { name: "View on map" })).toHaveAttribute(
      "href",
      event.locationUrl,
    );
    expect(
      screen.getByRole("link", { name: "Ready? Join this ride" }),
    ).toHaveAttribute("href", "#event-registration");
    expect(screen.getByText("Listed activity fee")).not.toBeVisible();
  });

  it("supports keyboard section changes and tracks reversible review checks across panels", async () => {
    const user = userEvent.setup();
    renderBriefing();
    const prepare = screen.getByRole("button", { name: "Get ready" });
    prepare.focus();
    await user.keyboard("{Enter}");
    expect(prepare).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "0 of 3 notes reviewed",
    );
    for (const check of screen.getAllByRole("checkbox"))
      await user.click(check);
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "3");
    expect(screen.getByRole("status")).toHaveTextContent(
      "3 of 3 notes reviewed",
    );
    await user.click(screen.getByRole("button", { name: "The plan" }));
    await user.click(prepare);
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 of 3 notes reviewed",
    );
    expect(screen.getByText(/do not complete registration/)).toBeVisible();
  });

  it("shows published fees, payment instructions, and refund terms without generic replacement", async () => {
    const user = userEvent.setup();
    renderBriefing({
      detailModules: [moduleRow("fees"), moduleRow("refund", "list")],
    });
    await user.click(screen.getByRole("button", { name: "Costs & terms" }));
    expect(screen.getByText(event.feeAmount)).toBeVisible();
    expect(screen.getByText(event.paymentInstructions.en)).toBeVisible();
    expect(screen.getByText("fees content")).toBeVisible();
    expect(screen.getByText("First note")).toBeVisible();
    expect(
      screen.queryByText(/terms have not been published/),
    ).not.toBeInTheDocument();
  });

  it("handles missing logistics, notes, fees, and terms honestly and keeps closed registration closed", async () => {
    const user = userEvent.setup();
    renderBriefing(
      {
        meetTime: "",
        activityLocation: { en: "", zh: "" },
        meetLocation: { en: "", zh: "" },
        feeAmount: "",
        paymentInstructions: { en: "", zh: "" },
        locationUrl: "javascript:alert(1)",
        detailModules: [],
      },
      "en",
      false,
    );
    expect(
      screen.queryByRole("link", { name: "View on map" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("To be announced").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "View registration status" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Get ready" }));
    expect(
      screen.getByText(/hasn’t published preparation notes/),
    ).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Costs & terms" }));
    expect(
      screen.getByText(/Payment details have not been published/),
    ).toBeVisible();
    expect(
      screen.getByText(/Cancellation and refund terms have not been published/),
    ).toBeVisible();
  });

  it("supports Chinese, bilingual fallbacks, and text-only notes without making up a checklist", () => {
    renderBriefing(
      {
        meetLocation: { en: "Fallback lodge", zh: "" },
        detailModules: [
          {
            ...moduleRow("notes"),
            title: { en: "Fallback heading", zh: "" },
            content: { en: "Fallback note", zh: "" },
          },
          {
            ...moduleRow("notes", "list"),
            id: "list",
            items: { en: ["Fallback item"], zh: [] },
          },
        ],
      },
      "zh",
    );
    expect(screen.getByText("Fallback lodge")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "出发准备" }));
    expect(screen.getByText("Fallback note")).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: "Fallback item" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("已确认 0 / 1 项须知");
    fireEvent.click(screen.getByRole("button", { name: "费用与规则" }));
    expect(screen.getByText(event.paymentInstructions.zh)).toBeVisible();
  });
});
