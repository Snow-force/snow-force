import { describe, expect, it } from "vitest";
import { createDefaultReviewConfig } from "@/lib/reviews/config";

import {
  eventAggregateToWriteRows,
  rowsToEvent,
  type EventBoothPlanRow,
  type EventBoothProgramRows,
  type EventCoreRow,
  type EventPhysicalBoothRow,
} from "./mappers";
import { parseEventEditorInput } from "./validation";

function makeCore(overrides: Partial<EventCoreRow> = {}): EventCoreRow {
  return {
    slug: "venue-event",
    status: "draft",
    registration_state: "open",
    title_zh: "场馆活动",
    title_en: "Venue Event",
    event_date: "2026-12-12",
    meet_time: "08:00",
    meet_location_zh: "集合点",
    meet_location_en: "Pickup point",
    activity_location_zh: "场馆",
    activity_location_en: "Venue",
    location_url: "",
    cover_image: "",
    capacity: 80,
    registration_close_at: null,
    requires_approval: false,
    allow_waitlist: true,
    allow_cancellation: true,
    fee_amount: "",
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

function makeBoothProgramRows(
  overrides: Partial<{
    enabled: boolean;
    paymentInstructionsEn: string;
    paymentInstructionsZh: string;
    plans: EventBoothPlanRow[];
    booths: EventPhysicalBoothRow[];
  }> = {},
): EventBoothProgramRows {
  return {
    program: {
      event_slug: "venue-event",
      enabled: overrides.enabled ?? true,
      payment_instructions_en: overrides.paymentInstructionsEn ?? "Pay staff offline.",
      payment_instructions_zh: overrides.paymentInstructionsZh ?? "请线下向工作人员付款。",
    },
    plans: overrides.plans ?? [
      {
        id: "plan-standard",
        name_en: "Standard booth",
        name_zh: "标准摊位",
        description_en: "One table near the lift.",
        description_zh: "缆车旁一张桌子。",
        price_amount: 250,
        price_currency: "usd",
      },
    ],
    booths: overrides.booths ?? [
      {
        id: "booth-a-01",
        booth_plan_id: "plan-standard",
        booth_code: "A-01",
      },
    ],
  };
}

describe("event merchant-booth config mappers", () => {
  it("returns an event without a booth program when no rows are provided", () => {
    const event = rowsToEvent(makeCore(), [], [], null);

    expect(event.merchantBoothProgram).toBeNull();
  });

  it("round-trips an enabled booth program through write rows and back", () => {
    const core = makeCore();
    const boothProgram = makeBoothProgramRows();
    const event = rowsToEvent(core, [], [], boothProgram);

    expect(event.merchantBoothProgram).toMatchObject({
      enabled: true,
      paymentInstructions: { en: "Pay staff offline.", zh: "请线下向工作人员付款。" },
      plans: [
        {
          id: "plan-standard",
          name: { en: "Standard booth", zh: "标准摊位" },
          description: { en: "One table near the lift.", zh: "缆车旁一张桌子。" },
          priceAmount: 250,
          priceCurrency: "usd",
        },
      ],
      booths: [
        {
          id: "booth-a-01",
          boothPlanId: "plan-standard",
          boothCode: "A-01",
        },
      ],
    });

    const writeRows = eventAggregateToWriteRows(event);
    expect(writeRows.merchantBoothProgram).toEqual(boothProgram);
  });

  it("drops the booth program when the program is disabled (enabled=false)", () => {
    const core = makeCore();
    const disabledProgram: EventBoothProgramRows = {
      program: {
        event_slug: core.slug,
        enabled: false,
        payment_instructions_en: "",
        payment_instructions_zh: "",
      },
      plans: [],
      booths: [],
    };

    const event = rowsToEvent(core, [], [], disabledProgram);
    expect(event.merchantBoothProgram).toBeNull();

    const writeRows = eventAggregateToWriteRows(event);
    expect(writeRows.merchantBoothProgram).toBeNull();
  });

  it("preserves the existing paymentModel, capacity, and required questions", () => {
    const core = makeCore({ payment_model: "deposit", deposit_amount: 120, capacity: 60 });
    const event = rowsToEvent(
      core,
      [],
      [],
      makeBoothProgramRows({
        plans: [
          {
            id: "plan-vip",
            name_en: "VIP booth",
            name_zh: "VIP 摊位",
            description_en: "Premium spot",
            description_zh: "黄金位置",
            price_amount: 800,
            price_currency: "cny",
          },
        ],
        booths: [
          {
            id: "booth-vip-1",
            booth_plan_id: "plan-vip",
            booth_code: "VIP-1",
          },
        ],
      }),
    );

    expect(event.paymentModel).toBe("deposit");
    expect(event.depositAmount).toBe(120);
    expect(event.capacity).toBe(60);
    expect(event.registrationQuestions.map((question) => question.key)).toEqual([
      "name",
      "email",
    ]);
  });
});

describe("event merchant-booth config validation", () => {
  const baseInput = {
    slug: "venue-event",
    capacity: "40",
    eventDate: "2026-12-12",
    meetTime: "08:00",
    registrationCloseAt: "2026-12-10T18:00",
    registrationQuestions: [],
    detailModules: [],
  };

  it("accepts a normal event with no merchant booth program", () => {
    const result = parseEventEditorInput({
      ...baseInput,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.merchantBoothProgram).toBeNull();
  });

  it("accepts an enabled program with a single valid plan and unique booth codes", () => {
    const result = parseEventEditorInput({
      ...baseInput,
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
          {
            id: "booth-a-01",
            boothPlanId: "plan-standard",
            boothCode: "A-01",
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.merchantBoothProgram).toMatchObject({
      enabled: true,
      plans: [{ id: "plan-standard", priceAmount: 250, priceCurrency: "usd" }],
      booths: [{ boothPlanId: "plan-standard", boothCode: "A-01" }],
    });
  });

  it("rejects a plan with zero or negative price", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      merchantBoothProgram: {
        enabled: true,
        paymentInstructions: { en: "", zh: "" },
        plans: [
          {
            id: "plan-cheap",
            name: { en: "Free spot", zh: "免费摊位" },
            description: { en: "", zh: "" },
            priceAmount: 0,
            priceCurrency: "usd",
          },
        ],
        booths: [],
      },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    const issuePaths = result.error.issues.map((issue) => issue.path.join("."));
    expect(issuePaths).toEqual(
      expect.arrayContaining(["merchantBoothProgram.plans.0.priceAmount"]),
    );
  });

  it("rejects a plan with an unsupported currency", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      merchantBoothProgram: {
        enabled: true,
        paymentInstructions: { en: "", zh: "" },
        plans: [
          {
            id: "plan-bad-currency",
            name: { en: "Standard", zh: "标准" },
            description: { en: "", zh: "" },
            priceAmount: 200,
            priceCurrency: "hkd",
          },
        ],
        booths: [],
      },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    const issuePaths = result.error.issues.map((issue) => issue.path.join("."));
    expect(issuePaths).toEqual(
      expect.arrayContaining(["merchantBoothProgram.plans.0.priceCurrency"]),
    );
  });

  it("rejects a plan with a blank Chinese name", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      merchantBoothProgram: {
        enabled: true,
        paymentInstructions: { en: "", zh: "" },
        plans: [
          {
            id: "plan-blank-zh",
            name: { en: "Standard", zh: "   " },
            description: { en: "", zh: "" },
            priceAmount: 200,
            priceCurrency: "usd",
          },
        ],
        booths: [],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a booth that references a plan that does not exist in the program", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      merchantBoothProgram: {
        enabled: true,
        paymentInstructions: { en: "", zh: "" },
        plans: [
          {
            id: "plan-standard",
            name: { en: "Standard", zh: "标准" },
            description: { en: "", zh: "" },
            priceAmount: 200,
            priceCurrency: "usd",
          },
        ],
        booths: [
          {
            id: "booth-a-01",
            boothPlanId: "plan-orphan",
            boothCode: "A-01",
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    const issuePaths = result.error.issues.map((issue) => issue.path.join("."));
    expect(issuePaths).toEqual(
      expect.arrayContaining(["merchantBoothProgram.booths.0.boothPlanId"]),
    );
  });

  it("rejects duplicate booth codes within the same program", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      merchantBoothProgram: {
        enabled: true,
        paymentInstructions: { en: "", zh: "" },
        plans: [
          {
            id: "plan-standard",
            name: { en: "Standard", zh: "标准" },
            description: { en: "", zh: "" },
            priceAmount: 200,
            priceCurrency: "usd",
          },
        ],
        booths: [
          { id: "booth-a-01", boothPlanId: "plan-standard", boothCode: "A-01" },
          { id: "booth-a-01-dup", boothPlanId: "plan-standard", boothCode: "A-01" },
        ],
      },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    const issuePaths = result.error.issues.map((issue) => issue.path.join("."));
    expect(issuePaths).toEqual(
      expect.arrayContaining(["merchantBoothProgram.booths.1.boothCode"]),
    );
  });

  it("rejects a booth with a blank booth code", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      merchantBoothProgram: {
        enabled: true,
        paymentInstructions: { en: "", zh: "" },
        plans: [
          {
            id: "plan-standard",
            name: { en: "Standard", zh: "标准" },
            description: { en: "", zh: "" },
            priceAmount: 200,
            priceCurrency: "usd",
          },
        ],
        booths: [
          { id: "booth-a-01", boothPlanId: "plan-standard", boothCode: "   " },
        ],
      },
    });

    expect(result.success).toBe(false);
  });

  it("clears the booth program when enabled is false even with leftover plans/booths", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      merchantBoothProgram: {
        enabled: false,
        paymentInstructions: { en: "stale", zh: "陈旧" },
        plans: [
          {
            id: "plan-stale",
            name: { en: "Stale", zh: "陈旧" },
            description: { en: "", zh: "" },
            priceAmount: 200,
            priceCurrency: "usd",
          },
        ],
        booths: [
          { id: "booth-stale", boothPlanId: "plan-stale", boothCode: "S-01" },
        ],
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.merchantBoothProgram).toBeNull();
  });
});
