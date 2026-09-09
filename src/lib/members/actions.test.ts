import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSignUp = vi.hoisted(() => vi.fn());
const mockVerifyOtp = vi.hoisted(() => vi.fn());
const mockGetUser = vi.hoisted(() => vi.fn());
const mockSignInWithPassword = vi.hoisted(() => vi.fn());
const mockSignInWithOtp = vi.hoisted(() => vi.fn());
const mockSignInWithOAuth = vi.hoisted(() => vi.fn());
const mockResetPasswordForEmail = vi.hoisted(() => vi.fn());
const mockUpdateUser = vi.hoisted(() => vi.fn());
const mockSignOut = vi.hoisted(() => vi.fn());
const mockParseMemberEmail = vi.hoisted(() => vi.fn());
const mockParseMemberEntry = vi.hoisted(() => vi.fn());
const mockParseMemberMagicLink = vi.hoisted(() => vi.fn());
const mockParseMemberPasswordUpdate = vi.hoisted(() => vi.fn());
const mockParseMemberProfileUpdate = vi.hoisted(() => vi.fn());
const mockGetMemberProfile = vi.hoisted(() => vi.fn());
const mockUpdateMemberProfile = vi.hoisted(() => vi.fn());
const mockAddMemberPass = vi.hoisted(() => vi.fn());
const mockGetSavedEvents = vi.hoisted(() => vi.fn());
const mockMarkNotificationRead = vi.hoisted(() => vi.fn());
const mockRemoveMemberPass = vi.hoisted(() => vi.fn());
const mockSaveEvent = vi.hoisted(() => vi.fn());
const mockUnsaveEvent = vi.hoisted(() => vi.fn());
const mockUpsertMemberEquipment = vi.hoisted(() => vi.fn());
const mockDeletePendingRegistration = vi.hoisted(() => vi.fn());
const mockGetPendingRegistrationsByMember = vi.hoisted(() => vi.fn());
const mockCreateRegistration = vi.hoisted(() => vi.fn());
const mockGetRegistrationCountForEvent = vi.hoisted(() => vi.fn());
const mockGetRegistrations = vi.hoisted(() => vi.fn());
const mockCreateWaiverAcceptance = vi.hoisted(() => vi.fn());
const mockGetEvent = vi.hoisted(() => vi.fn());
const mockHasRemainingCapacity = vi.hoisted(() => vi.fn());
const mockIsEventOpen = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());
const mockBuildStaffNotificationEmail = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());
const mockCookieGetAll = vi.hoisted(() => vi.fn(() => []));
const mockCookieSet = vi.hoisted(() => vi.fn());
const mockCookieGet = vi.hoisted(() => vi.fn());
const mockHeadersGet = vi.hoisted(() => vi.fn());
const mockCreateAdminClient = vi.hoisted(() => vi.fn(() => ({ admin: true })));
const mockEnsureMemberProfileAfterConsent = vi.hoisted(() => vi.fn());
const mockHasCurrentPrivacyConsent = vi.hoisted(() => vi.fn());
const mockRecordCurrentMemberConsents = vi.hoisted(() => vi.fn());
const mockResolveMemberAuthDestination = vi.hoisted(() => vi.fn());
const mockMemberAuthCallbackUrl = vi.hoisted(() => vi.fn());
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
      updateUser: mockUpdateUser,
      signOut: mockSignOut,
    },
  })),
);

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: mockCookieGet, getAll: mockCookieGetAll, set: mockCookieSet })),
  headers: vi.fn(() => ({ get: mockHeadersGet })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: mockCreateAdminClient,
  createClient: mockCreateClient,
}));

vi.mock("./member-consents", () => ({
  ensureMemberProfileAfterConsent: mockEnsureMemberProfileAfterConsent,
  hasCurrentPrivacyConsent: mockHasCurrentPrivacyConsent,
  memberConsentNextPath: vi.fn((next: string) => next || "/member"),
  memberConsentPath: vi.fn((next: string) => `/member/consent?next=${encodeURIComponent(next)}`),
  memberLocale: vi.fn((value: string | undefined) => value === "zh" ? "zh" : "en"),
  recordCurrentMemberConsents: mockRecordCurrentMemberConsents,
  resolveMemberAuthDestination: mockResolveMemberAuthDestination,
}));

vi.mock("@/lib/events/availability", () => ({
  hasRemainingCapacity: mockHasRemainingCapacity,
  isEventOpen: mockIsEventOpen,
}));

vi.mock("@/lib/events/repository", () => ({
  getEvent: mockGetEvent,
}));

vi.mock("@/lib/email/adapter", () => ({
  buildStaffNotificationEmail: mockBuildStaffNotificationEmail,
  sendEmail: mockSendEmail,
}));

vi.mock("@/lib/registrations/pending-repository", () => ({
  deletePendingRegistration: mockDeletePendingRegistration,
  getPendingRegistrationsByMember: mockGetPendingRegistrationsByMember,
}));

vi.mock("@/lib/registrations/repository", () => ({
  createRegistration: mockCreateRegistration,
  getRegistrationCountForEvent: mockGetRegistrationCountForEvent,
  getRegistrations: mockGetRegistrations,
}));

vi.mock("@/lib/registrations/waiver-repository", () => ({
  createWaiverAcceptance: mockCreateWaiverAcceptance,
}));

vi.mock("./member-entry", () => ({
  parseMemberEmail: mockParseMemberEmail,
  parseMemberEntry: mockParseMemberEntry,
  parseMemberMagicLink: mockParseMemberMagicLink,
  parseMemberPasswordUpdate: mockParseMemberPasswordUpdate,
  parseMemberProfileUpdate: mockParseMemberProfileUpdate,
}));

vi.mock("./auth-results", () => ({
  memberAuthCallbackUrl: mockMemberAuthCallbackUrl,
  sanitizeMemberNextPath: vi.fn((value: string) => value || "/member"),
}));

vi.mock("./repository", () => ({
  getMemberProfile: mockGetMemberProfile,
  updateMemberProfile: mockUpdateMemberProfile,
}));

vi.mock("./supporting", () => ({
  addMemberPass: mockAddMemberPass,
  getSavedEvents: mockGetSavedEvents,
  markNotificationRead: mockMarkNotificationRead,
  removeMemberPass: mockRemoveMemberPass,
  saveEvent: mockSaveEvent,
  unsaveEvent: mockUnsaveEvent,
  upsertMemberEquipment: mockUpsertMemberEquipment,
}));

import {
  acceptMemberConsent,
  cancelMemberConsent,
  confirmMemberEmail,
  confirmMemberPendingRegistrationAction,
  changeMemberPassword,
  addPassAction,
  getCurrentMemberAccount,
  loginMemberProfile,
  loginMemberWithGoogle,
  registerMemberProfile,
  requestMemberMagicLink,
  requestMemberPasswordReset,
  resetMemberPassword,
  saveEquipmentAction,
  saveMemberProfile,
  saveMemberPrivacyPreferences,
  toggleSaveEventAction,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mockHeadersGet.mockReturnValue(null);
  mockMemberAuthCallbackUrl.mockReturnValue("https://snowforce.test/auth/callback?next=%2Fmember");
  mockCookieGetAll.mockReturnValue([]);
  mockCookieGet.mockReturnValue(undefined);
  mockEnsureMemberProfileAfterConsent.mockResolvedValue(true);
  mockHasCurrentPrivacyConsent.mockResolvedValue(true);
  mockRecordCurrentMemberConsents.mockResolvedValue(true);
  mockResolveMemberAuthDestination.mockImplementation(async (_user, next: string) => next);
  mockGetUser.mockResolvedValue({ data: { user: null } });
  mockGetMemberProfile.mockResolvedValue(undefined);
  mockParseMemberEmail.mockReturnValue({ success: true, email: "rider@example.com" });
  mockParseMemberMagicLink.mockReturnValue({ success: true, email: "rider@example.com" });
  mockParseMemberPasswordUpdate.mockReturnValue({ success: false, error: "password" });
  mockParseMemberEntry.mockReturnValue({
    success: true,
    email: "rider@example.com",
    displayName: "Rider One",
    password: "secret123",
    remember: false,
    photoSocialMediaConsent: true,
    marketingEmailOptIn: true,
    privacyPolicyAccepted: true,
  });
});

describe("registerMemberProfile", () => {
  it.each([
    ["email", "register_email"],
    ["password", "register_password"],
    ["confirm", "register_confirm"],
    ["privacy_policy", "register_privacy_policy"],
    ["register_fields", "register"],
  ])("redirects parser error %s without calling Supabase", async (parserError, redirectError) => {
    mockParseMemberEntry.mockReturnValueOnce({ success: false, error: parserError });

    await expect(registerMemberProfile(new FormData())).rejects.toThrow(
      `REDIRECT:/member?mode=register&error=${redirectError}`,
    );
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("S2-signup-sends-confirmation-email-through-auth-callback", async () => {
    mockSignUp.mockResolvedValueOnce({ data: { user: { id: "auth-user-1", identities: [{}] } }, error: null });

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
    expect(mockRecordCurrentMemberConsents).toHaveBeenCalledWith(expect.objectContaining({
      client: { admin: true },
      locale: "en",
      mediaAccepted: true,
      source: "email_registration",
      userId: "auth-user-1",
    }));
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
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: "auth-user-1" } }, error: null });

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
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("redirects immediately to the unified Google identity entry", async () => {
    const formData = new FormData();
    formData.set("next", "/events/mammoth-weekend");
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth" },
      error: null,
    });

    await expect(loginMemberWithGoogle(formData)).rejects.toThrow(
      "REDIRECT:https://accounts.google.com/o/oauth2/auth",
    );
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://snowforce.test/auth/callback?next=%2Fmember",
      },
    });
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("uses the current local origin for the Google callback instead of a stale configured port", async () => {
    mockHeadersGet.mockReturnValue("http://localhost:3000");
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth" },
      error: null,
    });

    await expect(loginMemberWithGoogle(new FormData())).rejects.toThrow(
      "REDIRECT:https://accounts.google.com/o/oauth2/auth",
    );

    expect(mockMemberAuthCallbackUrl).toHaveBeenCalledWith("http://localhost:3000", "/member");
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

  it("does not auto-create a missing profile for an authenticated identity", async () => {
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
    mockGetMemberProfile.mockResolvedValue(undefined);

    await expect(getCurrentMemberAccount()).resolves.toEqual({
      user: expect.objectContaining({ id: "auth-user-1" }),
      profile: null,
      emailConfirmed: true,
      privacyAccepted: true,
    });
    expect(mockGetMemberProfile).toHaveBeenCalledOnce();
  });
});

describe("member profile updates", () => {
  function signedInProfile() {
    const profile = { id: "profile-1", userId: "auth-user-1" };
    mockCookieGetAll.mockReturnValue([{ name: "sb-project-auth-token", value: "session" }]);
    mockGetUser.mockResolvedValue({ data: { user: { id: profile.userId, email_confirmed_at: "2026-07-29T00:00:00.000Z" } } });
    mockGetMemberProfile.mockResolvedValue(profile);
    return profile;
  }

  it("rejects profile writes before parsing or querying user-controlled fields when no member session exists", async () => {
    await expect(saveMemberProfile(new FormData())).rejects.toThrow("REDIRECT:/member?error=1");
    expect(mockParseMemberProfileUpdate).not.toHaveBeenCalled();
  });

  it("persists a validated profile only for the authenticated member", async () => {
    const profile = signedInProfile();
    const data = { displayName: "Rider Two", riderLevel: "intermediate" };
    mockParseMemberProfileUpdate.mockReturnValue({ success: true, data });

    await expect(saveMemberProfile(new FormData())).rejects.toThrow("REDIRECT:/member/settings?profileSaved=1");

    expect(mockUpdateMemberProfile).toHaveBeenCalledWith(profile.userId, data);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/member");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/member/settings");
  });

  it("does not write a profile when validation fails", async () => {
    signedInProfile();
    mockParseMemberProfileUpdate.mockReturnValue({ success: false, error: "displayName" });

    await expect(saveMemberProfile(new FormData())).rejects.toThrow("REDIRECT:/member/settings?profileError=displayName");
    expect(mockUpdateMemberProfile).not.toHaveBeenCalled();
  });

  it("S1-allows-a-member-to-disable-only-their-marketing-emails", async () => {
    const profile = signedInProfile();

    await expect(saveMemberPrivacyPreferences(new FormData())).rejects.toThrow(
      "REDIRECT:/member/settings?privacySaved=1#privacy",
    );

    expect(mockUpdateMemberProfile).toHaveBeenCalledWith(profile.userId, {
      marketingEmailOptIn: false,
    });
  });

  it("S1-rejects-privacy-preference-writes-without-a-member-session", async () => {
    mockGetMemberProfile.mockResolvedValue(undefined);
    await expect(saveMemberPrivacyPreferences(new FormData())).rejects.toThrow("REDIRECT:/member?error=1");
    expect(mockUpdateMemberProfile).not.toHaveBeenCalled();
  });
});

describe("member consent activation", () => {
  it("records privacy and required event-media permission before creating the profile", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "auth-user-1" } } });
    const formData = new FormData();
    formData.set("next", "/events/mammoth-weekend");
    formData.set("privacyPolicyAccepted", "on");

    await expect(acceptMemberConsent(formData)).rejects.toThrow(
      "REDIRECT:/events/mammoth-weekend",
    );

    expect(mockRecordCurrentMemberConsents).toHaveBeenCalledWith(expect.objectContaining({
      mediaAccepted: true,
      source: "consent_page",
      userId: "auth-user-1",
    }));
    expect(mockEnsureMemberProfileAfterConsent).toHaveBeenCalledWith(
      { id: "auth-user-1" },
      expect.any(Object),
    );
  });

  it("does not write or create a profile when required privacy is not accepted", async () => {
    const formData = new FormData();
    formData.set("next", "/member");

    await expect(acceptMemberConsent(formData)).rejects.toThrow(
      "REDIRECT:/member/consent?next=%2Fmember&error=required",
    );
    expect(mockRecordCurrentMemberConsents).not.toHaveBeenCalled();
    expect(mockEnsureMemberProfileAfterConsent).not.toHaveBeenCalled();
  });

  it("signs out when consent is canceled", async () => {
    await expect(cancelMemberConsent()).rejects.toThrow(
      "REDIRECT:/member?consentCancelled=1",
    );
    expect(mockSignOut).toHaveBeenCalledOnce();
  });
});

describe("member security and supporting actions", () => {
  function signedInProfile() {
    const profile = { id: "profile-1", userId: "auth-user-1" };
    mockCookieGetAll.mockReturnValue([{ name: "sb-project-auth-token", value: "session" }]);
    mockGetUser.mockResolvedValue({ data: { user: { id: profile.userId, email_confirmed_at: "2026-07-29T00:00:00.000Z" } } });
    mockGetMemberProfile.mockResolvedValue(profile);
    return profile;
  }

  it("updates a reset password and reports an expired recovery session", async () => {
    mockParseMemberPasswordUpdate.mockReturnValue({ success: true, password: "new-secret-123" });
    mockUpdateUser.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error("expired") });

    await expect(resetMemberPassword(new FormData())).rejects.toThrow("REDIRECT:/member?passwordReset=1");
    await expect(resetMemberPassword(new FormData())).rejects.toThrow("REDIRECT:/member/reset-password?error=session");
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "new-secret-123" });
  });

  it("requires an authenticated member before changing their password", async () => {
    await expect(changeMemberPassword(new FormData())).rejects.toThrow("REDIRECT:/member?error=login");
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("saves and removes a member-only event bookmark", async () => {
    const profile = signedInProfile();
    const formData = new FormData();
    formData.set("eventSlug", "mammoth-weekend");
    mockGetSavedEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([{ eventSlug: "mammoth-weekend" }]);

    await expect(toggleSaveEventAction(formData)).rejects.toThrow("REDIRECT:/events/mammoth-weekend");
    await expect(toggleSaveEventAction(formData)).rejects.toThrow("REDIRECT:/events/mammoth-weekend");

    expect(mockSaveEvent).toHaveBeenCalledWith(profile.id, "mammoth-weekend");
    expect(mockUnsaveEvent).toHaveBeenCalledWith(profile.id, "mammoth-weekend");
  });

  it("stores equipment against the current member and rejects invalid pass types", async () => {
    const profile = signedInProfile();
    const equipment = new FormData();
    equipment.set("ownsSkis", "on");
    equipment.set("needsRentalHelp", "on");
    equipment.set("equipmentNote", "  Please tune bindings. ");

    await expect(saveEquipmentAction(equipment)).rejects.toThrow("REDIRECT:/member/settings?profileSaved=1");
    expect(mockUpsertMemberEquipment).toHaveBeenCalledWith(profile.id, {
      ownsSkis: true, ownsSnowboard: false, ownsBoots: false, needsRentalHelp: true, note: "Please tune bindings.",
    });

    const invalidPass = new FormData();
    invalidPass.set("passType", "staff-only");
    await expect(addPassAction(invalidPass)).rejects.toThrow("REDIRECT:/member/settings?profileError=passType");
    expect(mockAddMemberPass).not.toHaveBeenCalled();
  });
});

describe("confirmMemberPendingRegistrationAction", () => {
  function signedInProfile() {
    const profile = { id: "profile-1", userId: "auth-user-1" };
    mockCookieGetAll.mockReturnValue([{ name: "sb-project-auth-token", value: "session" }]);
    mockGetUser.mockResolvedValue({ data: { user: { id: profile.userId, email_confirmed_at: "2026-07-29T00:00:00.000Z" } } });
    mockGetMemberProfile.mockResolvedValue(profile);
    return profile;
  }

  it("creates a registration, captures the waiver, and removes only the member pending record", async () => {
    const profile = signedInProfile();
    const pending = {
      id: "pending-1", eventSlug: "mammoth-weekend", answers: { level: "intermediate" }, consentGiven: true,
      contactEmail: " RIDER@EXAMPLE.COM ", contactName: "Rider", contactPhone: "555-0100",
      waiverTextEn: "Waiver", waiverTextSha: "sha-1", typedName: "Rider", handwrittenSignatureDataUrl: null,
    };
    const event = { slug: "mammoth-weekend", paymentModel: "free", title: { en: "Mammoth Weekend", zh: "" } };
    mockGetPendingRegistrationsByMember.mockResolvedValue([pending]);
    mockGetEvent.mockResolvedValue(event);
    mockIsEventOpen.mockReturnValue(true);
    mockGetRegistrationCountForEvent.mockResolvedValue(1);
    mockHasRemainingCapacity.mockReturnValue(true);
    mockGetRegistrations.mockResolvedValue([]);
    mockCreateRegistration.mockResolvedValue({ registration: { id: "registration-1" } });
    mockBuildStaffNotificationEmail.mockReturnValue({});
    mockSendEmail.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("pendingId", pending.id);

    await expect(confirmMemberPendingRegistrationAction(formData)).rejects.toThrow("REDIRECT:/member?registration=confirmed");

    expect(mockGetPendingRegistrationsByMember).toHaveBeenCalledWith(profile.id);
    expect(mockCreateRegistration).toHaveBeenCalledWith(expect.objectContaining({ memberId: profile.id, contactEmail: "rider@example.com" }));
    expect(mockCreateWaiverAcceptance).toHaveBeenCalledWith(expect.objectContaining({ registrationId: "registration-1", typedName: "Rider" }));
    expect(mockDeletePendingRegistration).toHaveBeenCalledWith(pending.id);
  });

  it("does not create another registration when this member is already registered", async () => {
    const profile = signedInProfile();
    const pending = { id: "pending-1", eventSlug: "mammoth-weekend", contactEmail: "rider@example.com" };
    const event = { slug: "mammoth-weekend", paymentModel: "free", title: { en: "Mammoth Weekend", zh: "" } };
    mockGetPendingRegistrationsByMember.mockResolvedValue([pending]);
    mockGetEvent.mockResolvedValue(event);
    mockIsEventOpen.mockReturnValue(true);
    mockGetRegistrationCountForEvent.mockResolvedValue(1);
    mockHasRemainingCapacity.mockReturnValue(true);
    mockGetRegistrations.mockResolvedValue([{ id: "registration-1", memberId: profile.id }]);
    const formData = new FormData();
    formData.set("pendingId", pending.id);

    await expect(confirmMemberPendingRegistrationAction(formData)).rejects.toThrow("REDIRECT:/member?registration=duplicate");

    expect(mockCreateRegistration).not.toHaveBeenCalled();
    expect(mockDeletePendingRegistration).toHaveBeenCalledWith(pending.id);
  });
});

describe("confirmMemberEmail", () => {
  it("S1-confirms-a-token-only-after-the-confirmation-page-posts-it", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: { user: { id: "auth-user-1" } }, error: null });
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
