import "server-only";
import { after } from "next/server";
import { dispatchWaiverOutbox, queueRegistrationWaiver } from "./delivery";

export async function scheduleRegistrationWaiver(registrationId: string) {
  if (!process.env.EVENT_WAIVER_ENCRYPTION_KEY) return;
  // The registration trigger already wrote not_sent durably. The worker recovers interrupted callbacks.
  after(async () => { try { await queueRegistrationWaiver(registrationId); await dispatchWaiverOutbox(10); } catch { console.error("[waiver] delivery deferred; durable queue retained"); } });
}
export function scheduleWaiverDelivery() {
  after(async () => { try { await dispatchWaiverOutbox(10); } catch { console.error("[waiver] delivery deferred; durable queue retained"); } });
}
