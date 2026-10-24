// Local-only approval acceptance. No Stripe API or production database access.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { openSync, closeSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export async function verifyProxyApprovalBrowser({ root,db,config,directory,booker }) {
  const appRoot = process.env.EVENT_TEST_APP_ROOT ?? root;
  const encryptionKey = randomBytes(32).toString("hex");
  assert.equal(config.host,"127.0.0.1");
  const require=createRequire(path.join(root,"package.json"));
  process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,".cache/tooling/playwright-browsers");
  const { chromium }=require(process.env.EVENT_TEST_PLAYWRIGHT_MODULE ?? path.join(os.homedir(),".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
  const secret=randomBytes(48).toString("hex");
  const user="20000000-0000-4000-8000-000000000001";
  const sign=role=>{const body=[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),Buffer.from(JSON.stringify({role,sub:user,aud:"authenticated",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")].join(".");return body+"."+createHmac("sha256",secret).update(body).digest("base64url");};
  const restPort=config.port+1;
  const restLog=openSync(path.join(directory,"browser-postgrest.log"),"a");
  const rest=spawn(path.join(root,".cache/tooling/postgrest-16.5/bin/postgrest.exe"),[],{windowsHide:true,stdio:["ignore",restLog,restLog],env:{...process.env,
    PATH:path.join(root,".cache/tooling/postgresql/pgsql/bin")+path.delimiter+process.env.PATH,
    PGRST_DB_URI:`postgresql://${config.user}@127.0.0.1:${config.port}/postgres`,PGRST_DB_SCHEMAS:"public",PGRST_DB_ANON_ROLE:"anon",PGRST_JWT_SECRET:secret,PGRST_SERVER_HOST:"127.0.0.1",PGRST_SERVER_PORT:String(restPort)}});
  // Only authentication/profile reads are emulated. Event validation and pending writes use real PostgREST/PostgreSQL.
  const bridge=createServer(async(req,res)=>{try{
    const reply=data=>{res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(data));};
    if(req.url.startsWith("/auth/v1/user"))return reply({id:user,email:"payer@example.test",email_confirmed_at:"2026-01-01T00:00:00Z",app_metadata:{},user_metadata:{}});
    if(req.url.startsWith("/rest/v1/member_profiles") && req.url.includes("email=eq."))return reply([]);
    if(req.url.startsWith("/rest/v1/member_profiles"))return reply({id:booker,user_id:user,display_name:"Local Booker",email:"payer@example.test",created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    if(req.url.startsWith("/rest/v1/member_consents"))return reply(null);
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const upstream=await fetch(`http://127.0.0.1:${restPort}${req.url.replace(/^\/rest\/v1/,"")}`,{method:req.method,headers:{...req.headers,host:`127.0.0.1:${restPort}`},body:["GET","HEAD"].includes(req.method)?undefined:Buffer.concat(chunks)});res.writeHead(upstream.status,Object.fromEntries([...upstream.headers].filter(([name])=>!["content-encoding","transfer-encoding","content-length"].includes(name))));res.end(Buffer.from(await upstream.arrayBuffer()));}catch{res.writeHead(502);res.end();}});
  await new Promise(resolve=>bridge.listen(0,"127.0.0.1",resolve));
  const url=`http://127.0.0.1:${bridge.address().port}`,site="http://127.0.0.1:3199";
  let next,browser; const nextLog=openSync(path.join(directory,"browser-next.log"),"a");
  try {
    await db.query("grant usage on schema private to service_role; grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role; grant select on events to anon");
    for(let i=0;i<40;i++){try{if((await fetch(`http://127.0.0.1:${restPort}/`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
    await db.query("insert into events(slug,status,registration_state,requires_approval,allow_proxy_registrations) values('browser-approval','published','open',true,true)");
    const pending=(await db.query("insert into pending_registrations(event_slug,member_id,registration_kind,participant_key,contact_name,contact_email,consent_given,token_hash,expires_at) values('browser-approval',$1,'proxy',$2,'Browser Friend','payer@example.test',true,$3,'2099-01-01') returning *",[booker,randomUUID(),randomUUID()])).rows[0];
    const ticket=(await db.query("insert into registrations(event_slug,booker_member_id,registration_kind,attendee_confirmation_status,contact_name,contact_email,consent_given,pending_registration_id) values('browser-approval',$1,'proxy','pending','Browser Friend','payer@example.test',true,$2) returning *",[booker,pending.id])).rows[0];
    const token=randomBytes(32).toString("hex");
    const {createHash}=await import("node:crypto");
    await db.query("select issue_registration_guest_invitation($1,$2,'2099-01-01','staff')",[ticket.id,createHash("sha256").update(token).digest("hex")]);
    next=spawn(process.execPath,[path.join(appRoot,"node_modules/next/dist/bin/next"),"dev","--hostname","127.0.0.1","--port","3199"],{cwd:appRoot,windowsHide:true,stdio:["ignore",nextLog,nextLog],env:{...process.env,EVENT_WAIVER_ENCRYPTION_KEY:encryptionKey,RESEND_API_KEY:"",STRIPE_SECRET_KEY:"",NODE_ENV:"development",NEXT_TELEMETRY_DISABLED:"1",MEDUSA_BACKEND_URL:"",NEXT_PUBLIC_SITE_URL:site,NEXT_PUBLIC_SUPABASE_URL:url,SUPABASE_SECRET_KEY:sign("service_role"),NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:sign("anon")} });
    for(let i=0;i<80;i++){try{if((await fetch(site+"/events/guest/invalid")).ok)break;}catch{}await new Promise(r=>setTimeout(r,400));}
    browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on("pageerror",error=>errors.push(error.message));
    await page.goto(`${site}/events/guest/${token}`);
    await page.getByLabel("Your full legal name / electronic signature").fill("Browser Friend");await page.getByRole("checkbox").check();await page.getByRole("button",{name:"Accept and sign"}).click();
    await page.getByText(/Awaiting staff approval/).waitFor(); assert.equal(await page.getByRole("img",{name:"Your personal event ticket"}).count(),0);
    assert.equal((await db.query("select attendee_confirmation_status from registrations where id=$1",[ticket.id])).rows[0].attendee_confirmation_status,"accepted");
    const out=path.join(root,"output/event-proxy-registration");mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,"approval-pending-mobile-en.png"),fullPage:true});
    assert.equal(await page.locator("body").evaluate(body=>body.scrollWidth<=window.innerWidth),true);
    await db.query("select review_proxy_registration($1,true,'staff')",[ticket.id]);
    await page.context().addCookies([{name:"lang",value:"zh",url:site}]);await page.setViewportSize({width:1280,height:900});await page.reload();await page.getByRole("img",{name:"你的个人活动票据"}).waitFor();
    await page.screenshot({path:path.join(out,"approval-approved-desktop-zh.png"),fullPage:true});assert.deepEqual(errors,[]);
    const accessToken=sign("authenticated");
    await page.context().addCookies([{name:"sb-127-auth-token",value:"base64-"+Buffer.from(JSON.stringify({access_token:accessToken,refresh_token:"isolated-refresh",token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,email:"payer@example.test"}})).toString("base64url"),url:site},{name:"lang",value:"en",url:site}]);
    for(const [slug,model,approval,email] of [["browser-full","full_prepay",true,""],["browser-deposit","deposit",true,"friend@example.test"],["browser-trip","deposit",false,""]]) {
      await db.query("insert into events(slug,status,registration_state,title_en,title_zh,event_date,capacity,requires_approval,allow_proxy_registrations,payment_model,deposit_amount,full_payment_amount,waiver_text_en) values($1,'published','open','Local event','本地活动','2099-01-01',50,$2,true,$3,99,118,'Local event waiver')",[slug,approval,model]);
      await page.goto(`${site}/events/${slug}`);
      await page.getByRole("radio",{name:"A friend",exact:true}).check();
      assert.equal(await page.getByRole("link",{name:"hello@snow-force.com",exact:true}).first().getAttribute("href"),"mailto:hello@snow-force.com");
      await page.getByLabel(/^Name/).fill("Local Friend");
      if(email)await page.getByLabel(/Friend’s email/).fill(email);
      await page.getByRole("checkbox",{name:/My friend has permitted/}).check();
      await page.getByRole("button",{name:"Submit Registration",exact:true}).click();
      await page.getByRole("button",{name:model==="deposit"?/Pay deposit.*99.*USD/:/Pay full.*118.*USD/}).waitFor();
      const saved=(await db.query("select * from pending_registrations where event_slug=$1",[slug])).rows;
      assert.equal(saved.length,1);assert.equal(saved[0].registration_kind,"proxy");assert.equal(saved[0].contact_email,"payer@example.test");assert.equal(saved[0].attendee_email,email||null);assert.equal(saved[0].typed_name,null);assert.equal(saved[0].checkout_attempt,null);
      await page.screenshot({path:path.join(out,`${slug}-payment.png`),fullPage:true});
    }
    assert.deepEqual(errors,[]);
    if(process.argv.includes("--v2")) {
      const {verifyEventGroupBrowser}=await import("./test-event-group-browser.mjs");
      await verifyEventGroupBrowser({db,browser,page,site,booker,encryptionKey,output:path.join(root,"output"),nextLog:path.join(directory,"browser-next.log")});
    }
    writeFileSync(path.join(root,"output/event-proxy-registration-browser-20261023.json"),JSON.stringify({verifiedAt:new Date().toISOString(),target:"isolated localhost",productionWrites:0,checks:["mobile EN signature through real server action","pending approval hides ticket QR","PostgreSQL approval unlocks desktop ZH ticket on reload","all three open-event payment/approval combinations submit a friend through the real form and server action","friend email is optional; payer identity remains the authenticated booker","saved friend registration opens the matching payment step without a proxy signature","event contact mailto is hello@snow-force.com","no page errors or mobile overflow"]},null,2));
    console.log("PASS local Next approval journey and all three paid friend submission flows through real server actions and PostgreSQL");
  } catch(error) {
    if(browser)for(const context of browser.contexts())for(const page of context.pages()) {
      writeFileSync(path.join(directory,"browser-failure.html"),await page.content());
      console.error((await page.locator("body").innerText()).slice(-5000));
    }
    throw error;
  } finally {
    await browser?.close();
    if(next){if(process.platform==="win32")spawnSync("taskkill",["/PID",String(next.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});else next.kill();}
    rest.kill();await new Promise(resolve=>bridge.close(resolve));closeSync(restLog);closeSync(nextLog);
  }
}
