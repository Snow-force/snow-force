import { saveOrderSnapshot } from "@/lib/shop/order-sync";
import { orderSyncSnapshotSchema } from "@/lib/shop/order-sync-contract";
import { readBoundedOrderSyncBody, validOrderSyncSignature } from "@/lib/shop/order-sync-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.COMMERCE_ORDER_SYNC_SECRET;
  if (!secret || secret.length < 32) return Response.json({ status: "unavailable" }, { status: 503 });
  let body: string;
  try { body = await readBoundedOrderSyncBody(request); }
  catch (error) { return Response.json({ status: "invalid" }, { status: error instanceof RangeError ? 413 : 400 }); }
  if (!validOrderSyncSignature(body, request.headers.get("x-snowforce-timestamp"), request.headers.get("x-snowforce-signature"), secret)) return Response.json({ status: "unauthorized" }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { return Response.json({ status: "invalid" }, { status: 400 }); }
  const parsed = orderSyncSnapshotSchema.safeParse(payload);
  if (!parsed.success || Date.parse(parsed.data.observedAt) > Date.now() + 300_000) return Response.json({ status: "invalid" }, { status: 400 });
  try { await saveOrderSnapshot(parsed.data); }
  catch { return Response.json({ status: "retry" }, { status: 503 }); }
  return Response.json({ status: "synchronized" });
}
