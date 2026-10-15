"use client";
import { useLanguage } from "@/lib/language";
import { CartContents } from "./shop-provider";
export function CartPageView() {
  const { lang } = useLanguage();
  return <div className="shop-container py-10 sm:py-14"><p className="shop-eyebrow">SNOWFORCE / GEAR</p><h1 className="mb-8 mt-3 text-3xl font-semibold">{lang === "zh" ? "你的购物车" : "Your gear cart"}</h1><CartContents presentation="page" /></div>;
}
