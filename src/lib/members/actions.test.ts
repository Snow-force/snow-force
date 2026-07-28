import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSignUp = vi.hoisted(() => vi.fn());
const mockVerifyOtp = vi.hoisted(() => vi.fn());
const mockGetUser = vi.hoisted(() => vi.fn());
const mockSignInWithPassword = vi.hoisted(() => vi.fn());
const mockSignInWithOtp = vi.hoisted(() => vi.fn());
const mockSignInWithOAuth = vi.hoisted(() => vi.fn());
const mockResetPasswordForEmail = vi.hoisted(() => vi.fn());
const mockParseMemberEmail = vi.hoisted(() => vi.fn());
const mockParseMemberEntry = vi.hoisted(() => vi.fn());
const mockParseMemberMagicLink = vi.hoisted(() => vi.fn());
const mockParseMemberProfileUpdate = vi.hoisted(() => vi.fn());
const mockGetMemberProfile = vi.hoisted(() => vi.fn());
const mockCookieGetAll = vi.hoisted(() => vi.fn(() => []));
const mockCreateClient = vi.hoisted(() =>
  vi.fn(() => ({
    auth: {
      signUp: mockSignUp,
      verifyOtp: mockVerifyOtp,
      getUser: mockGetUser,
      signInWithPassword: mockSignInWithPassword,
      signInWithOtp: mockSignInWithOtp,
      signInWithOAuth: mockSignInWithOAuth,
      resetPasswordForEmail: mockResetPasswordForEmail,
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
  cookies: vi.fn(() => ({ getAll: mockCookieGetAll })),
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

vi.mock("@/lib/registrations/waiver-repository", () => ({
  createWaiverAcceptance: vi.fn(),
}));

vi.mock("./member-entry", () => ({
  parseMemberEmail: mockParseMemberEmail,
  parseMemberEntry: mockParseMemberEntry,
  parseMemberMagicLink: mockParseMemberMagicLink,
  parseMemberPasswordUpdate: vi.fn(),
  parseMemberProfileUpdate: mockParseMemberProfileUpdate,
}));

vi.mock("./auth-results", () => ({
  memberAuthCallbackUrl: vi.fn(() => "https://snowforce.test/auth/callback?next=%2Fmember"),
  sanitizeMemberNextPath: vi.fn((value: string) => value || "/member"),
}));

vi.mock("./repository", () => ({
  getMemberProfile: mockGetMemberProfile,
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

import {
  confirmMemberEmail,
  getCurrentMemberAccount,
  loginMemberProfile,
  loginMemberWithGoogle,
  registerMemberProfile,
  requestMemberMagicLink,
  requestMemberPasswordReset,
  saveMemberProfile,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mockCookieGetAll.mockReturnValue([]);
  mockGetUser.mockResolvedValue({ data: { user: null } });
  mockGetMemberProfile.mockResolvedValue(undefined);
  mockParseMemberEmail.mockReturnValue({ success: true, email: "rider@example.com" });
  mockParseMemberMagicLink.mockReturnValue({ success: true, email: "rider@example.com" });
  mockParseMemberEntry.mockReturnValue({
    success: true,
    email: "rider@example.com",
    displayName: "Rider One",
    password: "secret123",
    remember: false,
  });
});

describe("registerMemberProfile", () => {
  it.each([
    ["password", "register_password"],
    ["confirm", "register_confirm"],
    ["register_fields", "register"],
  ])("redirects parser error %s without calling Supabase", async (parserError, redirectError) => {
    mockParseMemberEntry.mockReturnValueOnce({ success: false, error: parserError });

    await expect(registerMemberProfile(new FormData())).rejects.toThrow(
      `REDIRECT:/member?mode=register&error=${redirectError}`,
    );
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("S2-signup-sends-confirmation-email-through-auth-callback", async () => {
    mockSignUp.mockResolvedValueOnce({ data: { user: { identities: [{}] } }, error: null });

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

  it("S2-signup-error-keeps-the-registration-form-open", async () => {
    mockSignUp.mockResolvedValueOnce({ error: new Error("signup failed") });

    await expect(registerMemberProfile(new FormData())).rejects.toThrow(
      "REDIRECT:/member?mode=register&error=register_failed",
    );
  });

  it("S2-existing-confirmed-account-opens-sign-in-instead-of-claiming-a-new-email-was-sent", async () => {
    mockSignUp.mockResolvedValueOnce({ data: { user: { identities: [] } }, error: null });

    await expect(registerMemberProfile(new FormData())).rejects.toThrow(
      "REDIRECT:/member?mode=login&error=register_taken",
    );
  });

  it("S2-signup-rate-limit-explains-the-email-send-limit", async () => {
    const rateLimitError = Object.assign(new Error("email rate limit exceeded"), {
      code: "over_email_send_rate_limit",
      status: 429,
    });
    mockSignUp.mockResolvedValueOnce({ error: rateLimitError });

    await expect(registerMemberProfile(new FormData())).rejects.toThrow(
      "REDIRECT:/member?mode=register&error=register_rate",
    );
  });
});

describe("member sign-in and recovery actions", () => {
  it("normalizes credentials and preserves the permitted next path after password sign-in", async () => {
    const formData = new FormData();
    formData.set("next", "/events/mammoth-weekend");
    mockSignInWithPassword.mockResolvedValue({ error: null });

    await expect(loginMemberProfile(formData)).rejects.toThrow("REDIRECT:/events/mammoth-weekend");
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: "rider@example.com", password: "secret123" });
  });

  it("sends magic links through the auth callback and does not disclose a provider failure", async () => {
    const formData = new FormData();
    formData.set("next", "/events/mammoth-weekend");
    mockSignInWithOtp.mockResolvedValue({ error: null });

    await expect(requestMemberMagicLink(formData)).rejects.toThrow("REDIRECT:/member?magicSent=1");
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "rider@example.com",
      options: { emailRedirectTo: "https://snowforce.test/auth/callback?next=%2Fmember" },
    });
  });

  it("rejects an OAuth response that does not provide a redirect URL", async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });

    await expect(loginMemberWithGoogle(new FormData())).rejects.toThrow("REDIRECT:/member?error=oauth");
  });

  it("requests password reset only for a valid normalized email", async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null });

    await expect(requestMemberPasswordReset(new FormData())).rejects.toThrow("REDIRECT:/member/forgot-password?sent=1");
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith("rider@example.com", {
      redirectTo: "https://snowforce.test/auth/callback?next=%2Fmember",
    });
  });
});

describe("getCurrentMemberAccount", () => {
  it("does not query Supabase when no auth cookie is present", async () => {
    await expect(getCurrentMemberAccount()).resolves.toBeNull();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("creates and reloads a missing profile for an authenticated user", async () => {
    mockCookieGetAll.mockReturnValue([{ name: "sb-project-auth-token", value: "session" }]);
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1",
          email: "rider@example.com",
          email_confirmed_at: "2026-07-28T00:00:00.000Z",
          user_metadata: { display_name: "Rider One" },
        },
      },
    });
    const createdProfile = { id: "profile-1", userId: "auth-user-1" };
    mockGetMemberProfile.mockResolvedValueOnce(undefined).mockResolvedValueOnce(createdProfile);
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "profile-1" } });
    const select = vi.fn(() => ({ maybeSingle }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    mockCreateClient.mockReturnValueOnce({ auth: { getUser: mockGetUser }, from });

    await expect(getCurrentMemberAccount()).resolves.toEqual({
      user: expect.objectContaining({ id: "auth-user-1" }),
      profile: createdProfile,
      emailConfirmed: true,
    });
    expect(insert).toHaveBeenCalledWith({
      user_id: "auth-user-1",
      display_name: "Rider One",
      email: "rider@example.com",
    });
    expect(mockGetMemberProfile).toHaveBeenNthCalledWith(1, "auth-user-1");
    expect(mockGetMemberProfile).toHaveBeenNthCalledWith(2, "auth-user-1");
  });
});

describe("member profile updates", () => {
  it("rejects profile writes before parsing or querying user-controlled fields when no member session exists", async () => {
    await expect(saveMemberProfile(new FormData())).rejects.toThrow("REDIRECT:/member?error=1");
    expect(mockParseMemberProfileUpdate).not.toHaveBeenCalled();
  });
});

describe("confirmMemberEmail", () => {
  it("S1-confirms-a-token-only-after-the-confirmation-page-posts-it", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ error: null });
    const formData = new FormData();
    formData.set("tokenHash", "safe-token-hash");
    formData.set("next", "/events/mammoth-weekend");

    await expect(confirmMemberEmail(formData)).rejects.toThrow(
      "REDIRECT:/events/mammoth-weekend",
    );
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: "safe-token-hash",
      type: "email",
    });
  });

  it("S1-rejects-a-missing-token-without-calling-Supabase", async () => {
    await expect(confirmMemberEmail(new FormData())).rejects.toThrow(
      "REDIRECT:/member?error=callback",
    );
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });
});
