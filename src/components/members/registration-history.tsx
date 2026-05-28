import Link from "next/link";
import type { Registration } from "@/lib/types";

type RegistrationHistoryProps = {
  registrations: Registration[];
};

function statusLabel(status: Registration["status"]) {
  if (status === "confirmed") return "Confirmed";
  if (status === "waitlist") return "Waitlist";
  return "Cancelled";
}

function statusClassName(status: Registration["status"]) {
  if (status === "confirmed") return "bg-green-50 text-green-700 border-green-200";
  if (status === "waitlist") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function answerSummary(registration: Registration) {
  const values = Object.values(registration.answers)
    .flatMap((value) => (Array.isArray(value) ? value : [String(value)]))
    .filter(Boolean)
    .slice(0, 3);

  return values.length > 0 ? values.join(" · ") : "Registration details saved";
}

export function RegistrationHistory({ registrations }: RegistrationHistoryProps) {
  return (
    <section className="rounded-[28px] border border-[#dce3ed] bg-white p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#005bea]">Trip history</p>
          <h2 className="mt-2 text-[24px] font-semibold text-[#15171b]">Registration cards</h2>
          <p className="mt-1 text-[15px] text-[#667085]">Your SnowForce ride record, status, and event links.</p>
        </div>
        <Link href="/events" className="text-[14px] font-semibold text-[#005bea]">Browse events</Link>
      </div>

      {registrations.length === 0 ? (
        <div className="mt-5 rounded-[22px] border border-dashed border-[#dce3ed] bg-[#f6f7fb] p-5 text-[15px] text-[#667085]">
          No member-linked registrations yet. Future signups made while logged in will appear here.
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          {registrations.map((registration) => (
            <article key={registration.id} className="overflow-hidden rounded-[24px] border border-[#edf1f6] bg-[#f9fbfd]">
              <div className="grid gap-0 sm:grid-cols-[128px_1fr]">
                <div className="flex min-h-28 items-end bg-[radial-gradient(circle_at_30%_20%,rgba(0,91,234,0.28),transparent_36%),linear-gradient(145deg,#e9f3ff,#f8fbff)] p-4">
                  <span className="rounded-full bg-white/90 px-3 py-1 text-[12px] font-semibold text-[#005bea]">SnowForce</span>
                </div>
                <div className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Link href={`/events/${registration.eventSlug}`} className="text-[18px] font-semibold text-[#15171b] hover:text-[#005bea]">
                        {registration.eventSlug}
                      </Link>
                      <p className="mt-1 text-[13px] text-[#667085]">Registered {formatDate(registration.createdAt)}</p>
                    </div>
                    <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusClassName(registration.status)}`}>
                      {statusLabel(registration.status)}
                    </span>
                  </div>
                  <p className="mt-3 text-[14px] text-[#667085]">{answerSummary(registration)}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[13px] font-semibold">
                    <Link href={`/events/${registration.eventSlug}`} className="rounded-full bg-[#005bea] px-4 py-2 text-white">View detail</Link>
                    <span className="rounded-full border border-[#dce3ed] px-4 py-2 text-[#667085]">Payment: pending</span>
                    <span className="rounded-full border border-[#dce3ed] px-4 py-2 text-[#667085]">Waitlist: {registration.status === "waitlist" ? "active" : "no"}</span>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
