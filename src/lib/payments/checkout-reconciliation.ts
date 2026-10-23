import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { getPendingRegistrationById } from "@/lib/registrations/pending-repository";
import { getStripeServer } from "./stripe-server";

export async function releaseExpiredCheckoutHold(pendingId: string, attemptId: string, sessionId: string) {
  const { data, error } = await createAdminClient().rpc("release_registration_checkout_hold", {
    pending_id_input: pendingId, attempt_id_input: attemptId, session_id_input: sessionId,
  });
  if (error) throw new Error("checkout_hold_release_failed");
  return data === true;
}

export async function reconcileExpiredCheckout(sessionId: string, pendingId: string, deps = {
  getStripe: getStripeServer, getPending: getPendingRegistrationById, release: releaseExpiredCheckoutHold,
}) {
  const pending = await deps.getPending(pendingId);
  const attempt = pending?.checkoutAttempt;
  if (!pending || !attempt || pending.fulfilledRegistrationId || (attempt.sessionId && attempt.sessionId !== sessionId)) return false;
  const session = await deps.getStripe().checkout.sessions.retrieve(sessionId);
  if (session.status !== "expired" || session.payment_status === "paid" ||
    session.metadata?.pendingRegistrationId !== pending.id || session.metadata.memberId !== pending.memberId ||
    session.metadata.checkoutAttemptId !== attempt.id || session.metadata.eventSlug !== pending.eventSlug) return false;
  return deps.release(pending.id, attempt.id, sessionId);
}
