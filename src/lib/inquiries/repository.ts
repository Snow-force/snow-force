import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { PartnerInquiry } from "@/lib/types";

type InquiryRow = {
  id: string;
  organization_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  inquiry_type: string;
  message: string;
  status: string;
  created_at: string;
};

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is not configured.");
  return url;
}

function createAdminClient() {
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    throw new Error("Supabase admin writes are not configured.");

  return createClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function rowToInquiry(row: InquiryRow): PartnerInquiry {
  return {
    id: row.id,
    organizationName: row.organization_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone ?? "",
    inquiryType: { en: row.inquiry_type, zh: row.inquiry_type },
    message: row.message,
    createdAt: row.created_at,
    status: row.status as PartnerInquiry["status"],
  };
}

export async function createInquiry(
  data: Omit<PartnerInquiry, "id" | "createdAt" | "status">,
): Promise<PartnerInquiry> {
  const { data: row, error } = await createAdminClient()
    .from("partner_inquiries")
    .insert({
      organization_name: data.organizationName,
      contact_name: data.contactName,
      contact_email: data.contactEmail,
      contact_phone: data.contactPhone || null,
      inquiry_type: data.inquiryType.en,
      message: data.message,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return rowToInquiry(row as unknown as InquiryRow);
}

export async function getInquiries(): Promise<PartnerInquiry[]> {
  const { data, error } = await createAdminClient()
    .from("partner_inquiries")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as InquiryRow[]).map(rowToInquiry);
}

export async function updateInquiryStatus(
  id: string,
  status: PartnerInquiry["status"],
): Promise<PartnerInquiry | undefined> {
  const { data: row, error } = await createAdminClient()
    .from("partner_inquiries")
    .update({ status })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return row ? rowToInquiry(row as unknown as InquiryRow) : undefined;
}
