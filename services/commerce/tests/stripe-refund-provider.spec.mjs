import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {test} from "node:test";
import {nativeReconciliationFixture} from "./fixtures/native-refund-reconciliation.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const Candidate=require("../src/modules/snowforce-stripe/service.ts").default;
const Stock=require("@medusajs/payment-stripe/dist/services/stripe-provider.js").default;
const {ContainerRegistrationKeys,BigNumber,Modules}=require("@medusajs/framework/utils");
const {createMedusaContainer}=require("@medusajs/framework/utils");
const {asValue}=require("@medusajs/framework/awilix");
const options={apiKey:"sk_test_providercandidatefixture",webhookSecret:"whsec_candidatefixture",capture:false,automaticPaymentMethods:true};

function fixture(key=options.apiKey){
  const f=nativeReconciliationFixture();f.readerCalls=0;
  class FixtureCandidate extends Candidate{
    refundFundsReader(){f.readerCalls++;return f.provider;}
  }
  f.candidate=new FixtureCandidate({[ContainerRegistrationKeys.PG_CONNECTION]:f.scope.resolve()}, {...options,apiKey:key});
  return f;
}

test("approved adapter retains the stock payment, capture, cancel, account and webhook implementation and provider ID",()=>{
  assert.equal(Candidate.identifier,Stock.identifier);
  for(const method of ["initiatePayment","authorizePayment","capturePayment","cancelPayment","deletePayment","retrievePayment","updatePayment",
    "getPaymentStatus","createAccountHolder","updateAccountHolder","deleteAccountHolder","listPaymentMethods","savePaymentMethod","deletePaymentMethod",
    "getWebhookActionAndData","constructWebhookEvent"])
    assert.equal(Candidate.prototype[method],Stock.prototype[method],method);
  assert.notEqual(Candidate.prototype.refundPayment,Stock.prototype.refundPayment);
  const configuration=readFileSync(new URL("../medusa-config.ts",import.meta.url),"utf8");
  assert.ok(configuration.includes('resolve: "./src/modules/snowforce-stripe", id: "stripe"'));
  assert.ok(!configuration.includes('resolve: "@medusajs/medusa/payment-stripe"'));
  const module=require("../src/modules/snowforce-stripe/index.ts").default;
  assert.equal(module.module,"payment");assert.deepEqual(module.services,[Candidate]);
  const candidate=new Candidate({},options),stock=new Stock({},options);
  assert.deepEqual(candidate.normalizePaymentIntentParameters(),stock.normalizePaymentIntentParameters());
  assert.equal(candidate.normalizePaymentIntentParameters().capture_method,"manual");
});

test("candidate Sandbox callback uses the real financial checks and preserves payment data without a funds POST",async()=>{
  const f=fixture();f.input.amount=new BigNumber("10.52");
  assert.deepEqual(await f.candidate.refundPayment(f.input),{data:f.input.data});
  assert.equal(f.readerCalls,1);assert.equal(f.associationReads,2);assert.equal(f.posts.length,0);
});

test("candidate rejects live, invalid and untracked refunds before provider reads",async()=>{
  for(const key of ["sk_live_notaconnectedcredential","rk_live_notaconnectedcredential","invalid"]){
    const f=fixture(key);await assert.rejects(()=>f.candidate.refundPayment(f.input));assert.equal(f.readerCalls,0);assert.equal(f.posts.length,0);
  }
  const f=fixture();f.noAssociation=true;f.provider.account=async()=>assert.fail("An untracked refund must not reach Stripe");
  await assert.rejects(()=>f.candidate.refundPayment(f.input));assert.equal(f.posts.length,0);
});

test("candidate cannot authorize changed or pending funds, raw cents, staff identity or a replaced claim",async()=>{
  for(const change of [f=>f.refund.status="pending",f=>f.native.raw_amount.value="10.53",f=>f.native.created_by="user_other",
    f=>f.provider.account=async()=>({id:"acct_other"}),f=>f.provider.livemode=true]){
    const f=fixture();change(f);await assert.rejects(()=>f.candidate.refundPayment(f.input));assert.equal(f.posts.length,0);
  }
  const f=fixture(),read=f.provider.refund;
  f.provider.refund=async id=>{const refund=await read(id);f.association.claim_token="123e4567-e89b-42d3-a456-426614174077";return refund;};
  await assert.rejects(()=>f.candidate.refundPayment(f.input));assert.equal(f.posts.length,0);
});

test("default candidate funds reader exposes only account, intent and refund reads",()=>{
  const reader=new Candidate({},options).refundFundsReader();
  assert.deepEqual(Object.keys(reader).sort(),["account","intent","livemode","refund"]);assert.equal(reader.livemode,false);
  for(const method of ["account","intent","refund"])assert.equal(typeof reader[method],"function");
  assert.equal(reader.createRefund,undefined);
});

test("installed payment provider loader registers the approved module under the existing provider ID",async()=>{
  const container=createMedusaContainer(),writes=[],connection={fixture:true};
  container.register({
    [ContainerRegistrationKeys.PG_CONNECTION]:asValue(connection),
    paymentProviderService:asValue({list:async()=>[],upsert:async rows=>writes.push(...rows)}),
  });
  const loader=require("@medusajs/payment/dist/loaders/providers.js").default;
  await loader({container,options:{providers:[{resolve:require("../src/modules/snowforce-stripe/index.ts").default,id:"stripe",options}]}});
  const provider=container.resolve("pp_stripe_stripe");
  assert.ok(provider instanceof Candidate);
  assert.deepEqual(writes.filter(row=>row.id==="pp_stripe_stripe"),[{id:"pp_stripe_stripe",is_enabled:true}]);
  assert.equal(provider.getIdentifier(),"stripe");
  assert.equal(provider.normalizePaymentIntentParameters().capture_method,"manual");
  const PaymentProviderService = require("@medusajs/payment/dist/services/payment-provider.js").default;
  container.register({ paymentProviderRepository: asValue({}), logger: asValue(console) });
  const dispatch = new PaymentProviderService(container.cradle);
  const appScope = createMedusaContainer();
  appScope.register({ [ContainerRegistrationKeys.PG_CONNECTION]: asValue(connection), [Modules.PAYMENT]: asValue({ paymentProviderService_: dispatch }) });
  const { configuredRefundAdapter } = require("../src/lib/refund-runtime.ts");
  const runtime = { COMMERCE_OPERATING_MODE: "sales", COMMERCE_REFUND_EXECUTION_ENABLED: "true", COMMERCE_STRIPE_API_KEY: options.apiKey, COMMERCE_STRIPE_WEBHOOK_SECRET: options.webhookSecret };
  assert.equal(configuredRefundAdapter(appScope, runtime).livemode, false);
  container.register({ pp_stripe_stripe: asValue(new Stock(container.cradle, options)) });
  assert.equal(configuredRefundAdapter(appScope, runtime), null);
  const f=nativeReconciliationFixture();
  await assert.rejects(()=>provider.refundPayment(f.input));
});

test("management configuration omits Stripe; sales configuration keeps the approved adapter ID and manual capture",()=>{
  const names=["NODE_ENV","COMMERCE_OPERATING_MODE","COMMERCE_STRIPE_API_KEY","COMMERCE_STRIPE_WEBHOOK_SECRET"];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const configPath=require.resolve("../medusa-config.ts");
  try{
    Object.assign(process.env,{NODE_ENV:"production",COMMERCE_STRIPE_API_KEY:options.apiKey,COMMERCE_STRIPE_WEBHOOK_SECRET:options.webhookSecret});
    for(const mode of ["management","sales"]){
      process.env.COMMERCE_OPERATING_MODE=mode;delete require.cache[configPath];
      const configuration=require(configPath),payment=Object.values(configuration.modules).find(module=>module.resolve==="@medusajs/medusa/payment");
      if(mode==="management")assert.deepEqual(payment?.options?.providers??[],[]);
      else{
        assert.deepEqual(payment.options.providers,[{resolve:"./src/modules/snowforce-stripe",id:"stripe",options:{apiKey:options.apiKey,webhookSecret:options.webhookSecret,automaticPaymentMethods:true,capture:false}}]);
      }
    }
  }finally{
    delete require.cache[configPath];for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
  }
});
