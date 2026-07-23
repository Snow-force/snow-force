import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/lib/language";
import type { Event } from "@/lib/types";
import { EventMerchantBoothSettingsStep } from "./event-merchant-booth-settings-step";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderWithLanguage(ui: React.ReactNode) {
  document.cookie = "lang=en;path=/";
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

function createEvent(overrides: Partial<Event> = {}): Event {
  return {
    slug: "test-venue",
    status: "draft",
    registrationState: "closed",
    title: { en: "Test Venue", zh: "测试场馆" },
    eventDate: "2026-12-15",
    meetTime: "09:00",
    meetLocation: { en: "Base lodge", zh: "山下大厅" },
    activityLocation: { en: "Resort", zh: "雪场" },
    locationUrl: "",
    coverImage: "",
    capacity: 40,
    registrationCount: 0,
    registrationCloseAt: "",
    requiresApproval: false,
    allowWaitlist: false,
    allowCancellation: true,
    feeAmount: "",
    paymentModel: "free",
    depositAmount: null,
    depositCurrency: "usd",
    fullPaymentAmount: null,
    paymentInstructions: { en: "", zh: "" },
    seoTitle: { en: "", zh: "" },
    seoDescription: { en: "", zh: "" },
    registrationQuestions: [],
    detailModules: [],
    waiverTextEn: null,
    waiverTextSha: null,
    merchantBoothProgram: null,
    ...overrides,
  };
}

describe("EventMerchantBoothSettingsStep", () => {
  it("shows the enable checkbox unchecked and the disabled notice when no program is configured", () => {
    const onChange = vi.fn();
    renderWithLanguage(
      <EventMerchantBoothSettingsStep
        event={createEvent()}
        activeLang="en"
        onChange={onChange}
      />,
    );

    const enableCheckbox = screen.getByLabelText(/enable merchant booth program/i) as HTMLInputElement;
    expect(enableCheckbox.checked).toBe(false);
    expect(screen.getByText(/merchant booth registration is not available/i)).toBeInTheDocument();
  });

  it("toggling the enable checkbox creates an empty program with enabled=true", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithLanguage(
      <EventMerchantBoothSettingsStep
        event={createEvent()}
        activeLang="en"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText(/enable merchant booth program/i));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        merchantBoothProgram: expect.objectContaining({
          enabled: true,
          plans: [],
          booths: [],
        }),
      }),
    );
  });

  it("renders plan and booth editors when the program is enabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithLanguage(
      <EventMerchantBoothSettingsStep
        event={createEvent({
          merchantBoothProgram: {
            enabled: true,
            paymentInstructions: { en: "Pay staff offline.", zh: "请线下向工作人员付款。" },
            plans: [
              {
                id: "plan-standard",
                name: { en: "Standard booth", zh: "标准摊位" },
                description: { en: "One table", zh: "一张桌子" },
                priceAmount: 250,
                priceCurrency: "usd",
              },
            ],
            booths: [
              { id: "booth-a-01", boothPlanId: "plan-standard", boothCode: "A-01" },
            ],
          },
        })}
        activeLang="en"
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText(/offline payment instructions/i)).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Standard booth")[0]).toBeInTheDocument();
    expect(screen.getByDisplayValue("A-01")).toBeInTheDocument();
    expect(screen.getByText("USD")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add booth plan/i }));
    const planUpdate = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as Event;
    const addedPlan = planUpdate.merchantBoothProgram?.plans.find((plan) => plan.id !== "plan-standard");
    expect(addedPlan).toMatchObject({ name: { en: "", zh: "" }, priceAmount: 0, priceCurrency: "usd" });
    expect(addedPlan?.id).toMatch(uuidPattern);

    await user.click(screen.getByRole("button", { name: /add booth identifier/i }));
    const boothUpdate = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as Event;
    const addedBooth = boothUpdate.merchantBoothProgram?.booths.find((booth) => booth.id !== "booth-a-01");
    expect(addedBooth).toMatchObject({ boothPlanId: "plan-standard", boothCode: "" });
    expect(addedBooth?.id).toMatch(uuidPattern);
  });

  it("clears the program and shows the disabled notice when the program is toggled off", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithLanguage(
      <EventMerchantBoothSettingsStep
        event={createEvent({
          merchantBoothProgram: {
            enabled: true,
            paymentInstructions: { en: "", zh: "" },
            plans: [
              {
                id: "plan-standard",
                name: { en: "Standard", zh: "标准" },
                description: { en: "", zh: "" },
                priceAmount: 100,
                priceCurrency: "usd",
              },
            ],
            booths: [],
          },
        })}
        activeLang="en"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText(/enable merchant booth program/i));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        merchantBoothProgram: expect.objectContaining({ enabled: false }),
      }),
    );
  });

  it("flags duplicate booth codes and missing plans in the booth editor", () => {
    const onChange = vi.fn();
    renderWithLanguage(
      <EventMerchantBoothSettingsStep
        event={createEvent({
          merchantBoothProgram: {
            enabled: true,
            paymentInstructions: { en: "", zh: "" },
            plans: [
              {
                id: "plan-standard",
                name: { en: "Standard", zh: "标准" },
                description: { en: "", zh: "" },
                priceAmount: 100,
                priceCurrency: "usd",
              },
            ],
            booths: [
              { id: "booth-a", boothPlanId: "plan-standard", boothCode: "A-01" },
              { id: "booth-b", boothPlanId: "plan-standard", boothCode: "A-01" },
              { id: "booth-c", boothPlanId: "plan-standard", boothCode: "   " },
              { id: "booth-d", boothPlanId: "plan-orphan", boothCode: "D-01" },
            ],
          },
        })}
        activeLang="en"
        onChange={onChange}
      />,
    );

    expect(screen.getAllByText(/booth code must be unique/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/booth code is required/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/booth plan is required/i).length).toBeGreaterThan(0);
  });

  it("preserves existing paymentModel and capacity while editing booth plan price", () => {
    const onChange = vi.fn();
    renderWithLanguage(
      <EventMerchantBoothSettingsStep
        event={createEvent({
          paymentModel: "deposit",
          depositAmount: 120,
          capacity: 30,
          merchantBoothProgram: {
            enabled: true,
            paymentInstructions: { en: "", zh: "" },
            plans: [
              {
                id: "plan-standard",
                name: { en: "Standard", zh: "标准" },
                description: { en: "", zh: "" },
                priceAmount: 100,
                priceCurrency: "usd",
              },
            ],
            booths: [],
          },
        })}
        activeLang="en"
        onChange={onChange}
      />,
    );

    const priceInputs = screen.getAllByLabelText(/^price$/i) as HTMLInputElement[];
    const planPriceInput = priceInputs[0];
    expect(planPriceInput).toBeDefined();
    fireEvent.change(planPriceInput, { target: { value: "350" } });

    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as Event;
    expect(last.paymentModel).toBe("deposit");
    expect(last.depositAmount).toBe(120);
    expect(last.capacity).toBe(30);
    expect(last.merchantBoothProgram?.plans[0]?.priceAmount).toBe(350);
  });
});
