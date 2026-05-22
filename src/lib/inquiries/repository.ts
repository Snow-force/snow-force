import type { PartnerInquiry } from "@/lib/types";
import { createJsonArrayStore, workspaceDataPath } from "@/lib/server/json-store";

const inquiryStore = createJsonArrayStore<PartnerInquiry>(workspaceDataPath("inquiries.json"));

export async function createInquiry(
  data: Omit<PartnerInquiry, "id" | "createdAt" | "status">,
): Promise<PartnerInquiry> {
  const inquiry: PartnerInquiry = {
    ...data,
    id: `inq_${Date.now()}_${crypto.randomUUID()}`,
    status: "new",
    createdAt: new Date().toISOString(),
  };
  const inquiries = await inquiryStore.read();
  await inquiryStore.write([...inquiries, inquiry]);
  return inquiry;
}

export async function getInquiries(): Promise<PartnerInquiry[]> {
  return inquiryStore.read();
}

export async function updateInquiryStatus(
  id: string,
  status: PartnerInquiry["status"],
): Promise<PartnerInquiry | undefined> {
  const inquiries = await inquiryStore.read();
  const inquiry = inquiries.find((item) => item.id === id);
  if (!inquiry) return undefined;
  inquiry.status = status;
  await inquiryStore.write(inquiries);
  return inquiry;
}
