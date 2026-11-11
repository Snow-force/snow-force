import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { HomeHero } from "./home-hero";

function show() { return render(<LanguageProvider initialLang="en"><HomeHero /></LanguageProvider>); }
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("homepage motion lifecycle", () => {
  it("pauses offscreen, on hidden tabs and on reduced-motion changes, then cleans up without restarting", () => {
    let onIntersection: IntersectionObserverCallback | undefined;
    let onMotion: (() => void) | undefined;
    const disconnect = vi.fn();
    const removeMotion = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { onIntersection = callback; }
      observe() {}
      disconnect() { disconnect(); }
    });
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: (_type: string, callback: () => void) => { onMotion = callback; }, removeEventListener: removeMotion }));
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const { unmount } = show();
    onIntersection?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(pause).toHaveBeenCalledTimes(1);
    onIntersection?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(play).not.toHaveBeenCalled();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    expect(pause).toHaveBeenCalledTimes(2);
    onMotion?.();
    expect(pause).toHaveBeenCalledTimes(3);
    expect(screen.getByLabelText("SnowForce mountain video")).not.toHaveAttribute("src");
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(removeMotion).toHaveBeenCalled();
  });
  it("updates portrait framing from the actual media clock without changing the source", () => {
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    show();
    const video = screen.getByLabelText("SnowForce mountain video");
    Object.defineProperties(video, { clientWidth: { value: 390 }, clientHeight: { value: 780 }, currentTime: { value: 3.5, writable: true } });
    fireEvent.timeUpdate(video);
    expect(parseFloat(video.style.getPropertyValue("--sf-mobile-video-position"))).toBeCloseTo(38.87, 1);
    expect(video).not.toHaveAttribute("src");
  });
  it("recovers from a rejected playback attempt with an accessible status and retry", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(new Error("blocked")).mockResolvedValueOnce();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    show();
    fireEvent.click(screen.getByRole("button", { name: "Play mountain video" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Play mountain video" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
