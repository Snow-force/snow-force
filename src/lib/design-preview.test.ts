import { describe, expect, it } from "vitest";

import { isDesignPreviewEnabled } from "./design-preview";

describe("isDesignPreviewEnabled", () => {
  it("allows the local preview in development", () => {
    expect(isDesignPreviewEnabled("development")).toBe(true);
  });

  it.each(["production", "test", undefined] as const)("blocks the local preview for %s", (nodeEnv) => {
    expect(isDesignPreviewEnabled(nodeEnv)).toBe(false);
  });
});
