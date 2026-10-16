export const dynamic = "force-dynamic";

/** Public deployment identity only; configuration and credentials stay private. */
export async function GET() {
  const candidate = process.env.RAILWAY_GIT_COMMIT_SHA ?? "";
  const revision = /^[a-f0-9]{40}$/.test(candidate) ? candidate : "unknown";
  return Response.json({ service: "snowforce-web", revision }, { headers: { "Cache-Control": "no-store" } });
}
