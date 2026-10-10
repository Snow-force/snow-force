// Fixed loopback-only disposable database. Actual Medusa order migrations and
// native order changes, with fixture committed tax-sale tables and no provider.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { refundFixture, reversalFixture } from "../tests/fixtures/tax-refund.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { Client } = require("pg"), { MedusaApp, MedusaModule } = require("@medusajs/framework/modules-sdk");
const { Modules, ModulesSdkUtils } = require("@medusajs/framework/utils");
const { checkedTaxSaleSource, taxSaleFingerprint, taxSaleRequest } = require("../src/lib/tax-sale-contract.ts");
const { nativeTaxQuotePlan } = require("../src/lib/tax-quote-money.ts");
const { readTaxRefundSource } = require("../src/lib/tax-refund-source.ts");
const { buildTaxRefundAllocation, taxRefundReversalRequest, assertTaxRefundReversal } = require("../src/lib/tax-refund-contract.ts");
const database = `sf_refund_validation_${randomUUID().replaceAll("-", "")}`;
assert.match(database, /^sf_refund_validation_[a-f0-9]{32}$/);
const connection = { host: "127.0.0.1", port: 15432, user: "capture_test", database, connectionTimeoutMillis: 5000 };
const admin = new Client({ ...connection, database: "postgres" });
let db, knex, app, created = false;
try {
  await admin.connect(); await admin.query(`create database "${database}"`); created = true;
  db = new Client(connection); await db.connect(); await db.query("create schema commerce");
  const newPool = () => ModulesSdkUtils.createPgConnection({ clientUrl: `postgres://capture_test@127.0.0.1:15432/${database}`, schema: "commerce", pool: { min: 0, max: 3 } });
  knex = newPool();
  const options = () => ({ cwd: process.cwd(), sharedResourcesConfig: { database: { connection: knex, clientUrl: `postgres://capture_test@127.0.0.1:15432/${database}`, schema: "commerce" } }, modulesConfig: { [Modules.ORDER]: { resolve: "@medusajs/order" } } });
  const migrationApp = await MedusaApp({ ...options(), migrationOnly: true });
  await migrationApp.runMigrations(); await migrationApp.onApplicationShutdown(); MedusaModule.clearInstances(); knex = newPool();
  app = await MedusaApp(options()); const orderModule = app.modules[Modules.ORDER];
  const f = refundFixture({ duplicateSku: true });
  const { quote } = checkedTaxSaleSource(f.sale.source), native = nativeTaxQuotePlan(quote);
  const order = await orderModule.createOrders({ currency_code: "usd", customer_id: f.sale.source.customer_id,
    items: native.items.map((item, index) => ({ title: f.sale.source.input.lines[index].title, variant_id: f.sale.source.input.lines[index].variant_id,
      quantity: item.quantity, unit_price: item.unit_price, is_tax_inclusive: false, adjustments: item.adjustments,
      tax_lines: item.tax_lines.map(tax => ({ ...tax, provider_id: "snowforce_stripe_tax", metadata: { quote_id: f.sale.source.quote_id, cart_line_id: item.id } })) })) });
  f.sale.source.order_id = order.id;
  // Ledger shape is a fixture, not an assertion about the production outbox migration.
  await db.query(`create table commerce.snowforce_tax_sale_tasks(id uuid primary key,order_id text,source jsonb,source_fingerprint text,request jsonb,request_fingerprint text,state text);
    create table commerce.snowforce_tax_sales(task_id uuid,order_id text,account_id text,livemode boolean,transaction_id text,snapshot jsonb)`);
  const request = taxSaleRequest(f.sale.source, f.sale.operation_id);
  f.sale.snapshot.transaction.metadata.snowforce_order = order.id;
  await db.query("insert into commerce.snowforce_tax_sale_tasks values($1,$2,$3,$4,$5,$6,'ready')", [f.sale.operation_id, order.id, f.sale.source, taxSaleFingerprint(f.sale.source), request, taxSaleFingerprint(request)]);
  await db.query("insert into commerce.snowforce_tax_sales values($1,$2,$3,$4,$5,$6)", [f.sale.operation_id, order.id, f.sale.source.input.account_id, false, f.sale.snapshot.transaction.id, f.sale.snapshot]);
  const scope = { resolve: () => ({ raw: (sql, values) => knex.raw(sql, values) }) }, read = () => readTaxRefundSource(scope, order.id, async () => f.sale.source);
  const original = await read(); assert.equal(original.bindings.length, 2);
  const item = original.bindings.find(value => value.cart_line_id === "cali_sale"); assert.ok(item);
  const input = { ...f.input, items: [{ item_id: item.item_id, quantity: 1 }] }, history = [];
  for (let index = 0; index < 3; index++) history.push(buildTaxRefundAllocation(original.sale, original.order_lines, history, input, randomUUID()));
  assert.deepEqual(history.map(value => value.total_cents), [1052, 1051, 1050]);
  const change = await orderModule.createOrderChange({ order_id: order.id });
  await orderModule.addOrderAction({ order_id: order.id, order_change_id: change.id, action: "ITEM_UPDATE", reference: "order_item", reference_id: item.item_id,
    details: { reference_id: item.item_id, quantity: 3, unit_price: 11 } });
  await orderModule.confirmOrderChange(change.id);
  const version = (await db.query('select version from commerce."order" where id=$1', [order.id])).rows[0].version; assert.equal(version, 2);
  const edited = (await db.query("select unit_price from commerce.order_item where order_id=$1 and item_id=$2 and version=2", [order.id, item.item_id])).rows;
  assert.equal(edited.length, 1); assert.equal(Number(edited[0].unit_price), 11);
  const afterChange = await read(); assert.deepEqual(afterChange.bindings, original.bindings);
  for (const allocation of history) { const request = taxRefundReversalRequest(original.sale, allocation), remote = reversalFixture(original.sale, allocation, request); assertTaxRefundReversal(original.sale, allocation, remote.transaction, remote.lines); }
  const report = { checkedAt: new Date().toISOString(), status: "passed", postgres: (await db.query("show server_version")).rows[0].server_version,
    medusa: require("@medusajs/order/package.json").version, scope: "disposable loopback database; actual native order module/migrations; fixture tax-sale ledger and captured source; no payment provider or production mutation",
    checks: ["native order creation preserves quote markers and raw price/quantity", "actual SQL binds duplicate SKUs to original transaction lines", "sequential refunds conserve original net/tax cents", "native price edit reaches version two while refunds retain the original version-one price and bindings", "fixture specific-line tax reversals validate all allocation amounts"] };
  writeFileSync(new URL("../../../output/shop-tax-refund-native-local-verification.json", import.meta.url), JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report, null, 2));
} finally {
  if (app) await app.onApplicationShutdown(); if (knex) await knex.destroy(); if (db) await db.end();
  if (created) await admin.query(`drop database "${database}" with (force)`); await admin.end();
}
