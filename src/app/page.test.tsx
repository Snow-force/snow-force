import { beforeEach, describe, expect, it, vi } from "vitest";
const reads = vi.hoisted(() => ({ events: vi.fn(), recaps: vi.fn(), catalog: vi.fn() }));
vi.mock("@/lib/events/repository", () => ({ getPublicDisplayEvents: reads.events }));
vi.mock("@/lib/recaps/repository", () => ({ getRecaps: reads.recaps }));
vi.mock("@/lib/shop/storefront-repository", () => ({ getStorefrontCatalog: reads.catalog }));
vi.mock("@/components/site/home-page-view", () => ({ HomePageView: () => null }));
import HomePage from "./page";
import { fixtureProducts } from "@/lib/shop/shop.fixtures";
describe("home server catalog loading", () => {
  beforeEach(() => { vi.resetAllMocks(); reads.events.mockResolvedValue([]); reads.recaps.mockResolvedValue([]); reads.catalog.mockResolvedValue({ products: fixtureProducts }); });
  it("passes published commerce products to the existing home flow", async () => { expect((await HomePage()).props.shopProducts).toEqual(fixtureProducts); });
  it("preserves event error behavior while keeping independent shop data", async () => {
    reads.events.mockRejectedValue(new Error("events unavailable"));
    expect((await HomePage()).props).toMatchObject({ eventLoadError: true, shopProducts: fixtureProducts });
  });
  it("keeps the home page usable when commerce is unavailable", async () => {
    reads.catalog.mockRejectedValue(new Error("commerce unavailable"));
    expect((await HomePage()).props).toMatchObject({ events: [], recaps: [], shopProducts: [] });
  });
});
