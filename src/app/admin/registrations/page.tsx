import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RegistrationFinanceControl } from "@/components/admin/registration-finance-control";
import { requireAdmin } from "@/lib/auth/admin";
import { getEventAdmin } from "@/lib/events/repository";
import { normalizeRegistrationFinance } from "@/lib/registrations/finance";
import { buildAdminRegistrationEventView, registrationDisplayEmail, registrationDisplayName } from "@/lib/registrations/admin-view";
import { getRegistrations, updateRegistrationFinance } from "@/lib/registrations/repository";
import type { Event, RegistrationDepositStatus, RegistrationSettlementStatus } from "@/lib/types";

function parseAmount(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

async function updateFinance(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const returnEvent = String(formData.get("returnEvent") ?? "").trim();
  const depositStatus = String(formData.get("depositStatus") ?? "pending") as RegistrationDepositStatus;
  const settlementStatus = String(formData.get("settlementStatus") ?? "not_started") as RegistrationSettlementStatus;
  if (!id) return;
  await updateRegistrationFinance(id, {
    depositAmount: parseAmount(formData.get("depositAmount")),
    depositStatus: ["pending", "paid", "refunded", "waived"].includes(depositStatus) ? depositStatus : "pending",
    settlementStatus: ["not_started", "pending_balance", "pending_refund", "settled"].includes(settlementStatus)
      ? settlementStatus
      : "not_started",
  });
  revalidatePath("/admin/registrations");
  const query = new URLSearchParams({ financeSaved: id });
  if (returnEvent) query.set("event", returnEvent);
  redirect(`/admin/registrations?${query.toString()}`);
}

function eventQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminRegistrationsPage({
  searchParams,
}: {
  searchParams?: { event?: string | string[]; financeSaved?: string | string[] };
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
  const financeSavedId = eventQueryValue(searchParams?.financeSaved);

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
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Deposit</th>
              <th className="px-4 py-3">Deposit Status</th>
              <th className="px-4 py-3">Settlement Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="py-3 pl-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {registrations.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-gray-400">No registrations found.</td></tr>
            ) : view.selectedRegistrations.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-gray-400">No registrations for this event.</td></tr>
            ) : view.selectedRegistrations.map((registration) => {
              const finance = normalizeRegistrationFinance(registration.finance);
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
                  <td className="px-4 py-3">{registration.status}</td>
                  <RegistrationFinanceControl
                    action={updateFinance}
                    createdAt={registration.createdAt}
                    finance={finance}
                    isSaved={financeSavedId === registration.id}
                    registrationId={registration.id}
                    returnEvent={view.selectedEventSlug}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
