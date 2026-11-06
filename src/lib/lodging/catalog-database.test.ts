// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
let db: PGlite;
let hotel: string, room: string;
const actor = "11111111-1111-4111-8111-111111111111";
beforeAll(async () => {
 db = new PGlite();
 await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table public.events(slug text primary key); insert into events values('trip');");
 await db.exec(readFileSync("supabase/migrations/20261104201624_event_lodging_catalog.sql", "utf8"));
 await db.exec(readFileSync("supabase/migrations/20261106031532_event_lodging_per_person_package.sql", "utf8"));
 hotel = (await db.query<{id:string}>(`insert into lodging_properties(name,address,timezone,updated_by) values('{"en":"Hotel","zh":"酒店"}','Road','UTC','${actor}') returning id`)).rows[0].id;
 room = (await db.query<{id:string}>(`insert into lodging_room_types(property_id,name,beds,max_guests,updated_by) values('${hotel}','{"en":"Loft","zh":"阁楼"}','{"en":"Beds","zh":"床"}',4,'${actor}') returning id`)).rows[0].id;
},30000);
afterAll(async () => { await db.close(); });
it("records the authenticated actor and changes in an audit row", async () => {
 await db.exec(`update lodging_properties set address='New Road',version=version+1 where id='${hotel}'`);
 const r = await db.query<{actor:string,old_row:{address:string},new_row:{address:string}}>("select actor,old_row,new_row from lodging_catalog_audit where old_row is not null");
 expect(r.rows[0]).toMatchObject({ actor, old_row:{address:"Road"},new_row:{address:"New Road"} });
});
it.each(["anon","authenticated"])("denies direct catalog and audit access to %s", async role => {
 await db.exec(`set role ${role}`);
 try { await expect(db.query("select * from lodging_properties")).rejects.toThrow(); await expect(db.query("select * from lodging_catalog_audit")).rejects.toThrow(); }
 finally { await db.exec("reset role"); }
});
it("rejects invalid bilingual and timezone data", async () => {
 for(const name of ['{}','{"en":null,"zh":"好"}','{"en":" ","zh":"好"}']) await expect(db.query("insert into lodging_properties(name,address,timezone,updated_by) values($1,'Road','UTC',$2)",[name,actor])).rejects.toThrow();
 await expect(db.query("insert into lodging_properties(name,address,timezone,updated_by) values($1,'Road','Bad/Zone',$2)",['{"en":"H","zh":"好"}',actor])).rejects.toThrow();
});
it("cannot turn draft offers into live sales", async () => {
 const sql = `insert into event_lodging_offers(event_slug,room_type_id,check_in,check_out,nightly_amount,mandatory_fee,tax_basis_points,policy,sales_enabled,updated_by) values('trip','${room}','2027-01-01','2027-01-03',10000,0,0,'{"en":"Terms","zh":"条款"}',true,'${actor}')`;
 await expect(db.exec(sql)).rejects.toThrow();
});
it("restricts removal of hotels with existing room types", async () => { await expect(db.exec(`delete from lodging_properties where id='${hotel}'`)).rejects.toThrow(); });
it("keeps legacy hotel estimates separate from explicit per-person package prices", async () => {
 const inserted = await db.query<{id:string;package_amount:number|null}>(`insert into event_lodging_offers(event_slug,room_type_id,check_in,check_out,nightly_amount,mandatory_fee,tax_basis_points,policy,updated_by)
 values('trip',$1,'2027-02-01','2027-02-03',10000,2000,1000,'{"en":"Terms","zh":"条款"}',$2) returning id,package_amount`, [room,actor]);
 expect(inserted.rows[0].package_amount).toBeNull();
 const id = inserted.rows[0].id;
 await db.query("update event_lodging_offers set package_amount=39900,version=version+1 where id=$1",[id]);
 const audit = (await db.query<{actor:string;new_row:{package_amount:number;sales_enabled:boolean}}>("select actor,new_row from lodging_catalog_audit where entity_id=$1 and old_row is not null",[id])).rows[0];
 expect(audit).toMatchObject({actor,new_row:{package_amount:39900,sales_enabled:false}});
 for (const price of [-1,0,100000001]) await expect(db.query("update event_lodging_offers set package_amount=$1 where id=$2",[price,id])).rejects.toThrow();
});
it.each(["anon","authenticated"])("denies direct package price reads and changes to %s", async role => {
 await db.exec(`set role ${role}`);
 try {
  await expect(db.query("select package_amount from event_lodging_offers")).rejects.toThrow();
  await expect(db.query("update event_lodging_offers set package_amount=1")).rejects.toThrow();
 } finally { await db.exec("reset role"); }
});
