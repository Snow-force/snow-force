import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const sql=readFileSync("supabase/migrations/20261001073705_shop_after_sales_requests.sql","utf8").toLowerCase();
describe("private request ledger migration",()=>{
 it("leaves native Medusa and existing auth/public tables intact",()=>{
   expect(sql).toContain("create table commerce.snowforce_after_sales");expect(sql).toContain('references commerce."order"(id)');expect(sql).not.toMatch(/(?:alter|drop) table (?:public|auth)\./);expect(sql).not.toMatch(/security definer|create role|alter role/);
 });
 it("keeps customer APIs out of private tables and uses the approved commerce role",()=>{
   expect(sql).toContain("owner to snowforce_commerce");expect(sql).toContain("enable row level security");expect(sql).toContain("from public, anon, authenticated, service_role");expect(sql).toContain("security invoker set search_path = ''");
 });
 it("serializes active requests and protects ownership, versions and audit history",()=>{
   expect(sql).toContain("create unique index snowforce_after_sales_active_order");expect(sql).toContain("new.version <> old.version + 1");expect(sql).toContain("new.member_id");expect(sql).toContain("new.history := old.history");expect(sql).toContain("invalid request transition");expect(sql).toContain("native_id text unique");
 });
});
