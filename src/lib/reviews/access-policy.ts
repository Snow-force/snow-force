import type {
  EventQrCampaign,
  EventQrCampaignPurpose,
  Registration,
} from "@/lib/types";

export type QrAccessPolicyStatus =
  | "accepted"
  | "not_found"
  | "not_open"
  | "not_registered"
  | "not_attended"
  | "wrong_purpose";

export function campaignIsOpen(campaign: EventQrCampaign, now = new Date()) {
  return (
    campaign.status === "open" &&
    Boolean(campaign.closesAt && new Date(campaign.closesAt).getTime() > now.getTime())
  );
}

export function evaluateQrAccess(input: {
  campaign: EventQrCampaign | undefined;
  expectedPurpose: EventQrCampaignPurpose;
  registration:
    | Pick<Registration, "attendanceStatus">
    | undefined;
  existingAccessExpiresAt?: string | null;
  now?: Date;
}): QrAccessPolicyStatus {
  if (!input.campaign) return "not_found";
  if (input.campaign.purpose !== input.expectedPurpose) return "wrong_purpose";
  if (!input.registration) return "not_registered";

  const now = input.now ?? new Date();
  const existingAccessIsValid = Boolean(
    input.existingAccessExpiresAt &&
      new Date(input.existingAccessExpiresAt).getTime() > now.getTime(),
  );
  if (!campaignIsOpen(input.campaign, now) && !existingAccessIsValid) return "not_open";
  if (
    input.expectedPurpose === "review" &&
    input.registration.attendanceStatus !== "attended"
  ) {
    return "not_attended";
  }
  return "accepted";
}
