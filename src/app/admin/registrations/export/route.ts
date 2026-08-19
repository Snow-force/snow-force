import { requireAdmin } from "@/lib/auth/admin";
import { getRegistrations } from "@/lib/registrations/repository";
import { normalizeRegistrationFinance } from "../../../../lib/registrations/finance";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  await requireAdmin();
  const eventSlug = new URL(request.url).searchParams.get("event");
  const registrations = eventSlug
    ? (await getRegistrations()).filter((registration) => registration.eventSlug === eventSlug)
    : await getRegistrations();
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
        registration.memberId ?? "legacy-visitor",
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
