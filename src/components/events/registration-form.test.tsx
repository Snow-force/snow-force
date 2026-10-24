import { createDefaultReviewConfig } from "@/lib/reviews/config";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { act, render, screen } from "@testing-library/react";
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

const mockLocation = { href: "" };

beforeAll(() => {
  Object.defineProperty(window, "location", {
    writable: true,
    value: mockLocation,
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mockLocation.href = "";
});

it("exposes friend registration for approval events and explains that payment does not approve attendance",async () => {
  renderWithLanguage(<RegistrationForm event={createEvent({ allowProxyRegistrations: true,requiresApproval: true,paymentModel: "full_prepay",fullPaymentAmount: 118 })} memberProfile={createMemberProfile()} emailConfirmed />);
  await userEvent.setup().click(screen.getByRole("radio",{ name: "A friend" }));
  expect(screen.getByRole("note")).toHaveTextContent("Payment alone does not approve attendance");
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
    waiverTextEn: null,
    waiverTextSha: null,
    merchantBoothProgram: null,
    reviewConfig: createDefaultReviewConfig(),
    ...overrides,
  };
}

describe("RegistrationForm payment model branching", () => {
  it.each([
    ["full_prepay", 118, true, "", /Pay full.*118.*USD/],
    ["deposit", 99, true, "friend@example.test", /Pay deposit.*99.*USD/],
    ["deposit", 99, false, "", /Pay deposit.*99.*USD/],
  ] as const)("keeps the friend submission pending then opens %s payment (approval=%s)", async (paymentModel, amount, requiresApproval, email, paymentLabel) => {
    const user = userEvent.setup();
    let resolveRegistration: ((result: Awaited<ReturnType<typeof registerForEvent>>) => void) | undefined;
    vi.mocked(registerForEvent).mockImplementationOnce(() => new Promise((resolve) => { resolveRegistration = resolve; }));
    vi.mocked(createCheckoutSessionAction).mockRejectedValueOnce(new Error("Network interrupted"))
      .mockResolvedValueOnce({ success: true, url: "https://checkout.stripe.com/friend" });
    renderWithLanguage(<RegistrationForm event={createEvent({ allowProxyRegistrations: true, requiresApproval, paymentModel, fullPaymentAmount: amount, depositAmount: amount, waiverTextEn: "Adult waiver" })} memberProfile={createMemberProfile()} emailConfirmed />);
    await user.click(screen.getByRole("radio", { name: "A friend" }));
    expect(screen.getByRole("link", { name: "hello@snow-force.com" })).toHaveAttribute("href", "mailto:hello@snow-force.com");
    expect(screen.queryByText(/Order contact:/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Name/), "Friend");
    if (email) await user.type(screen.getByLabelText(/Friend’s email/), email);
    await user.click(screen.getByRole("checkbox", { name: /My friend has permitted/ }));
    await user.click(screen.getByRole("button", { name: /Submit Registration/ }));
    expect(screen.getByRole("button", { name: /Submitting/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Myself" })).toBeDisabled();
    expect(registerForEvent).toHaveBeenCalledTimes(1);
    await act(async () => resolveRegistration?.({ success: true, pending: true, email: "test@test.com", confirmation: "member", pendingRegistrationId: "friend-pending" }));
    await user.click(await screen.findByRole("button", { name: paymentLabel }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your registration is saved");
    expect(screen.getByRole("button", { name: paymentLabel })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: paymentLabel }));
    expect(mockLocation.href).toBe("https://checkout.stripe.com/friend");
    expect(vi.mocked(createCheckoutSessionAction).mock.calls[1][0].get("pendingRegistrationId")).toBe("friend-pending");
    expect(registerForEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(registerForEvent).mock.calls[0][1].typedName).toBeUndefined();
  });
  it("clears previous answers and lets a friend skip email without signing for them", async () => {
    const user = userEvent.setup();
    vi.mocked(registerForEvent).mockResolvedValue({ success: true, pending: true, email: "test@test.com", confirmation: "member", pendingRegistrationId: "friend" });
    renderWithLanguage(<RegistrationForm event={createEvent({ allowProxyRegistrations: true, waiverTextEn: "Adult waiver" })} memberProfile={createMemberProfile()} emailConfirmed />);
    await user.type(screen.getByLabelText(/^Name/), "Booker");
    await user.type(screen.getByLabelText(/^Email/), "test@test.com");
    await user.click(screen.getByRole("radio", { name: "A friend" }));
    expect(screen.getByLabelText(/^Name/)).toHaveValue("");
    expect(screen.getByLabelText(/Friend’s email/)).toHaveValue("");
    await user.type(screen.getByLabelText(/^Name/), "Friend");
    await user.click(screen.getByRole("checkbox", { name: /My friend has permitted/ }));
    await user.click(screen.getByRole("button", { name: /Submit Registration/ }));
    expect(await screen.findByText(/Confirm in your member home/)).toBeInTheDocument();
    expect(registerForEvent).toHaveBeenCalledWith("test-event", expect.objectContaining({ registrationKind: "proxy", proxyConsent: true,
      answers: { name: "Friend" }, clientRequestKey: expect.stringMatching(/^[a-f0-9-]{36}$/) }));
    expect(vi.mocked(registerForEvent).mock.calls[0][1].typedName).toBeUndefined();
  });
  it("free event keeps the signed-in member confirmation flow", async () => {
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
        event={createEvent({ paymentModel: "free" })}
        memberProfile={createMemberProfile()}
        emailConfirmed
      />,
    );

    await user.type(screen.getByLabelText(/^Name/), "Test Member");
    await user.type(screen.getByLabelText(/^Email/), "test@test.com");
    await user.click(screen.getByLabelText(/agree/i));
    await user.click(screen.getByRole("button", { name: /submit registration/i }));

    expect(await screen.findByText(/Confirm in your member home/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to member home" })).toHaveAttribute("href", "/member");
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

    await user.type(screen.getByLabelText(/^Name/), "Test Member");
    await user.type(screen.getByLabelText(/^Email/), "test@test.com");
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

    await user.type(screen.getByLabelText(/^Name/), "Test Member");
    await user.type(screen.getByLabelText(/^Email/), "test@test.com");
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
    await user.type(screen.getByLabelText(/^Name/), "Test Member");
    await user.type(screen.getByLabelText(/^Email/), "test@test.com");
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
    await user.type(screen.getByLabelText(/^Name/), "Test Member");
    await user.type(screen.getByLabelText(/^Email/), "test@test.com");
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

    await user.type(screen.getByLabelText(/^Name/), "Test Member");
    await user.type(screen.getByLabelText(/^Email/), "test@test.com");
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

    await user.type(screen.getByLabelText(/^Name/), "Test Member");
    await user.type(screen.getByLabelText(/^Email/), "test@test.com");
    await user.click(screen.getByLabelText(/agree/i));
    await user.click(screen.getByRole("button", { name: /submit registration/i }));

    const payButton = await screen.findByRole("button", { name: /Pay deposit/i });
    await user.click(payButton);

    expect(await screen.findByText(/Stripe error/)).toBeInTheDocument();
    expect(window.location.href).toBe("");
    expect(screen.getByRole("button", { name: /Pay deposit/i })).toBeEnabled();
  });
});
