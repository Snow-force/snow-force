import {createRequire} from "node:module";
import {refundOutboxFixture} from "./tax-refund-outbox.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {cashRefundRequest}=require("../../src/lib/refund-execution.ts");
const {taxSaleFingerprint}=require("../../src/lib/tax-sale-contract.ts");
export function nativeReconciliationFixture(){
  const f=refundOutboxFixture(),request=cashRefundRequest(f.reservation),original=f.db;
  f.association={operation_id:f.reservation.id,claim_token:"123e4567-e89b-42d3-a456-426614174088",remote_id:f.refund.id,request,request_fingerprint:taxSaleFingerprint(request)};
  f.associationReads=0;
  const db={...original,raw:async(sql,values)=>{
    if(sql.startsWith("select e.id as operation_id")){f.associationReads++;return{rows:f.noAssociation?[]:[structuredClone(f.association)]};}
    return original.raw(sql,values);
  }};
  f.scope={resolve:()=>db};f.input={data:{id:f.intent.id,livemode:false,kept:"original"},amount:"10.52",context:{idempotency_key:f.native.id}};
  return f;
}
