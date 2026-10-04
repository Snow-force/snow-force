export async function GET() {
  return new Response(null, {
    status: 307,
    headers: { Location: "/member?registration=member-only", "Cache-Control": "no-store" },
  });
}
