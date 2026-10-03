import { createRequire } from "node:module";
import { createServer } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteCalculation, quoteInput } from "./fixtures/tax-quote.mjs";
import { nativeCart } from "./fixtures/tax-source.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const Stripe = require("stripe");
const service = require("../src/lib/tax-quote-provider.ts");
const { buildStripeTaxQuoteRequest } = require("../src/lib/tax-quote-money.ts");
const id = "123e4567-e89b-42d3-a456-426614174001", namespace = "f".repeat(64);
function providerFixture() {
  const input = quoteInput(nativeCart(110,0,9.95));
  input.lines.push({ ...input.lines[0], id: "cali_second" });
  const calculation = quoteCalculation(input), calls = [];
  const data = calculation.line_items.data.map(line => ({ ...line, object: "tax.calculation_line_item" }));
  const url = `/v1/tax/calculations/${calculation.id}/line_items`;
  calculation.line_items = { object: "list", url, has_more: true, total_count: data.length, data: [data[0]] };
  const f = { input, calculation, data, calls, pages: data.map((line,index) => ({ object: "list", url, has_more: index === 0, data: [line] })) };
  f.writer = { namespace, livemode: false, account: async () => ({ object: "account", id: input.account_id }),
    createCalculation: async () => calculation, listLineItems: async (id,params) => { calls.push({id,params}); return f.pages[calls.length-1]; } };
  return f;
}
const collect = (f,signals=[]) => service.collectStripeTaxQuote(f.writer,f.input,f.calculation,signals,() => f.input.tax_date);

test("full listing without total_count is paginated, checked and normalized before persistence", async () => {
  const f = providerFixture(), result = await collect(f);
  assert.equal(result.line_items.total_count,2); assert.equal(result.line_items.has_more,false);
  assert.deepEqual(result.line_items.data.map(line => line.reference),f.input.lines.map(line => line.id));
  assert.deepEqual(f.calls,[{id:"taxcalc_fixture",params:{limit:100,expand:["data.tax_breakdown"]}},
    {id:"taxcalc_fixture",params:{limit:100,expand:["data.tax_breakdown"],starting_after:"tax_li_0"}}]);
});

test("omitted or null initial expansions still require the complete authoritative listing", async () => {
  for (const kind of ["missing","null"]) {
    const f = providerFixture(); if(kind === "missing") delete f.calculation.line_items; else f.calculation.line_items = null;
    assert.equal((await collect(f)).line_items.data.length,2); assert.equal(f.calls.length,2);
  }
});

test("truncated, duplicate, wrong-mode, foreign, missing-breakdown and inconsistent provider pages fail closed", async () => {
  for (const kind of ["truncated","duplicate_id","duplicate_ref","foreign","mode","empty","count","url","breakdown","money","disagree","extra","cycle"]) {
    const f = providerFixture();
    if(kind === "truncated") f.pages[0].has_more = false;
    if(kind === "duplicate_id") f.pages[1].data[0].id = f.pages[0].data[0].id;
    if(kind === "duplicate_ref") f.pages[1].data[0].reference = f.pages[0].data[0].reference;
    if(kind === "foreign") f.pages[1].data[0].reference = "cali_foreign";
    if(kind === "mode") f.pages[1].data[0].livemode = true;
    if(kind === "empty") f.pages[1].data = [];
    if(kind === "count") f.pages[0].total_count = 9;
    if(kind === "url") f.pages[0].url = "https://untrusted.example.test/list";
    if(kind === "breakdown") delete f.pages[1].data[0].tax_breakdown;
    if(kind === "money") f.pages[1].data[0].amount++;
    if(kind === "disagree") { f.calculation = structuredClone(f.calculation); f.calculation.line_items.data[0].amount_tax++; }
    if(kind === "extra") f.pages[1].data.push({ ...f.pages[1].data[0],id:"tax_li_extra",reference:"cali_extra" });
    if(kind === "cycle") f.pages[1].has_more = true;
    await assert.rejects(() => collect(f),/could not be verified/);
    assert.ok(f.calls.length <= 2);
  }
});

test("invalid calculation identity, incomplete advertised expansion and nullable saved fields fail before listing", async () => {
  for (const change of [f => f.calculation.id = null, f => f.calculation.expires_at = null,
    f => f.calculation.line_items.total_count++, f => f.calculation.line_items.has_more = false,
    f => f.calculation.line_items.url = "/v1/tax/calculations/taxcalc_other/line_items",
    f => f.calculation.livemode = true, f => f.writer.livemode = true]) {
    const f = providerFixture(); change(f); await assert.rejects(() => collect(f)); assert.equal(f.calls.length,0);
  }
});

test("expired provider data, failed final page and canceled leases cannot produce a result", async () => {
  const f = providerFixture();
  await assert.rejects(() => service.collectStripeTaxQuote(f.writer,f.input,f.calculation,[],() => f.input.tax_date + 900));
  const g = providerFixture(); g.writer.listLineItems = async () => { throw new Error("private-provider-detail"); };
  await assert.rejects(() => collect(g),error => !error.message.includes("private-provider-detail"));
  for (const position of ["before","during"]) {
    const h = providerFixture(), controller = new AbortController(), list = h.writer.listLineItems;
    if(position === "before") controller.abort(); else h.writer.listLineItems = async (...args) => { const result = await list(...args); controller.abort(); return result; };
    await assert.rejects(() => collect(h,[controller.signal])); assert.equal(h.calls.length,position === "before" ? 0 : 1);
  }
});

test("factory retains protected key mode and namespace without exposing secrets or allowing arbitrary operation keys", async () => {
  const calls = [], client = { accounts: { retrieveCurrent: async () => { calls.push("account"); return {}; } },
    tax: { calculations: { create: async (...args) => { calls.push(args); return {}; }, listLineItems: async (...args) => { calls.push(args); return {}; } } } };
  assert.throws(() => service.createStripeTaxQuoteWriter(client,false));
  const writer = service.createStripeTaxQuoteWriter(client,false,namespace), f = providerFixture(), request = buildStripeTaxQuoteRequest(f.input);
  await writer.account(); await writer.createCalculation(request,`snowforce-tax-quote:${id}`);
  await writer.listLineItems("taxcalc_fixture",{limit:100});
  assert.deepEqual(calls,["account",[request,{idempotencyKey:`snowforce-tax-quote:${id}`}],["taxcalc_fixture",{limit:100}]]);
  assert.throws(() => writer.createCalculation(request,"arbitrary")); assert.throws(() => writer.listLineItems("foreign",{}));
  const old = process.env.COMMERCE_STRIPE_API_KEY;
  try {
    for (const key of [undefined,"pk_test_fixture","invalid"]) { if(key === undefined) delete process.env.COMMERCE_STRIPE_API_KEY; else process.env.COMMERCE_STRIPE_API_KEY = key; assert.throws(() => service.createStripeTaxQuoteWriter()); }
    process.env.COMMERCE_STRIPE_API_KEY = "rk_test_fixture"; const testWriter = service.createStripeTaxQuoteWriter();
    assert.equal(testWriter.livemode,false); assert.equal(testWriter.namespace.length,64); assert.ok(!JSON.stringify(testWriter).includes("rk_test_fixture"));
    process.env.COMMERCE_STRIPE_API_KEY = "rk_live_fixture"; const liveWriter = service.createStripeTaxQuoteWriter();
    assert.equal(liveWriter.livemode,true); assert.notEqual(testWriter.namespace,liveWriter.namespace);
  } finally { if(old === undefined) delete process.env.COMMERCE_STRIPE_API_KEY; else process.env.COMMERCE_STRIPE_API_KEY = old; }
});

test("installed Stripe SDK serializes the original request, fixed idempotency key and expanded list against an isolated HTTP server", async () => {
  const f = providerFixture(), seen = [];
  const server = createServer(async (req,res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    seen.push({ method:req.method,url:req.url,body,headers:req.headers });
    res.setHeader("Content-Type","application/json");
    res.end(JSON.stringify(req.method === "POST" ? f.calculation : f.pages[seen.filter(row => row.method === "GET").length-1]));
  });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  try {
    const client = new Stripe("sk_test_isolated_fixture",{host:"127.0.0.1",port:server.address().port,protocol:"http",apiVersion:"2026-09-30.endive",maxNetworkRetries:0,timeout:2000});
    const writer = service.createStripeTaxQuoteWriter(client,false,namespace);
    const calculation = await writer.createCalculation(buildStripeTaxQuoteRequest(f.input),`snowforce-tax-quote:${id}`);
    await service.collectStripeTaxQuote(writer,f.input,calculation,[],() => f.input.tax_date);
    assert.equal(seen.length,3); assert.equal(seen[0].url,"/v1/tax/calculations");
    assert.equal(seen[0].headers["idempotency-key"],`snowforce-tax-quote:${id}`);
    assert.equal(seen[0].headers["stripe-version"],"2026-09-30.endive");
    const body = new URLSearchParams(seen[0].body);
    assert.equal(body.get("tax_date"),String(f.input.tax_date)); assert.equal(body.get("currency"),"usd");
    assert.equal(body.get("line_items[0][reference]"),f.input.lines[0].id); assert.equal(body.get("line_items[0][amount]"),"11000");
    assert.equal(body.get("customer_details[address_source]"),"shipping"); assert.equal(body.get("expand[0]"),"line_items.data.tax_breakdown");
    assert.equal(new URL(seen[2].url,"http://fixture.test").searchParams.get("starting_after"),"tax_li_0");
    assert.equal(new URL(seen[1].url,"http://fixture.test").searchParams.get("expand[0]"),"data.tax_breakdown");
  } finally { await new Promise(resolve => server.close(resolve)); }
});
