import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import type { Operation } from "@/lib/admin-operations";
import { AdminDashboardView } from "./admin-dashboard-view";

const operations: Operation[] = [
  { id: "r1", kind: "approval", group: "people", priority: "review", title: { en: "Alex", zh: "小雪" }, context: { en: "Winter trip", zh: "冬季活动" }, href: "/admin/registrations?event=winter&q=alex", date: "2026-11-01" },
  { id: "e1", kind: "event", group: "publishing", priority: "prepare", title: { en: "December camp", zh: "十二月训练营" }, context: { en: "2026-12-01", zh: "2026-12-01" }, href: "/admin/events/camp/edit", date: "2026-12-01" },
];
function view(lang: "en" | "zh" = "en", unavailable: ("events" | "inquiries")[] = [], items = operations) {
  return render(<LanguageProvider initialLang={lang}><AdminDashboardView stats={[{ key: "events", value: unavailable.includes("events") ? null : 1, href: "/admin/events" }]}
    operations={items} unavailable={unavailable} inquiries={[{ id: "p1", organizationName: "Mountain partner", contactName: "Pat", contactEmail: "pat@example.com", message: "Let’s plan a ride." }]} /></LanguageProvider>);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("operations desk", () => {
  it("filters work by category, searches both languages, and resets filters", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Publishing 1" }));
    expect(screen.queryByText("Alex")).not.toBeInTheDocument();
    expect(screen.getByText("December camp")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "冬季" } });
    expect(screen.getByText("No work matches these filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: " 小雪 " } });
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.queryByText("December camp")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Alex/ })).toHaveAttribute("href", operations[0].href);
  });

  it("copies the full queue even when filtered and announces success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    view();
    fireEvent.click(screen.getByRole("button", { name: "People 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy shift brief" }));
    expect(await screen.findByText("Shift brief copied.")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Prepare event draft: 1"));
    expect(writeText.mock.calls[0][0]).not.toContain("Alex");
    vi.unstubAllGlobals();
  });

  it("offers selectable manual copy when the clipboard is denied", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    view();
    fireEvent.click(screen.getByRole("button", { name: "Copy shift brief" }));
    const brief = await screen.findByRole("textbox", { name: "Shift brief text" });
    expect((brief as HTMLTextAreaElement).value).toContain("Review registration: 1");
    fireEvent.focus(brief);
    expect((brief as HTMLTextAreaElement).selectionEnd).toBe((brief as HTMLTextAreaElement).value.length);
    vi.unstubAllGlobals();
  });

  it("warns about unavailable sources and never substitutes a zero", () => {
    view("en", ["events", "inquiries"], []);
    expect(screen.getByRole("alert")).toHaveTextContent("This queue is incomplete");
    expect(screen.getByRole("link", { name: /Events/ })).toHaveTextContent("—");
    expect(screen.queryByText("No new partner inquiries in the loaded data.")).not.toBeInTheDocument();
  });

  it("renders Chinese labels, partner conversations, and embedded admin guidance", () => {
    view("zh");
    expect(screen.getByRole("heading", { name: "运营工作台" })).toBeInTheDocument();
    expect(screen.getByText("小雪")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Mountain partner"));
    expect(screen.getByRole("link", { name: "起草邮件回复" })).toHaveAttribute("href", "mailto:pat%40example.com");
    fireEvent.click(screen.getByText("工作台使用说明"));
    expect(screen.getByText(/按顺序处理/)).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "待办队列" })).getByRole("button", { name: "全部待办 2" })).toHaveAttribute("aria-pressed", "true");
  });
});
