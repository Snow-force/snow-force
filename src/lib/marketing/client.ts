import "server-only";
import { marketingOrigin, signMarketing } from "./protocol";

export async function marketingRequest(payload: unknown): Promise<unknown> {
  const origin = marketingOrigin(process.env.MEDUSA_BACKEND_URL ?? "");
  const response = await fetch(`${origin}/internal/marketing`, { method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify(signMarketing(payload, process.env.MARKETING_INTERNAL_SECRET ?? "")) });
  if (!response.ok) throw new Error(response.status === 409 ? "The draft changed or this request needs review. Refresh before retrying." : "Marketing service unavailable or request rejected.");
  return response.json() as Promise<unknown>;
}
