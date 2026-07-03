import { createClient } from "@supabase/supabase-js";

import type { WaiverAcceptance } from "@/lib/types";
import { computeWaiverSha } from "./waiver";

// ── DB row types ──────────────────────────────────────────────────────────────

type EventWaiverRow = {
  waiver_text_en: string | null;
  waiver_text_sha: string | null;
};

type WaiverAcceptanceRow = {
  id: number;
  registration_id: string;
  legal_text_snapshot: string;
  waiver_text_sha: string;
  typed_name: string;
  accepted_at: string;
  created_at: string;
};

// ── Client ────────────────────────────────────────────────────────────────────

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is not configured.");
  return url;
}

function createWaiverAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Supabase admin writes are not configured.");
  return createClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowToWaiverAcceptance(row: WaiverAcceptanceRow): WaiverAcceptance {
  return {
    id: row.id,
    registrationId: row.registration_id,
    legalTextSnapshot: row.legal_text_snapshot,
    waiverTextSha: row.waiver_text_sha,
    typedName: row.typed_name,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

// ── Repository functions ───────────────────────────────────────────────────────

/**
 * Get the active waiver for an event, or null if no waiver is configured.
 * Returns the waiver text and its server-computed SHA-256 hash.
 */
export async function getActiveWaiverForEvent(
  eventSlug: string,
): Promise<{ text: string; sha: string } | null> {
  const supabase = createWaiverAdminClient();

  const { data, error } = await supabase
    .from("events")
    .select("waiver_text_en, waiver_text_sha")
    .eq("slug", eventSlug)
    .single<EventWaiverRow>();

  if (error || !data || !data.waiver_text_en) return null;

  return {
    text: data.waiver_text_en,
    sha: data.waiver_text_sha ?? (await computeWaiverSha(data.waiver_text_en)),
  };
}

/**
 * Create an immutable waiver acceptance record.
 * Called only at member registration confirmation time.
 */
export async function createWaiverAcceptance(input: {
  registrationId: string;
  legalTextSnapshot: string;
  waiverTextSha: string;
  typedName: string;
  acceptedAt: string;
}): Promise<WaiverAcceptance> {
  const supabase = createWaiverAdminClient();

  const { data, error } = await supabase
    .from("waiver_acceptances")
    .insert({
      registration_id: input.registrationId,
      legal_text_snapshot: input.legalTextSnapshot,
      waiver_text_sha: input.waiverTextSha,
      typed_name: input.typedName,
      accepted_at: input.acceptedAt,
    })
    .select()
    .single<WaiverAcceptanceRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create waiver acceptance.");
  }

  return rowToWaiverAcceptance(data);
}

/**
 * Look up an existing waiver acceptance by registration ID, or null if none.
 */
export async function getWaiverAcceptanceForRegistration(
  registrationId: string,
): Promise<WaiverAcceptance | null> {
  const supabase = createWaiverAdminClient();

  const { data, error } = await supabase
    .from("waiver_acceptances")
    .select("*")
    .eq("registration_id", registrationId)
    .maybeSingle<WaiverAcceptanceRow>();

  if (error || !data) return null;

  return rowToWaiverAcceptance(data);
}
