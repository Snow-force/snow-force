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
  if (searchParams.magicSent) {
    return {
      tone: "success",
      text: "如果这个邮箱可以登录，我们已经发送 SnowForce 安全登录链接。请检查收件箱。",
    };
  }
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
  if (searchParams.profileSaved) {
    return { tone: "success", text: "会员资料已保存。" };
  }
  if (searchParams.payment === "success") {
    return { tone: "success", text: "Payment received - your trip is confirmed. Find it under My Trips." };
  }
  if (searchParams.registration === "confirmed") {
    return { tone: "success", text: "Registration confirmed. It now appears in your trips and the staff list." };
  }
  if (searchParams.registration === "duplicate") {
    return { tone: "error", text: "You are already registered for that event." };
  }
  if (searchParams.registration === "member-only") {
    return { tone: "error", text: "Event registration is now confirmed from your member home. Please sign in and confirm there." };
  }
  if (searchParams.registration === "unavailable") {
    return { tone: "error", text: "This event is no longer available for registration." };
  }
  if (searchParams.registration === "invalid") {
    return { tone: "error", text: "That pending registration could not be confirmed. Please submit again if needed." };
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
  if (searchParams.error === "magic") {
    return { tone: "error", text: "登录链接发送失败，请确认邮箱格式后再试。" };
  }
  if (searchParams.error === "oauth") {
    return { tone: "error", text: "Google 登录暂时无法启动，请稍后再试或使用邮箱登录。" };
  }
  if (searchParams.error === "callback") {
    return { tone: "error", text: "登录链接已失效，请重新登录。" };
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
