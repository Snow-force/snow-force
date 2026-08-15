import { describe, expect, it } from "vitest";

import { seedRecaps } from "@/lib/recaps/seed";
import {
  buildRecapReelFrames,
  getReelHeightVh,
  getReelPosition,
  orderedRecapMedia,
  shouldUseDesktopReel,
} from "./mountain-memory-reel-utils";

describe("mountain memory reel helpers", () => {
  it("starts each recap with its cover and then follows media.order without duplicating the cover URL", () => {
    const recap = {
      ...seedRecaps[0],
      coverImage: "/cover.jpg",
      media: [
        { ...seedRecaps[0].media[0], id: "later", url: "/later.jpg", order: 2 },
        { ...seedRecaps[0].media[1], id: "cover", url: "/cover.jpg", order: 0 },
        { ...seedRecaps[0].media[2], id: "middle", url: "/middle.jpg", order: 1 },
      ],
    };

    expect(orderedRecapMedia(recap).map((item) => item.id)).toEqual(["cover", "middle", "later"]);
    expect(buildRecapReelFrames([recap]).map((frame) => frame.imageUrl)).toEqual([
      "/cover.jpg",
      "/middle.jpg",
      "/later.jpg",
    ]);
  });

  it("maps normalized progress to a stable frame and local frame progress", () => {
    expect(getReelPosition(-1, 4)).toEqual({ index: 0, frameProgress: 0, overallProgress: 0 });
    expect(getReelPosition(0.375, 4)).toEqual({ index: 1, frameProgress: 0.5, overallProgress: 0.375 });
    expect(getReelPosition(1, 4)).toEqual({ index: 3, frameProgress: 1, overallProgress: 1 });
  });

  it("keeps the desktop story inside the requested 220vh to 320vh range", () => {
    expect(getReelHeightVh(1)).toBe(220);
    expect(getReelHeightVh(6)).toBe(300);
    expect(getReelHeightVh(20)).toBe(320);
  });

  it("uses the scrubbed reel only for multi-frame desktop sessions without reduced motion", () => {
    expect(shouldUseDesktopReel({ isDesktop: true, reduceMotion: false, frameCount: 4 })).toBe(true);
    expect(shouldUseDesktopReel({ isDesktop: false, reduceMotion: false, frameCount: 4 })).toBe(false);
    expect(shouldUseDesktopReel({ isDesktop: true, reduceMotion: true, frameCount: 4 })).toBe(false);
    expect(shouldUseDesktopReel({ isDesktop: true, reduceMotion: false, frameCount: 1 })).toBe(false);
  });
});
