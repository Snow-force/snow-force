import type { MemberProfile, RegistrationAnswers } from "@/lib/types";

export type MemberRegistrationAccount = {
  profile: MemberProfile;
  emailConfirmed: boolean;
};

export type MemberRegistrationDecision =
  | { allowed: true; memberId: string | null }
  | { allowed: false; error: string };

export function canSubmitMemberRegistration(
  account: MemberRegistrationAccount | null,
): MemberRegistrationDecision {
  if (!account) return { allowed: true, memberId: null };
  if (!account.emailConfirmed) {
    return {
      allowed: false,
      error: "Verify your email before using member registration.",
    };
  }
  return { allowed: true, memberId: account.profile.id };
}

export function autofillRegistrationAnswers(
  current: RegistrationAnswers,
  profile: MemberProfile | null | undefined,
): RegistrationAnswers {
  if (!profile) return current;
  const needsRental = profile.equipment.needsRentalHelp || (!profile.equipment.ownsSkis && !profile.equipment.ownsSnowboard);
  return {
    ...current,
    name: current.name ?? profile.displayName,
    email: current.email ?? profile.email,
    phone: current.phone ?? profile.phone,
    riderLevel: current.riderLevel ?? profile.structuredRiderLevel,
    level: current.level ?? profile.structuredRiderLevel,
    riderType: current.riderType ?? profile.riderType,
    homeMountain: current.homeMountain ?? profile.homeMountain,
    passes: current.passes ?? profile.passes,
    pass: current.pass ?? profile.passes,
    needCarpool: current.needCarpool ?? profile.carpoolInterest,
    needLodging: current.needLodging ?? profile.lodgingInterest,
    needsRental: current.needsRental ?? needsRental,
    emergencyContact: current.emergencyContact ?? profile.emergencyContact,
    emergencyPhone: current.emergencyPhone ?? profile.emergencyPhone,
  };
}
