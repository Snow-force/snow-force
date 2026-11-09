import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/lib/language";
import { seedEvents } from "@/lib/events/seed";
import type { Event } from "@/lib/types";
import { EventsView } from "./events-view";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

const events: Event[] = Array.from({ length: 4 }, (_, index) => ({
  ...seedEvents[0],
  slug: `ride-${index}`,
  title: { en: `Ride ${index}`, zh: `活动 ${index}` },
  activityLocation: {
    en: index === 0 ? "Genting" : "Bear Mountain",
    zh: index === 0 ? "云顶" : "熊山",
  },
  meetLocation: { en: "Base lodge", zh: "基地大厅" },
  coverImage: "",
  eventDate: index === 0 ? "2027-01-10" : "2027-02-12",
  registrationCloseAt: "",
  capacity: index === 2 ? 0 : 10,
  registrationCount: index === 1 ? 10 : 4,
  registrationState: index === 3 ? "closed" : "open",
  feeAmount: index === 2 ? "" : "$50",
}));
function show(
  props: Partial<React.ComponentProps<typeof EventsView>> = {},
  lang: "en" | "zh" = "en",
) {
  return render(
    <LanguageProvider initialLang={lang}>
      <EventsView events={events} {...props} />
    </LanguageProvider>,
  );
}

describe("ride planning board", () => {
  it("combines bilingual search, month and real availability filters, then resets", async () => {
    const user = userEvent.setup();
    show();
    await user.type(screen.getByRole("searchbox"), "云顶");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 4 events");
    await user.selectOptions(screen.getByLabelText("When"), "2027-02");
    expect(screen.getByText("No rides match just yet.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Show all events" }));
    await user.click(
      screen.getByRole("button", { name: "Open for registration" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 of 4 events");
    expect(
      screen.queryByRole("button", { name: "Add to comparison: Ride 1" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add to comparison: Ride 3" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("status")).toHaveTextContent("4 of 4 events");
  });

  it("keeps a bounded shortlist across filtering, compares published facts and allows swapping", async () => {
    const user = userEvent.setup();
    show();
    await user.click(
      screen.getByRole("button", { name: "Add to comparison: Ride 0" }),
    );
    expect(
      screen.getByRole("button", { name: "Compare rides" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Add to comparison: Ride 1" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add to comparison: Ride 2" }),
    );
    expect(
      screen.getByRole("button", { name: "Add to comparison: Ride 3" }),
    ).toBeDisabled();
    await user.type(screen.getByRole("searchbox"), "no match");
    expect(
      screen.getByRole("complementary", { name: "Your ride shortlist" }),
    ).toHaveTextContent("3/3");
    await user.click(screen.getByRole("button", { name: "Compare rides" }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("Genting")).toBeVisible();
    expect(within(table).getByText("Full")).toBeVisible();
    expect(within(table).getByText("Open · No capacity limit")).toBeVisible();
    expect(within(table).getByText("See event details")).toBeVisible();
    expect(
      within(table).getByRole("link", { name: "View event: Ride 0" }),
    ).toHaveAttribute("href", "/events/ride-0");
    await user.click(
      screen.getByRole("button", { name: "Remove from shortlist: Ride 1" }),
    );
    expect(within(table).queryByText("Ride 1")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Remove from shortlist: Ride 2" }),
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(
      screen.getByRole("button", { name: "Add to comparison: Ride 3" }),
    ).toBeEnabled();
  });

  it("renders Chinese controls and comparison labels", async () => {
    const user = userEvent.setup();
    show({}, "zh");
    await user.click(screen.getByRole("button", { name: "加入对比: 活动 0" }));
    await user.click(screen.getByRole("button", { name: "加入对比: 活动 1" }));
    await user.click(screen.getByRole("button", { name: "对比活动" }));
    expect(
      screen.getByRole("heading", { name: "哪一程，更适合你？" }),
    ).toBeVisible();
    expect(within(screen.getByRole("table")).getByText("云顶")).toBeVisible();
    expect(screen.getByLabelText("出发月份")).toBeVisible();
  });

  it("distinguishes no events from a load failure without exposing infrastructure", () => {
    const view = show({ events: [] });
    expect(
      screen.getByRole("link", { name: /Meet the crew through past recaps/ }),
    ).toHaveAttribute("href", "/recaps");
    view.rerender(
      <LanguageProvider initialLang="en">
        <EventsView events={[]} loadError />
      </LanguageProvider>,
    );
    expect(screen.getByText(/couldn’t load/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/events",
    );
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Supabase/)).not.toBeInTheDocument();
  });
});
