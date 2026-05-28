import { ForgotPasswordForm } from "@/components/members/forgot-password-form";

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  return <ForgotPasswordForm searchParams={searchParams} />;
}
