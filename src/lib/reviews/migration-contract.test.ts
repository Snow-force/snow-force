import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730031809_event_checkin_reviews.sql",
  ),
  "utf8",
).toLowerCase();

describe("check-in and review migration contract", () => {
  it("keeps review data service-only behind enabled RLS", () => {
    expect(migration).toContain("alter table public.event_qr_campaigns enable row level security");
    expect(migration).toContain("alter table public.event_qr_accesses enable row level security");
    expect(migration).toContain("alter table public.event_reviews enable row level security");
    expect(migration).toContain("revoke all on public.event_reviews from anon, authenticated");
    expect(migration).toContain("grant all on public.event_reviews to service_role");
  });

  it("records attendance separately from review submission", () => {
    expect(migration).toContain("attendance_status text not null default 'unmarked'");
    expect(migration).toContain("attendance_source text");
    expect(migration).not.toContain("update public.registrations\n  set attendance_status = 'attended'");
  });

  it("opens Review and closes Check-in in one database transaction", () => {
    expect(migration).toContain("function public.open_event_qr_campaign");
    expect(migration).toContain("if p_purpose = 'review' then");
    expect(migration).toContain("and purpose = 'checkin'");
    expect(migration).toContain("insert into public.event_qr_campaigns");
  });
});
