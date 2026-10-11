import { verifyMarketing } from "@/lib/marketing/protocol";
import { marketingSourceClient, readMarketingSource } from "@/lib/marketing/source";

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 2_100_000) return new Response(null, { status: 413 });
    const { nonce, payload } = verifyMarketing(JSON.parse(raw), process.env.MARKETING_INTERNAL_SECRET ?? "");
    const db = marketingSourceClient();
    await db.from("marketing_internal_nonces").delete().lt("created_at", new Date(Date.now() - 86400000).toISOString());
    const { error } = await db.from("marketing_internal_nonces").insert({ nonce });
    if (error) return new Response(null, { status: 409 });
    return Response.json(await readMarketingSource(payload));
  } catch { return Response.json({ error: "Marketing source request rejected." }, { status: 400 }); }
}
