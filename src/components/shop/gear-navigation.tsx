"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { brandHref, categoryHref, collectionHref, navigationSections, type NavigationSection, type StoreCategory, type StoreNavigation } from "@/lib/shop/navigation";

function CategoryLinks({ categories, close }: { categories: StoreCategory[]; close: () => void }) {
  const { lang } = useLanguage();
  return <ul className="gear-menu-links">{categories.map(category => <li key={category.id}>
    <Link href={categoryHref(category)} onClick={close}>{category.label[lang]}</Link>
    {category.children.length > 0 && <CategoryLinks categories={category.children} close={close} />}
  </li>)}</ul>;
}

export function GearNavigation({ navigation, unavailable = false }: { navigation: StoreNavigation; unavailable?: boolean }) {
  const { lang } = useLanguage();
  const [active, setActive] = useState<NavigationSection | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const container = useRef<HTMLElement>(null);
  const triggers = useRef<Partial<Record<NavigationSection, HTMLButtonElement | null>>>({});
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  const close = () => setActive(null);
  useEffect(() => {
    if (!active) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) setActive(null); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); triggers.current[active]?.focus(); setActive(null); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [active]);
  const roots = navigation.categories.filter(category => category.section === active);
  const columns = roots.length === 1 && roots[0].children.length ? roots[0].children : roots;
  const collections = navigation.collections.filter(collection => collection.section === active || active === "sale" && navigation.promotions.some(offer => offer.collection_id === collection.id));
  const selected = navigationSections.find(section => section.id === active);
  const href = active === "sale" ? "/shop/sale" : active === "featured" ? "/shop/featured" : active === "brands" ? "/shop/brands" : `/shop/departments/${active}`;
  return <nav ref={container} aria-label={text("Gear shop navigation", "商城导航")} className="gear-navigation"
    onPointerLeave={event => { if (event.pointerType === "mouse") close(); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}>
    <div className="shop-container">
      <button type="button" className="gear-mobile-toggle" aria-expanded={mobileOpen} aria-controls="gear-sections" onClick={() => { setMobileOpen(value => !value); close(); }}>
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}{text("Shop departments", "选购分类")}
      </button>
      <ul id="gear-sections" className={`gear-section-list ${mobileOpen ? "gear-section-list-open" : ""}`}>
        {navigationSections.map(section => <li key={section.id}><button type="button" ref={node => { triggers.current[section.id] = node; }}
          className={section.id === "sale" ? "gear-sale-trigger" : undefined} aria-expanded={active === section.id} aria-controls={`gear-panel-${section.id}`}
          onClick={() => setActive(value => value === section.id ? null : section.id)}
          onPointerEnter={event => { if (event.pointerType === "mouse") setActive(section.id); }}>
          {section.label[lang]}<ChevronDown size={12} aria-hidden="true" />
        </button></li>)}
      </ul>
      {navigationSections.map(section => <div key={section.id} id={`gear-panel-${section.id}`} className="gear-mega-panel" hidden={active !== section.id}>
        {active === section.id && <>
          <div className="gear-menu-heading"><div><p className="shop-eyebrow">SNOWFORCE GEAR</p><h2>{selected?.label[lang]}</h2></div>
            <Link href={href} onClick={close}>{text("View all", "查看全部")} <span aria-hidden="true">→</span></Link>
          </div>
          {unavailable ? <p role="status">{text("Departments are temporarily unavailable. Please try again.", "分类暂时无法加载，请稍后重试。")}</p> : <div className="gear-menu-columns">
            {columns.map(category => <section key={category.id}><h3><Link href={categoryHref(category)} onClick={close}>{category.label[lang]}</Link></h3><CategoryLinks categories={category.children} close={close} /></section>)}
            {collections.map(collection => <section key={collection.id}><h3><Link href={collectionHref(collection)} onClick={close}>{collection.label[lang]}</Link></h3></section>)}
            {active === "brands" && ["A–F", "G–L", "M–R", "S–Z", "#"].map((group, index) => {
              const brands = navigation.brands.filter(brand => {
                const letter = brand[0].toUpperCase();
                return index === 4 ? !/^[A-Z]$/.test(letter) : letter >= ["A", "G", "M", "S"][index] && letter <= ["F", "L", "R", "Z"][index];
              });
              return brands.length > 0 ? <section key={group}><h3>{group}</h3><ul className="gear-menu-links">{brands.map(brand => <li key={brand}><Link href={brandHref(brand)} onClick={close}>{brand}</Link></li>)}</ul></section> : null;
            })}
            {active === "sale" && <section><h3><Link href="/shop/sale" onClick={close}>{text("Current markdowns", "当前特价")}</Link></h3><p>{text("Live sale prices. Promotion eligibility is confirmed in your cart.", "实时特价。促销适用条件将在购物车中核验。")}</p></section>}
            {active !== "brands" && active !== "sale" && columns.length === 0 && collections.length === 0 && <p>{text("New gear is on its way.", "新品即将上架。")}</p>}
            {active === "brands" && navigation.brands.length === 0 && <p>{text("Brands will appear as gear is published.", "商品发布后将显示对应品牌。")}</p>}
          </div>}
        </>}
      </div>)}
    </div>
  </nav>;
}
