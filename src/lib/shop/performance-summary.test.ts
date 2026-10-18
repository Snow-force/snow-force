import { expect, it } from "vitest";
import { summarizeShopPerformance } from "../../../scripts/shop-performance-summary.mjs";
it("computes phase percentiles and failure rates without mixing scenarios, revisions or nested durations", () => {
  const base = { event: "snowforce.shop_performance", source: "web", operation: "cart.add", phase: "action", scenario: "existing", revision: "a".repeat(40), operationId: "11111111-1111-4111-8111-000000000001", sequence: 1, outcome: "ok", durationMs: 1 };
  const rows = Array.from({ length: 100 }, (_, i) => ({ ...base, sequence: i + 1, durationMs: i + 1, outcome: i === 0 ? "timeout" : i === 1 ? "error" : "ok" }));
  const groups = summarizeShopPerformance([...rows, rows[0], { ...base, phase: "commerce.read", durationMs: 1000 }, { ...base, revision: "b".repeat(40) }, { ...base, scenario: "new" }, { ...base, durationMs: -1 }, { ...base, secret: "never printed", event: "other" }]);
  expect(groups).toHaveLength(4);
  expect(groups[0]).toMatchObject({ n: 100, p50Ms: 50, p95Ms: 95, p99Ms: 99, errorRate: .01, timeoutRate: .01, sufficientForP95: true, sufficientForP99: false });
  expect(groups[1]).toMatchObject({ n: 1, p50Ms: 1000 }); expect(JSON.stringify(groups)).not.toContain("11111111"); expect(JSON.stringify(groups)).not.toContain("secret");
});
it("keeps prewarm and baseline cohorts separate even on the same revision", () => {
  const base = {event:"snowforce.shop_performance",source:"browser",operation:"checkout.prepare",phase:"payment.interactive",operationId:"11111111-1111-4111-8111-000000000001",durationMs:100,sequence:1,outcome:"ok"};
  const groups = summarizeShopPerformance([{...base,variant:"baseline"},{...base,variant:"prewarm",durationMs:20}]);
  expect(groups).toHaveLength(2); expect(groups[0]).toMatchObject({variant:"baseline",p50Ms:100}); expect(groups[1]).toMatchObject({variant:"prewarm",p50Ms:20});
});
