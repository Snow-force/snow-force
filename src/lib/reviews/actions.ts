"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { getEventAdmin } from "@/lib/events/repository";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import type {
  EventQrCampaignPurpose,
  EventReviewAnswers,
  EventReviewModerationStatus,
} from "@/lib/types";

import {
  acceptCheckinAccess,
  acceptReviewAccess,
  closeEventCampaign,
  getMemberReviewSession,
  moderateEventReview,
  openEventCampaign,
  submitEventReview,
} from "./repository";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function validPurpose(value: string): value is EventQrCampaignPurpose {
  return value === "checkin" || value === "review";
}

function adminPath(eventSlug: string) {
  return `/admin/reviews/${encodeURIComponent(eventSlug)}`;
}

export async function openEventCampaignAction(formData: FormData) {
  await requireAdmin();
  const eventSlug = text(formData, "eventSlug");
  const purpose = text(formData, "purpose");
  const event = await getEventAdmin(eventSlug);
  if (!event || !validPurpose(purpose)) redirect("/admin/reviews?error=invalid");

  const fallback = purpose === "checkin" ? 120 : 90;
  const requestedDuration = Number(text(formData, "durationMinutes"));
  const durationMinutes =
    Number.isInteger(requestedDuration) && requestedDuration >= 15 && requestedDuration <= 720
      ? requestedDuration
      : fallback;

  await openEventCampaign({
    eventSlug,
    purpose,
    durationMinutes,
    reviewConfig: event.reviewConfig,
  });
  revalidatePath(adminPath(eventSlug));
  redirect(`${adminPath(eventSlug)}?opened=${purpose}`);
}

export async function closeEventCampaignAction(formData: FormData) {
  await requireAdmin();
  const eventSlug = text(formData, "eventSlug");
  const purpose = text(formData, "purpose");
  if (!eventSlug || !validPurpose(purpose)) redirect("/admin/reviews?error=invalid");
  await closeEventCampaign(eventSlug, purpose);
  revalidatePath(adminPath(eventSlug));
  redirect(`${adminPath(eventSlug)}?closed=${purpose}`);
}

function memberLoginRedirect(next: string): never {
  redirect(`/member?next=${encodeURIComponent(next)}`);
}

export async function acceptCheckinAction(formData: FormData) {
  const accessCode = text(formData, "accessCode");
  const next = `/check-in/${encodeURIComponent(accessCode)}`;
  const account = await getCurrentMemberAccount();
  if (!account?.profile) memberLoginRedirect(next);
  if (!account.emailConfirmed) redirect(`${next}?result=verify_email`);

  const result = await acceptCheckinAccess(accessCode, account.profile.id);
  const status =
    result.status === "accepted"
      ? result.alreadyCompleted
        ? "already"
        : "success"
      : result.status;
  revalidatePath("/member");
  redirect(`${next}?result=${encodeURIComponent(status)}`);
}

export async function acceptReviewAction(formData: FormData) {
  const accessCode = text(formData, "accessCode");
  const next = `/reviews/access/${encodeURIComponent(accessCode)}`;
  const account = await getCurrentMemberAccount();
  if (!account?.profile) memberLoginRedirect(next);
  if (!account.emailConfirmed) redirect(`${next}?result=verify_email`);

  const result = await acceptReviewAccess(accessCode, account.profile.id);
  if (result.status === "accepted") {
    redirect(`/reviews/${encodeURIComponent(accessCode)}`);
  }
  redirect(`${next}?result=${encodeURIComponent(result.status)}`);
}

export type ReviewFormState = {
  success: false;
  message?: string;
  errors?: Record<string, string>;
};

export async function submitEventReviewAction(
  _state: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const accessCode = text(formData, "accessCode");
  const account = await getCurrentMemberAccount();
  if (!account?.profile) memberLoginRedirect(`/reviews/${encodeURIComponent(accessCode)}`);

  const session = await getMemberReviewSession(accessCode, account.profile.id);
  const config = session?.campaign.reviewConfigSnapshot;
  if (!session || !config) {
    return { success: false, message: "This review link is no longer available." };
  }

  const answers: EventReviewAnswers = {};
  config.questions.forEach((question) => {
    const key = `answer:${question.key}`;
    if (question.type === "multiple_choice") {
      answers[question.key] = formData.getAll(key).map(String);
      return;
    }
    const value = text(formData, key);
    if (!value) {
      answers[question.key] = null;
    } else if (question.type === "rating_5") {
      answers[question.key] = Number(value);
    } else if (question.type === "yes_no") {
      answers[question.key] = value === "true";
    } else {
      answers[question.key] = value;
    }
  });

  const language = text(formData, "language") === "zh" ? "zh" : "en";
  const result = await submitEventReview({
    accessCode,
    memberId: account.profile.id,
    answers,
    consentToPublish: formData.get("consentToPublish") === "on",
    submissionLanguage: language,
  });

  if (!result.success) {
    return result.reason === "validation"
      ? { success: false, message: "Please review the highlighted questions.", errors: result.errors }
      : { success: false, message: "This review link is no longer available." };
  }

  revalidatePath("/admin/reviews");
  redirect(`/reviews/${encodeURIComponent(accessCode)}?submitted=1`);
}

export async function moderateEventReviewAction(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "reviewId");
  const eventSlug = text(formData, "eventSlug");
  const status = text(formData, "status");
  if (
    !id ||
    !eventSlug ||
    !["pending", "approved", "rejected"].includes(status)
  ) {
    redirect("/admin/reviews?error=invalid");
  }
  await moderateEventReview(
    id,
    status as EventReviewModerationStatus,
    text(formData, "moderationNote"),
  );
  revalidatePath(adminPath(eventSlug));
  revalidatePath("/recaps");
  redirect(`${adminPath(eventSlug)}?moderated=1`);
}
