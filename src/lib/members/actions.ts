"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasRemainingCapacity, isEventOpen } from "@/lib/events/availability";
import { getEvent } from "@/lib/events/repository";
import { buildStaffNotificationEmail, sendEmail } from "@/lib/email/adapter";
import {
  deletePendingRegistration,
  getPendingRegistrationsByMember,
} from "@/lib/registrations/pending-repository";
import {
  createRegistration,
  getRegistrationCountForEvent,
  getRegistrations,
} from "@/lib/registrations/repository";
import { createWaiverAcceptance } from "@/lib/registrations/waiver-repository";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMemberProfile, updateMemberProfile } from "./repository";
import { memberAuthCallbackUrl, sanitizeMemberNextPath } from "./auth-results";
import {
  ensureMemberProfileAfterConsent,
  hasCurrentPrivacyConsent,
  memberConsentNextPath,
  memberConsentPath,
  memberLocale,
  recordCurrentEventMediaConsent,
  recordCurrentMemberConsents,
  resolveMemberAuthDestination,
} from "./member-consents";
import {
  parseMemberEmail,
  parseMemberEntry,
  parseMemberMagicLink,
  parseMemberPasswordUpdate,
  parseMemberProfileUpdate,
} from "./member-entry";
import {
  addMemberPass,
  getSavedEvents,
  markNotificationRead,
  removeMemberPass,
  saveEvent,
  unsaveEvent,
  upsertMemberEquipment,
} from "./supporting";

function siteUrl() {
  const origin = headers().get("origin");
  if (origin) {
    try {
      const url = new URL(origin);
      const localOrigin = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (url.protocol === "https:" || (url.protocol === "http:" && localOrigin)) {
        return url.origin;
      }
    } catch {
      // Use the configured site URL when the request origin is malformed.
    }
  }

  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function memberCallback(path: string) {
  return memberAuthCallbackUrl(siteUrl(), path);
}

function hasMemberAuthCookie() {
  return cookies()
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function nextPathFromForm(formData: FormData) {
  return sanitizeMemberNextPath(String(formData.get("next") ?? ""));
}

export async function getCurrentMemberAccount() {
  if (!hasMemberAuthCookie()) {
    return null;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const profile = (await getMemberProfile(user.id)) ?? null;
  const privacyAccepted = await hasCurrentPrivacyConsent(user.id, supabase);

  return {
    user,
    profile,
    emailConfirmed: Boolean(user.email_confirmed_at),
    privacyAccepted,
  };
}

export async function getCurrentMemberProfile() {
  const account = await getCurrentMemberAccount();
  return account?.profile ?? null;
}

export async function registerMemberProfile(formData: FormData) {
  const entry = parseMemberEntry("register", formData);
  if (!entry.success) {
    const code =
      entry.error === "password"
        ? "register_password"
        : entry.error === "email"
          ? "register_email"
        : entry.error === "confirm"
          ? "register_confirm"
          : entry.error === "privacy_policy"
            ? "register_privacy_policy"
            : "register";
    redirect(`/member?mode=register&error=${code}`);
  }

  const acceptedAt = new Date().toISOString();
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email: entry.email,
    password: entry.password,
    options: {
      data: {
        display_name: entry.displayName,
      },
      emailRedirectTo: memberCallback(nextPathFromForm(formData)),
    },
  });

  if (error) {
    console.error("[member.registerMemberProfile] signUp failed", {
      name: error.name,
      code: error.code,
      status: error.status,
      message: error.message,
    });

    const code =
      error.status === 429 ||
      error.code === "over_email_send_rate_limit" ||
      error.code === "email_rate_limit_exceeded"
        ? "register_rate"
        : error.code === "email_exists" ||
            error.code === "user_already_exists" ||
            error.code === "user_already_registered" ||
            error.message?.toLowerCase?.().includes("already")
          ? "register_taken"
          : "register_failed";

    redirect(`/member?mode=register&error=${code}`);
  }

  if (data.user?.identities?.length === 0) {
    redirect("/member?mode=login&error=register_taken");
  }

  if (!data.user) {
    redirect("/member?mode=register&error=register_failed");
  }

  const consentSaved = await recordCurrentMemberConsents({
    acceptedAt,
    client: createAdminClient(),
    locale: memberLocale(cookies().get("lang")?.value),
    mediaAccepted: entry.photoSocialMediaConsent,
    source: "email_registration",
    userId: data.user.id,
  });
  if (!consentSaved) {
    redirect("/member?mode=register&error=register_failed");
  }

  revalidatePath("/member");
  redirect("/member?registered=1");
}

export async function loginMemberProfile(formData: FormData) {
  const entry = parseMemberEntry("login", formData);
  if (!entry.success) {
    redirect("/member?error=login");
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: entry.email,
    password: entry.password,
  });
  if (error || !data.user) {
    redirect("/member?error=login");
  }

  revalidatePath("/", "layout");
  redirect(await resolveMemberAuthDestination(data.user, nextPathFromForm(formData), supabase));
}

export async function saveMemberProfile(formData: FormData) {
  const profile = await getCurrentMemberProfile();
  if (!profile) redirect("/member?error=1");

  const entry = parseMemberProfileUpdate(formData);
  if (!entry.success) {
    redirect(`/member/settings?profileError=${entry.error}`);
  }

  await updateMemberProfile(profile.userId, entry.data);
  revalidatePath("/member");
  revalidatePath("/member/settings");
  redirect("/member/settings?profileSaved=1");
}

export async function requestMemberMagicLink(formData: FormData) {
  const entry = parseMemberMagicLink(formData);
  if (!entry.success) {
    redirect("/member?error=magic");
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: entry.email,
    options: {
      emailRedirectTo: memberCallback(nextPathFromForm(formData)),
    },
  });
  if (error) {
    redirect("/member?error=magic");
  }

  redirect("/member?magicSent=1");
}

export async function loginMemberWithGoogle(formData: FormData) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: memberCallback(nextPathFromForm(formData)),
    },
  });
  if (error || !data.url) {
    redirect("/member?error=oauth");
  }

  redirect(data.url);
}

export async function requestMemberPasswordReset(formData: FormData) {
  const entry = parseMemberEmail(formData);
  if (!entry.success) {
    redirect("/member/forgot-password?error=email");
  }

  const supabase = createClient();
  await supabase.auth.resetPasswordForEmail(entry.email, {
    redirectTo: memberCallback("/member/reset-password"),
  });

  redirect("/member/forgot-password?sent=1");
}

/**
 * Confirms a signup only after the person has explicitly pressed the button
 * on /auth/confirm.  Keeping verification behind a POST prevents email-link
 * scanners from consuming Supabase's single-use confirmation token.
 */
export async function confirmMemberEmail(formData: FormData) {
  const tokenHash = String(formData.get("tokenHash") ?? "").trim();
  if (!tokenHash || tokenHash.length > 512) {
    redirect("/member?error=callback");
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });

  if (error || !data.user) {
    redirect("/member?error=callback");
  }

  revalidatePath("/member");
  redirect(await resolveMemberAuthDestination(data.user, nextPathFromForm(formData), supabase));
}

export async function acceptMemberConsent(formData: FormData) {
  const next = memberConsentNextPath(String(formData.get("next") ?? ""));
  if (formData.get("privacyPolicyAccepted") !== "on") {
    redirect(`${memberConsentPath(next)}&error=required`);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/member?error=login");

  const acceptedAt = new Date().toISOString();
  const mediaAccepted = formData.get("eventMediaSocialConsent") === "on";
  const saved = await recordCurrentMemberConsents({
    acceptedAt,
    client: supabase,
    locale: memberLocale(cookies().get("lang")?.value),
    mediaAccepted,
    source: "consent_page",
    userId: user.id,
  });
  if (!saved) redirect(`${memberConsentPath(next)}&error=save`);

  if (!(await ensureMemberProfileAfterConsent(user, supabase))) {
    redirect("/member?error=profile");
  }

  revalidatePath("/member");
  redirect(next);
}

export async function cancelMemberConsent() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/member?consentCancelled=1");
}

export async function saveMemberPrivacyPreferences(formData: FormData) {
  const account = await getCurrentMemberAccount();
  if (!account?.profile) redirect("/member?error=1");

  const mediaAccepted = formData.get("eventMediaSocialConsent") === "on";
  const supabase = createClient();
  const mediaSaved = await recordCurrentEventMediaConsent({
    acceptedAt: new Date().toISOString(),
    client: supabase,
    locale: memberLocale(cookies().get("lang")?.value),
    mediaAccepted,
    source: "consent_page",
    userId: account.user.id,
  });
  if (!mediaSaved) redirect("/member/settings?profileError=privacy");

  await updateMemberProfile(account.profile.userId, {
    marketingEmailOptIn: formData.get("marketingEmailOptIn") === "on",
    photoSocialMediaConsent: mediaAccepted,
  });
  revalidatePath("/member");
  revalidatePath("/member/settings");
  redirect("/member/settings?privacySaved=1#privacy");
}

export async function resetMemberPassword(formData: FormData) {
  const entry = parseMemberPasswordUpdate(formData);
  if (!entry.success) {
    redirect(`/member/reset-password?error=${entry.error}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: entry.password });
  if (error) {
    redirect("/member/reset-password?error=session");
  }

  revalidatePath("/member");
  redirect("/member?passwordReset=1");
}

export async function changeMemberPassword(formData: FormData) {
  const account = await getCurrentMemberAccount();
  if (!account) {
    redirect("/member?error=login");
  }

  const entry = parseMemberPasswordUpdate(formData);
  if (!entry.success) {
    redirect(`/member/account-settings?securityError=${entry.error}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: entry.password });
  if (error) {
    redirect("/member/account-settings?securityError=session");
  }

  revalidatePath("/member");
  revalidatePath("/member/account-settings");
  redirect("/member/account-settings?passwordChanged=1");
}

export async function toggleSaveEventAction(formData: FormData) {
  "use server";

  const profile = await getCurrentMemberProfile();
  if (!profile) redirect("/member?error=login");

  const eventSlug = String(formData.get("eventSlug") ?? "").trim();
  if (!eventSlug) redirect("/member");

  const existing = await getSavedEvents(profile.id);
  if (existing.some((item) => item.eventSlug === eventSlug)) {
    await unsaveEvent(profile.id, eventSlug);
  } else {
    await saveEvent(profile.id, eventSlug);
  }
  revalidatePath("/member");
  revalidatePath(`/events/${eventSlug}`);
  redirect(`/events/${eventSlug}`);
}

export async function addPassAction(formData: FormData) {
  "use server";

  const profile = await getCurrentMemberProfile();
  if (!profile) redirect("/member?error=login");

  const passType = String(formData.get("passType") ?? "").trim();
  if (!passType || !["ikon", "epic", "big_bear", "mountain_high", "other"].includes(passType)) {
    redirect("/member/settings?profileError=passType");
  }
  const label = String(formData.get("passLabel") ?? "").trim();
  await addMemberPass(profile.id, passType as "ikon" | "epic" | "big_bear" | "mountain_high" | "other", label);
  revalidatePath("/member");
  revalidatePath("/member/settings");
  redirect("/member/settings?profileSaved=1");
}

export async function removePassAction(formData: FormData) {
  "use server";

  const profile = await getCurrentMemberProfile();
  if (!profile) redirect("/member?error=login");

  const passId = String(formData.get("passId") ?? "").trim();
  if (passId) await removeMemberPass(passId);
  revalidatePath("/member");
  revalidatePath("/member/settings");
  redirect("/member/settings?profileSaved=1");
}

export async function saveEquipmentAction(formData: FormData) {
  "use server";

  const profile = await getCurrentMemberProfile();
  if (!profile) redirect("/member?error=login");

  await upsertMemberEquipment(profile.id, {
    ownsSkis: formData.get("ownsSkis") === "on",
    ownsSnowboard: formData.get("ownsSnowboard") === "on",
    ownsBoots: formData.get("ownsBoots") === "on",
    needsRentalHelp: formData.get("needsRentalHelp") === "on",
    note: String(formData.get("equipmentNote") ?? "").trim(),
  });
  revalidatePath("/member");
  revalidatePath("/member/settings");
  redirect("/member/settings?profileSaved=1");
}

export async function markNotificationReadAction(formData: FormData) {
  "use server";

  const profile = await getCurrentMemberProfile();
  if (!profile) return;

  const notificationId = String(formData.get("notificationId") ?? "").trim();
  if (notificationId) await markNotificationRead(notificationId);
  revalidatePath("/member");
}

export async function confirmMemberPendingRegistrationAction(formData: FormData) {
  "use server";

  const account = await getCurrentMemberAccount();
  if (!account?.profile) redirect("/member?error=login");
  const profile = account.profile;

  const pendingId = String(formData.get("pendingId") ?? "").trim();
  if (!pendingId) redirect("/member?registration=invalid");

  const pending = (await getPendingRegistrationsByMember(profile.id))
    .find((item) => item.id === pendingId);
  if (!pending) redirect("/member?registration=invalid");

  const event = await getEvent(pending.eventSlug);
  if (!event || !isEventOpen(event)) {
    redirect("/member?registration=unavailable");
  }

  const registrationCount = await getRegistrationCountForEvent(event.slug);
  if (!hasRemainingCapacity({ ...event, registrationCount })) {
    redirect("/member?registration=unavailable");
  }

  const normalizedEmail = normalizeEmail(pending.contactEmail);
  const existingRegistrations = await getRegistrations(event.slug);
  if (
    existingRegistrations.some(
      (registration) => registration.memberId === profile.id,
    )
  ) {
    const existingRegistration = existingRegistrations.find(
      (registration) => registration.memberId === profile.id,
    );
    if (pending.waiverTextEn && pending.waiverTextSha && pending.typedName && existingRegistration) {
      await createWaiverAcceptance({
        registrationId: existingRegistration.id,
        legalTextSnapshot: pending.waiverTextEn,
        waiverTextSha: pending.waiverTextSha,
        typedName: pending.typedName,
        handwrittenSignatureDataUrl: pending.handwrittenSignatureDataUrl ?? null,
        acceptedAt: new Date().toISOString(),
      });
    }
    await deletePendingRegistration(pending.id);
    revalidatePath("/member");
    redirect("/member?registration=duplicate");
  }

  const result = await createRegistration({
    eventSlug: pending.eventSlug,
    memberId: profile.id,
    answers: pending.answers,
    consentGiven: pending.consentGiven,
    contactEmail: normalizedEmail,
    contactName: pending.contactName,
    contactPhone: pending.contactPhone,
  });

  if (pending.waiverTextEn && pending.waiverTextSha && pending.typedName && result.registration) {
    await createWaiverAcceptance({
      registrationId: result.registration.id,
      legalTextSnapshot: pending.waiverTextEn,
      waiverTextSha: pending.waiverTextSha,
      typedName: pending.typedName,
      handwrittenSignatureDataUrl: pending.handwrittenSignatureDataUrl ?? null,
      acceptedAt: new Date().toISOString(),
    });
  }

  await deletePendingRegistration(pending.id);

  const eventTitle = event.title.en || event.title.zh || event.slug;
  await sendEmail(buildStaffNotificationEmail(eventTitle, pending.contactName)).catch(() => {});

  revalidatePath("/member");
  revalidatePath("/member/trips");
  revalidatePath(`/events/${event.slug}`);
  redirect("/member?registration=confirmed");
}

export async function logoutMember() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/member");
}
