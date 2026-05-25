import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Event } from "@/lib/types";

const actionMocks = vi.hoisted(() => ({
  createEvent: vi.fn(),
  getEventAdmin: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  updateEvent: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: actionMocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: actionMocks.redirect,
}));

vi.mock("../auth/admin", () => ({
  requireAdmin: actionMocks.requireAdmin,
}));

vi.mock("./repository", () => ({
  createEvent: actionMocks.createEvent,
  getEventAdmin: actionMocks.getEventAdmin,
  updateEvent: actionMocks.updateEvent,
}));

import { archiveEventResult, publishEventResult, saveEventAction } from "./actions";

const modularEvent: Event = {
  slug: "modular-event",
  status: "draft",
  registrationState: "closed",
  title: { en: "Crystal Ridge Day Trip", zh: "水晶岭一日滑雪" },
  eventDate: "2026-12-03",
  meetTime: "08:00",
  meetLocation: { en: "Richmond pickup point", zh: "列治文集合点" },
  activityLocation: { en: "Crystal Ridge", zh: "水晶岭雪场" },
  locationUrl: "https://example.com/maps/crystal-ridge",
  coverImage: "/events/crystal-ridge.jpg",
  capacity: 12,
  registrationCount: 0,
  registrationCloseAt: "2026-12-02T10:00",
  requiresApproval: false,
  allowWaitlist: true,
  allowCancellation: true,
  feeAmount: "120",
  paymentInstructions: { en: "Pay after confirmation.", zh: "确认后付款。" },
  seoTitle: { en: "", zh: "" },
  seoDescription: { en: "", zh: "" },
  registrationQuestions: [
    {
      id: "q-phone",
      key: "phone",
      type: "phone",
      required: true,
      label: { en: "Phone", zh: "电话" },
      helpText: { en: "", zh: "" },
      options: { en: [], zh: [] },
    },
  ],
  detailModules: [
    {
      id: "intro",
      type: "intro",
      displayMode: "rich_text",
      title: { en: "Overview", zh: "活动概览" },
      content: {
        en: "A guided snow day with coaching blocks.",
        zh: "包含分组指导的一日滑雪活动。",
      },
      items: { en: [], zh: [] },
    },
  ],
};

describe("event admin action helpers", () => {
  beforeEach(() => {
    actionMocks.createEvent.mockReset();
    actionMocks.getEventAdmin.mockReset();
    actionMocks.redirect.mockClear();
    actionMocks.requireAdmin.mockReset();
    actionMocks.revalidatePath.mockClear();
    actionMocks.updateEvent.mockReset();
  });

  it("saves events from modular JSON payloads", async () => {
    actionMocks.createEvent.mockResolvedValue(modularEvent);

    const formData = new FormData();
    formData.set("eventPayload", JSON.stringify(modularEvent));

    await expect(saveEventAction({ success: false }, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/events/modular-event/edit?saved=1",
    );

    expect(actionMocks.createEvent).toHaveBeenCalledWith(modularEvent);
  });

  it("blocks publishing modular events without required public content", async () => {
    const event = {
      ...modularEvent,
      title: { zh: "", en: "" },
      detailModules: [],
    };

    const result = await publishEventResult(
      {
        load: async () => event,
        save: async () => {
          throw new Error("incomplete events must not be saved");
        },
      },
      event.slug,
    );

    expect(result).toMatchObject({
      success: false,
      missingFields: expect.arrayContaining(["title.zh", "detailModules"]),
    });
  });

  it("archives existing events", async () => {
    const event: Event = {
      ...modularEvent,
      slug: "past-event",
      status: "published",
      registrationState: "open",
    };

    const result = await archiveEventResult(
      {
        load: async () => event,
        save: async (_slug, data) => ({ ...event, ...data }),
      },
      event.slug,
    );

    expect(result).toMatchObject({
      success: true,
      event: { status: "archived", registrationState: "closed" },
    });
  });
});
