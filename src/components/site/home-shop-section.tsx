"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/shop/product-card";
import { useLanguage } from "@/lib/language";
import type { StoreProduct } from "@/lib/shop/storefront";

export function HomeShopSection({ products = [] }: { products?: StoreProduct[] }) {
  const { lang } = useLanguage();
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;

  return (
    <section id="gear-shop" aria-labelledby="home-shop-title" className="bg-white px-4 py-20 text-[#1d1d1f] sm:px-6 sm:py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[12px] font-semibold tracking-[.18em] text-[#666]">SNOWFORCE / GEAR SHOP</p>
            <h2 id="home-shop-title" className="mt-4 text-[36px] font-semibold leading-[1.12] tracking-tight sm:text-[48px]">
              {text("Gear for your next mountain day.", "下一趟滑行，装备就位。")}
            </h2>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-[#666]">
              {text("Snow apparel, goggles and little-rider essentials. Explore our gear collection and find the styles that fit your next ride.", "从雪服、雪镜到儿童装备，探索我们的品牌精选，为你和小滑手挑选合适的下一套装备。")}
            </p>
          </div>
          <Link href="/shop" className="btn-primary w-fit shrink-0 gap-4">
            {text("Explore the gear shop", "逛逛装备商城")}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        {products.length > 0 ? <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6">{products.slice(0, 3).map((product) => <ProductCard key={product.id} product={product} />)}</div> : <Link href="/shop" className="relative mt-10 block h-64 overflow-hidden rounded-xl sm:h-80"><Image src="/shop/mountain-editorial.webp" alt={text("Gear for mountain days", "雪山滑行装备")} fill sizes="(max-width: 1120px) 100vw, 1120px" className="object-cover" /><span className="absolute bottom-5 left-5 rounded-lg bg-black/70 px-5 py-3 text-sm text-white">{text("Explore the next collection", "探索新一季装备")}</span></Link>}
      </div>
    </section>
  );
}
