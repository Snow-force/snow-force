"use server";

/**
 * Merchant authentication server actions.
 *
 * This module is the merchant counterpart of `src/lib/members/actions.ts`.
 * The two flows are intentionally isolated:
 *
 *   - The merchant flow never auto-creates a `public.member_profiles` row.
 *     A merchant user is identified solely by the existence of a row in
 *     `public.merchant_profiles` linked by `user_id`.
 *   - The merchant flow never uses `auth.users.raw_user_meta_data` for
 *     authorization. The user-editable metadata surface could otherwise be
 *     exploited to self-claim roles. Authorization here is derived from
 *     `auth.users.email_confirmed_at` (set by Supabase on email confirmation)
 *     and the merchant profile row.
 *   - All post-authentication redirects flow through the merchant sanitizer
 *     so the same open-redirect protection used for members also covers
 *     merchants.
 *
 * Server actions in this file are imported by client components to handle
 * sign-up, sign-in, magic-link, OAuth, password reset, verification, profile
 * update, and sign-out.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  MerchantProfileError,
  createMerchantProfile,
  getMerchantProfileByUserId,
  updateMerchantProfile,
} from "./profile-repository";
import {
  createMerchantAuthAccount,
  type MerchantAuthAccount,
} from "./auth-boundary";
import { merchantAuthCallbackUrl, sanitizeMerchantNextPath } from "./auth-results";
import {
  parseMerchantEmail,
  parseMerchantEntry,
  parseMerchantMagicLink,
  parseMerchantPasswordUpdate,
  parseMerchantProfileUpdate,
} from "./merchant-entry";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function merchantCallback(path: string): string {
  return merchantAuthCallbackUrl(siteUrl(), path);
}

function hasMerchantAuthCookie(): boolean {
  return cookies()
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
}

function nextPathFromForm(formData: FormData): string {
  return sanitizeMerchantNextPath(String(formData.get("next") ?? ""));
}

export async function getCurrentMerchantAccount(): Promise<MerchantAuthAccount | null> {
  if (!hasMerchantAuthCookie()) {
    return null;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Authorization: server-derived only.
  // - `emailConfirmed` comes from `auth.users.email_confirmed_at`, set by
  //   Supabase on confirmation link click. It is never user-editable.
  // - The merchant profile comes from `public.merchant_profiles` (server-side
  //   query). It is NOT read from `raw_user_meta_data` and is NOT created
  //   here. A missing profile is allowed; the action layer will redirect
  //   to onboarding when the profile is required.
  const profile = await getMerchantProfileByUserId(user.id);
  return createMerchantAuthAccount({ user, profile });
}

export async function getCurrentMerchantProfile() {
  const account = await getCurrentMerchantAccount();
  return account?.profile ?? null;
}

export async function requireVerifiedMerchantAccount(): Promise<MerchantAuthAccount> {
  const account = await getCurrentMerchantAccount();
  if (!account) {
    redirect("/merchant?error=login");
  }
  if (!account.emailConfirmed) {
    redirect("/merchant?error=verification-email");
  }
  if (!account.profile) {
    redirect("/merchant?error=profile");
  }
  return account;
}

export async function registerMerchantAccount(formData: FormData) {
  const entry = parseMerchantEntry("register", formData);
  if (!entry.success) {
    redirect(`/merchant?error=${entry.error}`);
  }

  const supabase = createClient();
  // We intentionally do NOT pass `data: { role: 'merchant' }` here.
  // `user_metadata` is user-editable on the client and would let a
  // merchant self-promote; the merchant role here is implied by ownership
  // of a `merchant_profiles` row (RLS-enforced) and a confirmed email.
  const { data, error } = await supabase.auth.signUp({
    email: entry.email,
    password: entry.password,
    options: {
      data: {
        contact_name: entry.contactName,
        business_name: entry.businessName,
      },
      emailRedirectTo: merchantCallback(nextPathFromForm(formData)),
    },
  });

  if (error || !data.user) {
    redirect("/merchant?error=register");
  }

  // Pre-create the merchant profile so a verified merchant can immediately
  // access booth-management actions without an extra onboarding step.
  // We do NOT touch `member_profiles` here; that table is the rider/member
  // boundary and is owned by `src/lib/members/actions.ts`.
  try {
    await createMerchantProfile({
      userId: data.user.id,
      businessName: entry.businessName,
      contactName: entry.contactName,
      contactEmail: entry.email,
      contactPhone: "",
      category: entry.category,
      description: "",
    });
  } catch (err) {
    if (!(err instanceof MerchantProfileError) || err.code !== "duplicate") {
      // Roll the auth user back? No - Supabase does not expose a client
      // delete here, and silently failing is worse than a redirect. The
      // auth user is harmless without a confirmed email.
      redirect("/merchant?error=register");
    }
  }

  revalidatePath("/merchant");
  redirect("/merchant?registered=1");
}

export async function loginMerchantAccount(formData: FormData) {
  const entry = parseMerchantEntry("login", formData);
  if (!entry.success) {
    redirect(`/merchant?error=${entry.error}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: entry.email,
    password: entry.password,
  });
  if (error) {
    redirect("/merchant?error=login");
  }

  revalidatePath("/", "layout");
  redirect(nextPathFromForm(formData));
}

export async function loginMerchantWithGoogle(formData: FormData) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: merchantCallback(nextPathFromForm(formData)),
    },
  });
  if (error || !data.url) {
    redirect("/merchant?error=oauth");
  }

  redirect(data.url);
}

export async function requestMerchantMagicLink(formData: FormData) {
  const entry = parseMerchantMagicLink(formData);
  if (!entry.success) {
    redirect("/merchant?error=magic");
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: entry.email,
    options: {
      emailRedirectTo: merchantCallback(nextPathFromForm(formData)),
    },
  });
  if (error) {
    redirect("/merchant?error=magic");
  }

  redirect("/merchant?magicSent=1");
}

export async function requestMerchantPasswordReset(formData: FormData) {
  const entry = parseMerchantEmail(formData);
  if (!entry.success) {
    redirect("/merchant/forgot-password?error=email");
  }

  const supabase = createClient();
  await supabase.auth.resetPasswordForEmail(entry.email, {
    redirectTo: merchantCallback("/merchant/reset-password"),
  });

  redirect("/merchant/forgot-password?sent=1");
}

export async function resendMerchantVerification(formData: FormData) {
  const entry = parseMerchantEmail(formData);
  if (!entry.success) {
    redirect("/merchant?error=verification-email");
  }

  const supabase = createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: entry.email,
    options: {
      emailRedirectTo: merchantCallback("/merchant"),
    },
  });
  if (error) {
    redirect("/merchant?error=verification-email");
  }

  redirect("/merchant?verificationSent=1");
}

export async function resetMerchantPassword(formData: FormData) {
  const entry = parseMerchantPasswordUpdate(formData);
  if (!entry.success) {
    redirect(`/merchant/reset-password?error=${entry.error}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: entry.password });
  if (error) {
    redirect("/merchant/reset-password?error=session");
  }

  revalidatePath("/merchant");
  redirect("/merchant?passwordReset=1");
}

export async function saveMerchantProfile(formData: FormData) {
  const account = await getCurrentMerchantAccount();
  if (!account) redirect("/merchant?error=login");
  if (!account.emailConfirmed) redirect("/merchant?error=verification-email");
  if (!account.profile) redirect("/merchant?error=profile");

  const entry = parseMerchantProfileUpdate(formData);
  if (!entry.success) {
    redirect(`/merchant/settings?profileError=${entry.error}`);
  }

  const updated = await updateMerchantProfile(account.user.id, entry.data);
  if (!updated) {
    redirect("/merchant/settings?profileError=missing");
  }

  revalidatePath("/merchant");
  revalidatePath("/merchant/settings");
  redirect("/merchant/settings?profileSaved=1");
}

export async function logoutMerchant() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/merchant");
}

/* -------------------------------------------------------------------------- */
/* Merchant application, allocation, and offline-payment state machine         */
/* -------------------------------------------------------------------------- */

import { requireAdmin, getCurrentStaffAccount } from "@/lib/auth/admin";
import {
  allocateMerchantBoothResult,
  approveMerchantApplicationResult,
  publishBoothInstructionsResult,
  recordMerchantManualPaymentResult,
  reviewMerchantApplicationResult,
  submitMerchantApplicationResult,
  withdrawMerchantApplicationResult,
  type MerchantStateResult,
  __setMerchantStateDepsForTests,
} from "./application-state";

function refreshMerchantPaths(eventSlug: string | null) {
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath("/merchant");
  revalidatePath("/merchant/applications");
  revalidatePath("/merchant/dashboard");
  if (eventSlug) {
    revalidatePath(`/events/${eventSlug}`);
  }
}

function refreshAdminPaths(eventSlug: string | null) {
  revalidatePath("/admin");
  revalidatePath("/admin/merchants");
  revalidatePath("/admin/events");
  revalidatePath("/merchant");
  revalidatePath("/merchant/applications");
  revalidatePath("/merchant/dashboard");
  if (eventSlug) {
    revalidatePath(`/events/${eventSlug}`);
  }
}

function adminMerchantRedirect(formData: FormData, params: Record<string, string>): never {
  const query = new URLSearchParams(params);
  const event = String(formData.get("returnEvent") ?? "").trim();
  const status = String(formData.get("returnStatus") ?? "").trim();
  if (event) query.set("event", event);
  if (status) query.set("status", status);
  redirect(`/admin/merchants?${query.toString()}`);
}

function statusToQuery(code: string): string {
  return code.toLowerCase().replace(/_/g, "-");
}

function merchantErrorRedirect(target: string, code: string): never {
  redirect(`${target}?error=${statusToQuery(code)}`);
}

function merchantSuccessRedirect(target: string, params: Record<string, string>): never {
  const query = new URLSearchParams(params);
  redirect(`${target}?${query.toString()}`);
}

export async function submitMerchantApplicationAction(formData: FormData): Promise<never> {
  const account = await getCurrentMerchantAccount();
  const result = await submitMerchantApplicationResult(account, formData);
  if (!result.success) {
    merchantErrorRedirect("/merchant/applications", result.code);
  }
  refreshMerchantPaths(formData.get("eventSlug") ? String(formData.get("eventSlug")) : null);
  merchantSuccessRedirect("/merchant/applications", {
    submitted: "1",
    applicationId: result.applicationId,
  });
}

export async function withdrawMerchantApplicationAction(formData: FormData): Promise<never> {
  const account = await getCurrentMerchantAccount();
  const result = await withdrawMerchantApplicationResult(account, formData);
  if (!result.success) {
    merchantErrorRedirect("/merchant/applications", result.code);
  }
  refreshMerchantPaths(null);
  merchantSuccessRedirect("/merchant/applications", { withdrawn: "1" });
}

export async function reviewMerchantApplicationAction(formData: FormData): Promise<never> {
  await requireAdmin();
  const staff = await getCurrentStaffAccount();
  const result = await reviewMerchantApplicationResult(
    staff ? { userId: staff.userId, email: staff.email } : null,
    formData,
  );
  if (!result.success) {
    adminMerchantRedirect(formData, { error: statusToQuery(result.code) });
  }
  refreshAdminPaths(result.eventSlug);
  adminMerchantRedirect(formData, { reviewed: "1" });
}

export async function approveMerchantApplicationAction(formData: FormData): Promise<never> {
  await requireAdmin();
  const staff = await getCurrentStaffAccount();
  const result = await approveMerchantApplicationResult(
    staff ? { userId: staff.userId, email: staff.email } : null,
    formData,
  );
  if (!result.success) {
    adminMerchantRedirect(formData, { error: statusToQuery(result.code) });
  }
  refreshAdminPaths(result.application.eventSlug);
  adminMerchantRedirect(formData, { approved: "1" });
}

export async function allocateMerchantBoothAction(formData: FormData): Promise<never> {
  await requireAdmin();
  const staff = await getCurrentStaffAccount();
  const result = await allocateMerchantBoothResult(
    staff ? { userId: staff.userId, email: staff.email } : null,
    formData,
  );
  if (!result.success) {
    adminMerchantRedirect(formData, { error: statusToQuery(result.code) });
  }
  refreshAdminPaths(result.application.eventSlug);
  adminMerchantRedirect(formData, { allocated: "1" });
}

export async function publishBoothInstructionsAction(formData: FormData): Promise<never> {
  await requireAdmin();
  const staff = await getCurrentStaffAccount();
  const result = await publishBoothInstructionsResult(
    staff ? { userId: staff.userId, email: staff.email } : null,
    formData,
  );
  if (!result.success) {
    adminMerchantRedirect(formData, { error: statusToQuery(result.code) });
  }
  refreshAdminPaths(result.eventSlug);
  adminMerchantRedirect(formData, { instructionsPublished: "1" });
}

export async function recordMerchantManualPaymentAction(formData: FormData): Promise<never> {
  await requireAdmin();
  const staff = await getCurrentStaffAccount();
  const result = await recordMerchantManualPaymentResult(
    staff ? { userId: staff.userId, email: staff.email } : null,
    formData,
  );
  if (!result.success) {
    adminMerchantRedirect(formData, { error: statusToQuery(result.code) });
  }
  refreshAdminPaths(result.eventSlug);
  adminMerchantRedirect(formData, { paymentRecorded: "1" });
}

export type MerchantStateResultSnapshot = MerchantStateResult;

/**
 * Test seam: lets Vitest swap the merchant state-machine dependencies
 * (repository, event lookup, clock). Always reset between tests.
 */
export { __setMerchantStateDepsForTests };
