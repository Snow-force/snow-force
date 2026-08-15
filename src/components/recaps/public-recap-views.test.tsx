import { fireEvent, render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "@/lib/language";
import { seedRecaps } from "@/lib/recaps/seed";
import { MountainMemoryReel } from "./mountain-memory-reel";
import { RecapDetailView } from "./recap-detail-view";
import { RecapsView } from "./recaps-view";
import { SafeRecapImage } from "./safe-recap-image";
import { ScrollingMediaStream } from "./scrolling-media-stream";

vi.mock("next/image", () => ({
  default: ({ fill: _fill, priority: _priority, alt = "", ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={alt} />
  ),
}));

function renderInEnglish(ui: ReactNode) {
  return render(<LanguageProvider initialLang="en">{ui}</LanguageProvider>);
}

describe("public recap redesign", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query.includes("min-width"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("scrollTo", vi.fn());
  });

  it("renders the memory reel as event chapters with stable recap calls to action", () => {
    renderInEnglish(<MountainMemoryReel recaps={seedRecaps} />);

    expect(screen.getAllByText("2025 Season Finale — Spring Session").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "View full recap" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Scroll-driven event recap reel" })).toBeInTheDocument();
  });

  it("uses non-animated frame navigation when reduced motion is requested", () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion") || query.includes("min-width"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    renderInEnglish(<MountainMemoryReel recaps={seedRecaps} />);
    fireEvent.click(screen.getByRole("button", { name: "Next memory" }));

    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });

  it("shows an explicit empty memory state without removing the recap section", () => {
    renderInEnglish(<MountainMemoryReel recaps={[]} />);

    expect(screen.getByText("No published recap photos yet. Check back after the next ride.")).toBeInTheDocument();
    expect(document.querySelector("#past-recaps")).toBeInTheDocument();
  });

  it("falls back to the authentic community archive when a recap image fails", () => {
    renderInEnglish(
      <div className="relative h-40 w-40">
        <SafeRecapImage
          src="/missing.jpg"
          alt="Missing recap frame"
          sizes="160px"
          fallbackLabel="Community archive fallback"
          unavailableLabel="Photo unavailable"
          fallbackAlt="SnowForce community group"
        />
      </div>,
    );

    fireEvent.error(screen.getByAltText("Missing recap frame"));
    const fallback = screen.getByAltText("SnowForce community group");
    expect(fallback).toHaveAttribute("src", "/team/group.jpg");
    fireEvent.load(fallback);
    expect(screen.getByText("Community archive fallback")).toBeInTheDocument();
  });

  it("keeps the full-screen photo stream keyboard accessible and restores trigger focus", () => {
    renderInEnglish(<ScrollingMediaStream media={seedRecaps[0].media} />);

    const trigger = screen.getAllByRole("button", { name: /Open Group shot at the peak/ })[0];
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Photo preview" })).toBeInTheDocument();
    expect(screen.getAllByText("Group shot at the peak").length).toBeGreaterThan(0);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getAllByText("Best trick contest").length).toBeGreaterThan(0);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Photo preview" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps list and detail empty/not-found states understandable", () => {
    const { rerender } = renderInEnglish(<RecapsView recaps={[]} />);
    expect(screen.getByText("No published recaps yet.")).toBeInTheDocument();

    rerender(
      <LanguageProvider initialLang="en">
        <RecapDetailView recap={undefined} reviews={[]} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { name: "Recap not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to all recaps" })).toHaveAttribute("href", "/recaps");
  });
});
