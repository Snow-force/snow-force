"use client";

import { HomeHero } from "./home-hero";
import { HomeDepartures } from "./home-departures";
import { HomeStories } from "./home-stories";
import { HomeShopSection } from "./home-shop-section";
import type { HomeEvent, HomeRecap } from "@/lib/home/types";
import type { StoreProduct } from "@/lib/shop/storefront";
import "./home.css";

export function HomePageView({ events, recaps, eventLoadError = false, shopProducts = [] }: {
  events: HomeEvent[];
  recaps: HomeRecap[];
  eventLoadError?: boolean;
  shopProducts?: StoreProduct[];
}) {
  return <div className="sf-home">
    <HomeHero />
    <HomeDepartures events={events} loadError={eventLoadError} />
    <HomeStories recaps={recaps} />
    {shopProducts.length > 0 && <HomeShopSection products={shopProducts} />}
  </div>;
}
