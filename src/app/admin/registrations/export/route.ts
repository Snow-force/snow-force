import { requireAdmin } from "@/lib/auth/admin";
import { getRegistrations } from "@/lib/registrations/repository";
import { normalizeRegistrationFinance } from "../../../../lib/registrations/finance";
import { filterAdminRegistrations } from "@/lib/registrations/admin-view";

function csvCell(value: string) {
  const safe = /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  await requireAdmin();
  const params = new URL(request.url).searchParams;
  const eventSlug = params.get("event");
  const eventRows = eventSlug
    ? (await getRegistrations()).filter((registration) => registration.eventSlug === eventSlug)
    : await getRegistrations();
  const registrations = filterAdminRegistrations(eventRows, { query: params.get("q") ?? undefined, booker: params.get("booker") ?? undefined, payment: params.get("payment") ?? undefined, approval: params.get("approval") ?? undefined });
  const rows = [
    [
      "ID",
      "Event",
      "Name",
      "Email",
      "Phone",
      "Status",
      "Created",
      "Member",
      "booker_member_id",
      "attendee_email",
      "registration_kind",
      "attendee_confirmation_status",
      "approval_status",
      "attendance_status",
      "creation_source",
      "Deposit Amount",
      "Deposit Status",
      "Deposit Paid At",
      "Payment Method",
      "Payment Currency",
      "Refunded Amount",
      "Payment Note",
      "Lodging",
      "Final Amount",
      "Settlement Amount",
      "Settlement Status",
      "Settlement Note",
    ],
    ...registrations.map((registration) => {
      const finance = normalizeRegistrationFinance(registration.finance);
      return [
        registration.id,
        registration.eventSlug,
        registration.contactName,
        registration.contactEmail,
        registration.contactPhone,
        registration.status,
        registration.createdAt,
        registration.memberId ?? (registration.registrationKind === "proxy" ? "guest-attendee" : "legacy-visitor"),
        registration.bookerMemberId ?? registration.memberId ?? "",
        registration.attendeeEmail ?? "",
        registration.registrationKind ?? "self",
        registration.attendeeConfirmationStatus ?? "not_required",
        registration.approvalStatus ?? "not_required",
        registration.attendanceStatus,
        registration.creationSource ?? "legacy",
        finance.depositAmount === null ? "" : String(finance.depositAmount),
        finance.depositStatus,
        finance.depositPaidAt,
        finance.paymentMethod,
        finance.paymentCurrency,
        String(finance.refundedAmount),
        finance.paymentNote,
        finance.lodgingAssignment,
        finance.finalAmount === null ? "" : String(finance.finalAmount),
        finance.settlementAmount === null ? "" : String(finance.settlementAmount),
        finance.settlementStatus,
        finance.settlementNote,
      ];
    }),
  ];
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\n");

  return new Response(body, {
    headers: {
      "content-disposition": "attachment; filename=snowforce-registrations.csv",
      "content-type": "text/csv; charset=utf-8",
    },
  });
}
