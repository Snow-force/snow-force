import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const path = new URL('.dev.vars', import.meta.url);
let content='';
try { content=await readFile(path,'utf8'); } catch(error) { if(error.code!=='ENOENT')throw error; }
const values={};
for(const line of content.split(/\r?\n/)){
  const match=/^([A-Z_]+)=(.*)$/.exec(line.trim());
  if(match)values[match[1]]=match[2].replace(/^"|"$/g,'');
}
for(const name of ['ADMIN_TOKEN','RUNNER_TOKEN','INGEST_TOKEN','GITHUB_WEBHOOK_SECRET']){
  if(!values[name])values[name]=randomBytes(32).toString('hex');
}
values.DEEPSEEK_API_KEY??='';
await writeFile(path,Object.entries(values).map(([key,value])=>key+'='+value).join('\n')+'\n',{mode:0o600});
if(process.argv.includes('--upload')){
  const secrets=Object.fromEntries(Object.entries(values).filter(([key,value])=>['ADMIN_TOKEN','RUNNER_TOKEN','INGEST_TOKEN','GITHUB_WEBHOOK_SECRET','DEEPSEEK_API_KEY'].includes(key)&&value));
  const child=spawn(process.execPath,[new URL('node_modules/wrangler/bin/wrangler.js',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),'secret','bulk'],{cwd:new URL('.',import.meta.url),stdio:['pipe','pipe','pipe'],windowsHide:true});
  child.stdin.end(JSON.stringify(secrets));
  // Provider output may contain operational details. Emit only success/failure, never credentials.
  child.stdout.resume();child.stderr.resume();
  child.on('error',()=>{console.error('Secret upload could not start.');process.exitCode=1;});
  child.on('close',code=>{console.log(code===0?'Worker secrets configured.':'Secret upload failed; check Cloudflare login and permissions.');process.exitCode=code??1;});
}else console.log('Local secret file ready. Fill DEEPSEEK_API_KEY locally when available.');
