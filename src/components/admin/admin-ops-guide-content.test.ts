import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { opsGuides, parseOpsGuideProgress } from "./admin-ops-guide-content";

describe("ops workflow content and saved learning progress", () => {
  it("has bilingual content, unique stable steps, and links to actual admin pages or desk anchors", () => {
    const steps = opsGuides.flatMap((guide) => guide.steps);
    expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
    for (const guide of opsGuides) {
      expect(guide.steps.length).toBeGreaterThan(0);
      for (const lang of ["en", "zh"] as const) {
        expect(guide.title[lang].trim()).not.toBe("");
        expect(guide.description[lang].trim()).not.toBe("");
        for (const step of guide.steps) {
          for (const value of [step.title, step.instruction, step.check, step.action]) expect(value[lang].trim()).not.toBe("");
        }
      }
    }
    for (const step of steps) {
      if (step.href.startsWith("#")) expect(["#ops-work-queue", "#inquiries", "#ops-shift-handoff"]).toContain(step.href);
      else {
        expect(step.href.startsWith("/admin/")).toBe(true);
        expect(existsSync(join(process.cwd(), "src/app", step.href.split("#")[0], "page.tsx"))).toBe(true);
      }
    }
  });

  it.each([null, "bad json", "null", "[]", "false", "{}"])("recovers safely from absent or invalid stored progress: %s", (raw) => {
    expect(parseOpsGuideProgress(raw)).toEqual({ guideId: "daily", stepIndex: 0, completed: [] });
  });

  it("discards unknown or duplicate steps and bounds the current step", () => {
    expect(parseOpsGuideProgress(JSON.stringify({ guideId: "events", stepIndex: 900, completed: ["daily-queue", "unknown", "daily-queue", 2, null] }))).toEqual({ guideId: "events", stepIndex: 0, completed: ["daily-queue"] });
    for (const stepIndex of [-1, 0.5, "1"]) expect(parseOpsGuideProgress(JSON.stringify({ guideId: "events", stepIndex })).stepIndex).toBe(0);
    expect(parseOpsGuideProgress(JSON.stringify({ guideId: "removed", stepIndex: 0, completed: "all" }))).toEqual({ guideId: "daily", stepIndex: 0, completed: [] });
  });

  it("restores the selected workflow, step, and valid learning progress", () => {
    expect(parseOpsGuideProgress(JSON.stringify({ guideId: "registrations", stepIndex: 2, completed: ["registrations-find"] }))).toEqual({ guideId: "registrations", stepIndex: 2, completed: ["registrations-find"] });
  });
});
