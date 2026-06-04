import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth/admin";
import { getEventAdmin } from "@/lib/events/repository";
import { normalizeRegistrationFinance } from "@/lib/registrations/finance";
import { FinanceSubmitButton } from "@/components/admin/finance-submit-button";
import { buildAdminRegistrationEventView, registrationDisplayEmail, registrationDisplayName } from "@/lib/registrations/admin-view";
import { deleteCancelledRegistration, getRegistrations, updateRegistrationFinance, updateRegistrationStatus } from "@/lib/registrations/repository";
import type { Event, Registration, RegistrationDepositStatus, RegistrationSettlementStatus } from "@/lib/types";

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

async function deleteRegistration(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) {
    await deleteCancelledRegistration(id);
    revalidatePath("/admin/registrations");
  }
}

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
    depositStatus: ["pending", "paid", "waived"].includes(depositStatus) ? depositStatus : "pending",
    depositPaidAt: String(formData.get("depositPaidAt") ?? "").trim(),
    paymentMethod: String(formData.get("paymentMethod") ?? "").trim(),
    paymentNote: String(formData.get("paymentNote") ?? "").trim(),
    lodgingAssignment: String(formData.get("lodgingAssignment") ?? "").trim(),
    finalAmount: parseAmount(formData.get("finalAmount")),
    settlementStatus: ["not_started", "pending_balance", "pending_refund", "settled"].includes(settlementStatus)
      ? settlementStatus
      : "not_started",
    settlementNote: String(formData.get("settlementNote") ?? "").trim(),
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
  const staff = await requireAdmin();
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
              <th className="px-4 py-3">Settlement</th>
              <th className="px-4 py-3">Date</th>
              <th className="py-3 pl-4">Actions</th>
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
                  <td className="px-4 py-3 text-gray-500">
                    <p className="text-gray-700">{view.selectedEventLabel}</p>
                    <p className="text-xs text-gray-400">{registration.eventSlug}</p>
                  </td>
                  <td className="px-4 py-3">{registration.status}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <p className="font-semibold">{finance.depositStatus}</p>
                    <p>{finance.depositAmount === null ? "No amount" : `$${finance.depositAmount}`}</p>
                    {finance.paymentMethod ? <p className="text-gray-400">{finance.paymentMethod}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <p className="font-semibold">{finance.settlementStatus}</p>
                    <p>{finance.settlementAmount === null ? "No final" : finance.settlementAmount > 0 ? `Collect $${finance.settlementAmount}` : finance.settlementAmount < 0 ? `Refund $${Math.abs(finance.settlementAmount)}` : "Even"}</p>
                    {finance.lodgingAssignment ? <p className="text-gray-400">{finance.lodgingAssignment}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(registration.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 pl-4">
                    <div className="flex flex-col gap-2">
                      <form action={setRegistrationStatus} className="flex gap-1">
                        <input type="hidden" name="id" value={registration.id} />
                        <button name="status" value="confirmed" className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50">Confirm</button>
                        <button name="status" value="cancelled" className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">Cancel</button>
                      </form>
                      <form action={updateFinance} className="grid min-w-[360px] grid-cols-3 gap-1 rounded border border-gray-100 bg-gray-50 p-2">
                        <input type="hidden" name="id" value={registration.id} />
                        <input type="hidden" name="returnEvent" value={view.selectedEventSlug} />
                        <input name="depositAmount" defaultValue={finance.depositAmount ?? ""} placeholder="Deposit" className="rounded border border-gray-200 px-2 py-1 text-xs" />
                        <select name="depositStatus" defaultValue={finance.depositStatus} className="rounded border border-gray-200 px-2 py-1 text-xs">
                          <option value="pending">Deposit pending</option>
                          <option value="paid">Deposit paid</option>
                          <option value="waived">Waived</option>
                        </select>
                        <input name="depositPaidAt" defaultValue={finance.depositPaidAt} placeholder="Paid at ISO" className="rounded border border-gray-200 px-2 py-1 text-xs" />
                        <input name="paymentMethod" defaultValue={finance.paymentMethod} placeholder="Method" className="rounded border border-gray-200 px-2 py-1 text-xs" />
                        <input name="lodgingAssignment" defaultValue={finance.lodgingAssignment} placeholder="Lodging" className="rounded border border-gray-200 px-2 py-1 text-xs" />
                        <input name="finalAmount" defaultValue={finance.finalAmount ?? ""} placeholder="Final" className="rounded border border-gray-200 px-2 py-1 text-xs" />
                        <select name="settlementStatus" defaultValue={finance.settlementStatus} className="rounded border border-gray-200 px-2 py-1 text-xs">
                          <option value="not_started">Not started</option>
                          <option value="pending_balance">Collect balance</option>
                          <option value="pending_refund">Refund due</option>
                          <option value="settled">Settled</option>
                        </select>
                        <input name="paymentNote" defaultValue={finance.paymentNote} placeholder="Payment note" className="rounded border border-gray-200 px-2 py-1 text-xs" />
                        <input name="settlementNote" defaultValue={finance.settlementNote} placeholder="Settlement note" className="rounded border border-gray-200 px-2 py-1 text-xs" />
                        <FinanceSubmitButton />
                        {financeSavedId === registration.id ? (
                          <span className="flex items-center px-2 text-xs font-semibold text-green-700">Saved</span>
                        ) : null}
                      </form>
                      {staff.role === "admin" && registration.status === "cancelled" ? (
                        <form action={deleteRegistration}>
                          <input type="hidden" name="id" value={registration.id} />
                          <button className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50">Delete</button>
                        </form>
                      ) : null}
                    </div>
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
