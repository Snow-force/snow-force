// Manual development verification. Every fixture and optional DDL stays inside a final ROLLBACK.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {Client} from 'pg';
process.loadEnvFile('.env.development');
if(process.env.NODE_ENV==='production'||process.env.COMMERCE_TAX_POLICY_CONFIRMED==='true'||!process.env.COMMERCE_STRIPE_API_KEY?.startsWith('sk_test_'))throw new Error('Rollback verification requires the gated development sandbox.');
const require=createRequire(import.meta.url);require('ts-node/register/transpile-only');
const {saleFixture,saleProvider}=await import('../tests/fixtures/tax-sale.mjs');
const {quoteInput,quoteCalculation,quoteSetup,taxNativeCart}=await import('../tests/fixtures/tax-quote.mjs');
const ledger=require('../src/lib/tax-sale-ledger.ts'),worker=require('../src/lib/tax-sale-worker.ts'),sourceService=require('../src/lib/tax-sale-source.ts');
const quoteLedger=require('../src/lib/tax-quote-ledger.ts'),money=require('../src/lib/tax-quote-money.ts');
const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,ssl:{rejectUnauthorized:true,ca:process.env.DATABASE_CA_CERT.replace(/\\n/g,'\n')}});
const reviewing=process.argv.includes('--review-schema'),evidence={verified_at:new Date().toISOString(),review_schema:reviewing,actual_stripe_posts:0,final:'ROLLBACK',checks:[]};
const tables=['customer','cart','payment_collection','payment_session','payment','capture','order','order_cart','order_payment_collection','snowforce_tax_operations','snowforce_tax_quotes','snowforce_tax_quote_applications'];
let mutations=0,savepoint=0;
const db={raw:async(sql,values=[])=>{let index=0;if(/^\s*(insert|update|delete)/i.test(sql))mutations++;return client.query(sql.replace(/\?/g,()=>`$${++index}`),values)},transaction:async action=>{
  const name=`sale_verify_${++savepoint}`;await client.query(`savepoint ${name}`);try{const result=await action(db);await client.query(`release savepoint ${name}`);return result}catch(error){await client.query(`rollback to savepoint ${name}`);await client.query(`release savepoint ${name}`);throw error}
}};
async function counts(){const result={};for(const name of tables)result[name]=Number((await client.query(`select count(*) as count from commerce."${name}"`)).rows[0].count);for(const name of ['snowforce_tax_sale_tasks','snowforce_tax_sales'])result[name]=(await client.query('select to_regclass($1) as relation',[`commerce.${name}`])).rows[0].relation?Number((await client.query(`select count(*) as count from commerce."${name}"`)).rows[0].count):null;return result;}
try{
  await client.connect();assert.equal((await client.query('select current_user as role')).rows[0].role,'snowforce_commerce');
  evidence.before=await counts();assert.equal(evidence.before.order,0);assert.equal(evidence.before.capture,0);
  await client.query('begin');await client.query("set local lock_timeout='2s'");await client.query("set local statement_timeout='15s'");
  if(reviewing){const migrations=(await import('node:fs/promises')).readdir;const file=(await migrations('../../supabase/migrations')).filter(name=>/^\d{14}_shop_tax_sale_outbox\.sql$/.test(name));assert.equal(file.length,1);await client.query(await readFile(`../../supabase/migrations/${file[0]}`,'utf8'));}
  const f=saleFixture(),suffix=randomUUID().replaceAll('-',''),at=Math.floor(Date.now()/1000)-60;
  Object.assign(f.cart,{id:`cart_${suffix}`,customer_id:`cus_${suffix}`,completed_at:null,payment_collection:{...f.cart.payment_collection,id:`paycol_${suffix}`,payment_sessions:[{...f.cart.payment_collection.payment_sessions[0],id:`payses_${suffix}`,data:{id:`pi_${suffix}`}}]}});
  f.cart.items[0].id=`cali_${suffix}`;f.cart.shipping_methods[0].id=`casm_${suffix}`;
  const input=quoteInput(f.cart,at),calculation=quoteCalculation(input);calculation.id=`taxcalc_${suffix}`;
  const quote=money.normalizeStripeTaxQuote(input,calculation,at),quoteId=randomUUID(),receipt=quoteLedger.sealTaxQuoteReceipt(quoteId,quote,quoteSetup.fingerprint,f.cart,taxNativeCart(f.cart));
  f.cart.metadata={snowforce_tax_quote:receipt};f.cart.completed_at=new Date((at+1)*1000).toISOString();
  const sessionId=f.cart.payment_collection.payment_sessions[0].id,paymentId=`pay_${suffix}`,captureId=`cap_${suffix}`,orderId=`order_${suffix}`,collectionId=f.cart.payment_collection.id,intentId=`pi_${suffix}`,rawAmount=JSON.stringify({value:'109.95',precision:20});
  const providerData={id:intentId,object:'payment_intent',currency:'usd',livemode:false,status:'succeeded',amount:10995,amount_received:10995,amount_capturable:0,metadata:{session_id:sessionId}};
  await db.raw('insert into commerce.customer(id,email) values (?,?)',[f.cart.customer_id,`rollback-${suffix}@example.test`]);
  await db.raw("insert into commerce.cart(id,customer_id,currency_code,completed_at,metadata) values (?,?,'usd',clock_timestamp(),?::jsonb)",[f.cart.id,f.cart.customer_id,JSON.stringify(f.cart.metadata)]);
  await db.raw("insert into commerce.payment_collection(id,currency_code,amount,raw_amount) values (?,'usd',109.95,?::jsonb)",[collectionId,rawAmount]);
  await db.raw("insert into commerce.payment_session(id,currency_code,amount,raw_amount,provider_id,data,status,payment_collection_id,metadata,created_at) values (?,'usd',109.95,?::jsonb,'pp_stripe_stripe',?::jsonb,'authorized',?,?::jsonb,to_timestamp(?))",[sessionId,rawAmount,JSON.stringify(providerData),collectionId,JSON.stringify({snowforce_payment_creation:{cart_id:f.cart.id,customer_id:f.cart.customer_id,quote:receipt.checkout_fingerprint,livemode:false}}),at]);
  await db.raw("insert into commerce.payment(id,amount,raw_amount,currency_code,provider_id,data,payment_collection_id,payment_session_id,captured_at) values (?,109.95,?::jsonb,'usd','pp_stripe_stripe',?::jsonb,?,?,to_timestamp(?))",[paymentId,rawAmount,JSON.stringify(providerData),collectionId,sessionId,at+2]);
  await db.raw('insert into commerce.capture(id,amount,raw_amount,payment_id,created_at) values (?,109.95,?::jsonb,?,to_timestamp(?))',[captureId,rawAmount,paymentId,at+2]);
  await db.raw('insert into commerce."order"(id,customer_id,currency_code,metadata) values (?,?,\'usd\',?::jsonb)',[orderId,f.cart.customer_id,JSON.stringify(f.cart.metadata)]);
  await db.raw('insert into commerce.order_cart(id,order_id,cart_id) values (?,?,?)',[`linkc_${suffix}`,orderId,f.cart.id]);
  await db.raw('insert into commerce.order_payment_collection(id,order_id,payment_collection_id) values (?,?,?)',[`linkp_${suffix}`,orderId,collectionId]);
  await db.raw('insert into commerce.snowforce_tax_operations(id,cart_id,customer_id,input,setup_fingerprint,namespace,binding_fingerprint,request_fingerprint,request,created_at) values (?,?,?,?::jsonb,?,?,?,?,?::jsonb,to_timestamp(?))',[quoteId,f.cart.id,f.cart.customer_id,JSON.stringify(input),quoteSetup.fingerprint,'f'.repeat(64),quote.binding_fingerprint,quote.request_fingerprint,JSON.stringify(money.buildStripeTaxQuoteRequest(input)),at]);
  await db.raw('insert into commerce.snowforce_tax_quotes(id,cart_id,customer_id,calculation_id,account_id,livemode,setup_fingerprint,binding_fingerprint,request_fingerprint,tax_date,expires_at,total_cents,input,calculation,snapshot) values (?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?::jsonb)',[quoteId,f.cart.id,f.cart.customer_id,calculation.id,quote.account_id,false,quoteSetup.fingerprint,quote.binding_fingerprint,quote.request_fingerprint,quote.tax_date,quote.expires_at,quote.amounts.total_cents,JSON.stringify(input),JSON.stringify(calculation),JSON.stringify(quote)]);
  await db.raw("update commerce.snowforce_tax_operations set state='ready',completed_at=clock_timestamp() where id=?",[quoteId]);
  await db.raw('insert into commerce.snowforce_tax_quote_applications(quote_id,receipt,payment_session_id,bound_at,created_at) values (?,?::jsonb,?,to_timestamp(?),to_timestamp(?))',[quoteId,JSON.stringify(receipt),sessionId,at+1,at]);
  const scope={resolve:key=>key==='__pg_connection__'?db:key==='query'?{graph:async()=>({data:[taxNativeCart(f.cart)]})}:assert.fail(`Unexpected dependency ${key}`)};
  const source=await sourceService.readCapturedTaxSale(scope,orderId);assert.equal(source.capture_id,captureId);evidence.checks.push('Actual native capture and private applied quote SQL agree');
  const task=await ledger.reserveTaxSale(db,source),repeated=await ledger.reserveTaxSale(db,source);assert.equal(task.id,repeated.id);
  await assert.rejects(()=>db.transaction(tx=>tx.raw('update commerce.snowforce_tax_sale_tasks set request=?::jsonb where id=?',[JSON.stringify({...task.request,posted_at:at}),task.id])),error=>error.code==='23514');
  const claim=await ledger.claimTaxSale(db);assert.equal(await ledger.claimTaxSale(db),null);evidence.checks.push('One fenced claimant and immutable original request');
  const provider=saleProvider(source,task.id),snapshot=require('../src/lib/tax-sale-contract.ts').assertTaxSaleTransaction(source,task.id,provider.transaction,provider.lines);
  await ledger.rememberTaxSaleId(db,claim,provider.transaction.id);
  const failing={...db,transaction:action=>db.transaction(tx=>action({...tx,raw:(sql,values)=>sql.includes("set state='ready'")?Promise.resolve({rows:[]}):tx.raw(sql,values)}))};
  await assert.rejects(()=>ledger.completeTaxSale(failing,claim,snapshot));assert.equal(Number((await client.query('select count(*) as count from commerce.snowforce_tax_sales')).rows[0].count),0);evidence.checks.push('Final update failure rolls back result insertion');
  await ledger.completeTaxSale(db,claim,snapshot);assert.equal((await client.query('select state from commerce.snowforce_tax_sale_tasks where id=$1',[task.id])).rows[0].state,'ready');
  await assert.rejects(()=>db.transaction(tx=>tx.raw('delete from commerce.snowforce_tax_sales where task_id=?',[task.id])),error=>error.code==='23514');
  await assert.rejects(()=>db.transaction(tx=>tx.raw("update commerce.snowforce_tax_sale_tasks set state='retry' where id=?",[task.id])),error=>error.code==='23514');evidence.checks.push('Successful result commits atomically and cannot be deleted or reopened');
  for(const role of ['anon','authenticated','service_role']){const r=await client.query("select has_table_privilege($1,'commerce.snowforce_tax_sale_tasks','SELECT') as tasks,has_table_privilege($1,'commerce.snowforce_tax_sales','SELECT') as sales",[role]);assert.equal(r.rows[0].tasks,false);assert.equal(r.rows[0].sales,false);}evidence.checks.push('Public, customer and service-role Data API privileges remain revoked');
  evidence.mutation_attempts=mutations;
  await client.query('rollback');evidence.after=await counts();assert.deepEqual(evidence.after,evidence.before);
  evidence.tax_tables_exist_after=Boolean((await client.query("select to_regclass('commerce.snowforce_tax_sale_tasks') as tasks")).rows[0].tasks);assert.equal(evidence.tax_tables_exist_after,!reviewing);
  await writeFile(`../../output/shop-tax-sale-${reviewing?'schema-review':'database-rollback'}.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}catch(error){await client.query('rollback').catch(()=>{});console.error(JSON.stringify({error:'Sale rollback verification failed',code:error.code??error.name,phase:evidence.checks}));process.exitCode=1;}finally{await client.end();}
