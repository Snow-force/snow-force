import { browserTimingSchema, performanceSampleRate, sampledOperation } from "@/lib/shop/performance-contract";

export const runtime = "nodejs";
let windowStarted = 0, accepted = 0;
export async function POST(request: Request) {
  const rate = performanceSampleRate(process.env.SHOP_PERFORMANCE_TIMING, process.env.SHOP_PERFORMANCE_SAMPLE_RATE);
  const response = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (!rate) return response(204);
  const origin = request.headers.get("origin");
  const allowed = [new URL(request.url).origin, process.env.NEXT_PUBLIC_SITE_URL, process.env.SITE_URL].filter(Boolean);
  if (!origin || !allowed.includes(origin) || request.headers.get("sec-fetch-site") === "cross-site") return response(403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return response(415);
  const now = Date.now();
  if (now - windowStarted >= 60_000) { windowStarted = now; accepted = 0; }
  if (++accepted > 600) return response(429);
  if (Number(request.headers.get("content-length")) > 2048) return response(413);
  const reader = request.body?.getReader();
  if (!reader) return response(400);
  let raw = "", bytes = 0;
  try {
    const decoder = new TextDecoder();
    while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 2048) { await reader.cancel(); return response(413); } raw += decoder.decode(chunk.value, { stream: true }); }
    raw += decoder.decode();
    const parsed = browserTimingSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || !sampledOperation(parsed.data.operationId, rate)) return response(400);
    // Browser timings are untrusted observations, never transaction evidence.
    try { console.info(JSON.stringify({ event: "snowforce.shop_performance", source: "browser", receivedAt: new Date().toISOString(), ...parsed.data })); } catch { /* Best effort only. */ }
    return response(204);
  } catch { return response(400); }
  finally { reader.releaseLock(); }
}
