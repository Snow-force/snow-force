import "server-only";

import { getEvents } from "@/lib/events/repository";
import type { Event } from "@/lib/types";
import { getMerchantApplicationStateForEvent } from "./application-state";
import type { MerchantAuthAccount } from "./auth-boundary";

export type MerchantApplicationState = Exclude<
  Awaited<ReturnType<typeof getMerchantApplicationStateForEvent>>,
  null | { error: string; errorMessage: string }
>;

export type MerchantPortalEvent = {
  readonly event: Event;
  readonly applicationState: MerchantApplicationState | null;
};

function isMerchantEligibleEvent(event: Event): boolean {
  return event.status === "published" && Boolean(event.merchantBoothProgram?.enabled);
}

export async function getMerchantPortalEvents(
  account: MerchantAuthAccount | null,
): Promise<readonly MerchantPortalEvent[]> {
  const events = (await getEvents()).filter(isMerchantEligibleEvent);
  if (!account?.emailConfirmed || !account.profile) {
    return events.map((event) => ({ event, applicationState: null }));
  }

  const states = await Promise.all(
    events.map((event) => getMerchantApplicationStateForEvent(account, event.slug)),
  );

  return events.map((event, index) => {
    const state = states[index];
    if (!state || "error" in state) return { event, applicationState: null };
    return { event, applicationState: state };
  });
}
