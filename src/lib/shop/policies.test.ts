import { describe, expect, it } from "vitest";
import { shopPolicySections, shopPublishedPolicyResponseSchema, shopPublishedPolicySchema } from "./policies";

function policy() {
  return {
    schema_version: 1,
    version: 3,
    effective_at: "2026-09-29T12:00:00.000Z",
    content: {
      seller_name: "Fixture Gear LLC", customer_service_email: "support@example.test",
      terms: { return_window_days: 30, approved_dispatch_days: 14, review_business_days: 2, refund_business_days: 5, processing_business_days_min: 1, processing_business_days_max: 2, transit_business_days_min: 3, transit_business_days_max: 7 },
      copy: Object.fromEntries(shopPolicySections.map((section) => [section, { en: `Published ${section}`, zh: `已发布 ${section}` }])),
    },
  };
}

describe("public shop policy contract", () => {
  it("accepts the published projection and a distinct unpublished result", () => {
    expect(shopPublishedPolicySchema.parse(policy()).version).toBe(3);
    expect(shopPublishedPolicyResponseSchema.parse({ policy: null })).toEqual({ policy: null });
  });
  it("rejects draft defaults, missing translations, invalid dates and private audit fields", () => {
    const value = policy();
    for (const invalid of [
      { ...value, version: 0 }, { ...value, effective_at: "not-a-date" },
      { ...value, published_by: "staff-private" }, { ...value, draft: {} },
      { ...value, content: { ...value.content, seller_name: "" } },
      { ...value, content: { ...value.content, customer_service_email: "" } },
      { ...value, content: { ...value.content, copy: { ...value.content.copy, shipping: { en: "Only one translation" } } } },
    ]) expect(shopPublishedPolicySchema.safeParse(invalid).success).toBe(false);
    expect(shopPublishedPolicyResponseSchema.safeParse({ policy: value, store_metadata: { private: true } }).success).toBe(false);
  });
  it("rejects fractional, nonpositive and reversed policy windows", () => {
    const value = policy();
    for (const terms of [
      { ...value.content.terms, return_window_days: 0 }, { ...value.content.terms, refund_business_days: 1.5 },
      { ...value.content.terms, approved_dispatch_days: 366 },
      { ...value.content.terms, processing_business_days_min: 3 },
      { ...value.content.terms, transit_business_days_max: 2 },
    ]) expect(shopPublishedPolicySchema.safeParse({ ...value, content: { ...value.content, terms } }).success).toBe(false);
  });
});
