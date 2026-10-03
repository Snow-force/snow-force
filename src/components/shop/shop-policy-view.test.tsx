import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { shopPolicySections, shopPublishedPolicySchema } from "@/lib/shop/policies";
import { ShopPolicyView } from "./shop-policy-view";

const policy = shopPublishedPolicySchema.parse({
  schema_version: 1, version: 3, effective_at: "2026-09-29T12:00:00.000Z",
  content: {
    seller_name: "Fixture Gear LLC", customer_service_email: "support@example.test",
    terms: { return_window_days: 30, approved_dispatch_days: 14, review_business_days: 2, refund_business_days: 5, processing_business_days_min: 1, processing_business_days_max: 2, transit_business_days_min: 3, transit_business_days_max: 7 },
    copy: Object.fromEntries(shopPolicySections.map((section) => [section, { en: `Published English ${section}`, zh: `已发布中文 ${section}` }])),
  },
});

describe("published shop policy view", () => {
  it("shows each English policy section, published identity and effective date", () => {
    render(<LanguageProvider initialLang="en"><ShopPolicyView policy={policy} unavailable={false} /></LanguageProvider>);
    expect(screen.getByRole("heading", { level: 1, name: "Shipping & returns" })).toBeInTheDocument();
    expect(screen.getByText("Fixture Gear LLC")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "support@example.test" })).toHaveAttribute("href", "mailto:support@example.test");
    expect(document.querySelector("time")).toHaveAttribute("datetime", policy.effective_at);
    for (const section of shopPolicySections) {
      expect(screen.getByText(`Published English ${section}`)).toBeInTheDocument();
      expect(document.querySelector(`section#${section}`)).toHaveAttribute("aria-labelledby", `${section}-title`);
    }
    expect(screen.queryByText(/已发布中文/)).not.toBeInTheDocument();
  });
  it("renders the same published policy in Chinese with navigable sections", () => {
    render(<LanguageProvider initialLang="zh"><ShopPolicyView policy={policy} unavailable={false} /></LanguageProvider>);
    expect(screen.getByRole("heading", { level: 1, name: "商城配送与退换政策" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "商城政策目录" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "退货地址" })).toHaveAttribute("href", "#return_address");
    for (const section of shopPolicySections) expect(screen.getByText(`已发布中文 ${section}`)).toBeInTheDocument();
    expect(screen.queryByText(/Published English/)).not.toBeInTheDocument();
  });
  it("shows the operator-confirmed support email while keeping unpublished policy terms hidden", () => {
    render(<LanguageProvider initialLang="zh"><ShopPolicyView policy={null} unavailable={false} /></LanguageProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("商城政策尚未生效");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText(/30|Park Plaza|support@/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← 返回装备商城" })).toHaveAttribute("href", "/shop");
    expect(screen.getByRole("link", { name: "Shop@snow-force.com" })).toHaveAttribute("href", "mailto:Shop@snow-force.com");
  });
  it("does not display stale content when policy loading failed", () => {
    render(<LanguageProvider initialLang="en"><ShopPolicyView policy={policy} unavailable /></LanguageProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("Shop policy is temporarily unavailable");
    expect(screen.queryByText("Fixture Gear LLC")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText(/Published English/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "support@example.test" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop@snow-force.com" })).toHaveAttribute("href", "mailto:Shop@snow-force.com");
  });
});
