import { createDefaultReviewConfig } from "@/lib/reviews/config";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/lib/language";
import type { Event } from "@/lib/types";
import type { MerchantProfile } from "@/lib/merchants/types";

vi.mock("@/lib/merchants/actions", () => ({ submitMerchantApplicationAction: vi.fn() }));

import { MerchantApplicationForm } from "./merchant-application-form";

const profile: MerchantProfile = { id: "profile-1", userId: "user-1", businessName: "Summit Goods", contactName: "Kai", contactEmail: "kai@example.com", contactPhone: "555-0100", category: "Equipment", description: "Wax and tuning", createdAt: "2026-07-22", updatedAt: "2026-07-22" };
const event: Event = { slug: "venue-day", status: "published", registrationState: "open", title: { en: "Venue Day", zh: "场地日" }, eventDate: "2026-12-01", meetTime: "09:00", meetLocation: { en: "Base", zh: "基地" }, activityLocation: { en: "Mountain", zh: "雪场" }, locationUrl: "", coverImage: "", capacity: 0, registrationCount: 0, registrationCloseAt: "", requiresApproval: false, allowWaitlist: false, allowCancellation: false, feeAmount: "Free", paymentModel: "free", depositAmount: null, depositCurrency: "usd", fullPaymentAmount: null, paymentInstructions: { en: "", zh: "" }, seoTitle: { en: "", zh: "" }, seoDescription: { en: "", zh: "" }, registrationQuestions: [], detailModules: [], waiverTextEn: null, waiverTextSha: null, merchantBoothProgram: { enabled: true, paymentInstructions: { en: "Pay staff offline", zh: "请线下付款" }, plans: [{ id: "plan-standard", name: { en: "Standard booth", zh: "标准摊位" }, description: { en: "One table", zh: "一张桌子" }, priceAmount: 250, priceCurrency: "usd" }], booths: [{ id: "booth-a", boothPlanId: "plan-standard", boothCode: "A-01" }] }, reviewConfig: createDefaultReviewConfig() };

function renderForm() { document.cookie = "lang=en;path=/"; return render(<LanguageProvider><MerchantApplicationForm events={[event]} profile={profile} initialEventSlug={event.slug} /></LanguageProvider>); }

describe("MerchantApplicationForm", () => {
  it("renders accessible bilingual basic-information fields and no online-payment control", () => {
    renderForm();
    expect(screen.getByLabelText(/Contact email/)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/Contact phone/)).toHaveAttribute("type", "tel");
    expect(screen.queryByRole("button", { name: /pay|stripe|checkout/i })).not.toBeInTheDocument();
    document.cookie = "lang=zh;path=/";
    render(<LanguageProvider><MerchantApplicationForm events={[event]} profile={profile} initialEventSlug={event.slug} /></LanguageProvider>);
    expect(screen.getByRole("heading", { name: "场地日" })).toBeInTheDocument();
  });

  it("prevents invalid submissions and links errors to controls", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.clear(screen.getByLabelText(/Business name/));
    await user.click(screen.getByRole("button", { name: "Submit booth application" }));
    const businessName = screen.getByLabelText(/Business name/);
    expect(businessName).toHaveAttribute("aria-invalid", "true");
    expect(businessName).toHaveAttribute("aria-describedby", "merchant-business-name-error");
    expect(screen.getByText("This field is required.")).toBeInTheDocument();
  });
});
