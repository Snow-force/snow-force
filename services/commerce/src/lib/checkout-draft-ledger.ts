import { createHash, randomUUID } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { taxQuoteInputSchema } from "./tax-quote-contract";
import { buildStripeTaxQuoteRequest, normalizeStripeTaxQuote, taxQuoteBindingFingerprint } from "./tax-quote-money";
import { collectStripeTaxQuote, type StripeTaxQuoteWriter } from "./tax-quote-provider";
import type { TaxQuoteConnection } from "./tax-quote-ledger";

const fingerprint=z.string().regex(/^[a-f0-9]{64}$/),epoch=z.coerce.number().int().positive();
const rowSchema=z.object({id:z.uuid(),cart_id:z.string(),customer_id:z.string(),input:taxQuoteInputSchema,setup_fingerprint:fingerprint,namespace:fingerprint,binding_fingerprint:fingerprint,state:z.enum(["pending","ready"]),calculation:z.unknown().nullable(),snapshot:z.unknown().nullable(),expires_at:epoch,database_now:epoch});
const fields="*,floor(extract(epoch from clock_timestamp()))::bigint as database_now";
// A provider calculation can belong to only one immutable native quote. Once
// imported, a later receiving draft needs fresh calculation evidence, even if
// the address and money match an earlier draft again.
const unimported="not exists(select 1 from commerce.snowforce_tax_quotes q where q.account_id=d.input->>'account_id' and q.livemode=(d.input->>'livemode')::boolean and q.calculation_id=d.calculation->>'id')";
const fail=()=>new MedusaError(MedusaError.Types.CONFLICT,"Review the latest checkout estimate.");
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value!==null&&typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return value;}
export function draftEvidenceHash(value:unknown){return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");}
function checked(raw:unknown,cartId:string,customerId:string,context:{setup_fingerprint:string;namespace:string}){
  const row=rowSchema.parse(raw);if(row.cart_id!==cartId||row.customer_id!==customerId||row.input.cart_id!==cartId||row.input.customer_id!==customerId||row.setup_fingerprint!==context.setup_fingerprint||row.namespace!==context.namespace||row.binding_fingerprint!==taxQuoteBindingFingerprint(row.input)||row.database_now<row.input.tax_date||row.database_now+60>=row.expires_at||row.expires_at>row.input.tax_date+900)throw fail();return row;
}
export async function readDraftTaxQuote(scope:MedusaContainer,id:string,cartId:string,customerId:string,context:{setup_fingerprint:string;namespace:string}){
  const {rows}=await scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION).raw(`select ${fields} from commerce.snowforce_checkout_quote_drafts d where id=? and cart_id=? and customer_id=? and ${unimported}`,[z.uuid().parse(id),cartId,customerId]);
  const row=checked(z.array(z.unknown()).length(1).parse(rows)[0],cartId,customerId,context);if(row.state!=="ready")throw fail();
  const quote=normalizeStripeTaxQuote(row.input,row.calculation,row.database_now);if(row.expires_at!==quote.expires_at||draftEvidenceHash(quote)!==draftEvidenceHash(row.snapshot))throw fail();return {quote,calculation:row.calculation,id:row.id};
}

/** Caller holds checkout/native leases; no cart or payment mutation occurs.
 * Pending requests keep exact input/idempotency evidence in a separate ledger.
 */
export async function collectDraftTaxQuote(scope:MedusaContainer,raw:unknown,setup:string,writer:StripeTaxQuoteWriter,signals:readonly(AbortSignal|undefined)[]=[]){
  const input=taxQuoteInputSchema.parse(raw),context={setup_fingerprint:fingerprint.parse(setup),namespace:fingerprint.parse(writer.namespace)},binding=taxQuoteBindingFingerprint(input),db=scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
  if(input.livemode!==writer.livemode)throw fail();
  const active=()=>{if(signals.some(signal=>signal?.aborted)||process.env.COMMERCE_TAX_POLICY_CONFIRMED!=="true")throw fail();};active();
  const operation=await db.transaction(async tx=>{
    const owner=await tx.raw("select id from commerce.cart where id=? and customer_id=? and completed_at is null and deleted_at is null for update",[input.cart_id,input.customer_id]);if(owner.rows.length!==1)throw fail();
    const current=await tx.raw(`select ${fields} from commerce.snowforce_checkout_quote_drafts d where cart_id=? and customer_id=? and binding_fingerprint=? and setup_fingerprint=? and namespace=? and floor(extract(epoch from clock_timestamp()))+60<expires_at and ${unimported} order by created_at desc,id desc limit 1`,[input.cart_id,input.customer_id,binding,context.setup_fingerprint,context.namespace]);
    if(current.rows.length)return checked(current.rows[0],input.cart_id,input.customer_id,context);
    const budget=await tx.raw("select count(*)::int as recent from commerce.snowforce_checkout_quote_drafts where customer_id=? and created_at>clock_timestamp()-interval '1 minute'",[input.customer_id]);
    if(z.array(z.object({recent:z.number().int().nonnegative()})).length(1).parse(budget.rows)[0].recent>=20)throw fail();
    const {rows}=await tx.raw(`insert into commerce.snowforce_checkout_quote_drafts(id,cart_id,customer_id,input,setup_fingerprint,namespace,binding_fingerprint,expires_at) values (?,?,?,?::jsonb,?,?,?,?) returning ${fields}`,[randomUUID(),input.cart_id,input.customer_id,JSON.stringify(input),context.setup_fingerprint,context.namespace,binding,input.tax_date+900]);
    return checked(z.array(z.unknown()).length(1).parse(rows)[0],input.cart_id,input.customer_id,context);
  });
  active();if(operation.state==="ready")return readDraftTaxQuote(scope,operation.id,input.cart_id,input.customer_id,context);
  const calculation=await collectStripeTaxQuote(writer,operation.input,await writer.createCalculation(buildStripeTaxQuoteRequest(operation.input),`snowforce-tax-quote:${operation.id}`),signals);active();
  await db.transaction(async tx=>{
    const {rows}=await tx.raw(`select ${fields} from commerce.snowforce_checkout_quote_drafts where id=? for update`,[operation.id]);const row=checked(z.array(z.unknown()).length(1).parse(rows)[0],input.cart_id,input.customer_id,context),quote=normalizeStripeTaxQuote(row.input,calculation,row.database_now);
    if(row.state==="ready"){if(draftEvidenceHash(row.snapshot)!==draftEvidenceHash(quote))throw fail();return;}
    active();const saved=await tx.raw("update commerce.snowforce_checkout_quote_drafts set state='ready',calculation=?::jsonb,snapshot=?::jsonb,expires_at=?,completed_at=clock_timestamp() where id=? and state='pending' returning id",[JSON.stringify(calculation),JSON.stringify(quote),quote.expires_at,row.id]);if(saved.rows.length!==1)throw fail();
  });active();return readDraftTaxQuote(scope,operation.id,input.cart_id,input.customer_id,context);
}
