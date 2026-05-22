import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { getAllEvents } from "@/lib/events/repository";
import { getRegistrations, updateRegistrationStatus } from "@/lib/registrations/repository";
import type { Registration } from "@/lib/types";

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

export default async function AdminRegistrationsPage() {
  await requireAdmin();
  const [registrations, events] = await Promise.all([
    getRegistrations(),
    Promise.resolve(getAllEvents()),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-gray-900">Registration Management</h2>
        <a href="/admin/registrations/export" className="btn-secondary px-3 py-1.5 text-xs">
          Export CSV
        </a>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-400">
              <th className="py-3 pr-4">Registrant</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="py-3 pl-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {registrations.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">No registrations found.</td></tr>
            ) : registrations.map((registration) => {
              const event = events.find((item) => item.slug === registration.eventSlug);
              return (
                <tr key={registration.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-gray-900">{registration.contactName}</p>
                    <p className="text-xs text-gray-400">{registration.contactEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{event?.title.en ?? registration.eventSlug}</td>
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
