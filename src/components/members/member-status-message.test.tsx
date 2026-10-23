import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/lib/language";
import { MemberStatusMessage } from "./member-status-message";

describe("verified payment feedback", () => {
  it("does not treat a success query parameter as proof of payment", () => {
    render(<LanguageProvider initialLang="en"><MemberStatusMessage searchParams={{ payment: "success" }} /></LanguageProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be verified");
  });
  it("distinguishes paid places awaiting staff approval from confirmed attendance", () => {
    render(<LanguageProvider initialLang="zh"><MemberStatusMessage searchParams={{ payment: "success" }} verifiedPaymentStatus="approval_pending" /></LanguageProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("尚未获准参加");
    expect(screen.queryByText(/行程已确认/)).not.toBeInTheDocument();
  });
  it("explains review after a free or coupon registration", () => {
    render(<LanguageProvider initialLang="en"><MemberStatusMessage searchParams={{ registration: "approval-pending" }} /></LanguageProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("awaits staff approval");
  });
});
