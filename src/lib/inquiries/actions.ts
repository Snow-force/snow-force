"use server";

import { sendEmail } from "@/lib/email/adapter";
import { createInquiry } from "./repository";
import { generalContactEmail } from "@/lib/contact";

type PartnerInquiryInput = {
  organizationName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  message: string;
};

export async function submitPartnerInquiry(input: PartnerInquiryInput) {
  if (
    !input.organizationName.trim() ||
    !input.contactName.trim() ||
    !input.message.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)
  ) {
    return { success: false as const, error: "Please complete the required inquiry fields." };
  }

  await createInquiry({
    ...input,
    inquiryType: { en: "Partnership", zh: "合作" },
  });

  // Fire-and-forget notification: the inquiry is already persisted;
  // email failure must not surface as a user-facing error.
  sendEmail({
    to: generalContactEmail,
    subject: `Partner Inquiry — ${input.organizationName}`,
    html: `<h2>New Partner Inquiry</h2>
<p><strong>Organization:</strong> ${escapeHtml(input.organizationName)}</p>
<p><strong>Contact:</strong> ${escapeHtml(input.contactName)}</p>
<p><strong>Email:</strong> ${escapeHtml(input.contactEmail)}</p>
<p><strong>Phone:</strong> ${escapeHtml(input.contactPhone || "—")}</p>
<hr />
<p>${escapeHtml(input.message)}</p>
<p style="color:#888;font-size:12px">Sent from SnowForce partner form</p>`,
  }).catch(() => {
    // Best-effort; the inquiry row is the system of record.
  });

  return { success: true as const };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
