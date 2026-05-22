export type MemberEntryMode = "register" | "login";

export function parseMemberEntry(mode: MemberEntryMode, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
