import { requireAdmin } from "@/lib/auth/admin";
import { getRegistrations } from "@/lib/registrations/repository";

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
    ["ID", "Event", "Name", "Email", "Phone", "Status", "Created", "Member"],
    ...registrations.map((registration) => [
      registration.id,
      registration.eventSlug,
      registration.contactName,
      registration.contactEmail,
      registration.contactPhone,
      registration.status,
      registration.createdAt,
      registration.memberId ?? "visitor",
    ]),
  ];
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\n");

  return new Response(body, {
    headers: {
      "content-disposition": "attachment; filename=snowforce-registrations.csv",
      "content-type": "text/csv; charset=utf-8",
    },
  });
}
