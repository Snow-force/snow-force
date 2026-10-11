import { createRequire } from "node:module";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { newcomerPolicy, newcomerPromotion, newcomerCode } = require("../src/lib/newcomer-policy.ts");
const { claimNewcomer, newcomerEmailHash } = require("../src/lib/newcomer.ts");
const { reserveNewcomerRedemption, reserveNewcomerPayment } = require("../src/lib/newcomer-redemption.ts");
const { signMarketing } = require("../src/lib/marketing-policy.ts");
const { areRulesValidForContext } = require("../node_modules/@medusajs/promotion/dist/utils/validations/promotion-rule.js");
const { newcomerPromotionContext, evaluateNewcomerContext, assertNewcomerCartRules } = require("../src/lib/newcomer-cart-policy.ts");
const { getComputedActionsForItems } = require("../node_modules/@medusajs/promotion/dist/utils/compute-actions/line-items.js");
const { GET, POST } = require("../src/api/store/snowforce/newcomer/route.ts");
const userId = "123e4567-e89b-42d3-a456-426614174001", customerId = "cus_fixture";
const now = new Date("2026-10-11T00:00:00Z"), secret = "fixture-welcome-signing-secret-over-32";
const env = { NEWCOMER_ENABLED: "true", NEWCOMER_DISCOUNT_TYPE: "percentage", NEWCOMER_DISCOUNT_VALUE: "10", NEWCOMER_MINIMUM_USD: "0", NEWCOMER_VALID_DAYS: "30", NEWCOMER_ELIGIBILITY: "no_orders", NEWCOMER_SIGNING_SECRET: secret };
beforeEach(() => { Object.assign(process.env, env); delete process.env.NEWCOMER_REGISTERED_AFTER; process.env.COMMERCE_OPERATING_MODE = "sales"; });
const signed = (changes = {}) => signMarketing({ kind: "newcomer", userId, email: "member@example.com", createdAt: "2026-10-10T00:00:00Z", ...changes }, secret, now.getTime());
function fixture(changes = {}) {
  const input = newcomerPromotion(userId, customerId, newcomerPolicy(env), now);
  const promotion = { ...input, id: "promo_fixture", used: 0, rules: input.rules.map(rule => ({ ...rule, values: rule.values.map(value => ({ value })) })), ...changes };
  const state = { order: false, deleted: false, exists: true, memberId: userId, signal: new AbortController().signal };
  const db = { raw: async sql => {
    if (sql.includes("provider_identity")) return { rows: [{ entity_id: state.memberId }] };
    if (sql.startsWith("select id,deleted_at")) return { rows: state.exists ? [{ id: promotion.id, deleted_at: state.deleted ? now : null }] : [] };
    if (sql.startsWith("insert into commerce.snowforce_newcomer_claims")) return { rows: [] };
    if (sql.startsWith("select customer_id,code")) return { rows: [{ customer_id: customerId, code: promotion.code }] };
    if (sql.startsWith("insert into commerce.snowforce_newcomer_emails")) return { rows: [] };
    if (sql.startsWith("select status,delivery_status from commerce.snowforce_newcomer_emails")) return { rows: [{ status: "queued", delivery_status: null }] };
    if (sql.includes('commerce."order"')) return { rows: state.order ? [{ id: "order_existing" }] : [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const scope = { resolve: key => {
    if (key === "__pg_connection__") return db;
    if (key === "locking") return { execute: async (_key, operation) => operation(state.signal) };
    if (key === "promotion") return { retrievePromotion: async () => promotion };
    throw new Error(`Unexpected dependency: ${key}`);
  } };
  return { scope, state, promotion };
}
test("configuration fails closed without explicit economics, eligibility and signing", () => {
  assert.equal(newcomerPolicy({}), null);
  for (const changes of [{ NEWCOMER_DISCOUNT_VALUE: "" }, { NEWCOMER_DISCOUNT_VALUE: "101" }, { NEWCOMER_VALID_DAYS: "" }, { NEWCOMER_SIGNING_SECRET: "short" }, { NEWCOMER_ELIGIBILITY: "new_accounts" }, { NEWCOMER_DISCOUNT_TYPE: "bogus" }, { NEWCOMER_MINIMUM_USD: "-1" }, { NEWCOMER_DISCOUNT_VALUE: "0.001" }, { NEWCOMER_MINIMUM_USD: "50.001" }]) assert.equal(newcomerPolicy({ ...env, ...changes }), null);
  assert.equal(newcomerPolicy({ ...env, NEWCOMER_ELIGIBILITY: "new_accounts", NEWCOMER_REGISTERED_AFTER: now.toISOString() }).registeredAfter, now.toISOString());
});
test("uses native rules for ownership, currency and no stacking without a minimum spend", () => {
  const promotion = fixture().promotion, context = { customer_id: customerId, currency_code: "usd", snowforce_no_stacking: "true", original_item_subtotal: 0.01, item_total: 45 };
  assert.equal(areRulesValidForContext(promotion.rules, context, "order"), true);
  for (const changes of [{ customer_id: "cus_other" }, { currency_code: "eur" }, { snowforce_no_stacking: "false" }]) assert.equal(areRulesValidForContext(promotion.rules, { ...context, ...changes }, "order"), false);
  assert.equal(promotion.limit, 1); assert.equal(promotion.campaign.budget.limit, 1);
  assert.equal(promotion.campaign.ends_at.toISOString(), "2026-11-10T00:00:00.000Z");
  assert.equal(newcomerCode(userId), promotion.code); assert.notEqual(newcomerCode("123e4567-e89b-42d3-a456-426614174002"), promotion.code);
});

test("native discount computation gives 10% only to regular-price items in a mixed cart", () => {
  const promotion = fixture().promotion;
  promotion.application_method.target_rules = promotion.application_method.target_rules.map(rule => ({ ...rule, values: rule.values.map(value => ({ value })) }));
  const line = { id: "regular", unit_price: 0.1, quantity: 1, subtotal: 0.1, original_total: 0.1, adjustments: [] };
  const cart = { items: [line, { ...line, id: "sale", unit_price: 50, compare_at_unit_price: 100, subtotal: 50 }, { ...line, id: "fee", is_discountable: false }] };
  const context = newcomerPromotionContext(cart, [promotion.code], "add");
  assert.equal(context.snowforce_no_stacking, "true");
  const actions = getComputedActionsForItems(promotion, context.items, new Map());
  assert.equal(actions.length, 1); assert.equal(actions[0].item_id, "regular"); assert.equal(Number(actions[0].amount), 0.01);
  assert.equal(newcomerPromotionContext(cart, [promotion.code, "OTHER"], "add").snowforce_no_stacking, "false");
  const discounted = { ...cart, promotions: [{ code: "OTHER" }], items: [{ ...line, adjustments: [{ code: "OTHER", amount: 0.01 }] }] };
  assert.equal(newcomerPromotionContext(discounted, [promotion.code], "add").snowforce_no_stacking, "false");
  assert.equal(newcomerPromotionContext(discounted, ["OTHER"], "remove").snowforce_no_stacking, "true");
  assert.equal(newcomerPromotionContext(cart, [promotion.code], "replace").snowforce_no_stacking, "true");
});

test("payment validation rejects sale-item discounts, manual or automatic stacking and excessive amounts", () => {
  const code = newcomerCode(userId), line = { unit_price: 100, quantity: 1, adjustments: [{ code, amount: 10 }] };
  assertNewcomerCartRules({ items: [line, { unit_price: 50, compare_at_unit_price: 100, quantity: 1, adjustments: [] }] });
  for (const change of [{ compare_at_unit_price: 150 }, { is_discountable: false }, { adjustments: [{ code, amount: 20 }] }, { adjustments: [{ code }] }, { adjustments: [{ code, amount: 10 }, { code: "AUTO", amount: 2 }] }]) {
    assert.throws(() => assertNewcomerCartRules({ items: [{ ...line, ...change }] }));
  }
  assert.throws(() => assertNewcomerCartRules({ items: [line], promotions: [{ code: "OTHER" }] }));
  assert.throws(() => assertNewcomerCartRules({ items: [line], shipping_methods: [{ adjustments: [{ code, amount: 1 }] }] }));
  assert.throws(() => assertNewcomerCartRules({ items: [line], shipping_methods: [{ adjustments: [{ code: "AUTO", amount: 1 }] }] }));
  assertNewcomerCartRules({ items: [{ adjustments: [{ code: "ORDINARY", amount: 2 }] }] });
});

test("preflights automatic promotions before displaying welcome savings without mutating the cart", async () => {
  const code = newcomerCode(userId), cart = { currency_code: "usd", items: [{ unit_price: 100, quantity: 1, adjustments: [{ code, amount: 10 }] }] };
  const snapshot = structuredClone(cart); let calls = 0;
  const scope = { resolve: () => ({ computeActions: async (codes, context) => {
    calls++; assert.deepEqual(codes, []); assert.deepEqual(context.items[0].adjustments, []); assert.equal(context.snowforce_no_stacking, "false");
    return [{ action: "addItemAdjustment", amount: 5, code: "AUTO" }];
  } }) };
  assert.equal((await evaluateNewcomerContext(cart, [code], "add", scope)).snowforce_no_stacking, "false");
  assert.deepEqual(cart, snapshot); assert.equal(calls, 1);
  assert.equal((await evaluateNewcomerContext(cart, [code, "OTHER"], "add", scope)).snowforce_no_stacking, "false"); assert.equal(calls, 1);
  assert.equal((await evaluateNewcomerContext(cart, [], "add", scope)).snowforce_no_stacking, "true"); assert.equal(calls, 1);
  const available = { resolve: () => ({ computeActions: async () => [{ action: "removeItemAdjustment", code }, { action: "addItemAdjustment", amount: 0, code: "ZERO" }] }) };
  assert.equal((await evaluateNewcomerContext(cart, [code], "add", available)).snowforce_no_stacking, "true");
});

test("private Postgres claims enforce normalized email uniqueness across accounts and preserve failed-creation retries", async () => {
  const pg = new PGlite();
  try {
    await pg.exec('create schema commerce; create role snowforce_commerce; grant usage on schema commerce to snowforce_commerce; create role anon; create role authenticated; create role service_role;');
    await pg.exec(readFileSync(new URL("../../../supabase/migrations/20261011025512_newcomer_email_limits.sql", import.meta.url), "utf8"));
    await pg.exec(readFileSync(new URL("../../../supabase/migrations/20261011030617_newcomer_welcome_emails.sql", import.meta.url), "utf8"));
    const rows = new Map(), promotions = new Map();
    const scope = { resolve: key => {
      if (key === "locking") return { execute: async (_key, op) => op(new AbortController().signal) };
      if (key === "promotion") return { retrievePromotion: async id => promotions.get(id) };
      return { raw: async (sql, values) => {
        if (sql.includes("provider_identity")) return { rows: [{ entity_id: rows.get(values[0]) }] };
        if (sql.startsWith("select id,deleted_at")) return { rows: [...promotions.values()].filter(p => p.code === values[0]).map(p => ({ id: p.id, deleted_at: null })) };
        if (sql.includes('commerce."order"')) return { rows: [] };
        let index = 0; return pg.query(sql.replace(/\?/g, () => `$${++index}`), values);
      } };
    } };
    const secondId = "123e4567-e89b-42d3-a456-426614174002";
    rows.set(customerId, userId); rows.set("cus_second", secondId);
    let count = 0;
    const create = async (_scope, input) => { count++; const p = { ...input, id: input.code, used: 0, rules: input.rules.map(r => ({ ...r, values: r.values.map(value => ({ value })) })) }; promotions.set(p.id, p); return p; };
    const outcomes = await Promise.all([claimNewcomer(scope, customerId, signed({ email: "Member@Example.com" }), now, create), claimNewcomer(scope, "cus_second", signed({ userId: secondId, email: "member@example.com" }), now, create)]);
    assert.deepEqual(outcomes.map(o => o.status).sort(), ["ineligible", "ready"]); assert.equal(count, 1);
    assert.equal(newcomerEmailHash(" Member@Example.com "), newcomerEmailHash("member@example.com"));
    const owner = outcomes[0].status === "ready" ? { id: userId, customer: customerId } : { id: secondId, customer: "cus_second" };
    promotions.clear();
    await assert.rejects(claimNewcomer(scope, owner.customer, signed({ userId: owner.id }), now, async () => { throw new Error("creation failed"); }));
    assert.equal((await claimNewcomer(scope, owner.customer, signed({ userId: owner.id }), now, create)).status, "ready");
    const retained = await pg.query("select count(*)::int as count from commerce.snowforce_newcomer_claims"); assert.equal(retained.rows[0].count, 1);
    await pg.exec("set role anon"); await assert.rejects(pg.query("select * from commerce.snowforce_newcomer_claims"));
  } finally { await pg.close(); }
});
test("repeated claims return the same privately bound code, never extend expiry or reissue deleted/used codes", async () => {
  const { scope, state, promotion } = fixture();
  const first = await claimNewcomer(scope, customerId, signed(), now);
  assert.equal(first.status, "ready"); assert.equal((await claimNewcomer(scope, customerId, signed(), now)).code, first.code);
  assert.equal(first.endsAt, "2026-11-10T00:00:00.000Z");
  promotion.used = 1; assert.deepEqual(await claimNewcomer(scope, customerId, signed(), now), { status: "used" });
  state.deleted = true; assert.deepEqual(await claimNewcomer(scope, customerId, signed(), now), { status: "expired" });
});
test("refuses tampered identity, ownership, old registrations, previous orders and expired offers", async () => {
  const { scope, state, promotion } = fixture();
  await assert.rejects(claimNewcomer(scope, customerId, { ...signed(), body: "{}" }, now));
  await assert.rejects(claimNewcomer(scope, "cus_other", signed(), now));
  state.memberId = "123e4567-e89b-42d3-a456-426614174002"; await assert.rejects(claimNewcomer(scope, customerId, signed(), now)); state.memberId = userId;
  process.env.NEWCOMER_ELIGIBILITY = "new_accounts"; process.env.NEWCOMER_REGISTERED_AFTER = now.toISOString();
  assert.deepEqual(await claimNewcomer(scope, customerId, signed(), now), { status: "ineligible" });
  process.env.NEWCOMER_ELIGIBILITY = "no_orders"; state.exists = false; state.order = true;
  assert.deepEqual(await claimNewcomer(scope, customerId, signed(), now), { status: "ineligible" });
  state.exists = true; promotion.campaign.ends_at = new Date("2026-10-10");
  assert.deepEqual(await claimNewcomer(scope, customerId, signed(), now), { status: "expired" });
  promotion.campaign.ends_at = new Date("2026-12-10"); promotion.status = "inactive";
  assert.deepEqual(await claimNewcomer(scope, customerId, signed(), now), { status: "expired" });
});
test("store API hides offers in management mode and never accepts a supplied customer ID", async () => {
  let output;
  const res = { setHeader: () => {}, json: value => { output = value; } };
  process.env.COMMERCE_OPERATING_MODE = "management"; await GET({}, res); assert.deepEqual(output, { policy: null });
  process.env.NEWCOMER_ENABLED = "false"; await POST({ scope: {}, auth_context: { actor_id: customerId }, body: { customerId: "cus_other" } }, res); assert.deepEqual(output, { status: "disabled" });
});
test("creates once, preserves issued economics and recovers persisted results after a lost response", async () => {
  const { scope, state, promotion } = fixture(); state.exists = false;
  let calls = 0;
  const create = async (_scope, input) => { calls++; assert.equal(input.code, newcomerCode(userId)); assert.equal(input.application_method.value, 10); state.exists = true; return promotion; };
  assert.equal((await claimNewcomer(scope, customerId, signed(), now, create)).status, "ready");
  process.env.NEWCOMER_VALID_DAYS = "90";
  const repeat = await claimNewcomer(scope, customerId, signed(), now, create);
  assert.equal(calls, 1); assert.equal(repeat.policy.value, 10);
  state.exists = false;
  const lost = async () => { state.exists = true; throw new Error("Response lost after persistence"); };
  await assert.rejects(claimNewcomer(scope, customerId, signed(), now, lost));
  assert.equal((await claimNewcomer(scope, customerId, signed(), now, create)).code, newcomerCode(userId)); assert.equal(calls, 1);
  state.exists = false; state.signal = AbortSignal.abort();
  await assert.rejects(claimNewcomer(scope, customerId, signed(), now, create)); assert.equal(calls, 1);
});
test("Postgres atomically reserves one cart, permits its retries, rejects a second cart and expired or foreign codes", async () => {
  const pg = new PGlite();
  try {
    await pg.exec('create schema commerce; create table commerce.promotion_campaign(id text primary key,deleted_at timestamptz,starts_at timestamptz,ends_at timestamptz); create table commerce.promotion(id text primary key,code text,campaign_id text,status text,"limit" int,used int,metadata jsonb,deleted_at timestamptz);');
    await pg.exec("insert into commerce.promotion_campaign values ('pcamp_fixture',null,now()-interval '1 day',now()+interval '30 days');");
    await pg.query("insert into commerce.promotion values ('promo_fixture',$1,'pcamp_fixture','active',1,0,$2,null)", [newcomerCode(userId), { snowforce_newcomer: "v1", snowforce_customer_id: customerId }]);
    const scope = { resolve: () => ({ raw: (sql, values) => { let i = 0; return pg.query(sql.replace(/\?/g, () => `$${++i}`), values); } }) };
    const initial = { items: [{ unit_price: 100, quantity: 1, adjustments: [{ code: newcomerCode(userId), amount: 10 }] }] };
    const first = { id: "cart_first", customer_id: customerId }, second = { id: "cart_second", customer_id: customerId };
    const outcomes = await Promise.allSettled([reserveNewcomerRedemption(initial, first, scope), reserveNewcomerRedemption(initial, second, scope)]);
    assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 1);
    const winner = outcomes[0].status === "fulfilled" ? first : second, loser = winner === first ? second : first;
    await reserveNewcomerRedemption(initial, winner, scope); await assert.rejects(reserveNewcomerRedemption(initial, loser, scope));
    await assert.rejects(reserveNewcomerRedemption(initial, { ...winner, customer_id: "cus_other" }, scope));
    await pg.exec("update commerce.promotion set used=1;"); await reserveNewcomerRedemption(initial, winner, scope);
    await assert.rejects(reserveNewcomerRedemption(initial, loser, scope));
    await pg.exec("update commerce.promotion_campaign set ends_at=now()-interval '1 day';");
    // An already-started checkout may finish after expiry; a new payment may not start.
    await reserveNewcomerRedemption(initial, winner, scope);
    await assert.rejects(reserveNewcomerRedemption(initial, winner, scope, "payment"));
    await assert.rejects(reserveNewcomerRedemption(initial, loser, scope));
    await reserveNewcomerRedemption({ items: [{ adjustments: [] }] }, first, scope);
  } finally { await pg.close(); }
});
test("payment reservation reads server adjustments and refuses a changed cart owner", async () => {
  let calls = 0; const phases = [];
  const cart = { id: "cart_fixture", customer_id: customerId, discount_total: 10 };
  const scope = { resolve: key => {
    if (key === "query") return { graph: async () => ({ data: [{ ...cart, items: [{ unit_price: 100, quantity: 1, adjustments: [{ code: newcomerCode(userId), amount: 10 }] }] }] }) };
    return { raw: async (_sql, values) => { calls++; phases.push(values.at(-1)); return { rows: [{ id: "promo_fixture" }] }; } };
  } };
  await reserveNewcomerPayment(cart, scope); assert.equal(calls, 1);
  await reserveNewcomerPayment(cart, scope, true); assert.deepEqual(phases, [false, true]);
  await reserveNewcomerPayment({ ...cart, discount_total: 0 }, { resolve: () => assert.fail("no discounted cart dependency") });
  await assert.rejects(reserveNewcomerPayment(cart, { resolve: () => ({ graph: async () => ({ data: [{ ...cart, customer_id: "cus_other" }] }) }) }));
});
