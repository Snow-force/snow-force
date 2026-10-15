"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import { useLanguage } from "@/lib/language";
import { formatStorePrice } from "@/lib/shop/storefront";
import { LoadingSpinner, LoadingStatus } from "./loading-status";

type Props = { clientSecret: string; publishableKey: string; total: number; validate: () => Promise<boolean>; complete: () => Promise<void>; onBusyChange?: (busy: boolean) => void };
function PaymentForm({ total, validate, complete, onBusyChange }: Omit<Props, "clientSecret" | "publishableKey">) {
  const stripe = useStripe();
  const elements = useElements();
  const { lang } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [elementState, setElementState] = useState<"loading" | "ready" | "error">("loading");
  const [phase, setPhase] = useState<"details" | "review" | "authorization" | "order">("details");
  const [message, setMessage] = useState("");
  const active = useRef(false);
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  const loading = elementState !== "error" && (elementState !== "ready" || !stripe || !elements);
  const pendingText = phase === "details" ? text("Checking payment details…", "正在检查付款信息…")
    : phase === "review" ? text("Verifying your current total…", "正在核对最新订单金额…")
    : phase === "authorization" ? text("Confirming payment authorization…", "正在确认支付授权…")
    : text("Verifying your order…", "正在核验订单…");
  return <form aria-busy={busy || loading} onSubmit={async (event) => {
    event.preventDefault();
    if (!stripe || !elements || elementState !== "ready" || active.current) return;
    active.current = true; onBusyChange?.(true); setBusy(true); setPhase("details"); setMessage("");
    try {
      const submitted = await elements.submit();
      if (submitted.error) { setMessage(submitted.error.message ?? text("Check your payment details.", "请检查付款信息。")); return; }
      setPhase("review");
      if (!await validate()) { setMessage(text("Your checkout changed. Review it before paying.", "结账信息已变化，请重新核对。")); return; }
      setPhase("authorization");
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/shop/checkout/return` }, redirect: "if_required" });
      if (error) { setMessage(error.message ?? text("Payment could not be confirmed. Try another payment method.", "无法确认付款，请尝试其他付款方式。")); return; }
      if (paymentIntent && ["succeeded", "requires_capture", "processing"].includes(paymentIntent.status)) { setPhase("order"); await complete(); }
      else setMessage(text("Payment still needs confirmation. Please follow the instructions above.", "付款仍需确认，请按上方提示操作。"));
    } catch { setMessage(text("We couldn't verify payment. Check the order status before trying again.", "暂时无法核验付款，请先检查订单状态，再尝试付款。")); }
    finally { active.current = false; onBusyChange?.(false); setBusy(false); }
  }}>
    {loading && <LoadingStatus className="mb-4 rounded-lg bg-[#f5f5f7] p-4 text-sm">{text("Loading secure payment…", "正在加载安全付款表单…")}</LoadingStatus>}
    <PaymentElement options={{ layout: "tabs" }} onReady={() => setElementState("ready")} onLoadError={() => setElementState("error")} />
    {elementState === "error" && <p role="alert" className="mt-4 text-sm text-red-700">{text("The secure payment form could not load. Check payment status before trying again.", "安全付款表单加载失败，请先检查付款状态后再重试。")}</p>}
    {busy && <LoadingStatus className="mt-4 text-sm text-[#666]">{pendingText}</LoadingStatus>}
    {message && <p role="alert" className="mt-4 text-sm text-red-700">{message}</p>}
    <button className="btn-primary mt-6 w-full gap-2" disabled={busy || loading || elementState === "error" || !stripe || !elements}>{(busy || loading) && <LoadingSpinner />}{busy ? text("Confirming…", "确认中…") : text(`Authorize ${formatStorePrice(total, lang)}`, `授权付款 ${formatStorePrice(total, lang)}`)}</button>
    <p className="mt-3 text-xs leading-relaxed text-[#666]">{text("Your payment details go directly to Stripe. SnowForce receives the authorization and captures payment through its order workflow.", "付款信息直接提交给 Stripe。SnowForce 收到支付授权后，通过后台订单流程收款。")}</p>
  </form>;
}
export default function StripeCheckoutForm({ clientSecret, publishableKey, total, validate, complete, onBusyChange }: Props) {
  const { lang } = useLanguage();
  const [failedKey, setFailedKey] = useState<string | null>(null);
  // Resolve a failed SDK load to null, then show a recoverable error instead of
  // leaving a spinner indefinitely or creating an unhandled rejected promise.
  const stripe = useMemo(() => loadStripe(publishableKey).catch(() => null), [publishableKey]);
  useEffect(() => {
    let current = true;
    void stripe.then(client => { if (current && !client) setFailedKey(publishableKey); });
    return () => { current = false; };
  }, [stripe, publishableKey]);
  if (failedKey === publishableKey) return <p role="alert" className="mt-4 text-sm text-red-700">{lang === "zh" ? "安全付款服务加载失败，请检查网络，并先检查付款状态后再重试。" : "The secure payment service could not load. Check your connection and payment status before trying again."}</p>;
  return <Elements key={`${clientSecret}:${lang}`} stripe={stripe} options={{ clientSecret, locale: lang === "zh" ? "zh" : "en", appearance: { theme: "stripe", variables: { colorPrimary: "#0066cc", borderRadius: "8px" } } }}><PaymentForm total={total} validate={validate} complete={complete} onBusyChange={onBusyChange} /></Elements>;
}
