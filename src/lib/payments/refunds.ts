import "server-only";

import type Stripe from "stripe";
import type {
  PaymentCurrency,
  Registration,
  RegistrationRefund,
  RegistrationRefundReason,
  RegistrationRefundStatus,
} from "@/lib/types";
import { normalizeRegistrationFinance } from "@/lib/registrations/finance";
import type { RegistrationFinanceInput } from "@/lib/registrations/finance";
import type {
  NewRegistrationRefund,
  RegistrationRefundUpdate,
} from "@/lib/payments/refund-repository";

const supportedCurrencies: PaymentCurrency[] = [
  "usd",
  "cny",
  "eur",
  "gbp",
  "jpy",
];
const inFlightStatuses: RegistrationRefundStatus[] = [
  "creating",
  "pending",
  "requires_action",
];

export type PaymentLinkPreview = {
  paymentIntentId: string;
  checkoutSessionId: string;
  amount: number;
  refundedAmount: number;
  refundableAmount: number;
  currency: PaymentCurrency;
  customerEmail: string;
  createdAt: string;
};

export type RefundOperationResult =
  | { success: true; refund: RegistrationRefund; warning?: string }
  | { success: false; error: string; requiresReview?: boolean };

export type PaymentLinkResult =
  | { success: true; preview: PaymentLinkPreview }
  | { success: false; error: string };

type RefundRepositoryDeps = {
  getRegistrationRefunds: (
    registrationId?: string,
  ) => Promise<RegistrationRefund[]>;
  getRegistrationRefund: (
    id: string,
  ) => Promise<RegistrationRefund | undefined>;
  getRegistrationRefundByStripeId: (
    id: string,
  ) => Promise<RegistrationRefund | undefined>;
  createRegistrationRefund: (
    input: NewRegistrationRefund,
  ) => Promise<RegistrationRefund>;
  updateRegistrationRefund: (
    id: string,
    input: RegistrationRefundUpdate,
  ) => Promise<RegistrationRefund | undefined>;
};

export type RefundServiceDeps = RefundRepositoryDeps & {
  stripe: Stripe;
  getRegistration: (id: string) => Promise<Registration | undefined>;
  getRegistrations: () => Promise<Registration[]>;
  updateRegistrationFinance: (
    id: string,
    input: RegistrationFinanceInput,
  ) => Promise<Registration | undefined>;
  updateRegistrationStatus: (
    id: string,
    status: Registration["status"],
  ) => Promise<Registration | undefined>;
};

export type RefundRequestInput = {
  operationId: string;
  registrationId: string;
  amount: number;
  reason: RegistrationRefundReason;
  internalNote: string;
  initiatedBy: string;
};

function asCurrency(value: string): PaymentCurrency | null {
  return supportedCurrencies.includes(value as PaymentCurrency)
    ? (value as PaymentCurrency)
    : null;
}

export function toSmallestCurrencyUnit(
  amount: number,
  currency: PaymentCurrency,
) {
  return currency === "jpy" ? Math.round(amount) : Math.round(amount * 100);
}

export function fromSmallestCurrencyUnit(
  amount: number,
  currency: PaymentCurrency,
) {
  return currency === "jpy" ? amount : amount / 100;
}

function chargeFromPaymentIntent(paymentIntent: Stripe.PaymentIntent) {
  return typeof paymentIntent.latest_charge === "object" &&
    paymentIntent.latest_charge
    ? paymentIntent.latest_charge
    : null;
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function stripeRefundStatus(
  status: Stripe.Refund["status"],
): RegistrationRefundStatus {
  if (
    status === "pending" ||
    status === "requires_action" ||
    status === "succeeded" ||
    status === "failed" ||
    status === "canceled"
  ) {
    return status;
  }
  return "pending";
}

function stripeRefundReason(
  reason: Stripe.Refund["reason"],
): RegistrationRefundReason {
  return reason === "duplicate" ? "duplicate" : "requested_by_customer";
}

function stripeFailureReason(refund: Stripe.Refund) {
  return refund.failure_reason ?? "";
}

async function retrievePayment(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<{ paymentIntent: Stripe.PaymentIntent; charge: Stripe.Charge }> {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });
  const charge = chargeFromPaymentIntent(paymentIntent);
  if (paymentIntent.status !== "succeeded" || !charge || !charge.paid) {
    throw new Error("Stripe payment is not a completed charge.");
  }
  return { paymentIntent, charge };
}

export async function verifyPaymentIntentForRegistration(
  deps: Pick<RefundServiceDeps, "stripe" | "getRegistrations">,
  registration: Registration,
  paymentIntentId: string,
): Promise<PaymentLinkResult> {
  if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) {
    return { success: false, error: "Enter a valid Stripe PaymentIntent ID." };
  }

  const alreadyLinked = (await deps.getRegistrations()).find(
    (item) =>
      item.id !== registration.id &&
      normalizeRegistrationFinance(item.finance).stripePaymentIntentId ===
        paymentIntentId,
  );
  if (alreadyLinked) {
    return {
      success: false,
      error: "This PaymentIntent is already linked to another registration.",
    };
  }

  try {
    const { paymentIntent, charge } = await retrievePayment(
      deps.stripe,
      paymentIntentId,
    );
    const currency = asCurrency(charge.currency);
    if (!currency)
      return {
        success: false,
        error: "This payment uses an unsupported currency.",
      };

    const sessions = await deps.stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1,
    });
    const session = sessions.data[0];
    if (!session || session.payment_status !== "paid") {
      return {
        success: false,
        error: "No completed Checkout Session was found for this payment.",
      };
    }

    if (session.metadata?.eventSlug !== registration.eventSlug) {
      return {
        success: false,
        error: "The Stripe payment belongs to a different event.",
      };
    }
    const bookerId = registration.bookerMemberId ?? registration.memberId;
    if (bookerId && session.metadata?.memberId !== bookerId) {
      return {
        success: false,
        error: "The Stripe payment belongs to a different member.",
      };
    }
    if (
      registration.registrationKind === "proxy" &&
      (!registration.pendingRegistrationId ||
        session.metadata?.pendingRegistrationId !==
          registration.pendingRegistrationId)
    ) {
      return {
        success: false,
        error: "The Stripe payment belongs to a different attendee.",
      };
    }

    const stripeEmail = normalizeEmail(session.customer_details?.email);
    if (
      registration.registrationKind !== "proxy" &&
      stripeEmail &&
      stripeEmail !== normalizeEmail(registration.contactEmail)
    ) {
      return {
        success: false,
        error: "The Stripe customer email does not match this registration.",
      };
    }

    const finance = normalizeRegistrationFinance(registration.finance);
    const paidAmount = fromSmallestCurrencyUnit(
      charge.amount_captured,
      currency,
    );
    if (
      finance.depositAmount !== null &&
      paidAmount !== finance.depositAmount
    ) {
      return {
        success: false,
        error: "The Stripe amount does not match the registration payment.",
      };
    }

    const refundedAmount = fromSmallestCurrencyUnit(
      charge.amount_refunded,
      currency,
    );
    return {
      success: true,
      preview: {
        paymentIntentId: paymentIntent.id,
        checkoutSessionId: session.id,
        amount: paidAmount,
        refundedAmount,
        refundableAmount: Math.max(0, paidAmount - refundedAmount),
        currency,
        customerEmail:
          session.customer_details?.email ?? registration.contactEmail,
        createdAt: new Date(paymentIntent.created * 1000).toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not verify Stripe payment.",
    };
  }
}

async function importStripeRefunds(
  deps: RefundServiceDeps,
  registration: Registration,
  paymentIntentId: string,
  initiatedBy: string,
) {
  const refunds = await deps.stripe.refunds.list({
    payment_intent: paymentIntentId,
    limit: 100,
  });
  let importedAny = false;
  for (const refund of refunds.data) {
    const currency = asCurrency(refund.currency);
    if (!currency || (await deps.getRegistrationRefundByStripeId(refund.id)))
      continue;
    const created = await deps.createRegistrationRefund({
      id: crypto.randomUUID(),
      registrationId: registration.id,
      stripePaymentIntentId: paymentIntentId,
      amount: fromSmallestCurrencyUnit(refund.amount, currency),
      currency,
      status: stripeRefundStatus(refund.status),
      reason: stripeRefundReason(refund.reason),
      internalNote: "Imported from Stripe while linking historical payment.",
      initiatedBy,
    });
    await deps.updateRegistrationRefund(created.id, {
      stripeRefundId: refund.id,
      failureReason: stripeFailureReason(refund),
    });
    importedAny = true;
  }
  return importedAny;
}

export async function linkPaymentIntentToRegistration(
  deps: RefundServiceDeps,
  registration: Registration,
  paymentIntentId: string,
  initiatedBy: string,
): Promise<PaymentLinkResult> {
  const verification = await verifyPaymentIntentForRegistration(
    deps,
    registration,
    paymentIntentId,
  );
  if (!verification.success) return verification;

  const { preview } = verification;
  await deps.updateRegistrationFinance(registration.id, {
    paymentMethod: "stripe",
    paymentCurrency: preview.currency,
    stripeCheckoutSessionId: preview.checkoutSessionId,
    stripePaymentIntentId: preview.paymentIntentId,
    refundedAmount: preview.refundedAmount,
    depositStatus: preview.refundableAmount === 0 ? "refunded" : "paid",
  });
  const importedRefund = await importStripeRefunds(
    deps,
    registration,
    paymentIntentId,
    initiatedBy,
  );
  // Historical or external refunds do not imply cancellation approval.
  void importedRefund;
  return verification;
}

function isUnknownStripeOutcome(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const type = "type" in error ? String(error.type) : "";
  return type === "StripeConnectionError" || type === "StripeAPIError";
}

export async function createRefundAndCancel(
  deps: RefundServiceDeps,
  input: RefundRequestInput,
): Promise<RefundOperationResult> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.operationId,
    )
  ) {
    return { success: false, error: "Invalid refund operation ID." };
  }
  const registration = await deps.getRegistration(input.registrationId);
  if (!registration)
    return { success: false, error: "Registration not found." };
  const finance = normalizeRegistrationFinance(registration.finance);
  if (finance.paymentMethod !== "stripe" || !finance.stripePaymentIntentId) {
    return {
      success: false,
      error: "This registration is not linked to a Stripe payment.",
    };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return {
      success: false,
      error: "Refund amount must be greater than zero.",
    };
  }
  if (!input.internalNote.trim()) {
    return { success: false, error: "Add an internal refund note." };
  }

  const existingOperation = await deps.getRegistrationRefund(input.operationId);
  if (
    existingOperation &&
    (existingOperation.registrationId !== registration.id ||
      existingOperation.amount !== input.amount ||
      existingOperation.stripePaymentIntentId !== finance.stripePaymentIntentId)
  ) {
    return {
      success: false,
      error: "Refund operation does not match this payment and amount.",
    };
  }
  if (existingOperation) {
    // Recover the provider result before checking the remaining balance: the
    // original call may have succeeded even when its response was lost.
    let recovered: Stripe.Refund | undefined;
    try {
      if (existingOperation.stripeRefundId) {
        recovered = await deps.stripe.refunds.retrieve(
          existingOperation.stripeRefundId,
        );
      } else {
        let cursor: string | undefined;
        let exhausted = false;
        for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
          const page = await deps.stripe.refunds.list({
            payment_intent: finance.stripePaymentIntentId,
            limit: 100,
            ...(cursor ? { starting_after: cursor } : {}),
          });
          recovered = page.data.find(
            (refund) =>
              refund.metadata?.refundRequestId === existingOperation.id,
          );
          if (recovered || !page.has_more) {
            exhausted = true;
            break;
          }
          const nextCursor = page.data.at(-1)?.id;
          if (!nextCursor || nextCursor === cursor) break;
          cursor = nextCursor;
        }
        if (!exhausted)
          return {
            success: false,
            error:
              "Stripe refund history could not be fully checked. Review before retrying.",
            requiresReview: true,
          };
      }
      if (recovered) {
        const intentId =
          typeof recovered.payment_intent === "string"
            ? recovered.payment_intent
            : recovered.payment_intent?.id;
        const currency = asCurrency(recovered.currency);
        if (
          (recovered.metadata?.refundRequestId &&
            recovered.metadata.refundRequestId !== existingOperation.id) ||
          intentId !== finance.stripePaymentIntentId ||
          !currency ||
          (finance.paymentCurrency && currency !== finance.paymentCurrency) ||
          recovered.amount !==
            toSmallestCurrencyUnit(existingOperation.amount, currency) ||
          (!existingOperation.stripeRefundId &&
            recovered.metadata?.registrationId !== registration.id)
        ) {
          return {
            success: false,
            error:
              "Recovered refund does not match this approved payment and amount.",
            requiresReview: true,
          };
        }
        await reconcileStripeRefund(deps, recovered);
        const updated = await deps.getRegistrationRefund(existingOperation.id);
        if (!updated) throw new Error("Refund reconciliation needs review.");
        if (["failed", "canceled"].includes(updated.status))
          return {
            success: false,
            error:
              "This refund failed or was cancelled. Review it in Stripe before a new operation.",
            requiresReview: true,
          };
        return { success: true, refund: updated };
      }
    } catch {
      return {
        success: false,
        error:
          "Could not verify the original Stripe refund. No new refund was submitted.",
        requiresReview: true,
      };
    }
    // Stripe can prune idempotency keys after 24 hours. Never re-create an
    // uncertain operation beyond a conservative 23-hour retry window.
    const age = Date.now() - Date.parse(existingOperation.createdAt);
    if (
      !Number.isFinite(age) ||
      age < 0 ||
      age >= 23 * 60 * 60 * 1000 ||
      ["failed", "canceled"].includes(existingOperation.status)
    ) {
      return {
        success: false,
        error:
          "Original refund outcome requires manual Stripe review; its safe retry window has ended or the operation is closed.",
        requiresReview: true,
      };
    }
  }
  const inFlight = (await deps.getRegistrationRefunds(registration.id)).find(
    (refund) => inFlightStatuses.includes(refund.status),
  );
  if (inFlight && inFlight.id !== input.operationId) {
    return {
      success: false,
      error: "Another refund is still being processed for this registration.",
    };
  }

  let payment: { paymentIntent: Stripe.PaymentIntent; charge: Stripe.Charge };
  try {
    payment = await retrievePayment(deps.stripe, finance.stripePaymentIntentId);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not retrieve Stripe payment.",
    };
  }
  const currency = asCurrency(payment.charge.currency);
  if (
    !currency ||
    (finance.paymentCurrency && finance.paymentCurrency !== currency)
  ) {
    return {
      success: false,
      error: "Stripe payment currency does not match the registration.",
    };
  }
  const requestedUnits = toSmallestCurrencyUnit(input.amount, currency);
  const remainingUnits =
    payment.charge.amount_captured - payment.charge.amount_refunded;
  if (requestedUnits <= 0 || requestedUnits > remainingUnits) {
    return {
      success: false,
      error: "Refund amount exceeds the remaining refundable balance.",
    };
  }

  let request = existingOperation;
  if (!request) {
    request = await deps.createRegistrationRefund({
      id: input.operationId,
      registrationId: registration.id,
      stripePaymentIntentId: finance.stripePaymentIntentId,
      amount: fromSmallestCurrencyUnit(requestedUnits, currency),
      currency,
      status: "creating",
      reason: input.reason,
      internalNote: input.internalNote.trim(),
      initiatedBy: input.initiatedBy,
    });
  }

  let stripeRefund: Stripe.Refund;
  try {
    stripeRefund = await deps.stripe.refunds.create(
      {
        payment_intent: finance.stripePaymentIntentId,
        amount: requestedUnits,
        reason: request.reason,
        metadata: {
          registrationId: registration.id,
          refundRequestId: request.id,
          initiatedBy: request.initiatedBy ?? input.initiatedBy,
        },
      },
      { idempotencyKey: `snowforce-refund-${request.id}` },
    );
  } catch (error) {
    if (isUnknownStripeOutcome(error)) {
      return {
        success: false,
        error:
          "Stripe outcome is unknown. Retry this same request before creating another refund.",
        requiresReview: true,
      };
    }
    await deps.updateRegistrationRefund(request.id, {
      status: "failed",
      failureReason:
        error instanceof Error ? error.message : "Stripe rejected the refund.",
    });
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Stripe rejected the refund.",
    };
  }

  const status = stripeRefundStatus(stripeRefund.status);
  let updated: RegistrationRefund | undefined;
  let warning = "";
  try {
    updated = await deps.updateRegistrationRefund(request.id, {
      stripeRefundId: stripeRefund.id,
      status,
      failureReason: stripeFailureReason(stripeRefund),
    });
    if (!updated)
      warning =
        "Stripe created the refund, but its audit record needs webhook reconciliation.";
  } catch {
    warning =
      "Stripe created the refund, but its audit record needs webhook reconciliation.";
  }

  const auditRefund: RegistrationRefund = updated ?? {
    ...request,
    stripeRefundId: stripeRefund.id,
    status,
    failureReason: stripeFailureReason(stripeRefund),
  };
  const succeededAmount = status === "succeeded" ? request.amount : 0;
  const refundedAmount = Math.min(
    fromSmallestCurrencyUnit(payment.charge.amount_captured, currency),
    finance.refundedAmount + succeededAmount,
  );
  try {
    await deps.updateRegistrationFinance(registration.id, {
      refundedAmount,
      depositStatus:
        toSmallestCurrencyUnit(refundedAmount, currency) >=
        payment.charge.amount_captured
          ? "refunded"
          : "paid",
    });
  } catch {
    warning ||=
      "Stripe created the refund, but finance totals need webhook reconciliation.";
  }

  try {
    await deps.updateRegistrationStatus(registration.id, "cancelled");
  } catch {
    warning ||=
      "Stripe created the refund, but cancellation is waiting for webhook reconciliation.";
  }
  return {
    success: true,
    refund: auditRefund,
    ...(warning ? { warning } : {}),
  };
}

export async function reconcileStripeRefund(
  deps: Omit<RefundServiceDeps, "stripe">,
  refund: Stripe.Refund,
) {
  const paymentIntentId =
    typeof refund.payment_intent === "string"
      ? refund.payment_intent
      : refund.payment_intent?.id;
  if (!paymentIntentId) return;

  const registration = (await deps.getRegistrations()).find(
    (item) =>
      normalizeRegistrationFinance(item.finance).stripePaymentIntentId ===
      paymentIntentId,
  );
  if (!registration) return;
  const currency = asCurrency(refund.currency);
  if (!currency) return;

  const requestId = refund.metadata?.refundRequestId;
  let localRefund = requestId
    ? await deps.getRegistrationRefund(requestId)
    : undefined;
  localRefund ??= await deps.getRegistrationRefundByStripeId(refund.id);
  if (!localRefund) {
    localRefund = await deps.createRegistrationRefund({
      id: crypto.randomUUID(),
      registrationId: registration.id,
      stripePaymentIntentId: paymentIntentId,
      amount: fromSmallestCurrencyUnit(refund.amount, currency),
      currency,
      status: stripeRefundStatus(refund.status),
      reason: stripeRefundReason(refund.reason),
      internalNote: "Imported from Stripe webhook.",
      initiatedBy: null,
    });
  }
  await deps.updateRegistrationRefund(localRefund.id, {
    stripeRefundId: refund.id,
    status: stripeRefundStatus(refund.status),
    amount: fromSmallestCurrencyUnit(refund.amount, currency),
    currency,
    failureReason: stripeFailureReason(refund),
  });

  const rows = await deps.getRegistrationRefunds(registration.id);
  const refundedAmount = rows
    .filter((row) =>
      row.id === localRefund?.id
        ? refund.status === "succeeded"
        : row.status === "succeeded",
    )
    .reduce(
      (sum, row) =>
        sum +
        (row.id === localRefund?.id
          ? fromSmallestCurrencyUnit(refund.amount, currency)
          : row.amount),
      0,
    );
  const finance = normalizeRegistrationFinance(registration.finance);
  await deps.updateRegistrationFinance(registration.id, {
    refundedAmount,
    depositStatus:
      finance.depositAmount !== null && refundedAmount >= finance.depositAmount
        ? "refunded"
        : "paid",
  });
  // External Stripe refunds synchronize money only; approval owns capacity.
  if (
    localRefund.initiatedBy &&
    refund.status !== "failed" &&
    refund.status !== "canceled"
  ) {
    await deps.updateRegistrationStatus(registration.id, "cancelled");
  }
}
