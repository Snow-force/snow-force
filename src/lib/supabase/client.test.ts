import { beforeEach, describe, expect, it, vi } from "vitest";

const createBrowserClient = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", () => ({ createBrowserClient }));

import { createClient } from "./client";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  vi.stubEnv("SUPABASE_SECRET_KEY", "server-only-secret");
});

describe("browser Supabase client", () => {
  it("uses the public URL and publishable key only", () => {
    createClient();

    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "publishable-key",
    );
    expect(createBrowserClient.mock.calls[0]).not.toContain("server-only-secret");
  });
});
