import { cookies } from "next/headers";
import { ResetPasswordForm } from "@/components/members/reset-password-form";

async function hasSupabaseAuthCookie() {
  return (await cookies())
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
}

export default async function ResetPasswordPage(
  props: {
    searchParams: Promise<Record<string, string | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  return <ResetPasswordForm hasSession={await hasSupabaseAuthCookie()} searchParams={searchParams} />;
}
