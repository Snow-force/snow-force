import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResend = vi.hoisted(() => vi.fn());
const mockSignUp = vi.hoisted(() => vi.fn());
const mockParseMemberEmail = vi.hoisted(() => vi.fn());
const mockParseMemberEntry = vi.hoisted(() => vi.fn());
const mockCreateClient = vi.hoisted(() =>
  vi.fn(() => ({
    auth: {
      resend: mockResend,
      signUp: mockSignUp,
    },
  })),
);

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ getAll: vi.fn(() => []) })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/events/availability", () => ({
  hasRemainingCapacity: vi.fn(),
  isEventOpen: vi.fn(),
}));

vi.mock("@/lib/events/repository", () => ({
  getEvent: vi.fn(),
}));

vi.mock("@/lib/email/adapter", () => ({
  buildStaffNotificationEmail: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/registrations/pending-repository", () => ({
  deletePendingRegistration: vi.fn(),
  getPendingRegistrationsByMember: vi.fn(),
}));

vi.mock("@/lib/registrations/repository", () => ({
  createRegistration: vi.fn(),
  getRegistrationCountForEvent: vi.fn(),
  getRegistrations: vi.fn(),
}));

vi.mock("./member-entry", () => ({
  parseMemberEmail: mockParseMemberEmail,
  parseMemberEntry: mockParseMemberEntry,
  parseMemberMagicLink: vi.fn(),
  parseMemberPasswordUpdate: vi.fn(),
  parseMemberProfileUpdate: vi.fn(),
}));

vi.mock("./auth-results", () => ({
  memberAuthCallbackUrl: vi.fn(() => "https://snowforce.test/auth/callback?next=%2Fmember"),
  sanitizeMemberNextPath: vi.fn((value: string) => value || "/member"),
}));

vi.mock("./repository", () => ({
  getMemberProfile: vi.fn(),
  updateMemberProfile: vi.fn(),
}));

vi.mock("./supporting", () => ({
  addMemberPass: vi.fn(),
  getSavedEvents: vi.fn(),
  markNotificationRead: vi.fn(),
  removeMemberPass: vi.fn(),
  saveEvent: vi.fn(),
  unsaveEvent: vi.fn(),
  upsertMemberEquipment: vi.fn(),
}));

import { registerMemberProfile, resendMemberVerification } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mockParseMemberEmail.mockReturnValue({ success: true, email: "rider@example.com" });
  mockParseMemberEntry.mockReturnValue({
    success: true,
    email: "rider@example.com",
    displayName: "Rider One",
    password: "secret123",
    remember: false,
  });
});

describe("registerMemberProfile", () => {
  it("S2-signup-sends-confirmation-email-through-auth-callback", async () => {
    mockSignUp.mockResolvedValueOnce({ error: null });

    await expect(registerMemberProfile(new FormData())).rejects.toThrow(
      "REDIRECT:/member?registered=1",
    );
    expect(mockSignUp).toHaveBeenCalledWith({
      email: "rider@example.com",
      password: "secret123",
      options: {
        data: { display_name: "Rider One" },
        emailRedirectTo: "https://snowforce.test/auth/callback?next=%2Fmember",
      },
    });
  });

  it("S2-signup-error-redirects-register-error", async () => {
    mockSignUp.mockResolvedValueOnce({ error: new Error("signup failed") });

    await expect(registerMemberProfile(new FormData())).rejects.toThrow(
      "REDIRECT:/member?error=register",
    );
  });
});

describe("resendMemberVerification", () => {
  it("S3-redirects-with-verification-email-error-when-Supabase-resend-fails", async () => {
    mockResend.mockResolvedValueOnce({ error: new Error("resend failed") });

    await expect(resendMemberVerification(new FormData())).rejects.toThrow(
      "REDIRECT:/member?error=verification-email",
    );
    expect(mockResend).toHaveBeenCalledWith({
      type: "signup",
      email: "rider@example.com",
      options: {
        emailRedirectTo: "https://snowforce.test/auth/callback?next=%2Fmember",
      },
    });
  });

  it("S3-redirects-with-verificationSent-when-Supabase-resend-succeeds", async () => {
    mockResend.mockResolvedValueOnce({ error: null });

    await expect(resendMemberVerification(new FormData())).rejects.toThrow(
      "REDIRECT:/member?verificationSent=1",
    );
  });
});
