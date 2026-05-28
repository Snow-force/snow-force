# Member Account Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade SnowForce member accounts with password recovery, reset/change password, email verification guidance, structured profile sections, improved registration history, and mobile-responsive account UI.

**Architecture:** Keep Supabase Auth mutations in server actions under `src/lib/members/actions.ts`, with pure form parsers in `src/lib/members/member-entry.ts` for testable validation. Split the large member page into focused server-rendered components under `src/components/members/`, then add dedicated forgot/reset password routes.

**Tech Stack:** Next.js 14 App Router, React Server Components, TypeScript, Tailwind CSS, Supabase SSR/Auth, Vitest.

---

## File Structure

- Modify `src/lib/members/member-entry.ts`: add pure parsers for email-only forms and password update forms.
- Create `src/lib/members/member-entry.test.ts`: Vitest coverage for all member auth/profile parser behavior.
- Modify `src/lib/members/actions.ts`: add account context helper and server actions for forgot password, resend verification, reset password, and change password.
- Create `src/components/members/member-status-message.tsx`: shared query/status message renderer.
- Create `src/components/members/member-auth-panel.tsx`: unauthenticated sign-in/register/resend UI.
- Create `src/components/members/forgot-password-form.tsx`: password recovery request form.
- Create `src/components/members/reset-password-form.tsx`: password reset form and expired-link state.
- Create `src/components/members/profile-form.tsx`: structured profile editor.
- Create `src/components/members/security-form.tsx`: signed-in password change form.
- Create `src/components/members/registration-history.tsx`: mobile-friendly registration history cards.
- Create `src/components/members/member-dashboard.tsx`: signed-in dashboard composition.
- Modify `src/app/member/page.tsx`: delegate rendering to member components and load account context.
- Create `src/app/member/forgot-password/page.tsx`: recovery request route.
- Create `src/app/member/reset-password/page.tsx`: recovery-link password reset route.

Do not add database migrations for this increment. Use existing profile and registration fields.

## Task 1: Member Form Parsers

**Files:**
- Modify: `src/lib/members/member-entry.ts`
- Create: `src/lib/members/member-entry.test.ts`

- [ ] **Step 1: Replace `member-entry.ts` with parser helpers**

```ts
export type MemberEntryMode = "register" | "login";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export function parseMemberEntry(mode: MemberEntryMode, formData: FormData) {
  const email = readString(formData, "email").trim().toLowerCase();
  const displayName = readString(formData, "displayName").trim();
  const password = readString(formData, "password");

  if (!emailPattern.test(email)) {
    return { success: false as const, error: "email" as const };
  }

  if (!password) {
    return { success: false as const, error: "password" as const };
  }

  if (mode === "register" && !displayName) {
    return { success: false as const, error: "register_fields" as const };
  }

  return { success: true as const, email, displayName, password };
}

export function parseMemberEmail(formData: FormData) {
  const email = readString(formData, "email").trim().toLowerCase();

  if (!emailPattern.test(email)) {
    return { success: false as const, error: "email" as const };
  }

  return { success: true as const, email };
}

export function parseMemberPasswordUpdate(formData: FormData) {
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");

  if (password.length < 6) {
    return { success: false as const, error: "password" as const };
  }

  if (password !== confirmPassword) {
    return { success: false as const, error: "confirm" as const };
  }

  return { success: true as const, password };
}
```

- [ ] **Step 2: Add parser tests**

Create `src/lib/members/member-entry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  parseMemberEmail,
  parseMemberEntry,
  parseMemberPasswordUpdate,
} from "./member-entry";

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseMemberEntry", () => {
  it("normalizes valid login email", () => {
    const result = parseMemberEntry(
      "login",
      form({ email: " Rider@Example.COM ", password: "secret123" }),
    );

    expect(result).toEqual({
      success: true,
      email: "rider@example.com",
      displayName: "",
      password: "secret123",
    });
  });

  it("requires display name for registration", () => {
    const result = parseMemberEntry(
      "register",
      form({ email: "rider@example.com", password: "secret123" }),
    );

    expect(result).toEqual({ success: false, error: "register_fields" });
  });
});

describe("parseMemberEmail", () => {
  it("returns normalized email", () => {
    expect(parseMemberEmail(form({ email: " Snow@Example.com " }))).toEqual({
      success: true,
      email: "snow@example.com",
    });
  });

  it("rejects invalid email", () => {
    expect(parseMemberEmail(form({ email: "snow" }))).toEqual({
      success: false,
      error: "email",
    });
  });
});

describe("parseMemberPasswordUpdate", () => {
  it("accepts matching valid passwords", () => {
    expect(
      parseMemberPasswordUpdate(
        form({ password: "secret123", confirmPassword: "secret123" }),
      ),
    ).toEqual({ success: true, password: "secret123" });
  });

  it("rejects short passwords", () => {
    expect(
      parseMemberPasswordUpdate(form({ password: "short", confirmPassword: "short" })),
    ).toEqual({ success: false, error: "password" });
  });

  it("rejects mismatched passwords", () => {
    expect(
      parseMemberPasswordUpdate(
        form({ password: "secret123", confirmPassword: "secret456" }),
      ),
    ).toEqual({ success: false, error: "confirm" });
  });
});
```

- [ ] **Step 3: Run parser tests and verify they pass**

Run: `npm test -- src/lib/members/member-entry.test.ts`

Expected: Vitest reports all tests in `member-entry.test.ts` pass.

## Task 2: Member Server Actions

**Files:**
- Modify: `src/lib/members/actions.ts`
- Test: `src/lib/members/member-entry.test.ts`

- [ ] **Step 1: Verify Supabase Auth method names before editing**

Run: `npm ls @supabase/supabase-js @supabase/ssr`

Expected: package versions print successfully. Confirm `@supabase/supabase-js` is v2.x.

Check the installed type declarations for these method names before coding:

- `auth.resetPasswordForEmail(email, { redirectTo })`
- `auth.updateUser({ password })`
- `auth.resend({ type: "signup", email, options: { emailRedirectTo } })`

Use file search or TypeScript autocomplete. If the installed package exposes different names, use the installed v2 type definitions and keep the same behavior.

- [ ] **Step 2: Replace `actions.ts` imports and helpers**

Update the top of `src/lib/members/actions.ts` to include the new parsers and URL helper:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMemberProfile, updateMemberProfile } from "./repository";
import {
  parseMemberEmail,
  parseMemberEntry,
  parseMemberPasswordUpdate,
} from "./member-entry";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function memberRedirect(path: string) {
  return `${siteUrl()}${path}`;
}
```

- [ ] **Step 3: Add account-context helper**

Add this helper after the URL helpers:

```ts
export async function getCurrentMemberAccount() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return {
    user,
    profile: (await getMemberProfile(user.id)) ?? null,
    emailConfirmed: Boolean(user.email_confirmed_at),
  };
}

export async function getCurrentMemberProfile() {
  const account = await getCurrentMemberAccount();
  return account?.profile ?? null;
}
```

Remove the old `getCurrentMemberProfile()` implementation so there is only one exported function with that name.

- [ ] **Step 4: Keep existing register/login/save/logout behavior and add new actions**

Ensure existing actions still compile, then append these new server actions before `logoutMember()` or after it:

```ts
export async function requestMemberPasswordReset(formData: FormData) {
  const entry = parseMemberEmail(formData);
  if (!entry.success) {
    redirect("/member/forgot-password?error=email");
  }

  const supabase = createClient();
  await supabase.auth.resetPasswordForEmail(entry.email, {
    redirectTo: memberRedirect("/member/reset-password"),
  });

  redirect("/member/forgot-password?sent=1");
}

export async function resendMemberVerification(formData: FormData) {
  const entry = parseMemberEmail(formData);
  if (!entry.success) {
    redirect("/member?error=verification-email");
  }

  const supabase = createClient();
  await supabase.auth.resend({
    type: "signup",
    email: entry.email,
    options: {
      emailRedirectTo: memberRedirect("/member"),
    },
  });

  redirect("/member?verificationSent=1");
}

export async function resetMemberPassword(formData: FormData) {
  const entry = parseMemberPasswordUpdate(formData);
  if (!entry.success) {
    redirect(`/member/reset-password?error=${entry.error}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: entry.password });
  if (error) {
    redirect("/member/reset-password?error=session");
  }

  revalidatePath("/member");
  redirect("/member?passwordReset=1");
}

export async function changeMemberPassword(formData: FormData) {
  const account = await getCurrentMemberAccount();
  if (!account) {
    redirect("/member?error=login");
  }

  const entry = parseMemberPasswordUpdate(formData);
  if (!entry.success) {
    redirect(`/member?securityError=${entry.error}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: entry.password });
  if (error) {
    redirect("/member?securityError=session");
  }

  revalidatePath("/member");
  redirect("/member?passwordChanged=1");
}
```

- [ ] **Step 5: Update `registerMemberProfile()` redirect URL helper**

Inside `registerMemberProfile`, replace the existing inline redirect URL:

```ts
emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/member`,
```

with:

```ts
emailRedirectTo: memberRedirect("/member"),
```

- [ ] **Step 6: Run parser tests again**

Run: `npm test -- src/lib/members/member-entry.test.ts`

Expected: all parser tests still pass.

## Task 3: Shared Member Status Messages

**Files:**
- Create: `src/components/members/member-status-message.tsx`

- [ ] **Step 1: Create shared message component**

```tsx
type MemberStatusMessageProps = {
  searchParams: Record<string, string | undefined>;
  scope?: "member" | "forgot" | "reset";
};

type MessageTone = "success" | "error";

type Message = {
  tone: MessageTone;
  text: string;
};

function classNameForTone(tone: MessageTone) {
  return tone === "success"
    ? "border-green-200 bg-green-50 text-green-800"
    : "border-red-200 bg-red-50 text-red-700";
}

function memberMessage(searchParams: Record<string, string | undefined>): Message | null {
  if (searchParams.registered) {
    return {
      tone: "success",
      text: "注册已提交。请先打开验证邮件完成邮箱确认，然后回到这里登录。",
    };
  }
  if (searchParams.verificationSent) {
    return {
      tone: "success",
      text: "如果这个邮箱已注册，我们已经重新发送验证邮件。请检查收件箱和垃圾邮件。",
    };
  }
  if (searchParams.passwordReset) {
    return { tone: "success", text: "密码已更新，请使用新密码登录。" };
  }
  if (searchParams.passwordChanged) {
    return { tone: "success", text: "密码已更新。下次登录请使用新密码。" };
  }
  if (searchParams.error === "register") {
    return { tone: "error", text: "请填写姓名、有效邮箱和密码后注册。" };
  }
  if (searchParams.error === "login") {
    return {
      tone: "error",
      text: "登录失败。请确认邮箱和密码正确；如果刚注册，请先完成邮箱验证。",
    };
  }
  if (searchParams.error === "verification-email") {
    return { tone: "error", text: "请输入有效邮箱后重新发送验证邮件。" };
  }
  if (searchParams.securityError === "password") {
    return { tone: "error", text: "新密码至少需要 6 个字符。" };
  }
  if (searchParams.securityError === "confirm") {
    return { tone: "error", text: "两次输入的新密码不一致。" };
  }
  if (searchParams.securityError === "session") {
    return { tone: "error", text: "密码更新失败，请重新登录后再试。" };
  }
  return null;
}

function forgotMessage(searchParams: Record<string, string | undefined>): Message | null {
  if (searchParams.sent) {
    return {
      tone: "success",
      text: "如果这个邮箱已注册，我们已经发送密码重置链接。请检查收件箱和垃圾邮件。",
    };
  }
  if (searchParams.error === "email") {
    return { tone: "error", text: "请输入有效邮箱。" };
  }
  return null;
}

function resetMessage(searchParams: Record<string, string | undefined>): Message | null {
  if (searchParams.error === "password") {
    return { tone: "error", text: "新密码至少需要 6 个字符。" };
  }
  if (searchParams.error === "confirm") {
    return { tone: "error", text: "两次输入的新密码不一致。" };
  }
  if (searchParams.error === "session") {
    return { tone: "error", text: "重置链接已失效或会话无效，请重新发送密码重置邮件。" };
  }
  return null;
}

export function MemberStatusMessage({
  searchParams,
  scope = "member",
}: MemberStatusMessageProps) {
  const message =
    scope === "forgot"
      ? forgotMessage(searchParams)
      : scope === "reset"
        ? resetMessage(searchParams)
        : memberMessage(searchParams);

  if (!message) return null;

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${classNameForTone(message.tone)}`}>
      {message.text}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript build for early component errors**

Run: `npm run build`

Expected: build may fail later because routes have not been updated yet if imports are unused or missing. If it fails only because the new component is not referenced, continue. If it fails due to syntax/type errors in this file, fix them before continuing.

## Task 4: Unauthenticated Member Auth Panel

**Files:**
- Create: `src/components/members/member-auth-panel.tsx`
- Modify: `src/app/member/page.tsx` later in Task 9

- [ ] **Step 1: Create auth panel component**

```tsx
import Link from "next/link";
import {
  loginMemberProfile,
  registerMemberProfile,
  resendMemberVerification,
} from "@/lib/members/actions";
import { MemberStatusMessage } from "./member-status-message";

type MemberAuthPanelProps = {
  searchParams: Record<string, string | undefined>;
};

export function MemberAuthPanel({ searchParams }: MemberAuthPanelProps) {
  return (
    <div className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-snow-600">
            SnowForce Account
          </p>
          <h1 className="section-title mt-3">SnowForce 会员</h1>
          <p className="mt-3 text-base leading-7 text-gray-500 sm:text-[17px]">
            保存报名资料、查看活动记录，并更快完成下一次雪场活动报名。
          </p>
        </div>

        <div className="mx-auto mt-6 max-w-2xl">
          <MemberStatusMessage searchParams={searchParams} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
          <form action={loginMemberProfile} className="card order-1 space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">会员登录</h2>
              <p className="mt-1 text-sm text-gray-500">Use the email you registered with.</p>
            </div>
            <div>
              <label className="label" htmlFor="login-member-email">注册邮箱</label>
              <input id="login-member-email" name="email" type="email" className="input-field" required />
            </div>
            <div>
              <label className="label" htmlFor="login-member-password">密码</label>
              <input id="login-member-password" name="password" type="password" className="input-field" required />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button className="btn-primary w-full sm:w-auto">登录</button>
              <Link href="/member/forgot-password" className="text-sm font-medium text-snow-600 hover:text-snow-700">
                Forgot password?
              </Link>
            </div>
          </form>

          <form action={registerMemberProfile} className="card order-2 space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">注册会员</h2>
              <p className="mt-1 text-sm text-gray-500">
                Create a member profile. You may need to verify your email before signing in.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="register-member-name">姓名</label>
              <input id="register-member-name" name="displayName" className="input-field" required />
            </div>
            <div>
              <label className="label" htmlFor="register-member-email">邮箱</label>
              <input id="register-member-email" name="email" type="email" className="input-field" required />
            </div>
            <div>
              <label className="label" htmlFor="register-member-password">密码</label>
              <input id="register-member-password" name="password" type="password" className="input-field" minLength={6} required />
            </div>
            <button className="btn-secondary w-full">注册 SnowForce 会员</button>
          </form>
        </div>

        <form action={resendMemberVerification} className="card mx-auto mt-6 max-w-2xl space-y-4 bg-[#f5f5f7]">
          <div>
            <h2 className="text-base font-semibold text-gray-900">没有收到验证邮件？</h2>
            <p className="mt-1 text-sm text-gray-500">
              输入注册邮箱，我们会尝试重新发送验证邮件。出于安全原因，提示不会透露账号是否存在。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="sr-only" htmlFor="resend-verification-email">注册邮箱</label>
            <input id="resend-verification-email" name="email" type="email" className="input-field" placeholder="you@example.com" required />
            <button className="btn-secondary w-full sm:w-auto">重新发送</button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Keep component server-compatible**

Confirm the file does not include `"use client"`, React hooks, browser-only APIs, or privileged Supabase imports. The forms call server actions directly.

## Task 5: Forgot and Reset Password Routes

**Files:**
- Create: `src/components/members/forgot-password-form.tsx`
- Create: `src/components/members/reset-password-form.tsx`
- Create: `src/app/member/forgot-password/page.tsx`
- Create: `src/app/member/reset-password/page.tsx`

- [ ] **Step 1: Create forgot password form**

```tsx
import Link from "next/link";
import { requestMemberPasswordReset } from "@/lib/members/actions";
import { MemberStatusMessage } from "./member-status-message";

type ForgotPasswordFormProps = {
  searchParams: Record<string, string | undefined>;
};

export function ForgotPasswordForm({ searchParams }: ForgotPasswordFormProps) {
  return (
    <div className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
        <Link href="/member" className="text-sm font-medium text-snow-600 hover:text-snow-700">
          ← Back to member login
        </Link>
        <form action={requestMemberPasswordReset} className="card mt-6 space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-snow-600">
              Account recovery
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-gray-900">忘记密码</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              输入注册邮箱。如果账号存在，我们会发送密码重置链接。
            </p>
          </div>
          <MemberStatusMessage searchParams={searchParams} scope="forgot" />
          <div>
            <label className="label" htmlFor="forgot-password-email">注册邮箱</label>
            <input id="forgot-password-email" name="email" type="email" className="input-field" required />
          </div>
          <button className="btn-primary w-full">发送重置链接</button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create reset password form**

```tsx
import Link from "next/link";
import { resetMemberPassword } from "@/lib/members/actions";
import { MemberStatusMessage } from "./member-status-message";

type ResetPasswordFormProps = {
  hasSession: boolean;
  searchParams: Record<string, string | undefined>;
};

export function ResetPasswordForm({ hasSession, searchParams }: ResetPasswordFormProps) {
  return (
    <div className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
        <Link href="/member" className="text-sm font-medium text-snow-600 hover:text-snow-700">
          ← Back to member login
        </Link>
        <section className="card mt-6 space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-snow-600">
              Password reset
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-gray-900">设置新密码</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              新密码至少 6 个字符。完成后请使用新密码登录。
            </p>
          </div>
          <MemberStatusMessage searchParams={searchParams} scope="reset" />
          {hasSession ? (
            <form action={resetMemberPassword} className="space-y-5">
              <div>
                <label className="label" htmlFor="reset-password">新密码</label>
                <input id="reset-password" name="password" type="password" className="input-field" minLength={6} required />
              </div>
              <div>
                <label className="label" htmlFor="reset-confirm-password">确认新密码</label>
                <input id="reset-confirm-password" name="confirmPassword" type="password" className="input-field" minLength={6} required />
              </div>
              <button className="btn-primary w-full">更新密码</button>
            </form>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              重置链接已失效或尚未建立恢复会话。请重新发送密码重置邮件。
              <div className="mt-3">
                <Link href="/member/forgot-password" className="font-semibold text-snow-700 hover:text-snow-600">
                  重新发送重置邮件
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create forgot password page**

```tsx
import { ForgotPasswordForm } from "@/components/members/forgot-password-form";

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  return <ForgotPasswordForm searchParams={searchParams} />;
}
```

- [ ] **Step 4: Create reset password page**

```tsx
import { ResetPasswordForm } from "@/components/members/reset-password-form";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <ResetPasswordForm hasSession={Boolean(user)} searchParams={searchParams} />;
}
```

- [ ] **Step 5: Run build to catch route/component import errors**

Run: `npm run build`

Expected: no syntax or type errors from the new routes. If unrelated pre-existing build failures appear, record the exact output and continue only after confirming they are unrelated.

## Task 6: Signed-In Dashboard Components

**Files:**
- Create: `src/components/members/profile-form.tsx`
- Create: `src/components/members/security-form.tsx`
- Create: `src/components/members/registration-history.tsx`
- Create: `src/components/members/member-dashboard.tsx`

- [ ] **Step 1: Create structured profile form**

```tsx
import type { MemberProfile } from "@/lib/types";
import { saveMemberProfile } from "@/lib/members/actions";

type ProfileFormProps = {
  profile: MemberProfile;
};

export function ProfileForm({ profile }: ProfileFormProps) {
  return (
    <form action={saveMemberProfile} className="card space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Profile</h2>
        <p className="mt-1 text-sm text-gray-500">保存常用报名资料，减少下次活动填写时间。</p>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">Personal</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="profile-name">Display name</label>
            <input id="profile-name" name="displayName" defaultValue={profile.displayName} className="input-field" required />
          </div>
          <div>
            <label className="label" htmlFor="profile-phone">Phone</label>
            <input id="profile-phone" name="phone" defaultValue={profile.phone} className="input-field" />
          </div>
        </div>
        <div>
          <label className="label">Email</label>
          <input value={profile.email} className="input-field bg-gray-50 text-gray-500" disabled />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">Rider profile</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="profile-level-zh">Rider level ZH</label>
            <input id="profile-level-zh" name="riderLevelZh" defaultValue={profile.riderLevel.zh} className="input-field" />
          </div>
          <div>
            <label className="label" htmlFor="profile-level-en">Rider level EN</label>
            <input id="profile-level-en" name="riderLevelEn" defaultValue={profile.riderLevel.en} className="input-field" />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">Emergency contact</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="profile-emergency-contact">Contact name</label>
            <input id="profile-emergency-contact" name="emergencyContact" defaultValue={profile.emergencyContact} className="input-field" />
          </div>
          <div>
            <label className="label" htmlFor="profile-emergency-phone">Emergency phone</label>
            <input id="profile-emergency-phone" name="emergencyPhone" defaultValue={profile.emergencyPhone} className="input-field" />
          </div>
        </div>
      </section>

      <button className="btn-primary w-full sm:w-auto">Save profile</button>
    </form>
  );
}
```

- [ ] **Step 2: Create security form**

```tsx
import { changeMemberPassword } from "@/lib/members/actions";

export function SecurityForm() {
  return (
    <form action={changeMemberPassword} className="card space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Security</h2>
        <p className="mt-1 text-sm leading-6 text-gray-500">
          Change your member login password. This does not change past event registration details.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="change-password">New password</label>
          <input id="change-password" name="password" type="password" className="input-field" minLength={6} required />
        </div>
        <div>
          <label className="label" htmlFor="change-confirm-password">Confirm password</label>
          <input id="change-confirm-password" name="confirmPassword" type="password" className="input-field" minLength={6} required />
        </div>
      </div>
      <button className="btn-secondary w-full sm:w-auto">Change password</button>
    </form>
  );
}
```

- [ ] **Step 3: Create registration history component**

```tsx
import Link from "next/link";
import type { Registration } from "@/lib/types";

type RegistrationHistoryProps = {
  registrations: Registration[];
};

function statusLabel(status: Registration["status"]) {
  if (status === "confirmed") return "Confirmed";
  if (status === "waitlist") return "Waitlist";
  return "Cancelled";
}

function statusClassName(status: Registration["status"]) {
  if (status === "confirmed") return "bg-green-50 text-green-700 border-green-200";
  if (status === "waitlist") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function answerSummary(registration: Registration) {
  const values = Object.values(registration.answers)
    .flatMap((value) => (Array.isArray(value) ? value : [String(value)]))
    .filter(Boolean)
    .slice(0, 3);

  return values.length > 0 ? values.join(" · ") : "Registration details saved";
}

export function RegistrationHistory({ registrations }: RegistrationHistoryProps) {
  return (
    <section className="card space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Registration history</h2>
        <p className="mt-1 text-sm text-gray-500">查看已关联到会员账号的活动报名记录。</p>
      </div>

      {registrations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-[#f5f5f7] p-5 text-sm text-gray-600">
          No member-linked registrations yet. Future signups made while logged in will appear here.
          <div className="mt-3">
            <Link href="/events" className="font-semibold text-snow-600 hover:text-snow-700">
              Browse events
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {registrations.map((registration) => (
            <li key={registration.id} className="rounded-2xl border border-gray-100 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <Link href={`/events/${registration.eventSlug}`} className="font-semibold text-gray-900 hover:text-snow-700">
                    {registration.eventSlug}
                  </Link>
                  <p className="mt-1 text-sm text-gray-500">
                    Registered {formatDate(registration.createdAt)}
                  </p>
                </div>
                <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusClassName(registration.status)}`}>
                  {statusLabel(registration.status)}
                </span>
              </div>
              <p className="mt-3 text-sm text-gray-500">{answerSummary(registration)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Create member dashboard component**

```tsx
import type { User } from "@supabase/supabase-js";
import type { MemberProfile, Registration } from "@/lib/types";
import { logoutMember } from "@/lib/members/actions";
import { MemberStatusMessage } from "./member-status-message";
import { ProfileForm } from "./profile-form";
import { RegistrationHistory } from "./registration-history";
import { SecurityForm } from "./security-form";

type MemberDashboardProps = {
  emailConfirmed: boolean;
  profile: MemberProfile;
  registrations: Registration[];
  searchParams: Record<string, string | undefined>;
  user: User;
};

export function MemberDashboard({
  emailConfirmed,
  profile,
  registrations,
  searchParams,
  user,
}: MemberDashboardProps) {
  return (
    <div className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <section className="rounded-[24px] border border-[#e0e0e0] bg-[#f5f5f7] p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-snow-600">
                Member Area
              </p>
              <h1 className="section-title mt-2">{profile.displayName || user.email}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <span>{profile.email}</span>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${emailConfirmed ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                  {emailConfirmed ? "Email verified" : "Email verification pending"}
                </span>
              </div>
            </div>
            <form action={logoutMember}>
              <button className="btn-secondary w-full sm:w-auto">Sign out</button>
            </form>
          </div>
        </section>

        <div className="mt-6">
          <MemberStatusMessage searchParams={searchParams} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="space-y-6">
            <ProfileForm profile={profile} />
            <SecurityForm />
          </div>
          <RegistrationHistory registrations={registrations} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run build to catch component type errors**

Run: `npm run build`

Expected: if `@supabase/supabase-js` does not export `User` in the installed version, replace the import with the correct installed type. Otherwise, no component type errors.

## Task 7: Wire `/member` Page

**Files:**
- Modify: `src/app/member/page.tsx`

- [ ] **Step 1: Replace page implementation with component composition**

```tsx
import { MemberAuthPanel } from "@/components/members/member-auth-panel";
import { MemberDashboard } from "@/components/members/member-dashboard";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { getRegistrationsByMember } from "@/lib/registrations/repository";

export default async function MemberPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const account = await getCurrentMemberAccount();

  if (!account?.profile) {
    return <MemberAuthPanel searchParams={searchParams} />;
  }

  const registrations = await getRegistrationsByMember(account.profile.id);

  return (
    <MemberDashboard
      emailConfirmed={account.emailConfirmed}
      profile={account.profile}
      registrations={registrations}
      searchParams={searchParams}
      user={account.user}
    />
  );
}
```

- [ ] **Step 2: Confirm old inline forms are removed**

Search `src/app/member/page.tsx` for these strings:

- `注册会员`
- `Registration history`
- `Saved profile`

Expected: the page may contain no UI strings except imports and component usage. UI strings should now live in member components.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: build succeeds or reports only pre-existing failures unrelated to member files.

## Task 8: UI Details and Responsive Polish

**Files:**
- Review/modify if needed: all files under `src/components/members/`
- Review/modify if needed: `src/app/member/forgot-password/page.tsx`
- Review/modify if needed: `src/app/member/reset-password/page.tsx`

- [ ] **Step 1: Check mobile layout classes**

Verify these exact responsive behaviors are present in member components:

- Auth cards use `grid gap-6 lg:grid-cols-2`.
- Sign-in form appears before registration in source order.
- Dashboard main layout uses a single column until `lg`.
- Profile field groups use `grid gap-4 sm:grid-cols-2`.
- Buttons that need full mobile width use `w-full sm:w-auto` or `w-full`.
- History items use stacked card markup, not a table.

- [ ] **Step 2: Check design-system constraints**

Verify member components do not use:

- gradient text
- side-stripe accents
- glassmorphism
- random decorative blue backgrounds
- nested cards deeper than one level for the main layout

Expected: blue appears only in links, buttons, status/action labels, and focusable controls.

- [ ] **Step 3: Run build after polish edits**

Run: `npm run build`

Expected: build succeeds or reports only documented unrelated failures.

## Task 9: End-to-End Verification

**Files:**
- No planned source edits unless verification finds bugs.

- [ ] **Step 1: Run targeted tests**

Run: `npm test -- src/lib/members/member-entry.test.ts`

Expected: all parser tests pass.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: all tests pass. If failures exist before member changes, capture exact failing test names and output.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: build exits with code 0. If it fails due to missing local Supabase environment or unrelated existing issues, capture exact output and determine whether the failure is caused by this implementation.

- [ ] **Step 4: Browser verification**

Use the project browser-testing workflow. Start the dev server with:

```bash
npm run dev
```

Then verify in a real browser:

1. Open `/member` at desktop width.
2. Confirm login card, register card, resend verification form, and forgot-password link render correctly.
3. Open `/member` at mobile width.
4. Confirm login appears before registration and buttons have usable tap targets.
5. Open `/member/forgot-password`.
6. Submit an invalid email and confirm readable error behavior.
7. Submit a syntactically valid email and confirm generic success behavior.
8. Open `/member/reset-password` without a recovery session and confirm expired-link state.

If a test member session is available locally:

9. Sign in.
10. Confirm account header, profile, security, and registration history sections render.
11. Save profile changes.
12. Try mismatched password confirmation and confirm readable error.
13. Confirm mobile dashboard stacks header, profile, security, and history.

Stop the dev server after verification.

## Self-Review Checklist

Spec coverage:

- Forgot password: Task 2 and Task 5.
- Reset password: Task 2 and Task 5.
- Change password: Task 2 and Task 6.
- Email verification guidance/resend: Task 2 and Task 4.
- Structured profile: Task 6.
- Better registration history: Task 6.
- Mobile responsive behavior: Task 4, Task 6, Task 8, Task 9.
- No privileged Supabase key in client components: Task 2 and Task 8.
- Verification: Task 9.

Placeholder scan:

- This plan intentionally includes exact file paths, commands, and code blocks.
- It does not require schema changes or unstated future work.
- It does not instruct workers to commit, because commits require explicit user permission in this repository session.

Type consistency:

- `parseMemberPasswordUpdate()` returns `{ success: true, password }`, consumed by `resetMemberPassword()` and `changeMemberPassword()`.
- `getCurrentMemberAccount()` returns `{ user, profile, emailConfirmed }`, consumed by `/member` and `MemberDashboard`.
- `RegistrationHistory` consumes the existing `Registration` type from `src/lib/types.ts`.
