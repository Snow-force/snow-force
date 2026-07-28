"use client";

import { useLanguage } from "@/lib/language";

type MemberStatusMessageProps = {
  searchParams: Record<string, string | undefined>;
  scope?: "member" | "forgot" | "reset";
};

type MessageTone = "success" | "error";

type BilingualText = { en: string; zh: string };

type Message = {
  tone: MessageTone;
  text: BilingualText;
};

const TONE_CLASS: Record<MessageTone, string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-700",
};

function memberMessage(searchParams: Record<string, string | undefined>): Message | null {
  if (searchParams.magicSent) {
    return {
      tone: "success",
      text: {
        en: "If this email can sign in, a SnowForce secure sign-in link has been sent. Check your inbox.",
        zh: "如果这个邮箱可以登录，我们已经发送 SnowForce 安全登录链接。请检查收件箱。",
      },
    };
  }
  if (searchParams.registered) {
    return {
      tone: "success",
      text: {
        en: "Registration submitted. Open the verification email to confirm your address, then come back here to sign in.",
        zh: "注册已提交。请先打开验证邮件完成邮箱确认，然后回到这里登录。",
      },
    };
  }
  if (searchParams.verificationSent) {
    return {
      tone: "success",
      text: {
        en: "If this email is registered, we sent a fresh verification link. Check your inbox (and spam folder).",
        zh: "如果这个邮箱已注册，我们已经重新发送验证邮件。请检查收件箱和垃圾邮件。",
      },
    };
  }
  if (searchParams.passwordReset) {
    return {
      tone: "success",
      text: { en: "Password updated. Sign in with your new password.", zh: "密码已更新，请使用新密码登录。" },
    };
  }
  if (searchParams.passwordChanged) {
    return {
      tone: "success",
      text: { en: "Password updated. Use your new password the next time you sign in.", zh: "密码已更新。下次登录请使用新密码。" },
    };
  }
  if (searchParams.profileSaved) {
    return { tone: "success", text: { en: "Member profile saved.", zh: "会员资料已保存。" } };
  }
  if (searchParams.payment === "success") {
    return { tone: "success", text: { en: "Payment received - your trip is confirmed. Find it under My Trips.", zh: "付款已收到，行程已确认。请在“我的行程”中查看。" } };
  }
  if (searchParams.registration === "confirmed") {
    return { tone: "success", text: { en: "Registration confirmed. It now appears in your trips and the staff list.", zh: "报名已确认，现已显示在你的行程和工作人员列表中。" } };
  }
  if (searchParams.registration === "duplicate") {
    return { tone: "error", text: { en: "You are already registered for that event.", zh: "你已报名该活动。" } };
  }
  if (searchParams.registration === "member-only") {
    return { tone: "error", text: { en: "Event registration is now confirmed from your member home. Please sign in and confirm there.", zh: "请在会员中心完成该活动报名。请先登录后再确认。" } };
  }
  if (searchParams.registration === "unavailable") {
    return { tone: "error", text: { en: "This event is no longer available for registration.", zh: "该活动目前已无法报名。" } };
  }
  if (searchParams.registration === "invalid") {
    return { tone: "error", text: { en: "That pending registration could not be confirmed. Please submit again if needed.", zh: "该待确认报名无法完成确认。如有需要，请重新提交报名。" } };
  }
  if (searchParams.error === "register") {
    return {
      tone: "error",
      text: {
        en: "Please fill in a display name, a valid email, and a password (at least 6 characters), then try again.",
        zh: "请填写姓名、有效邮箱和密码后注册（密码至少 6 位）。",
      },
    };
  }
  if (searchParams.error === "register_password") {
    return {
      tone: "error",
      text: {
        en: "Password must be at least 6 characters.",
        zh: "密码至少需要 6 个字符。",
      },
    };
  }
  if (searchParams.error === "register_confirm") {
    return {
      tone: "error",
      text: {
        en: "The two passwords do not match.",
        zh: "两次输入的密码不一致。",
      },
    };
  }
  if (searchParams.error === "register_rate") {
    return {
      tone: "error",
      text: {
        en: "Too many sign-up attempts in a short time. Wait a few minutes and try again.",
        zh: "短时间内注册尝试过多，请稍候几分钟再试。",
      },
    };
  }
  if (searchParams.error === "register_taken") {
    return {
      tone: "error",
      text: {
        en: "An account already exists for this email. Sign in, or use Forgot password to reset your password.",
        zh: "该邮箱已注册。请直接登录或使用其他邮箱。",
      },
    };
  }
  if (searchParams.error === "register_failed") {
    return {
      tone: "error",
      text: { en: "Could not create the account. Please try again shortly.", zh: "暂时无法创建账户，请稍后再试。" },
    };
  }
  if (searchParams.error === "login") {
    return {
      tone: "error",
      text: {
        en: "Could not sign in. Check your email and password; if you just registered, verify your email first.",
        zh: "登录失败。请确认邮箱和密码正确；如果刚注册，请先完成邮箱验证。",
      },
    };
  }
  if (searchParams.error === "magic") {
    return {
      tone: "error",
      text: { en: "Could not send the sign-in link. Check the email format and try again.", zh: "登录链接发送失败，请确认邮箱格式后再试。" },
    };
  }
  if (searchParams.error === "oauth") {
    return { tone: "error", text: { en: "Google sign-in could not start. Try again or use email sign-in.", zh: "Google 登录暂时无法启动，请稍后再试或使用邮箱登录。" } };
  }
  if (searchParams.error === "callback") {
    return {
      tone: "error",
      text: {
        en: "This verification link is invalid or has already been used. Return to the sign-in page and try again.",
        zh: "此验证链接已失效或已被使用。如果你正在验证新账户，请使用下方表单重新发送验证邮件。否则，请登录或请求新的登录链接。",
      },
    };
  }
  if (searchParams.error === "verification-rate") {
    return {
      tone: "error",
      text: {
        en: "Too many verification emails in a short time. Wait a few minutes and try again.",
        zh: "短时间内验证邮件发送过多，请稍候几分钟再试。",
      },
    };
  }
  if (searchParams.error === "verification-send") {
    return {
      tone: "error",
      text: {
        en: "Could not send the verification email. Please try again shortly.",
        zh: "暂时无法发送验证邮件，请稍后重试。",
      },
    };
  }
  if (searchParams.error === "verification-email") {
    return { tone: "error", text: { en: "Enter a valid email before resending the verification link.", zh: "请输入有效邮箱后重新发送验证邮件。" } };
  }
  if (searchParams.securityError === "password") {
    return { tone: "error", text: { en: "The new password must be at least 6 characters.", zh: "新密码至少需要 6 个字符。" } };
  }
  if (searchParams.securityError === "confirm") {
    return { tone: "error", text: { en: "The two new passwords do not match.", zh: "两次输入的新密码不一致。" } };
  }
  if (searchParams.securityError === "session") {
    return { tone: "error", text: { en: "Could not update the password. Please sign in and try again.", zh: "密码更新失败，请重新登录后再试。" } };
  }
  return null;
}

function forgotMessage(searchParams: Record<string, string | undefined>): Message | null {
  if (searchParams.sent) {
    return {
      tone: "success",
      text: {
        en: "If this email is registered, a password reset link has been sent. Check your inbox and spam folder.",
        zh: "如果这个邮箱已注册，我们已经发送密码重置链接。请检查收件箱和垃圾邮件。",
      },
    };
  }
  if (searchParams.error === "email") {
    return { tone: "error", text: { en: "Please enter a valid email.", zh: "请输入有效邮箱。" } };
  }
  return null;
}

function resetMessage(searchParams: Record<string, string | undefined>): Message | null {
  if (searchParams.error === "password") {
    return { tone: "error", text: { en: "The new password must be at least 6 characters.", zh: "新密码至少需要 6 个字符。" } };
  }
  if (searchParams.error === "confirm") {
    return { tone: "error", text: { en: "The two new passwords do not match.", zh: "两次输入的新密码不一致。" } };
  }
  if (searchParams.error === "session") {
    return { tone: "error", text: { en: "The reset link has expired or the recovery session is invalid. Send a new password reset email.", zh: "重置链接已失效或会话无效，请重新发送密码重置邮件。" } };
  }
  return null;
}

export function MemberStatusMessage({
  searchParams,
  scope = "member",
}: MemberStatusMessageProps) {
  const { t } = useLanguage();
  const message =
    scope === "forgot"
      ? forgotMessage(searchParams)
      : scope === "reset"
        ? resetMessage(searchParams)
        : memberMessage(searchParams);

  if (!message) return null;

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${TONE_CLASS[message.tone]}`} role={message.tone === "error" ? "alert" : "status"}>
      {t(message.text)}
    </div>
  );
}
