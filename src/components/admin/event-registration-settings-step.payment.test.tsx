import { createDefaultReviewConfig } from "@/lib/reviews/config";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/lib/language";
import type { Event } from "@/lib/types";
import { EventRegistrationSettingsStep } from "./event-registration-settings-step";

function renderWithLanguage(ui: React.ReactNode) {
  document.cookie = "lang=en;path=/";
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

function createEvent(overrides: Partial<Event> = {}): Event {
  return {
    slug: "test-event-2026",
    status: "draft",
    registrationState: "closed",
    title: { en: "Test Event", zh: "测试活动" },
    eventDate: "2026-12-15",
    meetTime: "09:00",
    meetLocation: { en: "Base lodge", zh: "山下大厅" },
    activityLocation: { en: "Resort", zh: "雪场" },
    locationUrl: "https://maps.example.com",
    coverImage: "/images/events/test.jpg",
    capacity: 40,
    registrationCount: 0,
    registrationCloseAt: "2026-12-13T00:00:00Z",
    requiresApproval: false,
    allowWaitlist: true,
    allowCancellation: true,
    feeAmount: "Free",
    paymentModel: "free",
    depositAmount: null,
    depositCurrency: "usd",
    fullPaymentAmount: null,
    paymentInstructions: { en: "Pay in group chat", zh: "在微信群支付" },
    seoTitle: { en: "Test Event", zh: "测试活动" },
    seoDescription: { en: "Description", zh: "描述" },
    registrationQuestions: [],
    detailModules: [],
    waiverTextEn: null,
    waiverTextSha: null,
    merchantBoothProgram: null,
    reviewConfig: createDefaultReviewConfig(),
    ...overrides,
  };
}

describe("EventRegistrationSettingsStep payment model", () => {
  it("connects saved activities to fixed per-person room-type package setup", () => {
    renderWithLanguage(<EventRegistrationSettingsStep event={createEvent()} activeLang="en" onChange={vi.fn()} />);
    expect(screen.getByRole("link", { name: /configure room-type packages/i })).toHaveAttribute("href", "#event-lodging-settings");
    expect(screen.getByText(/fixed-price room-type packages per person, including lodging/)).toBeInTheDocument();
  });

  it("asks staff to save new activities before linking room-type packages", () => {
    renderWithLanguage(<EventRegistrationSettingsStep event={createEvent()} activeLang="en" onChange={vi.fn()} isNew />);
    expect(screen.queryByRole("link", { name: /configure room-type packages/i })).toBeNull();
    expect(screen.getByText(/save the event first/i)).toBeInTheDocument();
  });
  it("renders free helper text and no amount inputs when paymentModel is free", () => {
    renderWithLanguage(
      <EventRegistrationSettingsStep
        event={createEvent({ paymentModel: "free" })}
        activeLang="en"
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/deposit amount/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/full payment amount/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no online payment required/i)).toBeInTheDocument();
  });

  it("shows deposit amount input when paymentModel is changed to deposit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithLanguage(
      <EventRegistrationSettingsStep
        event={createEvent({ paymentModel: "free" })}
        activeLang="en"
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/online payment/i), "deposit");

    const lastEvent = onChange.mock.calls[onChange.mock.calls.length - 1][0] as Event;
    renderWithLanguage(
      <EventRegistrationSettingsStep event={lastEvent} activeLang="en" onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText(/deposit amount/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/full payment amount/i)).not.toBeInTheDocument();
  });

  it("shows full payment amount input and hides deposit amount input when paymentModel is changed to full_prepay", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithLanguage(
      <EventRegistrationSettingsStep
        event={createEvent({ paymentModel: "free" })}
        activeLang="en"
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/online payment/i), "full_prepay");

    const lastEvent = onChange.mock.calls[onChange.mock.calls.length - 1][0] as Event;
    renderWithLanguage(
      <EventRegistrationSettingsStep event={lastEvent} activeLang="en" onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText(/full payment amount/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/deposit amount/i)).not.toBeInTheDocument();
  });

  it("calls onChange with updated depositCurrency when currency select changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithLanguage(
      <EventRegistrationSettingsStep
        event={createEvent({ paymentModel: "deposit" })}
        activeLang="en"
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/currency/i), "cny");

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ depositCurrency: "cny" }));
  });
});
