import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260909041600_persist_registration_checkout.sql",
);

describe("checkout attempt migration contract", () => {
  it("retains the Stripe checkout reference and prevents replacing its registration details", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("add column checkout_attempt jsonb");
    expect(sql).toContain("add column fulfilled_registration_id uuid references public.registrations(id)");
    expect(sql).toContain("pending_checkout_attempt_object");
    expect(sql).toContain("create or replace function private.protect_pending_checkout()");
    expect(sql).toContain("Paid or in-progress checkout records must be retained");
    expect(sql).toContain("Checkout registration details are locked");
    expect(sql).toContain("revoke all on function private.protect_pending_checkout() from public, anon, authenticated");
    expect(sql).not.toContain("security definer");
  });
});
