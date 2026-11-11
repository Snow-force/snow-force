import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (read: () => Promise<unknown>) => read }));
import { loadHomeEvents, loadHomeRecaps, loadHomeProducts } from "./repository";

let clientId = 0;
function clientWith(rows: unknown[], status = 200) {
  const requests: URL[] = [];
  const client = createClient("https://home.example.supabase.co", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `home-test-${++clientId}` },
    global: { fetch: async (input) => {
      requests.push(new URL(String(input)));
      return new Response(JSON.stringify(status === 200 ? rows : { message: "Unavailable" }), { status, headers: { "Content-Type": "application/json" } });
    } },
  });
  return { client, requests };
}

describe("bounded homepage public reads", () => {
  it("reads only published event summaries without registrations, forms or waivers", async () => {
    const { client, requests } = clientWith([{ slug: "ride", status: "published", registration_state: "open", title_en: "Ride", title_zh: "滑行", event_date: "2027-01-10", cover_image: "/ride.jpg", fee_amount: "$50" }]);
    const events = await loadHomeEvents(client);
    expect(events[0]).toMatchObject({ slug: "ride", title: { en: "Ride", zh: "滑行" }, feeAmount: "$50" });
    expect(events[0]).not.toHaveProperty("registrationCount");
    expect(requests).toHaveLength(1);
    expect(requests[0].pathname).toBe("/rest/v1/events");
    expect(requests[0].searchParams.get("status")).toBe("eq.published");
    expect(requests[0].searchParams.get("registration_state")).toBe("in.(open,full)");
    expect(requests[0].searchParams.get("limit")).toBe("3");
    expect(requests[0].searchParams.get("order")).toBe("registration_state.desc,event_date.asc.nullslast,slug.asc");
    expect(requests[0].searchParams.get("select")).not.toMatch(/\*|waiver|review|capacity|questions|modules/);
  });

  it("bounds recap output to published covers and summaries without album payloads", async () => {
    const { client, requests } = clientWith([{ slug: "story", status: "published", title_en: "A day", title_zh: "雪山日", date: "2026-10-01", media: [{ url: "private-album" }], content_en: "Long article" }]);
    const recaps = await loadHomeRecaps(client);
    expect(recaps[0].slug).toBe("story");
    expect(recaps[0]).not.toHaveProperty("media");
    expect(recaps[0]).not.toHaveProperty("content");
    expect(requests).toHaveLength(1);
    expect(requests[0].searchParams.get("limit")).toBe("3");
    expect(requests[0].searchParams.get("status")).toBe("eq.published");
    expect(requests[0].searchParams.get("select")).not.toMatch(/\*|media|content|seo/);
  });

  it("defends against nonpublic rows even when a source violates the public filter", async () => {
    const events = clientWith([{ slug: "draft", status: "draft", registration_state: "open", title_en: "Draft", title_zh: "草稿" }]);
    const recaps = clientWith([{ slug: "hidden", status: "hidden", title_en: "Hidden", title_zh: "隐藏", date: "2026-10-01" }]);
    expect(await loadHomeEvents(events.client)).toEqual([]);
    expect(await loadHomeRecaps(recaps.client)).toEqual([]);
  });

  it("throws failed reads so transient errors cannot be cached as a successful empty schedule", async () => {
    await expect(loadHomeEvents(clientWith([], 400).client)).rejects.toThrow("Unavailable");
    await expect(loadHomeRecaps(clientWith([], 400).client)).rejects.toThrow("Unavailable");
  });
});

import { fixtureNativeProduct } from "@/lib/shop/shop.fixtures";
import type { CommerceRequest } from "@/lib/shop/commerce-client";
it("loads at most three featured commerce items without crawling the catalog or navigation", async () => {
  const paths: string[] = [];
  const request: CommerceRequest = async (path, schema) => {
    paths.push(path);
    return schema.parse(path.startsWith("/store/regions") ? { regions: [{ id: "reg_us", currency_code: "usd", countries: [{ iso_2: "us" }] }] } : { products: [fixtureNativeProduct], count: 1000 });
  };
  const products = await loadHomeProducts(request);
  expect(products[0]).toMatchObject({ slug: "fixture-jacket", price: 79.95 });
  expect(paths).toHaveLength(2);
  const query = new URL(paths[1], "https://store.example.com");
  expect(query.searchParams.get("limit")).toBe("3");
  expect(query.searchParams.get("region_id")).toBe("reg_us");
  expect(query.searchParams.get("fields")).not.toMatch(/categories|images|options|description/);
});
