import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Event } from "@/lib/types";

const actionMocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
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

vi.mock("../supabase/server", () => ({
  createAdminClient: actionMocks.createAdminClient,
}));

vi.mock("./repository", () => ({
  createEvent: actionMocks.createEvent,
  getEventAdmin: actionMocks.getEventAdmin,
  updateEvent: actionMocks.updateEvent,
}));

import { archiveEventResult, publishEventResult, saveEventAction, uploadEventCoverAction } from "./actions";

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
  paymentModel: "free",
  depositAmount: null,
  depositCurrency: "usd",
  fullPaymentAmount: null,
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
  waiverTextEn: null,
  waiverTextSha: null,
  merchantBoothProgram: null,
};

describe("event admin action helpers", () => {
  beforeEach(() => {
    actionMocks.createAdminClient.mockReset();
    actionMocks.createEvent.mockReset();
    actionMocks.getEventAdmin.mockReset();
    actionMocks.redirect.mockClear();
    actionMocks.requireAdmin.mockReset();
    actionMocks.revalidatePath.mockClear();
    actionMocks.updateEvent.mockReset();
  });

  it("rejects non-image cover uploads", async () => {
    const formData = new FormData();
    formData.set("coverImage", new File(["not an image"], "cover.txt", { type: "text/plain" }));

    const result = await uploadEventCoverAction({ success: false }, formData);

    expect(result).toMatchObject({
      success: false,
      message: "Upload a JPG, PNG, WebP, or GIF image.",
    });
    expect(actionMocks.requireAdmin).toHaveBeenCalled();
    expect(actionMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects cover uploads over 6MB", async () => {
    const formData = new FormData();
    formData.set("coverImage", new File([new Uint8Array(6 * 1024 * 1024 + 1)], "cover.jpg", { type: "image/jpeg" }));

    const result = await uploadEventCoverAction({ success: false }, formData);

    expect(result).toMatchObject({
      success: false,
      message: "Cover image must be 6MB or smaller.",
    });
    expect(actionMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("uploads valid cover images to Supabase Storage and returns a public URL", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "events/pow-day/123-cover.webp" }, error: null });
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.example.com/event-covers/${path}` } }));
    const from = vi.fn().mockReturnValue({ upload, getPublicUrl });
    actionMocks.createAdminClient.mockReturnValue({ storage: { from } });

    const formData = new FormData();
    formData.set("slug", "Pow Day 2026!");
    formData.set("coverImage", new File(["image bytes"], "My Cover.webp", { type: "image/webp" }));

    const result = await uploadEventCoverAction({ success: false }, formData);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.url).toMatch(/^https:\/\/cdn\.example\.com\/event-covers\/events\/pow-day-2026\/\d+-my-cover\.webp$/);
    expect(actionMocks.requireAdmin).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("event-covers");
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^events\/pow-day-2026\/\d+-my-cover\.webp$/),
      expect.any(File),
      { cacheControl: "3600", contentType: "image/webp", upsert: false },
    );
    const uploadedPath = upload.mock.calls[0]?.[0];
    expect(getPublicUrl).toHaveBeenCalledWith(uploadedPath);
  });

  it("persists uploaded cover URLs for existing events", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "events/pow-day/123-cover.webp" }, error: null });
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.example.com/event-covers/${path}` } }));
    const from = vi.fn().mockReturnValue({ upload, getPublicUrl });
    actionMocks.createAdminClient.mockReturnValue({ storage: { from } });
    actionMocks.updateEvent.mockResolvedValue(modularEvent);

    const formData = new FormData();
    formData.set("originalSlug", "pow-day");
    formData.set("slug", "Pow Day 2026!");
    formData.set("coverImage", new File(["image bytes"], "My Cover.webp", { type: "image/webp" }));

    const result = await uploadEventCoverAction({ success: false }, formData);

    expect(result.success).toBe(true);
    if (!result.success || !result.url) return;
    expect(actionMocks.updateEvent).toHaveBeenCalledWith("pow-day", { coverImage: result.url });
  });

  it("deletes the previous event cover object when replacing an existing cover", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "events/pow-day/123-cover.webp" }, error: null });
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.example.com/event-covers/${path}` } }));
    const list = vi.fn().mockResolvedValue({ data: [{ name: "old-cover.webp" }], error: null });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const from = vi.fn().mockReturnValue({ upload, getPublicUrl, list, remove });
    actionMocks.createAdminClient.mockReturnValue({ storage: { from } });
    actionMocks.getEventAdmin.mockResolvedValue({
      ...modularEvent,
      coverImage: "https://project.supabase.co/storage/v1/object/public/event-covers/events/pow-day/old-cover.webp",
    });
    actionMocks.updateEvent.mockResolvedValue(modularEvent);

    const formData = new FormData();
    formData.set("originalSlug", "pow-day");
    formData.set("slug", "pow-day");
    formData.set("coverImage", new File(["image bytes"], "cover.webp", { type: "image/webp" }));

    const result = await uploadEventCoverAction({ success: false }, formData);

    expect(result.success).toBe(true);
    expect(actionMocks.getEventAdmin).toHaveBeenCalledWith("pow-day");
    expect(remove).toHaveBeenCalledWith(["events/pow-day/old-cover.webp"]);
  });

  it("removes older cover objects under the event folder when replacing an existing cover", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "events/pow-day/123-cover.webp" }, error: null });
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.example.com/event-covers/${path}` } }));
    const list = vi.fn().mockResolvedValue({
      data: [
        { name: "old-cover.webp" },
        { name: "orphan-cover.webp" },
      ],
      error: null,
    });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const from = vi.fn().mockReturnValue({ upload, getPublicUrl, list, remove });
    actionMocks.createAdminClient.mockReturnValue({ storage: { from } });
    actionMocks.getEventAdmin.mockResolvedValue({
      ...modularEvent,
      coverImage: "https://project.supabase.co/storage/v1/object/public/event-covers/events/pow-day/old-cover.webp",
    });
    actionMocks.updateEvent.mockResolvedValue(modularEvent);

    const formData = new FormData();
    formData.set("originalSlug", "pow-day");
    formData.set("slug", "pow-day");
    formData.set("coverImage", new File(["image bytes"], "cover.webp", { type: "image/webp" }));

    const result = await uploadEventCoverAction({ success: false }, formData);

    expect(result.success).toBe(true);
    expect(list).toHaveBeenCalledWith("events/pow-day", { limit: 1000 });
    expect(remove).toHaveBeenCalledWith([
      "events/pow-day/old-cover.webp",
      "events/pow-day/orphan-cover.webp",
    ]);
  });

  it("returns storage upload errors", async () => {
    const upload = vi.fn().mockResolvedValue({ data: null, error: new Error("bucket missing") });
    const getPublicUrl = vi.fn();
    const from = vi.fn().mockReturnValue({ upload, getPublicUrl });
    actionMocks.createAdminClient.mockReturnValue({ storage: { from } });

    const formData = new FormData();
    formData.set("coverImage", new File(["image bytes"], "cover.png", { type: "image/png" }));

    const result = await uploadEventCoverAction({ success: false }, formData);

    expect(result).toMatchObject({
      success: false,
      message: "bucket missing",
    });
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("saves events from modular JSON payloads", async () => {
    actionMocks.createEvent.mockResolvedValue(modularEvent);

    const formData = new FormData();
    formData.set("eventPayload", JSON.stringify(modularEvent));

    await expect(saveEventAction({ success: false }, formData)).resolves.toMatchObject({
      success: true,
      message: "Saved in English. Chinese translation could not be refreshed.",
    });

    expect(actionMocks.createEvent).toHaveBeenCalledWith({
      ...modularEvent,
      registrationQuestions: [
        expect.objectContaining({ key: "name", type: "text", required: true }),
        expect.objectContaining({ key: "email", type: "text", required: true }),
        ...modularEvent.registrationQuestions,
      ],
    });
  });

  it("rejects published event payloads missing required public content", async () => {
    const formData = new FormData();
    formData.set(
      "eventPayload",
      JSON.stringify({
        ...modularEvent,
        status: "published",
        detailModules: [],
      }),
    );

    const result = await saveEventAction({ success: false }, formData);

    expect(result).toMatchObject({
      success: false,
      message: "Complete required event fields before publishing.",
      fieldErrors: {
        detailModules: ["Required before publishing."],
      },
    });
    expect(actionMocks.createEvent).not.toHaveBeenCalled();
    expect(actionMocks.updateEvent).not.toHaveBeenCalled();
  });

  it("prevents changing an existing event slug", async () => {
    const formData = new FormData();
    formData.set("originalSlug", "original-event");
    formData.set("eventPayload", JSON.stringify(modularEvent));

    const result = await saveEventAction({ success: false }, formData);

    expect(result).toMatchObject({
      success: false,
      message: "Existing event slugs cannot be changed.",
      fieldErrors: { slug: ["Create a new event if the URL slug needs to change."] },
    });
    expect(actionMocks.createEvent).not.toHaveBeenCalled();
    expect(actionMocks.updateEvent).not.toHaveBeenCalled();
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
      missingFields: expect.arrayContaining(["title.en", "detailModules"]),
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
