// Optional real Stripe sandbox acceptance, invoked by the isolated DB runner.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire, Module } from "node:module";
import { readFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";

export async function verifyStripeSandbox({ root, db, config, directory, booker }) {
  const appRoot = process.env.EVENT_TEST_APP_ROOT ?? root;
  const v2 = process.argv.includes("--v2");
  const require = createRequire(path.join(appRoot, "package.json"));
  require("@next/env").loadEnvConfig(root);
  const key = process.env.STRIPE_SECRET_KEY;
  assert.match(key ?? "", /^(sk|rk|rkcs)_test_/, "This acceptance runner ONLY permits Stripe test keys");
  process.env.RESEND_API_KEY = "";
  process.env.EVENT_WAIVER_ENCRYPTION_KEY = "";
  const Stripe = require("stripe");
  const stripe = new Stripe(key);
  const externalCallbacks = (await stripe.webhookEndpoints.list({ limit: 100 })).data.filter((endpoint) =>
    endpoint.status === "enabled" && (v2 || endpoint.enabled_events.some((type) => type === "*" || type === "checkout.session.completed")) &&
    !["localhost","127.0.0.1"].includes(new URL(endpoint.url).hostname));
  assert.equal(externalCallbacks.length,0,"Use a separate Stripe sandbox without enabled external Checkout webhooks; this runner must not cause callbacks to production");
  const jwtSecret = randomBytes(32).toString("hex");
  const sign = (role) => {
    const body = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({ role, aud: "authenticated", exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url")].join(".");
    return body + "." + createHmac("sha256",jwtSecret).update(body).digest("base64url");
  };
  const jwt = sign("service_role");
  const log = openSync(path.join(directory, "postgrest.log"), "a");
  const pgRestPort = config.port + 1;
  const pgRest = spawn(path.join(root,".cache/tooling/postgrest-16.5/bin/postgrest.exe"), [], {
    windowsHide: true, stdio: ["ignore",log,log], env: { ...process.env,
      PATH: path.join(root,".cache/tooling/postgresql/pgsql/bin") + path.delimiter + process.env.PATH,
      PGRST_DB_URI: `postgresql://${config.user}@127.0.0.1:${config.port}/postgres`,
      PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "anon", PGRST_JWT_SECRET: jwtSecret,
      PGRST_SERVER_HOST: "127.0.0.1", PGRST_SERVER_PORT: String(pgRestPort) },
  });
  const bridge = createServer(async (req,res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const upstream = await fetch(`http://127.0.0.1:${pgRestPort}${req.url.replace(/^\/rest\/v1/, "")}`, {
        method: req.method, headers: { ...req.headers, host: `127.0.0.1:${pgRestPort}` },
        body: ["GET","HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      res.writeHead(upstream.status,Object.fromEntries([...upstream.headers].filter(([name]) => !["content-encoding","transfer-encoding","content-length"].includes(name))));
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch { res.writeHead(502); res.end("Isolated database bridge unavailable"); }
  });
  await new Promise((resolve) => bridge.listen(0,"127.0.0.1",resolve));
  const bridgePort = bridge.address().port;
  let browser;
  let nextDev;
  let nextLog;
  const sessions = [];
  const paidIntents = [];
  try {
    await db.query("grant usage on schema private to service_role; grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role;");
    for (let i=0;i<30;i++) {
      try { const response = await fetch(`http://127.0.0.1:${pgRestPort}/`,{ headers: { Authorization: `Bearer ${jwt}` } }); if (response.ok) break; }
      catch { /* wait for local PostgREST startup */ }
      await new Promise((resolve) => setTimeout(resolve,200));
    }
    process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${bridgePort}`;
    process.env.SUPABASE_SECRET_KEY = jwt;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = sign("anon");
    process.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:3199";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_" + randomBytes(24).toString("hex");
    // Transpile the real source in this isolated process, with only framework
    // request-context adapters replaced. Repositories, Stripe and SQL are real.
    const ts = require("typescript");
    const originalLoad = Module._load;
    Module._load = function(request,parent,isMain) {
      if (request === "server-only") return {};
      if (request === "next/cache") return { revalidatePath() {} };
      if (request.startsWith("@/")) request = path.join(appRoot,"src",request.slice(2));
      return originalLoad.call(this,request,parent,isMain);
    };
    for (const extension of [".ts",".tsx"]) Module._extensions[extension] = (module,filename) => {
      const compiled = ts.transpileModule(readFileSync(filename,"utf8"),{ compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
      } }); module._compile(compiled.outputText,filename);
    };
    const pendingRepo = require(path.join(root,"src/lib/registrations/pending-repository.ts"));
    const regRepo = require(path.join(root,"src/lib/registrations/repository.ts"));
    const eventRepo = require(path.join(root,"src/lib/events/repository.ts"));
    const { createCheckoutSessionResult } = require(path.join(root,"src/lib/payments/actions.ts"));
    const { POST } = require(path.join(root,"src/app/api/stripe/webhook/route.ts"));
    const { issueGuestInvitation,getGuestInvitation,respondGuestInvitation } = require(path.join(root,"src/lib/registrations/guest-invitations.ts"));
    await db.query(`insert into events(slug,status,registration_state,capacity,allow_proxy_registrations,payment_model,deposit_amount,deposit_currency,title_en)
      values('stripe-proxy-acceptance','published','open',2,true,'deposit',1,'usd','SnowForce TEST friend ticket')`);
    const pendingRows = [];
    if(v2) {
      const sha=text=>createHash("sha256").update(text).digest("hex");
      const adult="Sandbox adult risk acknowledgement. The named attendee personally reviews and signs their individual event terms. No marketing or photo permission is included.";
      const guardian="Sandbox parent or legal guardian acknowledgement. The named guardian signs using their own legal name for one child. No marketing or photo permission is included.";
      await db.query("update events set event_date='2099-11-07' where slug='stripe-proxy-acceptance'");
      await db.query("select save_event_waiver_policy('stripe-proxy-acceptance','America/Los_Angeles',$1,$2,$3,$4,'sandbox-staff',true,true)",[adult,guardian,sha(adult),sha(guardian)]);
      const participants=[1,2].map(i=>({key:randomUUID(),kind:"proxy",name:`Test Friend ${i}`,dateOfBirth:"2080-01-01",attendeeEmail:`test-friend-${i}@example.test`,recipientEmail:`test-friend-${i}@example.test`,identityFingerprint:sha(`Test Friend ${i}|2080-01-01`),answers:{name:`Test Friend ${i}`,email:`test-friend-${i}@example.test`},quotedAmount:1}));
      const booking=(await db.query("select create_event_booking_v2('stripe-proxy-acceptance',$1,'proxy-acceptance@example.test',$2,$3,'en',$4) as id",[booker,randomUUID(),sha(JSON.stringify(participants)),JSON.stringify(participants)])).rows[0].id;
      for(const row of (await db.query("select id from pending_registrations where booking_id=$1 order by contact_name",[booking])).rows)pendingRows.push(await pendingRepo.getPendingRegistrationById(row.id));
    } else for (let i=0;i<2;i++) pendingRows.push(await pendingRepo.createOrRefreshPendingRegistration({
      eventSlug: "stripe-proxy-acceptance", memberId: booker, registrationKind: "proxy", participantKey: randomUUID(), attendeeEmail: null,
      answers: { name: `Test Friend ${i+1}` }, consentGiven: true, contactEmail: "proxy-acceptance@example.test", contactName: `Test Friend ${i+1}`, contactPhone: "",
      tokenHash: randomUUID(), expiresAt: new Date(Date.now()+86400000).toISOString(), holdExpiresAt: new Date(Date.now()+1800000).toISOString(),
    }));
    const deps = { getStripe: () => stripe, getPendingRegistration: pendingRepo.getPendingRegistrationById,
      getEvent: eventRepo.getEventAdmin, getRegistrations: regRepo.getRegistrations,
      getRegistrationCount: regRepo.getRegistrationCountForEvent, compareCheckout: pendingRepo.comparePendingCheckout };
    for (const pending of pendingRows) {
      const concurrent = await Promise.all([1,2].map(() => createCheckoutSessionResult(deps,pending.id,{ memberMemberId: booker })));
      assert(concurrent.every((r) => r.success)); assert.equal(concurrent[0].url,concurrent[1].url);
      const current = await pendingRepo.getPendingRegistrationById(pending.id);
      const session = await stripe.checkout.sessions.retrieve(current.checkoutAttempt.sessionId);
      assert.equal(session.livemode,false); sessions.push(session);
    }
    assert.notEqual(sessions[0].id,sessions[1].id);
    console.log("PASS Stripe test sessions are distinct per friend and double-click resumes the same session");
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root,".cache/tooling/playwright-browsers");
    const playwright = require(process.env.EVENT_TEST_PLAYWRIGHT_MODULE ?? path.join(os.homedir(),".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
    browser = await playwright.chromium.launch({ headless: true });
    for (let i=0;i<sessions.length;i++) {
      const page = await browser.newPage({ viewport: i === 0 ? { width: 1280,height: 900 } : { width: 390,height: 844 } });
      page.on("requestfailed",(request) => console.log(`Stripe test browser resource: ${new URL(request.url()).hostname} ${request.failure()?.errorText}`));
      page.on("pageerror",(error) => console.log(`Stripe test browser: ${error.message.slice(0,120)}`));
      // No production URLs are contacted by the return navigation.
      await page.route("http://127.0.0.1:3199/**",(route) => route.fulfill({ status: 200,contentType: "text/html",body: "<p>SnowForce isolated test return</p>" }));
      await page.goto(sessions[i].url,{ waitUntil: "domcontentloaded" });
      await page.screenshot({ path: path.join(directory,`stripe-initial-${i+1}.png`),fullPage: true });
      writeFileSync(path.join(directory,`stripe-initial-${i+1}.json`),JSON.stringify({
        title: await page.title(), body: (await page.locator("body").innerText()).slice(0,4000),
        inputs: await page.locator("input").evaluateAll((inputs) => inputs.map((input) => ({ name: input.name,type: input.type,id: input.id }))),
      },null,2));
      await page.locator('input[name="email"]').fill("proxy-acceptance@example.test");
      const cardToggle = page.getByTestId("card-accordion-item-button");
      try { await cardToggle.waitFor({ state: "attached",timeout: 10000 }); }
      catch (error) {
        await page.screenshot({ path: path.join(directory,"stripe-blocked.png"),fullPage: true });
        writeFileSync(path.join(directory,"stripe-blocked.json"),JSON.stringify({
          body: await page.locator("body").innerText(),buttons: await page.locator("button").evaluateAll((buttons) => buttons.map((button) => ({
            name: button.getAttribute("aria-label"),testid: button.getAttribute("data-testid"),rect: button.getBoundingClientRect().toJSON(),
          }))),
        },null,2));
        throw error;
      }
      // Stripe uses a zero-size button with an expanded CSS click target.
      // Activate its accessible keyboard control instead of clicking the label underneath.
      await cardToggle.press("Enter");
      async function fillField(names,value) {
        const selector = names.map((name) => `input[name="${name}"]`).join(",");
        for (let retry=0;retry<30;retry++) {
          for (const frame of page.frames()) {
            const field = frame.locator(selector); if (await field.count() && await field.first().isVisible()) { await field.first().fill(value); return; }
          }
          await new Promise((resolve) => setTimeout(resolve,200));
        }
        const fields = []; for (const frame of page.frames()) fields.push(await frame.locator("input").evaluateAll((inputs) => inputs.map((input) => ({ name: input.name,id: input.id,type: input.type }))));
        writeFileSync(path.join(directory,"stripe-fields.json"),JSON.stringify(fields,null,2));
        throw new Error(`Stripe field unavailable: ${names.join("/")}`);
      }
      await fillField(["cardNumber","number"],"4242424242424242");
      await fillField(["cardExpiry","expiry"],"1230");
      await fillField(["cardCvc","cvc"],"123");
      await fillField(["billingName","name"],`Test Friend ${i+1}`);
      const country = page.locator('select[name="billingCountry"]'); if (await country.count()) await country.selectOption("US");
      const postal = page.locator('input[name="billingPostalCode"]'); if (await postal.count()) await postal.fill("98101");
      const saveWithLink = page.getByRole("checkbox",{ name: /Save my information/ });
      if (await saveWithLink.count() && await saveWithLink.isChecked()) await saveWithLink.uncheck();
      await page.screenshot({ path: path.join(directory,`stripe-checkout-${i+1}.png`),fullPage: true });
      await page.locator('button[type="submit"]').click();
      let completed;
      for (let j=0;j<60;j++) {
        completed = await stripe.checkout.sessions.retrieve(sessions[i].id);
        if (completed.payment_status === "paid") break;
        await new Promise((resolve) => setTimeout(resolve,1000));
      }
      assert.equal(completed.payment_status,"paid","Sandbox hosted Checkout must actually complete");
      paidIntents.push(completed.payment_intent);
      const payload = JSON.stringify({ id: `evt_proxy_acceptance_${i}`,object: "event",type: "checkout.session.completed",data: { object: completed } });
      const signature = stripe.webhooks.generateTestHeaderString({ payload,secret: process.env.STRIPE_WEBHOOK_SECRET });
      for (let delivery=0;delivery<2;delivery++) {
        const response = await POST(new Request("http://localhost/api/stripe/webhook",{ method: "POST",body: payload,headers: { "stripe-signature": signature } }));
        assert.equal(response.status,200,await response.text());
      }
      await page.close();
    }
    const registrations = await regRepo.getRegistrations("stripe-proxy-acceptance");
    assert.equal(registrations.length,2); assert(registrations.every((r) => r.memberId === null && r.bookerMemberId === booker && r.attendeeConfirmationStatus === "pending"));
    assert.notEqual(registrations[0].finance.stripePaymentIntentId,registrations[1].finance.stripePaymentIntentId);
    if(!v2) {
    const link = await issueGuestInvitation(registrations[0].id,booker);
    const token = link.split("/").at(-1);
    assert.equal((await getGuestInvitation(token)).attendeeName,registrations[0].contactName);
    if (process.argv.includes("--web")) {
      nextLog = openSync(path.join(directory,"next-dev.log"),"a");
      nextDev = spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"dev","--hostname","127.0.0.1","--port","3199"], {
        cwd: root,windowsHide: true,stdio: ["ignore",nextLog,nextLog],env: { ...process.env,NODE_ENV: "development",NEXT_TELEMETRY_DISABLED: "1",MEDUSA_BACKEND_URL: "" },
      });
      for (let retry=0;retry<60;retry++) {
        try { if ((await fetch("http://127.0.0.1:3199/events/guest/invalid")).ok) break; } catch { /* starting dev server */ }
        await new Promise((resolve) => setTimeout(resolve,500));
      }
      const page = await browser.newPage({ viewport: { width: 390,height: 844 } });
      const errors = []; page.on("pageerror",(error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:3199${link}`);
      await page.getByLabel("Your full legal name / electronic signature").fill("Test Friend One");
      await page.getByRole("checkbox").check();
      await page.getByRole("button",{ name: "Accept and sign" }).click();
      await page.getByRole("img",{ name: "Your personal event ticket" }).waitFor();
      await page.screenshot({ path: path.join(directory,"guest-ticket-mobile-en.png"),fullPage: true });
      assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth),true,"Mobile page must not overflow");
      assert.deepEqual(errors,[]);
      await page.context().addCookies([{ name: "lang",value: "zh",url: "http://127.0.0.1:3199" }]);
      await page.setViewportSize({ width: 1280,height: 900 }); await page.reload();
      await page.getByRole("img",{ name: "你的个人活动票据" }).waitFor();
      assert.equal(await page.getByRole("button",{ name: "接受并签署" }).count(),0);
      await page.screenshot({ path: path.join(directory,"guest-ticket-desktop-zh.png"),fullPage: true });
      await page.close();
      console.log("PASS real Next.js guest route → server action → local Postgres → personal QR ticket, EN/ZH and mobile layout");
    } else {
      assert.equal((await respondGuestInvitation({ token,accepted: true,typedName: "Test Friend One",signerRole: "attendee",attested: true })).success,true);
    }
    await db.query("select checkin_registration_guest($1,'sandbox-staff')",[registrations[0].id]);
    await assert.rejects(db.query("select checkin_registration_guest($1,'sandbox-staff')",[registrations[1].id]),/attendee_authorization_required/);
    } else {
      const waivers=(await db.query("select registration_id,status from event_waiver_assignments where registration_id=any($1::uuid[])",[registrations.map(r=>r.id)])).rows;
      assert.equal(waivers.length,2);assert(waivers.every(a=>a.status==="not_sent"));
      assert.equal(Number((await db.query("select count(*) from event_waiver_signatures where registration_id=any($1::uuid[])",[registrations.map(r=>r.id)])).rows[0].count),0);
      console.log("PASS V2 real paid webhooks create independent unsigned waiver assignments without allowing payer signatures or sending real mail");
    }
    for (const intent of paidIntents) {
      const refund = await stripe.refunds.create({ payment_intent: intent },{ idempotencyKey: `proxy-acceptance-cleanup-${intent}` });
      assert.equal(refund.status,"succeeded");
    }
    console.log(v2 ? "PASS V2 real hosted Checkout desktop/mobile, signed webhook replay and separate test refunds; personal signing verified by the local browser suite" : "PASS real hosted Checkout desktop/mobile, signed webhook replay, personal acceptance, and separate test refunds");
    writeFileSync(path.join(root, v2 ? "output/event-group-registration-v2-stripe-acceptance-20261023.json" : "output/event-proxy-registration-stripe-acceptance-20261022.json"),JSON.stringify({
      generatedAt: new Date().toISOString(),stripeMode: "test",productionDatabaseWrites: 0,
      distinctSessions: sessions.map((s) => s.id),distinctPaymentIntents: paidIntents,registrations: registrations.map((r) => r.id),
      signedWebhookDeliveries: 4,duplicateRegistrations: 0,refunds: "both test payments fully refunded",
      guestNextBrowser: process.argv.includes("--web") ? "passed mobile EN and desktop ZH; no page errors or mobile overflow" : "not run",
    },null,2));
  } finally {
    if (nextDev) {
      if (process.platform === "win32") spawnSync("taskkill",["/PID",String(nextDev.pid),"/T","/F"],{ windowsHide: true,stdio: "ignore" });
      else nextDev.kill();
    }
    if (nextLog !== undefined) closeSync(nextLog);
    await browser?.close();
    for (const session of sessions) {
      const current = await stripe.checkout.sessions.retrieve(session.id);
      if (current.status === "open") await stripe.checkout.sessions.expire(session.id);
      if (current.payment_status === "paid" && typeof current.payment_intent === "string") {
        const intent = await stripe.paymentIntents.retrieve(current.payment_intent,{ expand: ["latest_charge"] });
        if (intent.latest_charge && typeof intent.latest_charge === "object" && !intent.latest_charge.refunded)
          await stripe.refunds.create({ payment_intent: intent.id },{ idempotencyKey: `proxy-acceptance-cleanup-${intent.id}` });
      }
    }
    await new Promise((resolve) => bridge.close(resolve)); pgRest.kill(); closeSync(log);
  }
}
