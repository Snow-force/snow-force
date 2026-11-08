import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
  assert.deepEqual(options.env,{NEXT_TELEMETRY_DISABLED:'1'});
  const authClear=writes.find(w=>w.path==='/app/codex-auth/auth.json'&&w.content==='{}');
  assert.ok(authClear.step<=calls.findIndex(c=>c.command==='npm ci'));
  assert.ok(calls.some(c=>c.command==='npm run test:coverage'));
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
test('cloud build context excludes local credentials and existing runtime artifacts',()=>{
  const ignore=readFileSync(new URL('../cloud/Dockerfile.dockerignore',import.meta.url),'utf8');
  for(const entry of ['**/.env*','**/.dev.vars*','**/node_modules','**/.git','output','.data'])assert.ok(ignore.split('\n').includes(entry));
  const docker=readFileSync(new URL('../cloud/Dockerfile',import.meta.url),'utf8');
  assert.match(docker,/npm ci --omit=dev/);assert.match(docker,/USER node/);
});
