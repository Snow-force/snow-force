"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ChevronRight, MessageCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { storeCategories as categories, defaultStoreFilters, filterStoreProducts, type StoreFilters, type StoreProduct } from "@/lib/shop/storefront";
import { ProductCard } from "./product-card";

export function ShopPageView({ products, unavailable = false, initialFilters = defaultStoreFilters }: { products: StoreProduct[]; unavailable?: boolean; initialFilters?: StoreFilters }) {
  const { lang } = useLanguage();
  const [filters, setFilters] = useState<StoreFilters>(initialFilters);
  const visible = filterStoreProducts(products, filters);
  const brands = Array.from(new Set(products.map((product) => product.brand)));
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  const activeCategory = categories.find((category) => category.id === filters.category);
  const isFiltered = Boolean(filters.query || filters.category !== "all" || filters.brand !== "all" || filters.sort !== "featured");
  function chooseCategory(category: StoreFilters["category"]) {
    setFilters({ ...defaultStoreFilters, category });
  }
  return <>
    <div className="shop-container pt-6 sm:pt-8">
      <nav aria-label={text("Breadcrumb", "当前位置")} className="flex items-center gap-2 text-xs text-[#666]">
        <Link href="/">{text("Home", "首页")}</Link><ChevronRight size={12} /><span>{text("Gear shop", "装备商城")}</span>
      </nav>
      <div className="my-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div><p className="shop-eyebrow text-[#666]">SNOWFORCE GEAR COLLECTION</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[32px]">{text("Your mountain kit, all in one place.", "雪山装备，一站选齐。")}</h1></div>
        <form className="shop-search w-full sm:max-w-md" role="search" onSubmit={(event) => { event.preventDefault(); document.getElementById("catalog")?.scrollIntoView({ behavior: "instant", block: "start" }); }}>
          <Search size={19} aria-hidden="true" /><label className="sr-only" htmlFor="gear-search">{text("Search gear", "搜索装备")}</label>
          <input id="gear-search" type="search" placeholder={text("Search styles or brands", "搜索款式或品牌")} value={filters.query} onChange={(event) => setFilters((previous) => ({ ...previous, query: event.target.value }))} />
          <button type="submit" className="shop-search-submit">{text("Search", "搜索")}</button>
        </form>
      </div>
      <div className="shop-discovery-grid">
        <nav aria-label={text("Shop by category", "按分类选购")} className="shop-category-menu">
          <h2 className="px-5 pb-3 pt-5 text-sm font-semibold">{text("Shop by category", "商品分类")}</h2>
          {categories.map((category) => <a href="#catalog" key={category.id} aria-current={filters.category === category.id ? "true" : undefined} onClick={() => chooseCategory(category.id)} className="flex min-h-12 items-center justify-between gap-2 px-5 text-sm">
            <span>{category.label[lang]}</span><span className="flex items-center gap-2 text-xs text-[#777]">{category.id === "all" ? products.length : products.filter((product) => product.category === category.id).length}<ChevronRight size={14} /></span>
          </a>)}
          <div className="mx-5 mt-4 border-t border-[#e0e0e0] pt-4 text-xs leading-relaxed text-[#666]">{text("For all mountain days.\nFor every kind of rider.", "从第一趟滑行，\n到整个雪季的陪伴。")}</div>
        </nav>
        <section className="shop-hero overflow-hidden rounded-xl">
          <Image src="/shop/mountain-editorial.webp" alt={text("VECTOR rider on a snowy mountain", "VECTOR 滑手在雪山滑行")} fill priority sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover" />
          <div className="shop-hero-shade" />
          <div className="relative flex min-h-[340px] flex-col justify-center p-7 sm:min-h-[370px] sm:p-10">
            <p className="shop-eyebrow text-white/85">ALL MOUNTAIN / VECTOR</p>
            <h2 className="mt-5 max-w-xs text-[36px] font-semibold leading-[1.12] tracking-tight text-white sm:text-[44px]">{lang === "zh" ? <>装备就位。<br />下一站，雪山。</> : <>Gear up.<br />Go further.</>}</h2>
            <p className="mt-5 max-w-[250px] text-sm leading-relaxed text-white/85">{text("Snow apparel made for your next mountain day.", "找到适合你的雪服，\n把下一次出发穿在身上。")}</p>
            <a href="#catalog" onClick={() => chooseCategory("outerwear")} className="btn-primary mt-6 w-fit gap-4">{text("Shop snow apparel", "选购滑雪服饰")}<ArrowRight size={17} /></a>
          </div>
        </section>
        <a href="#catalog" onClick={() => chooseCategory("kids")} className="shop-kids-tile group">
          <div className="relative min-h-[220px] flex-1 overflow-hidden"><Image src="/shop/kids-editorial.webp" alt={text("A young VECTOR rider on snow", "身穿 VECTOR 装备的小滑手")} fill sizes="(max-width: 768px) 100vw, 25vw" className="object-cover transition duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" /></div>
          <div className="p-5"><p className="shop-eyebrow text-[#666]">LITTLE RIDERS</p><h2 className="mt-2 text-xl font-semibold">{text("Small riders. Big days.", "小滑手，也有大梦想。")}</h2><span className="mt-3 flex items-center gap-3 text-sm font-medium text-[#0066cc]">{text("Explore kids' gear", "探索儿童装备")}<ArrowRight size={16} /></span></div>
        </a>
      </div>
      <div className="shop-brand-row mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#e0e0e0] bg-white px-5 py-4">
        <p className="text-xs text-[#666]">{text("Explore our brands", "品牌精选")}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold tracking-wide">{brands.map((brand) => <a href="#catalog" key={brand} onClick={() => setFilters({ ...defaultStoreFilters, brand })} className="flex min-h-11 items-center hover:text-[#0066cc]">{brand}</a>)}</div>
      </div>
      <div className="grid grid-cols-1 gap-3 py-6 text-xs text-[#666] sm:grid-cols-3">
        <p className="flex items-center gap-2"><Check size={16} />{text("Gear selected for the mountain", "精选装备，为雪山而选")}</p>
        <p className="flex items-center gap-2"><Check size={16} />{text("Snow apparel, goggles & kids' gear", "雪服、雪镜与儿童装备")}</p>
        <p className="flex items-center gap-2"><MessageCircle size={16} />{text("Personal gear advice · SnowForceClub", "选款咨询 · 微信 SnowForceClub")}</p>
      </div>
    </div>
    <section id="catalog" className="shop-container scroll-mt-40 pb-14 pt-6 sm:pb-20" aria-labelledby="catalog-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="shop-eyebrow text-[#777]">FIND YOUR NEXT KIT</p><h2 id="catalog-title" className="mt-2 text-2xl font-semibold sm:text-[30px]">{filters.category === "all" ? text("Explore all gear", "探索全部装备") : activeCategory?.label[lang]}</h2></div>
        <p className="max-w-sm text-xs leading-relaxed text-[#666]">{text("Prices in USD. Choose a size and color to see availability.", "所有价格均为美元。选择尺码与配色，查看当前供货。")}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-2" aria-label={text("Product categories", "商品分类筛选")}>{categories.map((category) => <button key={category.id} className={`shop-pill ${filters.category === category.id ? "shop-pill-active" : ""}`} aria-pressed={filters.category === category.id} onClick={() => setFilters((previous) => ({ ...previous, category: category.id }))}>{category.label[lang]}</button>)}</div>
      <div className="shop-catalog-toolbar mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f5f5f7] p-3">
        <p role="status" className="px-2 text-sm text-[#666]">{text(`${visible.length} styles`, `${visible.length} 款装备`)}</p>
        <div className="flex flex-wrap gap-2">
          <label className="shop-select"><SlidersHorizontal size={16} aria-hidden="true" /><span className="sr-only">{text("Brand", "品牌")}</span><select value={filters.brand} onChange={(event) => setFilters((previous) => ({ ...previous, brand: event.target.value }))}><option value="all">{text("All brands", "全部品牌")}</option>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select></label>
          <label className="shop-select"><span className="sr-only">{text("Sort products", "商品排序")}</span><select value={filters.sort} onChange={(event) => setFilters((previous) => ({ ...previous, sort: event.target.value as StoreFilters["sort"] }))}><option value="featured">{text("Featured", "精选排序")}</option><option value="price-low">{text("Price: low to high", "价格：从低到高")}</option><option value="price-high">{text("Price: high to low", "价格：从高到低")}</option></select></label>
        </div>
      </div>
      {isFiltered && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#666]">
        {filters.query && <button className="shop-filter-tag" onClick={() => setFilters((previous) => ({ ...previous, query: "" }))} aria-label={text("Clear search", "清除搜索")}>{filters.query}<X size={13} /></button>}
        {filters.brand !== "all" && <button className="shop-filter-tag" onClick={() => setFilters((previous) => ({ ...previous, brand: "all" }))} aria-label={text("Clear brand filter", "清除品牌筛选")}>{filters.brand}<X size={13} /></button>}
        <button className="min-h-11 px-2 text-[#0066cc] underline" onClick={() => setFilters(defaultStoreFilters)}>{text("Reset filters", "重置筛选")}</button>
      </div>}
      {unavailable ? <div role="alert" className="mt-6 rounded-xl border border-[#e0e0e0] bg-[#f5f5f7] px-6 py-16 text-center"><h3 className="text-xl font-medium">{text("The gear shop is temporarily unavailable", "商城暂时无法加载")}</h3><p className="mt-3 text-[#666]">{text("Please try again shortly.", "请稍后重试。")}</p><Link href="/shop" className="btn-primary mt-6">{text("Try again", "重新加载")}</Link></div> : visible.length > 0 ? <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">{visible.map((product) => <ProductCard key={product.slug} product={product} presentation="catalog" />)}</div> : <div className="mt-6 rounded-xl border border-[#e0e0e0] bg-[#f5f5f7] px-6 py-16 text-center"><Search size={32} className="mx-auto text-[#999]" /><h3 className="mt-4 text-xl font-medium">{products.length ? text("No matching gear yet", "暂时没有匹配的装备") : text("New gear is on its way", "新品即将上架")}</h3><p className="mt-3 text-[#666]">{products.length ? text("Try another brand or clear your search.", "试试其他品牌，或清除搜索条件。") : text("Our next collection is being prepared. Come back soon.", "我们正在准备新一季装备，敬请期待。")}</p>{products.length > 0 && <button className="btn-primary mt-6" onClick={() => setFilters(defaultStoreFilters)}>{text("View all gear", "查看全部装备")}</button>}</div>}
    </section>
    <section className="bg-[#252527] text-white"><div className="shop-container grid gap-8 py-12 md:grid-cols-[1fr_auto] md:items-center"><div><p className="shop-eyebrow text-white/65">RIDE TOGETHER. GEAR UP TOGETHER.</p><h2 className="mt-4 text-2xl font-semibold">{text("Need a hand choosing your kit?", "你的下一套装备，我们一起选。")}</h2><p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">{text("Share your riding style and measurements with SnowForce. We'll help you find the right fit.", "告诉 SnowForce 你的滑行习惯和身体尺寸，一起确认合适的尺码与搭配。")}</p><p className="mt-4 text-sm text-white/75">WeChat: SnowForceClub</p></div><Link href="/events" className="btn-primary gap-5">{text("Find your next ride", "寻找下一次滑行")}<ArrowRight size={18} /></Link></div></section>
  </>;
}
