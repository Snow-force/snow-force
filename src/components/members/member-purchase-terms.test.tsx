import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/lib/language";
import { afterSalesPurchase, type AfterSalesPurchase } from "@/lib/shop/after-sales";
import { shopPolicySections } from "@/lib/shop/policies";
import { MemberPurchaseTerms } from "./member-purchase-terms";
const purchase = (): AfterSalesPurchase => afterSalesPurchase.parse({ orderId: "order_fixture", assessedOn: "2026-10-02", policy: {
  schema_version: 1, version: 3, effective_at: "2026-09-01T00:00:00.000Z", content: {
    seller_name: "Purchase Seller", customer_service_email: "purchase@example.test",
    terms: { return_window_days: 45, approved_dispatch_days: 10, review_business_days: 2, refund_business_days: 5, processing_business_days_min: 1, processing_business_days_max: 2, transit_business_days_min: 3, transit_business_days_max: 7 },
    copy: Object.fromEntries(shopPolicySections.map(section=>[section,{en:`Purchase policy ${section}`,zh:`购买时政策 ${section}`}])) },
  }, lines:[{id:"ordli_fixture",title:"Original Gear",status:"within_window",earliestDeadline:"2026-10-20",latestDeadline:"2026-10-20"}],dispatches:[] });
describe("member purchase policy and calendar deadlines",()=>{
 it.each(["en","zh"] as const)("shows the exact purchase version, contact, copy and deadline in %s",lang=>{
   render(<LanguageProvider initialLang={lang}><MemberPurchaseTerms purchase={purchase()}/></LanguageProvider>);
   expect(screen.getByText(lang==="en"?/Policy version 3/:/政策版本 3/)).toBeInTheDocument();
   expect(screen.getByText(lang==="en"?/45 calendar days/:/45 个日历日/)).toBeInTheDocument();
   expect(screen.getByText(/Oct 20, 2026|2026年10月20日/)).toBeInTheDocument();
   fireEvent.click(screen.getByText(lang==="en"?"Read the policy accepted for this purchase":"查看购买时的完整政策"));
   expect(screen.getByRole("link",{name:"purchase@example.test"})).toHaveAttribute("href","mailto:purchase@example.test");
   for(const section of shopPolicySections)expect(screen.getByText(`${lang==="en"?"Purchase policy":"购买时政策"} ${section}`)).toBeInTheDocument();
 });
 it("keeps expiry reviewable and split-delivery dates explicit without inventing one deadline",()=>{
   const value=purchase();value.lines[0]={...value.lines[0],status:"expired",earliestDeadline:"2026-10-01",latestDeadline:"2026-10-01"};value.lines.push({id:"ordli_second",title:"Split Gear",status:"manual",earliestDeadline:"2026-10-01",latestDeadline:"2026-10-20"});
   render(<LanguageProvider initialLang="en"><MemberPurchaseTerms purchase={value}/></LanguageProvider>);
   expect(screen.getByText(/You may submit a request for review/)).toBeInTheDocument();expect(screen.getByText(/split packages need staff review/)).toBeInTheDocument();expect(screen.getByText(/Oct 1, 2026 – Oct 20, 2026/)).toBeInTheDocument();expect(screen.getByText(/Quality issues and incorrect items remain reviewable/)).toBeInTheDocument();
 });
 it("does not substitute current/default terms when original purchase evidence is unavailable",()=>{
   render(<LanguageProvider initialLang="zh"><MemberPurchaseTerms purchase={null}/></LanguageProvider>);
   expect(screen.getByText(/暂时无法核实原购买政策/)).toBeInTheDocument();expect(screen.queryByText(/30|45|版本/)).not.toBeInTheDocument();expect(screen.queryByRole("link")).not.toBeInTheDocument();
 });
});
