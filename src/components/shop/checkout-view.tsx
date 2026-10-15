"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { changeShopCheckoutAction, getShopCheckoutAction } from "@/lib/shop/checkout-actions";
import { type CheckoutResult, type CheckoutReview, type CheckoutAddress } from "@/lib/shop/checkout";
import { usStates } from "@/lib/shop/shipping-addresses";
import { formatStorePrice } from "@/lib/shop/storefront";
import { shopPolicySections, type ShopPolicySection, type ShopPublishedPolicy } from "@/lib/shop/policies";
import { useShopCart } from "./shop-provider";

const StripeCheckoutForm = dynamic(() => import("./stripe-checkout-form"), { ssr: false, loading: () => <p role="status">Loading secure payment… / 正在加载付款…</p> });
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
    <div className="mt-5 space-y-5 leading-relaxed">
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
  const { reload: reloadCart } = useShopCart();
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [review, setReview] = useState<CheckoutReview | null>(null);
  const [address, setAddress] = useState<CheckoutAddress>(blank);
  const [deliveryMode, setDeliveryMode] = useState<"delivery" | "pickup">("delivery");
  const [appointmentConfirmed, setAppointmentConfirmed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [error, setError] = useState<CheckoutResult["status"] | null>(null);
  const [acceptance, setAcceptance] = useState<{ fingerprint: string; policyVersion: number } | null>(null);
  const [quoteTime, setQuoteTime] = useState(() => Date.now());
  const active = useRef(true);
  const stripeActive = useRef(false);
  const paymentGeneration = useRef(0);
  const currentPaymentGeneration = paymentGeneration.current;
  const paymentBusyChanged = useCallback((pending: boolean) => { stripeActive.current = pending; setStripeBusy(pending); }, []);
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  const addressDirty = !!review && ((deliveryMode === "pickup") !== !!review.pickupSelected || (!!review.address && JSON.stringify(address) !== JSON.stringify(review.address)) || (deliveryMode === "pickup" && !appointmentConfirmed));
  const policyPreviouslyAccepted = !!review?.policy && review.paymentStarted && review.policyAccepted;
  const policyAgreed = !!review?.policy && (policyPreviouslyAccepted || (acceptance !== null && acceptance.fingerprint === review.fingerprint && acceptance.policyVersion === review.policy.version));
  const quoteReady = !addressDirty && !!review?.taxQuote?.ready && (review.paymentStarted || quoteTime < review.taxQuote.expiresAt * 1000);
  useEffect(() => {
    if (!review?.taxQuote || review.paymentStarted) return;
    const timeout = window.setTimeout(() => setQuoteTime(Date.now()), Math.max(0, Math.min(2_147_483_647, review.taxQuote.expiresAt * 1000 - Date.now())));
    return () => window.clearTimeout(timeout);
  }, [review?.taxQuote, review?.paymentStarted]);
  const apply = useCallback((next: CheckoutResult) => {
    paymentGeneration.current += 1;
    if (["invalid", "rejected", "unavailable", "not-configured"].includes(next.status)) { setError(next.status); if (!review) setResult(next); return; }
    setResult(next); setError(null);
    if (next.status === "review") {
      setReview(next); setAddress(next.address ?? blank); setDeliveryMode(next.pickupSelected ? "pickup" : "delivery"); setAppointmentConfirmed(!!next.pickupSelected);
      setAcceptance((previous) => next.paymentCheck !== "unlocked" && next.policy && previous !== null && previous.fingerprint === next.fingerprint && previous.policyVersion === next.policy.version ? previous : null);
    }
    if (next.status === "complete") void reloadCart();
  }, [reloadCart, review]);
  const perform = async (operation: () => Promise<CheckoutResult>, invalidateQuote = false) => {
    if (active.current) return;
    active.current = true; setBusy(true); setError(null);
    if (invalidateQuote) {
      setAcceptance(null);
      setReview(previous => previous ? { ...previous, taxQuote: previous.taxQuote ? { ...previous.taxQuote, ready: false } : null } : null);
    }
    try { apply(await operation()); } catch { setError("unavailable"); }
    finally { active.current = false; setBusy(false); }
  };
  const checkPayment = async () => {
    if (active.current || stripeActive.current) return;
    paymentGeneration.current += 1;
    setAcceptance(null);
    // Remove the old Elements instance before checking; errors cannot restore its client secret.
    setResult({ status: "processing" });
    await perform(() => changeShopCheckoutAction({ kind: "recover" }));
  };
  useEffect(() => {
    let current = true;
    // Stripe may append a client secret on return. Never use or retain it as proof of payment.
    if (completing) window.history.replaceState(window.history.state, "", "/shop/checkout/return");
    const operation = completing ? changeShopCheckoutAction({ kind: "complete" }) : getShopCheckoutAction();
    void operation.then((next) => { if (current) { setResult(next); if (next.status === "review") { setReview(next); setAddress(next.address ?? blank); setDeliveryMode(next.pickupSelected ? "pickup" : "delivery"); setAppointmentConfirmed(!!next.pickupSelected); } if (next.status === "complete") void reloadCart(); } }).catch(() => { if (current) setError("unavailable"); }).finally(() => { if (current) { active.current = false; setBusy(false); } });
    return () => { current = false; paymentGeneration.current += 1; };
  }, [completing, reloadCart]);
  const displayError = error ?? (result && ["invalid", "rejected", "unavailable", "not-configured"].includes(result.status) ? result.status : null);
  const field = (name: keyof Omit<CheckoutAddress, "countryCode" | "state">, en: string, zh: string, autoComplete: string, maxLength: number, optional = false) => <label className="flex flex-col gap-2 text-sm font-medium">{text(en, zh)}<input className="min-h-12 rounded-lg border border-[#d2d2d7] bg-white px-3 font-normal" name={name} value={address[name]} required={!optional} maxLength={maxLength} autoComplete={autoComplete} disabled={busy || review?.paymentStarted} onChange={(event) => setAddress((previous) => ({ ...previous, [name]: event.target.value }))} /></label>;
  return <main className="shop-container py-12 sm:py-20" aria-busy={busy}>
    <Link className="text-sm text-[#0066cc]" href="/shop/cart">← {text("Back to cart", "返回购物车")}</Link>
    <p className="shop-eyebrow mt-8">SNOWFORCE / CHECKOUT</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">{text("Ready for your next ride.", "为下一趟滑行做好准备。")}</h1>
    {displayError && <div role="alert" className="mt-6 rounded-lg bg-[#f5f5f7] p-4 text-sm">{displayError === "not-configured" ? text("Delivery or payments are being prepared. Checkout isn't available yet.", "配送或付款服务正在准备中，暂时无法结账。") : displayError === "invalid" ? text("Check the address and shipping selection.", "请检查收货地址和配送选择。") : displayError === "rejected" ? text("Stock, price or payment state changed. Refresh your checkout; check order status before paying again.", "库存、金额或支付状态已变化。请刷新结账信息，再次付款前先核实订单状态。") : text("We couldn't load checkout. Please try again.", "暂时无法加载结账信息，请重试。")}<button className="ml-3 min-h-11 text-[#0066cc] underline" disabled={busy || stripeBusy} onClick={() => void perform(getShopCheckoutAction)}>{text("Refresh", "刷新")}</button></div>}
    {(displayError || result?.status === "processing" || result?.status === "payment" || (result?.status === "review" && review?.paymentStarted)) && <div className="mt-5"><button className="min-h-11 text-sm text-[#0066cc] underline" disabled={busy || stripeBusy} onClick={() => void checkPayment()}>{text("Check payment status", "检查付款状态")}</button>{busy && <p role="status" className="mt-2 text-sm">{text("Checking checkout…", "正在检查结账信息…")}</p>}</div>}
    {result?.status === "review" && review?.paymentCheck && <p role="status" className="mt-4 text-sm leading-relaxed">{review.paymentCheck === "unlocked" ? text("The previous payment was canceled. Review your checkout and agree to the current policy before starting a new payment.", "之前的付款已取消。请重新核对结账信息并同意当前政策，再开始新的付款。") : text("Your original payment is still active. Continue that payment or check order status if it is processing.", "原付款仍有效，请继续原付款；如正在处理，请检查订单状态。")}</p>}
    {!result && !displayError && <p role="status" className="mt-8">{text("Loading checkout…", "正在加载结账信息…")}</p>}
    {result?.status === "signed-out" && <div className="mt-8"><p>{text("Sign in with your SnowForce account to checkout.", "请使用 SnowForce 会员账号登录后结账。")}</p><Link className="btn-primary mt-5" href={`/member?next=${encodeURIComponent(completing ? "/shop/checkout/return" : "/shop/checkout")}`}>{text("Sign in", "会员登录")}</Link></div>}
    {result?.status === "empty" && <div className="mt-8"><p>{text("Your cart is empty.", "购物车还是空的。")}</p><Link className="btn-primary mt-5" href="/shop#catalog">{text("Browse gear", "挑选装备")}</Link></div>}
    {result?.status === "complete" && <section className="mt-10 max-w-xl rounded-2xl bg-[#f5f5f7] p-8"><h2 className="text-2xl font-semibold">{text("Order received", "订单已创建")}</h2><p className="mt-4">{text("Order", "订单号")} #{result.order.number}</p><p className="mt-2">{formatStorePrice(result.order.total, lang)} USD</p><p className="mt-4 text-sm leading-relaxed text-[#666]">{text("Your order is recorded. Payment capture and dispatch are managed by SnowForce; an order confirmation alone does not mean it has shipped.", "订单已记录，收款和发货由 SnowForce 后台处理。订单确认后可继续查看物流状态。")}</p><Link className="btn-primary mt-6" href="/member/orders">{text("My orders", "我的订单")}</Link></section>}
    {result?.status === "processing" && <section className="mt-10 max-w-xl"><h2 className="text-2xl font-semibold">{text("Verifying your order", "正在核验订单")}</h2><p className="mt-3 text-sm leading-relaxed">{text("Payment or inventory verification is still pending. Check again before attempting another payment.", "付款或库存仍在核验，请先检查状态，再尝试付款。")}</p><button className="btn-primary mt-6" disabled={busy} onClick={() => void perform(() => changeShopCheckoutAction({ kind: "complete" }))}>{text("Check order status", "检查订单状态")}</button></section>}
    {review && (result?.status === "review" || result?.status === "payment") && <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-8">
        {!review.configured && <p role="alert" className="rounded-lg bg-[#f5f5f7] p-4 text-sm">{text("Checkout is being prepared. Delivery, tax and payment configuration must be completed before you can pay.", "结账服务正在准备中，配送、税费和付款配置完成后才可付款。")}</p>}
        {result.status === "review" && <><section><h2 className="text-xl font-semibold">1. {text("Delivery or pickup", "配送或自提")}</h2>
          <fieldset className="mt-4 flex flex-wrap gap-5 text-sm" disabled={busy || review.paymentStarted || !review.configured}><legend className="sr-only">{text("Choose how to receive your order", "选择收货方式")}</legend>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="delivery-mode" checked={deliveryMode === "delivery"} onChange={() => { setDeliveryMode("delivery"); setAcceptance(null); if (review.pickupSelected) setAddress({ ...blank, name: address.name, phone: address.phone }); }} />{text("Delivery", "配送")}</label>
            {review.pickupOffer && <label className="flex min-h-11 items-center gap-2"><input type="radio" name="delivery-mode" checked={deliveryMode === "pickup"} onChange={() => { setDeliveryMode("pickup"); setAcceptance(null); }} />{text("Appointment pickup · Free", "预约自提 · 免费")}</label>}
          </fieldset>
          {deliveryMode === "pickup" && review.pickupOffer ? <>
            <p className="mt-3 text-sm leading-relaxed">{text("Contact customer service to confirm your pickup appointment before paying. Then save pickup here. Tax is calculated at this pickup location.", "请先联系客服确认自提预约，再在这里保存自提信息并付款。税费按以下自提地点计算。")} {review.policy && <a className="text-[#0066cc] underline" href={`mailto:${review.policy.content.customer_service_email}`}>{review.policy.content.customer_service_email}</a>}</p>
            <address className="mt-4 rounded-lg bg-[#f5f5f7] p-4 text-sm not-italic leading-relaxed"><p className="font-medium">{review.pickupOffer.name}</p><p>{review.pickupOffer.address.address_1}</p>{review.pickupOffer.address.address_2 && <p>{review.pickupOffer.address.address_2}</p>}<p>{review.pickupOffer.address.city}, CA {review.pickupOffer.address.postal_code}</p></address>
            <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); if (!appointmentConfirmed) return; void perform(() => changeShopCheckoutAction({ kind: "pickup", contact: { name: address.name, phone: address.phone, appointmentConfirmed: true } }), true); }}>
              {field("name", "Pickup name", "自提人姓名", "name", 100)}{field("phone", "Phone", "联系电话", "tel", 30)}
              <label className="flex min-h-12 items-start gap-3 text-sm leading-relaxed sm:col-span-2"><input type="checkbox" className="mt-1 h-4 w-4" required checked={appointmentConfirmed} disabled={busy || review.paymentStarted || !review.configured} onChange={event => { setAppointmentConfirmed(event.target.checked); setAcceptance(null); }} /><span>{text("I have contacted SnowForce and confirmed my pickup appointment at this location.", "我已联系 SnowForce，并确认在此地点自提的预约。")}</span></label>
              <button className="btn-primary sm:col-span-2" disabled={busy || review.paymentStarted || !review.configured || !appointmentConfirmed}>{text("Save free pickup", "保存免费自提")}</button>
            </form>
          </> : <><p className="mt-2 text-sm text-[#666]">{text("United States · USD", "美国配送 · 美元结算")}</p><form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void perform(() => changeShopCheckoutAction({ kind: "address", address }), true); }}>
          {field("name", "Recipient name", "收件人姓名", "shipping name", 100)}{field("phone", "Phone", "联系电话", "shipping tel", 30)}<div className="sm:col-span-2">{field("address1", "Street address", "街道地址", "shipping address-line1", 200)}</div><div className="sm:col-span-2">{field("address2", "Apartment, suite (optional)", "公寓、房间号（选填）", "shipping address-line2", 200, true)}</div>{field("city", "City", "城市", "shipping address-level2", 100)}<label className="flex flex-col gap-2 text-sm font-medium">{text("State", "州")}<select name="state" required autoComplete="shipping address-level1" className="min-h-12 rounded-lg border border-[#d2d2d7] bg-white px-3" value={address.state} disabled={busy || review.paymentStarted} onChange={(event) => setAddress((previous) => ({ ...previous, state: event.target.value }))}><option value="">{text("Select state", "选择州")}</option>{usStates.filter(state => state !== "AK" && state !== "HI").map((state) => <option key={state} value={state}>{state}</option>)}</select></label>{field("postalCode", "ZIP code", "邮政编码", "shipping postal-code", 10)}<div className="flex items-end"><button className="btn-primary w-full" disabled={busy || review.paymentStarted || !review.configured}>{text("Save address & get delivery options", "保存地址并查询配送")}</button></div>
        </form></>}{addressDirty && <p role="status" className="mt-3 text-sm text-[#666]">{text("Save your delivery or pickup details before paying.", "请先保存配送或自提信息，再付款。")}</p>}</section><section className="border-t border-[#e0e0e0] pt-8"><h2 className="text-xl font-semibold">2. {text("Receiving your order", "收货方式")}</h2>{deliveryMode === "pickup" ? <p className="mt-3 text-sm">{review.pickupSelected && !addressDirty ? text("Free pickup saved. Collect your order at your confirmed appointment; customer service will confirm it is ready.", "免费自提已保存。请按预约时间到店，客服会确认订单可领取。") : text("Confirm your appointment and save free pickup above.", "请先确认预约并保存上方的免费自提信息。")}</p> : !review.address ? <p className="mt-3 text-sm text-[#666]">{text("Save your address to see available delivery and tax.", "保存收货地址后查询可用配送及税费。")}</p> : !review.options.length ? <p role="alert" className="mt-3 text-sm">{text("Delivery is unavailable for this address or cart. Contact SnowForce for assistance.", "当前地址或商品组合暂无法配送，请联系 SnowForce。")}</p> : <fieldset className="mt-4 space-y-3" disabled={busy || review.paymentStarted || !review.configured || addressDirty}><legend className="sr-only">{text("Choose delivery", "选择配送")}</legend>{review.options.map((option) => <label key={option.id} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border border-[#d2d2d7] px-4"><input type="radio" name="shipping" value={option.id} checked={review.selectedOptionId === option.id} onChange={() => void perform(() => changeShopCheckoutAction({ kind: "shipping", optionId: option.id }), true)} /><span className="flex-1 text-sm">{option.name}</span><span className="text-sm font-medium">{option.price === 0 ? text("Free", "免运费") : formatStorePrice(option.price, lang)}</span></label>)}</fieldset>}</section><section className="border-t border-[#e0e0e0] pt-8">
          <h2 className="text-xl font-semibold">3. {text("Tax & total", "税费与合计")}</h2>
          {review.taxQuote ? <p role="status" className="mt-3 text-sm leading-relaxed">{quoteReady ? text("Tax and any required delivery fees are included in the reviewed total below.", "税费及适用的政府配送费已计入下方核对金额。") : text("Your previous quote needs to be refreshed before payment.", "之前的报价需要更新，重新核对金额后才可付款。")}</p> : <p className="mt-3 text-sm text-[#666]">{text("Save delivery or pickup, then calculate tax to review the final total.", "保存配送或自提信息后，计算税费并核对最终金额。")}</p>}
          {!review.paymentStarted && <button className="mt-4 min-h-12 rounded-lg border border-[#d2d2d7] px-5 text-sm font-medium" disabled={busy || !review.configured || !review.address || !review.selectedOptionId || addressDirty} onClick={() => { setAcceptance(null); void perform(() => changeShopCheckoutAction({ kind: "quote" }), true); }}>{review.taxQuote ? text("Refresh tax & total", "更新税费与金额") : text("Calculate tax & review total", "计算税费并核对金额")}</button>}
        </section><section className="border-t border-[#e0e0e0] pt-8">
          <h2 className="text-xl font-semibold">4. {text("Payment", "付款")}</h2>
          {review.policy ? <>
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
          <button className="btn-primary mt-5 w-full" disabled={busy || !review.configured || !quoteReady || !review.address || !review.selectedOptionId || addressDirty || !policyAgreed || (review.paymentStarted && !review.policyAccepted)} onClick={() => {
            const policy = review.policy;
            if (!policy || !policyAgreed) return;
            void perform(() => changeShopCheckoutAction({ kind: "payment", fingerprint: review.fingerprint, policyVersion: policy.version, agreed: true }));
          }}>{review.paymentStarted ? text("Resume payment", "继续付款") : text("Review & continue to payment", "确认金额并继续付款")}</button>
        </section></>}
        {result.status === "payment" && <section>{review.policy && <CheckoutPolicyTerms policy={review.policy} lang={lang} />}<h2 className="mb-6 mt-6 text-xl font-semibold">{text("Secure payment", "安全付款")}</h2><StripeCheckoutForm {...result} onBusyChange={paymentBusyChanged} validate={async () => { if (currentPaymentGeneration !== paymentGeneration.current) return false; const current = await getShopCheckoutAction(); if (currentPaymentGeneration !== paymentGeneration.current) return false; if (current.status !== "review" || current.fingerprint !== review.fingerprint || !current.configured || !current.taxQuote?.ready || current.taxQuote.totalCents !== Math.round(result.total * 100)) { apply(current); return false; } return true; }} complete={async () => { if (currentPaymentGeneration === paymentGeneration.current) await perform(() => changeShopCheckoutAction({ kind: "complete" })); }} /></section>}
      </div>
      <aside className="rounded-2xl bg-[#f5f5f7] p-6 lg:sticky lg:top-36">
        <h2 className="text-xl font-semibold">{text("Order summary", "订单核对")}</h2>
        <ul className="mt-5 divide-y divide-[#d2d2d7]">{review.cart.items.map((item) => <li className="flex justify-between gap-4 py-4 text-sm" key={item.id}><div><p className="font-medium">{item.name}</p><p className="mt-1 text-xs text-[#666]">{item.variant} · ×{item.quantity}</p></div><span>{formatStorePrice(item.unitPrice * item.quantity, lang)}</span></li>)}</ul>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between"><dt>{text("Subtotal", "商品小计")}</dt><dd>{formatStorePrice(review.taxQuote ? review.taxQuote.grossCents / 100 : review.cart.subtotal, lang)}</dd></div>
          {(review.taxQuote ? review.taxQuote.discountCents > 0 : review.cart.discountTotal > 0) && <div className="flex justify-between"><dt>{text("Discount", "优惠")}</dt><dd>−{formatStorePrice(review.taxQuote ? review.taxQuote.discountCents / 100 : review.cart.discountTotal, lang)}</dd></div>}
          <div className="flex justify-between"><dt>{text(review.pickupSelected ? "Pickup" : "Delivery", review.pickupSelected ? "自提费" : "运费")}</dt><dd>{review.selectedOptionId ? formatStorePrice(review.taxQuote ? review.taxQuote.shippingCents / 100 : review.cart.shippingTotal, lang) : text("Select delivery", "请选择配送")}</dd></div>
          <div className="flex justify-between"><dt>{text("Sales tax", "消费税")}</dt><dd>{review.taxQuote ? formatStorePrice(review.taxQuote.salesTaxCents / 100, lang) : text("Calculate tax first", "请先计算税费")}</dd></div>
          {review.taxQuote?.fees.map(fee => <div className="flex justify-between gap-4" key={fee.state}><dt>{text(fee.state + " retail delivery fee", fee.state + " 政府配送费")}</dt><dd>{formatStorePrice(fee.amountCents / 100, lang)}</dd></div>)}
          <div className="flex justify-between border-t border-[#d2d2d7] pt-4 text-base font-semibold"><dt>{text("Total", "合计")}</dt><dd>{review.taxQuote ? formatStorePrice(review.taxQuote.totalCents / 100, lang) + " USD" : text("Calculated after tax", "计算税费后显示")}</dd></div>
        </dl>
      </aside>
    </div>}
  </main>;
}
