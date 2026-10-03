import { describe, expect, it, vi } from "vitest";
import { createDefaultReviewConfig } from "@/lib/reviews/config";

import type { EventAggregateWriteRows } from "./mappers";
import { saveEventAggregate } from "./repository";

const programId = "11111111-1111-4111-8111-111111111111";
const planId = "22222222-2222-4222-8222-222222222222";
const boothId = "33333333-3333-4333-8333-333333333333";

describe("merchant booth program persistence", () => {
  it("saves the event aggregate through one RPC while retaining application-referenced booth identities", async () => {
    // Given: an existing application that references this stable plan UUID.
    const application = { requestedPlanId: planId };
    const reviewConfig = createDefaultReviewConfig();
    const rows: EventAggregateWriteRows = {
      core: {
        slug: "venue-event",
        status: "draft",
        registration_state: "open",
        title_zh: "场地活动",
        title_en: "Venue event",
        event_date: "2026-08-01",
        meet_time: "09:00",
        meet_location_zh: "集合点",
        meet_location_en: "Meeting point",
        activity_location_zh: "活动地点",
        activity_location_en: "Activity location",
        location_url: "",
        cover_image: "",
        capacity: 30,
        registration_close_at: null,
        requires_approval: false,
        allow_waitlist: true,
        allow_cancellation: true,
        fee_amount: "0",
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
        review_config: reviewConfig,
      },
      reviewConfig,
      questions: [
        {
          event_slug: "venue-event",
          question_key: "experience",
          type: "text",
          required: true,
          sort_order: 0,
          label_zh: "经验",
          label_en: "Experience",
          help_zh: "",
          help_en: "",
          options_zh: [],
          options_en: [],
        },
      ],
      modules: [
        {
          event_slug: "venue-event",
          module_type: "intro",
          display_mode: "rich_text",
          sort_order: 0,
          title_zh: "活动详情",
          title_en: "Activity details",
          content_zh: "活动内容",
          content_en: "Activity content",
          items_zh: [],
          items_en: [],
        },
      ],
      merchantBoothProgram: {
        program: {
          event_slug: "venue-event",
          enabled: true,
          payment_instructions_en: "Updated wire details",
          payment_instructions_zh: "更新后的汇款信息",
        },
        plans: [
          {
            id: planId,
            name_en: "Standard booth",
            name_zh: "标准摊位",
            description_en: "Updated description",
            description_zh: "更新说明",
            price_amount: 250,
            price_currency: "usd",
          },
        ],
        booths: [{ id: boothId, booth_plan_id: planId, booth_code: "A-01" }],
      },
    };
    const rpc = vi.fn(async () => ({ data: rows.core, error: null }));

    // When: staff saves the event editor aggregate.
    await saveEventAggregate({ rpc }, rows);

    // Then: one RPC receives the complete aggregate with the original plan identity.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_event_aggregate", {
      p_core: rows.core,
      p_questions: rows.questions,
      p_modules: rows.modules,
      p_review_config: reviewConfig,
      p_merchant_booth_program: expect.objectContaining({
        plans: expect.arrayContaining([expect.objectContaining({ id: application.requestedPlanId })]),
        booths: expect.arrayContaining([
          expect.objectContaining({ booth_plan_id: application.requestedPlanId }),
        ]),
      }),
    });
  });
});
