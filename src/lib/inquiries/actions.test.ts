import { expect, it, vi } from "vitest";
import { submitPartnerInquiry } from "./actions";

const { sendEmail, createInquiry } = vi.hoisted(() => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }), createInquiry: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email/adapter", () => ({ sendEmail }));
vi.mock("./repository", () => ({ createInquiry }));

it("stores partnership inquiries and notifies the general mailbox", async () => {
  await expect(submitPartnerInquiry({ organizationName: "Partner", contactName: "Rider", contactEmail: "rider@example.test", contactPhone: "", message: "Hello" })).resolves.toEqual({ success: true });
  expect(createInquiry).toHaveBeenCalledOnce();
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "hello@snow-force.com" }));
});
