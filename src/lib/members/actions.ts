"use server";

import { cookies } from "next/headers";
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
import { createClient } from "@/lib/supabase/server";
import { getMemberProfile, updateMemberProfile } from "./repository";
import { memberAuthCallbackUrl, sanitizeMemberNextPath } from "./auth-results";
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
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function memberRedirect(path: string) {
  return `${siteUrl()}${path}`;
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

  let profile = (await getMemberProfile(user.id)) ?? null;

  // Auto-create profile when auth user exists but trigger didn't fire
  if (!profile && user.email) {
    const displayName =
      (user.user_metadata?.display_name as string)?.trim() ||
      user.email.split("@")[0] ||
      "";

    const { data: newProfile } = await supabase
      .from("member_profiles")
      .insert({
        user_id: user.id,
        display_name: displayName,
        email: user.email,
      })
      .select("id")
      .maybeSingle();

    if (newProfile) {
      profile = (await getMemberProfile(user.id)) ?? null;
    }
  }

  return {
    user,
    profile,
    emailConfirmed: Boolean(user.email_confirmed_at),
  };
}

export async function getCurrentMemberProfile() {
  const account = await getCurrentMemberAccount();
  return account?.profile ?? null;
}

export async function registerMemberProfile(formData: FormData) {
  const entry = parseMemberEntry("register", formData);
  if (!entry.success) {
    redirect("/member?mode=register&error=register");
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email: entry.email,
    password: entry.password,
    options: {
      data: { display_name: entry.displayName },
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

  revalidatePath("/member");
  redirect("/member?registered=1");
}

export async function loginMemberProfile(formData: FormData) {
  const entry = parseMemberEntry("login", formData);
  if (!entry.success) {
    redirect("/member?error=login");
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: entry.email,
    password: entry.password,
  });
  if (error) {
    redirect("/member?error=login");
  }

  revalidatePath("/", "layout");
  redirect(nextPathFromForm(formData));
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

export async function resendMemberVerification(formData: FormData) {
  const entry = parseMemberEmail(formData);
  if (!entry.success) {
    redirect("/member?error=verification-email");
  }

  const supabase = createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: entry.email,
    options: {
      emailRedirectTo: memberCallback("/member"),
    },
  });
  if (error) {
    redirect("/member?error=verification-email");
  }

  redirect("/member?verificationSent=1");
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
      acceptedAt: new Date().toISOString(),
    }).catch(() => {});
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
