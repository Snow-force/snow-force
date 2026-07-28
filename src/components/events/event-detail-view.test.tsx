import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/lib/language";
import { EventDetailView } from "./event-detail-view";

vi.mock("@/lib/payments/actions", () => ({
  createCheckoutSessionAction: vi.fn(),
}));
import type { Event } from "@/lib/types";

vi.mock("@/lib/events/share-actions", () => ({
  getQrCodeDataUrl: vi.fn().mockResolvedValue({ dataUrl: "data:image/png;base64,abc" }),
}));

function renderWithLanguage(ui: React.ReactNode) {
  document.cookie = "lang=en;path=/";
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

const minimalEvent: Event = {
  slug: "test-event",
  status: "published",
  registrationState: "closed",
  title: { en: "Test Event", zh: "测试活动" },
  eventDate: "2026-11-15",
  meetTime: "09:00",
  meetLocation: { en: "Base Lodge", zh: "基地大厅" },
  activityLocation: { en: "Test Mountain", zh: "测试雪山" },
  locationUrl: "",
  coverImage: "",
  capacity: 0,
  registrationCount: 0,
  registrationCloseAt: "2026-11-13T00:00:00Z",
  requiresApproval: false,
  allowWaitlist: false,
  allowCancellation: false,
  feeAmount: "Free",
  paymentModel: "free",
  depositAmount: null,
  depositCurrency: "usd",
  fullPaymentAmount: null,
  paymentInstructions: { en: "", zh: "" },
  seoTitle: { en: "Test Event", zh: "测试活动" },
  seoDescription: { en: "", zh: "" },
  registrationQuestions: [],
  detailModules: [],
};

describe("EventDetailView", () => {
  it("renders EventShareBar in hero and sidebar for a valid event", () => {
    renderWithLanguage(
      <EventDetailView
        event={minimalEvent}
        loadError={false}
        memberProfile={null}
        emailConfirmed={false}
      />,
    );

    const shareButtons = screen.getAllByRole("button", {
      name: /share|copy link|qr|分享|复制链接|二维码/i,
    });
    expect(shareButtons).toHaveLength(6);
  });

  it("does not render EventShareBar when event is undefined", () => {
    renderWithLanguage(
      <EventDetailView
        event={undefined}
        loadError={false}
        memberProfile={null}
        emailConfirmed={false}
      />,
    );

    expect(
      screen.queryAllByRole("button", { name: /share|copy link|qr/i }),
    ).toHaveLength(0);
  });

  it("does not render EventShareBar when loadError is true", () => {
    renderWithLanguage(
      <EventDetailView
        event={minimalEvent}
        loadError={true}
        memberProfile={null}
        emailConfirmed={false}
      />,
    );

    expect(
      screen.queryAllByRole("button", { name: /share|copy link|qr/i }),
    ).toHaveLength(0);
  });

  it("uses the intro as the hero summary without repeating it in the detail sections", () => {
    renderWithLanguage(
      <EventDetailView
        event={{
          ...minimalEvent,
          detailModules: [
            {
              id: "intro",
              type: "intro",
              displayMode: "rich_text",
              title: { en: "Introduction", zh: "活动介绍" },
              content: { en: "A concise day on the mountain.", zh: "轻松的一天雪山活动。" },
              items: { en: [], zh: [] },
            },
            {
              id: "itinerary",
              type: "itinerary",
              displayMode: "rich_text",
              title: { en: "Itinerary", zh: "行程" },
              content: { en: "Meet at 9:00 AM.", zh: "上午 9 点集合。" },
              items: { en: [], zh: [] },
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("A concise day on the mountain.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Introduction" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Itinerary" })).toBeInTheDocument();
  });

  it("shows a bilingual merchant CTA only for a published event with an enabled booth program", () => {
    renderWithLanguage(
      <EventDetailView
        event={{
          ...minimalEvent,
          merchantBoothProgram: {
            enabled: true,
            paymentInstructions: { en: "Pay staff", zh: "向工作人员付款" },
            plans: [{ id: "standard", name: { en: "Standard", zh: "标准" }, description: { en: "Table", zh: "桌位" }, priceAmount: 200, priceCurrency: "usd" }],
            booths: [{ id: "booth-a", boothPlanId: "standard", boothCode: "A-01" }],
          },
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Apply for a booth" })).toHaveAttribute("href", "/merchant/applications?event=test-event");
    document.cookie = "lang=zh;path=/";
    render(
      <LanguageProvider>
        <EventDetailView event={{ ...minimalEvent, merchantBoothProgram: { enabled: true, paymentInstructions: { en: "", zh: "" }, plans: [{ id: "standard", name: { en: "Standard", zh: "标准" }, description: { en: "", zh: "" }, priceAmount: 200, priceCurrency: "usd" }], booths: [{ id: "booth-a", boothPlanId: "standard", boothCode: "A-01" }] } }} />
      </LanguageProvider>,
    );
    expect(screen.getAllByRole("link", { name: "申请摊位" })).toHaveLength(1);
  });

  it("does not show a merchant CTA for a disabled booth program", () => {
    renderWithLanguage(
      <EventDetailView
        event={{
          ...minimalEvent,
          merchantBoothProgram: { enabled: false, paymentInstructions: { en: "", zh: "" }, plans: [], booths: [] },
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: /apply for a booth|申请摊位/i })).not.toBeInTheDocument();
    expect(screen.getByText("Registration is currently closed for this event.")).toBeInTheDocument();
  });
});
