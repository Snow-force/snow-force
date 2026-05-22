"use server";

import { createInquiry } from "./repository";

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
  return { success: true as const };
}
