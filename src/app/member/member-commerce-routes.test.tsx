import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); }, notFound: () => { throw new Error("not-found"); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/members/actions", () => ({ getCurrentMemberAccount: vi.fn() }));
vi.mock("@/components/members/member-auth-panel", () => ({ MemberAuthPanel: () => null }));
vi.mock("@/components/members/member-addresses-view", () => ({ MemberAddressesView: () => null }));
vi.mock("@/lib/shop/member-order-repository", async (original) => ({ ...(await original<typeof import("@/lib/shop/member-order-repository")>()), memberOrderRepository: { list: vi.fn(), get: vi.fn() } }));
vi.mock("@/lib/shop/shipping-address-repository", () => ({ shippingAddressRepository: { list: vi.fn() } }));
vi.mock("@/lib/shop/after-sales-actions", () => ({ getAfterSalesAction:vi.fn(async()=>({state:"ready",data:{requests:[],eligibleItems:[]}})) }));
vi.mock("@/lib/shop/policy-repository", () => ({ getShopPublishedPolicy: vi.fn() }));
vi.mock("@/lib/events/repository", () => ({ getEvents: vi.fn(async () => []) }));
vi.mock("@/lib/recaps/repository", () => ({ getRecaps: vi.fn(async () => []) }));
vi.mock("@/lib/registrations/repository", () => ({ getRegistrationsByMember: vi.fn(async () => []) }));
vi.mock("@/lib/registrations/pending-repository", () => ({ getPendingRegistrationsByMember: vi.fn(async () => []) }));
vi.mock("@/lib/payments/return-status", () => ({ resolvePaymentReturnStatus: vi.fn() }));
vi.mock("@/components/members/member-dashboard", () => ({ MemberDashboard: () => null }));
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { memberOrderRepository } from "@/lib/shop/member-order-repository";
import { shippingAddressRepository } from "@/lib/shop/shipping-address-repository";
import { getShopPublishedPolicy } from "@/lib/shop/policy-repository";
import { shopPublishedPolicySchema, shopPolicySections } from "@/lib/shop/policies";
import { getRegistrationsByMember } from "@/lib/registrations/repository";
import { previewProfile, previewUser, previewOrders } from "@/lib/members/member-center-preview";
import OrdersPage from "./orders/page";
import DetailPage from "./orders/[id]/page";
import AddressesPage from "./addresses/page";
import MemberPage from "./page";
import MemberPreview from "../design-preview/member/page";

const account = { user: previewUser, profile: previewProfile, privacyAccepted: true, emailConfirmed: true };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getShopPublishedPolicy).mockResolvedValue(null); vi.mocked(getCurrentMemberAccount).mockResolvedValue(account); vi.mocked(memberOrderRepository.list).mockResolvedValue({ state: "ready", orders: [], count: 0, page: 1, hasMore: false }); vi.mocked(memberOrderRepository.get).mockResolvedValue({ state: "ready", order: previewOrders[0] }); vi.mocked(shippingAddressRepository.list).mockResolvedValue({ state: "ready", addresses: [] }); });

describe("member commerce route boundaries", () => {
  it("uses existing login and next paths without querying customer data for guests", async () => {
    vi.mocked(getCurrentMemberAccount).mockResolvedValue(null);
    expect((await OrdersPage({ searchParams: Promise.resolve({}) })).props.searchParams.next).toBe("/member/orders");
    expect((await AddressesPage({ searchParams: Promise.resolve({}) })).props.searchParams.next).toBe("/member/addresses");
    expect((await DetailPage({ params: Promise.resolve({ id: "ord_example" }), searchParams: Promise.resolve({}) })).props.searchParams.next).toBe("/member/orders/ord_example");
    await MemberPage({ searchParams: Promise.resolve({}) });
    expect(memberOrderRepository.list).not.toHaveBeenCalled(); expect(memberOrderRepository.get).not.toHaveBeenCalled(); expect(shippingAddressRepository.list).not.toHaveBeenCalled();
  });
  it("keeps consent/profile requirements before accessing orders or addresses", async () => {
    vi.mocked(getCurrentMemberAccount).mockResolvedValue({ ...account, privacyAccepted: false });
    await expect(OrdersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/member/consent");
    await expect(AddressesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/member/consent");
    await expect(DetailPage({ params: Promise.resolve({ id: "ord_example" }), searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/member/consent");
    expect(memberOrderRepository.list).not.toHaveBeenCalled(); expect(memberOrderRepository.get).not.toHaveBeenCalled();
  });
  it("uses auth UUID for commerce and existing profile ID for event registrations", async () => {
    await OrdersPage({ searchParams: Promise.resolve({ status: "shipped", page: "2", userId: "forged" }) });
    expect(memberOrderRepository.list).toHaveBeenCalledWith(previewUser.id, "shipped", 2);
    await AddressesPage({ searchParams: Promise.resolve({ userId: "forged" }) });
    expect(shippingAddressRepository.list).toHaveBeenCalledWith(previewUser.id);
    const result = await MemberPage({ searchParams: Promise.resolve({}) });
    expect(getRegistrationsByMember).toHaveBeenCalledWith(previewProfile.id);
    expect(memberOrderRepository.list).toHaveBeenLastCalledWith(previewUser.id);
    expect(result.props.orders.state).toBe("ready");
  });
  it("returns not-found for absent/foreign orders and preserves a distinct unavailable state", async () => {
    vi.mocked(memberOrderRepository.get).mockResolvedValue({ state: "not-found" });
    await expect(DetailPage({ params: Promise.resolve({ id: "ord_foreign" }), searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
    vi.mocked(memberOrderRepository.get).mockResolvedValue({ state: "unavailable" });
    const result = await DetailPage({ params: Promise.resolve({ id: "ord_example" }), searchParams: Promise.resolve({}) });
    expect(result.props.result.state).toBe("unavailable");
    expect(memberOrderRepository.get).toHaveBeenLastCalledWith(previewUser.id, "ord_example");
  });
  it("cannot expose fixture orders outside development", async () => {
    await expect(MemberPreview({ searchParams: Promise.resolve({ view: "orders" }) })).rejects.toThrow("not-found");
  });
  it("reads the current published support email for owned orders and tolerates a policy outage", async () => {
    const policy = shopPublishedPolicySchema.parse({ schema_version: 1, version: 1, effective_at: "2026-10-01T00:00:00.000Z", content: {
      seller_name: "Fixture Seller", customer_service_email: "updated@example.test",
      terms: { return_window_days: 30, approved_dispatch_days: 14, review_business_days: 2, refund_business_days: 5, processing_business_days_min: 1, processing_business_days_max: 2, transit_business_days_min: 3, transit_business_days_max: 7 },
      copy: Object.fromEntries(shopPolicySections.map(section => [section, { en: section, zh: section }])),
    } });
    vi.mocked(getShopPublishedPolicy).mockResolvedValue(policy);
    const props = { params: Promise.resolve({ id: "ord_example" }), searchParams: Promise.resolve({}) };
    expect((await DetailPage(props)).props.supportEmail).toBe("updated@example.test");
    vi.mocked(getShopPublishedPolicy).mockRejectedValue(new Error("Policy unavailable"));
    const fallback = await DetailPage(props);
    expect(fallback.props.order).toEqual(previewOrders[0]);
    expect(fallback.props.supportEmail).toBeUndefined();
  });
});
