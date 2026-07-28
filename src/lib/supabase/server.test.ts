import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieStore: { getAll: vi.fn(), set: vi.fn() },
  createServerClient: vi.fn(),
  createSupabaseClient: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(() => mocks.cookieStore) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createSupabaseClient }));

import { createAdminClient, createClient, hasPublicSupabaseConfig } from "./server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieStore.getAll.mockReturnValue([{ name: "sb-auth", value: "session" }]);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});

describe("server Supabase clients", () => {
  it("uses only the publishable key and forwards request cookies to the SSR client", () => {
    createClient();

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "publishable-key",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
    const options = mocks.createServerClient.mock.calls[0][2];
    expect(options.cookies.getAll()).toEqual([{ name: "sb-auth", value: "session" }]);
  });

  it("writes refreshed cookies when the runtime permits it", () => {
    createClient();
    const options = mocks.createServerClient.mock.calls[0][2];

    options.cookies.setAll([{ name: "sb-auth", value: "refreshed", options: { httpOnly: true } }]);

    expect(mocks.cookieStore.set).toHaveBeenCalledWith("sb-auth", "refreshed", { httpOnly: true });
  });

  it("uses the server-only secret for the admin client with persistent auth disabled", () => {
    createAdminClient();

    expect(mocks.createSupabaseClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "secret-key",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  });

  it("recognizes the legacy anon key only as a public-key fallback", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-anon-key");

    expect(hasPublicSupabaseConfig()).toBe(true);
    createClient();
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "legacy-anon-key",
      expect.any(Object),
    );
  });
});
