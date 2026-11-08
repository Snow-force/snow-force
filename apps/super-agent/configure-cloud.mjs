import {readFile} from 'node:fs/promises';
import {Sandbox} from 'railway';
import {runProcess} from './runner.mjs';
const vars=Object.fromEntries((await readFile(new URL('.dev.vars',import.meta.url),'utf8')).split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1).trim().replace(/^"|"$/g,'')];}));
const project='f3ef22c7-7183-40ab-a52a-7c8b878ca75c',environment='e18f3d3b-7e06-4a75-9189-dbc0ac790f20',service='1a50ea5d-212c-4001-a31a-18d54a686820';
if(!vars.RAILWAY_TOKEN || vars.RAILWAY_TOKEN.length<20)throw Error('Fill the project-scoped RAILWAY_TOKEN in .dev.vars first');
await Sandbox.list({token:vars.RAILWAY_TOKEN,authType:'project-token',environmentId:environment});
console.log('Project-scoped sandbox access verified.');
if(process.argv.includes('--upload')){
  const cli=process.env.RAILWAY_CLI;
  if(!cli)throw Error('Set RAILWAY_CLI to the installed official Railway executable');
  const values={RAILWAY_TOKEN:vars.RAILWAY_TOKEN,RUNNER_TOKEN:vars.RUNNER_TOKEN};
  if(process.env.CODEX_AUTH_INPUT_FILE)values.CODEX_AUTH_JSON=await readFile(process.env.CODEX_AUTH_INPUT_FILE,'utf8');
  for(const [key,value] of Object.entries(values)){
    await runProcess(cli,['variable','set',key,'--stdin','--skip-deploys','--project',project,'--environment',environment,'--service',service],{input:value,timeout:60000});
    console.log('Cloud service configured: '+key);
  }
}
