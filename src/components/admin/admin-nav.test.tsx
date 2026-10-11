import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ path: "/admin/events/promotion" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.path }));
vi.mock("@/lib/language", () => ({ useLanguage: () => ({ t: (text: { en: string }) => text.en }) }));
import { AdminNav } from "./admin-nav";
import { MemberStatusMessage } from "@/components/members/member-status-message";
afterEach(cleanup);
it("selects the promotion entry without also highlighting event management", () => {
  mocks.path = "/admin/events/promotion"; render(<AdminNav canManageStaff={false} />);
  expect(screen.getByRole("link", { name: "Event promotion" })).toHaveAttribute("href", "/admin/events/promotion");
  expect(screen.getByRole("link", { name: "Event promotion" })).toHaveClass("bg-snow-100");
  expect(screen.getByRole("link", { name: "Events" })).not.toHaveClass("bg-snow-100");
});
it("keeps event editing under event management", () => {
  mocks.path = "/admin/events/future-ride/edit"; render(<AdminNav canManageStaff={false} />);
  expect(screen.getByRole("link", { name: "Events" })).toHaveClass("bg-snow-100");
});
it("reports an unconfirmed subscription update to the member", () => {
  render(<MemberStatusMessage searchParams={{ privacyError: "1" }} />);
  expect(screen.getByText("We could not confirm your email preference update. Please retry.")).toBeInTheDocument();
});
