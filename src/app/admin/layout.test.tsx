import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider, useLanguage } from "@/lib/language";
import { LodgingCatalog } from "@/components/admin/lodging/catalog";

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn(), logoutAdmin: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/lodging" }));
vi.mock("@/lib/lodging/actions", () => ({ saveLodgingCatalog: vi.fn() }));
import { requireAdmin } from "@/lib/auth/admin";
import AdminLayout from "./layout";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ userId: "test-staff", email: "staff@example.invalid", role: "manager" });
});
afterEach(() => {
  cleanup();
  document.cookie = "lang=;max-age=0;path=/";
});

function SiteLanguageSwitch() {
  const { setLang } = useLanguage();
  return <><button onClick={() => setLang("zh")}>CN</button><button onClick={() => setLang("en")}>EN</button></>;
}

it("inherits the site's initial Chinese language in the shell and lodging page", async () => {
  const content = await AdminLayout({ children: <LodgingCatalog status="disabled" /> });
  render(<LanguageProvider initialLang="zh">{content}</LanguageProvider>);
  expect(screen.getByRole("heading", { name: "住宿管理" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "住宿管理" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("住宿管理尚未启用");
});

it("keeps admin content synchronized with the site language switch in both directions", async () => {
  const user = userEvent.setup();
  const content = await AdminLayout({ children: <LodgingCatalog status="disabled" /> });
  render(<LanguageProvider initialLang="en"><SiteLanguageSwitch />{content}</LanguageProvider>);
  await user.click(screen.getByRole("button", { name: "CN" }));
  expect(screen.getByRole("heading", { name: "住宿管理" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "住宿管理" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "EN" }));
  expect(screen.getByRole("heading", { name: "Lodging management" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Lodging" })).toBeInTheDocument();
});

it("still requires staff authentication before returning protected content", async () => {
  vi.mocked(requireAdmin).mockRejectedValueOnce(new Error("staff-required"));
  await expect(AdminLayout({ children: <div>Protected content</div> })).rejects.toThrow("staff-required");
  expect(requireAdmin).toHaveBeenCalledOnce();
});
