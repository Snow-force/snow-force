import { beforeEach, describe, expect, it, vi } from "vitest";
const v2Policy = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@/lib/registrations/v2/repository", () => ({ getWaiverPolicy: v2Policy }));

const reads = vi.hoisted(() => ({ events: vi.fn(), event: vi.fn(), recaps: vi.fn(), recap: vi.fn(), reviews: vi.fn(), account: vi.fn() }));
vi.mock("@/lib/events/repository", () => ({ getPublicDisplayEvents: reads.events, getEvent: reads.event }));
vi.mock("@/lib/recaps/repository", () => ({ getRecaps: reads.recaps, getRecap: reads.recap }));
vi.mock("@/lib/reviews/repository", () => ({ getPublicReviewsForEvent: reads.reviews }));
vi.mock("@/lib/members/actions", () => ({ getCurrentMemberAccount: reads.account }));
vi.mock("@/components/events/events-view", () => ({ EventsView: () => null }));
vi.mock("@/components/events/event-detail-view", () => ({ EventDetailView: () => null }));
vi.mock("@/components/recaps/recaps-view", () => ({ RecapsView: () => null }));
vi.mock("@/components/recaps/recap-detail-view", () => ({ RecapDetailView: () => null }));
import EventsPage from "./events/page";
import EventPage from "./events/[slug]/page";
import RecapsPage from "./recaps/page";
import RecapPage from "./recaps/[slug]/page";

describe("public routes preserve repository failure states", () => {
  beforeEach(() => { vi.resetAllMocks(); reads.account.mockResolvedValue(null); });
  it("shows an event loading error when the repository fails", async () => {
    reads.events.mockRejectedValue(new Error("database unavailable"));
    expect((await EventsPage()).props).toMatchObject({ events: [], loadError: true });
  });
  it("keeps an empty published catalog distinct from a failure", async () => {
    reads.events.mockResolvedValue([]);
    expect((await EventsPage()).props).toMatchObject({ events: [], loadError: false });
  });
  it("awaits a dynamic event slug and preserves its failure state", async () => {
    reads.event.mockRejectedValue(new Error("database unavailable"));
    const page = await EventPage({ params: Promise.resolve({ slug: "requested-event" }) });
    expect(reads.event).toHaveBeenCalledWith("requested-event");
    expect(page.props).toMatchObject({ event: undefined, loadError: true, memberProfile: null, emailConfirmed: false });
  });
  it("keeps recap discovery available during a repository outage", async () => {
    reads.recaps.mockRejectedValue(new Error("database unavailable"));
    expect((await RecapsPage()).props.recaps).toEqual([]);
  });
  it("shows a loading error instead of a legacy registration form when waiver configuration fails", async () => {
    reads.event.mockResolvedValue({ slug: "requested-event" });
    v2Policy.mockRejectedValue(new Error("waiver configuration unavailable"));
    const page = await EventPage({ params: Promise.resolve({ slug: "requested-event" }) });
    expect(page.props).toMatchObject({ event: undefined, loadError: true });
    expect(page.props.groupRegistrationEnabled).toBeUndefined();
  });
  it("avoids a reviews lookup when a recap cannot be loaded", async () => {
    reads.recap.mockRejectedValue(new Error("database unavailable"));
    expect((await RecapPage({ params: Promise.resolve({ slug: "requested-recap" }) })).props).toMatchObject({ recap: undefined, reviews: [] });
    expect(reads.reviews).not.toHaveBeenCalled();
  });
  it("retains a loaded recap when its optional reviews fail", async () => {
    const recap = { eventSlug: "past-event" };
    reads.recap.mockResolvedValue(recap);
    reads.reviews.mockRejectedValue(new Error("reviews unavailable"));
    expect((await RecapPage({ params: Promise.resolve({ slug: "requested-recap" }) })).props).toMatchObject({ recap, reviews: [] });
  });
});
