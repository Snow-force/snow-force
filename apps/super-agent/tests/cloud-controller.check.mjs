import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchesGlob} from 'node:path';
import {cloudConfig,executeCloudTask,shellQuote} from '../cloud-controller.mjs';

test('cloud config rejects unsafe origins and missing project-scoped credentials',()=>{
  assert.throws(()=>cloudConfig({SUPER_AGENT_URL:'http://remote.test'}),/HTTPS/);
  assert.throws(()=>cloudConfig({SUPER_AGENT_URL:'https://x.test'}),/configuration/);
  const config=cloudConfig({SUPER_AGENT_URL:'https://x.test',RUNNER_TOKEN:'x'.repeat(40),RAILWAY_TOKEN:'project-token',RAILWAY_ENVIRONMENT_ID:'env'});
  assert.equal(config.auth,'');assert.equal(config.publish,false);
});
test('model-influenced paths stay literal in remote shell commands',()=>{
  assert.equal(shellQuote('src/$(echo secret).ts'),"'src/$(echo secret).ts'");
  assert.equal(shellQuote("src/a'b.ts"),"'src/a'\\''b.ts'");
});
test('cloud task isolates project credentials, removes auth before tests and destroys VM',async()=>{
  const calls=[],writes=[];let options,completed,destroyed=false;
  const sandbox={
    files:{async write(path,content){writes.push({path,content,step:calls.length});},async read(path){if(path==='/tmp/report.txt')return 'Investigation evidence.';if(path==='/app/codex-auth/auth.json')return '{"auth_mode":"chatgpt","tokens":{"fake":"refreshed"}}';throw Error('unexpected file');}},
    async exec(command,config){calls.push({command,config});let stdout='';if(command==='git rev-parse HEAD')stdout='a'.repeat(40);return {exitCode:0,stdout};},
    async destroy(){destroyed=true;}
  };
  const config={origin:'https://worker.test',token:'secret-worker-token',railwayToken:'secret-project-token',environmentId:'independent-env',auth:JSON.stringify({auth_mode:'chatgpt',tokens:{fake:'test'}})};
  const result=await executeCloudTask(config,{id:'case',lease_token:'lease',summary:'Error',category:'debug'},{archive:new Uint8Array([1]),createSandbox:async input=>{options=input;return sandbox;},fetcher:async(url,request)=>{completed=JSON.parse(request.body);return Response.json({saved:true});}});
  assert.equal(result.succeeded,true);assert.equal(destroyed,true);
  assert.equal(options.networkIsolation,'ISOLATED');assert.equal(options.idleTimeoutMinutes,1);assert.equal(options.authType,'project-token');
  assert.deepEqual(options.resources,{cpu:4,memoryGB:4});
  assert.deepEqual(options.env,{NEXT_TELEMETRY_DISABLED:'1'});
  const authClear=writes.find(w=>w.path==='/app/codex-auth/auth.json'&&w.content==='{}');
  const authAttach=writes.find(w=>w.path==='/app/codex-auth/auth.json'&&w.content!=='{}');
  assert.ok(calls.findIndex(c=>c.command==='npm ci')<authAttach.step);
  assert.ok(authClear.step<=calls.findLastIndex(c=>c.command==='npm ci'));
  assert.ok(calls.some(c=>c.command==='npm run test:coverage -- --maxWorkers=4'&&c.config.timeoutSec===600));
  const codexCall=calls.find(c=>c.command.includes('--sandbox'));
  assert.match(codexCall.command,/shell_environment_policy.set=\{PATH=/);
  assert.match(codexCall.command,/shell_environment_policy.inherit="none"/);
  assert.ok(calls.filter(c=>c.command==='npm ci').every(c=>c.config.env.PATH.startsWith('/app/agent-toolchain/node_modules/.bin:')));
  assert.equal(completed.succeeded,true);assert.equal(completed.lease_token,'lease');
  assert.equal(JSON.parse(config.auth).tokens.fake,'refreshed');
  assert.doesNotMatch(JSON.stringify(calls),/secret-project-token|secret-worker-token/);
});
test('failed isolated execution is reported and cleaned up, without bypassing sandbox',async()=>{
  let destroyed=false,completed;
  const result=await executeCloudTask({origin:'https://worker.test',token:'token',railwayToken:'project',environmentId:'env',auth:'{"auth_mode":"chatgpt"}'},{id:'case',lease_token:'lease'},
    {archive:new Uint8Array(),createSandbox:async()=>({files:{async write(){}},async exec(){return {exitCode:1,stdout:''};},async destroy(){destroyed=true;}}),fetcher:async(url,options)=>{completed=JSON.parse(options.body);return Response.json({});}});
  assert.equal(result.succeeded,false);assert.equal(destroyed,true);assert.equal(completed.succeeded,false);
  assert.doesNotMatch(readFileSync(new URL('../cloud-controller.mjs',import.meta.url),'utf8'),/dangerously-bypass/);
});
test('dependency failure preserves useful diagnostics without copying sensitive text',async()=>{
  const result=await executeCloudTask({origin:'https://worker.test',token:'token',railwayToken:'project',environmentId:'env',auth:'{"auth_mode":"chatgpt"}'},{id:'case',lease_token:'lease'},
    {archive:new Uint8Array(),createSandbox:async()=>({files:{async write(){}},async exec(command){
      if(command==='git rev-parse HEAD')return {exitCode:0,stdout:'a'.repeat(40)};
      if(command.startsWith('npm '))return {exitCode:1,stderr:'Install failed sk_test-private-value user@example.com',stdout:'Dependency unavailable'};
      return {exitCode:0,stdout:''};
    },async destroy(){}}),fetcher:async()=>Response.json({})});
  assert.equal(result.succeeded,false);assert.match(result.report,/Dependency unavailable/);
  assert.doesNotMatch(result.report,/sk_test-private-value|user@example.com/);
});
test('cloud build context excludes local credentials and existing runtime artifacts',()=>{
  const ignore=readFileSync(new URL('../cloud/Dockerfile.dockerignore',import.meta.url),'utf8');
  for(const entry of ['**/.env*','**/.dev.vars*','**/node_modules','**/.git','output','Products','.data'])assert.ok(ignore.split('\n').includes(entry));
  const excluded=path=>ignore.split(/\r?\n/).filter(Boolean).reduce((state,line)=>{
    const negate=line.startsWith('!'),pattern=negate?line.slice(1):line;
    return matchesGlob(path,pattern)||matchesGlob(path,pattern+'/**')?!negate:state;
  },false);
  for(const path of ['.env.local','services/commerce/.env','apps/super-agent/.dev.vars','apps/super-agent/node_modules/private.js'])assert.equal(excluded(path),true,path);
  for(const path of ['.env.example','services/commerce/.env.example','apps/super-agent/.dev.vars.example'])assert.equal(excluded(path),false,path);
  const docker=readFileSync(new URL('../cloud/Dockerfile',import.meta.url),'utf8');
  assert.match(docker,/npm ci --omit=dev/);assert.match(docker,/USER node/);
});
