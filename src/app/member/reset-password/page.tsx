import { cookies } from "next/headers";
import { ResetPasswordForm } from "@/components/members/reset-password-form";

function hasSupabaseAuthCookie() {
  return cookies()
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
}

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  return <ResetPasswordForm hasSession={hasSupabaseAuthCookie()} searchParams={searchParams} />;
}
