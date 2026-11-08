import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { recover } from '../worker.mjs';
import { applyRules, ingest, metrics, query, reserve } from '../store.mjs';
import { triage } from '../gateway.mjs';
import { authorized, messagesFor, parseDecision, parseUsage, readBody, redact, reservationCost, rules, verifyGitHub } from '../core.mjs';
import { consoleErrorMessage } from '../console.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_control_plane.sql', import.meta.url), 'utf8'));
  const db = { prepare(sql) { return { bind(...args) {
    const stmt = sqlite.prepare(sql);
    return {
      async run() { const result = stmt.run(...args); return { meta: { changes: Number(result.changes) } }; },
      async first() { return stmt.get(...args) ?? null; },
      async all() { return { results: stmt.all(...args) }; },
    };
  } }; } };
  const sent = [];
  return { sqlite, DB: db, TASKS: { async send(value) { sent.push(value); } }, sent,
    ADMIN_TOKEN: 'a'.repeat(40), RUNNER_TOKEN: 'b'.repeat(40), INGEST_TOKEN: 'c'.repeat(40),
    GITHUB_WEBHOOK_SECRET: 'd'.repeat(40), GITHUB_REPOSITORY: 'Snow-force/snow-force',
    AI_ENABLED: 'true', DEEPSEEK_API_KEY: 'fake-test-key' };
}
const event = (key = 'test:1') => ({ source: 'manual', key, delivery: key, title: 'Login failed', summary: 'Login page shows a server error.' });
async function item(env, key) { const result = await ingest(env, event(key)); await applyRules(env, result.id); return result; }
async function request(env, path, body, token = env.ADMIN_TOKEN) {
  return worker.fetch(new Request('https://agent.test' + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
}
const modelResponse = () => Response.json({ usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 40 }, choices: [{ message: { content: JSON.stringify({ category: 'auth', priority: 'normal', draft: 'We are investigating the login error.' }) } }] });

test('auth fails closed on missing/short/wrong credentials and separates roles', async () => {
  const env = fixture();
  assert.equal((await request(env, '/api/overview', undefined, '')).status, 401);
  assert.equal((await request(env, '/api/overview', undefined, env.RUNNER_TOKEN)).status, 401);
  assert.equal((await request(env, '/runner/claim', {}, env.ADMIN_TOKEN)).status, 401);
  assert.equal(await authorized(new Request('https://x'), ''), false);
  assert.equal(await verifyGitHub('body', 'bad', 'secret'), false);
});
test('signed GitHub ingress verifies repository and deduplicates issue and delivery', async () => {
  const env = fixture();
  async function github(payload, secret = env.GITHUB_WEBHOOK_SECRET) {
    const body = JSON.stringify(payload);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
    const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
    return worker.fetch(new Request('https://agent.test/webhooks/github', {method:'POST', body, headers:{'x-hub-signature-256':'sha256='+Array.from(bytes, x=>x.toString(16).padStart(2,'0')).join(''),'x-github-event':'issues','x-github-delivery':'delivery-1'}}),env);
  }
  const payload = { action:'opened', repository:{full_name:env.GITHUB_REPOSITORY}, issue:{number:1,title:'Login failed',body:'SECRET RAW BODY NEVER STORED'} };
  assert.equal((await github(payload, 'x'.repeat(40))).status, 401);
  assert.equal((await github({...payload, repository:{full_name:'attacker/repo'}})).status, 403);
  assert.equal((await github(payload)).status, 202);
  assert.equal((await github(payload)).status, 202);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM cases').get().n, 1);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM deliveries').get().n, 1);
  assert.doesNotMatch(env.sqlite.prepare('SELECT summary FROM cases').get().summary, /SECRET/);
});
test('queue outage does not lose accepted events; cron recovers pending outbox', async () => {
  const env = fixture(); let count=0;
  env.TASKS.send = async () => { count++; throw Error('queue unavailable'); };
  const result=await ingest(env,event());
  assert.ok(result.id);
  env.TASKS.send=async()=>{count++;};
  await recover(env);
  assert.equal(count,2);
  await applyRules(env,result.id);
  await applyRules(env,result.id);
  assert.equal(env.sqlite.prepare('SELECT state FROM cases').get().state,'waiting_approval');
});
test('atomic reservations stop concurrent overspend at 80%, enforce case cap and pause', async () => {
  const env=fixture(); const a=await item(env,'a'), b=await item(env,'b');
  env.MONTHLY_BUDGET_MICRO_USD='1000';
  env.CASE_BUDGET_MICRO_USD='1000';
  const results=await Promise.all([reserve(env,a.id,700),reserve(env,b.id,700)]);
  assert.equal(results.filter(Boolean).length,1);
  await query(env.DB,"UPDATE usage_ledger SET status='completed'").run();
  assert.equal(await reserve(env,b.id,101),null);
  assert.ok(await reserve(env,b.id,100));
  assert.equal((await metrics(env)).circuit_open,true);
  const other=fixture();const c=await item(other,'c');other.CASE_BUDGET_MICRO_USD='5';
  assert.equal(await reserve(other,c.id,6),null);
  await query(other.DB,'UPDATE settings SET paused=1').run();
  assert.equal(await reserve(other,c.id,1),null);
  other.MONTHLY_BUDGET_MICRO_USD='NaN';
  await assert.rejects(()=>reserve(other,c.id,1),/configuration/);
});
test('successful AI settles usage, produces draft and never approves execution',async()=>{
  const env=fixture();const c=await item(env);let calls=0;
  assert.equal(await triage(env,c.id,async(url,options)=>{calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');const body=JSON.parse(options.body);assert.equal(body.max_tokens,512);assert.equal(body.thinking.type,'disabled');return modelResponse();}),true);
  assert.equal(calls,1);
  const row=env.sqlite.prepare('SELECT * FROM usage_ledger').get();
  assert.equal(row.status,'completed');assert.equal(row.charged_micro_usd,43);
  assert.equal(env.sqlite.prepare('SELECT state FROM cases').get().state,'waiting_approval');
  assert.equal((await request(env,'/runner/claim',{},env.RUNNER_TOKEN)).status,200);
  assert.equal((await (await request(env,'/runner/claim',{},env.RUNNER_TOKEN)).json()).task,null);
});
test('ambiguous API failure retains full charge and duplicate triage cannot double-call',async()=>{
  const env=fixture();const c=await item(env);let calls=0;
  const fetcher=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));throw Error('timeout');};
  await Promise.all([triage(env,c.id,fetcher),triage(env,c.id,fetcher)]);
  assert.equal(calls,1);const row=env.sqlite.prepare('SELECT * FROM usage_ledger').get();
  assert.equal(row.status,'uncertain');assert.equal(row.charged_micro_usd,row.reserved_micro_usd);
  env.AI_ENABLED='false';assert.equal(await triage(env,c.id,fetcher),false);assert.equal(calls,1);
});
test('budget exhaustion and pause never call provider or discard a case',async()=>{
  const env=fixture();const c=await item(env);env.MONTHLY_BUDGET_MICRO_USD='1';let calls=0;
  assert.equal(await triage(env,c.id,async()=>{calls++;return modelResponse();}),false);
  assert.equal(calls,0);assert.equal(env.sqlite.prepare('SELECT state FROM cases').get().state,'waiting_approval');
  await request(env,'/api/pause',{paused:true});
  assert.equal(await triage(env,c.id,async()=>{calls++;return modelResponse();}),false);
  assert.equal((await metrics(env)).paused,true);
  assert.ok((await (await request(env,'/api/audit')).json()).length>0);
});
test('queue acknowledges successful rule triage and retries database failures',async()=>{
  const env=fixture();const c=await ingest(env,event());let ack=0,retry=0;
  const message={body:{id:c.id},attempts:1,ack(){ack++;},retry(options){retry++;assert.equal(options.delaySeconds,60);}};
  await worker.queue({messages:[message]},env);assert.equal(ack,1);
  env.DB.prepare=()=>{throw Error('db offline');};
  await worker.queue({messages:[message]},env);assert.equal(retry,1);
  assert.equal((await worker.fetch(new Request('https://agent.test/api/overview',{headers:{authorization:'Bearer '+env.ADMIN_TOKEN}}),env)).status,503);
});
test('configuration and CI retain independent deployment and focused checks',()=>{
  const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.equal(config.main,'worker.mjs');assert.equal(config.vars.AI_ENABLED,'false');
  assert.equal(config.queues.consumers[0].max_concurrency,1);
  assert.equal(config.queues.consumers[0].max_retries,2);
  assert.equal(config.d1_databases[0].binding,'DB');
  assert.match(readFileSync(new URL('../../../.github/workflows/super-agent-ci.yml',import.meta.url),'utf8'),/npm run test:coverage/);
});
test('malformed usage keeps full reservation; invalid output settles actual usage safely',async()=>{
  const env=fixture();const c=await item(env);
  await triage(env,c.id,async()=>Response.json({usage:{prompt_tokens:-1}}));
  assert.equal(env.sqlite.prepare('SELECT status FROM usage_ledger').get().status,'uncertain');
  const env2=fixture();const d=await item(env2);
  await triage(env2,d.id,async()=>Response.json({usage:{prompt_tokens:20,completion_tokens:1},choices:[{message:{content:'{"category":"execute_shell"}'}}]}));
  assert.equal(env2.sqlite.prepare('SELECT status FROM usage_ledger').get().status,'completed');
  assert.equal(env2.sqlite.prepare('SELECT state FROM cases').get().state,'waiting_approval');
});
test('claim requires approval, allows one runner, completion requires current lease',async()=>{
  const env=fixture();const a=await item(env,'a'),b=await item(env,'b');
  assert.equal((await request(env,'/api/cases/'+a.id+'/approve',{})).status,200);
  await request(env,'/api/cases/'+b.id+'/approve',{});
  const first=await (await request(env,'/runner/claim',{},env.RUNNER_TOKEN)).json();
  assert.equal(first.task.id,a.id);
  assert.equal((await (await request(env,'/runner/claim',{},env.RUNNER_TOKEN)).json()).task,null);
  assert.equal((await request(env,'/runner/complete',{id:a.id,lease_token:'wrong',report:'Report'},env.RUNNER_TOKEN)).status,409);
  assert.equal((await request(env,'/runner/complete',{id:a.id,lease_token:first.task.lease_token,report:'Report',succeeded:true},env.RUNNER_TOKEN)).status,200);
  assert.equal(env.sqlite.prepare('SELECT state FROM cases WHERE id=?').get(a.id).state,'review');
  assert.equal((await request(env,'/api/cases/'+a.id+'/resolve',{})).status,200);
});
test('expired leases fail safely and cannot complete; reserved charges survive recovery',async()=>{
  const env=fixture();const c=await item(env);
  const reservation=await reserve(env,c.id,100);
  await query(env.DB,"UPDATE cases SET state='running',lease_token='old',lease_until=1").run();
  await query(env.DB,'UPDATE usage_ledger SET created_at=1 WHERE id=?',reservation).run();
  await recover(env);
  assert.equal(env.sqlite.prepare('SELECT state FROM cases').get().state,'failed');
  assert.equal(env.sqlite.prepare('SELECT status FROM usage_ledger').get().status,'uncertain');
  assert.equal((await request(env,'/runner/complete',{id:c.id,lease_token:'old',report:'Late result'},env.RUNNER_TOKEN)).status,409);
});
test('HTTP validation, privacy, bounded bodies and console security',async()=>{
  const env=fixture();
  assert.equal((await request(env,'/api/cases',{title:'',summary:'x',key:'1'})).status,400);
  assert.equal((await request(env,'/api/pause',{paused:'yes'})).status,400);
  assert.equal((await request(env,'/api/ingest',{source:'gmail',key:'1',title:'x',summary:'x'},env.INGEST_TOKEN)).status,400);
  assert.equal((await request(env,'/api/ingest',{source:'support',key:'1',title:'Help',summary:'No personal data'},env.INGEST_TOKEN)).status,202);
  assert.equal((await request(env,'/api/cases',{title:'Help',summary:'x',key:'1'})).status,201);
  const overview=await (await request(env,'/api/overview')).json();
  assert.ok(!('lease_token' in overview.cases[0]));
  const page=await worker.fetch(new Request('https://agent.test/'),env);
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.doesNotMatch(await page.text(),/localStorage|innerHTML/);
  assert.equal(consoleErrorMessage(401),'管理密码不正确，请重新输入。');
  assert.match(consoleErrorMessage(409),/刷新/);
  await assert.rejects(()=>readBody(new Request('https://x',{method:'POST',body:'x'.repeat(100)}),50),/large/);
  assert.throws(()=>parseUsage({prompt_tokens:1,completion_tokens:513},100),/usage/);
  assert.throws(()=>parseDecision({category:'support',priority:'high',draft:1}),/decision/);
  assert.doesNotMatch(redact('person@example.com https://x/?token=x ghp_abcdef123456 555-123-4567'),/person@|abcdef|555/);
  assert.equal(rules('forgot password').debug,false);
  assert.ok(reservationCost(messagesFor({summary:'x',category:'support'})).cost>0);
});
