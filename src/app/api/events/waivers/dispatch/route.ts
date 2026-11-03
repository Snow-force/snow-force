import { dispatchCancellationMail } from "@/lib/registrations/cancellation-mail";
import { timingSafeEqual } from "node:crypto";
import { dispatchWaiverOutbox } from "@/lib/registrations/v2/delivery";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.EVENT_WAIVER_WORKER_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await dispatchWaiverOutbox(30);
    await dispatchCancellationMail();
    return Response.json(result);
  } catch {
    return Response.json(
      { error: "Delivery queue unavailable" },
      { status: 503 },
    );
  }
}
