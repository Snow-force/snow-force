import { createRequire } from "node:module";
import { setupReaderFixture } from "./tax-setup.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
export const configuration=require("../../src/lib/tax-configuration.ts"),contract=require("../../src/lib/tax-configuration-contract.ts");
const policy=require("../../src/lib/shop-policy.ts"),{readStripeTaxSetup}=require("../../src/lib/tax-setup.ts");
export const configurationSetup=await readStripeTaxSetup(setupReaderFixture());
export const configurationAt="2026-01-01T00:00:00.000Z";
export const warehouseFixture=()=>({id:"sloc_fixture",name:"Fixture warehouse",address_id:"laddr_fixture",address:{address_1:"1 Test Street",address_2:"",city:"Fixture city",province:"ca",postal_code:"92614",country_code:"us"}});
export const shippingCodeFixture=()=>({id:"txcd_92010001",name:"Shipping",description:"Isolated fixture shipping category with reviewed conditions.",requirements:{performance_location:"optional"}});
export function businessPolicyMetadata(){const state=policy.initialShopPolicyState();state.revision=1;state.draft.version=1;state.published_version=1;state.draft.content.seller_name="Fixture seller";state.draft.content.customer_service_email="support@example.test";state.draft.content.copy.consumer_rights={en:"Statutory rights apply.",zh:"保留法定消费者权利。"};state.publications=[{version:1,published_at:configurationAt,effective_at:configurationAt,published_by:"user_fixture",content:state.draft.content}];return {[policy.shopPolicyMetadataKey]:state};}
export function configuredMetadata(metadata=businessPolicyMetadata(),setup=configurationSetup){const value={...metadata,snowforce_fulfillment_location_id:"sloc_fixture"},store={id:"store_fixture",metadata:value,database_now:configurationAt},source=configuration.taxConfigurationResources(store,warehouseFixture());
  const content={legal_seller_name:"Fixture seller",stock_location_id:"sloc_fixture",shipping_tax_code:shippingCodeFixture().id,california_permit_confirmed:true,obligations_reviewed:true,shipping_tax_treatment_reviewed:true,review_note:"Reviewed isolated fixture business facts and shipping treatment."};
  const saved=configuration.applyTaxConfiguration(configuration.initialTaxConfiguration("sloc_fixture"),{command:"save_draft",request_id:"123e4567-e89b-42d3-a456-426614174011",expected_revision:0,content},"user_fixture").state;
  const active=configuration.applyTaxConfiguration(saved,{command:"activate",request_id:"123e4567-e89b-42d3-a456-426614174012",expected_revision:1,source_fingerprint:source.source_fingerprint,confirm_review:true},"user_fixture",{content,source_fingerprint:source.source_fingerprint,ship_from_address:configuration.warehouseTaxAddress(warehouseFixture()),shipping_code:shippingCodeFixture(),stock_location_id:"sloc_fixture",policy_version:source.policy_version??1,account_id:setup.account_id,livemode:setup.livemode,setup_fingerprint:setup.fingerprint,reviewed_at:configurationAt}).state;
  return {...value,[contract.taxConfigurationKey]:active};
}
export function taxConfigurationRows(sql,metadata){if(sql.startsWith("select id,metadata,clock_timestamp()"))return [{id:"store_fixture",metadata:configuredMetadata(metadata),database_now:new Date().toISOString()}];if(sql.includes("from commerce.stock_location l left join"))return [warehouseFixture()];return null;}
