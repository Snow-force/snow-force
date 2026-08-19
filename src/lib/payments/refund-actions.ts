"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/admin";
import { getStripeServer } from "@/lib/payments/stripe-server";
import {
  createRegistrationRefund,
  getRegistrationRefund,
  getRegistrationRefundByStripeId,
  getRegistrationRefunds,
  updateRegistrationRefund,
} from "@/lib/payments/refund-repository";
import {
  createRefundAndCancel,
  linkPaymentIntentToRegistration,
  verifyPaymentIntentForRegistration,
} from "@/lib/payments/refunds";
import {
  getRegistration,
  getRegistrations,
  updateRegistrationFinance,
  updateRegistrationStatus,
} from "@/lib/registrations/repository";
import type { RegistrationRefundReason } from "@/lib/types";

function dependencies() {
  return {
    stripe: getStripeServer(),
    getRegistration,
    getRegistrations,
    updateRegistrationFinance,
    updateRegistrationStatus,
    getRegistrationRefunds,
    getRegistrationRefund,
    getRegistrationRefundByStripeId,
    createRegistrationRefund,
    updateRegistrationRefund,
  };
}

export async function verifyLegacyPaymentAction(formData: FormData) {
  await requireSuperAdmin();
  const registrationId = String(formData.get("registrationId") ?? "").trim();
  const paymentIntentId = String(formData.get("paymentIntentId") ?? "").trim();
  const registration = await getRegistration(registrationId);
  if (!registration) return { success: false as const, error: "Registration not found." };
  return verifyPaymentIntentForRegistration(dependencies(), registration, paymentIntentId);
}

export async function linkLegacyPaymentAction(formData: FormData) {
  const staff = await requireSuperAdmin();
  const registrationId = String(formData.get("registrationId") ?? "").trim();
  const paymentIntentId = String(formData.get("paymentIntentId") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation !== "LINK") return { success: false as const, error: "Type LINK to confirm." };
  const registration = await getRegistration(registrationId);
  if (!registration) return { success: false as const, error: "Registration not found." };
  const result = await linkPaymentIntentToRegistration(
    dependencies(),
    registration,
    paymentIntentId,
    staff.userId,
  );
  if (result.success) revalidatePath("/admin/registrations");
  return result;
}

export async function refundRegistrationAction(formData: FormData) {
  const staff = await requireSuperAdmin();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation !== "REFUND") {
    return { success: false as const, error: "Type REFUND to confirm refund and cancellation." };
  }
  const reasonValue = String(formData.get("reason") ?? "requested_by_customer");
  const reason: RegistrationRefundReason = reasonValue === "duplicate" ? "duplicate" : "requested_by_customer";
  const result = await createRefundAndCancel(dependencies(), {
    operationId: String(formData.get("operationId") ?? "").trim(),
    registrationId: String(formData.get("registrationId") ?? "").trim(),
    amount: Number(formData.get("amount")),
    reason,
    internalNote: String(formData.get("internalNote") ?? ""),
    initiatedBy: staff.userId,
  });
  if (result.success) {
    revalidatePath("/admin/registrations");
    revalidatePath("/member");
  }
  return result;
}
