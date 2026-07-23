import { getEvents } from "@/lib/events/repository";
import { getCurrentMerchantAccount } from "@/lib/merchants/actions";
import { getMerchantApplicationStateForEvent } from "@/lib/merchants/application-state";
import { isMerchantBoothEventEligible } from "@/lib/events/merchant-booth";
import { MerchantAuthPanel } from "./merchant-auth-panel";
import { MerchantDashboard, type MerchantApplicationStateView } from "./merchant-dashboard";

export async function MerchantPortalPage({ searchParams, section }: { searchParams: Record<string, string | undefined>; section: "dashboard" | "applications" | "settings" }) {
  const account = await getCurrentMerchantAccount();
  if (!account) return <MerchantAuthPanel searchParams={searchParams} />;
  if (!account.emailConfirmed || !account.profile) return <MerchantAuthPanel searchParams={{ ...searchParams, error: !account.emailConfirmed ? "verification-email" : "profile" }} />;
  let events = [] as Awaited<ReturnType<typeof getEvents>>;
  try { events = await getEvents(); } catch { events = []; }
  const eligibleEvents = events.filter(isMerchantBoothEventEligible);
  const states = await Promise.all(eligibleEvents.map((event) => getMerchantApplicationStateForEvent(account, event.slug).then((state) => ({ event, state })).catch(() => ({ event, state: null }))));
  const applications: MerchantApplicationStateView[] = states.flatMap(({ event, state }) => state && !("error" in state) ? [{ event, ...state }] : []);
  return <MerchantDashboard profile={account.profile} events={eligibleEvents} applications={applications} searchParams={searchParams} section={section} />;
}
