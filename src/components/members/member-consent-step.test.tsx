import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { MemberConsentStep } from "./member-consent-step";

vi.mock("@/lib/members/actions", () => ({
  acceptMemberConsent: "/member/consent/accept",
  cancelMemberConsent: "/member/consent/cancel",
}));

describe("MemberConsentStep", () => {
  it("uses one required privacy checkbox that includes the event-media permission", () => {
    render(
      <LanguageProvider initialLang="zh">
        <MemberConsentStep next="/member" />
      </LanguageProvider>,
    );

    const privacy = screen.getByLabelText(/我已阅读并同意《隐私守则》，包括授权/);
    const continueButton = screen.getByRole("button", { name: "同意并继续" });

    expect(privacy).toBeRequired();
    expect(screen.queryByRole("checkbox", { name: /活动照片和视频授权/ })).not.toBeInTheDocument();
    expect(continueButton).toBeDisabled();
    expect(screen.queryByText(/Google 登录/)).not.toBeInTheDocument();

    fireEvent.click(privacy);
    expect(continueButton).toBeEnabled();
  });
});
