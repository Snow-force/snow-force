"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { formatStorePrice, type StoreProduct } from "@/lib/shop/storefront";
import { isDiscountedProduct } from "@/lib/shop/navigation";

export function ProductCard({ product, presentation = "editorial" }: { product: StoreProduct; presentation?: "editorial" | "catalog" }) {
  const { lang } = useLanguage();
  const compact = presentation === "catalog";
  return <article className={compact ? "overflow-hidden rounded-xl border border-[#e0e0e0] bg-white" : undefined}>
    <Link href={`/shop/${product.slug}`} className="group block rounded-[18px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0071e3]">
      <div className={`relative overflow-hidden bg-[#f5f5f7] ${compact ? "aspect-square" : "aspect-[4/5] rounded-[18px]"}`}>
        <Image src={product.image} alt={product.name[lang]} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-contain transition duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
        {isDiscountedProduct(product) && <span className="absolute left-3 top-3 rounded bg-white px-2 py-1 text-xs font-medium">{lang === "zh" ? "部分规格特价" : "Sale on selected options"}</span>}
        <span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-white"><ArrowUpRight size={18} aria-hidden="true" /></span>
      </div>
      <div className={compact ? "px-3 pt-4 sm:px-4" : "pt-4"}><p className="text-[11px] font-semibold leading-relaxed tracking-[.13em] text-[#666]">{product.brand}</p><h3 className={`mt-2 font-medium leading-snug group-hover:text-[#0066cc] ${compact ? "line-clamp-2 min-h-10 text-sm sm:min-h-11" : "text-[16px]"}`}>{product.name[lang]}</h3></div>
    </Link>
    <div className={compact ? "px-3 pb-3 sm:px-4 sm:pb-4" : undefined}>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className={compact ? "text-lg font-semibold" : "text-base font-semibold"}>{product.price === null ? (lang === "zh" ? "暂不可售" : "Currently unavailable") : formatStorePrice(product.price, lang)}</span><span className="text-[11px] text-[#666]">USD</span></div>
      <p className="mt-2 text-xs text-[#666]">{product.available ? (lang === "zh" ? "可加入购物车" : "Available to order") : (lang === "zh" ? "暂时缺货" : "Currently out of stock")}</p>
      {compact && <Link href={`/shop/${product.slug}`} className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#ddd] text-xs font-medium hover:border-[#0066cc] hover:text-[#0066cc]" aria-label={lang === "zh" ? `选购${product.name.zh}` : `Choose ${product.name.en}`}>{lang === "zh" ? "选择款式" : "Choose options"}<ArrowUpRight size={14} /></Link>}
    </div>
  </article>;
}
