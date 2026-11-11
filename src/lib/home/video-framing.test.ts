import { describe, expect, it } from "vitest";
import { mountainVideoPosition } from "./video-framing";

describe("subject-aware mobile mountain framing", () => {
  const subjects = [[0, .8], [2.5, .8], [3.5, .42], [4.5, .48], [5.5, .71], [6.5, .78], [7.5, .54], [8.5, .60], [9.5, .46], [10.5, .35], [11.5, .35], [12.5, .39], [13.5, .40], [14.5, .56]];
  it.each([[320, 504], [390, 780], [430, 868]])("keeps reviewed snowpeak/rider keyframes inside the %sx%s portrait crop", (width, height) => {
    const visible = width / height / (16 / 9);
    for (const [time, subject] of subjects) {
      const position = parseFloat(mountainVideoPosition(time, width, height)) / 100;
      const left = position * (1 - visible);
      expect(subject).toBeGreaterThan(left + visible * .2);
      expect(subject).toBeLessThan(left + visible * .8);
    }
  });
  it("does not pan through unrelated scenery across a shot cut", () => {
    expect(parseFloat(mountainVideoPosition(2.99, 390, 780))).toBeGreaterThan(90);
    expect(parseFloat(mountainVideoPosition(3, 390, 780))).toBeLessThan(45);
  });
  it("follows actual playback time when seeking or looping, rather than an independent animation clock", () => {
    expect(mountainVideoPosition(0, 390, 780)).toBe(mountainVideoPosition(2, 390, 780));
    expect(mountainVideoPosition(0, 390, 780)).not.toBe(mountainVideoPosition(14.5, 390, 780));
    expect(mountainVideoPosition(-1, 390, 780)).toBe(mountainVideoPosition(0, 390, 780));
  });
  it("has safe fallbacks for unmeasured elements, invalid times and uncropped landscape frames", () => {
    expect(mountainVideoPosition(0, 0, 0)).toBe("92% 50%");
    expect(mountainVideoPosition(NaN, 390, 780)).toBe(mountainVideoPosition(0, 390, 780));
    expect(mountainVideoPosition(8, 1280, 720)).toBe("50% 50%");
    expect(parseFloat(mountainVideoPosition(99, 390, 780))).toBeLessThanOrEqual(100);
  });
});
