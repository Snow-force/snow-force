import { AdminDashboardView } from "@/components/admin/admin-dashboard-view";
import { requireAdmin } from "@/lib/auth/admin";
import { getAllEvents } from "@/lib/events/repository";
import { getFAQs } from "@/lib/faqs/repository";
import { getInquiries } from "@/lib/inquiries/repository";
import { getRecaps } from "@/lib/recaps/repository";
import { getRegistrations } from "@/lib/registrations/repository";

export default async function AdminDashboard() {
  await requireAdmin();
  const [events, registrations, inquiries] = await Promise.all([
    getAllEvents().catch(() => []),
    getRegistrations(),
    getInquiries(),
  ]);
  const stats = [
    { key: "events" as const, value: events.length, href: "/admin/events" },
    { key: "registrations" as const, value: registrations.length, href: "/admin/registrations" },
    { key: "recaps" as const, value: getRecaps().length, href: "/admin/recaps" },
    { key: "faqs" as const, value: getFAQs().length, href: "/admin/faq" },
    { key: "inquiries" as const, value: inquiries.length, href: "/admin" },
  ];

  return <AdminDashboardView stats={stats} registrations={registrations} />;
}
