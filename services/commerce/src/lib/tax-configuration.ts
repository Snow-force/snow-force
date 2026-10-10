import { createHash } from "node:crypto";
import type { AuthContext } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { createTaxCodeReader, type TaxCodeReader } from "./tax-classification";
import { taxCodeSchema, supportedProductTaxCode } from "./tax-classification-contract";
import { publishedShopPolicy } from "./shop-policy";
import { assertActiveStripeTaxSetup } from "./tax-setup";
import type { TaxSetupSnapshot } from "./tax-setup-contract";
import { taxQuoteAddress, type TaxQuoteInput } from "./tax-quote-contract";
import { adminTaxConfigurationSchema, californiaPermitValidAt, shippingTaxCodeIds, taxConfigurationCommandSchema, taxConfigurationKey, taxConfigurationStateSchema, taxWarehouseSchema, type TaxConfigurationCommand, type TaxConfigurationState, type TaxConfigurationPublication, type TaxWarehouse } from "./tax-configuration-contract";

export type TaxConfigurationConnection={raw(sql:string,bindings?:(string|number)[]):Promise<{rows:unknown[]}>;transaction<T>(action:(db:TaxConfigurationConnection)=>Promise<T>):Promise<T>};
const dbFor=(scope:MedusaContainer)=>scope.resolve<TaxConfigurationConnection>(ContainerRegistrationKeys.PG_CONNECTION);
const conflict=()=>new MedusaError(MedusaError.Types.CONFLICT,"Tax configuration or warehouse changed. Reload and review again.");
const unavailable=()=>new MedusaError(MedusaError.Types.UNEXPECTED_STATE,"Business tax configuration is unavailable. No tax or payment was requested.");
function actor(auth:AuthContext|undefined){if(auth?.actor_type!=="user"||!/^user_[A-Za-z0-9]+$/.test(auth.actor_id))throw new MedusaError(MedusaError.Types.UNAUTHORIZED,"Sign in to the shop admin.");return auth.actor_id;}
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function initialTaxConfiguration(locationId:string|null=null):TaxConfigurationState{return taxConfigurationStateSchema.parse({schema_version:1,revision:0,draft:{legal_seller_name:"",stock_location_id:locationId,shipping_tax_code:null,california_permit_confirmed:false,obligations_reviewed:false,shipping_tax_treatment_reviewed:false,review_note:""},active_revision:null,publications:[],receipts:[]});}
const storeSchema=z.object({id:z.string().regex(/^store_[A-Za-z0-9]+$/),metadata:z.record(z.string(),z.unknown()).nullable(),database_now:z.union([z.string(),z.date()]).transform(value=>new Date(value).toISOString())});
async function storeFor(db:TaxConfigurationConnection,lock=false){const result=await db.raw(`select id,metadata,clock_timestamp() as database_now from commerce.store where deleted_at is null order by created_at,id limit 2${lock?" for update":""}`);return z.array(storeSchema).length(1).parse(result.rows)[0];}
function stateFor(store:z.infer<typeof storeSchema>){const raw=store.metadata?.[taxConfigurationKey],location=z.string().regex(/^sloc_[A-Za-z0-9]+$/).nullable().parse(store.metadata?.snowforce_fulfillment_location_id??null);return {persisted:raw!==undefined,state:raw===undefined?initialTaxConfiguration(location):taxConfigurationStateSchema.parse(raw)};}
async function warehouseFor(db:TaxConfigurationConnection,id:unknown,lock=false){if(id===null||id===undefined)return null;
  const parsed=taxWarehouseSchema.shape.id.parse(id);
  if(lock)await db.raw("select id from commerce.stock_location where id=? and deleted_at is null for update",[parsed]);
  const result=await db.raw(`select l.id,l.name,l.address_id,case when a.id is null then null else jsonb_build_object('address_1',a.address_1,'address_2',a.address_2,'city',a.city,'province',a.province,'postal_code',a.postal_code,'country_code',a.country_code) end as address from commerce.stock_location l left join commerce.stock_location_address a on a.id=l.address_id and a.deleted_at is null where l.id=? and l.deleted_at is null`,[parsed]);
  if(result.rows.length!==1)return null;
  if(lock){const row=taxWarehouseSchema.parse(result.rows[0]);if(row.address_id)await db.raw("select id from commerce.stock_location_address where id=? and deleted_at is null for update",[row.address_id]);return warehouseFor(db,parsed);}
  return taxWarehouseSchema.parse(result.rows[0]);
}
export function warehouseTaxAddress(warehouse:TaxWarehouse|null){if(!warehouse?.address)throw conflict();const a=warehouse.address;return taxQuoteAddress.parse({country:a.country_code.toUpperCase(),state:a.province?.toUpperCase(),city:a.city,line1:a.address_1,line2:a.address_2??"",postal_code:a.postal_code});}
export function taxConfigurationResources(store:z.infer<typeof storeSchema>,warehouse:TaxWarehouse|null){const policy=publishedShopPolicy(store.metadata,store.database_now),source_fingerprint=digest({store_id:store.id,configured_location_id:store.metadata?.snowforce_fulfillment_location_id??null,warehouse:warehouse?taxWarehouseSchema.parse(warehouse):null,policy});return {warehouse,source_fingerprint,policy_seller_name:policy?.content.seller_name??null,policy_version:policy?.version??null};}
async function projection(db:TaxConfigurationConnection,store:z.infer<typeof storeSchema>){const current=stateFor(store),warehouse=await warehouseFor(db,store.metadata?.snowforce_fulfillment_location_id);return adminTaxConfigurationSchema.parse({store_id:store.id,...current,...taxConfigurationResources(store,warehouse)});}
export async function adminTaxConfiguration(scope:MedusaContainer,auth:AuthContext|undefined){actor(auth);try{const db=dbFor(scope);return await projection(db,await storeFor(db));}catch(error){if(error instanceof MedusaError)throw error;throw unavailable();}}
const commandDigest=(staff:string,command:TaxConfigurationCommand)=>digest({staff,...command,request_id:undefined});
function replay(state:TaxConfigurationState,staff:string,command:TaxConfigurationCommand){const prior=state.receipts.find(r=>r.request_id===command.request_id);if(prior&&prior.digest!==commandDigest(staff,command))throw conflict();return prior;}
export function applyTaxConfiguration(state:TaxConfigurationState,command:TaxConfigurationCommand,staff:string,publication?:Omit<TaxConfigurationPublication,"revision"|"reviewed_by">){
  const prior=replay(state,staff,command);if(prior)return {state,replayed:true,applied_revision:prior.revision};
  if(state.revision!==command.expected_revision||state.revision>=1_000_000||command.command==="activate"&&state.publications.length>=100)throw conflict();
  const revision=state.revision+1;
  if(command.command==="activate"&&(!publication||publication.source_fingerprint!==command.source_fingerprint||JSON.stringify(publication.content)!==JSON.stringify(state.draft)))throw conflict();
  const next=taxConfigurationStateSchema.parse({...state,revision,...(command.command==="save_draft"?{draft:command.content}:{active_revision:revision,publications:[...state.publications,{...publication,revision,reviewed_by:staff}]}),receipts:[...state.receipts,{request_id:command.request_id,digest:commandDigest(staff,command),revision,command:command.command}].slice(-64)});
  return {state:next,replayed:false,applied_revision:revision};
}
function reviewedContent(state:TaxConfigurationState,at:string){const c=state.draft;if(!c.legal_seller_name||!c.stock_location_id||!c.shipping_tax_code||!californiaPermitValidAt(c,at)||!c.obligations_reviewed||!c.shipping_tax_treatment_reviewed||c.review_note.length<20)throw new MedusaError(MedusaError.Types.INVALID_DATA,"Complete the legal seller, verified current permit and validity dates, obligations and reviewed shipping tax treatment before activation.");return c;}
export async function changeTaxConfiguration(scope:MedusaContainer,auth:AuthContext|undefined,raw:unknown,reader?:TaxCodeReader){
  const staff=actor(auth),parsed=taxConfigurationCommandSchema.safeParse(raw);if(!parsed.success)throw new MedusaError(MedusaError.Types.INVALID_DATA,"Check the tax configuration and explicit review.");const command=parsed.data;
  try{const db=dbFor(scope),initial=await storeFor(db),previous=stateFor(initial).state,prior=replay(previous,staff,command);
    if(prior)return adminTaxConfigurationSchema.parse({...await projection(db,initial),replayed:true,applied_revision:prior.revision});
    if(previous.revision!==command.expected_revision)throw conflict();
    let setup:TaxSetupSnapshot|undefined,code:z.infer<typeof taxCodeSchema>|undefined;
    if(command.command==="activate"){
      const c=reviewedContent(previous,initial.database_now);setup=await assertActiveStripeTaxSetup(scope);code=taxCodeSchema.parse(await(reader??createTaxCodeReader()).retrieve(c.shipping_tax_code!));
      if(code.id!==c.shipping_tax_code||!shippingTaxCodeIds.some(id=>id===code!.id)||!supportedProductTaxCode(code))throw new MedusaError(MedusaError.Types.INVALID_DATA,"Choose a supported official shipping category and review its conditions.");
    }
    return await db.transaction(async tx=>{
      const store=await storeFor(tx,true),current=stateFor(store).state;
      const repeated=replay(current,staff,command);if(repeated)return adminTaxConfigurationSchema.parse({...await projection(tx,store),replayed:true,applied_revision:repeated.revision});
      if(current.revision!==command.expected_revision)throw conflict();
      const warehouse=await warehouseFor(tx,store.metadata?.snowforce_fulfillment_location_id,command.command==="activate"),source=taxConfigurationResources(store,warehouse);
      let publication:Omit<TaxConfigurationPublication,"revision"|"reviewed_by">|undefined;
      if(command.command==="activate"){
        const c=reviewedContent(current,store.database_now),ship_from_address=warehouseTaxAddress(warehouse);
        const at=Math.floor(Date.parse(store.database_now)/1000);
        if(source.source_fingerprint!==command.source_fingerprint||!source.policy_version||source.policy_seller_name!==c.legal_seller_name||warehouse?.id!==c.stock_location_id||!setup?.api_ready||!code||at-setup.observed_at>60||setup.observed_at>at+3)throw conflict();
        publication={content:c,source_fingerprint:source.source_fingerprint,ship_from_address,shipping_code:code,stock_location_id:c.stock_location_id!,policy_version:source.policy_version,account_id:setup.account_id,livemode:setup.livemode,setup_fingerprint:setup.fingerprint,reviewed_at:store.database_now};
      }
      const result=applyTaxConfiguration(current,command,staff,publication);
      const written=await tx.raw("update commerce.store set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{snowforce_tax_configuration}',?::jsonb,true),updated_at=clock_timestamp() where id=? and deleted_at is null returning id,metadata,clock_timestamp() as database_now",[JSON.stringify(result.state),store.id]);
      const saved=z.array(storeSchema).length(1).parse(written.rows)[0];
      return adminTaxConfigurationSchema.parse({...await projection(tx,saved),replayed:false,applied_revision:result.applied_revision});
    });
  }catch(error){if(error instanceof MedusaError)throw error;throw unavailable();}
}
/** Private operational reader. An editable draft is never evidence for quote generation. */
export async function readReviewedTaxConfiguration(scope:MedusaContainer,setup:TaxSetupSnapshot){
  try{const db=dbFor(scope),store=await storeFor(db),state=stateFor(store).state,active=state.publications.find(p=>p.revision===state.active_revision);
    if(!active||!setup.api_ready||active.account_id!==setup.account_id||active.livemode!==setup.livemode||active.setup_fingerprint!==setup.fingerprint||active.content.shipping_tax_code!==active.shipping_code.id||active.content.stock_location_id!==active.stock_location_id||!shippingTaxCodeIds.some(id=>id===active.shipping_code.id)||!supportedProductTaxCode(active.shipping_code))throw conflict();
    reviewedContent({...state,draft:active.content},store.database_now);const warehouse=await warehouseFor(db,store.metadata?.snowforce_fulfillment_location_id),source=taxConfigurationResources(store,warehouse);
    if(source.source_fingerprint!==active.source_fingerprint||source.policy_seller_name!==active.content.legal_seller_name||source.policy_version!==active.policy_version||warehouse?.id!==active.stock_location_id||JSON.stringify(warehouseTaxAddress(warehouse))!==JSON.stringify(active.ship_from_address))throw conflict();
    return {active,database_now:Math.floor(Date.parse(store.database_now)/1000)};
  }catch{throw new MedusaError(MedusaError.Types.NOT_ALLOWED,"Checkout needs current, reviewed business tax configuration.");}
}
/** Quote production/acceptance uses controlled records, never confirmation flags supplied by a browser. */
export async function assertQuotedTaxConfiguration(scope:MedusaContainer,input:TaxQuoteInput,setup:TaxSetupSnapshot){
  try{const {active}=await readReviewedTaxConfiguration(scope,setup);
    if(active.revision!==input.configuration_revision||active.account_id!==input.account_id||active.livemode!==input.livemode||active.shipping_code.id!==input.shipping.tax_code||Math.floor(Date.parse(active.reviewed_at)/1000)>input.tax_date||JSON.stringify(taxQuoteAddress.parse(input.ship_from_address))!==JSON.stringify(active.ship_from_address))throw conflict();
    return active;
  }catch{throw new MedusaError(MedusaError.Types.NOT_ALLOWED,"Checkout needs current, reviewed business tax configuration.");}
}
