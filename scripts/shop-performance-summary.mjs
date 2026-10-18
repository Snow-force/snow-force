import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

/** Aggregate durations within each source/phase only; never add nested spans.
 * @param {unknown[]} input
 */
export function summarizeShopPerformance(input) {
  const groups = new Map(), seen = new Set();
  for (const value of input) {
    if (!value || typeof value !== "object") continue;
    const row = /** @type {Record<string, unknown>} */ (value);
    if (row.event !== "snowforce.shop_performance" || !["web", "commerce", "browser"].includes(String(row.source)) || typeof row.operationId !== "string" || !/^[a-f0-9-]{36}$/i.test(row.operationId) || typeof row.durationMs !== "number" || !Number.isFinite(row.durationMs) || row.durationMs < 0 || row.durationMs > 1_800_000) continue;
    const dimensions = ["source", "operation", "phase", "scenario", "revision", "viewport", "network", "visit"];
    const tags = Object.fromEntries(dimensions.map(key => [key, typeof row[key] === "string" && /^[a-z0-9_.-]{1,64}$/i.test(row[key]) ? row[key] : "unknown"]));
    const key = JSON.stringify(tags), identity = JSON.stringify([key, row.operationId, row.sequence ?? row.startedAt, row.outcome]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const group = groups.get(key) ?? { ...tags, values: [], errors: 0, timeouts: 0, rejected: 0 };
    group.values.push(row.durationMs);
    if (["error", "threw", "connection_closed"].includes(String(row.outcome))) group.errors++;
    if (row.outcome === "timeout") group.timeouts++;
    if (row.outcome === "rejected") group.rejected++;
    groups.set(key, group);
  }
  return [...groups.values()].map(({ values, ...group }) => {
    const sorted = values.sort((a, b) => a - b), n = sorted.length;
    const percentile = p => sorted[Math.ceil(n * p) - 1];
    return { ...group, n, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), errorRate: group.errors / n, timeoutRate: group.timeouts / n, rejectedRate: group.rejected / n, sufficientForP95: n >= 100, sufficientForP99: n >= 1000 };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = [];
  for (const file of process.argv.slice(2)) {
    for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
      if (line.length > 16_384) continue;
      try { rows.push(JSON.parse(line.slice(line.indexOf("{")))); } catch { /* Ignore unrelated runtime logs. */ }
    }
  }
  console.log(JSON.stringify({ measurement: "Per-source phase observations; client timing includes action queue/network/RSC response; initial/subsequent is sampled module invocation, not proof of cold/warm cache. Browser observations are untrusted. No nested durations are summed.", groups: summarizeShopPerformance(rows) }, null, 2));
}
