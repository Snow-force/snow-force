import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event, MemberProfile, Registration } from "@/lib/types";
import { defaultMemberEquipment, defaultMemberNotificationPreferences } from "../members/profile-fields";

const mockGetEvent = vi.hoisted(() => vi.fn());
const mockGetRegistrationCountForEvent = vi.hoisted(() => vi.fn());
const mockGetRegistrations = vi.hoisted(() => vi.fn());
const mockCreateRegistration = vi.hoisted(() => vi.fn());
const mockCreateOrRefreshPendingRegistration = vi.hoisted(() => vi.fn());
const mockGetCurrentMemberAccount = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());
const mockGetActiveWaiverForEvent = vi.hoisted(() => vi.fn());
const mockGetCoupon = vi.hoisted(() => vi.fn());
const mockGetCouponRedemptionCount = vi.hoisted(() => vi.fn());

vi.mock("@/lib/coupons/repository", () => ({
  getCoupon: mockGetCoupon,
  getCouponRedemptionCount: mockGetCouponRedemptionCount,
}));

vi.mock("@/lib/events/availability", () => ({
  hasRemainingCapacity: vi.fn(() => true),
  isEventOpen: vi.fn(() => true),
}));

vi.mock("@/lib/events/repository", () => ({
  getEvent: mockGetEvent,
}));

vi.mock("@/lib/registrations/repository", () => ({
  createRegistration: mockCreateRegistration,
  getRegistrations: mockGetRegistrations,
  getRegistrationCountForEvent: mockGetRegistrationCountForEvent,
}));

vi.mock("@/lib/registrations/pending-repository", () => ({
  createOrRefreshPendingRegistration: mockCreateOrRefreshPendingRegistration,
}));

vi.mock("@/lib/registrations/member-gate", () => ({
  canSubmitMemberRegistration: vi.fn((account: { profile: { id: string }; emailConfirmed: boolean } | null) => {
    if (!account) return { allowed: false, error: "Sign in as a verified SnowForce member before registering for events." };
    if (!account.emailConfirmed) {
      return { allowed: false, error: "Verify your email before using member registration." };
    }
    return { allowed: true, memberId: account.profile.id };
  }),
}));

vi.mock("@/lib/registrations/validation", () => ({
  validateRegistrationAnswers: vi.fn((_questions, answers) => ({ success: true, data: answers })),
}));

vi.mock("@/lib/email/adapter", () => ({
  buildConfirmationEmail: vi.fn(() => ({ subject: "confirmation" })),
  buildStaffNotificationEmail: vi.fn(() => ({ subject: "staff" })),
  sendEmail: mockSendEmail,
}));

vi.mock("@/lib/members/actions", () => ({
  getCurrentMemberAccount: mockGetCurrentMemberAccount,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(() => ({
    get: (key: string) => (key === "origin" ? "https://snowforce.test" : null),
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/registrations/waiver-repository", () => ({
  getActiveWaiverForEvent: mockGetActiveWaiverForEvent,
}));

vi.mock("@/lib/registrations/waiver", () => ({
  computeWaiverSha: vi.fn((text: string) => Promise.resolve(`sha-${text.slice(0, 8)}`)),
}));

import { registerForEvent } from "./actions";

const openEvent: Event = {
  slug: "mammoth-weekend",
  status: "published",
  registrationState: "open",
  title: { en: "Mammoth Weekend", zh: "猛犸周末" },
  eventDate: "2099-02-01T00:00:00.000Z",
  meetTime: "07:00",
  meetLocation: { en: "Lot A", zh: "A 停车场" },
  activityLocation: { en: "Mammoth", zh: "猛犸" },
  locationUrl: "https://example.com/map",
  coverImage: "/cover.jpg",
  capacity: 10,
  registrationCount: 0,
  registrationCloseAt: "2099-01-31T00:00:00.000Z",
  requiresApproval: false,
  allowWaitlist: false,
  allowCancellation: true,
  feeAmount: "100",
  paymentModel: "free",
  depositAmount: null,
  depositCurrency: "usd",
  fullPaymentAmount: null,
  paymentInstructions: { en: "Pay later", zh: "稍后付款" },
  seoTitle: { en: "Mammoth Weekend", zh: "猛犸周末" },
  seoDescription: { en: "Ride", zh: "滑雪" },
  registrationQuestions: [
    {
      id: "q-name",
      key: "name",
      type: "text",
      required: true,
      label: { en: "Name", zh: "姓名" },
      helpText: { en: "", zh: "" },
      options: { en: [], zh: [] },
    },
    {
      id: "q-email",
      key: "email",
      type: "text",
      required: true,
      label: { en: "Email", zh: "邮箱" },
      helpText: { en: "", zh: "" },
      options: { en: [], zh: [] },
    },
    {
      id: "q-phone",
      key: "phone",
      type: "phone",
      required: true,
      label: { en: "Phone", zh: "电话" },
      helpText: { en: "", zh: "" },
      options: { en: [], zh: [] },
    },
  ],
  detailModules: [],
  waiverTextEn: null,
  waiverTextSha: null,
  merchantBoothProgram: null,
};

const profile: MemberProfile = {
  id: "member-1",
  userId: "user-1",
  displayName: "Rider One",
  email: "rider@example.com",
  phone: "555-0100",
  riderLevel: { en: "", zh: "" },
  riderType: "snowboarder",
  structuredRiderLevel: "advanced",
  homeMountain: "Mammoth",
  bio: "",
  carpoolInterest: false,
  lodgingInterest: false,
  preferredLanguage: "en",
  instagram: "",
  discord: "",
  avatarUrl: "",
  passes: [],
  equipment: defaultMemberEquipment,
  savedEventSlugs: [],
  notificationPreferences: defaultMemberNotificationPreferences,
  emergencyContact: "Patrol",
  emergencyPhone: "555-9999",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const registration: Registration = {
  id: "reg-1",
  eventSlug: "mammoth-weekend",
  memberId: "member-1",
  answers: {},
  consentGiven: true,
  contactEmail: "rider@example.com",
  contactName: "Rider One",
  contactPhone: "555-0100",
  status: "confirmed",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function validInput() {
  return {
    consentGiven: true,
    lang: "en" as const,
    answers: {
      name: "Rider One",
      email: "rider@example.com",
      phone: "555-0100",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetEvent.mockResolvedValue(openEvent);
  mockGetRegistrations.mockResolvedValue([]);
  mockGetRegistrationCountForEvent.mockResolvedValue(0);
  mockCreateRegistration.mockResolvedValue({ success: true, registration });
  mockCreateOrRefreshPendingRegistration.mockResolvedValue({
    id: "pending-1",
    eventSlug: "mammoth-weekend",
    contactEmail: "rider@example.com",
  });
  mockGetCurrentMemberAccount.mockResolvedValue(null);
  mockSendEmail.mockResolvedValue(undefined);
  mockGetActiveWaiverForEvent.mockResolvedValue(null);
  mockGetCouponRedemptionCount.mockResolvedValue(0);
});

describe("registerForEvent member persistence", () => {
  it("S4-verified-member-registration-persists-member-id-to-Supabase-repository", async () => {
    mockGetCurrentMemberAccount.mockResolvedValue({
      user: { id: "user-1", email: "rider@example.com" },
      profile,
      emailConfirmed: true,
    });

    const result = await registerForEvent("mammoth-weekend", validInput());

    expect(result).toEqual({
      success: true,
      pending: true,
      email: "rider@example.com",
      confirmation: "member",
      pendingRegistrationId: "pending-1",
    });
    expect(mockCreateOrRefreshPendingRegistration).toHaveBeenCalledWith(expect.objectContaining({
      eventSlug: "mammoth-weekend",
      memberId: "member-1",
      answers: {
        name: "Rider One",
        email: "rider@example.com",
        phone: "555-0100",
      },
      consentGiven: true,
      contactEmail: "rider@example.com",
      contactName: "Rider One",
      contactPhone: "555-0100",
    }));
    expect(mockCreateRegistration).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("S4-unverified-member-is-rejected-before-registration-write", async () => {
    mockGetCurrentMemberAccount.mockResolvedValue({
      user: { id: "user-1", email: "rider@example.com" },
      profile,
      emailConfirmed: false,
    });

    const result = await registerForEvent("mammoth-weekend", validInput());

    expect(result).toEqual({
      success: false,
      error: "Verify your email before using member registration.",
    });
    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });

  it("rejects anonymous registration before pending write", async () => {
    const result = await registerForEvent("mammoth-weekend", validInput());

    expect(result).toEqual({
      success: false,
      error: "Sign in as a verified SnowForce member before registering for events.",
    });
    expect(mockCreateOrRefreshPendingRegistration).not.toHaveBeenCalled();
    expect(mockCreateRegistration).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("does not fill contact fields from the member profile when answers omit them", async () => {
    mockGetEvent.mockResolvedValue({ ...openEvent, registrationQuestions: [] });
    mockGetCurrentMemberAccount.mockResolvedValue({
      user: { id: "user-1", email: "auth@example.com" },
      profile,
      emailConfirmed: true,
    });

    const result = await registerForEvent("mammoth-weekend", {
      consentGiven: true,
      lang: "en",
      answers: { field1: "YES" },
    });

    expect(result).toEqual({ success: false, error: "Email is required" });
    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });

  it("rejects invalid email before pending registration write", async () => {
    mockGetCurrentMemberAccount.mockResolvedValue({
      user: { id: "user-1", email: "rider@example.com" },
      profile,
      emailConfirmed: true,
    });

    const result = await registerForEvent("mammoth-weekend", {
      ...validInput(),
      answers: {
        name: "Rider One",
        email: "not-an-email",
        phone: "555-0100",
      },
    });

    expect(result).toEqual({ success: false, error: "Email is invalid" });
    expect(mockCreateOrRefreshPendingRegistration).not.toHaveBeenCalled();
  });

  it("refreshes pending member registrations instead of rejecting duplicate pending submissions", async () => {
    mockGetCurrentMemberAccount.mockResolvedValue({
      user: { id: "user-1", email: "rider@example.com" },
      profile,
      emailConfirmed: true,
    });

    const result = await registerForEvent("mammoth-weekend", validInput());

    expect(result).toEqual({
      success: true,
      pending: true,
      email: "rider@example.com",
      confirmation: "member",
      pendingRegistrationId: "pending-1",
    });
    expect(mockCreateOrRefreshPendingRegistration).toHaveBeenCalledTimes(1);
    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });

  it("returns a server-verified discounted payment quote with the pending registration", async () => {
    mockGetCurrentMemberAccount.mockResolvedValue({
      user: { id: "user-1", email: "rider@example.com" },
      profile,
      emailConfirmed: true,
    });
    mockGetEvent.mockResolvedValue({
      ...openEvent,
      paymentModel: "deposit",
      depositAmount: 120,
      depositCurrency: "usd",
    });
    mockGetCoupon.mockResolvedValue({
      code: "SNOW20",
      eventSlug: "mammoth-weekend",
      discountType: "percent",
      discountValue: 20,
      active: true,
      startsAt: null,
      expiresAt: null,
      maxRedemptions: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await registerForEvent("mammoth-weekend", {
      ...validInput(),
      couponCode: " snow20 ",
    });

    expect(result).toMatchObject({
      success: true,
      paymentQuote: {
        code: "SNOW20",
        originalAmount: 120,
        discountAmount: 24,
        finalAmount: 96,
        currency: "usd",
      },
    });
    expect(mockCreateOrRefreshPendingRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ couponCode: "SNOW20" }),
    );
  });

  it("rejects an invalid coupon before writing a pending registration", async () => {
    mockGetCurrentMemberAccount.mockResolvedValue({
      user: { id: "user-1", email: "rider@example.com" },
      profile,
      emailConfirmed: true,
    });
    mockGetEvent.mockResolvedValue({
      ...openEvent,
      paymentModel: "full_prepay",
      fullPaymentAmount: 399,
    });
    mockGetCoupon.mockResolvedValue(undefined);

    const result = await registerForEvent("mammoth-weekend", {
      ...validInput(),
      couponCode: "NOPE",
    });

    expect(result).toEqual({ success: false, error: "Coupon code is invalid" });
    expect(mockCreateOrRefreshPendingRegistration).not.toHaveBeenCalled();
  });

  it("allows typed signatures and persists an optional handwritten signature for waiver events", async () => {
    mockGetCurrentMemberAccount.mockResolvedValue({
      user: { id: "user-1", email: "rider@example.com" },
      profile,
      emailConfirmed: true,
    });
    mockGetEvent.mockResolvedValue({ ...openEvent, waiverTextEn: "Release terms" });
    mockGetActiveWaiverForEvent.mockResolvedValue({ text: "Release terms", sha: "sha-release" });

    const typedOnly = await registerForEvent("mammoth-weekend", {
      ...validInput(),
      typedName: "Rider One",
    });
    expect(typedOnly.success).toBe(true);

    const signature = "data:image/png;base64,c2lnbmF0dXJl";
    const result = await registerForEvent("mammoth-weekend", {
      ...validInput(),
      typedName: "Rider One",
      handwrittenSignatureDataUrl: signature,
    });

    expect(result.success).toBe(true);
    expect(mockCreateOrRefreshPendingRegistration).toHaveBeenLastCalledWith(expect.objectContaining({
      typedName: "Rider One",
      handwrittenSignatureDataUrl: signature,
      waiverTextEn: "Release terms",
    }));
  });

  it("rejects duplicate member registrations for the same event even when the previous row is cancelled", async () => {
    mockGetCurrentMemberAccount.mockResolvedValue({
      user: { id: "user-1", email: "rider@example.com" },
      profile,
      emailConfirmed: true,
    });
    mockGetRegistrations.mockResolvedValue([
      {
        ...registration,
        status: "cancelled",
        memberId: "member-1",
      },
    ]);

    const result = await registerForEvent("mammoth-weekend", validInput());

    expect(result).toEqual({
      success: false,
      error: "You are already registered for this event.",
    });
    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });
});
