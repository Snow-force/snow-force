import { describe, expect, it } from "vitest";

import { createStaffRepository, type StaffRoleRow, type StaffUserRow } from "./staff-repository";

function staffRow(userId: string, role: "admin" | "manager"): StaffRoleRow {
  return { user_id: userId, role, created_at: "2026-01-01T00:00:00.000Z" };
}

function userRow(id: string, email: string): StaffUserRow {
  return { id, email };
}

describe("staff repository", () => {
  it("grants staff role to an existing Supabase auth user by email", async () => {
    const writes: StaffRoleRow[] = [];
    const repository = createStaffRepository({
      listRoles: async () => [],
      listUsers: async () => [userRow("user-1", "Staff@SnowForce.test")],
      upsertRole: async (row) => {
        writes.push({ ...row, created_at: "now" });
      },
      deleteRole: async () => undefined,
    });

    const result = await repository.grantStaffRole(" staff@snowforce.test ", "manager");

    expect(result).toEqual({ success: true });
    expect(writes).toEqual([{ user_id: "user-1", role: "manager", created_at: "now" }]);
  });

  it("returns typed failure when granting role to an unknown email", async () => {
    const repository = createStaffRepository({
      listRoles: async () => [],
      listUsers: async () => [userRow("user-1", "other@snowforce.test")],
      upsertRole: async () => {
        throw new Error("should not write");
      },
      deleteRole: async () => undefined,
    });

    await expect(repository.grantStaffRole("missing@snowforce.test", "admin")).resolves.toEqual({
      success: false,
      error: "unknown-user",
    });
  });

  it("blocks demoting the final admin", async () => {
    const repository = createStaffRepository({
      listRoles: async () => [staffRow("admin-1", "admin")],
      listUsers: async () => [userRow("admin-1", "admin@snowforce.test")],
      upsertRole: async () => {
        throw new Error("should not write");
      },
      deleteRole: async () => undefined,
    });

    await expect(repository.updateStaffRole("admin-1", "manager")).resolves.toEqual({
      success: false,
      error: "last-admin",
    });
  });

  it("blocks revoking the final admin", async () => {
    const repository = createStaffRepository({
      listRoles: async () => [staffRow("admin-1", "admin")],
      listUsers: async () => [userRow("admin-1", "admin@snowforce.test")],
      upsertRole: async () => undefined,
      deleteRole: async () => {
        throw new Error("should not delete");
      },
    });

    await expect(repository.revokeStaffRole("admin-1")).resolves.toEqual({
      success: false,
      error: "last-admin",
    });
  });
});
