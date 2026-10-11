import { unsubscribeMarketingCustomer } from "@/lib/marketing/unsubscribe";
export async function POST(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    const body = await request.text();
    if (!token || token.length > 1000 || body !== "List-Unsubscribe=One-Click") return new Response(null, { status: 400 });
    await unsubscribeMarketingCustomer(token);
    return Response.json({ unsubscribed: true });
  } catch { return new Response(null, { status: 503 }); }
}
