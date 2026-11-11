export type StaffLoginError = "credentials" | "quota" | "unavailable" | "rate-limit" | "unconfirmed" | "unauthorized";

/** Keep provider details and credentials out of the URL and rendered message. */
export function classifyStaffLoginError(error: unknown): StaffLoginError {
  if (!error) return "credentials";
  if (typeof error !== "object") return "unavailable";
  const details = error as { status?: unknown; code?: unknown };
  if (details.status === 402) return "quota";
  if (details.status === 429) return "rate-limit";
  if (typeof details.status === "number" && details.status >= 500) return "unavailable";
  if (details.code === "invalid_credentials") return "credentials";
  if (details.code === "email_not_confirmed") return "unconfirmed";
  return "unavailable";
}

const messages: Record<StaffLoginError, { en: string; zh: string }> = {
  credentials: { en: "Email or password is incorrect. Please check and try again.", zh: "邮箱或密码不正确，请核对后重试。" },
  quota: { en: "The login service is restricted by its usage limit. Please contact the site owner to restore service.", zh: "登录服务因配额限制暂不可用，请联系网站管理员恢复服务；此提示不代表密码错误。" },
  unavailable: { en: "The login service is temporarily unavailable. Please try again later.", zh: "登录服务暂时不可用，请稍后重试；此提示不代表密码错误。" },
  "rate-limit": { en: "Too many login requests. Please wait before trying again.", zh: "登录请求过于频繁，请稍候再试。" },
  unconfirmed: { en: "Please verify your email before signing in.", zh: "请先完成邮箱验证，再尝试登录。" },
  unauthorized: { en: "This account is not authorized for staff access.", zh: "此账号尚未获得后台访问权限，请联系管理员。" },
};

export function staffLoginErrorMessage(code: string) {
  return Object.hasOwn(messages, code) ? messages[code as StaffLoginError] : messages.unavailable;
}
