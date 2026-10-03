type User = { id: string; email?: string; email_confirmed_at?: string; is_anonymous?: boolean };
export async function verifyCommerceMembership(token: string, source: {
  user: (token: string) => Promise<User | null>;
  profile: (userId: string) => Promise<{ id: string } | null>;
  consent: (userId: string) => Promise<{ accepted: boolean; accepted_at: string | null } | null>;
}) {
  const user = await source.user(token);
  if (!user || user.is_anonymous || !user.email_confirmed_at || !user.email) return null;
  const [profile, consent] = await Promise.all([source.profile(user.id), source.consent(user.id)]);
  return profile && consent?.accepted === true && consent.accepted_at ? user : null;
}
