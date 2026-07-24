import { getEvents } from "@/lib/events/repository";
import { getCurrentMerchantAccount } from "@/lib/merchants/actions";
import { getMerchantApplicationStateForEvent } from "@/lib/merchants/application-state";
import { isMerchantBoothEventEligible } from "@/lib/events/merchant-booth";
import { MerchantAuthPanel } from "./merchant-auth-panel";
import { MerchantDashboard, type MerchantApplicationStateView } from "./merchant-dashboard";
import { MerchantProfileForm } from "./merchant-profile-form";
import type { MerchantProfile } from "@/lib/merchants/types";

export async function MerchantPortalPage({ searchParams, section }: { searchParams: Record<string, string | undefined>; section: "dashboard" | "applications" | "settings" }) {
  const account = await getCurrentMerchantAccount();
  if (!account) return <MerchantAuthPanel searchParams={searchParams} />;
  if (!account.emailConfirmed) return <MerchantAuthPanel searchParams={{ ...searchParams, error: "verification-email" }} />;
  if (!account.profile) {
    const onboardingProfile: MerchantProfile = {
      id: "",
      userId: account.user.id,
      businessName: "",
      contactName: "",
      contactEmail: account.user.email ?? "",
      contactPhone: "",
      category: "",
      description: "",
      createdAt: "",
      updatedAt: "",
    };
    return (
      <main className="min-h-[calc(100svh-64px)] bg-[#f5f5f7] px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <p className="text-[14px] font-semibold uppercase tracking-[-0.224px] text-[#0066cc]">SnowForce merchant</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-[1.18] tracking-[-0.28px] text-[#1d1d1f]">Complete your merchant profile to continue</h1>
          <p className="mt-2 text-[15px] leading-[1.47] text-[#515154]">You&apos;re signed in. Add your business details so you can start booth applications.</p>
          <div className="mt-6"><MerchantProfileForm profile={onboardingProfile} error={searchParams.profileError} /></div>
        </div>
      </main>
    );
  }
  let events = [] as Awaited<ReturnType<typeof getEvents>>;
  try { events = await getEvents(); } catch { events = []; }
  const eligibleEvents = events.filter(isMerchantBoothEventEligible);
  const states = await Promise.all(eligibleEvents.map((event) => getMerchantApplicationStateForEvent(account, event.slug).then((state) => ({ event, state })).catch(() => ({ event, state: null }))));
  const applications: MerchantApplicationStateView[] = states.flatMap(({ event, state }) => state && !("error" in state) ? [{ event, ...state }] : []);
  return <MerchantDashboard profile={account.profile} events={eligibleEvents} applications={applications} searchParams={searchParams} section={section} />;
}
