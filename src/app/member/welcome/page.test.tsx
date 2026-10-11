import { beforeEach, expect, it, vi } from "vitest";
const account = vi.hoisted(() => vi.fn());
vi.mock("@/lib/members/actions", () => ({ getCurrentMemberAccount: account }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/members/member-consents", () => ({ memberConsentPath: (path: string) => `/member/consent?next=${encodeURIComponent(path)}` }));
vi.mock("@/components/members/newcomer-benefit", () => ({ NewcomerBenefit: () => null }));
import WelcomePage from "./page";
beforeEach(() => { vi.resetAllMocks(); });
it("preserves the welcome return destination through registration and consent", async () => {
  account.mockResolvedValue(null); await expect(WelcomePage()).rejects.toThrow("redirect:/member?mode=register&next=%2Fmember%2Fwelcome");
  account.mockResolvedValue({ profile: null, privacyAccepted: false }); await expect(WelcomePage()).rejects.toThrow("redirect:/member/consent?next=%2Fmember%2Fwelcome");
});
it("passes verification status to the dedicated private benefits page", async () => { account.mockResolvedValue({ profile: {}, privacyAccepted: true, emailConfirmed: false }); const page = await WelcomePage(); expect(page.props.children.props).toMatchObject({ verified: false, standalone: true }); });
