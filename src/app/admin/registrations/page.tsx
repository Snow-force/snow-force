import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RegistrationFinanceControl } from "@/components/admin/registration-finance-control";
import { RegistrationCancellationControl } from "@/components/admin/registration-cancellation-control";
import { RegistrationRefundControl } from "@/components/admin/registration-refund-control";
import { GuestRegistrationControl } from "@/components/admin/guest-registration-control";
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
import { buildAdminRegistrationEventView, filterAdminRegistrations, registrationDisplayEmail, registrationDisplayName } from "@/lib/registrations/admin-view";
import {
  createRegistration,
  getRegistration,
  getRegistrations,
  updateRegistrationFinance,
} from "@/lib/registrations/repository";
import type { Event } from "@/lib/types";
import { getPaidPendingReviews } from "@/lib/registrations/payment-review";
import { cancelRegistration } from "@/lib/registrations/cancellation-actions";
import { hasUnrefundedPayment } from "@/lib/registrations/cancellation";

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
  const possibleDuplicate = registrations.some((registration) => registration.status !== "cancelled" &&
    registration.contactName.trim().toLowerCase() === contactName.toLowerCase() &&
    (registration.contactPhone === contactPhone || registration.attendeeEmail?.toLowerCase() === contactEmail));

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
    attendeeEmail: contactEmail,
    creationSource: "admin",
    clientRequestKey: String(formData.get("clientRequestKey") ?? "") || crypto.randomUUID(),
  });

  revalidatePath("/admin/registrations");
  redirect(registrationReturnPath(eventSlug, possibleDuplicate ? "Registration added. Review a possible attendee duplicate." : "Registration added."));
}

export default async function AdminRegistrationsPage(
  props: {
    searchParams?: Promise<{ event?: string | string[]; financeSaved?: string | string[]; notice?: string | string[]; q?: string; booker?: string; payment?: string; approval?: string }>;
  }
) {
  const searchParams = await props.searchParams ?? {};
  const staff = await requireAdmin();
  const [registrations, activeEvents, refunds, paymentReviews] = await Promise.all([
    getRegistrations(),
    getAllEvents(),
    getRegistrationRefunds(),
    getPaidPendingReviews(),
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
  const filters = { query: searchParams.q, booker: searchParams.booker, payment: searchParams.payment, approval: searchParams.approval };
  const visibleRegistrations = filterAdminRegistrations(view.selectedRegistrations, filters);
  const exportQuery = new URLSearchParams();
  if (view.selectedEventSlug) exportQuery.set("event", view.selectedEventSlug);
  if (filters.query) exportQuery.set("q", filters.query);
  if (filters.booker) exportQuery.set("booker", filters.booker);
  if (filters.payment) exportQuery.set("payment", filters.payment);
  if (filters.approval) exportQuery.set("approval", filters.approval);
  const exportHref = `/admin/registrations/export?${exportQuery}`;
  const financeSavedId = eventQueryValue(searchParams?.financeSaved);
  const notice = eventQueryValue(searchParams?.notice);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-gray-900">Registration Management</h2>
        {eventQueryValue(searchParams?.event) && <a href={`/admin/events/${eventQueryValue(searchParams?.event)}/waivers`} className="text-sm text-blue-700 underline">Group bookings & verified waivers / 多人报名与邮箱验证免责</a>}
        <a href={exportHref} className="btn-secondary px-3 py-1.5 text-xs">
          Export CSV
        </a>
      </div>
      {notice ? (
        <p className="mt-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800" role="status">
          {notice}
        </p>
      ) : null}
      {paymentReviews.length > 0 && <section className="mt-5 rounded border border-red-200 bg-red-50 p-4 text-sm" aria-label="Paid requires review">
        <h3 className="font-semibold">Paid requires review / 已付款待核对</h3>
        <p className="mt-2">Verify the existing Stripe payment before issuing a ticket or an individual refund. Do not collect another payment.</p>
        <ul className="mt-3 space-y-2">{paymentReviews.map((row) => <li key={row.id}>{row.event_slug} · pending: {row.id} · booker: {row.member_id}</li>)}</ul>
      </section>}
      <form action={createManualRegistration} className="mt-6 grid gap-3 rounded border border-gray-200 bg-gray-50 p-4 md:grid-cols-4 md:items-end">
        <input type="hidden" name="clientRequestKey" value={crypto.randomUUID()} />
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
          <label className="flex flex-col gap-1 text-sm text-gray-700">Attendee / 参加者<input name="q" defaultValue={filters.query} className="rounded border px-3 py-2" /></label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">Booker ID / 代报名会员<input name="booker" defaultValue={filters.booker} className="rounded border px-3 py-2" /></label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">Payment / 付款状态<select name="payment" defaultValue={filters.payment ?? ""} className="rounded border px-3 py-2"><option value="">All / 全部</option>{["pending","paid","waived","refunded"].map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">Approval / 审批<select name="approval" defaultValue={filters.approval ?? ""} className="rounded border px-3 py-2"><option value="">All / 全部</option>{["pending","approved","rejected","not_required"].map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <button className="btn-primary px-4 py-2 text-sm">View</button>
        </form>
      ) : null}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-400">
              <th className="py-3 pr-4">Registrant</th>
              <th className="px-4 py-3">Booker / Contact</th>
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
            ) : visibleRegistrations.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-400">No registrations for this event.</td></tr>
            ) : visibleRegistrations.map((registration) => {
              const finance = normalizeRegistrationFinance(registration.finance);
              return (
                <tr key={registration.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-gray-900">{registrationDisplayName(registration)}</p>
                    <p className="mt-1 text-xs text-gray-500">{registration.registrationKind ?? "self"} · {registration.creationSource ?? "legacy"} · {registration.attendeeEmail ?? ""}</p>
                    <GuestRegistrationControl registration={registration} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{registrationDisplayEmail(registration)}<p className="mt-1 text-xs">{registration.bookerMemberId ?? registration.memberId ?? "Staff entry"}</p></td>
                  <td className="px-4 py-3">
                    <p>{registration.status}</p>
                    {registration.status === "cancelled" ? (
                      <span className="mt-1 block text-xs font-medium text-gray-500">
                        {hasUnrefundedPayment(registration) ? "Cancelled; payment not fully refunded / 已取消，款项尚未全额退还" : "Cancelled / 已取消"}
                      </span>
                    ) : (
                      <RegistrationCancellationControl
                        action={cancelRegistration}
                        canCancel={staff.role === "admin" || !hasUnrefundedPayment(registration)}
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
