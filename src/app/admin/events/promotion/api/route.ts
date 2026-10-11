import { requireAdmin } from "@/lib/auth/admin";
import { marketingRequest } from "@/lib/marketing/client";

export async function POST(request: Request) {
  const staff = await requireAdmin();
  try {
    const body = await request.text();
    if (body.length > 30000) return new Response(null, { status: 413 });
    return Response.json(await marketingRequest({ kind: "event", actor: staff.userId, command: JSON.parse(body) }));
  } catch { return Response.json({ error: "Unable to process promotion. Refresh the draft and audience before retrying." }, { status: 409 }); }
}
