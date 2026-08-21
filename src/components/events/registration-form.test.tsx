import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/lib/language";
import { RegistrationForm } from "./registration-form";
import { registerForEvent } from "@/lib/registrations/actions";
import { createCheckoutSessionAction } from "@/lib/payments/actions";
import type { Event, MemberProfile } from "@/lib/types";

vi.mock("@/lib/registrations/actions", () => ({
  registerForEvent: vi.fn(),
}));

vi.mock("@/lib/payments/actions", () => ({
  createCheckoutSessionAction: vi.fn(),
}));

beforeAll(() => {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { href: "" },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  window.location.href = "";
});

function renderWithLanguage(ui: React.ReactNode) {
  document.cookie = "lang=en;path=/";
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

function createMemberProfile(overrides: Partial<MemberProfile> = {}): MemberProfile {
  return {
    id: "m1",
    userId: "u1",
    displayName: "Test Member",
    email: "test@test.com",
    phone: "+1234567890",
    riderLevel: { en: "Intermediate", zh: "中级" },
    riderType: "skier",
    structuredRiderLevel: "intermediate",
    homeMountain: "Test Mountain",
    bio: "",
    carpoolInterest: false,
    lodgingInterest: false,
    preferredLanguage: "en",
    instagram: "",
    discord: "",
    avatarUrl: "",
    passes: [],
    equipment: {
      ownsSkis: true,
      ownsSnowboard: false,
      ownsBoots: true,
      needsRentalHelp: false,
    },
    savedEventSlugs: [],
    notificationPreferences: {
      eventReminders: true,
      newTrips: true,
      recapPosted: true,
      communityUpdates: false,
    },
    emergencyContact: "",
    emergencyPhone: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createEvent(overrides: Partial<Event> = {}): Event {
  return {
    slug: "test-event",
    status: "published",
    registrationState: "open",
    title: { en: "Test Event", zh: "测试活动" },
    eventDate: "2026-12-15",
    meetTime: "09:00",
    meetLocation: { en: "Base", zh: "基地" },
    activityLocation: { en: "Mountain", zh: "雪山" },
    locationUrl: "",
    coverImage: "",
    capacity: 0,
    registrationCount: 0,
    registrationCloseAt: "2026-12-13T00:00:00Z",
    requiresApproval: false,
    allowWaitlist: false,
    allowCancellation: false,
    feeAmount: "Free",
    paymentModel: "free",
    depositAmount: null,
    depositCurrency: "usd",
    fullPaymentAmount: null,
    paymentInstructions: { en: "", zh: "" },
    seoTitle: { en: "Test", zh: "测试" },
    seoDescription: { en: "", zh: "" },
    registrationQuestions: [],
    detailModules: [],
    ...overrides,
  };
}

describe("RegistrationForm payment model branching", () => {
  it("free event keeps the pending confirmation flow", async () => {
    const user = userEvent.setup();
    vi.mocked(registerForEvent).mockResolvedValueOnce({
      success: true,
      pending: true,
      email: "test@test.com",
      confirmation: "email",
      pendingRegistrationId: "p1",
    });

    renderWithLanguage(
      <RegistrationForm
        event={createEvent({ paymentModel: "free" })}
        memberProfile={createMemberProfile()}
        emailConfirmed
      />,
    );

    await user.click(screen.getByLabelText(/agree/i));
    await user.click(screen.getByRole("button", { name: /submit registration/i }));

    expect(await screen.findByText(/Check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/test@test\.com/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pay/i })).not.toBeInTheDocument();
  });

  it("deposit event shows a pay deposit button", async () => {
    const user = userEvent.setup();
    vi.mocked(registerForEvent).mockResolvedValueOnce({
      success: true,
      pending: true,
      email: "test@test.com",
      confirmation: "member",
      pendingRegistrationId: "p1",
    });

    renderWithLanguage(
      <RegistrationForm
        event={createEvent({
          paymentModel: "deposit",
          depositAmount: 120,
          depositCurrency: "usd",
        })}
        memberProfile={createMemberProfile()}
        emailConfirmed
      />,
    );

    await user.click(screen.getByLabelText(/agree/i));
    await user.click(screen.getByRole("button", { name: /submit registration/i }));

    expect(
      await screen.findByRole("button", { name: /Pay deposit.*120.*USD/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Check your email|Go to member home/i),
    ).not.toBeInTheDocument();
  });

  it("full_prepay event shows a pay full button", async () => {
    const user = userEvent.setup();
    vi.mocked(registerForEvent).mockResolvedValueOnce({
      success: true,
      pending: true,
      email: "test@test.com",
      confirmation: "member",
      pendingRegistrationId: "p1",
    });

    renderWithLanguage(
      <RegistrationForm
        event={createEvent({
          paymentModel: "full_prepay",
          fullPaymentAmount: 399,
          depositCurrency: "cny",
        })}
        memberProfile={createMemberProfile()}
        emailConfirmed
      />,
    );

    await user.click(screen.getByLabelText(/agree/i));
    await user.click(screen.getByRole("button", { name: /submit registration/i }));

    expect(
      await screen.findByRole("button", { name: /Pay full.*399.*CNY/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Check your email|Go to member home/i),
    ).not.toBeInTheDocument();
  });

  it("shows the server-verified coupon discount instead of the original payment amount", async () => {
    const user = userEvent.setup();
    vi.mocked(registerForEvent).mockResolvedValueOnce({
      success: true,
      pending: true,
      email: "test@test.com",
      confirmation: "member",
      pendingRegistrationId: "p1",
      paymentQuote: {
        code: "SNOW20",
        originalAmount: 120,
        discountAmount: 24,
        finalAmount: 96,
        currency: "usd",
      },
    });

    renderWithLanguage(
      <RegistrationForm
        event={createEvent({
          paymentModel: "deposit",
          depositAmount: 120,
          depositCurrency: "usd",
        })}
        memberProfile={createMemberProfile()}
        emailConfirmed
      />,
    );

    await user.type(screen.getByLabelText(/coupon code/i), "snow20");
    await user.click(screen.getByLabelText(/agree/i));
    await user.click(screen.getByRole("button", { name: /submit registration/i }));

    expect(await screen.findByRole("button", { name: /Pay deposit.*96.*USD/i })).toBeInTheDocument();
    expect(screen.getByText("120 USD")).toHaveClass("line-through");
    expect(screen.getByText("-24 USD")).toBeInTheDocument();
    expect(screen.getByText("96 USD")).toBeInTheDocument();
    expect(registerForEvent).toHaveBeenCalledWith(
      "test-event",
      expect.objectContaining({ couponCode: "SNOW20" }),
    );
  });

  it("shows Free for a full discount and completes without a Stripe URL", async () => {
    const user = userEvent.setup();
    vi.mocked(registerForEvent).mockResolvedValueOnce({
      success: true,
      pending: true,
      email: "test@test.com",
      confirmation: "member",
      pendingRegistrationId: "p1",
      paymentQuote: {
        code: "FREE100",
        originalAmount: 120,
        discountAmount: 120,
        finalAmount: 0,
        currency: "usd",
      },
    });
    vi.mocked(createCheckoutSessionAction).mockResolvedValueOnce({
      success: true,
      url: "",
      completed: true,
    });

    renderWithLanguage(
      <RegistrationForm
        event={createEvent({
          paymentModel: "deposit",
          depositAmount: 120,
          depositCurrency: "usd",
        })}
        memberProfile={createMemberProfile()}
        emailConfirmed
      />,
    );

    await user.type(screen.getByLabelText(/coupon code/i), "free100");
    await user.click(screen.getByLabelText(/agree/i));
    await user.click(screen.getByRole("button", { name: /submit registration/i }));

    expect(await screen.findByText("Free")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Complete registration for free/i }));

    expect(await screen.findByText(/Registration complete/i)).toBeInTheDocument();
    expect(screen.getByText(/No payment was required/i)).toBeInTheDocument();
    expect(screen.queryByText(/No checkout URL returned/i)).not.toBeInTheDocument();
  });

  it("clicking pay button calls createCheckoutSessionAction and redirects to Stripe", async () => {
    const user = userEvent.setup();
    vi.mocked(registerForEvent).mockResolvedValueOnce({
      success: true,
      pending: true,
      email: "test@test.com",
      confirmation: "member",
      pendingRegistrationId: "p1",
    });
    vi.mocked(createCheckoutSessionAction).mockResolvedValueOnce({
      success: true,
      url: "https://checkout.stripe.com/c/test",
    });

    renderWithLanguage(
      <RegistrationForm
        event={createEvent({
          paymentModel: "deposit",
          depositAmount: 120,
          depositCurrency: "usd",
        })}
        memberProfile={createMemberProfile()}
        emailConfirmed
      />,
    );

    await user.click(screen.getByLabelText(/agree/i));
    await user.click(screen.getByRole("button", { name: /submit registration/i }));

    const payButton = await screen.findByRole("button", { name: /Pay deposit/i });
    await user.click(payButton);

    expect(createCheckoutSessionAction).toHaveBeenCalledTimes(1);
    const [formData] = vi.mocked(createCheckoutSessionAction).mock.calls[0];
    expect(formData.get("pendingRegistrationId")).toBe("p1");
    expect(window.location.href).toBe("https://checkout.stripe.com/c/test");
  });

  it("shows checkout error and keeps retry button when Stripe session fails", async () => {
    const user = userEvent.setup();
    vi.mocked(registerForEvent).mockResolvedValueOnce({
      success: true,
      pending: true,
      email: "test@test.com",
      confirmation: "member",
      pendingRegistrationId: "p1",
    });
    vi.mocked(createCheckoutSessionAction).mockResolvedValueOnce({
      success: false,
      error: "Stripe error",
    });

    renderWithLanguage(
      <RegistrationForm
        event={createEvent({
          paymentModel: "deposit",
          depositAmount: 120,
          depositCurrency: "usd",
        })}
        memberProfile={createMemberProfile()}
        emailConfirmed
      />,
    );

    await user.click(screen.getByLabelText(/agree/i));
    await user.click(screen.getByRole("button", { name: /submit registration/i }));

    const payButton = await screen.findByRole("button", { name: /Pay deposit/i });
    await user.click(payButton);

    expect(await screen.findByText(/Stripe error/)).toBeInTheDocument();
    expect(window.location.href).toBe("");
    expect(screen.getByRole("button", { name: /Pay deposit/i })).toBeEnabled();
  });
});
