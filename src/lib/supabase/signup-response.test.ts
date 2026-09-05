// @vitest-environment node

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "rider@example.com",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { display_name: "Rider" },
  created_at: "2026-09-05T00:00:00Z",
  identities: [{ id: "email-identity", provider: "email" }],
};

function clientReturning(body: object) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
  return createClient("https://auth.example.com", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
}

describe("installed Supabase SDK signup response contract", () => {
  it("retains the top-level user while email confirmation is pending", async () => {
    const client = clientReturning(user);
    const { data, error } = await client.auth.signUp({ email: user.email, password: "TestPassword123" });

    expect(error).toBeNull();
    expect(data.user?.id).toBe(user.id);
    expect(data.user?.identities).toEqual(user.identities);
    expect(data.session).toBeNull();
  });

  it("retains empty identities so repeated signup reaches the existing-account branch", async () => {
    const client = clientReturning({ ...user, role: "", identities: [] });
    const { data, error } = await client.auth.signUp({ email: user.email, password: "TestPassword123" });

    expect(error).toBeNull();
    expect(data.user?.identities).toEqual([]);
    expect(data.session).toBeNull();
  });

  it("preserves the nested user and session for password login", async () => {
    const client = clientReturning({
      user, access_token: "test-access-token", refresh_token: "test-refresh-token",
      token_type: "bearer", expires_in: 3600,
    });
    const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: "TestPassword123" });

    expect(error).toBeNull();
    expect(data.user?.id).toBe(user.id);
    expect(data.session?.access_token).toBe("test-access-token");
  });

  it("does not interpret a message-only email-change confirmation as a user", async () => {
    const client = clientReturning({ msg: "Confirmation accepted", code: "email_change_confirmation_sent" });
    const { data, error } = await client.auth.verifyOtp({ email: user.email, token: "123456", type: "email_change" });

    expect(error).toBeNull();
    expect(data.user).toBeNull();
    expect(data.session).toBeNull();
  });
});
