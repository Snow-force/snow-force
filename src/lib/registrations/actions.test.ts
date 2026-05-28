import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event, MemberProfile, Registration } from "@/lib/types";
import { defaultMemberEquipment, defaultMemberNotificationPreferences } from "../members/profile-fields";

const mockGetEvent = vi.hoisted(() => vi.fn());
const mockGetRegistrationCountForEvent = vi.hoisted(() => vi.fn());
const mockCreateRegistration = vi.hoisted(() => vi.fn());
const mockGetCurrentMemberAccount = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/events/availability", () => ({
  hasRemainingCapacity: vi.fn(() => true),
  isEventOpen: vi.fn(() => true),
}));

vi.mock("@/lib/events/repository", () => ({
  getEvent: mockGetEvent,
}));

vi.mock("@/lib/registrations/repository", () => ({
  createRegistration: mockCreateRegistration,
  getRegistrationCountForEvent: mockGetRegistrationCountForEvent,
}));

vi.mock("@/lib/registrations/member-gate", () => ({
  canSubmitMemberRegistration: vi.fn((account: { profile: { id: string }; emailConfirmed: boolean } | null) => {
    if (!account) return { allowed: true, memberId: null };
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
  mockGetRegistrationCountForEvent.mockResolvedValue(0);
  mockCreateRegistration.mockResolvedValue({ success: true, registration });
  mockGetCurrentMemberAccount.mockResolvedValue(null);
  mockSendEmail.mockResolvedValue(undefined);
});

describe("registerForEvent member persistence", () => {
  it("S4-verified-member-registration-persists-member-id-to-Supabase-repository", async () => {
    mockGetCurrentMemberAccount.mockResolvedValue({
      user: { id: "user-1", email: "rider@example.com" },
      profile,
      emailConfirmed: true,
    });

    const result = await registerForEvent("mammoth-weekend", validInput());

    expect(result).toEqual({ success: true, registrationId: "reg-1" });
    expect(mockCreateRegistration).toHaveBeenCalledWith({
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
    });
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

  it("S4-anonymous-registration-persists-with-null-member-id", async () => {
    const anonymousRegistration = { ...registration, memberId: null };
    mockCreateRegistration.mockResolvedValue({ success: true, registration: anonymousRegistration });

    const result = await registerForEvent("mammoth-weekend", validInput());

    expect(result).toEqual({ success: true, registrationId: "reg-1" });
    expect(mockCreateRegistration).toHaveBeenCalledWith(expect.objectContaining({ memberId: null }));
  });
});
