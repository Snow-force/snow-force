import { AdminDashboardView } from "@/components/admin/admin-dashboard-view";
import { buildAdminOperations } from "@/lib/admin-operations";
import { requireAdmin } from "@/lib/auth/admin";
import { getAllEvents } from "@/lib/events/repository";
import { getFAQs } from "@/lib/faqs/repository";
import { getInquiries } from "@/lib/inquiries/repository";
import { getRecaps } from "@/lib/recaps/repository";
import { getCancellationRequests } from "@/lib/registrations/cancellation-repository";
import { getRegistrations } from "@/lib/registrations/repository";

export default async function AdminDashboard() {
  await requireAdmin();
  const results = await Promise.allSettled([
    getAllEvents(), getRegistrations(), getRecaps(), getInquiries(), getCancellationRequests(),
  ]);
  const unavailable: ("events" | "registrations" | "recaps" | "inquiries" | "cancellations")[] = [];
  function rows<T>(result: PromiseSettledResult<T[]>, source: typeof unavailable[number]): T[] {
    if (result.status === "fulfilled") return result.value;
    unavailable.push(source);
    return [];
  }
  const events = rows(results[0], "events");
  const registrations = rows(results[1], "registrations");
  const recaps = rows(results[2], "recaps");
  const inquiries = rows(results[3], "inquiries");
  const cancellations = rows(results[4], "cancellations");
  const stats = [
    { key: "events" as const, value: unavailable.includes("events") ? null : events.length, href: "/admin/events" },
    { key: "registrations" as const, value: unavailable.includes("registrations") ? null : registrations.length, href: "/admin/registrations" },
    { key: "recaps" as const, value: unavailable.includes("recaps") ? null : recaps.length, href: "/admin/recaps" },
    { key: "faqs" as const, value: getFAQs().length, href: "/admin/faq" },
    { key: "inquiries" as const, value: unavailable.includes("inquiries") ? null : inquiries.length, href: "#inquiries" },
  ];

  return <AdminDashboardView stats={stats} unavailable={unavailable}
    operations={buildAdminOperations({ events, registrations, recaps, cancellations })}
    inquiries={inquiries.filter((inquiry) => inquiry.status === "new").map(({ id, organizationName, contactName, contactEmail, message }) => ({ id, organizationName, contactName, contactEmail, message }))} />;
}
