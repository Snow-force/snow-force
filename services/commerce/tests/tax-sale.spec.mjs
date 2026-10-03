import {createRequire} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {saleFixture,saleDatabase,saleProvider} from './fixtures/tax-sale.mjs';
const require=createRequire(import.meta.url);require('ts-node/register/transpile-only');
const contract=require('../src/lib/tax-sale-contract.ts'),ledger=require('../src/lib/tax-sale-ledger.ts'),worker=require('../src/lib/tax-sale-worker.ts'),sourceService=require('../src/lib/tax-sale-source.ts');
const staff={actor_type:'user',actor_id:'user_staff'};
async function prepared(){const f=saleFixture(),db=saleDatabase(f.source),task=await ledger.reserveTaxSale(db.db,f.source),p=saleProvider(f.source,task.id);return {...f,...db,provider:p.provider,providerState:p.state,transaction:p.transaction,lines:p.lines,intent:p.intent,task,read:async()=>structuredClone(f.source)};}
test('sale reservation persists the original immutable request and reuses its identity after duplicate events',async()=>{
  const f=await prepared(),old=structuredClone(f.state.task);f.state.now+=86400000;
  assert.equal((await ledger.reserveTaxSale(f.db,f.source)).id,f.task.id);assert.deepEqual(f.state.task,old);assert.equal(f.state.writes,1);
  await assert.rejects(()=>ledger.reserveTaxSale(f.db,{...f.source,capture_id:'cap_other'}));assert.deepEqual(f.state.task,old);
  const corrupted=structuredClone(f.state.task);corrupted.request.posted_at++;assert.throws(()=>ledger.checkedTaxSaleTask({...corrupted,database_now:f.state.now}));
});
test('full native capture plus current Stripe succeeded evidence records exactly one tax sale; duplicate work is empty',async()=>{
  const f=await prepared();process.env.COMMERCE_TAX_POLICY_CONFIRMED='false';
  assert.equal((await worker.processTaxSale(f.scope,f.provider,f.read)).status,'ready');assert.equal(f.state.sales.length,1);assert.equal(f.state.task.state,'ready');assert.equal(f.state.task.remote_id,'tax_sale');
  assert.equal(f.state.posts,undefined);assert.equal(f.provider.create instanceof Function,true);assert.deepEqual(f.state.sales[0].snapshot.lines,f.lines);assert.equal(f.state.sales[0].snapshot.total_cents,10995);
  assert.equal(await worker.processTaxSale(f.scope,f.provider,f.read),null);assert.equal((await ledger.reserveTaxSale(f.db,f.source)).id,f.task.id);
});
test('funds are verified against account, mode, full capture, intent and session before any tax POST',async()=>{
  for(const mutate of [f=>{f.provider.account=async()=>({id:'acct_other'})},f=>{f.provider.livemode=true},f=>{f.intent.amount_received--},f=>{f.intent.status='requires_capture'},f=>{f.intent.amount_capturable=1},f=>{f.intent.metadata.session_id='payses_other'},f=>{f.intent.id='pi_other'},f=>{f.intent.currency='eur'}]){
    const f=await prepared();mutate(f);const r=await worker.processTaxSale(f.scope,f.provider,f.read);assert.equal(r.status,'reconcile_required');assert.equal(f.providerState.posts.length,0);assert.equal(f.state.sales.length,0);
  }
});
test('an unknown create result retries with identical payload and key after a simulated process restart',async()=>{
  const f=await prepared();f.providerState.failCreate=new Error('Lost response');
  assert.equal((await worker.processTaxSale(f.scope,f.provider,f.read)).status,'retry');assert.equal(f.state.task.remote_id,null);
  f.state.now+=180000;f.providerState.failCreate=null;
  assert.equal((await worker.processTaxSale(f.scope,f.provider,f.read)).status,'ready');assert.equal(f.providerState.posts.length,2);assert.deepEqual(f.providerState.posts[0],f.providerState.posts[1]);assert.equal(f.state.sales.length,1);
});
test('a saved remote ID recovers with GET only, even after the idempotency retry window ends',async()=>{
  const f=await prepared();f.providerState.failRead=true;
  assert.equal((await worker.processTaxSale(f.scope,f.provider,f.read)).status,'retry');assert.equal(f.state.task.remote_id,'tax_sale');
  f.state.now+=2*86400000;f.providerState.failRead=false;
  assert.equal((await worker.processTaxSale(f.scope,f.provider,f.read)).status,'ready');assert.equal(f.providerState.posts.length,1);
});
test('long unknown requests and expired leases cannot create another sale',async()=>{
  const f=await prepared();f.providerState.failCreate=new Error('Lost response');await worker.processTaxSale(f.scope,f.provider,f.read);f.state.now+=22*3600000;
  assert.equal(await worker.processTaxSale(f.scope,f.provider,f.read),null);assert.equal(f.state.task.state,'reconcile_required');assert.equal(f.state.task.error_code,'request_aged');assert.equal(f.providerState.posts.length,1);
  const g=await prepared(),claim=await ledger.claimTaxSale(g.db);g.state.now+=180001;
  await assert.rejects(()=>ledger.assertTaxSaleLease(g.db,claim,true));await assert.rejects(()=>ledger.rememberTaxSaleId(g.db,claim,'tax_sale'));assert.equal(g.state.task.remote_id,null);
  const newer=await ledger.claimTaxSale(g.db);assert.notEqual(claim.claim_token,newer.claim_token);await assert.rejects(()=>ledger.deferTaxSale(g.db,claim,'provider_unavailable'));
});
test('transaction or individual line mismatches fail without committing or submitting another tax sale',async()=>{
  for(const mutate of [f=>{f.transaction.reference='other'},f=>{f.transaction.livemode=true},f=>{f.transaction.posted_at++},f=>{f.transaction.tax_date++},f=>{f.transaction.metadata.snowforce_capture='cap_other'},f=>{f.transaction.customer_details.address.postal_code='00000'},f=>{f.transaction.ship_from_details.address.line1='Other'},f=>{f.transaction.shipping_cost.amount_tax++},f=>{f.lines[0].amount--},f=>{f.lines[0].amount_tax++},f=>{f.lines[0].quantity++},f=>{f.lines[0].tax_code='txcd_other'},f=>{f.lines[0].reference='cali_other'},f=>{f.lines[0].livemode=true}]){
    const f=await prepared();mutate(f);assert.equal((await worker.processTaxSale(f.scope,f.provider,f.read)).status,'reconcile_required');assert.equal(f.state.sales.length,0);assert.equal(f.providerState.posts.length,1);
  }
});
test('complete pagination is required and duplicates, missing or unsupported extra lines are rejected',async()=>{
  const f=await prepared();f.providerState.pages=cursor=>cursor?{object:'list',has_more:false,data:[]}:{object:'list',has_more:true,data:f.lines};
  assert.equal((await worker.processTaxSale(f.scope,f.provider,f.read)).status,'ready');
  for(const pages of [()=>({object:'list',has_more:true,data:[]}),()=>({object:'list',has_more:false,data:[]}),()=>({object:'list',has_more:true,data:f.lines}),()=>({object:'list',has_more:false,data:[...f.lines,...f.lines]})]){
    const g=await prepared();g.providerState.pages=pages;assert.equal((await worker.processTaxSale(g.scope,g.provider,g.read)).status,'reconcile_required');assert.equal(g.state.sales.length,0);
  }
});
test('staff can reconcile an existing remote sale by GET only, and failed reconciliation never enables POST',async()=>{
  const f=await prepared();f.state.task.state='reconcile_required';f.state.task.first_attempt_at=f.state.now-25*3600000;
  assert.equal((await worker.reconcileTaxSale(f.scope,staff,f.task.id,{transaction_id:'tax_sale'},f.provider,f.read)).status,'ready');assert.equal(f.providerState.posts.length,0);assert.deepEqual(f.state.sales[0].resolution,{source:'staff_reconciliation',staff_id:staff.actor_id,transaction_id:'tax_sale'});
  const g=await prepared();g.state.task.state='reconcile_required';g.providerState.failRead=true;
  assert.equal((await worker.reconcileTaxSale(g.scope,staff,g.task.id,{transaction_id:'tax_sale'},g.provider,g.read)).status,'reconcile_required');assert.equal(g.state.task.state,'reconcile_required');assert.equal(await worker.processTaxSale(g.scope,g.provider,g.read),null);assert.equal(g.providerState.posts.length,0);
});
test('authentication and strict IDs/body are checked before private reads or provider calls',async()=>{
  const scope={resolve:()=>assert.fail('No private read allowed')};
  for(const auth of [undefined,{actor_type:'customer',actor_id:'cus_staff'},{actor_type:'user',actor_id:'cus_staff'}]){
    await assert.rejects(()=>worker.adminTaxSales(scope,auth));await assert.rejects(()=>worker.reconcileTaxSale(scope,auth,'bad',{}));
  }
  for(const body of [{transaction_id:'tax_sale',amount:1},{transaction_id:'pi_sale'},{}])await assert.rejects(()=>worker.reconcileTaxSale(scope,staff,'123e4567-e89b-42d3-a456-426614174099',body));
});
test('changed sale evidence never posts; transactional completion rolls back if final state update fails',async()=>{
  const f=await prepared();assert.equal((await worker.processTaxSale(f.scope,f.provider,async()=>({...f.source,capture_id:'cap_other'}))).status,'reconcile_required');assert.equal(f.providerState.posts.length,0);
  const g=await prepared(),claim=await ledger.claimTaxSale(g.db);await ledger.rememberTaxSaleId(g.db,claim,'tax_sale');const valid=contract.assertTaxSaleTransaction(g.source,g.task.id,g.transaction,g.lines);
  const raw=g.db.raw;g.db.raw=async(sql,v)=>sql.includes("set state='ready'")?{rows:[]}:raw(sql,v);
  await assert.rejects(()=>ledger.completeTaxSale(g.db,claim,valid));assert.equal(g.state.sales.length,0);assert.equal(g.state.task.state,'running');
  const race=await prepared();let reads=0;assert.equal((await worker.processTaxSale(race.scope,race.provider,async()=>++reads===1?race.source:{...race.source,capture_id:'cap_changed'})).status,'reconcile_required');assert.equal(race.state.sales.length,0);assert.equal(race.state.task.remote_id,'tax_sale');assert.equal(race.providerState.posts.length,1);
});
test('native sale source requires completed original cart, unique links, exact raw money, bound private quote and one full capture',async()=>{
  for(const kind of ['valid','uncompleted','capture','multiple','raw','order_receipt','session','mode','customer','payment_count','bound','snapshot']){
    const f=saleFixture();if(kind==='uncompleted')f.cart.completed_at=null;if(kind==='capture')f.native.captures[0].amount='109.94';if(kind==='multiple')f.native.captures.push({...f.native.captures[0],id:'cap_other'});if(kind==='raw')f.native.raw_amount.value='109.94';if(kind==='order_receipt')f.native.order_receipt={};if(kind==='session')f.native.data.metadata.session_id='other';if(kind==='mode')f.native.data.livemode=true;if(kind==='customer')f.native.customer_id='cus_other';if(kind==='payment_count')f.native.payment_count='2';if(kind==='bound')f.proof.bound_at=f.proof.snapshot.expires_at;if(kind==='snapshot')f.proof.snapshot.amounts.total_cents++;
    f.nativeCart={...f.nativeCart,completed_at:f.cart.completed_at};
    const scope={resolve:key=>key==='query'?{graph:async({fields})=>({data:[fields.includes('shipping_tax_total')?f.nativeCart:f.cart]})}:key==='__pg_connection__'?{raw:async sql=>({rows:sql.startsWith('select o.id as order_id')?[f.native]:sql.includes('from commerce.snowforce_tax_quotes q join')?[f.proof]:assert.fail(sql)})}:assert.fail(key)};
    if(kind==='valid')assert.deepEqual(await sourceService.readCapturedTaxSale(scope,f.source.order_id),f.source);else await assert.rejects(()=>sourceService.readCapturedTaxSale(scope,f.source.order_id));
  }
});
test('admin results expose financial status without source addresses, secrets or private request payloads',async()=>{
  const f=await prepared(),r=await worker.adminTaxSales(f.scope,staff);assert.equal(r.tasks[0].total_cents,10995);for(const field of ['receipt','input','calculation','source','request'])assert.ok(!Object.hasOwn(r.tasks[0],field));
  assert.equal(await worker.processTaxSale(saleDatabase().scope),null);
});
test('the dedicated SDK uses stable sale keys, validates IDs and exposes no funds mutation API',async()=>{
  const Stripe=require('stripe'),oldKey=process.env.COMMERCE_STRIPE_API_KEY,probe=new Stripe('sk_test_fixture');
  const txPrototype=Object.getPrototypeOf(probe.tax.transactions),intentPrototype=Object.getPrototypeOf(probe.paymentIntents),accountPrototype=Object.getPrototypeOf(probe.accounts),calls=[];
  const old={retrieveCurrent:accountPrototype.retrieveCurrent,intent:intentPrototype.retrieve,create:txPrototype.createFromCalculation,retrieve:txPrototype.retrieve,lines:txPrototype.listLineItems};
  accountPrototype.retrieveCurrent=async()=>({id:'acct_fixture'});intentPrototype.retrieve=async id=>({id});
  txPrototype.createFromCalculation=async(request,options)=>{calls.push({request,options});return {id:'tax_sdk'}};
  txPrototype.retrieve=async id=>({id});txPrototype.listLineItems=async(id,options)=>({id,options});
  try{
    process.env.COMMERCE_STRIPE_API_KEY='sk_test_fixture';const provider=worker.createTaxSaleProvider();assert.equal(provider.livemode,false);assert.deepEqual(await provider.account(),{id:'acct_fixture'});assert.deepEqual(await provider.intent('pi_sdk'),{id:'pi_sdk'});
    const request={calculation:'taxcalc_fixture',reference:'fixed',posted_at:123};await provider.create(request,'stable-key');assert.deepEqual(calls,[{request,options:{idempotencyKey:'stable-key'}}]);
    assert.deepEqual(await provider.retrieve('tax_sdk'),{id:'tax_sdk'});assert.deepEqual(await provider.lines('tax_sdk','tax_li_cursor'),{id:'tax_sdk',options:{limit:100,starting_after:'tax_li_cursor'}});assert.deepEqual(await provider.lines('tax_sdk'),{id:'tax_sdk',options:{limit:100}});
    assert.throws(()=>provider.retrieve('pi_sdk'));assert.ok(!Object.hasOwn(provider,'capture'));assert.ok(!Object.hasOwn(provider,'refund'));
    process.env.COMMERCE_STRIPE_API_KEY='sk_live_fixture';assert.equal(worker.createTaxSaleProvider().livemode,true);delete process.env.COMMERCE_STRIPE_API_KEY;assert.throws(()=>worker.createTaxSaleProvider(),/unavailable/);
  }finally{accountPrototype.retrieveCurrent=old.retrieveCurrent;intentPrototype.retrieve=old.intent;txPrototype.createFromCalculation=old.create;txPrototype.retrieve=old.retrieve;txPrototype.listLineItems=old.lines;if(oldKey===undefined)delete process.env.COMMERCE_STRIPE_API_KEY;else process.env.COMMERCE_STRIPE_API_KEY=oldKey;}
});
test('missing provider configuration defers durably and invalid requests require reconciliation',async()=>{
  const old=process.env.COMMERCE_STRIPE_API_KEY;delete process.env.COMMERCE_STRIPE_API_KEY;
  try{const f=await prepared();assert.equal((await worker.processTaxSale(f.scope,undefined,f.read)).status,'retry');assert.equal(f.state.task.error_code,'provider_unavailable');const g=await prepared();assert.equal((await worker.reconcileTaxSale(g.scope,staff,g.task.id,{transaction_id:'tax_sale'},undefined,g.read)).status,'reconcile_required');assert.equal(g.state.task.state,'reconcile_required');}
  finally{if(old!==undefined)process.env.COMMERCE_STRIPE_API_KEY=old;}
  const f=await prepared(),Stripe=require('stripe');f.providerState.failCreate=new Stripe.errors.StripeInvalidRequestError({message:'Calculation expired'});assert.equal((await worker.processTaxSale(f.scope,f.provider,f.read)).status,'reconcile_required');assert.equal(f.state.task.state,'reconcile_required');assert.equal(f.providerState.posts.length,1);
});
test('database discovery recovers missed capture events and sanitized exceptions are visible without stopping other orders',async()=>{
  const f=await prepared(),raw=f.db.raw,logs=[];f.db.raw=(sql,v)=>sql.startsWith('select distinct o.id')?Promise.resolve({rows:[{order_id:f.source.order_id},{order_id:'order_bad'}]}):raw(sql,v);
  const scope={resolve:key=>key==='logger'?{error:message=>logs.push(message)}:f.scope.resolve(key)};
  await worker.discoverTaxSales(scope,async(_scope,id)=>{if(id==='order_bad')throw new Error('postgres://private fixture secret');return f.source});
  assert.equal(f.state.writes,1);assert.deepEqual(logs,['Sale tax evidence needs review for order_bad.']);
});
test('tax transactions preserve discounted merchandise, shipping sales tax and a separate fixed government fee',async()=>{
  const {applicationFixture}=await import('./fixtures/tax-application.mjs'),f=await applicationFixture({state:'CO',fee:28,itemTax:154,shippingTax:87});
  const raw=[...f.results.values()][0],source={...saleFixture().source,input:f.prepared.quote.input,calculation:raw.calculation};
  source.cart_id=source.input.cart_id;source.customer_id=source.input.customer_id;source.quote_id=f.prepared.quote_id;source.captured_at=source.input.tax_date+2;
  source.receipt={quote_id:source.quote_id,cart_id:source.cart_id,customer_id:source.customer_id,account_id:source.input.account_id,livemode:false,total_cents:f.prepared.quote.amounts.total_cents,checkout_fingerprint:'a'.repeat(64),signature:'b'.repeat(64),expires_at:f.prepared.quote.expires_at};
  const p=saleProvider(source,'123e4567-e89b-42d3-a456-426614174099'),sale=contract.assertTaxSaleTransaction(source,'123e4567-e89b-42d3-a456-426614174099',p.transaction,p.lines);
  assert.equal(sale.transaction.shipping_cost.amount_tax,115);assert.equal(sale.total_cents,f.prepared.quote.amounts.total_cents);assert.equal(sale.lines[0].amount_tax,154);
  p.transaction.shipping_cost.amount_tax=87;assert.throws(()=>contract.assertTaxSaleTransaction(source,'123e4567-e89b-42d3-a456-426614174099',p.transaction,p.lines));
});
test('sale schema remains private and protects request identity, committed results, fixed posting date and unique sale bindings',()=>{
  const sql=readFileSync('../../supabase/migrations/20261003021222_shop_tax_sale_outbox.sql','utf8');
  for(const table of ['snowforce_tax_sale_tasks','snowforce_tax_sales']){assert.match(sql,new RegExp(`alter table commerce\.${table} enable row level security`));assert.match(sql,new RegExp(`alter table commerce\.${table} owner to snowforce_commerce`));}
  assert.match(sql,/from public,anon,authenticated,service_role/);assert.doesNotMatch(sql,/security definer|create policy|grant .* to (anon|authenticated)/i);assert.match(sql,/unique\(account_id,livemode,transaction_id\)/);assert.match(sql,/old\.state='ready'/);assert.match(sql,/old\.remote_id is not null/);assert.match(sql,/old\.first_attempt_at is not null/);
});
