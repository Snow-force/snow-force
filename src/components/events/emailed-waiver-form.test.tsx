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
it("explains the birthday gate without offering an adult signature early", () => {
  render(<LanguageProvider><EmailedWaiverForm {...props} role="attendee" canSign={false} /></LanguageProvider>);
  expect(screen.getByRole("status")).toHaveTextContent("18th birthday");
  expect(screen.queryByRole("button", { name: "Email me a verification code" })).not.toBeInTheDocument();
});
it("shows accompaniment requirements and makes the signed terms available for saving", async () => {
  const user = userEvent.setup();
  render(<LanguageProvider><EmailedWaiverForm {...props} status="signed" needsAccompaniment eventDate="2026-11-07" eventTitle={{ en: "Snow activity", zh: "滑雪活动" }} eventLocation={{ en: "Burlingame, CA", zh: "加州" }} /></LanguageProvider>);
  expect(screen.getByText(/Staff must verify their presence/)).toBeInTheDocument();
  expect(screen.getByText(/2026-11-07/)).toHaveTextContent("Burlingame, CA");
  await user.click(screen.getByText("View your waiver terms"));
  expect(screen.getByText("Reviewed guardian terms")).toBeVisible();
  expect(screen.getByRole("button", { name: "Print or save this record" })).toBeInTheDocument();
});
it("expands the complete saved terms before opening the print dialog", async () => {
  const user = userEvent.setup();
  render(<LanguageProvider><EmailedWaiverForm {...props} status="signed" /></LanguageProvider>);
  const print = vi.spyOn(window, "print").mockImplementation(() => {
    expect(screen.getByText("Reviewed guardian terms")).toBeVisible();
  });
  await user.click(screen.getByRole("button", { name: "Print or save this record" }));
  expect(print).toHaveBeenCalledOnce(); print.mockRestore();
});
