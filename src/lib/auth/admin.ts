"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminSessionToken, verifyAdminSessionToken } from "./admin-session";

const ADMIN_COOKIE = "snowforce_admin";

export async function isAdminAuthenticated() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  return verifyAdminSessionToken(cookies().get(ADMIN_COOKIE)?.value, secret);
}

export async function requireAdmin() {
  if (!(await isAdminAuthenticated())) redirect("/staff-login");
}

export async function loginAdmin(formData: FormData) {
  const submitted = String(formData.get("password") ?? "");
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!password || !secret || submitted !== password) {
    redirect("/staff-login?error=1");
  }

  cookies().set(ADMIN_COOKIE, createAdminSessionToken(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  redirect("/admin");
}

export async function logoutAdmin() {
  cookies().delete(ADMIN_COOKIE);
  redirect("/staff-login");
}
