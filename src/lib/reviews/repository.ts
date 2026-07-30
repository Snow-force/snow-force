import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import type {
  EventQrCampaign,
  EventQrCampaignPurpose,
  EventReview,
  EventReviewAnswers,
  EventReviewConfig,
  EventReviewModerationStatus,
  PublicEventReview,
  Registration,
} from "@/lib/types";

import {
  normalizeReviewConfig,
  publicReviewAnswers,
  validateReviewAnswers,
} from "./config";
import { evaluateQrAccess } from "./access-policy";

const REVIEW_ACCESS_GRACE_MINUTES = 15;

type CampaignRow = {
  id: string;
  event_slug: string;
  purpose: EventQrCampaignPurpose;
  access_code: string;
  status: EventQrCampaign["status"];
  opened_at: string | null;
  closes_at: string | null;
  closed_at: string | null;
  review_config_snapshot: unknown;
  created_at: string;
  updated_at: string;
};

type ReviewRow = {
  id: string;
  registration_id: string;
  campaign_id: string;
  overall_rating: number;
  answers: EventReviewAnswers;
  consent_to_publish: boolean;
  submission_language: "en" | "zh";
  moderation_status: EventReviewModerationStatus;
  moderation_note: string;
  moderated_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReviewAccessRow = {
  id: string;
  campaign_id: string;
  registration_id: string;
  scanned_at: string;
  access_expires_at: string | null;
  result: "accepted" | "rejected";
};

function throwSupabaseError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function mapCampaign(row: CampaignRow): EventQrCampaign {
  return {
    id: row.id,
    eventSlug: row.event_slug,
    purpose: row.purpose,
    accessCode: row.access_code,
    status: row.status,
    openedAt: row.opened_at,
    closesAt: row.closes_at,
    closedAt: row.closed_at,
    reviewConfigSnapshot:
      row.purpose === "review" ? normalizeReviewConfig(row.review_config_snapshot) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReview(
  row: ReviewRow,
  registration: Pick<Registration, "eventSlug" | "memberId">,
): EventReview {
  return {
    id: row.id,
    registrationId: row.registration_id,
    campaignId: row.campaign_id,
    eventSlug: registration.eventSlug,
    memberId: registration.memberId ?? "",
    overallRating: row.overall_rating,
    answers: row.answers,
    consentToPublish: row.consent_to_publish,
    submissionLanguage: row.submission_language,
    moderationStatus: row.moderation_status,
    moderationNote: row.moderation_note,
    moderatedAt: row.moderated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function maskMemberName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "SnowForce member";
  if (/^[\u3400-\u9fff]/.test(trimmed)) return `${trimmed.slice(0, 1)}**`;
  const parts = trimmed.split(/\s+/);
  return `${parts[0]} ${parts.length > 1 ? `${parts.at(-1)?.slice(0, 1) ?? ""}.` : "member"}`;
}

async function getConfirmedRegistration(eventSlug: string, memberId: string) {
  const { data, error } = await createAdminClient()
    .from("registrations")
    .select("*")
    .eq("event_slug", eventSlug)
    .eq("member_id", memberId)
    .eq("status", "confirmed")
    .maybeSingle();
  throwSupabaseError(error);
  return data as RegistrationRow | null;
}

type RegistrationRow = {
  id: string;
  event_slug: string;
  member_id: string | null;
  contact_name: string;
  attendance_status: Registration["attendanceStatus"];
  attendance_source: Registration["attendanceSource"];
  attendance_marked_at: string | null;
};

export async function getCampaignByCode(accessCode: string) {
  const { data, error } = await createAdminClient()
    .from("event_qr_campaigns")
    .select("*")
    .eq("access_code", accessCode)
    .maybeSingle();
  throwSupabaseError(error);
  return data ? mapCampaign(data as CampaignRow) : undefined;
}

export async function getEventCampaigns(eventSlug: string) {
  const { data, error } = await createAdminClient()
    .from("event_qr_campaigns")
    .select("*")
    .eq("event_slug", eventSlug)
    .order("purpose");
  throwSupabaseError(error);
  return ((data ?? []) as CampaignRow[]).map(mapCampaign);
}

export async function openEventCampaign(input: {
  eventSlug: string;
  purpose: EventQrCampaignPurpose;
  durationMinutes: number;
  reviewConfig: EventReviewConfig;
}) {
  const now = new Date();
  const closesAt = new Date(now.getTime() + input.durationMinutes * 60_000).toISOString();
  const accessCode = crypto.randomUUID().replaceAll("-", "");
  const client = createAdminClient();

  const { data, error } = await client.rpc("open_event_qr_campaign", {
    p_event_slug: input.eventSlug,
    p_purpose: input.purpose,
    p_access_code: accessCode,
    p_closes_at: closesAt,
    p_review_config_snapshot: input.purpose === "review" ? input.reviewConfig : null,
  });
  throwSupabaseError(error);
  return mapCampaign(data as CampaignRow);
}

export async function closeEventCampaign(eventSlug: string, purpose: EventQrCampaignPurpose) {
  const { data, error } = await createAdminClient()
    .from("event_qr_campaigns")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("event_slug", eventSlug)
    .eq("purpose", purpose)
    .select("*")
    .maybeSingle();
  throwSupabaseError(error);
  return data ? mapCampaign(data as CampaignRow) : undefined;
}

export type QrAccessResult =
  | { status: "accepted"; campaign: EventQrCampaign; registrationId: string; alreadyCompleted: boolean }
  | { status: "not_found" | "not_open" | "not_registered" | "not_attended" | "wrong_purpose" };

export async function acceptCheckinAccess(
  accessCode: string,
  memberId: string,
): Promise<QrAccessResult> {
  const campaign = await getCampaignByCode(accessCode);
  if (!campaign) return { status: "not_found" };
  const registration =
    campaign.purpose === "checkin"
      ? await getConfirmedRegistration(campaign.eventSlug, memberId)
      : undefined;
  const policy = evaluateQrAccess({
    campaign,
    expectedPurpose: "checkin",
    registration: registration
      ? { attendanceStatus: registration.attendance_status }
      : undefined,
  });
  if (policy !== "accepted") return { status: policy };
  if (!registration) return { status: "not_registered" };
  const alreadyCompleted = registration.attendance_status === "attended";
  const client = createAdminClient();

  if (!alreadyCompleted) {
    const { error } = await client
      .from("registrations")
      .update({
        attendance_status: "attended",
        attendance_source: "checkin_qr",
        attendance_marked_at: new Date().toISOString(),
      })
      .eq("id", registration.id);
    throwSupabaseError(error);
  }

  const { error: accessError } = await client.from("event_qr_accesses").upsert(
    {
      campaign_id: campaign.id,
      registration_id: registration.id,
      scanned_at: new Date().toISOString(),
      access_expires_at: campaign.closesAt,
      result: "accepted",
    },
    { onConflict: "campaign_id,registration_id" },
  );
  throwSupabaseError(accessError);

  return { status: "accepted", campaign, registrationId: registration.id, alreadyCompleted };
}

export async function acceptReviewAccess(
  accessCode: string,
  memberId: string,
): Promise<QrAccessResult> {
  const campaign = await getCampaignByCode(accessCode);
  if (!campaign) return { status: "not_found" };
  const registration =
    campaign.purpose === "review"
      ? await getConfirmedRegistration(campaign.eventSlug, memberId)
      : undefined;
  const existingAccess = registration
    ? await getReviewAccess(campaign.id, registration.id)
    : null;
  const existingAccessIsValid =
    existingAccess?.result === "accepted" &&
    Boolean(
      existingAccess.access_expires_at &&
        new Date(existingAccess.access_expires_at).getTime() > Date.now(),
    );
  const policy = evaluateQrAccess({
    campaign,
    expectedPurpose: "review",
    registration: registration
      ? { attendanceStatus: registration.attendance_status }
      : undefined,
    existingAccessExpiresAt: existingAccess?.access_expires_at,
  });
  if (policy !== "accepted") return { status: policy };
  if (!registration) return { status: "not_registered" };

  if (!existingAccessIsValid) {
    const campaignClose = campaign.closesAt ? new Date(campaign.closesAt).getTime() : Date.now();
    const expiresAt = new Date(
      Math.max(campaignClose, Date.now() + REVIEW_ACCESS_GRACE_MINUTES * 60_000),
    ).toISOString();
    const { error } = await createAdminClient().from("event_qr_accesses").upsert(
      {
        campaign_id: campaign.id,
        registration_id: registration.id,
        scanned_at: new Date().toISOString(),
        access_expires_at: expiresAt,
        result: "accepted",
      },
      { onConflict: "campaign_id,registration_id" },
    );
    throwSupabaseError(error);
  }

  const review = await getReviewByRegistration(registration.id);
  return {
    status: "accepted",
    campaign,
    registrationId: registration.id,
    alreadyCompleted: Boolean(review),
  };
}

async function getReviewAccess(campaignId: string, registrationId: string) {
  const { data, error } = await createAdminClient()
    .from("event_qr_accesses")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("registration_id", registrationId)
    .maybeSingle();
  throwSupabaseError(error);
  return data as ReviewAccessRow | null;
}

export async function getMemberReviewSession(accessCode: string, memberId: string) {
  const campaign = await getCampaignByCode(accessCode);
  if (!campaign || campaign.purpose !== "review" || !campaign.reviewConfigSnapshot) return undefined;
  const registration = await getConfirmedRegistration(campaign.eventSlug, memberId);
  if (!registration || registration.attendance_status !== "attended") return undefined;
  const access = await getReviewAccess(campaign.id, registration.id);
  if (
    !access ||
    access.result !== "accepted" ||
    !access.access_expires_at ||
    new Date(access.access_expires_at).getTime() <= Date.now()
  ) {
    return undefined;
  }
  return {
    campaign,
    registrationId: registration.id,
    existingReview: await getReviewByRegistration(registration.id),
  };
}

export async function submitEventReview(input: {
  accessCode: string;
  memberId: string;
  answers: EventReviewAnswers;
  consentToPublish: boolean;
  submissionLanguage: "en" | "zh";
}) {
  const session = await getMemberReviewSession(input.accessCode, input.memberId);
  if (!session) return { success: false as const, reason: "access" as const };
  if (session.existingReview) return { success: true as const, review: session.existingReview };

  const config = session.campaign.reviewConfigSnapshot;
  if (!config) return { success: false as const, reason: "access" as const };
  const validation = validateReviewAnswers(config, input.answers);
  if (!validation.success) {
    return { success: false as const, reason: "validation" as const, errors: validation.errors };
  }
  const overallRating = validation.answers.overall_rating;
  if (typeof overallRating !== "number") {
    return { success: false as const, reason: "validation" as const, errors: { overall_rating: "Required." } };
  }

  const { data, error } = await createAdminClient()
    .from("event_reviews")
    .insert({
      registration_id: session.registrationId,
      campaign_id: session.campaign.id,
      overall_rating: overallRating,
      answers: validation.answers,
      consent_to_publish: input.consentToPublish,
      submission_language: input.submissionLanguage,
    })
    .select("*")
    .single();
  throwSupabaseError(error);
  return {
    success: true as const,
    review: mapReview(data as ReviewRow, {
      eventSlug: session.campaign.eventSlug,
      memberId: input.memberId,
    }),
  };
}

async function getReviewByRegistration(registrationId: string) {
  const { data, error } = await createAdminClient()
    .from("event_reviews")
    .select("*")
    .eq("registration_id", registrationId)
    .maybeSingle();
  throwSupabaseError(error);
  return data as ReviewRow | null;
}

export async function listAdminEventReviews(eventSlug?: string) {
  const client = createAdminClient();
  let campaignQuery = client.from("event_qr_campaigns").select("id,event_slug").eq("purpose", "review");
  if (eventSlug) campaignQuery = campaignQuery.eq("event_slug", eventSlug);
  const { data: campaignRows, error: campaignError } = await campaignQuery;
  throwSupabaseError(campaignError);
  const campaignEvent = new Map(
    ((campaignRows ?? []) as Array<{ id: string; event_slug: string }>).map((row) => [
      row.id,
      row.event_slug,
    ]),
  );
  if (campaignEvent.size === 0) return [];

  const { data: reviewRows, error: reviewError } = await client
    .from("event_reviews")
    .select("*")
    .in("campaign_id", Array.from(campaignEvent.keys()))
    .order("created_at", { ascending: false });
  throwSupabaseError(reviewError);
  const registrations = await loadRegistrationSummaries(
    (reviewRows ?? []).map((row) => String(row.registration_id)),
  );

  return ((reviewRows ?? []) as ReviewRow[]).flatMap((row) => {
    const registration = registrations.get(row.registration_id);
    const campaignEventSlug = campaignEvent.get(row.campaign_id);
    if (!registration || !campaignEventSlug) return [];
    return [{
      ...mapReview(row, { eventSlug: campaignEventSlug, memberId: registration.memberId }),
      contactName: registration.contactName,
    }];
  });
}

async function loadRegistrationSummaries(ids: string[]) {
  if (ids.length === 0) return new Map<string, { memberId: string; contactName: string }>();
  const { data, error } = await createAdminClient()
    .from("registrations")
    .select("id,member_id,contact_name")
    .in("id", ids);
  throwSupabaseError(error);
  return new Map(
    ((data ?? []) as Array<{ id: string; member_id: string | null; contact_name: string }>).map(
      (row) => [row.id, { memberId: row.member_id ?? "", contactName: row.contact_name }],
    ),
  );
}

export async function moderateEventReview(
  id: string,
  status: EventReviewModerationStatus,
  note: string,
) {
  const { error } = await createAdminClient()
    .from("event_reviews")
    .update({
      moderation_status: status,
      moderation_note: note,
      moderated_at: new Date().toISOString(),
    })
    .eq("id", id);
  throwSupabaseError(error);
}

export async function getPublicReviewsForEvent(eventSlug: string): Promise<PublicEventReview[]> {
  const reviews = await listAdminEventReviews(eventSlug);
  const campaigns = await getEventCampaigns(eventSlug);
  const config = campaigns.find((campaign) => campaign.purpose === "review")?.reviewConfigSnapshot;
  if (!config) return [];

  return reviews
    .filter((review) => review.moderationStatus === "approved" && review.consentToPublish)
    .map((review) => ({
      id: review.id,
      overallRating: review.overallRating,
      answers: publicReviewAnswers(config, review.answers),
      authorLabel: maskMemberName(review.contactName),
      createdAt: review.createdAt,
    }));
}
