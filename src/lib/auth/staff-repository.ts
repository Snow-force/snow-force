import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/server";

export type StaffRole = "admin" | "manager";

export type StaffAccount = {
  userId: string;
  email: string;
  role: StaffRole;
};

export type StaffRoleRow = {
  user_id: string;
  role: StaffRole;
  created_at: string;
};

export type StaffUserRow = {
  id: string;
  email: string;
};

export type StaffWriteResult =
  | { success: true }
  | { success: false; error: "invalid-role" | "unknown-user" | "last-admin" };

export type StaffRepositorySource = {
  listRoles(): Promise<StaffRoleRow[]>;
  listUsers(): Promise<StaffUserRow[]>;
  upsertRole(row: Omit<StaffRoleRow, "created_at">): Promise<void>;
  deleteRole(userId: string): Promise<void>;
};

function isStaffRole(value: string): value is StaffRole {
  return value === "admin" || value === "manager";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function authUserToStaffUserRow(user: User): StaffUserRow | null {
  if (!user.email) return null;
  return { id: user.id, email: user.email };
}

function supabaseStaffSource(): StaffRepositorySource {
  return {
    async listRoles() {
      const { data, error } = await createAdminClient()
        .from("staff_roles")
        .select("user_id,role,created_at")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).filter((row): row is StaffRoleRow => isStaffRole(String(row.role)));
    },
    async listUsers() {
      const { data, error } = await createAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw new Error(error.message);
      return data.users.map(authUserToStaffUserRow).filter((user): user is StaffUserRow => Boolean(user));
    },
    async upsertRole(row) {
      const { error } = await createAdminClient().from("staff_roles").upsert(row);
      if (error) throw new Error(error.message);
    },
    async deleteRole(userId) {
      const { error } = await createAdminClient().from("staff_roles").delete().eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
  };
}

export function createStaffRepository(source: StaffRepositorySource) {
  async function countAdmins() {
    return (await source.listRoles()).filter((row) => row.role === "admin").length;
  }

  async function getStaffRole(userId: string) {
    return (await source.listRoles()).find((row) => row.user_id === userId)?.role ?? null;
  }

  async function listStaffAccounts(): Promise<StaffAccount[]> {
    const [roles, users] = await Promise.all([source.listRoles(), source.listUsers()]);
    const usersById = new Map(users.map((user) => [user.id, user.email]));
    return roles.map((row) => ({
      userId: row.user_id,
      email: usersById.get(row.user_id) ?? "Unknown email",
      role: row.role,
    }));
  }

  async function grantStaffRole(email: string, role: StaffRole): Promise<StaffWriteResult> {
    if (!isStaffRole(role)) return { success: false, error: "invalid-role" };

    const normalizedEmail = normalizeEmail(email);
    const user = (await source.listUsers()).find((candidate) => normalizeEmail(candidate.email) === normalizedEmail);
    if (!user) return { success: false, error: "unknown-user" };

    await source.upsertRole({ user_id: user.id, role });
    return { success: true };
  }

  async function updateStaffRole(userId: string, role: StaffRole): Promise<StaffWriteResult> {
    if (!isStaffRole(role)) return { success: false, error: "invalid-role" };

    const roles = await source.listRoles();
    const current = roles.find((row) => row.user_id === userId);
    const adminCount = roles.filter((row) => row.role === "admin").length;
    if (current?.role === "admin" && role !== "admin" && adminCount <= 1) {
      return { success: false, error: "last-admin" };
    }

    await source.upsertRole({ user_id: userId, role });
    return { success: true };
  }

  async function revokeStaffRole(userId: string): Promise<StaffWriteResult> {
    const roles = await source.listRoles();
    const current = roles.find((row) => row.user_id === userId);
    const adminCount = roles.filter((row) => row.role === "admin").length;
    if (current?.role === "admin" && adminCount <= 1) {
      return { success: false, error: "last-admin" };
    }

    await source.deleteRole(userId);
    return { success: true };
  }

  return {
    countAdmins,
    getStaffRole,
    grantStaffRole,
    listStaffAccounts,
    revokeStaffRole,
    updateStaffRole,
  };
}

const repository = createStaffRepository(supabaseStaffSource());

export const countAdmins = repository.countAdmins;
export const getStaffRole = repository.getStaffRole;
export const grantStaffRole = repository.grantStaffRole;
export const listStaffAccounts = repository.listStaffAccounts;
export const revokeStaffRole = repository.revokeStaffRole;
export const updateStaffRole = repository.updateStaffRole;
