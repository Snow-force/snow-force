// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
vi.mock("@/lib/supabase/middleware", () => ({ updateSession: vi.fn() }));
import { config as root } from "../proxy";
import { config as source } from "./proxy";

describe.each([root, source])("public media proxy exclusions", (config) => {
  it("bypasses session refresh even for member-cookie requests", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/api/media/image?src=public-photo&w=640&v=v1", cookies: { "sb-project-auth-token": "member-session" } })).toBe(false);
  });
  it("retains session refresh on member pages and other API routes", () => {
    for (const url of ["/member", "/member/orders", "/api/media/image-extra", "/api/other"]) expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });
});
