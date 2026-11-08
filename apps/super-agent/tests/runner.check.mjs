import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runnerConfig, allowedFile, runProcess, publishDraft } from '../runner.mjs';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('runner requires isolated subscription authentication and secure control origin',()=>{
  assert.throws(()=>runnerConfig({SUPER_AGENT_URL:'http://remote.test'}),/HTTPS/);
  assert.throws(()=>runnerConfig({SUPER_AGENT_URL:'https://user:pass@remote.test'}),/plain/);
  assert.throws(()=>runnerConfig({RUNNER_TOKEN:'short'}),/token/);
  assert.throws(()=>runnerConfig({RUNNER_TOKEN:'x'.repeat(40),CODEX_AUTH_FILE:'relative'}),/absolute/);
  const config=runnerConfig({RUNNER_TOKEN:'x'.repeat(40),CODEX_AUTH_FILE:join(tmpdir(),'auth.json')});
  assert.equal(config.publish,false);assert.equal(config.repository,'Snow-force/snow-force');
});
test('draft publisher rejects policy, credential, traversal and dependency changes',async()=>{
  for(const file of ['../src/a.ts','src/../a.ts','src/.env','src/a.pem','.github/workflows/ci.yml','apps/super-agent/runner.mjs','apps/super-agent/package.json','src/AGENTS.md','src/node_modules/a','src\\a.ts'])assert.equal(allowedFile(file),false,file);
  assert.equal(allowedFile('src/components/fix.tsx'),true);
  await assert.rejects(()=>publishDraft({},'', '',{id:'1'},['../bad'],'head'),/policy/);
});
test('subprocess uses argument boundaries and rejects failed commands',async()=>{
  assert.equal((await runProcess(process.execPath,['-e','process.stdout.write(process.argv[1])','literal;not a command'])).trim(),'literal;not a command');
  await assert.rejects(()=>runProcess(process.execPath,['-e','process.exit(2)']),/exit 2/);
});
test('draft publisher constructs fixed-base PR and never merges or deploys',async()=>{
  const workspace=await mkdtemp(join(tmpdir(),'agent-publisher-test-'));await mkdir(join(workspace,'src'));await writeFile(join(workspace,'src','fix.ts'),'export const fixed=true;');
  const requests=[];const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    requests.push({url,body:options.body?JSON.parse(options.body):null});
    if(url.endsWith('git/commits/base-sha'))return Response.json({tree:{sha:'base-tree'}});
    if(url.includes('/pulls?'))return Response.json([]);
    if(url.endsWith('/pulls'))return Response.json({html_url:'https://github.com/Snow-force/snow-force/pull/1'});
    return Response.json({sha:'created-sha'});
  };
  try{
    const result=await publishDraft({repository:'Snow-force/snow-force'},'fake-token',workspace,{id:'case-1'},['src/fix.ts'],'base-sha');
    assert.match(result,/pull\/1/);
    assert.deepEqual(requests.find(r=>r.url.endsWith('/git/commits')).body.parents,['base-sha']);
    assert.equal(requests.at(-1).body.draft,true);
    assert.equal(requests.some(r=>/merge|deployment/.test(r.url)),false);
  }finally{globalThis.fetch=originalFetch;}
});
