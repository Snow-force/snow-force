import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSignUp = vi.hoisted(() => vi.fn());
const mockVerifyOtp = vi.hoisted(() => vi.fn());
const mockParseMemberEmail = vi.hoisted(() => vi.fn());
const mockParseMemberEntry = vi.hoisted(() => vi.fn());
const mockCreateClient = vi.hoisted(() =>
  vi.fn(() => ({
    auth: {
      signUp: mockSignUp,
      verifyOtp: mockVerifyOtp,
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

vi.mock("@/lib/registrations/waiver-repository", () => ({
  createWaiverAcceptance: vi.fn(),
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

import { confirmMemberEmail, registerMemberProfile } from "./actions";

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
