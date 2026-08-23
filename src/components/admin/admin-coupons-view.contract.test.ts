import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminCouponsView configurable usage limit", () => {
  it("collects a positive integer limit and displays each coupon's configured maximum", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src", "components", "admin", "admin-coupons-view.tsx"),
      "utf8",
    );

    expect(source).toContain('name="maxRedemptions"');
    expect(source).toContain('min="1"');
    expect(source).toContain('step="1"');
    expect(source).toContain("coupon.maxRedemptions");
    expect(source).not.toContain("redemptionCounts[index]} / 1");
  });
});
