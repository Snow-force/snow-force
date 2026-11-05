// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";

let db: PGlite;
let room: string;
let units: string[];
let offers: string[];
const actor = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table events(slug text primary key); insert into events values('trip-a'),('trip-b');");
  for (const file of ["20261104201624_event_lodging_catalog.sql", "20261105035034_event_lodging_inventory.sql"]) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  const hotel = (await db.query<{ id: string }>(`insert into lodging_properties(name,address,timezone,updated_by) values('{"en":"Hotel","zh":"酒店"}','Road','America/Los_Angeles',$1) returning id`, [actor])).rows[0].id;
  room = (await db.query<{ id: string }>(`insert into lodging_room_types(property_id,name,beds,max_guests,updated_by) values($1,'{"en":"Room","zh":"房间"}','{"en":"Beds","zh":"床"}',4,$2) returning id`, [hotel, actor])).rows[0].id;
  units = (await db.query<{ id: string }>(`insert into lodging_units(room_type_id,internal_code,supply_reference,continuity_confirmed,updated_by) select $1,code,'Confirmed test contract',true,$2 from unnest(array['A','B']) code returning id`, [room, actor])).rows.map(r => r.id);
  await db.query(`insert into lodging_unit_nights(unit_id,stay_date,updated_by) select id,day::date,$1 from lodging_units cross join generate_series('2027-03-13'::date,'2027-03-16'::date,'1 day') day`, [actor]);
  offers = (await db.query<{ id: string }>(`insert into event_lodging_offers(event_slug,room_type_id,check_in,check_out,nightly_amount,mandatory_fee,tax_basis_points,policy,updated_by) select slug,$1,'2027-03-13','2027-03-15',10000,0,0,'{"en":"Terms","zh":"条款"}',$2 from events returning id`, [room, actor])).rows.map(r => r.id);
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

async function reserve({ quantity = 1, key = randomUUID(), kind = "hold", offer = null as string | null, start = "2027-03-13", end = "2027-03-15", staff = actor } = {}) {
  return (await db.query<{ id: string }>("select reserve_lodging_inventory($1,$2,$3,$4,$5,$6,$7,'Test request',$8) id", [room, start, end, quantity, staff, key, kind, offer])).rows[0].id;
}
async function release(id: string) {
  return (await db.query<{ released: boolean }>("select release_lodging_inventory($1,$2,'Verified release') released", [id, other])).rows[0].released;
}
async function count() {
  return Number((await db.query<{ count: string }>("select count(*) from lodging_unit_nights where hold_id is not null")).rows[0].count);
}

it("allocates the same unit across both local-date nights including the DST boundary", async () => {
  const id = await reserve();
  const rows = (await db.query<{ unit_id: string; stay_date: string }>("select unit_id,stay_date::text from lodging_unit_nights where hold_id=$1 order by stay_date", [id])).rows;
  expect(rows.map(r => r.stay_date)).toEqual(["2027-03-13", "2027-03-14"]);
  expect(new Set(rows.map(r => r.unit_id)).size).toBe(1);
});
it("shares inventory across event offers and manual allocations", async () => {
  await reserve({ offer: offers[0] });
  await reserve({ kind: "manual", offer: offers[1] });
  await expect(reserve()).rejects.toThrow("Insufficient continuous inventory");
});
it("rejects fragmented nightly supply instead of promising a room change", async () => {
  await db.query("update lodging_unit_nights set blocked=true where (unit_id=$1 and stay_date='2027-03-13') or (unit_id=$2 and stay_date='2027-03-14')", units);
  await expect(reserve()).rejects.toThrow("Insufficient continuous inventory");
});
it("fails multi-unit requests without partial allocation", async () => {
  await expect(reserve({ quantity: 3 })).rejects.toThrow("Insufficient continuous inventory");
  // Failed statements abort this transaction; verify atomicity after rollback.
  await db.exec("rollback; begin");
  expect(await count()).toBe(0);
  expect((await db.query("select * from lodging_inventory_holds")).rows).toHaveLength(0);
});
it("does not allocate missing or blocked nights", async () => {
  await db.query("delete from lodging_unit_nights where stay_date='2027-03-14'");
  await expect(reserve()).rejects.toThrow("Insufficient continuous inventory");
});
it("permits adjacent stays on the checkout date", async () => {
  await reserve({ quantity: 2 });
  await reserve({ quantity: 2, start: "2027-03-15", end: "2027-03-17" });
  expect(await count()).toBe(8);
});
it("retries a request without allocating twice", async () => {
  const key = randomUUID();
  const id = await reserve({ key });
  expect(await reserve({ key })).toBe(id);
  expect(await count()).toBe(2);
});
it("rejects reuse of a key for changed parameters", async () => {
  const key = randomUUID();
  await reserve({ key });
  await expect(reserve({ key, quantity: 2 })).rejects.toThrow("Idempotency conflict");
});
it("validates an offer against the authoritative dates and room type", async () => {
  await expect(reserve({ offer: offers[0], end: "2027-03-16" })).rejects.toThrow("Offer does not match");
});
it.each([0, 11, null])("rejects invalid quantities: %s", async quantity => {
  await expect(db.query("select reserve_lodging_inventory($1,'2027-03-13','2027-03-15',$2,$3,$4,'hold','Test')", [room, quantity, actor, randomUUID()])).rejects.toThrow("Invalid inventory request");
});
it("does not release an unexpired hold", async () => {
  await expect(release(await reserve())).rejects.toThrow("Hold has not expired");
});
it("retains expired inventory until an explicit safe release", async () => {
  const key = randomUUID();
  const id = await reserve({ key, quantity: 2 });
  await db.query("update lodging_inventory_holds set expires_at=now()-interval '1 hour' where id=$1", [id]);
  expect(await count()).toBe(4);
  expect(await release(id)).toBe(true);
  expect(await release(id)).toBe(false);
  expect(await reserve({ key, quantity: 2 })).toBe(id);
  expect(await count()).toBe(0);
  const audit = (await db.query<{ actor: string; new_row: { reason: string } }>("select actor,new_row from lodging_catalog_audit where entity_table='lodging_inventory_release'")).rows;
  expect(audit).toEqual([{ actor: other, new_row: { reason: "Verified release", state: "released" } }]);
});
it.each(["creating", "open", "processing", "unknown", "paid"])("retains expired %s payment inventory for reconciliation", async state => {
  const id = await reserve();
  await db.query("update lodging_inventory_holds set payment_state=$2,expires_at=now()-interval '1 hour' where id=$1", [id, state]);
  await expect(release(id)).rejects.toThrow("Payment reconciliation required");
});
it("releases a reconciled terminal-unpaid session without waiting for local expiry", async () => {
  const id = await reserve();
  await db.query("update lodging_inventory_holds set payment_state='unpaid_terminal' where id=$1", [id]);
  expect(await release(id)).toBe(true);
});
it("releases a manual allocation through the same audited inventory service", async () => {
  const id = await reserve({ kind: "manual" });
  expect(await release(id)).toBe(true);
  expect(await count()).toBe(0);
});
it("prevents overwriting occupied supply even through a privileged direct update", async () => {
  await reserve({ quantity: 2 });
  await expect(db.query("update lodging_unit_nights set hold_id=null")).rejects.toThrow("Active allocation cannot be overwritten");
});
it("prevents blocking occupied supply", async () => {
  await reserve({ quantity: 2 });
  await expect(db.query("update lodging_unit_nights set blocked=true")).rejects.toThrow();
});
it("prevents deleting occupied supply", async () => {
  await reserve({ quantity: 2 });
  await expect(db.query("delete from lodging_unit_nights")).rejects.toThrow("Occupied supply cannot be removed");
});
it.each(["anon", "authenticated"])("denies tables and internal commands to %s", async role => {
  for (const sql of ["select * from lodging_units", "select * from lodging_unit_nights", "select * from lodging_inventory_holds", `select reserve_lodging_inventory('${room}','2027-03-13','2027-03-15',1,'${actor}','${randomUUID()}','hold','Test')`, `select release_lodging_inventory('${randomUUID()}','${actor}','Test')`]) {
    await db.exec(`savepoint permission_check; set local role ${role}`);
    await expect(db.query(sql)).rejects.toThrow("permission denied");
    await db.exec("rollback to permission_check");
  }
});
it("executes the full reserve/release path as service_role", async () => {
  await db.exec("set local role service_role");
  const id = await reserve({ kind: "manual" });
  expect(await release(id)).toBe(true);
});
