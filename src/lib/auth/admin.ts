"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import {
  getStaffRole,
  grantStaffRole,
  listStaffAccounts,
  revokeStaffRole,
  updateStaffRole,
  type StaffAccount,
  type StaffRole,
} from "./staff-repository";

const staffRoles: StaffRole[] = ["admin", "manager"];

function readRequiredString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readStaffRole(formData: FormData): StaffRole | null {
  const role = readRequiredString(formData, "role");
  return role === "admin" || role === "manager" ? role : null;
}

export async function isAdminAuthenticated() {
  return Boolean(await getCurrentStaffAccount());
}

export async function getCurrentStaffAccount(): Promise<StaffAccount | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const role = await getStaffRole(user.id);
  if (!role) return null;

  return {
    userId: user.id,
    email: user.email ?? "Unknown email",
    role,
  };
}

export async function requireStaff(allowedRoles: StaffRole[] = staffRoles) {
  const staff = await getCurrentStaffAccount();
  if (!staff) redirect("/staff-login");
  if (!allowedRoles.includes(staff.role)) redirect("/admin");
  return staff;
}

export async function requireAdmin() {
  return requireStaff(staffRoles);
}

export async function requireSuperAdmin() {
  return requireStaff(["admin"]);
}

export async function loginStaff(formData: FormData) {
  const email = readRequiredString(formData, "email").toLowerCase();
  const password = readRequiredString(formData, "password");
  if (!email || !password) redirect("/staff-login?error=credentials");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    redirect("/staff-login?error=credentials");
  }

  const role = await getStaffRole(data.user.id);
  if (!role) {
    await supabase.auth.signOut();
    redirect("/staff-login?error=unauthorized");
  }

  redirect("/admin");
}

export const loginAdmin = loginStaff;

export async function logoutAdmin() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/staff-login");
}

export async function getStaffManagementAccounts() {
  await requireSuperAdmin();
  return listStaffAccounts();
}

export async function grantStaffRoleAction(formData: FormData) {
  await requireSuperAdmin();
  const email = readRequiredString(formData, "email");
  const role = readStaffRole(formData);
  if (!email || !role) redirect("/admin/staff?error=invalid");

  const result = await grantStaffRole(email, role);
  if (!result.success) redirect(`/admin/staff?error=${result.error}`);

  revalidatePath("/admin/staff");
  redirect("/admin/staff?saved=1");
}

export async function updateStaffRoleAction(formData: FormData) {
  await requireSuperAdmin();
  const userId = readRequiredString(formData, "userId");
  const role = readStaffRole(formData);
  if (!userId || !role) redirect("/admin/staff?error=invalid");

  const result = await updateStaffRole(userId, role);
  if (!result.success) redirect(`/admin/staff?error=${result.error}`);

  revalidatePath("/admin/staff");
  redirect("/admin/staff?saved=1");
}

export async function revokeStaffRoleAction(formData: FormData) {
  await requireSuperAdmin();
  const userId = readRequiredString(formData, "userId");
  if (!userId) redirect("/admin/staff?error=invalid");

  const result = await revokeStaffRole(userId);
  if (!result.success) redirect(`/admin/staff?error=${result.error}`);

  revalidatePath("/admin/staff");
  redirect("/admin/staff?saved=1");
}
