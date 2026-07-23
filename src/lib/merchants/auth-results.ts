/**
 * Merchant authentication callback helpers.
 *
 * These helpers are intentionally separate from `src/lib/members/auth-results.ts`
 * because the merchant account flow is a distinct boundary. A merchant can
 * exist in `auth.users` without ever owning a `member_profiles` row, and the
 * safe `next` allow-list intentionally only includes `/merchant/*` (plus the
 * root). Member, admin, and other surface paths are explicitly rejected so a
 * compromised or malformed callback cannot redirect a merchant to a different
 * surface.
 */

const allowedMerchantNextPrefixes = ["/merchant"];

const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

export type MerchantAuthStatusCode =
  | "callback"
  | "login"
  | "magic"
  | "magicSent"
  | "oauth"
  | "passwordReset"
  | "register"
  | "registered"
  | "resetSession"
  | "verificationSent";

export type MerchantAuthStatusMessage = {
  tone: "error" | "success" | "info";
  title: string;
  body: string;
};

export function sanitizeMerchantNextPath(value: string | null | undefined): string {
  if (!value) return "/merchant";
  if (!value.startsWith("/")) return "/merchant";
  // Reject protocol-relative URLs ("//evil.example/...") which resolve against
  // the current origin and would still be an open redirect vector.
  if (value.startsWith("//")) return "/merchant";
  // Backslashes can be normalized by browsers into forward slashes, which would
  // re-enable host injection. Reject anything containing a backslash.
  if (value.includes("\\")) return "/merchant";
  // Reject embedded control characters (newline, tab, etc.) that some browsers
  // strip or interpret unexpectedly.
  if (controlCharacterPattern.test(value)) return "/merchant";
  if (
    !allowedMerchantNextPrefixes.some(
      (prefix) => value === prefix || value.startsWith(`${prefix}/`),
    )
  ) {
    return "/merchant";
  }
  return value;
}

export function merchantAuthCallbackUrl(siteUrl: string, nextPath: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const next = sanitizeMerchantNextPath(nextPath);
  return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
}

export function merchantAuthStatusMessage(code: MerchantAuthStatusCode): MerchantAuthStatusMessage {
  if (code === "magicSent") {
    return {
      tone: "success",
      title: "Check your inbox",
      body: "If this email can sign in, a secure SnowForce vendor link has been sent.",
    };
  }
  if (code === "registered") {
    return {
      tone: "success",
      title: "Verify your email",
      body: "We sent a confirmation link. Verify your email before submitting a booth application.",
    };
  }
  if (code === "verificationSent") {
    return {
      tone: "success",
      title: "Verification email sent",
      body: "If this email belongs to a SnowForce vendor account, a new verification link has been sent.",
    };
  }
  if (code === "passwordReset") {
    return {
      tone: "success",
      title: "Password updated",
      body: "Use your new password the next time you sign in to the vendor portal.",
    };
  }
  if (code === "callback") {
    return {
      tone: "error",
      title: "Sign-in link expired",
      body: "Request a new link and try again.",
    };
  }
  if (code === "resetSession") {
    return {
      tone: "error",
      title: "Reset link expired",
      body: "Request a new password reset email before setting a new password.",
    };
  }
  if (code === "magic") {
    return {
      tone: "error",
      title: "Could not send link",
      body: "Check your email address and try again.",
    };
  }
  if (code === "oauth") {
    return {
      tone: "error",
      title: "Could not start Google sign-in",
      body: "Try again or use email sign-in.",
    };
  }
  if (code === "register") {
    return {
      tone: "error",
      title: "Could not create vendor account",
      body: "Check your details and try again.",
    };
  }
  return {
    tone: "error",
    title: "Could not sign in",
    body: "Check your email and password, then try again.",
  };
}
