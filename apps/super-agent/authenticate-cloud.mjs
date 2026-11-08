// Establish a separate subscription login on an ephemeral VM. Never copies the daily local login.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Sandbox} from 'railway';
const content=await readFile(new URL('.dev.vars',import.meta.url),'utf8');
const token=content.split(/\r?\n/).find(line=>line.startsWith('RAILWAY_TOKEN='))?.slice(14).trim().replace(/^"|"$/g,'');
if(!token)throw Error('Configure the project-scoped Railway token first');
const sandbox=await Sandbox.create({token,authType:'project-token',environmentId:'e18f3d3b-7e06-4a75-9189-dbc0ac790f20',
  resources:{cpu:0.5,memoryGB:1},idleTimeoutMinutes:1,networkIsolation:'ISOLATED'});
console.log('Isolated Codex sign-in environment ready.');
try{
  await sandbox.files.mkdir('/app/cloud-codex-signin');
  const result=await sandbox.exec('codex login --device-auth',{env:{CODEX_HOME:'/app/cloud-codex-signin'},timeoutSec:900,maxOutputBytes:16000,
    onStdout:chunk=>process.stdout.write(chunk),onStderr:chunk=>process.stdout.write(chunk)});
  if(result.exitCode!==0)throw Error('Cloud Codex login was not completed');
  const auth=await sandbox.files.read('/app/cloud-codex-signin/auth.json');
  if(JSON.parse(auth).auth_mode!=='chatgpt')throw Error('Expected a ChatGPT subscription login');
  await mkdir(new URL('.wrangler/',import.meta.url),{recursive:true});
  await writeFile(new URL('.wrangler/cloud-codex-auth.json',import.meta.url),auth,{mode:0o600});
  console.log('Separate cloud subscription authorization saved securely.');
}finally{await sandbox.destroy();console.log('Temporary sign-in VM destroyed.');}
