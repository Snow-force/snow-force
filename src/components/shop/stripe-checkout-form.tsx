"use client";

import { useMemo, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import { useLanguage } from "@/lib/language";
import { formatStorePrice } from "@/lib/shop/storefront";

type Props = { clientSecret: string; publishableKey: string; total: number; validate: () => Promise<boolean>; complete: () => Promise<void>; onBusyChange?: (busy: boolean) => void };
function PaymentForm({ total, validate, complete, onBusyChange }: Omit<Props, "clientSecret" | "publishableKey">) {
  const stripe = useStripe();
  const elements = useElements();
  const { lang } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(false);
  const text = (en: string, zh: string) => lang === "zh" ? zh : en;
  return <form aria-busy={busy} onSubmit={async (event) => {
    event.preventDefault();
    if (!stripe || !elements || active.current) return;
    active.current = true; onBusyChange?.(true); setBusy(true); setMessage("");
    try {
      const submitted = await elements.submit();
      if (submitted.error) { setMessage(submitted.error.message ?? text("Check your payment details.", "请检查付款信息。")); return; }
      if (!await validate()) { setMessage(text("Your checkout changed. Review it before paying.", "结账信息已变化，请重新核对。")); return; }
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/shop/checkout/return` }, redirect: "if_required" });
      if (error) { setMessage(error.message ?? text("Payment could not be confirmed. Try another payment method.", "无法确认付款，请尝试其他付款方式。")); return; }
      if (paymentIntent && ["succeeded", "requires_capture", "processing"].includes(paymentIntent.status)) await complete();
      else setMessage(text("Payment still needs confirmation. Please follow the instructions above.", "付款仍需确认，请按上方提示操作。"));
    } catch { setMessage(text("We couldn't verify payment. Check the order status before trying again.", "暂时无法核验付款，请先检查订单状态，再尝试付款。")); }
    finally { active.current = false; onBusyChange?.(false); setBusy(false); }
  }}>
    <PaymentElement options={{ layout: "tabs" }} />
    {message && <p role="alert" className="mt-4 text-sm text-red-700">{message}</p>}
    <button className="btn-primary mt-6 w-full" disabled={busy || !stripe || !elements}>{busy ? text("Confirming…", "确认中…") : text(`Authorize ${formatStorePrice(total, lang)}`, `授权付款 ${formatStorePrice(total, lang)}`)}</button>
    <p className="mt-3 text-xs leading-relaxed text-[#666]">{text("Your payment details go directly to Stripe. SnowForce receives the authorization and captures payment through its order workflow.", "付款信息直接提交给 Stripe。SnowForce 收到支付授权后，通过后台订单流程收款。")}</p>
  </form>;
}
export default function StripeCheckoutForm({ clientSecret, publishableKey, total, validate, complete, onBusyChange }: Props) {
  const { lang } = useLanguage();
  const stripe = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  return <Elements key={`${clientSecret}:${lang}`} stripe={stripe} options={{ clientSecret, locale: lang === "zh" ? "zh" : "en", appearance: { theme: "stripe", variables: { colorPrimary: "#0066cc", borderRadius: "8px" } } }}><PaymentForm total={total} validate={validate} complete={complete} onBusyChange={onBusyChange} /></Elements>;
}
