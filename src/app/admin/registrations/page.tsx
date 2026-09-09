import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RegistrationFinanceControl } from "@/components/admin/registration-finance-control";
import { RegistrationCancellationControl } from "@/components/admin/registration-cancellation-control";
import { RegistrationRefundControl } from "@/components/admin/registration-refund-control";
import { requireAdmin } from "@/lib/auth/admin";
import {
  linkLegacyPaymentAction,
  refundRegistrationAction,
  verifyLegacyPaymentAction,
} from "@/lib/payments/refund-actions";
import { getRegistrationRefunds } from "@/lib/payments/refund-repository";
import { getAllEvents, getEventAdmin } from "@/lib/events/repository";
import { manualFinanceUpdate } from "@/lib/registrations/manual-finance";
import { normalizeRegistrationFinance } from "@/lib/registrations/finance";
import { buildAdminRegistrationEventView, registrationDisplayEmail, registrationDisplayName } from "@/lib/registrations/admin-view";
import {
  createRegistration,
  getRegistration,
  getRegistrations,
  updateRegistrationFinance,
  updateRegistrationStatus,
} from "@/lib/registrations/repository";
import type { Event } from "@/lib/types";

async function updateFinance(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const returnEvent = String(formData.get("returnEvent") ?? "").trim();
  if (!id) return;
  const registration = await getRegistration(id);
  if (!registration) return;
  await updateRegistrationFinance(id, manualFinanceUpdate(normalizeRegistrationFinance(registration.finance), formData));
  revalidatePath("/admin/registrations");
  const query = new URLSearchParams({ financeSaved: id });
  if (returnEvent) query.set("event", returnEvent);
  redirect(`/admin/registrations?${query.toString()}`);
}

function eventQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function registrationReturnPath(eventSlug: string, notice?: string) {
  const query = new URLSearchParams();
  if (eventSlug) query.set("event", eventSlug);
  if (notice) query.set("notice", notice);
  const suffix = query.toString();
  return `/admin/registrations${suffix ? `?${suffix}` : ""}`;
}

async function createManualRegistration(formData: FormData) {
  "use server";
  await requireAdmin();

  const eventSlug = String(formData.get("eventSlug") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim().toLowerCase();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();
  const returnPath = (notice: string) => redirect(registrationReturnPath(eventSlug, notice));

  if (!eventSlug) returnPath("Select an event before adding a registration.");
  if (!contactName) returnPath("Registrant name is required.");
  if (!isValidEmail(contactEmail)) returnPath("Enter a valid email address.");

  const event = await getEventAdmin(eventSlug);
  if (!event || event.status === "archived") returnPath("The selected event is unavailable.");

  const registrations = await getRegistrations(eventSlug);
  if (registrations.some((registration) => registration.contactEmail.trim().toLowerCase() === contactEmail)) {
    returnPath("This email already has a registration for the selected event.");
  }

  await createRegistration({
    eventSlug,
    memberId: null,
    answers: {
      name: contactName,
      email: contactEmail,
      ...(contactPhone ? { phone: contactPhone } : {}),
    },
    consentGiven: true,
    contactEmail,
    contactName,
    contactPhone,
  });

  revalidatePath("/admin/registrations");
  redirect(registrationReturnPath(eventSlug, "Registration added."));
}

async function cancelRegistration(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const fallbackEventSlug = String(formData.get("returnEvent") ?? "").trim();
  if (!id) redirect(registrationReturnPath(fallbackEventSlug, "Registration was not found."));

  const registration = await getRegistration(id);
  if (!registration) redirect(registrationReturnPath(fallbackEventSlug, "Registration was not found."));

  if (registration.status !== "cancelled") {
    await updateRegistrationStatus(registration.id, "cancelled");
    revalidatePath("/admin/registrations");
  }
  redirect(registrationReturnPath(registration.eventSlug, "Registration cancelled."));
}

export default async function AdminRegistrationsPage({
  searchParams,
}: {
  searchParams?: { event?: string | string[]; financeSaved?: string | string[]; notice?: string | string[] };
}) {
  const staff = await requireAdmin();
  const [registrations, activeEvents, refunds] = await Promise.all([
    getRegistrations(),
    getAllEvents(),
    getRegistrationRefunds(),
  ]);
  const eventsBySlug = new Map<string, Event>(activeEvents.map((event) => [event.slug, event]));
  const refundsByRegistration = new Map<string, typeof refunds>();
  for (const refund of refunds) {
    const rows = refundsByRegistration.get(refund.registrationId) ?? [];
    rows.push(refund);
    refundsByRegistration.set(refund.registrationId, rows);
  }
  const missingEventSlugs = Array.from(new Set(registrations.map((registration) => registration.eventSlug)))
    .filter((slug) => !eventsBySlug.has(slug));
  const missingEvents = await Promise.all(missingEventSlugs.map((slug) => getEventAdmin(slug)));
  for (const event of missingEvents) {
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
  const notice = eventQueryValue(searchParams?.notice);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-gray-900">Registration Management</h2>
        <a href={exportHref} className="btn-secondary px-3 py-1.5 text-xs">
          Export CSV
        </a>
      </div>
      {notice ? (
        <p className="mt-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800" role="status">
          {notice}
        </p>
      ) : null}
      <form action={createManualRegistration} className="mt-6 grid gap-3 rounded border border-gray-200 bg-gray-50 p-4 md:grid-cols-4 md:items-end">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Event
          <select name="eventSlug" required className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm">
            <option value="">Select event</option>
            {activeEvents.map((event) => (
              <option key={event.slug} value={event.slug}>
                {event.title.en || event.title.zh || event.slug}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Name
          <input name="contactName" required className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Email
          <input name="contactEmail" type="email" required className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm" />
        </label>
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-gray-700">
            Phone
            <input name="contactPhone" className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm" />
          </label>
          <button className="btn-primary shrink-0 px-4 py-2 text-sm">Add registration</button>
        </div>
      </form>
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
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Deposit</th>
              <th className="px-4 py-3">Deposit Status</th>
              <th className="px-4 py-3">Settlement Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="py-3 pl-4">Finance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {registrations.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-400">No registrations found.</td></tr>
            ) : view.selectedRegistrations.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-400">No registrations for this event.</td></tr>
            ) : view.selectedRegistrations.map((registration) => {
              const finance = normalizeRegistrationFinance(registration.finance);
              return (
                <tr key={registration.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-gray-900">{registrationDisplayName(registration)}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{registrationDisplayEmail(registration)}</td>
                  <td className="px-4 py-3">
                    <p>{registration.status}</p>
                    {registration.status === "cancelled" ? (
                      <span className="mt-1 block text-xs font-medium text-gray-400">Cancelled</span>
                    ) : (
                      <RegistrationCancellationControl
                        action={cancelRegistration}
                        registrationId={registration.id}
                        returnEvent={view.selectedEventSlug}
                      />
                    )}
                  </td>
                  <RegistrationFinanceControl
                    action={updateFinance}
                    createdAt={registration.createdAt}
                    finance={finance}
                    isSaved={financeSavedId === registration.id}
                    registrationId={registration.id}
                    returnEvent={view.selectedEventSlug}
                    refundControl={
                      <RegistrationRefundControl
                        canRefund={staff.role === "admin"}
                        finance={finance}
                        linkAction={linkLegacyPaymentAction}
                        refunds={refundsByRegistration.get(registration.id) ?? []}
                        refundAction={refundRegistrationAction}
                        registrationId={registration.id}
                        verifyAction={verifyLegacyPaymentAction}
                      />
                    }
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
