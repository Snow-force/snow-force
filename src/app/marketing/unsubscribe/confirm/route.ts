import { unsubscribeMarketingCustomer } from "@/lib/marketing/unsubscribe";
export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  try {
    if (!token || token.length > 1000) throw new Error();
    await unsubscribeMarketingCustomer(token);
    return Response.redirect(new URL("/marketing/unsubscribe?done=1", request.url), 303);
  } catch { return Response.redirect(new URL(`/marketing/unsubscribe?error=1&token=${encodeURIComponent(token.slice(0, 1000))}`, request.url), 303); }
}
