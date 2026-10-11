import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LanguageProvider } from "@/lib/language";
import { previewAddresses, previewDashboard, previewOrders, previewProfile, previewUser } from "@/lib/members/member-center-preview";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), usePathname: () => "/design-preview/member" }));
vi.mock("@/lib/shop/member-actions", () => ({ saveShippingAddressAction: vi.fn(), deleteShippingAddressAction: vi.fn() }));
vi.mock("@/lib/members/actions", () => ({ confirmMemberPendingRegistrationAction: vi.fn(), logoutMember: vi.fn() }));
vi.mock("@/lib/payments/actions", () => ({ createCheckoutSessionAction: vi.fn() }));
vi.mock("@/lib/shop/after-sales-actions",()=>({getAfterSalesAction:vi.fn(),submitAfterSalesAction:vi.fn(),updateAfterSalesAction:vi.fn()}));
import { saveShippingAddressAction, deleteShippingAddressAction } from "@/lib/shop/member-actions";
import { MemberOrdersView } from "./member-orders-view";
import { MemberOrderDetail } from "./member-order-detail";
import { MemberAddressesView } from "./member-addresses-view";
import { MemberDashboard } from "./member-dashboard";
import { MemberSecondaryShell } from "./member-secondary-shell";
import { DesignPreviewSwitcher } from "@/components/site/design-preview-switcher";

const refresh = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.mocked(saveShippingAddressAction).mockResolvedValue({ success: true }); vi.mocked(deleteShippingAddressAction).mockResolvedValue({ success: true }); });
const wrap = (child: React.ReactNode, lang: "zh" | "en" = "zh") => render(<LanguageProvider initialLang={lang}>{child}</LanguageProvider>);
const orders = { state: "ready" as const, orders: previewOrders, count: 3, page: 1, hasMore: false };

describe("member order experience", () => {
  it.each(["zh", "en"] as const)("uses one bilingual navigation for orders and existing account pages: %s", (lang) => {
    wrap(<MemberOrdersView profile={previewProfile} result={orders} filter="all" />, lang);
    const nav = screen.getByRole("navigation", { name: lang === "zh" ? "会员中心导航" : "Member navigation" });
    expect(within(nav).getByRole("link", { name: lang === "zh" ? "我的订单" : "My orders" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: lang === "zh" ? "收货地址" : "Shipping addresses" })).toHaveAttribute("href", "/member/addresses");
    expect(within(nav).getByRole("link", { name: lang === "zh" ? "我的活动" : "My trips" })).toHaveAttribute("href", "/member/trips");
  });
  it("shows read failure as retryable rather than inventing an empty order history", () => {
    wrap(<MemberOrdersView profile={previewProfile} filter="all" result={{ state: "unavailable", orders: [], count: null, page: 1, hasMore: false }} />);
    expect(screen.getByText("暂时无法读取订单")).toBeInTheDocument();
    expect(screen.queryByText("下一趟滑行，从合适的装备开始")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("keeps filtered empty state navigation inside development preview", () => {
    wrap(<MemberOrdersView preview profile={previewProfile} filter="pending" result={{ ...orders, orders: [], count: 0 }} />);
    expect(screen.getByRole("link", { name: "查看全部订单" })).toHaveAttribute("href", "/design-preview/member?view=orders");
  });
  it("displays original prices, variant, delivery snapshot and safe tracking link", () => {
    wrap(<MemberOrderDetail profile={previewProfile} order={previewOrders[0]} />);
    expect(screen.getAllByText("US$114.04")).toHaveLength(1);
    expect(screen.getByText("晨曦粉 / M")).toBeInTheDocument();
    expect(screen.getByText("123 Example Street")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往承运商查询" })).toHaveAttribute("href", "https://www.ups.com/track");
    expect(screen.getByText("已发货", { selector: "ol p" }).closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.queryByText(/¥|人民币|CNY/)).not.toBeInTheDocument();
  });
  it("does not present a refunded order as delivered", () => {
    wrap(<MemberOrderDetail profile={previewProfile} order={{ ...previewOrders[0], status: "refunded" }} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("已退款")).toBeInTheDocument();
  });
  it.each(["zh", "en"] as const)("uses the confirmed shop support email and safely encodes the order number: %s", (lang) => {
    const order = { ...previewOrders[0], orderNumber: "SF #1 & thanks" };
    const view = wrap(<MemberOrderDetail profile={previewProfile} order={order} />, lang);
    const label = lang === "zh" ? "联系客服" : "Contact support";
    expect(screen.getByText("shop@snow-force.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", `mailto:shop@snow-force.com?subject=${encodeURIComponent(`SnowForce order ${order.orderNumber}`)}`);
    view.unmount();
    wrap(<MemberOrderDetail profile={previewProfile} order={order} supportEmail="updated@example.test" />, lang);
    expect(screen.getByText("updated@example.test")).toBeInTheDocument();
    expect(screen.queryByText("shop@snow-force.com")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", `mailto:updated@example.test?subject=${encodeURIComponent(`SnowForce order ${order.orderNumber}`)}`);
  });
  it("shows partial fulfillment, returned quantities and financial adjustments in the order detail", () => {
    const order = { ...previewOrders[0], paymentStatus: "partially_refunded" as const, fulfillmentStatus: "partially_shipped" as const, creditCents: 500, roundingCents: -1, totalCents: previewOrders[0].totalCents - 501, items: [{ ...previewOrders[0].items[0], returnedQuantity: 1 }] };
    wrap(<MemberOrderDetail profile={previewProfile} order={order} />);
    expect(screen.getByText(/部分退款/)).toBeInTheDocument();
    expect(screen.getByText(/此订单正在分批配送/)).toBeInTheDocument();
    expect(screen.getByText(/已退回 1/)).toBeInTheDocument();
    expect(screen.getByText("账款调整")).toBeInTheDocument();
    expect(screen.getByText("舍入调整")).toBeInTheDocument();
    expect(screen.getByText("US$109.03")).toBeInTheDocument();
  });
  it("keeps overview order shortcuts and member account screens connected", () => {
    const view = wrap(<MemberDashboard profile={previewProfile} user={previewUser} dashboard={{ ...previewDashboard, notifications: [{ id: "verify", type: "email_verification", title: "", body: "", href: "/member/account-settings" }] }} orders={orders} searchParams={{}} />);
    expect(screen.getByRole("link", { name: "待付款" })).toHaveAttribute("href", "/member/orders?status=pending");
    expect(screen.getByRole("link", { name: "查看账号设置" })).toHaveAttribute("href", "/member/account-settings");
    view.unmount();
    wrap(<MemberSecondaryShell active="account" title="安全设置" subtitle="" profile={previewProfile} user={previewUser}><p>Existing security form</p></MemberSecondaryShell>);
    expect(screen.getByText("Existing security form")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "我的订单" })).toHaveAttribute("href", "/member/orders");
  });
  it("includes the new preview in the existing view switcher", () => {
    wrap(<DesignPreviewSwitcher />);
    expect(screen.getByRole("link", { name: "会员中心" })).toHaveAttribute("href", "/design-preview/member");
  });
});

describe("member address form", () => {
  it("saves an edited address and refreshes only after a successful result", async () => {
    wrap(<MemberAddressesView profile={previewProfile} result={{ state: "ready", addresses: previewAddresses }} />);
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("城市"), { target: { value: "Pasadena" } });
    fireEvent.click(screen.getByRole("button", { name: "保存地址" }));
    await waitFor(() => expect(saveShippingAddressAction).toHaveBeenCalledOnce());
    const data = vi.mocked(saveShippingAddressAction).mock.calls[0][0];
    expect(data.get("id")).toBe(previewAddresses[0].id); expect(data.get("city")).toBe("Pasadena");
    expect(data.has("userId")).toBe(false);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });
  it("retains fields and identifies validation errors without reporting success", async () => {
    vi.mocked(saveShippingAddressAction).mockResolvedValue({ success: false, error: "validation", fields: ["postalCode"] });
    wrap(<MemberAddressesView profile={previewProfile} result={{ state: "ready", addresses: previewAddresses }} />);
    fireEvent.click(screen.getByRole("button", { name: "编辑" })); fireEvent.click(screen.getByRole("button", { name: "保存地址" }));
    await waitFor(() => expect(screen.getByLabelText("邮政编码")).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("alert")).toHaveTextContent("请检查标出的字段");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("requires the confirmation click before deletion", async () => {
    wrap(<MemberAddressesView profile={previewProfile} result={{ state: "ready", addresses: previewAddresses }} />);
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(deleteShippingAddressAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(deleteShippingAddressAction).toHaveBeenCalledWith(previewAddresses[0].id));
  });
  it("performs no real mutations in the development preview", async () => {
    wrap(<MemberAddressesView preview profile={previewProfile} result={{ state: "ready", addresses: previewAddresses }} />);
    fireEvent.click(screen.getByRole("button", { name: "编辑" })); fireEvent.click(screen.getByRole("button", { name: "保存地址" }));
    expect(screen.getByText("这是预览操作，没有修改真实地址。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除" })); fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    expect(saveShippingAddressAction).not.toHaveBeenCalled(); expect(deleteShippingAddressAction).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
  });
});
