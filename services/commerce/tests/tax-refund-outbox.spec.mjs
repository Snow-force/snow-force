import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import Stripe from "stripe";
import { refundOutboxFixture } from "./fixtures/tax-refund-outbox.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const funds = require("../src/lib/tax-refund-funds.ts"), ledger = require("../src/lib/tax-refund-ledger.ts"), worker = require("../src/lib/tax-refund-worker.ts");
const staff = { actor_type: "user", actor_id: "user_fixture" };
const inspect = f => funds.inspectTaxRefundFunds(f.scope, f.reservation.id, f.native.id, f.refund.id, f.provider);
async function prepared(options) { const f = refundOutboxFixture(options); f.task = await worker.enqueueSucceededTaxRefund(f.scope, f.reservation.id, f.native.id, f.refund.id, f.provider); return f; }
test("successful funds proof binds exact native cents, immutable capture, account, environment and the individual Stripe refund", async () => {
  const f = refundOutboxFixture(), proof = await inspect(f);
  assert.equal(proof.total_cents, 1052); assert.equal(proof.native.amount, 1052); assert.equal(proof.native.raw_amount.value, 1052);
  assert.equal(proof.refund.status, "succeeded"); assert.equal(proof.stripe_refund_id, f.refund.id);
  assert.deepEqual(funds.checkedTaxRefundFunds(f.reservation, proof), proof); assert.equal(f.state.writes, 0); assert.equal(f.posts.length, 0);
  f.refund.payment_intent = { id: f.sale.source.intent_id }; assert.equal((await inspect(f)).refund.payment_intent, f.sale.source.intent_id);
});
test("malformed IDs and unauthorized reconciliation reject before dependencies", async () => {
  const scope = { resolve: () => assert.fail() }, f = refundOutboxFixture();
  for (const args of [["bad", "ref_fixture", "re_fixture"], [f.reservation.id, "re_foreign", "re_fixture"], [f.reservation.id, "ref_fixture", "../refund"]])
    await assert.rejects(() => funds.inspectTaxRefundFunds(scope, ...args));
  for (const auth of [undefined, { actor_type: "customer", actor_id: "cus_owner" }, { actor_type: "user", actor_id: "cus_owner" }])
    await assert.rejects(() => worker.reconcileTaxRefund(scope, auth, f.reservation.id, { transaction_id: "tax_reversal" }));
  for (const [id, body] of [["bad", { transaction_id: "tax_reversal" }], [f.reservation.id, { transaction_id: "tax_reversal", amount: 1 }]])
    await assert.rejects(() => worker.reconcileTaxRefund(scope, staff, id, body));
});
test("native metadata, reviewer, capture, raw values and chronology must still match before provider reads", async () => {
  for (const change of [f => f.native.amount = "10.53", f => f.native.raw_amount.value = "10.53", f => f.native.amount = "10.5201",
    f => f.native.metadata.snowforce_refund.operation_id = "123e4567-e89b-42d3-a456-426614174099", f => f.native.metadata.snowforce_refund.allocation_fingerprint = "f".repeat(64),
    f => f.native.created_by = "user_other", f => f.native.created_at = f.sale.source.captured_at, f => f.native.payment_id = "pay_other",
    f => f.native.intent_id = "pi_other", f => f.native.session_id = "payses_other", f => f.native.livemode = true,
    f => f.native.payment_raw_amount.value = "1", f => f.native.captures[0].id = "cap_other", f => f.native.captures[0].raw_amount.value = "1",
    f => f.native.captures[0].created_at++, f => f.reservation.state = "reserved"]) {
    const f = refundOutboxFixture(); change(f); f.provider.account = async () => assert.fail("Native mismatch must prevent provider reads");
    await assert.rejects(() => inspect(f)); assert.equal(f.state.writes, 0);
  }
});
test("pending, action-required, failed, cancelled and mismatched refunds cannot enqueue a tax reversal", async () => {
  for (const change of [f => f.refund.status = "pending", f => f.refund.status = "requires_action", f => f.refund.status = "failed", f => f.refund.status = "canceled",
    f => f.refund.amount++, f => f.refund.currency = "eur", f => f.refund.id = "re_other", f => f.refund.payment_intent = "pi_other",
    f => f.refund.created = f.reservation.first_attempt_at - 1, f => f.refund.created = f.state.now / 1000 + 1,
    f => f.refund.metadata.snowforce_order = "order_other", f => f.refund.metadata.snowforce_payment = "pay_other", f => f.refund.metadata.snowforce_allocation = "f".repeat(64),
    f => f.provider.livemode = true, f => f.provider.account = async () => ({ id: "acct_other" }), f => f.intent.amount_received--, f => f.intent.status = "requires_capture"]) {
    const f = refundOutboxFixture(); change(f); await assert.rejects(() => worker.enqueueSucceededTaxRefund(f.scope, f.reservation.id, f.native.id, "re_fixture", f.provider));
    assert.equal(f.state.funds, null); assert.equal(f.state.task, null); assert.equal(f.posts.length, 0);
  }
});
test("funds and tax task persist atomically, and a repeated fresh observation recovers the same immutable task", async () => {
  const f = await prepared(), fingerprint = f.state.task.funds_fingerprint; f.state.now += 3000;
  const task = await worker.enqueueSucceededTaxRefund(f.scope, f.reservation.id, f.native.id, f.refund.id, f.provider);
  assert.equal(task.id, f.task.id); assert.equal(task.funds_fingerprint, fingerprint); assert.equal(f.state.writes, 2); assert.equal(f.posts.length, 0);
  const g = refundOutboxFixture(); g.state.failure = "insert into commerce.snowforce_refund_tax_tasks";
  await assert.rejects(() => worker.enqueueSucceededTaxRefund(g.scope, g.reservation.id, g.native.id, g.refund.id, g.provider));
  assert.equal(g.state.funds, null); assert.equal(g.state.task, null); assert.equal(g.state.writes, 0);
});
test("stale or changed local money evidence cannot commit even after a successful provider read", async () => {
  const f = refundOutboxFixture(), proof = await inspect(f); f.state.now += 120001;
  await assert.rejects(() => ledger.enqueueTaxRefund(f.db, f.reservation, proof)); assert.equal(f.state.funds, null);
  const g = refundOutboxFixture(), proof2 = await inspect(g); g.native.raw_amount.value = "1";
  await assert.rejects(() => ledger.enqueueTaxRefund(g.db, g.reservation, proof2)); assert.equal(g.state.funds, null);
});
test("the worker records one specific-item tax reversal after successful current funds checks", async () => {
  const f = await prepared(); assert.equal((await worker.processTaxRefund(f.scope, f.provider)).status, "ready");
  assert.equal(f.posts.length, 1); assert.equal(f.posts[0].key, `snowforce-tax-refund:${f.task.id}`); assert.deepEqual(f.posts[0].request, f.reservation.request);
  assert.equal(f.state.results.length, 1); assert.equal(f.state.results[0].snapshot.total_cents, 1052); assert.equal(f.state.task.state, "ready");
  assert.equal(await worker.processTaxRefund(f.scope, f.provider), null);
});
test("an unknown create response retries the identical fixed key and payload after restart", async () => {
  const f = await prepared(); f.createFailure = Error("Fixture lost response");
  assert.equal((await worker.processTaxRefund(f.scope, f.provider)).status, "retry"); assert.equal(f.state.task.remote_id, null);
  f.createFailure = null; f.state.now += 180000;
  assert.equal((await worker.processTaxRefund(f.scope, f.provider)).status, "ready"); assert.equal(f.posts.length, 2); assert.deepEqual(f.posts[0], f.posts[1]);
});
test("a saved remote ID uses GET recovery after the posting window, while a long-unknown ID cannot post again", async () => {
  const f = await prepared(); f.readFailure = true;
  assert.equal((await worker.processTaxRefund(f.scope, f.provider)).status, "retry"); assert.equal(f.state.task.remote_id, "tax_reversal");
  f.state.now += 2 * 86400000; f.readFailure = false;
  assert.equal((await worker.processTaxRefund(f.scope, f.provider)).status, "ready"); assert.equal(f.posts.length, 1);
  const g = await prepared(); g.createFailure = Error("Lost response"); await worker.processTaxRefund(g.scope, g.provider); g.state.now += 22 * 3600000;
  assert.equal(await worker.processTaxRefund(g.scope, g.provider), null); assert.equal(g.state.task.state, "reconcile_required"); assert.equal(g.state.task.error_code, "request_aged"); assert.equal(g.posts.length, 1);
});
test("expired or replaced claims cannot submit, remember an ID, defer or commit tax work", async () => {
  const f = await prepared(), claim = await ledger.claimTaxRefund(f.db); f.state.now += 180001;
  await assert.rejects(() => ledger.assertTaxRefundLease(f.db, claim, true)); await assert.rejects(() => ledger.rememberTaxRefundId(f.db, claim, "tax_reversal"));
  const replacement = await ledger.claimTaxRefund(f.db); assert.notEqual(replacement.claim_token, claim.claim_token);
  await assert.rejects(() => ledger.deferTaxRefund(f.db, claim, "provider_unavailable"));
  await assert.rejects(() => ledger.completeTaxRefund(f.db, claim, f.reversal)); assert.equal(f.state.results.length, 0);
});
test("a refund changing after enqueue blocks tax POST, and changing during processing blocks completion", async () => {
  for (const change of [f => f.refund.status = "failed", f => f.native.amount = "1", f => f.intent.livemode = true]) {
    const f = await prepared(); change(f); assert.equal((await worker.processTaxRefund(f.scope, f.provider)).status, "reconcile_required"); assert.equal(f.posts.length, 0);
  }
  const f = await prepared(), create = f.provider.create;
  f.provider.create = async (...args) => { const result = await create(...args); f.refund.status = "failed"; return result; };
  assert.equal((await worker.processTaxRefund(f.scope, f.provider)).status, "reconcile_required"); assert.equal(f.state.results.length, 0); assert.equal(f.posts.length, 1);
});
test("tax reversal association, chronology, header and line mismatches stop without committing or replaying POST", async () => {
  for (const change of [f => f.reversal.transaction.reference = "foreign", f => f.reversal.transaction.reversal.original_transaction = "tax_other",
    f => f.reversal.transaction.created = f.refund.created - 1, f => f.reversal.transaction.posted_at = f.refund.created - 1,
    f => f.reversal.lines[0].amount++, f => f.reversal.lines[0].amount_tax--, f => f.reversal.lines[0].quantity++]) {
    const f = await prepared(); change(f);
    assert.equal((await worker.processTaxRefund(f.scope, f.provider)).status, "reconcile_required"); assert.equal(f.state.results.length, 0); assert.equal(f.posts.length, 1);
    assert.equal(await worker.processTaxRefund(f.scope, f.provider), null);
  }
});
test("all line pages are required; stuck pages, missing lines and duplicates cannot complete", async () => {
  const f = await prepared(); f.pages = (_id, cursor) => cursor ? { object: "list", has_more: false, data: [] } : { object: "list", has_more: true, data: f.reversal.lines };
  assert.equal((await worker.processTaxRefund(f.scope, f.provider)).status, "ready");
  for (const pages of [() => ({ object: "list", has_more: true, data: [] }), () => ({ object: "list", has_more: false, data: [] }),
    g => ({ object: "list", has_more: true, data: g.reversal.lines }), g => ({ object: "list", has_more: false, data: [...g.reversal.lines, ...g.reversal.lines] })]) {
    const g = await prepared(); g.pages = () => pages(g);
    assert.equal((await worker.processTaxRefund(g.scope, g.provider)).status, "reconcile_required"); assert.equal(g.state.results.length, 0);
  }
});
test("staff reconciliation always uses GET only and failures never re-enable creation", async () => {
  const f = await prepared(); f.state.task.state = "reconcile_required";
  assert.equal((await worker.reconcileTaxRefund(f.scope, staff, f.task.id, { transaction_id: "tax_reversal" }, f.provider)).status, "ready");
  assert.equal(f.posts.length, 0); assert.equal(f.state.results[0].resolution.staff_id, "user_fixture");
  const g = await prepared(); g.state.task.state = "reconcile_required"; g.readFailure = true;
  assert.equal((await worker.reconcileTaxRefund(g.scope, staff, g.task.id, { transaction_id: "tax_reversal" }, g.provider)).status, "reconcile_required");
  assert.equal(await worker.processTaxRefund(g.scope, g.provider), null); assert.equal(g.posts.length, 0);
});
test("a database failure at final commit rolls back its result; known remote identity recovers by GET", async () => {
  const f = await prepared(); f.state.failure = "update commerce.snowforce_refund_tax_tasks set state='ready'";
  assert.equal((await worker.processTaxRefund(f.scope, f.provider)).status, "retry"); assert.equal(f.state.results.length, 0); assert.equal(f.state.task.remote_id, "tax_reversal");
  f.state.failure = null; f.state.now += 180000;
  assert.equal((await worker.processTaxRefund(f.scope, f.provider)).status, "ready"); assert.equal(f.posts.length, 1);
});
test("missing protected configuration defers durably, and an empty queue makes no client", async () => {
  const original = process.env.COMMERCE_STRIPE_API_KEY; delete process.env.COMMERCE_STRIPE_API_KEY;
  try { const f = await prepared(); assert.equal((await worker.processTaxRefund(f.scope)).status, "retry"); assert.equal(f.state.task.state, "retry");
    assert.equal(await worker.processTaxRefund(refundOutboxFixture().scope), null);
  } finally { if (original === undefined) delete process.env.COMMERCE_STRIPE_API_KEY; else process.env.COMMERCE_STRIPE_API_KEY = original; }
});
test("outbox migration keeps funds, task identities and reversal results private and immutable", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261009170338_shop_refund_tax_outbox.sql", import.meta.url), "utf8");
  for (const part of ["security invoker set search_path=''", "from public,anon,authenticated,service_role", "enable row level security", "snapshot->'refund'->>'status'='succeeded'",
    "for update of p,r", "old.state='ready'", "verified immutable funds"]) {
    assert.ok(sql.includes(part), part);
  }
  assert.ok(!sql.includes("security definer")); assert.ok(!sql.includes("create policy"));
});

test("installed SDK adapter uses current-account and specific refund GETs, fixed reversal key and complete line pagination parameters", async () => {
  const f = refundOutboxFixture(), calls = [];
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    calls.push({ method: req.method, url: req.url, body: new URLSearchParams(body), key: req.headers["idempotency-key"], version: req.headers["stripe-version"] });
    const response = req.url === "/v1/account" ? { id: f.reservation.account_id }
      : req.url.startsWith("/v1/payment_intents/") ? f.intent : req.url.startsWith("/v1/refunds/") ? f.refund
      : req.url.includes("/line_items") ? { object: "list", has_more: false, data: f.reversal.lines } : f.reversal.transaction;
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify(response));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const sdk = new Stripe("sk_test_localfixture", { host: "127.0.0.1", port: server.address().port, protocol: "http", apiVersion: "2026-09-30.endive", maxNetworkRetries: 0 });
    const provider = worker.createTaxRefundProvider(sdk, false);
    assert.equal((await provider.account()).id, f.reservation.account_id);
    assert.equal((await provider.intent(f.intent.id)).id, f.intent.id);
    assert.equal((await provider.refund(f.refund.id)).status, "succeeded");
    await provider.create(f.reservation.request, `snowforce-tax-refund:${f.reservation.id}`);
    await provider.retrieve("tax_reversal"); await provider.lines("tax_reversal", "tax_li_reversal0");
    assert.deepEqual(calls.slice(0, 3).map(call => [call.method, call.url]), [["GET", "/v1/account"], ["GET", `/v1/payment_intents/${f.intent.id}`], ["GET", `/v1/refunds/${f.refund.id}`]]);
    const post = calls[3]; assert.equal(post.method, "POST"); assert.equal(post.url, "/v1/tax/transactions/create_reversal");
    assert.equal(post.key, `snowforce-tax-refund:${f.reservation.id}`); assert.equal(post.body.get("line_items[0][amount_tax]"), "-52");
    assert.equal(post.body.get("line_items[0][original_line_item]"), "tax_li_sale0"); assert.ok(calls.every(call => call.version === "2026-09-30.endive"));
    const last = new URL(calls.at(-1).url, "http://fixture.test"); assert.equal(last.searchParams.get("limit"), "100"); assert.equal(last.searchParams.get("starting_after"), "tax_li_reversal0");
    await provider.lines("tax_reversal"); assert.equal(new URL(calls.at(-1).url, "http://fixture.test").searchParams.has("starting_after"), false);
    const count = calls.length;
    for (const action of [() => provider.intent("../intent"), () => provider.refund("../refund"), () => provider.retrieve("../transaction"),
      () => provider.create(f.reservation.request, `foreign:${f.reservation.id}`),
      () => provider.create({ ...f.reservation.request, mode: "full" }, `snowforce-tax-refund:${f.reservation.id}`),
      () => provider.create({ ...f.reservation.request, metadata: {} }, `snowforce-tax-refund:${f.reservation.id}`)]) assert.throws(action);
    assert.equal(calls.length, count);
  } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test("provider factories require protected Stripe credentials and explicit injected environment", () => {
  const original = process.env.COMMERCE_STRIPE_API_KEY;
  try {
    for (const key of [undefined, "pk_test_fixture", "rk_test_bad-key"]) {
      if (key === undefined) delete process.env.COMMERCE_STRIPE_API_KEY; else process.env.COMMERCE_STRIPE_API_KEY = key;
      assert.throws(() => funds.createTaxRefundFundsReader()); assert.throws(() => worker.createTaxRefundProvider());
    }
    for (const [key, live] of [["rk_test_localfixture", false], ["rk_live_localfixture", true]]) {
      process.env.COMMERCE_STRIPE_API_KEY = key;
      assert.equal(funds.createTaxRefundFundsReader().livemode, live); assert.equal(worker.createTaxRefundProvider().livemode, live);
    }
    assert.throws(() => worker.createTaxRefundProvider({}));
  } finally { if (original === undefined) delete process.env.COMMERCE_STRIPE_API_KEY; else process.env.COMMERCE_STRIPE_API_KEY = original; }
});

test("staff reconciliation cannot replace a saved tax identity or resume creation without protected configuration", async () => {
  const f = await prepared(); f.state.task.state = "reconcile_required"; f.state.task.remote_id = "tax_known";
  assert.equal((await worker.reconcileTaxRefund(f.scope, staff, f.task.id, { transaction_id: "tax_foreign" }, f.provider)).status, "reconcile_required");
  assert.equal(f.posts.length, 0); assert.equal(f.remoteReads.length, 0); assert.equal(f.state.task.remote_id, "tax_known");
  const original = process.env.COMMERCE_STRIPE_API_KEY; delete process.env.COMMERCE_STRIPE_API_KEY;
  try {
    const g = await prepared(); g.state.task.state = "reconcile_required";
    assert.equal((await worker.reconcileTaxRefund(g.scope, staff, g.task.id, { transaction_id: "tax_reversal" })).status, "reconcile_required");
    assert.equal(g.posts.length, 0); assert.equal(await worker.processTaxRefund(g.scope, g.provider), null);
  } finally { if (original === undefined) delete process.env.COMMERCE_STRIPE_API_KEY; else process.env.COMMERCE_STRIPE_API_KEY = original; }
});
