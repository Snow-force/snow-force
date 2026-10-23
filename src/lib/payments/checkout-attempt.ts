import type Stripe from "stripe";
import type { PaymentCurrency } from "@/lib/types";

/** Stored before calling Stripe; retries must use exactly these parameters. */
export type CheckoutAttempt = {
  id: string;
  createdAt: string;
  params: Stripe.Checkout.SessionCreateParams;
  amount: number;
  currency: PaymentCurrency;
  paymentModel: "deposit" | "full_prepay";
  couponCode: string;
  discountAmount: number;
  sessionId?: string;
};

/** Result shown after the signed Stripe session is verified for its owner. */
export type VerifiedPaymentStatus = "confirmed" | "approval_pending" | "processing" | "review" | "invalid";
