import { describe, expect, it } from "vitest";

import { localizedList, localizedText } from "./fallback";

describe("localized fallback helpers", () => {
  it("falls back from empty English text to Chinese", () => {
    expect(localizedText({ zh: "中文标题", en: "" }, "en")).toBe("中文标题");
  });

  it("uses English text when present", () => {
    expect(localizedText({ zh: "中文标题", en: "English title" }, "en")).toBe("English title");
  });

  it("falls back from empty English list to Chinese list", () => {
    expect(localizedList({ zh: ["雪场", "合影"], en: [] }, "en")).toEqual(["雪场", "合影"]);
  });

  it("returns empty string when both languages are empty", () => {
    expect(localizedText({ zh: "", en: "" }, "en")).toBe("");
  });

  it("returns preferred list when available", () => {
    expect(localizedList({ zh: ["雪场"], en: ["Resort"] }, "en")).toEqual(["Resort"]);
  });

  it("falls back from empty zh list to en list", () => {
    expect(localizedList({ zh: [], en: ["Resort"] }, "zh")).toEqual(["Resort"]);
  });
});
