import { beforeEach, describe, expect, it, vi } from "vitest";
const reads = vi.hoisted(() => ({ events: vi.fn(), recaps: vi.fn(), products: vi.fn() }));
vi.mock("@/lib/home/repository", () => ({ getHomeEvents: reads.events, getHomeRecaps: reads.recaps, getHomeProducts: reads.products }));
vi.mock("@/components/site/home-page-view", () => ({ HomePageView: () => null }));
import HomePage from "./page";
import { fixtureProducts } from "@/lib/shop/shop.fixtures";
describe("home server summary loading", () => {
  beforeEach(() => { vi.resetAllMocks(); reads.events.mockResolvedValue([]); reads.recaps.mockResolvedValue([]); reads.products.mockResolvedValue(fixtureProducts); });
  it("passes only public cached summaries and featured products to the homepage", async () => { expect((await HomePage()).props.shopProducts).toEqual(fixtureProducts); });
  it("keeps independent stories and commerce when event loading fails", async () => {
    reads.events.mockRejectedValue(new Error("events unavailable"));
    reads.recaps.mockResolvedValue([{ slug: "story" }]);
    expect((await HomePage()).props).toMatchObject({ eventLoadError: true, recaps: [{ slug: "story" }], shopProducts: fixtureProducts });
  });
  it("does not hide events when recap loading fails", async () => {
    reads.recaps.mockRejectedValue(new Error("recaps unavailable"));
    reads.events.mockResolvedValue([{ slug: "ride" }]);
    expect((await HomePage()).props).toMatchObject({ eventLoadError: false, events: [{ slug: "ride" }], recaps: [] });
  });
  it("keeps the homepage usable when commerce is unavailable", async () => {
    reads.products.mockRejectedValue(new Error("commerce unavailable"));
    expect((await HomePage()).props).toMatchObject({ events: [], recaps: [], shopProducts: [] });
  });
});
