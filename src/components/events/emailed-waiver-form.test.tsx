import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
const m = vi.hoisted(() => ({ request: vi.fn(), verify: vi.fn(), sign: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/registrations/v2/actions", () => ({ requestWaiverCodeAction: m.request, verifyWaiverCodeAction: m.verify, signEventWaiverAction: m.sign }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
import { EmailedWaiverForm } from "./emailed-waiver-form";
const props = { token: "a".repeat(64), attendeeName: "Child", eventSlug: "event", role: "guardian" as const, waiverText: "Reviewed guardian terms", status: "queued", ready: false };
beforeEach(() => { vi.resetAllMocks(); document.cookie = "lang=en;path=/"; m.request.mockResolvedValue({ success: true }); m.verify.mockResolvedValue({ success: true }); m.sign.mockResolvedValue({ success: true }); });
it("requires email verification before displaying a fixed guardian signature role", async () => {
  const user = userEvent.setup(); render(<LanguageProvider><EmailedWaiverForm {...props} /></LanguageProvider>);
  expect(screen.queryByRole("button", { name: "Accept and sign" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Email me a verification code" })); expect(await screen.findByRole("status")).toHaveTextContent("Code queued");
  await user.type(screen.getByLabelText("Six-digit email code"), "123456"); await user.click(screen.getByRole("button", { name: "Verify email" }));
  await user.type(await screen.findByLabelText("Your full legal name / electronic signature"), "Legal Parent");
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
  await user.click(screen.getByRole("button", { name: "Accept and sign" }));
  expect(m.sign.mock.calls[0][0].get("signerRole")).toBe("guardian"); expect(m.sign.mock.calls[0][0].get("guardianAttested")).toBe("on"); expect(m.refresh).toHaveBeenCalled();
});
it("never shows a ticket QR while a signed guardian waiver is waiting for review", () => {
  render(<LanguageProvider><EmailedWaiverForm {...props} status="needs_review" qrDataUrl="data:image/png;base64,abc" /></LanguageProvider>);
  expect(screen.getByRole("status")).toHaveTextContent("verify identity or guardian authority"); expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
