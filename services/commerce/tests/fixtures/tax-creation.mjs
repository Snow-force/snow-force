import assert from "node:assert/strict";
import {fixture,nativeCart} from "./tax-source.mjs";
import {quoteCalculation} from "./tax-quote.mjs";
export function creationFixture() {
  const f = fixture(nativeCart()), base = f.scope, sourceDb = base.resolve("__pg_connection__");
  Object.assign(f,{operations:new Map(),results:new Map(),locks:[],controllers:[],requests:[],pages:[],depth:0,txs:0,failPost:false,failPage:false,failRecord:false,onCreate:null,onPage:null,onWriterAccount:null,onTransaction:null});
  const now = () => Math.floor(new Date(f.date).getTime()/1000);
  const raw = async (sql,values=[]) => {
    if(sql.startsWith("select id from commerce.cart where")) return {rows:f.cart.completed_at || f.cart.customer_id !== values[1] ? [] : [{id:f.cart.id}]};
    if(sql.startsWith("select id,input,")) {
      assert.equal(f.depth,1);
      let operations = [...f.operations.values()];
      if(sql.includes("state='pending'")) operations = operations.filter(row => row.state === "pending");
      else if(sql.includes("state='ready'")) operations = operations.filter(row => row.state === "ready" && (!sql.includes("not exists") || !f.applications?.has(row.id)) && now()+60<f.results.get(row.id)?.snapshot.expires_at).reverse().slice(0,1);
      else operations = operations.filter(row => row.id === values[0]);
      return {rows:operations.map(row => ({...structuredClone(row),database_now:now()}))};
    }
    if(sql.startsWith("select floor(extract")) return {rows:[{database_now:now()}]};
    if(sql.startsWith("insert into commerce.snowforce_tax_operations")) {
      assert.equal(f.depth,1);
      const row = {id:values[0],input:JSON.parse(values[3]),setup_fingerprint:values[4],namespace:values[5],binding_fingerprint:values[6],request_fingerprint:values[7],request:JSON.parse(values[8]),state:"pending"};
      f.operations.set(row.id,row); return {rows:[{...structuredClone(row),database_now:now()}]};
    }
    if(sql.startsWith("select snapshot")) return {rows:f.results.has(values[0]) ? [{snapshot:structuredClone(f.results.get(values[0]).snapshot)}] : []};
    if(sql.startsWith("select input,calculation,snapshot")) return {rows:f.results.has(values[0]) ? [structuredClone(f.results.get(values[0]))] : []};
    if(sql.startsWith("insert into commerce.snowforce_tax_quotes")) {
      assert.equal(f.depth,1); f.results.set(values[0],{input:JSON.parse(values.at(-3)),calculation:JSON.parse(values.at(-2)),snapshot:JSON.parse(values.at(-1))}); return {rows:[]};
    }
    if(sql.startsWith("update commerce.snowforce_tax_operations")) {
      if(f.failRecord) throw new Error("private-record-error");
      f.operations.get(values[0]).state = "ready"; return {rows:[{id:values[0]}]};
    }
    return sourceDb.raw(sql,values);
  };
  const db = {raw,transaction:async action => {
    f.onTransaction?.(); f.txs++; const old = [structuredClone(f.operations),structuredClone(f.results)]; f.depth++;
    try { return await action({raw}); } catch(error) { [f.operations,f.results] = old; throw error; } finally { f.depth--; }
  }};
  const objectCalculation = () => {
    const operation = [...f.operations.values()].at(-1), calculation = quoteCalculation(operation.input);
    calculation.line_items = {...calculation.line_items,object:"list",url:`/v1/tax/calculations/${calculation.id}/line_items`,data:calculation.line_items.data.map(line=>({...line,object:"tax.calculation_line_item"}))};
    return calculation;
  };
  f.writer = {livemode:false,namespace:"f".repeat(64),account:async()=>{assert.equal(f.depth,0); f.onWriterAccount?.(); return {object:"account",id:"acct_fixture"};},
    createCalculation:async(request,key)=>{assert.equal(f.depth,0); f.requests.push({request:structuredClone(request),key}); f.onCreate?.(); if(f.failPost) throw new Error("private-post-error"); return objectCalculation();},
    listLineItems:async(id,params)=>{assert.equal(f.depth,0); f.pages.push({id,params}); f.onPage?.(); if(f.failPage) throw new Error("private-page-error"); return objectCalculation().line_items;}
  };
  const setupAccount = f.setup.account;
  f.setup.account = async () => {assert.equal(f.depth,0,"provider setup must not run under SQL transactions"); return setupAccount();};
  f.scope = {resolve:(key,options)=>key === "locking" ? {execute:async(key,callback,options)=>{f.locks.push({key,options});const controller=new AbortController();f.controllers.push(controller);return callback(controller.signal);}}
    : key === "__pg_connection__" ? db : key === "snowforce_tax_quote_writer" ? (assert.equal(options.allowUnregistered,true),f.writer) : base.resolve(key,options)};
  return f;
}
