import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { NewcomerWelcome } from "./newcomer-welcome";
const show = vi.fn(), close = vi.fn();
const policy = { type: "percentage" as const, value: 10, minimum: 0, days: 30, eligibility: "no_orders" as const, registeredAfter: null };
beforeEach(() => { vi.clearAllMocks(); Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: show }); Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: close }); });
it.each(["en", "zh"] as const)("opens immediately with a dismissible modal and preserves the registration return destination in %s", lang => {
  render(<LanguageProvider initialLang={lang}><NewcomerWelcome policy={policy} /></LanguageProvider>);
  expect(show).toHaveBeenCalledOnce(); expect(document.body.style.overflow).toBe("hidden");
  expect(screen.getByText(lang === "zh" ? /无最低消费，仅限美元计价原价商品，不与其他优惠叠加/ : /No minimum spend. Regular-price USD merchandise only. Cannot be combined/)).toBeInTheDocument();
  expect(screen.getByText(lang === "zh" ? /每人、每个账户及已验证邮箱仅限使用一次/ : /One use per person, account and verified email/)).toBeInTheDocument();
  expect(screen.getByText(lang === "zh" ? /折扣码将随欢迎信发送到注册邮箱/ : /shop code will arrive with your welcome email/)).toBeInTheDocument();
  expect(screen.getByText(lang === "zh" ? "注册并领取折扣码" : "Register & get my code")).toHaveAttribute("href", "/member?mode=register&next=%2Fmember%2Fwelcome");
  fireEvent.click(screen.getByLabelText(lang === "zh" ? "关闭新人优惠弹窗" : "Close welcome offer"));
  expect(close).toHaveBeenCalled(); expect(document.body.style.overflow).not.toBe("hidden");
  fireEvent.click(screen.getByText(lang === "zh" ? "领取专属折扣码" : "Get my code")); expect(show).toHaveBeenCalledTimes(2);
});
it("supports Escape dismissal and restores page scroll on unmount", () => {
  const view = render(<LanguageProvider initialLang="en"><NewcomerWelcome policy={policy} /></LanguageProvider>);
  fireEvent(screen.getByLabelText("Close welcome offer").closest("dialog") ?? document.body, new Event("cancel", { bubbles: true }));
  expect(close).toHaveBeenCalled(); expect(document.body.style.overflow).not.toBe("hidden"); view.unmount();
});
