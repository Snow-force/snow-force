import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { seedEvents } from "@/lib/events/seed";
import { briefingSectionEvent } from "@/lib/events/trip-concierge";
import type { Event } from "@/lib/types";
import { EventBriefing } from "./event-briefing";
import { TripConcierge } from "./trip-concierge";

const event: Event = { ...seedEvents[0], registrationCloseAt: "2099-01-01T00:00:00Z", eventDate: "2099-01-10" };
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  // Reduced motion: answers render immediately, without the typing delay.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.useRealTimers();
});

function renderConcierge(lang: "en" | "zh" = "en", overrides: Partial<Event> = {}) {
  document.cookie = `lang=${lang};path=/`;
  return render(
    <LanguageProvider>
      <TripConcierge event={{ ...event, ...overrides }} />
    </LanguageProvider>,
  );
}

describe("TripConcierge", () => {
  it("opens with a grounded trip snapshot and focuses the question box", async () => {
    const user = userEvent.setup();
    renderConcierge();
    await user.click(screen.getByRole("button", { name: /questions before you join/i }));
    const dialog = screen.getByRole("dialog", { name: "SnowForce trip desk" });
    expect(within(dialog).getByText(/I only answer from what the organizer has published/)).toBeInTheDocument();
    expect(within(dialog).getByText("Spots left: 46/80")).toBeInTheDocument();
    expect(screen.getByLabelText("Ask about this trip")).toHaveFocus();
  });

  it("answers a suggested question and retires that suggestion", async () => {
    const user = userEvent.setup();
    renderConcierge();
    await user.click(screen.getByRole("button", { name: /questions before you join/i }));
    await user.click(screen.getByRole("button", { name: "What should I bring?" }));
    const log = screen.getByRole("log");
    expect(within(log).getByText("Helmets are strongly recommended")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What should I bring?" })).not.toBeInTheDocument();
  });

  it("answers typed questions in Chinese and hands off to a human when unsure", async () => {
    const user = userEvent.setup();
    renderConcierge("zh");
    await user.click(screen.getByRole("button", { name: /报名前有疑问/ }));
    await user.type(screen.getByLabelText("询问这场活动"), "几点在哪里集合{enter}");
    expect(within(screen.getByRole("log")).getByText("集合时间: 09:00")).toBeInTheDocument();
    await user.type(screen.getByLabelText("询问这场活动"), "随便聊聊{enter}");
    expect(screen.getByRole("button", { name: "联系真人领队" })).toBeInTheDocument();
  });

  it("asks the briefing to open the section that backs an answer", async () => {
    const user = userEvent.setup();
    const heard = vi.fn();
    window.addEventListener(briefingSectionEvent, heard);
    renderConcierge();
    await user.click(screen.getByRole("button", { name: /questions before you join/i }));
    await user.click(screen.getByRole("button", { name: "How much is it?" }));
    await user.click(screen.getByRole("button", { name: "Check it in: Costs & terms" }));
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toBe("costs");
    window.removeEventListener(briefingSectionEvent, heard);
  });

  it("closes with Escape and returns focus to the launcher", async () => {
    const user = userEvent.setup();
    renderConcierge();
    const launcher = screen.getByRole("button", { name: /questions before you join/i });
    await user.click(launcher);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });

  it("hides the registration handoff when registration is closed", async () => {
    const user = userEvent.setup();
    renderConcierge("en", { registrationState: "closed" });
    await user.click(screen.getByRole("button", { name: /questions before you join/i }));
    expect(screen.queryByRole("button", { name: /take me to registration/i })).not.toBeInTheDocument();
    expect(screen.getByText("Registration: closed")).toBeInTheDocument();
  });
  it("contains mobile keyboard focus and restores background scrolling and inertness on close", async () => {
    const user = userEvent.setup();
    const previous = document.body.style.overflow;
    render(<LanguageProvider initialLang="en"><button>Background action</button><TripConcierge event={event}/></LanguageProvider>);
    const outside = screen.getByRole("button", { name: "Background action" });
    await user.click(screen.getByRole("button", { name: /questions before you join/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(outside.closest("[inert]")).not.toBeNull();
    const first = within(dialog).getByRole("button", { name: "Close trip desk" });
    const last = within(dialog).getByRole("button", { name: /take me to registration/i });
    first.focus(); await user.tab({ shift: true }); expect(last).toHaveFocus();
    await user.tab(); expect(first).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe(previous);
    expect(outside.closest("[inert]")).toBeNull();
  });
  it("keeps desktop conversations non-modal", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query.includes("prefers-reduced-motion") || query.includes("min-width"), addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
    const previous = document.body.style.overflow;
    const user = userEvent.setup(); renderConcierge();
    await user.click(screen.getByRole("button", { name: /questions before you join/i }));
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "false");
    expect(document.body.style.overflow).toBe(previous);
  });
  it("leaves Escape to the page when desktop focus is outside the trip desk", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query.includes("prefers-reduced-motion") || query.includes("min-width"), addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
    const user = userEvent.setup();
    render(<LanguageProvider initialLang="en"><button>Page control</button><TripConcierge event={event}/></LanguageProvider>);
    await user.click(screen.getByRole("button", { name: /questions before you join/i }));
    screen.getByRole("button", { name: "Page control" }).focus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    screen.getByLabelText("Ask about this trip").focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("closes the mobile sheet before focusing registration", async () => {
    const user = userEvent.setup();
    render(<LanguageProvider initialLang="en"><aside id="event-registration" tabIndex={-1}>Registration</aside><TripConcierge event={event}/></LanguageProvider>);
    await user.click(screen.getByRole("button", { name: /questions before you join/i }));
    await user.click(screen.getByRole("button", { name: /take me to registration/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.getElementById("event-registration")).toHaveFocus();
    expect(document.querySelector("[inert]")).toBeNull();
  });
  it("shows a delayed answer once and cancels pending replies on unmount", () => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
    const rendered = renderConcierge();
    fireEvent.click(screen.getByRole("button", { name: /questions before you join/i }));
    fireEvent.click(screen.getByRole("button", { name: "How much is it?" }));
    expect(screen.getByLabelText("Trip desk is typing")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(420));
    expect(screen.queryByLabelText("Trip desk is typing")).not.toBeInTheDocument();
    expect(screen.getAllByText("The listed fee is Free.")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "How do I pay?" }));
    expect(screen.getByLabelText("Trip desk is typing")).toBeInTheDocument();
    rendered.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector("[inert]")).toBeNull();
  });
  it("returns to the latest messages when an existing conversation is reopened", async () => {
    const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scroll });
    try {
      const user = userEvent.setup(); renderConcierge();
      await user.click(screen.getByRole("button", { name: /questions before you join/i }));
      await user.click(screen.getByRole("button", { name: "How much is it?" }));
      const calls = scroll.mock.calls.length;
      await user.click(screen.getByRole("button", { name: "Close trip desk" }));
      await user.click(screen.getByRole("button", { name: /questions before you join/i }));
      expect(scroll).toHaveBeenCalledTimes(calls + 1);
    } finally {
      if (previous) Object.defineProperty(HTMLElement.prototype, "scrollTo", previous);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
    }
  });
});

describe("EventBriefing trip desk link", () => {
  it("switches to the requested section", async () => {
    document.cookie = "lang=en;path=/";
    render(
      <LanguageProvider>
        <EventBriefing event={event} formattedDate="January 10, 2099" open />
      </LanguageProvider>,
    );
    expect(screen.getByRole("button", { name: /costs & terms/i })).toHaveAttribute("aria-pressed", "false");
    act(() => window.dispatchEvent(new CustomEvent(briefingSectionEvent, { detail: "costs" })));
    expect(await screen.findByRole("button", { name: /costs & terms/i })).toHaveAttribute("aria-pressed", "true");
  });
  it("reveals the published highlights that support the itinerary fallback and focuses their heading", async () => {
    const user = userEvent.setup();
    render(<LanguageProvider initialLang="en"><EventBriefing event={event} formattedDate="January 10, 2099" open/><TripConcierge event={event}/></LanguageProvider>);
    await user.click(screen.getByRole("button", { name: /questions before you join/i }));
    await user.type(screen.getByLabelText("Ask about this trip"), "What's the plan?{enter}");
    await user.click(screen.getByRole("button", { name: "Check it in: The plan" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(document.getElementById("briefing-plan")!).getByText("Group ride through selected terrain")).toBeVisible();
    expect(document.getElementById("mountain-briefing-title")).toHaveFocus();
  });
});
