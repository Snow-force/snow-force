import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { resetMessage, sendAdminReset, ADMIN_ORIGIN } = require("../src/lib/admin-password-reset.ts");
const { default: subscriber, config } = require("../src/subscribers/admin-password-reset.ts");
const secret = "fixture-reset-signing-secret";
const now = 1800000000000;
function event(change = {}) {
  const claims = { entity_id: "admin@example.com", actor_type: "user", provider: "emailpass", purpose: "reset", jti: "fixture-single-use-token", iat: now / 1000, exp: now / 1000 + 900, ...change };
  const unsigned = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify(claims)).toString("base64url")].join(".");
  return { actor_type: "user", entity_id: "admin@example.com", token: `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`, metadata: { reset_url: "https://attacker.invalid" } };
}
test("native single-use token goes only to the trusted admin origin with bilingual instructions", () => {
  const value = resetMessage(event(), secret, now);
  assert.equal(value.payload.to[0], "admin@example.com");
  assert.equal(value.payload.from, "SnowForce Shop <shop@notifications.snow-force.com>");
  const link = value.payload.text.split("\n")[1];
  assert.equal(new URL(link).origin, ADMIN_ORIGIN);
  assert.equal(new URL(link).searchParams.get("token"), event().token);
  assert.match(value.payload.text, /15 分钟/);
  assert.ok(!value.payload.html.includes("attacker.invalid"));
  assert.ok(!value.key.includes(event().token));
});
test("rejects expired, altered, wrong-actor, wrong-purpose and recipient-mismatched tokens", () => {
  for (const change of [{exp:now / 1000}, {actor_type:"customer"}, {purpose:"session"}, {provider:"supabase"}, {entity_id:"other@example.com"}, {iat:now/1000+60}]) assert.throws(() => resetMessage(event(change), secret, now), /Invalid admin/);
  assert.throws(() => resetMessage({...event(),token:event().token+'x'},secret,now), /Invalid admin/);
  assert.throws(() => resetMessage(event(),"wrong-secret",now), /Invalid admin/);
});
test("duplicate delivery retries reuse the same idempotency key and new requests change it", async () => {
  const calls = [];
  const dependencies = { now:()=>now, fetch:async (url, options)=> { calls.push({url,options}); return new Response(JSON.stringify({id:"email_fixture"}),{status:200}); } };
  const env = {JWT_SECRET:secret, COMMERCE_RESEND_API_KEY:"fixture-private-key"};
  await sendAdminReset(event(),env,dependencies); await sendAdminReset(event(),env,dependencies); await sendAdminReset(event({jti:"new-fixture"}),env,dependencies);
  assert.equal(calls[0].url,"https://api.resend.com/emails");
  assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key']);
  assert.notEqual(calls[0].options.headers['Idempotency-Key'],calls[2].options.headers['Idempotency-Key']);
});
test("failed sends throw sanitized retryable errors rather than silently acknowledging", async () => {
  const env = {JWT_SECRET:secret, COMMERCE_RESEND_API_KEY:"fixture-private-key"};
  for (const status of [429,500,403]) await assert.rejects(sendAdminReset(event(),env,{now:()=>now,sleep:async()=>{},fetch:async()=>new Response(event().token,{status})}), new RegExp(`HTTP ${status}`));
  await assert.rejects(sendAdminReset(event(),env,{now:()=>now,sleep:async()=>{},fetch:async()=>{throw new Error(event().token)}}),/delivery failed/);
  await assert.rejects(sendAdminReset(event(),env,{now:()=>now,sleep:async()=>{},fetch:async()=>new Response('{}')}),/invalid acknowledgement/);
  await assert.rejects(sendAdminReset(event(),{JWT_SECRET:secret},{now:()=>now,fetch:async()=>{throw new Error('must not send')}}),/not configured/);
});
test("transient failures retry with stable keys; permanent errors stop; expiry stops retries", async () => {
  const env = {JWT_SECRET:secret, COMMERCE_RESEND_API_KEY:"fixture-private-key"};
  const keys = [], delays = [];
  await sendAdminReset(event(),env,{now:()=>now,sleep:async(ms)=>{delays.push(ms)},fetch:async(_url,options)=>{keys.push(options.headers['Idempotency-Key']);return keys.length < 3 ? new Response('',{status:429}) : new Response('{"id":"email_fixture"}') }});
  assert.equal(new Set(keys).size,1); assert.deepEqual(delays,[1000,2000]);
  let permanentCalls = 0;
  await assert.rejects(sendAdminReset(event(),env,{now:()=>now,sleep:async()=>{},fetch:async()=>{permanentCalls++;return new Response('',{status:403})}}),/HTTP 403/); assert.equal(permanentCalls,1);
  let clock = now, expiredCalls = 0;
  await assert.rejects(sendAdminReset(event(),env,{now:()=>clock,sleep:async()=>{clock+=900000},fetch:async()=>{expiredCalls++;return new Response('',{status:500})}}),/Invalid admin/); assert.equal(expiredCalls,1);
});
test("subscriber ignores customer and unknown admin events without sending", async () => {
  let calls = 0;
  const container = {resolve:()=>({listUsers:async()=> {calls++;return [];}})};
  await subscriber({event:{data:{actor_type:"customer"}},container}); assert.equal(calls,0);
  await subscriber({event:{data:event()},container}); assert.equal(calls,1);
  assert.equal(config.event,"auth.password_reset");
});
test("registered subscriber sends for an existing admin without changing authentication", async () => {
  const previousFetch = global.fetch;
  const previousSecret = process.env.JWT_SECRET;
  const previousKey = process.env.COMMERCE_RESEND_API_KEY;
  let sent;
  try {
    process.env.JWT_SECRET = secret; process.env.COMMERCE_RESEND_API_KEY = 'fixture-private-key';
    global.fetch = async (_url, options) => {sent = JSON.parse(options.body); return new Response('{"id":"email_fixture"}')};
    const currentSeconds = Math.floor(Date.now()/1000);
    await subscriber({event:{data:event({iat:currentSeconds,exp:currentSeconds+900})},container:{resolve:()=>({listUsers:async(filter)=>{assert.deepEqual(filter,{email:'admin@example.com'});return [{email:'admin@example.com'}]}})}});
    assert.deepEqual(sent.to,['admin@example.com']); assert.match(sent.text,/password has not changed/);
  } finally {
    global.fetch = previousFetch;
    for (const [key,value] of [['JWT_SECRET',previousSecret],['COMMERCE_RESEND_API_KEY',previousKey]]) { if (value === undefined) delete process.env[key]; else process.env[key]=value; }
  }
});
