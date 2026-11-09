import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { AdminOpsGuide } from "./admin-ops-guide";
import { opsGuideStorageKey } from "./admin-ops-guide-content";

function view(lang: "en" | "zh" = "en") {
  return render(<LanguageProvider initialLang={lang}><AdminOpsGuide /></LanguageProvider>);
}
function start(lang: "en" | "zh" = "en") {
  const result = view(lang);
  fireEvent.click(screen.getByRole("button", { name: lang === "zh" ? "开始／继续引导" : "Start / resume guide" }));
  return result;
}
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("staff workflow guide", () => {
  it("is discoverable without obscuring the desk and lets staff hide and reopen it", () => {
    view();
    const toggle = screen.getByRole("button", { name: "Start / resume guide" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole("heading", { name: "1. Start with the work queue" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Go to work queue" })).toHaveAttribute("href", "#ops-work-queue");
    expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Hide guide" }));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start / resume guide" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("supports guided learning, persists in the tab, resumes and resets a workflow", () => {
    const first = start();
    fireEvent.click(screen.getByRole("button", { name: "Understood, continue" }));
    expect(screen.getByRole("heading", { name: "2. Read new partner inquiries" })).toHaveFocus();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(JSON.parse(sessionStorage.getItem(opsGuideStorageKey)!)).toMatchObject({ guideId: "daily", stepIndex: 1, completed: ["daily-queue"] });
    first.unmount();
    start();
    expect(screen.getByRole("heading", { name: "2. Read new partner inquiries" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Understood, continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish this guide" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByText(/You have read every step/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish this guide" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
    fireEvent.click(screen.getByRole("button", { name: "Restart this guide" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByRole("heading", { name: "1. Start with the work queue" })).toBeInTheDocument();
  });

  it("lets staff revisit steps without marking them read, and retains other workflows when resetting", () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "Understood, continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous step" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish an event" }));
    fireEvent.click(screen.getByRole("button", { name: "Understood, continue" }));
    fireEvent.click(within(screen.getByRole("navigation", { name: "Guide steps" })).getByRole("button", { name: /3. Preview, publish, and promote/ }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    fireEvent.click(screen.getByRole("button", { name: "Restart this guide" }));
    fireEvent.click(screen.getByRole("button", { name: "Daily shift" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  });

  it("opens existing modules separately and explains cancellation/refund permissions", () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "Registrations & refunds" }));
    const link = screen.getByRole("link", { name: /Open Registrations/ });
    expect(link).toHaveAttribute("href", "/admin/registrations");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Guide steps" })).getByRole("button", { name: /3. Review cancellation, then refund/ }));
    expect(screen.getByText(/Only authorized admins/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open cancellation review/ })).toHaveAttribute("href", "/admin/registrations#cancellations");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("returns to unread steps rather than claiming completion after skipping to the last step", () => {
    start();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Guide steps" })).getByRole("button", { name: /3. Leave a clear handoff/ }));
    expect(screen.queryByRole("button", { name: "Finish this guide" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Understood, continue" }));
    expect(screen.getByRole("heading", { name: "1. Start with the work queue" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.queryByText(/You have read every step/)).not.toBeInTheDocument();
  });

  it("works when session storage is denied and explains that progress cannot be saved", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    start();
    fireEvent.click(screen.getByRole("button", { name: "Understood, continue" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText(/This browser cannot save progress/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide guide" }));
    fireEvent.click(screen.getByRole("button", { name: "Start / resume guide" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  });

  it("renders Chinese guidance and distinguishes reading progress from business completion", () => {
    start("zh");
    expect(screen.getByRole("heading", { name: "后台使用向导" })).toBeInTheDocument();
    expect(screen.getByText(/不代表业务操作已完成/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "商家与住宿" }));
    expect(screen.getByRole("link", { name: /打开商家摊位/ })).toHaveAttribute("href", "/admin/merchants");
    fireEvent.click(screen.getByRole("button", { name: "已了解，下一步" }));
    expect(screen.getByText(/不是公开售房/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /打开住宿管理/ })).toHaveAttribute("href", "/admin/lodging");
  });
});
