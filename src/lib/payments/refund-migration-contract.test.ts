import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260819030926_add_registration_refunds.sql",
);

describe("registration refund migration contract", () => {
  it("adds payment identifiers and a server-only refund audit table", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("stripe_checkout_session_id text");
    expect(sql).toContain("stripe_payment_intent_id text");
    expect(sql).toContain("refunded_amount numeric(10, 2) not null default 0");
    expect(sql).toContain("create table if not exists public.registration_refunds");
    expect(sql).toContain("references public.registrations(id) on delete restrict");
    expect(sql).toContain("alter table public.registration_refunds enable row level security");
    expect(sql).toContain("revoke all on table public.registration_refunds from anon, authenticated");
    expect(sql).toContain("grant all on table public.registration_refunds to service_role");
    expect(sql).not.toContain("security definer");
    expect(sql).not.toContain("auth.role()");
  });
});
