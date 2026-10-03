import { createDefaultReviewConfig } from "@/lib/reviews/config";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/lib/language";
import type { Event } from "@/lib/types";
import type { MerchantProfile } from "@/lib/merchants/types";
import { MerchantDashboard, type MerchantApplicationStateView } from "./merchant-dashboard";

vi.mock("@/lib/merchants/actions", () => ({ logoutMerchant: vi.fn(), withdrawMerchantApplicationAction: vi.fn(), submitMerchantApplicationAction: vi.fn(), saveMerchantProfile: vi.fn() }));

const profile: MerchantProfile = { id: "profile-1", userId: "user-1", businessName: "Summit Goods", contactName: "Kai", contactEmail: "kai@example.com", contactPhone: "555-0100", category: "Equipment", description: "Wax", createdAt: "2026-07-22", updatedAt: "2026-07-22" };
const event: Event = { slug: "venue-day", status: "published", registrationState: "open", title: { en: "Venue Day", zh: "场地日" }, eventDate: "2026-12-01", meetTime: "09:00", meetLocation: { en: "Base", zh: "基地" }, activityLocation: { en: "Mountain", zh: "雪场" }, locationUrl: "", coverImage: "", capacity: 0, registrationCount: 0, registrationCloseAt: "", requiresApproval: false, allowWaitlist: false, allowCancellation: false, feeAmount: "Free", paymentModel: "free", depositAmount: null, depositCurrency: "usd", fullPaymentAmount: null, paymentInstructions: { en: "", zh: "" }, seoTitle: { en: "", zh: "" }, seoDescription: { en: "", zh: "" }, registrationQuestions: [], detailModules: [], waiverTextEn: null, waiverTextSha: null, merchantBoothProgram: { enabled: true, paymentInstructions: { en: "Pay SnowForce staff at check-in.", zh: "请在签到时向 SnowForce 工作人员付款。" }, plans: [{ id: "plan-standard", name: { en: "Standard booth", zh: "标准摊位" }, description: { en: "One table", zh: "一张桌子" }, priceAmount: 250, priceCurrency: "usd" }], booths: [{ id: "booth-a", boothPlanId: "plan-standard", boothCode: "A-01" }] }, reviewConfig: createDefaultReviewConfig() };
const application: MerchantApplicationStateView = { event, application: { id: "application-1", merchantProfileId: "profile-1", eventSlug: event.slug, boothProgramId: "program-1", requestedPlanId: "plan-standard", businessName: profile.businessName, contactName: profile.contactName, contactEmail: profile.contactEmail, contactPhone: profile.contactPhone, category: profile.category, description: profile.description, status: "payment_pending", quotedAmount: 250, quotedCurrency: "usd", createdAt: "2026-07-22", updatedAt: "2026-07-22" }, allocation: { id: "allocation-1", merchantApplicationId: "application-1", boothId: "booth-a", boothPlanId: "plan-standard", allocatedByUserId: "staff", allocatedAt: "2026-07-22", createdAt: "2026-07-22" }, payment: null, plan: { id: "plan-standard", boothProgramId: "program-1", nameEn: "Standard booth", nameZh: "标准摊位", descriptionEn: "One table", descriptionZh: "一张桌子", priceAmount: 250, priceCurrency: "usd", createdAt: "2026-07-22", updatedAt: "2026-07-22" } };

describe("MerchantDashboard", () => {
  it("shows payment-pending status, assigned booth, and offline instructions without online payment controls", () => {
    document.cookie = "lang=en;path=/";
    render(<LanguageProvider><MerchantDashboard profile={profile} events={[event]} applications={[application]} searchParams={{}} section="dashboard" /></LanguageProvider>);
    expect(screen.getByText("Offline payment pending")).toBeInTheDocument();
    expect(screen.getByText("A-01")).toBeInTheDocument();
    expect(screen.getByText("Pay SnowForce staff at check-in.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pay|stripe|checkout/i })).not.toBeInTheDocument();
  });

  it("renders a bilingual server-failure recovery notice", () => {
    document.cookie = "lang=zh;path=/";
    render(<LanguageProvider><MerchantDashboard profile={profile} events={[event]} applications={[]} searchParams={{ error: "program-disabled" }} section="dashboard" /></LanguageProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("该活动目前不再接受商户摊位申请。");
  });
});
