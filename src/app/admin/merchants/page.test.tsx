import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "@/lib/language";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAllEvents: vi.fn(),
  getMerchantAdminOperations: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/events/repository", () => ({ getAllEvents: mocks.getAllEvents }));
vi.mock("@/lib/merchants/application-state", () => ({ getMerchantAdminOperations: mocks.getMerchantAdminOperations }));
vi.mock("@/lib/merchants/admin-view", () => ({
  adminMerchantApplicationStatuses: ["submitted", "under_review", "approved", "payment_pending", "paid", "rejected", "withdrawn"],
  buildAdminMerchantView: ({ operations }: { readonly operations: { readonly applications: readonly { readonly eventSlug: string }[] } }) => ({
    eventOptions: [{ slug: "mammoth-weekend", label: "Mammoth Weekend", count: operations.applications.length }],
    selectedEventSlug: "mammoth-weekend",
    selectedStatus: "approved",
    selectedItems: operations.applications.map((item) => ({
      application: item,
      allocation: null,
      assignedBooth: null,
      availableBooths: [],
      payment: null,
      plan: null,
      program: null,
    })),
    instructionPrograms: [],
  }),
}));
vi.mock("@/lib/merchants/actions", () => ({
  allocateMerchantBoothAction: vi.fn(),
  approveMerchantApplicationAction: vi.fn(),
  publishBoothInstructionsAction: vi.fn(),
  recordMerchantManualPaymentAction: vi.fn(),
  reviewMerchantApplicationAction: vi.fn(),
}));
vi.mock("react-dom", async () => {
  const actual = await vi.importActual<object>("react-dom");
  return { ...actual, useFormStatus: () => ({ pending: false }) };
});

import AdminMerchantsPage from "./page";

const event = {
  slug: "mammoth-weekend",
  title: { en: "Mammoth Weekend", zh: "猛犸周末" },
};

const application = {
  id: "merchant-application-1",
  merchantProfileId: "merchant-profile-1",
  eventSlug: event.slug,
  boothProgramId: "booth-program-1",
  requestedPlanId: "booth-plan-1",
  businessName: "Summit Goods",
  contactName: "Booth Owner",
  contactEmail: "booth@example.com",
  contactPhone: "555-0100",
  category: "Equipment",
  description: "Wax and accessories",
  status: "approved" as const,
  quotedAmount: 250,
  quotedCurrency: "usd" as const,
  createdAt: "2026-07-22T10:00:00.000Z",
  updatedAt: "2026-07-23T10:00:00.000Z",
};

describe("AdminMerchantsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ userId: "staff-1", email: "staff@example.com", role: "manager" });
    mocks.getAllEvents.mockResolvedValue([event]);
    mocks.getMerchantAdminOperations.mockResolvedValue({
      applications: [application],
      allocations: [],
      booths: [],
      payments: [],
      plans: new Map(),
      programs: new Map(),
    });
  });

  it("rejects the route before loading merchant records when staff authentication fails", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("staff-required"));

    await expect(AdminMerchantsPage({})).rejects.toThrow("staff-required");
    expect(mocks.getAllEvents).not.toHaveBeenCalled();
    expect(mocks.getMerchantAdminOperations).not.toHaveBeenCalled();
  });

  it("renders only merchant operation data and preserves the requested event filter", async () => {
    const page = await AdminMerchantsPage({ searchParams: { event: event.slug, status: "approved" } });

    render(<LanguageProvider>{page}</LanguageProvider>);

    expect(screen.getByText("Merchant Operations")).toBeInTheDocument();
    expect(screen.getByText("Summit Goods")).toBeInTheDocument();
    expect(screen.getByText("USD 250.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign matching booth" })).toBeInTheDocument();
    expect(screen.queryByText("Deposit Status")).toBeNull();
    expect(mocks.getMerchantAdminOperations).toHaveBeenCalledOnce();
  });
});
