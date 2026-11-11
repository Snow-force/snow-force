const http = require('http');
const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
const { spawn } = require('child_process');
const counts = { events: 0, recaps: 0, products: 0, regions: 0, contact: 0 };
const queries=[];
const upstream=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost:4599');
 res.setHeader('Content-Type','application/json');
 if(url.pathname==='/rest/v1/events') { counts.events++;queries.push(url.search);res.end(JSON.stringify([{slug:'cache-check-ride',status:'published',registration_state:'open',title_en:'Cache check ride',title_zh:'缓存验证活动',event_date:'2027-01-10',activity_location_en:'Mountain',activity_location_zh:'雪场',cover_image:'/shop/mountain-editorial.webp',fee_amount:'$50'}])); }
 else if(url.pathname==='/rest/v1/event_recaps'){counts.recaps++;queries.push(url.search);res.end(JSON.stringify([{slug:'cache-check-story',status:'published',title_en:'Cache check story',title_zh:'缓存验证回顾',date:'2026-11-01',cover_image:'/team/group.jpg'}]));}
 else if(url.pathname==='/store/regions'){counts.regions++;res.end(JSON.stringify({regions:[{id:'reg_us',currency_code:'usd',countries:[{iso_2:'us'}]}]}));}
 else if(url.pathname==='/store/products'){counts.products++;res.end(JSON.stringify({products:[],count:0}));}
 else if(url.pathname==='/store/snowforce/policies'){counts.contact++;res.end(JSON.stringify({policy:null}));}
 else {res.statusCode=404;res.end('{}');}
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 await new Promise(resolve=>upstream.listen(4599,'127.0.0.1',resolve));
 const child=spawn(process.execPath,[path.join(projectRoot, '.next/standalone/server.js')],{cwd:projectRoot,env:{...process.env,HOSTNAME:'127.0.0.1',PORT:'3001',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:4599',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public-local-cache-check',MEDUSA_BACKEND_URL:'http://127.0.0.1:4599',MEDUSA_PUBLISHABLE_KEY:'public-local-commerce-check'},stdio:['ignore','pipe','pipe']});
 let log='';child.stdout.on('data',b=>{log+=b});child.stderr.on('data',b=>{log+=b});
 try {
  let ready=false;
  for(let attempt=0;attempt<40;attempt++){try {const r=await fetch('http://127.0.0.1:3001/');if(r.ok){ready=true;break}}catch{}await sleep(500)}
  if(!ready)throw Error('Production server not ready: '+log);
  const afterFirst={...counts};
  for(let i=0;i<8;i++){
   const response=await fetch('http://127.0.0.1:3001/',{headers:{Cookie:`lang=${i%2?'zh':'en'}`}});
   const html=await response.text();
   if(!html.includes('cache-check-ride')||!html.includes('cache-check-story'))throw Error('Missing public summaries in response');
  }
  const result={afterFirst,afterNine:counts,queries,passed:Object.values(counts).every(count=>count===1)};
  const output = path.join(projectRoot, 'output/homepage-redesign');
  fs.mkdirSync(output, {recursive: true});
  fs.writeFileSync(path.join(output, 'cache-verification.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  if(!result.passed)process.exitCode=1;
 } finally {child.kill('SIGTERM');upstream.close();}
})().catch(e=>{console.error(e);upstream.close();process.exitCode=1});
