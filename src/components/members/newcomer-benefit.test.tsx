import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
const action = vi.hoisted(() => vi.fn());
vi.mock("@/lib/shop/newcomer-actions", () => ({ claimNewcomerAction: action }));
import { NewcomerBenefit } from "./newcomer-benefit";
beforeEach(() => { vi.resetAllMocks(); });
it("does not issue codes before email verification", () => { render(<LanguageProvider initialLang="zh"><NewcomerBenefit verified={false} /></LanguageProvider>); expect(action).not.toHaveBeenCalled(); expect(screen.getByText(/验证邮箱后/)).toBeInTheDocument(); });
it("displays and copies the private issued code and expiration", async () => {
  const code = `WELCOME-${"A".repeat(32)}`, copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  action.mockResolvedValue({ status: "ready", code, endsAt: "2026-11-10T10:00:00Z", policy: { type: "percentage", value: 10, minimum: 0, days: 30, eligibility: "no_orders", registeredAfter: null } });
  render(<LanguageProvider initialLang="en"><NewcomerBenefit verified /></LanguageProvider>);
  expect(await screen.findByText(code)).toBeInTheDocument(); fireEvent.click(screen.getByText("Copy code"));
  expect(screen.getByText(/No minimum spend. Regular-price items only; cannot be combined/)).toBeInTheDocument();
  await waitFor(() => expect(copy).toHaveBeenCalledWith(code)); expect(await screen.findByText("Copied")).toBeInTheDocument();
});
it.each(["disabled", "ineligible", "signed-out"])("does not advertise unavailable eligibility (%s)", async status => { action.mockResolvedValue({ status }); const view = render(<LanguageProvider initialLang="en"><NewcomerBenefit verified /></LanguageProvider>); await waitFor(() => expect(action).toHaveBeenCalled()); await waitFor(() => expect(view.container).toBeEmptyDOMElement()); });
it("allows retry after a temporary failure", async () => { action.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ status: "used" }); render(<LanguageProvider initialLang="en"><NewcomerBenefit verified /></LanguageProvider>); fireEvent.click(await screen.findByText("Try again")); expect(await screen.findByText("Your welcome code has been used.")).toBeInTheDocument(); });
it("explains ineligibility on the dedicated page instead of rendering an empty page", async () => { action.mockResolvedValue({ status: "ineligible" }); render(<LanguageProvider initialLang="en"><NewcomerBenefit verified standalone /></LanguageProvider>); expect(await screen.findByText("This account does not qualify for the current welcome offer.")).toBeInTheDocument(); expect(screen.getByText("Back to my account")).toHaveAttribute("href", "/member"); });
it.each(["pending", "accepted", "unavailable"] as const)("shows the actual welcome-email state (%s) while retaining the code", async emailStatus => {
  const code = `WELCOME-${"B".repeat(32)}`;
  action.mockResolvedValue({ status: "ready", code, endsAt: "2026-11-10T10:00:00Z", policy: { type: "percentage", value: 10, minimum: 0, days: 30, eligibility: "no_orders", registeredAfter: null }, emailStatus });
  render(<LanguageProvider initialLang="zh"><NewcomerBenefit verified /></LanguageProvider>);
  expect(await screen.findByText(code)).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(emailStatus === "pending" ? "正在准备发送至注册邮箱" : emailStatus === "accepted" ? "已提交发送至注册邮箱" : "暂时无法发送");
});
