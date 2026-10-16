"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Minus, Plus, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { applyShopPromotionAction, changeShopCartAction, getShopCartAction } from "@/lib/shop/cart-actions";
import type { CartResult, CommerceCart } from "@/lib/shop/commerce-cart";
import { formatStorePrice } from "@/lib/shop/storefront";
import { LoadingSpinner, LoadingStatus } from "./loading-status";
import { CartCheckoutNotice } from "./cart-checkout-notice";

type CartContext = { state: CartResult; busy: boolean; error: CartResult["status"] | null; open: () => void; syncCheckout: (cart: CommerceCart) => void; reload: () => Promise<void>; add: (variantId: string, quantity: number) => Promise<boolean>; update: (itemId: string, quantity: number) => Promise<boolean>; remove: (itemId: string) => Promise<boolean>; promotion: (code: string, remove?: boolean) => Promise<boolean> };
const Context = createContext<CartContext | null>(null);
export function useShopCart() { const context = useContext(Context); if (!context) throw new Error("Shop cart requires ShopProvider"); return context; }

export function CartContents({ onContinue, presentation = "drawer" }: { onContinue?: () => void; presentation?: "drawer" | "page" }) {
  const { lang } = useLanguage();
  const { state, error, busy, update, remove, reload, promotion } = useShopCart();
  const [code, setCode] = useState("");
  const codeInputId = useId();
  const [promotionStatus, setPromotionStatus] = useState<"applied" | "rejected" | null>(null);
  const [pending, setPending] = useState<{ kind: "remove" | "update" | "promotion" | "refresh"; id?: string } | null>(null);
  const pendingRef = useRef(false);
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  const cart = state.status === "ready" ? state.cart : null;
  async function run(operation: NonNullable<typeof pending>, action: () => Promise<boolean | void>) {
    if (busy || pendingRef.current) return false;
    pendingRef.current = true; setPending(operation);
    try { return await action(); }
    finally { pendingRef.current = false; setPending(null); }
  }
  const pendingText = pending?.kind === "remove" ? text("Removing item…", "正在删除商品…")
    : pending?.kind === "promotion" ? text("Updating promotion…", "正在更新折扣…")
    : pending?.kind === "refresh" ? text("Refreshing cart…", "正在刷新购物车…")
    : text("Updating cart…", "购物车更新中…");
  const working = busy || pending !== null;
  return <div aria-busy={working} className={presentation === "page" ? "cart-full" : undefined}>
    {error === "checkout-locked" ? <CartCheckoutNotice onContinue={onContinue} /> : error && <div role="alert" className="my-5 rounded-lg bg-[#f5f5f7] p-4 text-sm">{error === "sales-disabled" ? text("Shopping is temporarily paused. You can browse gear; please check back later to purchase.", "商城暂未开放购买。你可以继续浏览装备，请稍后再来选购。") : error === "not-configured" ? text("Delivery is being prepared. Please try again later.", "配送服务正在准备中，请稍后再试。") : error === "rejected" || error === "invalid" ? text("The cart couldn't be updated. Stock or price may have changed; refresh your cart before trying again.", "购物车未能更新，库存或价格可能已变化。请刷新购物车后重试。") : text("The cart is temporarily unavailable. Please try again.", "购物车暂时无法加载，请重试。")}</div>}
    {working && !cart ? <div className="py-14 text-center"><LoadingStatus>{text("Loading your cart…", "正在加载购物车…")}</LoadingStatus></div>
      : state.status === "signed-out" ? <div className="py-14 text-center"><ShoppingBag size={34} className="mx-auto text-[#777]" /><h3 className="mt-5 text-xl font-medium">{text("Your SnowForce account, your gear cart", "使用 SnowForce 账号选购装备")}</h3><p className="mt-3 text-sm text-[#666]">{text("Sign in with your existing account to keep your cart and manage orders.", "登录现有账号，保存购物车并管理订单。")}</p><Link href="/member?next=%2Fshop%2Fcart" onClick={onContinue} className="btn-primary mt-6">{text("Sign in", "登录账号")}</Link></div>
      : state.status !== "ready" ? <div className="py-14 text-center"><p>{text("Loading your cart is currently unavailable.", "暂时无法读取购物车。")}</p><button className="btn-primary mt-5 gap-2" disabled={working} onClick={() => void run({ kind: "refresh" }, reload)}>{working && <LoadingSpinner />}{text("Try again", "重试")}</button></div>
      : !cart?.items.length ? <div className="py-14 text-center"><ShoppingBag size={34} className="mx-auto text-[#777]" /><p>{text("Your next mountain kit starts here.", "从这里开始，准备你的下一次雪山之旅。")}</p><Link href="/shop#catalog" onClick={onContinue} className="btn-primary mt-6">{text("Explore gear", "浏览装备")}</Link></div>
      : <div className="cart-layout"><div className="cart-items">
        <ul className="divide-y divide-[#e0e0e0]">{cart.items.map((item) => <li key={item.id} className="flex gap-4 py-5" aria-busy={working && pending?.id === item.id}>
          <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-[#f5f5f7]"><Image src={item.image} alt={item.name} fill sizes="80px" className="object-contain" /></div>
          <div className="min-w-0 flex-1">{item.slug ? <Link href={`/shop/${item.slug}`} onClick={onContinue} className="font-medium hover:underline">{item.name}</Link> : <p className="font-medium">{item.name}</p>}<p className="mt-2 text-sm text-[#666]">{item.variant}</p><p className="mt-2 text-sm">{formatStorePrice(item.unitPrice, lang)} <span className="text-xs text-[#777]">{text("/ item", "/ 件")}</span></p>
            <div className="mt-3 flex items-center justify-between gap-2"><div className="flex items-center gap-3"><button className="shop-icon-button" disabled={working || item.quantity === 1} aria-label={text(`Decrease quantity for ${item.name}`, `减少${item.name}数量`)} onClick={() => void run({ kind: "update", id: item.id }, () => update(item.id, item.quantity - 1))}><Minus size={14} /></button><span>{working && pending?.kind === "update" && pending.id === item.id ? <LoadingSpinner /> : item.quantity}</span><button className="shop-icon-button" disabled={working || item.quantity >= 99} aria-label={text(`Increase quantity for ${item.name}`, `增加${item.name}数量`)} onClick={() => void run({ kind: "update", id: item.id }, () => update(item.id, item.quantity + 1))}><Plus size={14} /></button></div><button className="shop-icon-button" disabled={working} aria-label={text(`Remove ${item.name}`, `移除${item.name}`)} onClick={() => void run({ kind: "remove", id: item.id }, () => remove(item.id))}>{working && pending?.kind === "remove" && pending.id === item.id ? <LoadingSpinner /> : <Trash2 size={16} />}</button></div>
            <p className="mt-3 text-right text-sm font-semibold">{formatStorePrice(item.unitPrice * item.quantity, lang)}</p>
          </div>
        </li>)}</ul>
        <form className="my-5 border-t border-[#e0e0e0] pt-5" onSubmit={async event => { event.preventDefault(); if (working) return; setPromotionStatus(null); const applied = await run({ kind: "promotion" }, () => promotion(code.trim())); setPromotionStatus(applied ? "applied" : "rejected"); if (applied) setCode(""); }}>
          <label htmlFor={codeInputId} className="text-sm font-medium">{text("Promotion code", "折扣码")}</label><div className="mt-2 flex gap-2"><input id={codeInputId} name="promotionCode" value={code} disabled={working} onChange={event => { setCode(event.target.value); setPromotionStatus(null); }} maxLength={100} autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-[#d2d2d7] px-3 py-3 text-sm" /><button type="submit" disabled={working || !code.trim()} className="btn-primary gap-2 disabled:opacity-50">{working && pending?.kind === "promotion" && <LoadingSpinner />}{text("Apply", "使用")}</button></div>
          {promotionStatus && error !== "checkout-locked" && <p role={promotionStatus === "rejected" ? "alert" : "status"} className="mt-3 text-xs">{promotionStatus === "applied" ? text("Code applied. Review your updated savings below.", "折扣码已使用，请查看下方更新后的优惠金额。") : text("This code could not be applied. Check its expiry, minimum spend and account eligibility.", "此码无法使用，请核对有效期、最低消费及账户资格。")}</p>}
          {!!cart.promotionCodes?.length && <ul className="mt-3 space-y-2">{cart.promotionCodes.map(activeCode => <li key={activeCode} className="flex items-center gap-3 text-xs"><code className="break-all">{activeCode}</code><button type="button" disabled={working} onClick={async () => { setPromotionStatus(null); if (!await run({ kind: "promotion", id: activeCode }, () => promotion(activeCode, true))) setPromotionStatus("rejected"); }} className="min-h-11 shrink-0 text-[#0066cc] underline">{working && pending?.id === activeCode && <LoadingSpinner className="mr-2" />}{text("Remove code", "移除折扣码")}</button></li>)}</ul>}
        </form>
        </div><aside className="cart-summary"><h2 className="mb-5 text-xl font-semibold">{text("Order summary", "订单核对")}</h2><dl className="space-y-3 border-t border-[#e0e0e0] py-5 text-sm"><div className="flex justify-between"><dt>{text("Subtotal", "商品小计")}</dt><dd>{formatStorePrice(cart.subtotal, lang)}</dd></div>{cart.discountTotal > 0 && <div className="flex justify-between"><dt>{text("Discount", "优惠")}</dt><dd>−{formatStorePrice(cart.discountTotal, lang)}</dd></div>}<div className="flex justify-between"><dt>{text("Tax", "税费")}</dt><dd>{text("Calculated at checkout", "结账时计算")}</dd></div><div className="flex justify-between"><dt>{text("Shipping", "运费")}</dt><dd>{text("Calculated at checkout", "结账时计算")}</dd></div></dl>
        <p className="text-xs leading-relaxed text-[#666]">{text("Stock is checked when your cart changes and at checkout. Adding gear doesn't reserve it.", "购物车更新及结账时会重新核验库存，加入购物车不会锁定库存。")}</p>
        <Link className="btn-primary mt-5 w-full aria-disabled:opacity-50" href="/shop/checkout" aria-disabled={working} onClick={event => { if (working) { event.preventDefault(); return; } onContinue?.(); }}>{text("Proceed to checkout", "前往结账")}</Link>
        <button className="mt-4 min-h-11 text-sm text-[#0066cc] underline" disabled={working} onClick={() => void run({ kind: "refresh" }, reload)}>{working && pending?.kind === "refresh" && <LoadingSpinner className="mr-2" />}{text("Refresh cart", "刷新购物车")}</button>
      </aside></div>}
    <p role="status" className="mt-3 text-sm text-[#666]">{working && cart ? <LoadingStatus announce={false}>{pendingText}</LoadingStatus> : ""}</p>
  </div>;
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const { lang } = useLanguage();
  const pathname = usePathname();
  const [checkoutEntry] = useState(() => pathname?.startsWith("/shop/checkout") ?? false);
  const [state, setState] = useState<CartResult>({ status: "ready", cart: null });
  const [busy, setBusy] = useState(!checkoutEntry);
  const [error, setError] = useState<CartResult["status"] | null>(null);
  const [opened, setOpened] = useState(false);
  const active = useRef(!checkoutEntry);
  const dialog = useRef<HTMLDialogElement>(null);
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  const perform = useCallback(async (operation: () => Promise<CartResult>) => {
    if (active.current) return false;
    active.current = true; setBusy(true); setError(null);
    try {
      const next = await operation();
      if (next.status === "ready" || next.status === "signed-out") setState(next);
      else setError(next.status);
      return next.status === "ready";
    } catch { setError("unavailable"); return false; }
    finally { active.current = false; setBusy(false); }
  }, []);
  const reload = useCallback(async () => { await perform(getShopCartAction); }, [perform]);
  const syncCheckout = useCallback((cart: CommerceCart) => { setState({ status: "ready", cart }); }, []);
  useEffect(() => {
    // Checkout already authenticates and returns the cart. Next queues client
    // Server Actions, so another mount read would delay checkout itself.
    if (checkoutEntry) return;
    let current = true;
    void getShopCartAction()
      .then((next) => {
        if (!current) return;
        if (next.status === "ready" || next.status === "signed-out") setState(next);
        else setError(next.status);
      })
      .catch(() => { if (current) setError("unavailable"); })
      .finally(() => {
        if (current) { active.current = false; setBusy(false); }
      });
    return () => { current = false; };
  }, [checkoutEntry]);
  useEffect(() => {
    if (!opened) return;
    const element = dialog.current; element?.showModal();
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, [opened]);
  const count = state.status === "ready" ? state.cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0 : 0;
  return <Context.Provider value={{ state, busy, error, reload, syncCheckout, open: () => setOpened(true), add: async (variantId, quantity) => { const done = await perform(() => changeShopCartAction({ kind: "add", variantId, quantity })); setOpened(true); return done; }, update: (itemId, quantity) => perform(() => changeShopCartAction({ kind: "update", itemId, quantity })), remove: (itemId) => perform(() => changeShopCartAction({ kind: "remove", itemId })), promotion: (code, remove = false) => perform(() => applyShopPromotionAction({ code, remove })) }}>
    <div className="shop-shell"><div className="shop-local-nav"><div className="shop-container flex min-h-16 items-center justify-between gap-3 py-3"><Link href="/shop" className="text-base font-semibold tracking-tight sm:text-lg">{text("Gear shop", "装备商城")}<span className="ml-3 hidden text-xs font-normal tracking-widest text-[#777] sm:inline">SNOWFORCE</span></Link><div className="flex items-center gap-2 sm:gap-5"><Link href="/shop#catalog" className="hidden min-h-11 items-center gap-2 text-sm text-[#666] sm:flex"><Search size={17} />{text("Browse all gear", "浏览全部装备")}</Link><button className="shop-pill shop-bag-button" onClick={() => setOpened(true)}>{busy ? <LoadingSpinner /> : <ShoppingBag size={17} aria-hidden="true" />}{text("Cart", "购物车")}<span className="shop-count">{count}</span></button></div></div></div>{children}
      <dialog ref={dialog} className="shop-dialog" aria-labelledby="cart-title" onCancel={() => setOpened(false)} onClose={() => setOpened(false)} onClick={(event) => { if (event.target === event.currentTarget) setOpened(false); }}><div className="flex items-start justify-between gap-4 border-b border-[#e0e0e0] pb-5"><div><p className="shop-eyebrow">SNOWFORCE / GEAR</p><h2 id="cart-title" className="mt-2 text-2xl font-semibold">{text("Your gear cart", "你的购物车")}</h2></div><button autoFocus className="shop-icon-button" aria-label={text("Close cart", "关闭购物车")} onClick={() => setOpened(false)}><X size={22} /></button></div>{opened && <CartContents onContinue={() => setOpened(false)} />}</dialog>
    </div>
  </Context.Provider>;
}
