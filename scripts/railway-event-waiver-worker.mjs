// Railway Function source: one bounded run, no server or persistent interval.
const secret = process.env.EVENT_WAIVER_WORKER_SECRET;
if (!secret) {
  console.info("Waiver recovery worker awaiting configuration");
} else {
  try {
    const response = await fetch("https://snow-force.com/api/events/waivers/dispatch", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) throw new Error("dispatch_failed");
    const result = await response.json();
    console.info(JSON.stringify({ sent: Number(result.sent ?? 0), failed: Number(result.failed ?? 0) }));
  } catch {
    console.error("Waiver recovery dispatch failed");
    process.exitCode = 1;
  }
}
