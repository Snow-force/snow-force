import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn(() => {
      const values = new Map<string, { name: string; value: string; options?: object }>();
      return {
        status: 200,
        cookies: {
          set: (name: string, value: string, options?: object) => values.set(name, { name, value, options }),
          get: (name: string) => values.get(name),
        },
      };
    }),
  },
}));

import { updateSession } from "./middleware";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockResolvedValue({ data: { user: null } });
});

describe("Supabase session middleware", () => {
  it("does not instantiate Supabase for an anonymous request", async () => {
    const response = await updateSession({ cookies: { getAll: () => [], set: vi.fn() } } as never);

    expect(response.status).toBe(200);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("refreshes an authenticated request with the publishable key", async () => {
    const request = {
      cookies: { getAll: () => [{ name: "sb-project-auth-token", value: "session" }], set: vi.fn() },
    } as never;

    await updateSession(request);

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "publishable-key",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
    expect(mocks.getUser).toHaveBeenCalledOnce();
  });

  it("returns a response that carries refreshed auth cookies", async () => {
    mocks.getUser.mockImplementation(async () => {
      const options = mocks.createServerClient.mock.calls[0][2];
      options.cookies.setAll([{ name: "sb-project-auth-token", value: "refreshed", options: { httpOnly: true } }]);
      return { data: { user: { id: "member-1" } } };
    });
    const request = {
      cookies: { getAll: () => [{ name: "sb-project-auth-token", value: "stale" }], set: vi.fn() },
    } as never;

    const response = await updateSession(request);

    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("refreshed");
  });
});
