import { describe, expect, it } from "vitest";
import {
  eventAggregateToWriteRows,
  rowsToEvent,
  type EventCoreRow,
  type EventDetailModuleRow,
  type EventRegistrationQuestionRow,
} from "./mappers";

const core: EventCoreRow = {
  slug: "big-bear-day",
  status: "published",
  registration_state: "open",
  title_zh: "大熊山一日滑雪",
  title_en: "",
  event_date: "2026-12-12",
  meet_time: "07:30:00",
  meet_location_zh: "Rowland Heights",
  meet_location_en: "",
  activity_location_zh: "Big Bear",
  activity_location_en: "",
  location_url: "",
  cover_image: "",
  capacity: 24,
  registration_close_at: "2026-12-10T18:00:00+00:00",
  requires_approval: false,
  allow_waitlist: true,
  allow_cancellation: true,
  fee_amount: "$120",
  payment_model: "free",
  deposit_amount: null,
  deposit_currency: "usd",
  full_payment_amount: null,
  payment_instructions_zh: "微信群确认付款",
  payment_instructions_en: "",
  seo_title_zh: "",
  seo_title_en: "",
  seo_description_zh: "",
  seo_description_en: "",
};

const question: EventRegistrationQuestionRow = {
  id: "question-level",
  event_slug: "big-bear-day",
  question_key: "level",
  type: "single_choice",
  required: true,
  sort_order: 0,
  label_zh: "你的滑雪水平？",
  label_en: "",
  help_zh: "",
  help_en: "",
  options_zh: ["新手", "进阶"],
  options_en: [],
};

const moduleRow: EventDetailModuleRow = {
  id: "module-intro",
  event_slug: "big-bear-day",
  module_type: "intro",
  display_mode: "rich_text",
  sort_order: 0,
  title_zh: "活动介绍",
  title_en: "",
  content_zh: "一日活动",
  content_en: "",
  items_zh: [],
  items_en: [],
};

describe("modular event mappers", () => {
  it("maps rows into an event aggregate", () => {
    expect(rowsToEvent(core, [question], [moduleRow])).toMatchObject({
      slug: "big-bear-day",
      registrationQuestions: [
        { key: "name", type: "text", required: true },
        { key: "email", type: "text", required: true },
        { key: "level", type: "single_choice" },
      ],
      detailModules: [{ id: "module-intro", type: "intro" }],
    });
  });

  it("maps an event aggregate into core, question, and module write rows", () => {
    const event = rowsToEvent(core, [question], [moduleRow]);
    const rows = eventAggregateToWriteRows(event);

    expect(rows.core.slug).toBe("big-bear-day");
    expect(rows.questions.map((row) => row.question_key)).toEqual(["name", "email", "level"]);
    expect(rows.questions[0]).toMatchObject({ question_key: "name", sort_order: 0 });
    expect(rows.questions[2]).toMatchObject({ question_key: "level", sort_order: 2 });
    expect(rows.modules[0]).toMatchObject({ module_type: "intro", sort_order: 0 });
    expect("id" in rows.questions[0]).toBe(false);
    expect("id" in rows.modules[0]).toBe(false);
  });

  it("preserves valid strings from mixed JSON row arrays", () => {
    const event = rowsToEvent(
      core,
      [
        {
          ...question,
          options_en: ["first timer", 12, "intermediate", null],
          options_zh: [false, "beginner", "advanced"],
        },
      ],
      [
        {
          ...moduleRow,
          items_en: ["bring gloves", { invalid: true }, "bring goggles"],
          items_zh: [0, "helmet", "layers"],
        },
      ],
    );

    expect(event.registrationQuestions.find((item) => item.key === "level")?.options).toEqual({
      en: ["first timer", "intermediate"],
      zh: ["beginner", "advanced"],
    });
    expect(event.detailModules[0].items).toEqual({
      en: ["bring gloves", "bring goggles"],
      zh: ["helmet", "layers"],
    });
  });
});
