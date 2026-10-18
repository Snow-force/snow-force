"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { formatStorePrice } from "@/lib/shop/storefront";
import { LoadingSpinner, LoadingStatus } from "./loading-status";
import { PendingFeedback } from "./pending-feedback";
import type { ShopClientTiming } from "@/lib/shop/performance-browser";

type Props = { clientSecret: string; publishableKey: string; total: number; validate: () => Promise<boolean>; complete: () => Promise<void>; onBusyChange?: (busy: boolean) => void; timing?: ShopClientTiming };
function PaymentForm({ total, validate, complete, onBusyChange, retry, timing }: Omit<Props, "clientSecret" | "publishableKey"> & { retry: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { lang } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [elementState, setElementState] = useState<"loading" | "ready" | "error" | "timeout">("loading");
  const [uncertain, setUncertain] = useState(false);
  const [phase, setPhase] = useState<"details" | "review" | "authorization" | "order">("details");
  const [message, setMessage] = useState("");
  const active = useRef(false);
  const needsStatusCheck = useRef(false);
  const interactiveReported = useRef(false);
  const elementReadyReported = useRef(false);
  const diagnostic = useRef(timing);
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  const uncertainText = text("The payment result is not confirmed. Use Check payment status before trying again.", "付款结果尚未确认，请先点击「检查付款状态」，再尝试付款。");
  const loading = (elementState === "loading" || elementState === "ready") && (elementState !== "ready" || !stripe || !elements);
  useEffect(() => {
    if (!loading) return;
    const timeout = window.setTimeout(() => { diagnostic.current?.report("payment.interactive", "timeout"); setElementState("timeout"); }, 30_000);
    return () => window.clearTimeout(timeout);
  }, [loading]);
  useEffect(() => {
    if (!loading && elementState === "ready" && stripe && elements && !interactiveReported.current) {
      interactiveReported.current = true;
      diagnostic.current?.report("payment.interactive");
    }
  }, [loading, elementState, stripe, elements]);
  const pendingText = phase === "details" ? text("Checking payment details…", "正在检查付款信息…")
    : phase === "review" ? text("Verifying your current total…", "正在核对最新订单金额…")
    : phase === "authorization" ? text("Confirming payment authorization…", "正在确认支付授权…")
    : text("Verifying your order…", "正在核验订单…");
  return <form aria-busy={busy || loading} onSubmit={async (event) => {
    event.preventDefault();
    if (!stripe || !elements || elementState !== "ready" || active.current || needsStatusCheck.current) return;
    active.current = true; onBusyChange?.(true); setBusy(true); setPhase("details"); setMessage("");
    let confirmationStarted = false;
    let confirmationReported = false;
    let confirmingAt = 0;
    try {
      const submitted = await elements.submit();
      if (submitted.error) { setMessage(submitted.error.message ?? text("Check your payment details.", "请检查付款信息。")); return; }
      setPhase("review");
      if (!await validate()) { setMessage(text("Your checkout changed. Review it before paying.", "结账信息已变化，请重新核对。")); return; }
      setPhase("authorization");
      confirmationStarted = true;
      needsStatusCheck.current = true;
      confirmingAt = performance.now();
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/shop/checkout/return` }, redirect: "if_required" });
      confirmationReported = true;
      diagnostic.current?.report("payment.confirm", error ? "error" : paymentIntent?.status === "requires_capture" ? "authorized" : paymentIntent?.status === "processing" ? "processing" : paymentIntent?.status === "succeeded" ? "succeeded" : "rejected", confirmingAt);
      if (error) {
        if (error.type === "card_error" || error.type === "validation_error") { needsStatusCheck.current = false; setMessage(error.message ?? text("Payment could not be confirmed. Check your payment details.", "无法确认付款，请检查付款信息。")); }
        else { setUncertain(true); setMessage(uncertainText); }
        return;
      }
      if (paymentIntent && ["succeeded", "requires_capture", "processing"].includes(paymentIntent.status)) { setUncertain(true); setPhase("order"); const orderAt = performance.now(); try { await complete(); diagnostic.current?.report("payment.order", "returned", orderAt); } catch (error) { diagnostic.current?.report("payment.order", "error", orderAt); throw error; } }
      else if (paymentIntent && ["requires_payment_method", "requires_confirmation", "requires_action"].includes(paymentIntent.status)) { needsStatusCheck.current = false; setMessage(text("Payment still needs confirmation. Please follow the instructions above.", "付款仍需确认，请按上方提示操作。")); }
      else { setUncertain(true); setMessage(uncertainText); }
    } catch {
      if (confirmationStarted && !confirmationReported) diagnostic.current?.report("payment.confirm", "error", confirmingAt);
      setUncertain(confirmationStarted);
      setMessage(confirmationStarted ? uncertainText : text("We couldn't verify checkout. Check your connection and try again.", "暂时无法核对结账信息，请检查网络后重试。"));
    }
    finally { active.current = false; onBusyChange?.(false); setBusy(false); }
  }}>
    {loading && <LoadingStatus className="mb-4 rounded-lg bg-[#f5f5f7] p-4 text-sm">{text("Loading secure payment…", "正在加载安全付款表单…")}</LoadingStatus>}
    {loading && <PendingFeedback kind="payment" />}
    <PaymentElement options={{ layout: "tabs" }} onReady={() => { if (!elementReadyReported.current) { elementReadyReported.current = true; diagnostic.current?.report("payment.element_ready"); } setElementState(previous => previous === "loading" ? "ready" : previous); }} onLoadError={() => { diagnostic.current?.report("payment.interactive", "error"); setElementState("error"); }} />
    {(elementState === "error" || elementState === "timeout") && <div className="mt-4 text-sm"><p role="alert" className="text-red-700">{elementState === "timeout" ? text("The secure payment form is taking too long to load. Check your connection and reload the form.", "安全付款表单加载超时，请检查网络并重新加载表单。") : text("The secure payment form could not load. You can reload the form.", "安全付款表单加载失败，你可以重新加载表单。")}</p><button type="button" className="mt-2 min-h-11 text-[#0066cc] underline" disabled={busy || uncertain} onClick={retry}>{text("Reload secure payment form", "重新加载安全付款表单")}</button></div>}
    {busy && <LoadingStatus className="mt-4 text-sm text-[#666]">{pendingText}</LoadingStatus>}
    {message && <p role="alert" className="mt-4 text-sm text-red-700">{uncertain ? uncertainText : message}</p>}
    {uncertain && <Link href="/member/orders" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm text-[#0066cc] underline">{text("Check orders in a new tab", "在新标签页检查订单")}</Link>}
    <button className="btn-primary mt-6 w-full gap-2" disabled={busy || loading || elementState !== "ready" || uncertain || !stripe || !elements}>{(busy || loading) && <LoadingSpinner />}{busy ? text("Confirming…", "确认中…") : text(`Authorize ${formatStorePrice(total, lang)}`, `授权付款 ${formatStorePrice(total, lang)}`)}</button>
    <p className="mt-3 text-xs leading-relaxed text-[#666]">{text("Your payment details go directly to Stripe. SnowForce receives the authorization and captures payment through its order workflow.", "付款信息直接提交给 Stripe。SnowForce 收到支付授权后，通过后台订单流程收款。")}</p>
  </form>;
}
export default function StripeCheckoutForm(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <StripeCheckoutAttempt key={`${props.clientSecret}:${props.publishableKey}:${attempt}`} {...props} retry={() => setAttempt(previous => previous + 1)} />;
}

function StripeCheckoutAttempt({ clientSecret, publishableKey, total, validate, complete, onBusyChange, retry, timing }: Props & { retry: () => void }) {
  const { lang } = useLanguage();
  // Keep the same Elements instance during confirmation or an uncertain result.
  // A language change must not reset the duplicate-payment guard.
  const [locale] = useState(() => lang === "zh" ? "zh" as const : "en" as const);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const diagnostic = useRef(timing);
  useEffect(() => { diagnostic.current?.report("payment.mount"); }, []);
  // Resolve a failed SDK load to null, then show a recoverable error instead of
  // leaving a spinner indefinitely or creating an unhandled rejected promise.
  const stripe = useMemo(() => loadStripe(publishableKey).catch(() => null), [publishableKey]);
  useEffect(() => {
    let current = true;
    const started = performance.now();
    void stripe.then(client => { if (current) { diagnostic.current?.report("payment.sdk", client ? "ok" : "error", started); if (!client) { diagnostic.current?.report("payment.interactive", "error"); setFailedKey(publishableKey); } } });
    return () => { current = false; };
  }, [stripe, publishableKey]);
  if (failedKey === publishableKey) return <div className="mt-4 text-sm"><p role="alert" className="text-red-700">{lang === "zh" ? "安全付款服务加载失败，请检查网络后重新加载表单。" : "The secure payment service could not load. Check your connection and reload the form."}</p><button type="button" className="mt-2 min-h-11 text-[#0066cc] underline" onClick={retry}>{lang === "zh" ? "重新加载安全付款表单" : "Reload secure payment form"}</button></div>;
  return <Elements stripe={stripe} options={{ clientSecret, locale, appearance: { theme: "stripe", variables: { colorPrimary: "#0066cc", borderRadius: "8px" } } }}><PaymentForm total={total} validate={validate} complete={complete} onBusyChange={onBusyChange} retry={retry} timing={timing} /></Elements>;
}
