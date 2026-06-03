import { describe, expect, it } from "vitest";

import type { EventDetailModule, EventRegistrationQuestion } from "@/lib/types";
import {
  rowsToEvent,
  type EventAggregateWriteRows,
  type EventCoreRow,
  type EventDetailModuleRow,
  type EventDetailModuleWriteRow,
  type EventRegistrationQuestionRow,
  type EventRegistrationQuestionWriteRow,
} from "./mappers";
import { createEventRepository, type EventSource, type RegistrationCountSource } from "./repository";

function eventCoreRow(slug: string, status: EventCoreRow["status"]): EventCoreRow {
  return {
    slug,
    status,
    registration_state: "closed",
    title_en: slug,
    title_zh: `${slug}-zh`,
    event_date: null,
    meet_time: null,
    meet_location_en: "",
    meet_location_zh: "",
    activity_location_en: "",
    activity_location_zh: "",
    location_url: "",
    cover_image: "",
    capacity: 12,
    registration_close_at: null,
    requires_approval: false,
    allow_waitlist: false,
    allow_cancellation: false,
    fee_amount: "",
    payment_instructions_en: "",
    payment_instructions_zh: "",
    seo_title_en: "",
    seo_title_zh: "",
    seo_description_en: "",
    seo_description_zh: "",
  };
}

function questionRow(eventSlug: string): EventRegistrationQuestionRow {
  return {
    id: `question-${eventSlug}`,
    event_slug: eventSlug,
    question_key: "level",
    type: "single_choice",
    required: true,
    sort_order: 0,
    label_en: "Level",
    label_zh: "Level zh",
    help_en: "",
    help_zh: "",
    options_en: ["beginner"],
    options_zh: ["beginner zh"],
  };
}

function moduleRow(eventSlug: string): EventDetailModuleRow {
  return {
    id: `module-${eventSlug}`,
    event_slug: eventSlug,
    module_type: "intro",
    display_mode: "rich_text",
    sort_order: 0,
    title_en: "Intro",
    title_zh: "Intro zh",
    content_en: "Welcome",
    content_zh: "Welcome zh",
    items_en: [],
    items_zh: [],
  };
}

function eventQuestion(key: string): EventRegistrationQuestion {
  return {
    id: `question-${key}`,
    key,
    type: "single_choice",
    required: true,
    label: { en: key, zh: `${key}-zh` },
    helpText: { en: "", zh: "" },
    options: { en: ["beginner"], zh: ["beginner-zh"] },
  };
}

function eventModule(type: EventDetailModule["type"]): EventDetailModule {
  return {
    id: `module-${type}`,
    type,
    displayMode: "rich_text",
    title: { en: type, zh: `${type}-zh` },
    content: { en: "content", zh: "content-zh" },
    items: { en: [], zh: [] },
  };
}

function eventSource({
  events,
  questions,
  modules,
}: {
  events: EventCoreRow[];
  questions: EventRegistrationQuestionRow[];
  modules: EventDetailModuleRow[];
}): EventSource & {
  savedQuestions: EventRegistrationQuestionWriteRow[];
  savedModules: EventDetailModuleWriteRow[];
} {
  const savedQuestions: EventRegistrationQuestionWriteRow[] = [];
  const savedModules: EventDetailModuleWriteRow[] = [];

  return {
    savedQuestions,
    savedModules,
    listPublicEvents: async () => events,
    listAdminEvents: async () => events,
    getPublicEvent: async (slug) => events.find((row) => row.slug === slug),
    getAdminEvent: async (slug) => events.find((row) => row.slug === slug),
    listQuestions: async (slugs) => questions.filter((row) => slugs.includes(row.event_slug)),
    listModules: async (slugs) => modules.filter((row) => slugs.includes(row.event_slug)),
    saveAggregate: async (rows: EventAggregateWriteRows) => {
      savedQuestions.splice(0, savedQuestions.length, ...rows.questions);
      savedModules.splice(0, savedModules.length, ...rows.modules);
      return rows.core;
    },
  };
}

describe("event repository", () => {
  it("keeps drafts out of public event reads", async () => {
    const repository = createEventRepository(
      eventSource({
        events: [eventCoreRow("published", "published"), eventCoreRow("draft", "draft")],
        questions: [],
        modules: [],
      }),
    );

    expect((await repository.getEvents()).map((event) => event.slug)).toEqual(["published"]);
    expect(await repository.getEvent("draft")).toBeUndefined();
    expect((await repository.getAllEvents()).map((event) => event.slug)).toEqual([
      "published",
      "draft",
    ]);
  });

  it("keeps archived events out of the admin event management list", async () => {
    const repository = createEventRepository(
      eventSource({
        events: [eventCoreRow("draft", "draft"), eventCoreRow("archived", "archived")],
        questions: [],
        modules: [],
      }),
    );

    expect((await repository.getAllEvents()).map((event) => event.slug)).toEqual(["draft"]);
  });

  it("merges persisted registration counts into event reads", async () => {
    const countSource: RegistrationCountSource = {
      countForEvents: async (slugs) =>
        new Map(slugs.map((slug) => [slug, slug === "published" ? 2 : 0])),
    };
    const repository = createEventRepository(
      eventSource({
        events: [eventCoreRow("published", "published"), eventCoreRow("draft", "draft")],
        questions: [],
        modules: [],
      }),
      countSource,
    );

    expect((await repository.getEvents())[0].registrationCount).toBe(2);
    expect((await repository.getAllEvents()).map((event) => event.registrationCount)).toEqual([2, 0]);
    expect((await repository.getEvent("published"))?.registrationCount).toBe(2);
    expect((await repository.getEventAdmin("draft"))?.registrationCount).toBe(0);
  });

  it("loads questions and modules into public event aggregates", async () => {
    const repository = createEventRepository(
      eventSource({
        events: [eventCoreRow("published", "published")],
        questions: [questionRow("published")],
        modules: [moduleRow("published")],
      }),
    );

    const event = await repository.getEvent("published");

    expect(event?.registrationQuestions).toHaveLength(3);
    expect(event?.registrationQuestions.map((question) => question.key)).toEqual([
      "name",
      "email",
      "level",
    ]);
    expect(event?.detailModules).toHaveLength(1);
  });

  it("replaces questions and modules when saving an event aggregate", async () => {
    const source = eventSource({
      events: [eventCoreRow("draft", "draft")],
      questions: [],
      modules: [],
    });
    const repository = createEventRepository(source);

    await repository.createEvent({
      ...rowsToEvent(eventCoreRow("draft", "draft"), [], []),
      registrationQuestions: [eventQuestion("level")],
      detailModules: [eventModule("intro")],
    });

    expect(source.savedQuestions.map((row) => row.question_key)).toEqual(["name", "email", "level"]);
    expect(source.savedModules.map((row) => row.module_type)).toEqual(["intro"]);
  });
});
