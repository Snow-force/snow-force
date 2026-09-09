import "server-only";
import { getStripeServer } from "./stripe-server";
import { fulfillCheckoutSession } from "./fulfillment";
import { getPendingRegistrationById } from "@/lib/registrations/pending-repository";
import { getRegistrations } from "@/lib/registrations/repository";
import type { VerifiedPaymentStatus } from "./checkout-attempt";

export type { VerifiedPaymentStatus } from "./checkout-attempt";
export type ReturnStatusDeps = {
  getStripe: typeof getStripeServer;
  getPending: typeof getPendingRegistrationById;
  getRegistrations: typeof getRegistrations;
  fulfill: typeof fulfillCheckoutSession;
};
export async function resolvePaymentReturnStatus(
  sessionId: string | undefined, memberId: string,
  deps: ReturnStatusDeps = { getStripe: getStripeServer, getPending: getPendingRegistrationById, getRegistrations, fulfill: fulfillCheckoutSession },
): Promise<VerifiedPaymentStatus> {
  if (!sessionId || !/^cs_(test|live)_[a-zA-Z0-9]+$/.test(sessionId)) return "invalid";
  try {
    const session = await deps.getStripe().checkout.sessions.retrieve(sessionId);
    if (session.metadata?.memberId !== memberId || !session.metadata.pendingRegistrationId || !session.metadata.eventSlug) return "invalid";
    const pending = await deps.getPending(session.metadata.pendingRegistrationId);
    if (pending ? pending.memberId !== memberId : !(await deps.getRegistrations(session.metadata.eventSlug)).some(
      (r) => r.memberId === memberId && r.finance?.stripeCheckoutSessionId === session.id,
    )) return "review";
    return (await deps.fulfill(session)).status;
  } catch {
    return "review";
  }
}
