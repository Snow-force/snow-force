"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMemberProfile, updateMemberProfile } from "./repository";
import { parseMemberEntry } from "./member-entry";

export async function getCurrentMemberProfile() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? (await getMemberProfile(user.id)) ?? null : null;
}

export async function registerMemberProfile(formData: FormData) {
  const entry = parseMemberEntry("register", formData);
  if (!entry.success) {
    redirect("/member?error=register");
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email: entry.email,
    password: entry.password,
    options: {
      data: { display_name: entry.displayName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/member`,
    },
  });

  if (error) {
    redirect("/member?error=register");
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
  redirect("/member");
}

export async function saveMemberProfile(formData: FormData) {
  const profile = await getCurrentMemberProfile();
  if (!profile) redirect("/member?error=1");

  await updateMemberProfile(profile.userId, {
    displayName: String(formData.get("displayName") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    riderLevel: {
      en: String(formData.get("riderLevelEn") ?? "").trim(),
      zh: String(formData.get("riderLevelZh") ?? "").trim(),
    },
    emergencyContact: String(formData.get("emergencyContact") ?? "").trim(),
    emergencyPhone: String(formData.get("emergencyPhone") ?? "").trim(),
  });
  revalidatePath("/member");
}

export async function logoutMember() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/member");
}
