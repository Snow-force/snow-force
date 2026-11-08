import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHmac,randomUUID} from 'node:crypto';
const origin=process.env.SUPER_AGENT_URL??'https://snowforce-super-agent.snowforce-super-agent.workers.dev';
const vars=Object.fromEntries((await readFile(new URL('.dev.vars',import.meta.url),'utf8')).split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)];}));
async function request(path,body,token=vars.ADMIN_TOKEN){
  const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error'});
  return {status:response.status,data:await response.json()};
}
const health=await request('/health');assert.equal(health.status,200);
assert.equal((await request('/api/overview',undefined,'')).status,401);
const key='acceptance-'+randomUUID();
const created=await request('/api/cases',{key,title:'[SELF-TEST] Login failed',summary:'Synthetic technical acceptance test; no customer data.'});
assert.equal(created.status,201);
const repeated=await request('/api/cases',{key,title:'[SELF-TEST] Login failed',summary:'Synthetic technical acceptance test; no customer data.'});
assert.equal(repeated.data.id,created.data.id);
let overview=await request('/api/overview');
assert.equal(overview.data.cases.find(item=>item.id===created.data.id).category,'auth');
assert.equal((await request('/api/cases/'+created.data.id+'/triage',{summary:'Synthetic'})).status,503);
assert.equal((await request('/api/cases/'+created.data.id+'/approve',{})).status,200);
const claimed=await request('/runner/claim',{},vars.RUNNER_TOKEN);assert.equal(claimed.data.task.id,created.data.id);
assert.equal((await request('/runner/complete',{id:created.data.id,lease_token:'wrong',report:'Synthetic result.'},vars.RUNNER_TOKEN)).status,409);
assert.equal((await request('/runner/complete',{id:created.data.id,lease_token:claimed.data.task.lease_token,report:'Synthetic callback verified. This did not execute Codex.',succeeded:true},vars.RUNNER_TOKEN)).status,200);
assert.equal((await request('/api/cases/'+created.data.id+'/resolve',{})).status,200);
const webhookBody=JSON.stringify({action:'opened',repository:{full_name:'Snow-force/snow-force'},issue:{number:2147483000,title:'[SELF-TEST] Checkout error',body:'not persisted'}});
const webhook=await fetch(origin+'/webhooks/github',{method:'POST',body:webhookBody,headers:{'x-github-event':'issues','x-github-delivery':key,'x-hub-signature-256':'sha256='+createHmac('sha256',vars.GITHUB_WEBHOOK_SECRET).update(webhookBody).digest('hex')},signal:AbortSignal.timeout(30000)});
assert.equal(webhook.status,202);const webhookCase=await webhook.json();
// Queue is asynchronous; leave this clearly marked synthetic case for queue verification.
overview=await request('/api/overview');assert.equal(overview.data.usage.monthly_micro_usd,0);assert.equal(overview.data.usage.ai_enabled,false);
const evidence={at:new Date().toISOString(),origin,health:'passed',unauthorized:'blocked',dedup:'passed',rules:'passed',runner_callback:'passed',stale_lease:'blocked',github_signature:'passed',ai:'disabled',api_cost_micro_usd:0,manual_case_id:created.data.id,webhook_case_id:webhookCase.id};
await mkdir(new URL('reports/',import.meta.url),{recursive:true});
await writeFile(new URL('reports/production-smoke.json',import.meta.url),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
