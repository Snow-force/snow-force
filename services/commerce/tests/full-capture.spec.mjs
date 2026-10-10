import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { BigNumber } = require("@medusajs/framework/utils");
const { assertFullCapture, useFullCaptureBoundary, assertFullCaptureGuard, fullCaptureGuardFingerprint, fullCaptureGuardBodyHash } = require("../src/lib/full-capture.ts");
const loader = require("../src/loaders/full-capture.ts").default;
const migrations = new URL("../../../supabase/migrations/", import.meta.url);
const files = readdirSync(migrations).filter(file => /^\d{14}_shop_single_full_capture\.sql$/.test(file));
assert.equal(files.length, 1);
const migration = readFileSync(new URL(files[0], migrations), "utf8");
const guardBody = migration.match(/create function commerce\.guard_single_full_stripe_capture\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/)[1];
const payment = () => ({ id: "pay_fixture", provider_id: "pp_stripe_stripe", currency_code: "usd", amount: "109.95", raw_amount: { value: "109.95" }, canceled: false, captures: [] });
const capture = { amount: "109.95", raw_amount: { value: "109.95" } };

test("full capture accepts exact original USD amounts, native BigNumbers and completed retries", () => {
  for (const body of [undefined, {}, { amount: "109.9500" }, { amount: 109.95 }, { amount: new BigNumber("109.95") }])
    assert.equal(assertFullCapture(payment(), body).amount, 10995);
  assert.equal(assertFullCapture({ ...payment(), captures: [capture] }, { amount: "109.95" }).captures.length, 1);
});
test("partial, zero, imprecise, excessive and unsupported capture amounts never pass the boundary", () => {
  for (const body of [{ amount: 100 }, { amount: 0 }, { amount: -1 }, { amount: "109.95001" }, { amount: 110 }, { amount: "NaN" }, { amount: "1e2" }, { amount: 109.95, is_captured: true }])
    assert.throws(() => assertFullCapture(payment(), body), /full original USD/);
  for (const patch of [{ canceled: true }, { currency_code: "eur" }, { provider_id: "pp_system_default" }, { raw_amount: { value: "100" } }, { amount: 0, raw_amount: { value: "0" } }, { captures: [{ ...capture, amount: 100 }] }, { captures: [{ ...capture, raw_amount: { value: "100" } }] }, { captures: [capture, capture] }])
    assert.throws(() => assertFullCapture({ ...payment(), ...patch }, {}), /full original USD/);
});
test("admin authentication and IDs are checked before private reads", async () => {
  const scope = { resolve: () => assert.fail("No private read allowed") };
  for (const auth_context of [undefined, { actor_type: "customer", actor_id: "cus_fixture" }, { actor_type: "user", actor_id: "cus_fixture" }])
    await assert.rejects(() => useFullCaptureBoundary({ auth_context, params: { id: "pay_fixture" }, scope }, {}, () => assert.fail()), /Sign in/);
  await assert.rejects(() => useFullCaptureBoundary({ auth_context: { actor_type: "user", actor_id: "user_fixture" }, params: { id: "../../payments" }, scope }, {}, () => assert.fail()), /valid payment/);
});
test("native admin middleware rejects before workflow execution and handles missing payments without writes", async () => {
  let next = 0, reads = 0, rows = [payment()];
  const scope = { resolve: () => ({ raw: async (sql, values) => { reads++; assert.ok(sql.startsWith("select ")); assert.deepEqual(values, ["pay_fixture"]); return { rows }; } }) };
  const req = { auth_context: { actor_type: "user", actor_id: "user_fixture" }, params: { id: "pay_fixture" }, scope, body: { amount: 100 } };
  await assert.rejects(() => useFullCaptureBoundary(req, {}, () => next++), /full original USD/); assert.equal(next, 0);
  await useFullCaptureBoundary({ ...req, body: {} }, {}, () => next++); assert.equal(next, 1);
  rows = []; await assert.rejects(() => useFullCaptureBoundary({ ...req, body: {} }, {}, () => next++), /not found/);
  assert.equal(next, 1); assert.equal(reads, 3);
  const unavailable = { ...req, scope: { resolve: () => ({ raw: async () => { throw new Error("postgres://private-credential@host"); } }) } };
  await assert.rejects(() => useFullCaptureBoundary(unavailable, {}, () => next++), error =>
    error.message === "Payment capture review is unavailable. Reload before retrying.");
  assert.equal(next, 1);
});
test("sales startup requires the actual enabled invoker trigger and exact reviewed function body", async () => {
  assert.equal(fullCaptureGuardFingerprint(guardBody), fullCaptureGuardBodyHash);
  const row = { tgenabled: "O", tgtype: 23, tgnargs: 0, columns: "", unconditional: true, prosrc: guardBody, prosecdef: false, proconfig: ['search_path=""'], owner: "snowforce_commerce" };
  await assertFullCaptureGuard({ resolve: () => ({ raw: async () => ({ rows: [row] }) }) });
  for (const rows of [[], [{ ...row, tgenabled: "D" }], [{ ...row, tgtype: 21 }], [{ ...row, tgnargs: 1 }], [{ ...row, columns: "2" }], [{ ...row, unconditional: false }], [{ ...row, proconfig: null }], [{ ...row, prosrc: "begin return new; end" }], [{ ...row, prosecdef: true }], [{ ...row, owner: "postgres" }]])
    await assert.rejects(() => assertFullCaptureGuard({ resolve: () => ({ raw: async () => ({ rows }) }) }), /reviewed SnowForce/);
  const old = process.env.COMMERCE_OPERATING_MODE;
  try {
    process.env.COMMERCE_OPERATING_MODE = "management"; await loader({ container: { resolve: () => assert.fail("Management does not enable capture") } });
    process.env.COMMERCE_OPERATING_MODE = "sales";
    await assert.rejects(() => loader({ container: { resolve: () => ({ raw: async () => ({ rows: [] }) }) } }), /reviewed SnowForce/);
    await loader({ container: { resolve: () => ({ raw: async () => ({ rows: [row] }) }) } });
  }
  finally { if (old === undefined) delete process.env.COMMERCE_OPERATING_MODE; else process.env.COMMERCE_OPERATING_MODE = old; }
});
test("migration protects native capture writes without exposing a privileged function or patching dependency files", () => {
  assert.ok(migration.includes("for update")); assert.ok(migration.includes("before insert or update on commerce.capture"));
  assert.ok(migration.includes("security invoker set search_path=''"));
  assert.ok(migration.includes("from public,anon,authenticated,service_role"));
  assert.ok(!/security definer|create policy|grant .* to (anon|authenticated|service_role)/i.test(migration));
  const middleware = readFileSync(new URL("../src/api/middlewares.ts", import.meta.url), "utf8");
  assert.ok(middleware.includes('matcher: "/admin/payments/:id/capture", methods: ["POST"]'));
  assert.ok(middleware.includes("middlewares: [useFullCaptureBoundary]"));
});
