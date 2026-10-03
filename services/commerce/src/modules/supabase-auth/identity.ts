import type { AuthenticationResponse, AuthIdentityProviderService } from "@medusajs/framework/types";

type VerifiedUser = { id: string; email?: string; email_confirmed_at?: string; is_anonymous?: boolean };
export type IdentityDependencies = {
  verify: (accessToken: string) => Promise<VerifiedUser | null>;
  identities: AuthIdentityProviderService;
};

// Supabase verifies the token; user IDs and emails supplied by the caller are ignored.
export async function authenticateSupabaseIdentity(accessToken: unknown, deps: IdentityDependencies): Promise<AuthenticationResponse> {
  const failed = { success: false, error: "A verified SnowForce session is required." };
  if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 8192) return failed;
  try {
    const user = await deps.verify(accessToken);
    if (!user || user.is_anonymous || !user.email_confirmed_at || !user.email || !/^[0-9a-f-]{36}$/i.test(user.id)) return failed;
    try {
      const authIdentity = await deps.identities.retrieve({ entity_id: user.id });
      return { success: true, authIdentity };
    } catch (error) {
      if (!(error && typeof error === "object" && "type" in error && error.type === "not_found")) return failed;
    }
    try {
      const authIdentity = await deps.identities.create({ entity_id: user.id, user_metadata: { email: user.email } });
      return { success: true, authIdentity };
    } catch {
      // The unique provider/entity constraint arbitrates simultaneous first logins.
      const authIdentity = await deps.identities.retrieve({ entity_id: user.id });
      return { success: true, authIdentity };
    }
  } catch { return failed; }
}
