import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ client: vi.fn(), event: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));
vi.mock("@/lib/events/repository", () => ({ getEventAdmin: mocks.event }));
import { mergeMarketingContacts, readMarketingSource } from "./source";
describe("marketing customer sources", () => {
  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("SUPABASE_SECRET_KEY", "fixture-secret"); });
  it("deduplicates across sources without granting consent to legacy contacts; opt-out wins", () => {
    expect(mergeMarketingContacts([{ email: " MEMBER@example.com ", source: "member", subscribed: true }, { email: "member@example.com", source: "event" }, { email: "member@example.com", source: "member", optedOut: true }, { email: "legacy@example.com", source: "event" }, { email: "invalid", source: "event" }])).toEqual([
      { email: "member@example.com", sources: ["member", "event"], subscribed: true, optedOut: true },
      { email: "legacy@example.com", sources: ["event"], subscribed: false, optedOut: false },
    ]);
  });
  it("paginates member records and includes historical registrations", async () => {
    const profiles = Array.from({ length: 1001 }, (_, index) => ({ email: `member${index}@example.com`, marketing_email_opt_in: true }));
    const ranges: number[] = [];
    mocks.client.mockReturnValue({ from: (table: string) => { const query = { select: () => query, order: () => query, range: (offset: number, end: number) => { ranges.push(offset); return Promise.resolve({ data: table === "member_profiles" ? profiles.slice(offset, end + 1) : [{ contact_email: "legacy@example.com" }], error: null }); } }; return query; } });
    const result = await readMarketingSource({ action: "directory" });
    expect("contacts" in result && result.contacts).toHaveLength(1002);
    expect(ranges).toEqual([0, 1000, 0]);
  });
  it("fails closed on source errors", async () => {
    mocks.client.mockReturnValue({ from: () => { const query = { select: () => query, order: () => query, range: () => Promise.resolve({ data: null, error: { message: "private error" } }) }; return query; } });
    await expect(readMarketingSource({ action: "directory" })).rejects.toThrow("Unable to read marketing subscriptions");
  });
  it("generates English event content and blocks unpublished or past events", async () => {
    const event = { slug: "future-event", title: { en: "Future ride", zh: "未来活动" }, eventDate: "2099-01-01", activityLocation: { en: "Mammoth", zh: "猛犸" }, seoDescription: { en: "Ride together", zh: "一起滑雪" }, coverImage: "/images/event.jpg", status: "published", registrationState: "open" };
    mocks.event.mockResolvedValue(event);
    expect(await readMarketingSource({ action: "event", slug: event.slug })).toMatchObject({ subject: "Future ride", publishable: true, path: "/events/future-event" });
    mocks.event.mockResolvedValue({ ...event, status: "draft" });
    expect(await readMarketingSource({ action: "event", slug: event.slug })).toMatchObject({ publishable: false });
    mocks.event.mockResolvedValue({ ...event, eventDate: "2000-01-01" });
    expect(await readMarketingSource({ action: "event", slug: event.slug })).toMatchObject({ publishable: false });
  });
  it("lists editable event sources for the picker and escapes email filter wildcards", async () => {
    const filter = vi.fn();
    mocks.client.mockReturnValue({ from: (table: string) => { const query = { select: () => query, neq: () => query, order: () => query, ilike: (column: string, value: string) => { filter(column, value); return query; }, range: () => Promise.resolve({ data: table === "events" ? [{ slug: "future-event", title_en: "Future ride", status: "published" }] : [], error: null }) }; return query; } });
    expect(await readMarketingSource({ action: "events" })).toEqual({ sources: [{ kind: "event", id: "future-event", title: "Future ride", status: "published" }] });
    await readMarketingSource({ action: "eligibility", email: "member_name@example.com" });
    expect(filter).toHaveBeenCalledWith("email", "member\\_name@example.com");
  });
});
