import type { User } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { sanitizeMemberNextPath } from "./auth-results";
import {
  CURRENT_EVENT_MEDIA_POLICY_VERSION,
  CURRENT_PRIVACY_POLICY_VERSION,
  EVENT_MEDIA_CONSENT_TYPE,
  PRIVACY_CONSENT_TYPE,
  type MemberConsentLocale,
  type MemberConsentSource,
} from "./member-consent-policy";

export {
  CURRENT_EVENT_MEDIA_POLICY_VERSION,
  CURRENT_PRIVACY_POLICY_VERSION,
  EVENT_MEDIA_CONSENT_TYPE,
  PRIVACY_CONSENT_TYPE,
} from "./member-consent-policy";
export type { MemberConsentLocale, MemberConsentSource } from "./member-consent-policy";

type MemberConsentType =
  | typeof PRIVACY_CONSENT_TYPE
  | typeof EVENT_MEDIA_CONSENT_TYPE;

type ConsentClient = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

export function memberConsentNextPath(nextPath: string | null | undefined) {
  const next = sanitizeMemberNextPath(nextPath);
  return next === "/member/consent" || next.startsWith("/member/consent?")
    ? "/member"
    : next;
}

export function memberConsentPath(nextPath: string | null | undefined) {
  const next = memberConsentNextPath(nextPath);
  return `/member/consent?next=${encodeURIComponent(next)}`;
}

export function memberLocale(value: string | null | undefined): MemberConsentLocale {
  return value === "zh" ? "zh" : "en";
}

async function getConsent(
  userId: string,
  consentType: MemberConsentType,
  policyVersion: string,
  client: ConsentClient,
) {
  const { data, error } = await client
    .from("member_consents")
    .select("accepted,accepted_at")
    .eq("user_id", userId)
    .eq("consent_type", consentType)
    .eq("policy_version", policyVersion)
    .maybeSingle<{ accepted: boolean; accepted_at: string | null }>();

  if (error || !data) return null;
  return data;
}

export async function hasCurrentPrivacyConsent(
  userId: string,
  client?: ConsentClient,
) {
  const consent = await getConsent(
    userId,
    PRIVACY_CONSENT_TYPE,
    CURRENT_PRIVACY_POLICY_VERSION,
    client ?? await createClient(),
  );
  return consent?.accepted === true && Boolean(consent.accepted_at);
}

export async function hasCurrentEventMediaConsent(
  userId: string,
  client?: ConsentClient,
) {
  const consent = await getConsent(
    userId,
    EVENT_MEDIA_CONSENT_TYPE,
    CURRENT_EVENT_MEDIA_POLICY_VERSION,
    client ?? await createClient(),
  );
  return consent?.accepted === true && Boolean(consent.accepted_at);
}

export async function recordCurrentMemberConsents({
  acceptedAt,
  client,
  locale,
  mediaAccepted,
  source,
  userId,
}: {
  acceptedAt: string;
  client: ConsentClient;
  locale: MemberConsentLocale;
  mediaAccepted: boolean;
  source: MemberConsentSource;
  userId: string;
}) {
  const { error } = await client.from("member_consents").upsert(
    [
      {
        acceptance_source: source,
        accepted: true,
        accepted_at: acceptedAt,
        consent_type: PRIVACY_CONSENT_TYPE,
        locale,
        policy_version: CURRENT_PRIVACY_POLICY_VERSION,
        user_id: userId,
      },
      {
        acceptance_source: source,
        accepted: mediaAccepted,
        accepted_at: mediaAccepted ? acceptedAt : null,
        consent_type: EVENT_MEDIA_CONSENT_TYPE,
        locale,
        policy_version: CURRENT_EVENT_MEDIA_POLICY_VERSION,
        user_id: userId,
      },
    ],
    { onConflict: "user_id,consent_type,policy_version" },
  );

  return !error;
}

export async function recordCurrentEventMediaConsent({
  acceptedAt,
  client,
  locale,
  mediaAccepted,
  source,
  userId,
}: {
  acceptedAt: string;
  client: ConsentClient;
  locale: MemberConsentLocale;
  mediaAccepted: boolean;
  source: "consent_page";
  userId: string;
}) {
  const { error } = await client.from("member_consents").upsert(
    {
      acceptance_source: source,
      accepted: mediaAccepted,
      accepted_at: mediaAccepted ? acceptedAt : null,
      consent_type: EVENT_MEDIA_CONSENT_TYPE,
      locale,
      policy_version: CURRENT_EVENT_MEDIA_POLICY_VERSION,
      user_id: userId,
    },
    { onConflict: "user_id,consent_type,policy_version" },
  );

  return !error;
}

function profileDisplayName(user: User) {
  const metadataName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim();
  return user.email?.split("@")[0] ?? "SnowForce Member";
}

export async function ensureMemberProfileAfterConsent(
  user: User,
  providedClient?: ConsentClient,
) {
  const client = providedClient ?? await createClient();
  if (!(await hasCurrentPrivacyConsent(user.id, client))) return false;

  const { data: existing, error: readError } = await client
    .from("member_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();

  if (readError) return false;
  if (existing) return true;
  if (!user.email) return false;

  const mediaAccepted = await hasCurrentEventMediaConsent(user.id, client);
  const { error: insertError } = await client.from("member_profiles").insert({
    display_name: profileDisplayName(user),
    email: user.email,
    photo_social_media_consent: mediaAccepted,
    user_id: user.id,
  });

  return !insertError;
}

export async function resolveMemberAuthDestination(
  user: User,
  nextPath: string,
  providedClient?: ConsentClient,
) {
  const client = providedClient ?? await createClient();
  const next = memberConsentNextPath(nextPath);
  if (!(await hasCurrentPrivacyConsent(user.id, client))) {
    return memberConsentPath(next);
  }

  return (await ensureMemberProfileAfterConsent(user, client))
    ? next
    : "/member?error=profile";
}
