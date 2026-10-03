import { ForgotPasswordForm } from "@/components/members/forgot-password-form";

export default async function ForgotPasswordPage(
  props: {
    searchParams: Promise<Record<string, string | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  return <ForgotPasswordForm searchParams={searchParams} />;
}
