import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.hoisted(() => vi.fn());
const mockSignInWithPassword = vi.hoisted(() => vi.fn());
const mockSignOut = vi.hoisted(() => vi.fn());
const mockGetStaffRole = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("../supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
    },
  })),
}));

vi.mock("./staff-repository", () => ({
  getStaffRole: mockGetStaffRole,
}));

import { getCurrentStaffAccount, loginStaff, requireStaff } from "./admin";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  mockSignInWithPassword.mockResolvedValue({ data: { user: null }, error: null });
  mockSignOut.mockResolvedValue({ error: null });
  mockGetStaffRole.mockResolvedValue(null);
});

function form(email = "staff@snowforce.test", password = "secret123") {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  return data;
}

describe("staff auth helpers", () => {
  it("returns current staff account when Supabase user has a staff role", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "staff@snowforce.test" } },
      error: null,
    });
    mockGetStaffRole.mockResolvedValue("manager");

    await expect(getCurrentStaffAccount()).resolves.toEqual({
      userId: "user-1",
      email: "staff@snowforce.test",
      role: "manager",
    });
  });

  it("redirects managers away from admin-only staff management", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "manager@snowforce.test" } },
      error: null,
    });
    mockGetStaffRole.mockResolvedValue("manager");

    await expect(requireStaff(["admin"])).rejects.toThrow("REDIRECT:/admin");
  });

  it("signs in staff users and redirects to admin", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1", email: "staff@snowforce.test" } },
      error: null,
    });
    mockGetStaffRole.mockResolvedValue("admin");

    await expect(loginStaff(form())).rejects.toThrow("REDIRECT:/admin");
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "staff@snowforce.test",
      password: "secret123",
    });
  });

  it("signs out Supabase users who are not staff", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1", email: "rider@snowforce.test" } },
      error: null,
    });
    mockGetStaffRole.mockResolvedValue(null);

    await expect(loginStaff(form("rider@snowforce.test"))).rejects.toThrow(
      "REDIRECT:/staff-login?error=unauthorized",
    );
    expect(mockSignOut).toHaveBeenCalled();
  });
});
