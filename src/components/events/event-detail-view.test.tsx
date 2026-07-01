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
});
