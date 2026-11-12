import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const vars=Object.fromEntries((await readFile(new URL('.dev.vars',import.meta.url),'utf8')).split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)];}));
const credential=await new Promise((resolve,reject)=>{
  const process=spawn('git',['credential','fill'],{stdio:['pipe','pipe','pipe'],windowsHide:true});let data='';
  process.stdout.on('data',value=>data+=value);process.stderr.resume();
  process.on('error',reject);process.on('close',code=>code===0?resolve(data):reject(Error('GitHub credential unavailable')));
  process.stdin.end('protocol=https\nhost=github.com\n\n');
});
const password=credential.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);
if(!password)throw Error('GitHub credential unavailable');
const base='https://api.github.com/repos/Snow-force/snow-force/hooks';
const headers={authorization:'Bearer '+password,accept:'application/vnd.github+json','content-type':'application/json','x-github-api-version':'2022-11-28'};
const existing=await fetch(base,{headers,signal:AbortSignal.timeout(30000),redirect:'error'});
if(!existing.ok)throw Error('GitHub webhook permissions unavailable (HTTP '+existing.status+')');
const hooks=await existing.json();
const url='https://snowforce-super-agent.snowforce-super-agent.workers.dev/webhooks/github';
const current=hooks.find(hook=>hook.config?.url===url);
let id=current?.id;
if(!current){
  const response=await fetch(base,{method:'POST',headers,body:JSON.stringify({name:'web',active:true,events:['issues'],config:{url,content_type:'json',secret:vars.GITHUB_WEBHOOK_SECRET,insecure_ssl:'0'}}),signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!response.ok)throw Error('GitHub webhook creation failed (HTTP '+response.status+')');
  id=(await response.json()).id;
}
const evidence={repository:'Snow-force/snow-force',url,hook_id:id,events:['issues'],checked_at:new Date().toISOString(),created:!current};
await mkdir(new URL('reports/',import.meta.url),{recursive:true});
await writeFile(new URL('reports/github-webhook.json',import.meta.url),JSON.stringify(evidence,null,2));
console.log('GitHub Issues webhook connected. Hook ID: '+id);
