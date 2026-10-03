import { AbstractAuthModuleProvider } from "@medusajs/framework/utils";
import type { AuthenticationInput, AuthenticationResponse, AuthIdentityProviderService } from "@medusajs/framework/types";
import { createClient } from "@supabase/supabase-js";
import { authenticateSupabaseIdentity } from "./identity";
import { verifyCommerceMembership } from "./membership";
import memberPolicy from "../../lib/member-policy.json";

type Options = { url: string; publishableKey: string };
export default class SupabaseAuthProvider extends AbstractAuthModuleProvider {
  static identifier = "supabase";
  static DISPLAY_NAME = "SnowForce account";
  private client;
  private options;

  constructor(container: Record<string, unknown>, options: Options) {
    super();
    this.options = options;
    this.client = createClient(options.url, options.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }

  static validateOptions(options: Record<string, unknown>) {
    if (options.url !== "https://bhmwxkynhyhquspiyact.supabase.co" || typeof options.publishableKey !== "string" || !options.publishableKey) throw new Error("Configure the existing SnowForce Supabase Auth project.");
  }

  async authenticate(data: AuthenticationInput, identities: AuthIdentityProviderService): Promise<AuthenticationResponse> {
    return authenticateSupabaseIdentity(data.body?.access_token, {
      identities,
      verify: async (token) => {
        const scopedClient = createClient(this.options.url, this.options.publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
        return verifyCommerceMembership(token, {
          user: async (accessToken) => { const { data, error } = await this.client.auth.getUser(accessToken); return error ? null : data.user; },
          profile: async (id) => { const { data, error } = await scopedClient.from("member_profiles").select("id").eq("user_id", id).maybeSingle<{ id: string }>(); return error ? null : data; },
          consent: async (id) => { const { data, error } = await scopedClient.from("member_consents").select("accepted,accepted_at").eq("user_id", id).eq("consent_type", memberPolicy.consent_type).eq("policy_version", memberPolicy.policy_version).maybeSingle<{ accepted: boolean; accepted_at: string | null }>(); return error ? null : data; },
        });
      },
    });
  }
  async register(data: AuthenticationInput, identities: AuthIdentityProviderService) { return this.authenticate(data, identities); }
  async validateCallback(): Promise<AuthenticationResponse> { return { success: false, error: "Sign in through SnowForce." }; }
}
