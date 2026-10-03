import { describe, expect, it } from "vitest";
import { createDefaultReviewConfig } from "@/lib/reviews/config";
import {
  eventAggregateToWriteRows,
  rowsToEvent,
  type EventCoreRow,
} from "./mappers";

function makeCore(overrides: Partial<EventCoreRow> = {}): EventCoreRow {
  return {
    slug: "test-event",
    status: "draft",
    registration_state: "open",
    title_zh: "",
    title_en: "",
    event_date: null,
    meet_time: null,
    meet_location_zh: "",
    meet_location_en: "",
    activity_location_zh: "",
    activity_location_en: "",
    location_url: "",
    cover_image: "",
    capacity: 0,
    registration_close_at: null,
    requires_approval: false,
    allow_waitlist: false,
    allow_cancellation: false,
    fee_amount: "$0",
    payment_model: "free",
    deposit_amount: null,
    deposit_currency: "usd",
    full_payment_amount: null,
    payment_instructions_zh: "",
    payment_instructions_en: "",
    seo_title_zh: "",
    seo_title_en: "",
    seo_description_zh: "",
    seo_description_en: "",
    waiver_text_en: null,
    waiver_text_sha: null,
    review_config: createDefaultReviewConfig(),
    ...overrides,
  };
}

describe("event payment mapper fields", () => {
  it("maps deposit payment fields from core row to Event", () => {
    const core = makeCore({
      payment_model: "deposit",
      deposit_amount: 120,
      deposit_currency: "usd",
      full_payment_amount: null,
    });
    const event = rowsToEvent(core, [], [], null);
    expect(event.paymentModel).toBe("deposit");
    expect(event.depositAmount).toBe(120);
    expect(event.depositCurrency).toBe("usd");
    expect(event.fullPaymentAmount).toBeNull();
  });

  it("maps free payment model with null amounts", () => {
    const core = makeCore({
      payment_model: "free",
      deposit_amount: null,
      deposit_currency: "usd",
      full_payment_amount: null,
    });
    const event = rowsToEvent(core, [], [], null);
    expect(event.paymentModel).toBe("free");
    expect(event.depositAmount).toBeNull();
    expect(event.depositCurrency).toBe("usd");
    expect(event.fullPaymentAmount).toBeNull();
  });

  it("falls back to free/usd when payment fields are undefined (missing column)", () => {
    const core = makeCore();
    // Deliberately emulate a legacy database response without the required columns.
    const partialRow = {
      ...core,
      payment_model: undefined,
      deposit_currency: undefined,
    } as unknown as EventCoreRow;
    const event = rowsToEvent(partialRow, [], [], null);
    expect(event.paymentModel).toBe("free");
    expect(event.depositCurrency).toBe("usd");
  });

  it("maps full_prepay payment model through eventAggregateToWriteRows", () => {
    const core = makeCore({
      payment_model: "full_prepay",
      full_payment_amount: 399,
      deposit_currency: "cny",
      deposit_amount: null,
    });
    const event = rowsToEvent(core, [], [], null);
    const rows = eventAggregateToWriteRows(event);
    expect(rows.core.payment_model).toBe("full_prepay");
    expect(rows.core.full_payment_amount).toBe(399);
    expect(rows.core.deposit_currency).toBe("cny");
    expect(rows.core.deposit_amount).toBeNull();
  });
});
