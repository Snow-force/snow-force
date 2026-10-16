"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { LockKeyhole, MapPin, Truck } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { changeShopCheckoutAction, getShopCheckoutAction } from "@/lib/shop/checkout-actions";
import { cancelUnpaidCartPaymentAction, previewShopPaymentCancellationAction } from "@/lib/shop/cart-actions";
import { checkoutAddressSchema, checkoutPickupContactSchema, type CheckoutResult, type CheckoutReview, type CheckoutAddress } from "@/lib/shop/checkout";
import { usStates } from "@/lib/shop/shipping-addresses";
import { formatStorePrice } from "@/lib/shop/storefront";
import { shopPolicySections, type ShopPolicySection, type ShopPublishedPolicy } from "@/lib/shop/policies";
import { useShopCart } from "./shop-provider";
import { LoadingSpinner, LoadingStatus } from "./loading-status";
import { CancelPaymentDialog, type CancelPaymentPrompt } from "./cancel-payment-dialog";
import { PendingFeedback } from "./pending-feedback";

const StripeCheckoutForm = dynamic(() => import("./stripe-checkout-form"), { ssr: false, loading: () => <LoadingStatus>Loading secure payment… / 正在加载付款…</LoadingStatus> });
type PendingOperation = "loading" | "saving" | "payment" | "checking" | "completing";
const blank: CheckoutAddress = { name: "", phone: "", address1: "", address2: "", city: "", state: "", postalCode: "", countryCode: "US" };
const policySectionTitles: Record<ShopPolicySection, { en: string; zh: string }> = {
  shipping: { en: "Shipping", zh: "配送" },
  requests: { en: "Return and exchange requests", zh: "退换货申请" },
  conditions: { en: "Item conditions", zh: "商品条件" },
  shipping_costs: { en: "Shipping costs", zh: "运费处理" },
  refunds: { en: "Refunds and exchanges", zh: "退款与换货" },
  return_address: { en: "Return address", zh: "退货地址" },
  consumer_rights: { en: "Consumer rights", zh: "消费者权利" },
};
function CheckoutPolicyTerms({ policy, lang }: { policy: ShopPublishedPolicy; lang: "en" | "zh" }) {
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  const terms = policy.content.terms;
  return <details className="mt-4 rounded-lg border border-[#d2d2d7] p-4 text-sm">
    <summary className="cursor-pointer font-medium">{text(`Read shipping, returns and refunds · Version ${policy.version}`, `查看配送、退换货及退款条款 · 版本 ${policy.version}`)}</summary>
    <div className="mt-5 max-h-80 space-y-5 overflow-y-auto overscroll-contain pr-3 leading-relaxed" tabIndex={0} role="region" aria-label={text("Full policy terms", "完整政策条款")}>
      <div><p>{text("Seller", "销售主体")}: {policy.content.seller_name}</p><p>{text("Customer service", "客服邮箱")}: <a className="text-[#0066cc] underline" href={`mailto:${policy.content.customer_service_email}`}>{policy.content.customer_service_email}</a></p><p>{text("Effective date", "生效日期")}: <time dateTime={policy.effective_at}>{new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(policy.effective_at))}</time></p></div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="font-medium">{text("Request after delivery", "送达后申请期限")}</dt><dd>{text(`${terms.return_window_days} days`, `${terms.return_window_days} 天`)}</dd></div>
        <div><dt className="font-medium">{text("Dispatch after approval", "批准后交运期限")}</dt><dd>{text(`${terms.approved_dispatch_days} days`, `${terms.approved_dispatch_days} 天`)}</dd></div>
        <div><dt className="font-medium">{text("Request review", "申请审核")}</dt><dd>{text(`${terms.review_business_days} business days`, `${terms.review_business_days} 个工作日`)}</dd></div>
        <div><dt className="font-medium">{text("Refund initiation after inspection", "检查通过后发起退款")}</dt><dd>{text(`${terms.refund_business_days} business days`, `${terms.refund_business_days} 个工作日`)}</dd></div>
        <div><dt className="font-medium">{text("Estimated processing", "预计订单处理")}</dt><dd>{text(`${terms.processing_business_days_min}–${terms.processing_business_days_max} business days`, `${terms.processing_business_days_min}–${terms.processing_business_days_max} 个工作日`)}</dd></div>
        <div><dt className="font-medium">{text("Estimated carrier transit", "预计承运商配送")}</dt><dd>{text(`${terms.transit_business_days_min}–${terms.transit_business_days_max} business days`, `${terms.transit_business_days_min}–${terms.transit_business_days_max} 个工作日`)}</dd></div>
      </dl>
      {shopPolicySections.map((section) => <section key={section}><h3 className="font-semibold">{policySectionTitles[section][lang]}</h3><p className="mt-2 whitespace-pre-line">{policy.content.copy[section][lang]}</p></section>)}
      <Link className="inline-block min-h-11 py-3 text-[#0066cc] underline" href="/shop/policies">{text("Shop policies page", "商城政策页面")}</Link>
    </div>
  </details>;
}
export function CheckoutView({ completing = false }: { completing?: boolean }) {
  return <CheckoutFlow key={completing ? "return" : "review"} completing={completing} />;
}

function CheckoutFlow({ completing }: { completing: boolean }) {
  const { lang } = useLanguage();
  const { reload: reloadCart, syncCheckout } = useShopCart();
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [review, setReview] = useState<CheckoutReview | null>(null);
  const [address, setAddress] = useState<CheckoutAddress>(blank);
  const [deliveryMode, setDeliveryMode] = useState<"delivery" | "pickup">("delivery");
  const [appointmentConfirmed, setAppointmentConfirmed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [pending, setPending] = useState<PendingOperation>(completing ? "completing" : "loading");
  const [stripeBusy, setStripeBusy] = useState(false);
  const [error, setError] = useState<CheckoutResult["status"] | null>(null);
  const [acceptance, setAcceptance] = useState<{ fingerprint: string; policyVersion: number } | null>(null);
  const [quoteTime, setQuoteTime] = useState(() => Date.now());
  const [cancelPrompt, setCancelPrompt] = useState<CancelPaymentPrompt | null>(null);
  const [cancelUncertain, setCancelUncertain] = useState(false);
  const [cancelNotice, setCancelNotice] = useState<"blocked" | "unavailable" | null>(null);
  const active = useRef(true);
  const stripeActive = useRef(false);
  const paymentGeneration = useRef(0);
  const automaticAttempt = useRef("");
  const draftRevision = useRef(0);
  const markDraftChanged = () => { draftRevision.current += 1; setAcceptance(null); };
  const currentPaymentGeneration = paymentGeneration.current;
  const paymentBusyChanged = useCallback((pending: boolean) => { stripeActive.current = pending; setStripeBusy(pending); }, []);
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  const pendingText = pending === "saving" ? text("Saving your checkout details… This may take a few moments.", "正在保存并核对结账信息，请稍候…")
    : pending === "payment" ? text("Preparing secure payment…", "正在准备安全付款…")
    : pending === "checking" ? text("Checking payment status…", "正在检查付款状态…")
    : pending === "completing" ? text("Verifying your order…", "正在核验订单…")
    : text("Checking checkout…", "正在检查结账信息…");
  const addressDirty = !!review && ((deliveryMode === "pickup") !== !!review.pickupSelected || JSON.stringify(address) !== JSON.stringify(review.address ?? blank) || (deliveryMode === "pickup" && !appointmentConfirmed));
  const policyPreviouslyAccepted = !!review?.policy && review.paymentStarted && review.policyAccepted;
  const policyAgreed = !!review?.policy && (policyPreviouslyAccepted || (acceptance !== null && acceptance.fingerprint === review.fingerprint && acceptance.policyVersion === review.policy.version));
  const quoteReady = !addressDirty && !!review?.taxQuote?.ready && (review.paymentStarted || quoteTime < review.taxQuote.expiresAt * 1000);
  useEffect(() => {
    if (!review?.taxQuote || review.paymentStarted) return;
    const timeout = window.setTimeout(() => setQuoteTime(Date.now()), Math.max(0, Math.min(2_147_483_647, review.taxQuote.expiresAt * 1000 - Date.now())));
    return () => window.clearTimeout(timeout);
  }, [review?.taxQuote, review?.paymentStarted]);
  const apply = useCallback((next: CheckoutResult, preserveDetails = false) => {
    paymentGeneration.current += 1;
    if (["invalid", "rejected", "unavailable", "not-configured", "stale-details"].includes(next.status)) { setError(next.status); if (!review) setResult(next); return; }
    setResult(next); setError(null);
    if (next.status === "review") {
      syncCheckout(next.cart); setReview(next);
      if (!preserveDetails) { setAddress(next.address ?? blank); setDeliveryMode(next.pickupSelected ? "pickup" : "delivery"); setAppointmentConfirmed(!!next.pickupSelected); }
      setAcceptance((previous) => next.paymentCheck !== "unlocked" && next.policy && previous !== null && previous.fingerprint === next.fingerprint && previous.policyVersion === next.policy.version ? previous : null);
    }
    if (next.status === "complete") void reloadCart();
  }, [reloadCart, review, syncCheckout]);
  const perform = useCallback(async (operation: () => Promise<CheckoutResult>, invalidateQuote = false, phase: PendingOperation = invalidateQuote ? "saving" : "loading", keepDraft = false) => {
    if (active.current) return;
    const startedRevision = draftRevision.current;
    active.current = true; setPending(phase); setBusy(true); setError(null);
    if (invalidateQuote) {
      setAcceptance(null);
      setReview(previous => previous ? { ...previous, taxQuote: previous.taxQuote ? { ...previous.taxQuote, ready: false } : null } : null);
    }
    try { apply(await operation(), keepDraft || phase === "saving" && startedRevision !== draftRevision.current); } catch { setError("unavailable"); }
    finally { active.current = false; setBusy(false); }
  }, [apply]);
  useEffect(() => {
    if (!review || busy || review.paymentStarted || !review.configured || error || result?.status !== "review") return;
    const contact = { name: address.name, phone: address.phone, appointmentConfirmed };
    const needsDetails = deliveryMode === "pickup" ? addressDirty && checkoutPickupContactSchema.safeParse(contact).success : checkoutAddressSchema.safeParse(address).success && (addressDirty || !review.selectedOptionId && review.options.length === 1);
    const needsQuote = !addressDirty && !!review.selectedOptionId && !quoteReady;
    if (!needsDetails && !needsQuote) return;
    const version = review.detailsVersion ? { version: review.detailsVersion } : {};
    const key = JSON.stringify({ deliveryMode, address, appointmentConfirmed, version, details: needsDetails, expires: review.taxQuote?.expiresAt ?? null });
    if (automaticAttempt.current === key) return;
    const timer = window.setTimeout(() => {
      automaticAttempt.current = key;
      void perform(() => changeShopCheckoutAction(needsDetails ? deliveryMode === "pickup" ? { kind: "pickup-review", contact, ...version } : { kind: "delivery", address, ...version } : { kind: "quote" }), true);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [review, busy, error, result?.status, deliveryMode, address, appointmentConfirmed, addressDirty, quoteReady, perform]);
  const checkPayment = async () => {
    if (active.current || stripeActive.current) return;
    paymentGeneration.current += 1;
    setAcceptance(null);
    // Remove the old Elements instance before checking; errors cannot restore its client secret.
    setResult({ status: "processing" });
    await perform(() => changeShopCheckoutAction({ kind: "recover" }), false, "checking");
  };
  const previewCancellation = async () => {
    if (active.current || stripeActive.current) return;
    active.current = true; setBusy(true); setPending("checking"); setCancelNotice(null);
    try {
      const next = await previewShopPaymentCancellationAction();
      if (next.status === "checkout-locked" && next.cancellation?.status === "confirmation-required") {
        setCancelPrompt({ token: next.cancellation.token, amountCents: next.cancellation.amountCents }); setCancelUncertain(false);
      } else setCancelNotice(next.status === "checkout-locked" && next.cancellation?.status === "blocked" ? "blocked" : "unavailable");
    } catch { setCancelNotice("unavailable"); }
    finally { active.current = false; setBusy(false); }
  };
  const confirmCancellation = async (prompt: CancelPaymentPrompt) => {
    if (active.current || stripeActive.current) return;
    // Discard the old Elements instance before cancellation starts. A pending
    // outcome must never bring back its client secret or consent.
    paymentGeneration.current += 1; setResult({ status: "processing" }); setAcceptance(null);
    setCancelUncertain(true);
    await perform(async () => {
      const next = await cancelUnpaidCartPaymentAction({ token: prompt.token, confirmed: true });
      if (next.status === "ready") { setCancelPrompt(null); setCancelUncertain(false); return getShopCheckoutAction(); }
      if (next.status === "checkout-locked" && next.cancellation?.status === "blocked") { setCancelPrompt(null); setCancelNotice("blocked"); }
      return { status: "processing" };
    }, true, "checking");
  };
  useEffect(() => {
    let current = true;
    // Stripe may append a client secret on return. Never use or retain it as proof of payment.
    if (completing) window.history.replaceState(window.history.state, "", "/shop/checkout/return");
    const operation = completing ? changeShopCheckoutAction({ kind: "complete" }) : getShopCheckoutAction();
    void operation.then((next) => { if (current) { setResult(next); if (next.status === "review") { syncCheckout(next.cart); setReview(next); setAddress(next.address ?? blank); setDeliveryMode(next.pickupSelected ? "pickup" : "delivery"); setAppointmentConfirmed(!!next.pickupSelected); } if (next.status === "complete") void reloadCart(); } }).catch(() => { if (current) setError("unavailable"); }).finally(() => { if (current) { active.current = false; setBusy(false); } });
    return () => { current = false; paymentGeneration.current += 1; };
  }, [completing, reloadCart, syncCheckout]);
  const displayError = error ?? (result && ["invalid", "rejected", "unavailable", "not-configured", "stale-details"].includes(result.status) ? result.status : null);
  const draftVersion = review?.detailsVersion ? { version: review.detailsVersion } : {};
  const detailsLocked = (busy && !(pending === "saving" && review?.detailsVersion)) || !!review?.paymentStarted || !review?.configured || stripeBusy;
  const field = (name: keyof Omit<CheckoutAddress, "countryCode" | "state">, en: string, zh: string, autoComplete: string, maxLength: number, optional = false) => <label className="flex flex-col gap-2 text-sm font-medium">{text(en, zh)}<input className="min-h-12 rounded-lg border border-[#d2d2d7] bg-white px-3 font-normal" name={name} value={address[name]} required={!optional} maxLength={maxLength} autoComplete={autoComplete} disabled={detailsLocked} onChange={(event) => { markDraftChanged(); setAddress((previous) => ({ ...previous, [name]: event.target.value })); }} /></label>;
  return <div className="shop-container checkout-main" role="region" aria-label={text("Checkout", "结账")} aria-busy={busy || stripeBusy}>
    <Link className="text-sm text-[#0066cc]" href="/shop/cart">← {text("Back to cart", "返回购物车")}</Link>
    <div className="checkout-heading"><div><p className="shop-eyebrow">SNOWFORCE / CHECKOUT</p><h1>{text("Checkout", "结账")}</h1></div><p><LockKeyhole size={15} aria-hidden="true" />{text("Secure checkout · USD", "安全结账 · 美元结算")}</p></div>
    <CancelPaymentDialog prompt={cancelPrompt} busy={busy} uncertain={cancelUncertain} dismiss={() => { setCancelPrompt(null); if (cancelUncertain) void checkPayment(); }} confirm={confirmCancellation} />
    {(busy || stripeBusy) && !cancelPrompt && <PendingFeedback kind={stripeBusy || ["payment", "checking", "completing"].includes(pending) ? "payment" : "checkout"} />}
    {(result?.status === "payment" || result?.status === "processing" || review?.paymentStarted) && result?.status !== "complete" && <button type="button" className="mt-4 min-h-11 text-sm text-[#0066cc] underline" disabled={busy || stripeBusy} onClick={() => void previewCancellation()}>{text("Cancel unfinished payment & edit checkout", "取消未完成付款并修改结账")}</button>}
    {cancelNotice && <p role="alert" className="mt-3 text-sm">{cancelNotice === "blocked" ? text("This payment cannot be canceled here. Check its current payment or order status before making changes.", "这笔付款暂不能在此取消。请先核对付款或订单状态，再修改订单。") : text("Cancellation could not be verified. Check payment status and try again.", "暂时无法核实取消条件，请检查付款状态后重试。")}</p>}
    {busy && review && <p role="status" className="mt-5 rounded-lg bg-[#f0f7ff] p-4 text-sm"><LoadingSpinner className="mr-2" />{pendingText}</p>}
    {displayError && <div role="alert" className="mt-6 rounded-lg bg-[#f5f5f7] p-4 text-sm">{displayError === "stale-details" ? text("Receiving details changed in another tab. Your draft is kept; review the saved details before trying again.", "其他页面已修改收货信息。当前草稿已保留，请先核对最新保存的信息，再决定是否重试。") : displayError === "not-configured" ? text("Delivery or payments are being prepared. Checkout isn't available yet.", "配送或付款服务正在准备中，暂时无法结账。") : displayError === "invalid" ? text("Check the address and shipping selection.", "请检查收货地址和配送选择。") : displayError === "rejected" ? text("Your checkout could not be verified. Refresh the details; check payment status before paying again.", "暂时无法核实结账信息。请刷新信息，再次付款前先检查付款状态。") : text("We couldn't load checkout. Please try again.", "暂时无法加载结账信息，请重试。")}<button className="ml-3 min-h-11 text-[#0066cc] underline" disabled={busy || stripeBusy} onClick={() => { automaticAttempt.current = ""; void perform(getShopCheckoutAction); }}>{busy && pending === "loading" && <LoadingSpinner className="mr-2" />}{displayError === "stale-details" ? text("Use latest saved details", "使用最新保存的信息") : text("Refresh", "刷新")}</button>{displayError === "stale-details" && <button className="ml-3 min-h-11 text-[#0066cc] underline" disabled={busy || stripeBusy} onClick={() => { automaticAttempt.current = ""; void perform(getShopCheckoutAction, false, "loading", true); }}>{text("Keep my details & retry", "保留当前草稿并重试")}</button>}</div>}
    {(displayError || result?.status === "processing" || result?.status === "payment" || (result?.status === "review" && review?.paymentStarted)) && <div className="mt-5"><button className="min-h-11 text-sm text-[#0066cc] underline" disabled={busy || stripeBusy} onClick={() => void checkPayment()}>{busy && pending === "checking" && <LoadingSpinner className="mr-2" />}{text("Check payment status", "检查付款状态")}</button>{busy && !review && <p role="status" className="mt-2 text-sm"><LoadingSpinner className="mr-2" />{pendingText}</p>}</div>}
    {result?.status === "review" && review?.paymentCheck && <p role="status" className="mt-4 text-sm leading-relaxed">{review.paymentCheck === "unlocked" ? text("The previous payment was canceled. Review your checkout and agree to the current policy before starting a new payment.", "之前的付款已取消。请重新核对结账信息并同意当前政策，再开始新的付款。") : text("Your original payment is still active. Continue that payment or check order status if it is processing.", "原付款仍有效，请继续原付款；如正在处理，请检查订单状态。")}</p>}
    {!result && !displayError && <p role="status" className="mt-8"><LoadingSpinner className="mr-2" />{completing ? text("Verifying your order…", "正在核验订单…") : text("Loading checkout…", "正在加载结账信息…")}</p>}
    {result?.status === "signed-out" && <div className="mt-8"><p>{text("Sign in with your SnowForce account to checkout.", "请使用 SnowForce 会员账号登录后结账。")}</p><Link className="btn-primary mt-5" href={`/member?next=${encodeURIComponent(completing ? "/shop/checkout/return" : "/shop/checkout")}`}>{text("Sign in", "会员登录")}</Link></div>}
    {result?.status === "empty" && <div className="mt-8"><p>{text("Your cart is empty.", "购物车还是空的。")}</p><Link className="btn-primary mt-5" href="/shop#catalog">{text("Browse gear", "挑选装备")}</Link></div>}
    {result?.status === "complete" && <section className="mt-10 max-w-xl rounded-2xl bg-[#f5f5f7] p-8"><h2 className="text-2xl font-semibold">{text("Order received", "订单已创建")}</h2><p className="mt-4">{text("Order", "订单号")} #{result.order.number}</p><p className="mt-2">{formatStorePrice(result.order.total, lang)} USD</p><p className="mt-4 text-sm leading-relaxed text-[#666]">{text("Your order is recorded. Payment capture and dispatch are managed by SnowForce; an order confirmation alone does not mean it has shipped.", "订单已记录，收款和发货由 SnowForce 后台处理。订单确认后可继续查看物流状态。")}</p><Link className="btn-primary mt-6" href="/member/orders">{text("My orders", "我的订单")}</Link></section>}
    {result?.status === "processing" && <section className="mt-10 max-w-xl"><h2 className="text-2xl font-semibold">{busy && !displayError && <LoadingSpinner className="mr-2" />}{text("Order status needs checking", "订单状态待核验")}</h2><p className="mt-3 text-sm leading-relaxed">{text("Payment or inventory verification is still pending. Check again before attempting another payment.", "付款或库存仍在核验，请先检查状态，再尝试付款。")}</p><button className="btn-primary mt-6 gap-2" disabled={busy} onClick={() => void perform(() => changeShopCheckoutAction({ kind: "complete" }), false, "completing")}>{busy && pending === "completing" && <LoadingSpinner />}{text("Check order status", "检查订单状态")}</button></section>}
    {review && (result?.status === "review" || result?.status === "payment") && <div className="checkout-grid">
      <div className="checkout-steps">
        {!review.configured && <p role="alert" className="rounded-lg bg-[#f5f5f7] p-4 text-sm">{text("Checkout is being prepared. Delivery, tax and payment configuration must be completed before you can pay.", "结账服务正在准备中，配送、税费和付款配置完成后才可付款。")}</p>}
        {result.status === "review" && <><section className="checkout-card"><h2 className="checkout-section-title"><MapPin size={18} aria-hidden="true" />{text("Shipping address", "收货地址")}</h2>
          <fieldset className="mt-4 flex flex-wrap gap-5 text-sm" disabled={detailsLocked}><legend className="sr-only">{text("Choose how to receive your order", "选择收货方式")}</legend>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="delivery-mode" checked={deliveryMode === "delivery"} onChange={() => { markDraftChanged(); setDeliveryMode("delivery"); if (deliveryMode === "pickup") setAddress({ ...blank, name: address.name, phone: address.phone }); }} />{text("Delivery", "配送")}</label>
            {review.pickupOffer && <label className="flex min-h-11 items-center gap-2"><input type="radio" name="delivery-mode" checked={deliveryMode === "pickup"} onChange={() => { markDraftChanged(); setDeliveryMode("pickup"); setAppointmentConfirmed(false); }} />{text("Appointment pickup · Free", "预约自提 · 免费")}</label>}
          </fieldset>
          {deliveryMode === "pickup" && review.pickupOffer ? <>
            <p className="mt-3 text-sm leading-relaxed">{text("Contact customer service to confirm your pickup appointment before paying, then confirm it below. Tax is calculated at this pickup location.", "请先联系客服确认自提预约，再勾选下方预约确认。税费按以下自提地点自动计算。")} {review.policy && <a className="text-[#0066cc] underline" href={`mailto:${review.policy.content.customer_service_email}`}>{review.policy.content.customer_service_email}</a>}</p>
            <address className="mt-4 rounded-lg bg-[#f5f5f7] p-4 text-sm not-italic leading-relaxed"><p className="font-medium">{review.pickupOffer.name}</p><p>{review.pickupOffer.address.address_1}</p>{review.pickupOffer.address.address_2 && <p>{review.pickupOffer.address.address_2}</p>}<p>{review.pickupOffer.address.city}, CA {review.pickupOffer.address.postal_code}</p></address>
            <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); if (!appointmentConfirmed) return; void perform(() => changeShopCheckoutAction({ kind: "pickup-review", contact: { name: address.name, phone: address.phone, appointmentConfirmed: true }, ...draftVersion }), true); }}>
              {field("name", "Pickup name", "自提人姓名", "name", 100)}{field("phone", "Phone", "联系电话", "tel", 30)}
              <label className="flex min-h-12 items-start gap-3 text-sm leading-relaxed sm:col-span-2"><input type="checkbox" className="mt-1 h-4 w-4" required checked={appointmentConfirmed} disabled={detailsLocked} onChange={event => { markDraftChanged(); setAppointmentConfirmed(event.target.checked); }} /><span>{text("I have contacted SnowForce and confirmed my pickup appointment at this location.", "我已联系 SnowForce，并确认在此地点自提的预约。")}</span></label>
              <p className="checkout-help sm:col-span-2">{text("Your pickup details and tax update automatically after you confirm the appointment.", "确认预约后，自提信息与税费会自动更新。")}</p>
            </form>
          </> : <><p className="checkout-help">{text("United States · Shipping and tax update automatically when your address is complete.", "美国配送 · 地址填写完整后自动更新运费和税费。")}</p><form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (checkoutAddressSchema.safeParse(address).success) void perform(() => changeShopCheckoutAction({ kind: "delivery", address, ...draftVersion }), true); }}>
          {field("name", "Recipient name", "收件人姓名", "shipping name", 100)}{field("phone", "Phone", "联系电话", "shipping tel", 30)}<div className="sm:col-span-2">{field("address1", "Street address", "街道地址", "shipping address-line1", 200)}</div><div className="sm:col-span-2">{field("address2", "Apartment, suite (optional)", "公寓、房间号（选填）", "shipping address-line2", 200, true)}</div>{field("city", "City", "城市", "shipping address-level2", 100)}<label className="flex flex-col gap-2 text-sm font-medium">{text("State", "州")}<select name="state" required autoComplete="shipping address-level1" className="min-h-12 rounded-lg border border-[#d2d2d7] bg-white px-3" value={address.state} disabled={detailsLocked} onChange={(event) => { markDraftChanged(); setAddress((previous) => ({ ...previous, state: event.target.value })); }}><option value="">{text("Select state", "选择州")}</option>{usStates.filter(state => state !== "AK" && state !== "HI").map((state) => <option key={state} value={state}>{state}</option>)}</select></label>{field("postalCode", "ZIP code", "邮政编码", "shipping postal-code", 10)}
        </form></>}{addressDirty && <p role="status" className="mt-3 text-sm text-[#666]">{text("Shipping and tax will update when your details are complete.", "信息填写完整后将自动更新运费和税费。")}</p>}</section><section className="checkout-card"><h2 className="checkout-section-title"><Truck size={18} aria-hidden="true" />{text("Shipping options", "配送方式")}</h2>{busy && pending === "saving" && <LoadingStatus announce={false} className="mt-3 text-sm text-[#666]">{text("Updating shipping and tax…", "正在更新配送与税费…")}</LoadingStatus>}{deliveryMode === "pickup" ? <p className="mt-3 text-sm">{review.pickupSelected && !addressDirty ? text("Free pickup saved. Collect your order at your confirmed appointment; customer service will confirm it is ready.", "免费自提已保存。请按预约时间到店，客服会确认订单可领取。") : text("Confirm your appointment above to update free pickup and tax.", "请在上方确认预约，以自动更新免费自提与税费。")}</p> : addressDirty || !review.address ? <p className="mt-3 text-sm text-[#666]">{text("Available delivery and tax appear automatically after your address is complete.", "地址填写完整后，将自动显示可用配送与税费。")}</p> : !review.options.length ? <p role="alert" className="mt-3 text-sm">{text("Delivery is unavailable for this address or cart. Contact SnowForce for assistance.", "当前地址或商品组合暂无法配送，请联系 SnowForce。")}</p> : <fieldset className="mt-4 space-y-3" disabled={busy || review.paymentStarted || !review.configured || addressDirty}><legend className="sr-only">{text("Choose delivery", "选择配送")}</legend>{review.options.map((option) => <label key={option.id} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border border-[#d2d2d7] px-4"><input type="radio" name="shipping" value={option.id} checked={review.selectedOptionId === option.id} onChange={() => void perform(() => changeShopCheckoutAction({ kind: "shipping-review", optionId: option.id }), true)} /><span className="flex-1 text-sm">{option.name}</span><span className="text-sm font-medium">{option.price === 0 ? text("Free", "免运费") : formatStorePrice(option.price, lang)}</span></label>)}</fieldset>}</section><section className="checkout-card">
          <h2 className="checkout-section-title"><LockKeyhole size={18} aria-hidden="true" />{text("Payment", "付款")}</h2>
          {!quoteReady && <p className="checkout-help" role="status">{text("Complete your address to calculate shipping and tax automatically. Payment becomes available once your total is ready.", "填写完整地址后会自动计算运费与税费，合计确认后即可继续付款。")}</p>}
          {review.policy ? <>
            <p className="mt-3 text-sm leading-relaxed text-[#666]">{text(`Return requests within ${review.policy.content.terms.return_window_days} days of delivery or pickup; item conditions apply. Review the policy before agreeing.`, `配送送达或自提后 ${review.policy.content.terms.return_window_days} 天内可申请退换货，须符合商品条件。确认前可查看完整政策。`)}</p>
            <CheckoutPolicyTerms policy={review.policy} lang={lang} />
            {policyPreviouslyAccepted ? <p role="status" className="mt-4 text-sm">{text(`You accepted policy version ${review.policy.version} when this payment started.`, `此笔付款开始时，你已同意政策版本 ${review.policy.version}。`)}</p> : <>
              <label className="mt-4 flex min-h-12 items-start gap-3 text-sm leading-relaxed">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={policyAgreed} disabled={busy || !review.configured || !quoteReady || review.paymentStarted} onChange={(event) => {
                  const policy = review.policy;
                  setAcceptance(event.target.checked && policy ? { fingerprint: review.fingerprint, policyVersion: policy.version } : null);
                }} />
                <span>{text(`I have read and agree to the shipping, return and refund policy (version ${review.policy.version}).`, `我已阅读并同意配送、退换货及退款政策（版本 ${review.policy.version}）。`)}</span>
              </label>
              {review.paymentStarted && !review.policyAccepted && <p role="alert" className="mt-3 text-sm">{text("We couldn't verify the policy accepted for this payment. Refresh checkout before proceeding.", "暂时无法核实此笔付款的政策确认，请刷新结账信息后再继续。")}</p>}
            </>}
          </> : <p role="alert" className="mt-4 rounded-lg bg-[#f5f5f7] p-4 text-sm">{text("Shop policies are being prepared. Payment will be available after they are published.", "商城政策正在准备中，正式发布后才可付款。")} <Link className="text-[#0066cc] underline" href="/shop/policies">{text("Shop policies", "商城政策")}</Link></p>}
          <button className="btn-primary mt-5 w-full gap-2" disabled={busy || !review.configured || !quoteReady || !review.address || !review.selectedOptionId || addressDirty || !policyAgreed || (review.paymentStarted && !review.policyAccepted)} onClick={() => {
            const policy = review.policy;
            if (!policy || !policyAgreed) return;
            void perform(() => changeShopCheckoutAction({ kind: "payment", fingerprint: review.fingerprint, policyVersion: policy.version, agreed: true }), false, "payment");
          }}>{busy && pending === "payment" && <LoadingSpinner />}{review.paymentStarted ? text("Resume payment", "继续付款") : text("Review & continue to payment", "确认金额并继续付款")}</button>
        </section></>}
        {result.status === "payment" && <section className="checkout-card">{review.policy && <CheckoutPolicyTerms policy={review.policy} lang={lang} />}<h2 className="mb-6 mt-6 text-xl font-semibold">{text("Secure payment", "安全付款")}</h2><StripeCheckoutForm {...result} onBusyChange={paymentBusyChanged} validate={async () => { if (currentPaymentGeneration !== paymentGeneration.current) return false; const current = await getShopCheckoutAction(); if (currentPaymentGeneration !== paymentGeneration.current) return false; if (current.status !== "review" || current.fingerprint !== review.fingerprint || !current.configured || !current.taxQuote?.ready || current.taxQuote.totalCents !== Math.round(result.total * 100)) { apply(current); return false; } return true; }} complete={async () => { if (currentPaymentGeneration === paymentGeneration.current) await perform(() => changeShopCheckoutAction({ kind: "complete" }), false, "completing"); }} /></section>}
      </div>
      <aside className="checkout-card checkout-summary" aria-label={text("Order summary", "订单核对")}>
        <h2 className="text-xl font-semibold">{text("Order summary", "订单核对")}</h2>
        <ul className="mt-5 divide-y divide-[#d2d2d7]">{review.cart.items.map((item) => <li className="flex justify-between gap-4 py-4 text-sm" key={item.id}><Image src={item.image} alt="" width={56} height={72} className="h-20 w-14 shrink-0 object-contain" /><div className="min-w-0 flex-1"><p className="font-medium">{item.name}</p><p className="mt-1 text-xs text-[#666]">{item.variant} · ×{item.quantity}</p></div><span>{formatStorePrice(item.unitPrice * item.quantity, lang)}</span></li>)}</ul>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between"><dt>{text("Subtotal", "商品小计")}</dt><dd>{formatStorePrice(review.taxQuote ? review.taxQuote.grossCents / 100 : review.cart.subtotal, lang)}</dd></div>
          {(review.taxQuote ? review.taxQuote.discountCents > 0 : review.cart.discountTotal > 0) && <div className="flex justify-between"><dt>{text("Discount", "优惠")}</dt><dd>−{formatStorePrice(review.taxQuote ? review.taxQuote.discountCents / 100 : review.cart.discountTotal, lang)}</dd></div>}
          <div className="flex justify-between"><dt>{text(deliveryMode === "pickup" ? "Pickup" : "Delivery", deliveryMode === "pickup" ? "自提费" : "运费")}</dt><dd>{addressDirty ? text("Recalculating after your details are complete", "信息完整后重新计算") : review.selectedOptionId ? formatStorePrice(review.taxQuote ? review.taxQuote.shippingCents / 100 : review.cart.shippingTotal, lang) : text("Select delivery", "请选择配送")}</dd></div>
          <div className="flex justify-between"><dt>{text("Sales tax", "消费税")}</dt><dd>{!addressDirty && review.taxQuote ? formatStorePrice(review.taxQuote.salesTaxCents / 100, lang) : busy ? <LoadingStatus announce={false}>{text("Updating…", "更新中…")}</LoadingStatus> : text("Calculated from your address", "填写地址后计算")}</dd></div>
          {!addressDirty && review.taxQuote?.fees.map(fee => <div className="flex justify-between gap-4" key={fee.state}><dt>{text(fee.state + " retail delivery fee", fee.state + " 政府配送费")}</dt><dd>{formatStorePrice(fee.amountCents / 100, lang)}</dd></div>)}
          <div className="flex justify-between border-t border-[#d2d2d7] pt-4 text-base font-semibold"><dt>{text("Total", "合计")}</dt><dd>{!addressDirty && review.taxQuote ? formatStorePrice(review.taxQuote.totalCents / 100, lang) + " USD" : text("Complete your address", "请填写完整地址")}</dd></div>
        </dl>
        {busy && <p className="checkout-help mt-4"><LoadingSpinner className="mr-2" />{pending === "saving" ? text("Updating shipping, tax and total…", "正在更新运费、税费与合计…") : pendingText}</p>}
        {!busy && quoteReady && <p role="status" className="checkout-total-ready">{text("Shipping and tax included. Your total is up to date.", "已包含运费与税费，合计已更新。")}</p>}
        {displayError && displayError !== "stale-details" && !review.paymentStarted && <button className="checkout-retry" disabled={busy} onClick={() => { automaticAttempt.current = ""; void perform(() => changeShopCheckoutAction(deliveryMode === "pickup" ? { kind: "pickup-review", contact: { name: address.name, phone: address.phone, appointmentConfirmed }, ...draftVersion } : { kind: "delivery", address, ...draftVersion }), true); }}>{busy && pending === "saving" && <LoadingSpinner className="mr-2" />}{text("Retry shipping & tax", "重新计算运费与税费")}</button>}
        <Link className="checkout-edit-cart" href="/shop/cart">{text("Edit cart", "编辑购物车")}</Link>
      </aside>
    </div>}
    <nav className="checkout-footer" aria-label={text("Checkout help and policies", "结账帮助与政策")}><Link href="/shop/policies">{text("Shipping & returns", "配送与退换")}</Link><Link href="/privacy-policy">{text("Privacy", "隐私政策")}</Link>{review?.policy && <a href={`mailto:${review.policy.content.customer_service_email}`}>{text("Contact us", "联系客服")}</a>}</nav>
  </div>;
}
