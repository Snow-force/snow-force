import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/components/members/reset-password-form", () => ({ ResetPasswordForm: () => null }));

import ResetPasswordPage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("password recovery request context", () => {
  it("resolves asynchronous query parameters and recovery cookies before rendering", async () => {
    mocks.cookies.mockResolvedValue({
      getAll: () => [{ name: "sb-project-auth-token", value: "recovery-session" }],
    });

    const page = await ResetPasswordPage({ searchParams: Promise.resolve({ error: "password" }) });

    expect(page.props).toMatchObject({ hasSession: true, searchParams: { error: "password" } });
  });

  it("does not infer a recovery session from unrelated request cookies", async () => {
    mocks.cookies.mockResolvedValue({ getAll: () => [{ name: "lang", value: "zh" }] });

    const page = await ResetPasswordPage({ searchParams: Promise.resolve({}) });

    expect(page.props.hasSession).toBe(false);
  });
});
