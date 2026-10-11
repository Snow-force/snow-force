import { redirect } from "next/navigation";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { memberConsentPath } from "@/lib/members/member-consents";
import { NewcomerBenefit } from "@/components/members/newcomer-benefit";
export default async function WelcomePage() {
  const account = await getCurrentMemberAccount();
  if (!account) redirect("/member?mode=register&next=%2Fmember%2Fwelcome");
  if (!account.profile || !account.privacyAccepted) redirect(memberConsentPath("/member/welcome"));
  return <main className="mx-auto min-h-[60vh] max-w-2xl px-5 py-12"><NewcomerBenefit verified={account.emailConfirmed} standalone /></main>;
}
