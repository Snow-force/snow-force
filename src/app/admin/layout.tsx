import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/admin";
import { LanguageProvider } from "@/lib/language";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireAdmin();

  return <LanguageProvider initialLang="en"><AdminShell staff={staff}>{children}</AdminShell></LanguageProvider>;
}
