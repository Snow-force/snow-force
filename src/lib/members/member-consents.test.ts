import { describe, expect, it, vi } from "vitest";
import {
  CURRENT_EVENT_MEDIA_POLICY_VERSION,
  CURRENT_PRIVACY_POLICY_VERSION,
  ensureMemberProfileAfterConsent,
  memberConsentPath,
  recordCurrentMemberConsents,
  resolveMemberAuthDestination,
} from "./member-consents";

function queryResult(data: unknown, error: unknown = null) {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    select: vi.fn(),
  };
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

const user = {
  app_metadata: {},
  aud: "authenticated",
  created_at: "2026-08-04T00:00:00.000Z",
  email: "rider@example.com",
  email_confirmed_at: "2026-08-04T00:00:00.000Z",
  id: "auth-user-1",
  user_metadata: { full_name: "Rider One" },
};

describe("member consent policy", () => {
  it("builds an allow-listed consent continuation path", () => {
    expect(memberConsentPath("/events/mammoth-weekend")).toBe(
      "/member/consent?next=%2Fevents%2Fmammoth-weekend",
    );
    expect(memberConsentPath("https://evil.example")).toBe(
      "/member/consent?next=%2Fmember",
    );
    expect(memberConsentPath("/member/consent")).toBe(
      "/member/consent?next=%2Fmember",
    );
  });

  it("routes an identity without current privacy acceptance to consent without creating a profile", async () => {
    const privacy = queryResult(null);
    const client = { from: vi.fn(() => privacy) };

    await expect(resolveMemberAuthDestination(user, "/member", client as never)).resolves.toBe(
      "/member/consent?next=%2Fmember",
    );
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith("member_consents");
  });

  it("creates a formal profile only after current privacy acceptance", async () => {
    const privacyForGuard = queryResult({ accepted: true, accepted_at: "2026-08-04T01:00:00.000Z" });
    const privacyForEnsure = queryResult({ accepted: true, accepted_at: "2026-08-04T01:00:00.000Z" });
    const missingProfile = queryResult(null);
    const requiredMedia = queryResult({ accepted: true, accepted_at: "2026-08-04T01:00:00.000Z" });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const insertProfile = { insert };
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(privacyForGuard)
        .mockReturnValueOnce(privacyForEnsure)
        .mockReturnValueOnce(missingProfile)
        .mockReturnValueOnce(requiredMedia)
        .mockReturnValueOnce(insertProfile),
    };

    await expect(resolveMemberAuthDestination(user, "/member", client as never)).resolves.toBe("/member");
    expect(insert).toHaveBeenCalledWith({
      display_name: "Rider One",
      email: "rider@example.com",
      photo_social_media_consent: true,
      user_id: "auth-user-1",
    });
  });

  it("refuses direct profile creation when required privacy is missing", async () => {
    const privacy = queryResult(null);
    const client = { from: vi.fn(() => privacy) };

    await expect(ensureMemberProfileAfterConsent(user, client as never)).resolves.toBe(false);
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("stores privacy and its required event-media permission as separate versioned rows", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) };

    await expect(recordCurrentMemberConsents({
      acceptedAt: "2026-08-04T01:00:00.000Z",
      client: client as never,
      locale: "zh",
      mediaAccepted: true,
      source: "consent_page",
      userId: "auth-user-1",
    })).resolves.toBe(true);

    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        accepted: true,
        consent_type: "privacy_policy",
        policy_version: CURRENT_PRIVACY_POLICY_VERSION,
      }),
      expect.objectContaining({
        accepted: true,
        accepted_at: "2026-08-04T01:00:00.000Z",
        consent_type: "event_media_social",
        policy_version: CURRENT_EVENT_MEDIA_POLICY_VERSION,
      }),
    ], { onConflict: "user_id,consent_type,policy_version" });
  });
});
