"use client";

import { useState, useMemo } from "react";
import { useLanguage } from "@/lib/language";
import type { ShopItem, ShopCategory } from "@/lib/shop/types";
import { ShopItemCard } from "./shop-item-card";

type Props = { items: ShopItem[] };
type FilterKey = "all" | ShopCategory;
type SortKey = "featured" | "price-asc" | "price-desc" | "name-asc";

const TABS: { key: FilterKey; label: { en: string; zh: string } }[] = [
  { key: "all", label: { en: "All", zh: "全部" } },
  { key: "merch", label: { en: "Club Merch", zh: "社团周边" } },
  { key: "partner", label: { en: "Partner Brands", zh: "合作品牌" } },
  { key: "limited", label: { en: "Limited", zh: "限定款" } },
];

const SORTS: { key: SortKey; label: { en: string; zh: string } }[] = [
  { key: "featured", label: { en: "Featured", zh: "推荐排序" } },
  { key: "price-asc", label: { en: "Price: Low to High", zh: "价格从低到高" } },
  { key: "price-desc", label: { en: "Price: High to Low", zh: "价格从高到低" } },
  { key: "name-asc", label: { en: "Name A-Z", zh: "名称 A-Z" } },
];

export function ShopListingView({ items }: Props) {
  const { t, lang } = useLanguage();
  const [active, setActive] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("featured");

  const filtered = useMemo(() => {
    let result = active === "all" ? items : items.filter((i) => i.category === active);

    switch (sort) {
      case "price-asc":
        result = [...result].sort((a, b) => a.priceUsd - b.priceUsd);
        break;
      case "price-desc":
        result = [...result].sort((a, b) => b.priceUsd - a.priceUsd);
        break;
      case "name-asc":
        result = [...result].sort((a, b) => {
          const nameA = lang === "en" ? a.name.en : a.name.zh;
          const nameB = lang === "en" ? b.name.en : b.name.zh;
          return nameA.localeCompare(nameB);
        });
        break;
      default:
        result = [...result].sort((a, b) => a.sortOrder - b.sortOrder);
    }

    return result;
  }, [items, active, sort, lang]);

  const countLabel = t({ en: `${filtered.length} results`, zh: `${filtered.length} 件商品` });

  return (
    <div>
      {/* Hero */}
      <section className="bg-[#0d1117] px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-[1120px]">
          <p className="text-[13px] font-semibold uppercase leading-none tracking-[0.18em] text-[#7dd3fc]">
            {t({ en: "Community Shop", zh: "周边商城" })}
          </p>
          <h1 className="mt-4 text-[38px] font-semibold leading-[1.08] text-white sm:text-[56px]">
            {t({ en: "Every departure is the mountain's call.", zh: "每一次出发，都是大山的召唤。" })}
          </h1>
          <p className="mt-4 text-[17px] text-[#a1a1a6] sm:text-[19px]">
            {t({ en: "Built for the mountain. Gathered for freedom.", zh: "为雪山而生，为自由而聚。" })}
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="bg-white px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-[1120px]">
          {/* Toolbar: filters + sort */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActive(tab.key)}
                  className={`rounded-full border px-5 py-2 text-[14px] font-semibold leading-none transition active:scale-95 ${
                    active === tab.key
                      ? "border-[#0066cc] bg-[#0066cc] text-white"
                      : "border-[#d2d2d7] bg-white text-[#1d1d1f] hover:border-[#0066cc] hover:text-[#0066cc]"
                  }`}
                >
                  {t(tab.label)}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[14px] text-[#7a7a7a]">{countLabel}</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-full border border-[#d2d2d7] bg-white px-4 py-2 text-[14px] font-semibold text-[#1d1d1f] outline-none focus:border-[#0066cc]"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {t(s.label)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Grid */}
          <div className="mt-8">
            {filtered.length === 0 ? (
              <div className="rounded-[18px] border border-[#e0e0e0] bg-[#f5f5f7] p-16 text-center text-[17px] text-[#7a7a7a]">
                {t({ en: "No items in this category yet.", zh: "该分类暂无商品。" })}
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((item) => (
                  <ShopItemCard key={item.slug} item={item} t={t} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
