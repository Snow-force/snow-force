import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { refundFixture, operation, reversalFixture } from "./tax-refund.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { taxSaleFingerprint } = require("../../src/lib/tax-sale-contract.ts");
const { buildTaxRefundAllocation, taxRefundReversalRequest, checkedRefundSale } = require("../../src/lib/tax-refund-contract.ts");
const { checkedTaxRefundReservation } = require("../../src/lib/tax-refund-reservations.ts");
export function refundOutboxFixture(options) {
  const f = refundFixture(options), allocation = buildTaxRefundAllocation(f.sale, f.orderLines, [], f.input, operation(0));
  const source_data = { sale: f.sale, order_lines: f.orderLines }, request = taxRefundReversalRequest(f.sale, allocation);
  f.reservation = checkedTaxRefundReservation({ id: allocation.operation_id, sequence: 1, order_id: f.sale.source.order_id,
    sale_task_id: f.sale.operation_id, case_id: operation(50), case_version: 3, native_return_id: "return_fixture", staff_id: "user_fixture",
    account_id: f.sale.source.input.account_id, livemode: false, payment_id: f.sale.source.payment_id, total_cents: allocation.total_cents,
    input: f.input, input_fingerprint: taxSaleFingerprint(f.input), source_data, source_fingerprint: taxSaleFingerprint(source_data),
    allocation, allocation_fingerprint: taxSaleFingerprint(allocation), request, request_fingerprint: taxSaleFingerprint(request),
    state: "started", first_attempt_at: f.sale.source.captured_at + 2, cancelled_at: null, cancellation_reason: null });
  const total = checkedRefundSale(f.sale).quote.amounts.total_cents, usd = cents => (cents / 100).toFixed(2);
  f.native = { id: "ref_fixture", payment_id: f.reservation.payment_id, amount: usd(allocation.total_cents), raw_amount: { value: usd(allocation.total_cents) },
    created_by: f.reservation.staff_id, created_at: f.reservation.first_attempt_at + 1,
    metadata: { snowforce_refund: { operation_id: allocation.operation_id, allocation_fingerprint: f.reservation.allocation_fingerprint } },
    provider_id: "pp_stripe_stripe", currency_code: "usd", intent_id: f.sale.source.intent_id, livemode: false, session_id: f.sale.source.session_id,
    payment_amount: usd(total), payment_raw_amount: { value: usd(total) }, captures: [{ id: f.sale.source.capture_id, amount: usd(total), raw_amount: { value: usd(total) }, created_at: f.sale.source.captured_at }] };
  f.refund = { id: "re_fixture", object: "refund", amount: allocation.total_cents, currency: "usd", status: "succeeded", created: f.native.created_at,
    payment_intent: f.sale.source.intent_id, metadata: { snowforce_operation: allocation.operation_id, snowforce_allocation: f.reservation.allocation_fingerprint,
      snowforce_order: f.reservation.order_id, snowforce_payment: f.reservation.payment_id } };
  f.intent = { id: f.sale.source.intent_id, object: "payment_intent", currency: "usd", status: "succeeded", livemode: false,
    amount: total, amount_received: total, amount_capturable: 0, metadata: { session_id: f.sale.source.session_id } };
  f.reversal = reversalFixture(f.sale, allocation, request);
  f.state = { now: (f.sale.source.captured_at + 12) * 1000, task: null, funds: null, results: [], calls: [], writes: 0, failure: null };
  const clone = structuredClone, joined = () => ({ ...clone(f.state.task), reservation: clone(f.reservation), funds: clone(f.state.funds.snapshot), database_now: f.state.now });
  const fenced = values => values.includes(f.state.task.claim_token) && f.state.task.state === "running" && f.state.task.lease_until > f.state.now;
  const db = { transaction: async action => { const saved = clone(f.state); try { return await action(db); } catch (error) { Object.assign(f.state, saved); throw error; } }, raw: async (sql, values = []) => {
    f.state.calls.push(sql); let rows = [];
    if (f.state.failure && sql.startsWith(f.state.failure)) throw Error("Fixture database fault");
    if (sql.startsWith('select id from commerce."order"')) rows = [{}];
    else if (sql.includes("from commerce.snowforce_refund_allocations")) rows = [f.reservation];
    else if (sql.includes("from commerce.refund r")) rows = [f.native];
    else if (sql.startsWith("select floor(extract(epoch from clock_timestamp())")) rows = [{ database_now: sql.includes("*1000") ? f.state.now : Math.floor(f.state.now / 1000) }];
    else if (sql.includes("from commerce.snowforce_refund_tax_tasks t")) {
      if (f.state.task) {
        const t = f.state.task;
        const eligible = sql.includes("skip locked") ? (["queued", "retry"].includes(t.state) && t.next_attempt_at <= f.state.now || t.state === "running" && t.lease_until <= f.state.now)
          : sql.includes("t.claim_token=?") ? fenced(values) : sql.includes("t.state<>'ready'") ? t.state !== "ready" && (!t.lease_until || t.lease_until <= f.state.now) : true;
        if (eligible) rows = [joined()];
      }
    } else if (sql.startsWith("insert into commerce.snowforce_refund_funds")) {
      f.state.funds = { snapshot: JSON.parse(values[7]), fingerprint: values[8] }; f.state.writes++;
    } else if (sql.startsWith("insert into commerce.snowforce_refund_tax_tasks")) {
      f.state.task = { id: values[0], allocation_fingerprint: values[1], funds_fingerprint: values[2], request_fingerprint: values[3], state: "queued", remote_id: null,
        attempts: 0, claim_token: null, lease_until: null, first_attempt_at: null, next_attempt_at: f.state.now }; f.state.writes++;
    } else if (sql.startsWith("update commerce.snowforce_refund_tax_tasks")) {
      const t = f.state.task; assert.ok(t);
      if (sql.includes("state='running',claim_token=")) Object.assign(t, { state: "running", claim_token: values[0], lease_until: f.state.now + 180000, first_attempt_at: t.first_attempt_at ?? f.state.now, attempts: t.attempts + 1 });
      else if (sql.includes("error_code='request_aged'")) Object.assign(t, { state: "reconcile_required", error_code: "request_aged", claim_token: null, lease_until: null });
      else if (sql.includes("set remote_id=")) { if (fenced(values) && (!t.remote_id || t.remote_id === values[0])) { t.remote_id = values[0]; rows = [{ id: t.id }]; } }
      else if (sql.includes("state='ready'")) { if (fenced(values)) { t.state = "ready"; t.claim_token = t.lease_until = null; rows = [{ id: t.id }]; } }
      else if (sql.includes("set state=?")) { if (fenced(values)) { Object.assign(t, { state: values[0], error_code: values[1], next_attempt_at: f.state.now + values[2] * 1000, claim_token: null, lease_until: null }); rows = [{ id: t.id }]; } }
      else assert.fail(`Unexpected task update ${sql}`);
    } else if (sql.startsWith("insert into commerce.snowforce_refund_tax_results")) f.state.results.push({ transaction_id: values[3], snapshot: JSON.parse(values[4]), resolution: JSON.parse(values[5]) });
    else assert.fail(`Unexpected tax-refund query ${sql}`);
    return { rows: clone(rows) };
  } };
  f.db = db; f.scope = { resolve: () => db }; f.posts = []; f.remoteReads = [];
  f.provider = { livemode: false, account: async () => ({ id: f.reservation.account_id }), intent: async () => clone(f.intent), refund: async () => clone(f.refund),
    create: async (request, key) => { f.posts.push(clone({ request, key })); if (f.createFailure) throw f.createFailure; return clone(f.reversal.transaction); },
    retrieve: async id => { f.remoteReads.push(id); if (f.readFailure) throw Error("Fixture unavailable"); return clone(f.reversal.transaction); },
    lines: async (id, cursor) => f.pages ? f.pages(id, cursor) : { object: "list", has_more: false, data: clone(f.reversal.lines) },
  };
  return f;
}
