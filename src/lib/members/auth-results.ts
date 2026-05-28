export type MemberAuthStatusCode =
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

export type MemberAuthStatusMessage = {
  tone: "error" | "success" | "info";
  title: string;
  body: string;
};

const allowedNextPrefixes = ["/member", "/events", "/recaps"];

export function sanitizeMemberNextPath(value: string | null | undefined) {
  if (!value) return "/member";
  if (!value.startsWith("/")) return "/member";
  if (value.startsWith("//")) return "/member";
  if (value.includes("\\")) return "/member";
  if (/[\u0000-\u001F\u007F]/.test(value)) return "/member";
  if (!allowedNextPrefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))) {
    return "/member";
  }
  return value;
}

export function memberAuthCallbackUrl(siteUrl: string, nextPath: string) {
  const base = siteUrl.replace(/\/$/, "");
  const next = sanitizeMemberNextPath(nextPath);
  return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
}

export function authStatusMessage(code: MemberAuthStatusCode): MemberAuthStatusMessage {
  if (code === "magicSent") {
    return {
      tone: "success",
      title: "Check your inbox",
      body: "If this email can sign in, a secure SnowForce link has been sent.",
    };
  }
  if (code === "registered") {
    return {
      tone: "success",
      title: "Verify your email",
      body: "We sent a confirmation link. Verify your email before registering for member-linked trips.",
    };
  }
  if (code === "verificationSent") {
    return {
      tone: "success",
      title: "Verification email sent",
      body: "If this email belongs to a SnowForce account, a new verification link has been sent.",
    };
  }
  if (code === "passwordReset") {
    return {
      tone: "success",
      title: "Password updated",
      body: "Use your new password the next time you sign in.",
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
      title: "Could not create account",
      body: "Check your details and try again.",
    };
  }
  return {
    tone: "error",
    title: "Could not sign in",
    body: "Check your email and password, then try again.",
  };
}
