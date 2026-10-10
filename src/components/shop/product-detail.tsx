"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight, Minus, Plus, Ruler, ShoppingBag } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { formatStorePrice, selectedStoreVariant, type StoreProduct } from "@/lib/shop/storefront";
import { categoryHref, type StoreCategory } from "@/lib/shop/navigation";
import { useShopCart } from "./shop-provider";
import { ProductCard } from "./product-card";
import { ProductPhoto } from "./product-photo";

export function ProductDetail({ product, related, categories = [] }: { product: StoreProduct; related: StoreProduct[]; categories?: StoreCategory[] }) {
  const { lang } = useLanguage();
  const { add, busy } = useShopCart();
  const [choices, setChoices] = useState<Record<string, string>>(() => Object.fromEntries(product.options.filter((option) => option.values.length === 1).map((option) => [option.id, option.values[0].value])));
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  const category = categories.find(item => product.categoryIds.includes(item.id));
  const variant = selectedStoreVariant(product, choices);
  const price = variant ? variant.price : product.price;
  const maxQuantity = variant?.availableQuantity === null ? 99 : Math.min(99, variant?.availableQuantity ?? 99);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!variant) { setError(text("Choose the available options before adding to cart.", "请先选择商品规格，再加入购物车。")); return; }
    if (!variant.available || quantity > maxQuantity) { setError(text("This option is currently out of stock.", "该规格目前缺货。")); return; }
    setError(""); await add(variant.id, quantity);
  }
  return <div className="shop-container pb-24 pt-5 sm:pb-12 sm:pt-7">
    <nav aria-label={text("Breadcrumb", "当前位置")} className="flex flex-wrap items-center gap-2 text-xs leading-relaxed text-[#666]"><Link href="/shop">{text("Gear shop", "装备商城")}</Link><ChevronRight size={12} />{category && <><Link href={categoryHref(category)}>{category.label[lang]}</Link><ChevronRight size={12} /></>}<span>{product.name[lang]}</span></nav>
    <div className="mt-6 grid items-start gap-7 lg:grid-cols-[1.05fr_1fr] lg:gap-12"><ProductPhoto product={product} /><div className="lg:sticky lg:top-40">
      <p className="shop-eyebrow">{product.brand}</p><h1 className="mt-4 text-[28px] font-semibold leading-tight tracking-tight sm:text-[36px]">{product.name[lang]}</h1><p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-[#666]">{product.description[lang]}</p>
      <div className="mt-5 rounded-xl bg-[#f5f5f7] p-5"><p className="text-[30px] font-semibold leading-none">{price === null ? text("Currently unavailable", "暂不可售") : formatStorePrice(price, lang)}</p>{variant?.originalPrice !== null && variant?.originalPrice !== undefined && price !== null && variant.originalPrice > price && <p className="mt-3 text-sm text-[#777] line-through">{formatStorePrice(variant.originalPrice, lang)}</p>}<p className="mt-3 text-xs text-[#666]">USD{!variant && product.variants.length > 1 ? text(" · from", " · 起") : ""}</p></div>
      <form id="product-options" onSubmit={submit} className="mt-6 scroll-mt-40 space-y-5">
        {product.options.map((option) => <fieldset key={option.id}><legend className="mb-3 text-sm font-semibold">{option.title[lang]}</legend><div className="flex flex-wrap gap-2">{option.values.map(({ value, label }) => <label key={value} className={`shop-option ${choices[option.id] === value ? "shop-option-selected" : ""}`}><input type="radio" name={option.id} className="sr-only" checked={choices[option.id] === value} onChange={() => { setChoices((previous) => ({ ...previous, [option.id]: value })); setQuantity(1); setError(""); }} /><span>{label[lang]}</span></label>)}</div></fieldset>)}
        <div className="flex flex-wrap items-center justify-between gap-4"><span className="text-sm font-semibold">{text("Quantity", "数量")}</span><div className="flex items-center gap-5"><button type="button" className="shop-icon-button" aria-label={text("Decrease quantity", "减少数量")} disabled={quantity <= 1 || busy} onClick={() => setQuantity((value) => value - 1)}><Minus size={15} /></button><span>{quantity}</span><button type="button" className="shop-icon-button" aria-label={text("Increase quantity", "增加数量")} disabled={quantity >= maxQuantity || busy} onClick={() => setQuantity((value) => value + 1)}><Plus size={15} /></button></div></div>
        <p role="status" className="text-sm text-[#666]">{variant ? variant.available ? text("Available to order", "可加入购物车") : text("This option is currently out of stock", "该规格目前缺货") : text("Select your options to check availability", "请选择规格，查看供货情况")}</p>
        {variant?.sku && <p className="text-xs text-[#777]">SKU: {variant.sku}</p>}
        <button type="submit" className="btn-primary w-full gap-3" disabled={busy || !product.available || (variant !== null && !variant.available)}><ShoppingBag size={18} />{busy ? text("Updating cart…", "购物车更新中…") : text("Add to cart", "加入购物车")}</button>
        {error && <p role="alert" className="text-sm text-[#a12727]">{error}</p>}
      </form>
      <p className="mt-4 text-xs leading-relaxed text-[#777]">{text("Availability is checked again when adding and at checkout.", "加入购物车和结账时将重新核验库存与价格。")}</p>
    </div></div>
    <div className="mt-10 grid gap-10 rounded-xl border border-[#e0e0e0] p-5 sm:p-8 md:grid-cols-2"><section><h2 className="text-xl font-semibold">{text("Product details", "商品详情")}</h2><p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-[#666]">{product.description[lang]}</p></section><section><h2 className="flex items-center gap-2 text-xl font-semibold"><Ruler size={19} />{text("Fit & sizing", "尺码建议")}</h2><p className="mt-4 text-sm leading-relaxed text-[#666]">{text("Share your height, measurements and preferred fit with SnowForce. We can help you choose a size before ordering.", "告诉 SnowForce 你的身高、身体尺寸与喜好的版型，我们一起确认合适的尺码。")}</p><p className="mt-4 text-sm text-[#666]">WeChat: SnowForceClub</p></section></div>
    {related.length > 0 && <section className="py-12"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">{text("Complete your mountain kit", "继续搭配你的雪山装备")}</h2><Link href="/shop#catalog" className="flex min-h-11 items-center gap-2 text-sm text-[#0066cc]">{text("View all gear", "查看全部装备")}<ArrowRight size={16} /></Link></div><div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">{related.map((item) => <ProductCard key={item.id} product={item} presentation="catalog" />)}</div></section>}
    <Link href="/shop#catalog" className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm text-[#666]"><ArrowLeft size={16} />{text("Back to all gear", "返回全部装备")}</Link>
    <div className="shop-mobile-purchase"><p className="text-lg font-semibold">{price === null ? text("Unavailable", "暂不可售") : formatStorePrice(price, lang)}</p><a href="#product-options" className="btn-primary gap-2 text-sm"><ShoppingBag size={16} />{text("Choose options", "选择规格")}</a></div>
  </div>;
}
