"use client";

import { useEffect, useRef, useState } from "react";
import { PublicImage as Image } from "@/components/media/public-image";
import { Expand, X } from "lucide-react";
import { useLanguage } from "@/lib/language";
import type { StoreProduct } from "@/lib/shop/storefront";

export function ProductPhoto({ product }: { product: StoreProduct }) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [image, setImage] = useState(product.image);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, [expanded]);
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  return <>
    <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-[#f5f5f7]">
      <Image src={image} alt={product.name[lang]} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-contain" />
      <button className="absolute bottom-4 right-4 flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-xs shadow-sm" onClick={() => setExpanded(true)}><Expand size={16} />{text("View larger photo", "查看大图")}</button>
    </div>
    {product.images.length > 1 && <div className="mt-3 flex gap-3 overflow-x-auto">{product.images.map((url, index) => <button key={url} className={`relative h-20 w-16 shrink-0 overflow-hidden rounded-lg border ${image === url ? "border-[#0066cc]" : "border-[#ddd]"}`} onClick={() => setImage(url)} aria-label={text(`View photo ${index + 1}`, `查看图片 ${index + 1}`)} aria-pressed={image === url}><Image src={url} alt="" fill sizes="64px" className="object-contain" /></button>)}</div>}
    <dialog ref={dialog} className="shop-photo-dialog" aria-label={text("Product photo", "商品大图")} onCancel={() => setExpanded(false)} onClose={() => setExpanded(false)} onClick={(event) => { if (event.target === event.currentTarget) setExpanded(false); }}>
      <button autoFocus className="shop-icon-button absolute right-3 top-3 z-10" onClick={() => setExpanded(false)} aria-label={text("Close photo", "关闭大图")}><X size={20} /></button>
      <div className="relative h-[80dvh] w-full"><Image src={image} alt={product.name[lang]} fill sizes="90vw" className="object-contain" /></div>
    </dialog>
  </>;
}
