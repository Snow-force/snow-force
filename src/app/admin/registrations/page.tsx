import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { getEventAdmin } from "@/lib/events/repository";
import { buildAdminRegistrationEventView, registrationDisplayEmail, registrationDisplayName } from "@/lib/registrations/admin-view";
import { getRegistrations, updateRegistrationStatus } from "@/lib/registrations/repository";
import type { Event, Registration } from "@/lib/types";

async function setRegistrationStatus(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as Registration["status"];
  if (id && ["confirmed", "cancelled", "waitlist"].includes(status)) {
    await updateRegistrationStatus(id, status);
    revalidatePath("/admin/registrations");
  }
}

function eventQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminRegistrationsPage({
  searchParams,
}: {
  searchParams?: { event?: string | string[] };
}) {
  await requireAdmin();
  const registrations = await getRegistrations();
  const eventSlugs = Array.from(new Set(registrations.map((registration) => registration.eventSlug)));
  const events = await Promise.all(eventSlugs.map((slug) => getEventAdmin(slug)));
  const eventsBySlug = new Map<string, Event>();
  for (const event of events) {
    if (event) eventsBySlug.set(event.slug, event);
  }
  const view = buildAdminRegistrationEventView({
    registrations,
    eventsBySlug,
    requestedEventSlug: eventQueryValue(searchParams?.event),
  });
  const exportHref = view.selectedEventSlug
    ? `/admin/registrations/export?event=${encodeURIComponent(view.selectedEventSlug)}`
    : "/admin/registrations/export";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-gray-900">Registration Management</h2>
        <a href={exportHref} className="btn-secondary px-3 py-1.5 text-xs">
          Export CSV
        </a>
      </div>
      {view.eventOptions.length > 0 ? (
        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <label className="flex min-w-72 flex-col gap-1 text-sm font-medium text-gray-700">
            Event
            <select
              name="event"
              defaultValue={view.selectedEventSlug}
              className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {view.eventOptions.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary px-4 py-2 text-sm">View</button>
        </form>
      ) : null}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-400">
              <th className="py-3 pr-4">Registrant</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="py-3 pl-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {registrations.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-400">No registrations found.</td></tr>
            ) : view.selectedRegistrations.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-400">No registrations for this event.</td></tr>
            ) : view.selectedRegistrations.map((registration) => {
              return (
                <tr key={registration.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-gray-900">{registrationDisplayName(registration)}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{registrationDisplayEmail(registration)}</td>
                  <td className="px-4 py-3 text-gray-500">
                    <p className="text-gray-700">{view.selectedEventLabel}</p>
                    <p className="text-xs text-gray-400">{registration.eventSlug}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{registration.memberId ? "Member" : "Visitor"}</td>
                  <td className="px-4 py-3">{registration.status}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(registration.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 pl-4">
                    <form action={setRegistrationStatus} className="flex gap-1">
                      <input type="hidden" name="id" value={registration.id} />
                      <button name="status" value="confirmed" className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50">Confirm</button>
                      <button name="status" value="cancelled" className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">Cancel</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
