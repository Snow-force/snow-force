"use client";

import { useState } from "react";
import { PublicImage as Image } from "@/components/media/public-image";
import Link from "next/link";
import { ArrowRight, ChevronRight, MessageCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { shopSupportEmail } from "@/lib/shop/contact";
import { defaultStoreFilters, filterStoreProducts, type Localized, type StoreFilters, type StoreProduct } from "@/lib/shop/storefront";
import { brandHref, categoryHref, categoryIds, collectionHref, emptyStoreNavigation, type StoreNavigation, type StorePromotion } from "@/lib/shop/navigation";
import { ProductCard } from "./product-card";

export type ShopListing = { label: Localized; directory?: boolean; description?: string; image?: string | null; promotions?: StorePromotion[]; breadcrumbs?: { label: Localized; href: string }[]; links?: { label: Localized; href: string }[] };
export function ShopPageView({ products, navigation = emptyStoreNavigation, unavailable = false, initialFilters = defaultStoreFilters, supportEmail = shopSupportEmail, listing, scoped = false }: {
  products: StoreProduct[]; navigation?: StoreNavigation; unavailable?: boolean; initialFilters?: StoreFilters; supportEmail?: string; listing?: ShopListing; scoped?: boolean;
}) {
  const { lang } = useLanguage();
  const [filters, setFilters] = useState<StoreFilters>(initialFilters);
  const visible = filterStoreProducts(products, filters, categoryIds(navigation.categories, filters.category));
  const brands = [...new Set(products.map(product => product.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  const reset = () => setFilters(defaultStoreFilters);
  const isFiltered = Boolean(filters.query || filters.brand !== "all" || filters.sort !== "featured" || filters.category !== "all");
  const featured = navigation.collections.filter(collection => collection.section === "featured");
  const hero = featured.find(collection => collection.image) ?? featured[0];
  return <>
    <div className="shop-container pt-6 sm:pt-8">
      <nav aria-label={text("Breadcrumb", "当前位置")} className="flex flex-wrap items-center gap-2 text-xs text-[#666]">
        <Link href="/">{text("Home", "首页")}</Link><ChevronRight size={12} /><Link href="/shop">{text("Gear shop", "装备商城")}</Link>
        {listing?.breadcrumbs?.map(crumb => <span key={crumb.href} className="flex items-center gap-2"><ChevronRight size={12} /><Link href={crumb.href}>{crumb.label[lang]}</Link></span>)}
        {listing && <><ChevronRight size={12} /><span aria-current="page">{listing.label[lang]}</span></>}
      </nav>
      <div className="my-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div><p className="shop-eyebrow text-[#666]">SNOWFORCE GEAR SHOP</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[38px]">{listing ? listing.label[lang] : text("Your mountain kit, all in one place.", "雪山装备，一站选齐。")}</h1>
          {listing?.description && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#666]">{listing.description}</p>}
          <p className="mt-3 text-sm text-[#666]">{text("Customer service", "商城客服")} · {" "}<a href={`mailto:${supportEmail}`} className="inline-flex min-h-11 items-center break-all text-[#0066cc] underline underline-offset-4">{supportEmail}</a></p>
        </div>
        <form className="shop-search w-full sm:max-w-md" role="search" onSubmit={event => { event.preventDefault(); document.getElementById("catalog")?.scrollIntoView({ behavior: "instant", block: "start" }); }}>
          <Search size={19} aria-hidden="true" /><label className="sr-only" htmlFor="gear-search">{text("Search gear", "搜索装备")}</label>
          <input id="gear-search" type="search" placeholder={text("Search styles or brands", "搜索款式或品牌")} value={filters.query} onChange={event => setFilters(previous => ({ ...previous, query: event.target.value }))} />
          <button type="submit" className="shop-search-submit">{text("Search", "搜索")}</button>
        </form>
      </div>
      {!listing && <section className="shop-hero overflow-hidden rounded-xl">
        <Image src={hero?.image ?? "/shop/mountain-editorial.webp"} alt={hero ? hero.label[lang] : text("Rider on a snowy mountain", "滑手在雪山滑行")} fill priority sizes="100vw" className="object-cover" /><div className="shop-hero-shade" />
        <div className="relative flex min-h-[330px] flex-col justify-center p-7 sm:min-h-[390px] sm:p-12"><p className="shop-eyebrow text-white/85">ALL MOUNTAIN / SNOWFORCE</p><h2 className="mt-5 max-w-lg text-4xl font-semibold leading-[1.12] tracking-tight text-white sm:text-5xl">{hero ? hero.label[lang] : text("Gear up. Go further.", "装备就位。下一站，雪山。")}</h2><p className="mt-5 max-w-md text-sm text-white/85">{text("Find your next kit for the season ahead.", "找到适合你的装备，准备下一次出发。")}</p><Link href={hero ? collectionHref(hero) : "/shop/featured"} className="btn-primary mt-6 w-fit gap-4">{text("Explore the collection", "探索精选装备")}<ArrowRight size={17} /></Link></div>
      </section>}
      {listing?.image && <div className="relative mt-6 aspect-[3/1] overflow-hidden rounded-xl"><Image src={listing.image} alt={listing.label[lang]} fill sizes="100vw" className="object-cover" /></div>}
      {!listing && navigation.categories.length > 0 && <section className="py-8" aria-label={text("Shop by category", "按分类选购")}><div className="gear-category-grid">{navigation.categories.map(category => <Link href={categoryHref(category)} key={category.id} className="gear-category-card">
        {category.image && <div className="relative aspect-[4/3]"><Image src={category.image} alt={category.label[lang]} fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover" /></div>}
        <span>{category.label[lang]}<ArrowRight size={16} aria-hidden="true" /></span>
      </Link>)}</div></section>}
      {listing?.links && listing.links.length > 0 && <div className="mt-5 flex flex-wrap gap-3">{listing.links.map(link => <Link key={link.href} href={link.href} className="shop-pill">{link.label[lang]}</Link>)}</div>}
      {listing?.promotions && listing.promotions.length > 0 && <div className="mt-6 space-y-3 rounded-xl bg-[#f5f5f7] p-5">{listing.promotions.map(offer => <p key={`${offer.collection_id}:${offer.code}`} className="text-sm">{offer.is_automatic ? text("Automatic offer", "自动优惠") : <>{text("Promotion code", "促销码")}: <strong>{offer.code}</strong></>} · {text("Eligibility and final savings are confirmed in your cart.", "适用条件和最终优惠金额将在购物车中核验。")}</p>)}</div>}
      {brands.length > 0 && <div className="shop-brand-row mt-5 flex flex-wrap items-center justify-between gap-4 border-y border-[#e0e0e0] py-4"><p className="text-xs text-[#666]">{text("Explore our brands", "品牌精选")}</p><div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold tracking-wide">{brands.map(brand => <Link href={brandHref(brand)} key={brand} className="flex min-h-11 items-center hover:text-[#0066cc]">{brand}</Link>)}</div></div>}
    </div>
    {!listing?.directory && <section id="catalog" className="shop-container scroll-mt-40 pb-14 pt-8 sm:pb-20" aria-labelledby="catalog-title">
      <div className="flex flex-wrap items-end justify-between gap-4"><h2 id="catalog-title" className="text-2xl font-semibold">{listing?.label[lang] ?? text("Explore all gear", "探索全部装备")}</h2><p className="max-w-sm text-xs leading-relaxed text-[#666]">{text("Prices in USD. Choose a size and color to see availability.", "所有价格均为美元。选择尺码与配色，查看当前供货。")}</p></div>
      {!scoped && <div className="mt-6 flex flex-wrap gap-2" aria-label={text("Product categories", "商品分类筛选")}><button className={`shop-pill ${filters.category === "all" ? "shop-pill-active" : ""}`} aria-pressed={filters.category === "all"} onClick={reset}>{text("All gear", "全部装备")}</button>{navigation.categories.map(category => <button key={category.id} className={`shop-pill ${filters.category === category.handle || filters.category === category.id ? "shop-pill-active" : ""}`} aria-pressed={filters.category === category.handle || filters.category === category.id} onClick={() => setFilters(previous => ({ ...previous, category: category.handle }))}>{category.label[lang]}</button>)}</div>}
      <div className="shop-catalog-toolbar mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f5f5f7] p-3"><p role="status" className="px-2 text-sm text-[#666]">{text(`${visible.length} styles`, `${visible.length} 款装备`)}</p><div className="flex flex-wrap gap-2">
        <label className="shop-select"><SlidersHorizontal size={16} aria-hidden="true" /><span className="sr-only">{text("Brand", "品牌")}</span><select value={filters.brand} onChange={event => setFilters(previous => ({ ...previous, brand: event.target.value }))}><option value="all">{text("All brands", "全部品牌")}</option>{brands.map(brand => <option key={brand}>{brand}</option>)}</select></label>
        <label className="shop-select"><span className="sr-only">{text("Sort products", "商品排序")}</span><select value={filters.sort} onChange={event => setFilters(previous => ({ ...previous, sort: event.target.value as StoreFilters["sort"] }))}><option value="featured">{text("Featured", "精选排序")}</option><option value="price-low">{text("Price: low to high", "价格：从低到高")}</option><option value="price-high">{text("Price: high to low", "价格：从高到低")}</option></select></label>
      </div></div>
      {isFiltered && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#666]">{filters.query && <button className="shop-filter-tag" onClick={() => setFilters(previous => ({ ...previous, query: "" }))} aria-label={text("Clear search", "清除搜索")}>{filters.query}<X size={13} /></button>}<button className="min-h-11 px-2 text-[#0066cc] underline" onClick={reset}>{text("Reset filters", "重置筛选")}</button></div>}
      {unavailable ? <div role="alert" className="gear-empty"><h3>{text("The gear shop is temporarily unavailable", "商城暂时无法加载")}</h3><p>{text("Please try again shortly.", "请稍后重试。")}</p><Link href="/shop" className="btn-primary mt-6">{text("Try again", "重新加载")}</Link></div> : visible.length > 0 ? <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">{visible.map(product => <ProductCard key={product.id} product={product} presentation="catalog" />)}</div> : <div className="gear-empty"><Search size={32} className="mx-auto text-[#999]" /><h3>{products.length ? text("No matching gear yet", "暂时没有匹配的装备") : text("New gear is on its way", "新品即将上架")}</h3><p>{products.length ? text("Try another brand or clear your search.", "试试其他品牌，或清除搜索条件。") : text("Our next collection is being prepared. Come back soon.", "我们正在准备新一季装备，敬请期待。")}</p>{products.length > 0 && <button className="btn-primary mt-6" onClick={reset}>{text("View all gear", "查看全部装备")}</button>}</div>}
    </section>}
    <section className="bg-[#252527] text-white"><div className="shop-container grid gap-8 py-12 md:grid-cols-[1fr_auto] md:items-center"><div><p className="shop-eyebrow text-white/65">RIDE TOGETHER. GEAR UP TOGETHER.</p><h2 className="mt-4 text-2xl font-semibold">{text("Need a hand choosing your kit?", "你的下一套装备，我们一起选。")}</h2><p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">{text("Share your riding style and measurements with SnowForce. We'll help you find the right fit.", "告诉 SnowForce 你的滑行习惯和身体尺寸，一起确认合适的尺码与搭配。")}</p><p className="mt-4 flex items-center gap-2 text-sm text-white/75"><MessageCircle size={16} />WeChat: SnowForceClub</p></div><Link href="/events" className="btn-primary gap-5">{text("Find your next ride", "寻找下一次滑行")}<ArrowRight size={18} /></Link></div></section>
  </>;
}
