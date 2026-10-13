import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Input, Label, Text, Textarea } from "@medusajs/ui";
import { useEffect, useRef, useState } from "react";
import { adminTaxConfigurationSchema, californiaPermitValidAt, shippingTaxCodeIds, type TaxConfigurationCommand, type TaxConfigurationContent } from "../../../lib/tax-configuration-contract";
import { taxCodeCatalogSchema, type TaxCode } from "../../../lib/tax-classification-contract";
import type { z } from "zod";
import { taxQuoteAddress } from "../../../lib/tax-quote-contract";

type Configuration = z.infer<typeof adminTaxConfigurationSchema>;
class ApiError extends Error { constructor(readonly status: number) { super(status === 409 ? "数据已变化，请重新载入并审阅。 / Data changed. Reload and review." : status === 400 ? "请完成真实经营资料、许可确认、运费审核和已发布的同主体政策。 / Complete the business, permit, shipping review and published seller policy." : status === 401 ? "请重新登录商城后台。 / Sign in to the shop admin." : status === 403 ? "后台权限或税务前置条件尚未满足，请核对权限和 Stripe 税务设置。 / Check admin access and Stripe tax prerequisites." : "暂时无法完成操作，请核对税务设置后重试。 / Check the tax setup and retry."); } }
async function api(body?:TaxConfigurationCommand,signal?:AbortSignal) {
  const response=await fetch("/admin/snowforce/tax/configuration",{credentials:"include",cache:"no-store",signal,...(body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new ApiError(response.status);return adminTaxConfigurationSchema.parse(await response.json());
}
export default function BusinessTaxConfigurationPage(){
  const [loaded,setLoaded]=useState<Configuration|null>(null),[content,setContent]=useState<TaxConfigurationContent|null>(null);
  const [busy,setBusy]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[reviewed,setReviewed]=useState(false);
  const [pending,setPending]=useState<TaxConfigurationCommand|null>(null),[codes,setCodes]=useState<TaxCode[]>([]);
  const inFlight=useRef(false);
  const saved=!!loaded?.persisted&&JSON.stringify(content)===JSON.stringify(loaded.state.draft);
  const active=loaded?.state.publications.find(p=>p.revision===loaded.state.active_revision);
  const address=loaded?.warehouse?.address;
  const addressValid=taxQuoteAddress.safeParse({country:address?.country_code.toUpperCase(),state:address?.province?.toUpperCase(),city:address?.city,line1:address?.address_1,line2:address?.address_2??"",postal_code:address?.postal_code}).success;
  const complete=!!content?.legal_seller_name&&content.legal_seller_name===loaded?.policy_seller_name&&!!loaded.policy_version&&addressValid&&content.stock_location_id===loaded.warehouse?.id&&!!content.shipping_tax_code&&shippingTaxCodeIds.some(id=>id===content.shipping_tax_code)&&californiaPermitValidAt(content,new Date())&&content.obligations_reviewed&&content.shipping_tax_treatment_reviewed&&content.review_note.trim().length>=20;
  const locked=busy||!!pending;
  useEffect(()=>{const controller=new AbortController();api(undefined,controller.signal).then(result=>{if(!controller.signal.aborted){setLoaded(result);setContent(result.state.draft);}}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof ApiError?reason.message:"无法载入经营税务配置。 / Unable to load business tax configuration.");}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return()=>controller.abort();},[]);
  function update<K extends keyof TaxConfigurationContent>(key:K,value:TaxConfigurationContent[K]){if(content&&!locked){setContent({...content,[key]:value});setReviewed(false);setNotice("");}}
  async function reload(){if(inFlight.current||pending)return;inFlight.current=true;setBusy(true);setError("");setNotice("");try{const result=await api();setLoaded(result);setContent(result.state.draft);setReviewed(false);}catch(reason){setError(reason instanceof ApiError?reason.message:"无法载入配置，请重试。 / Unable to reload. Please retry.");}finally{inFlight.current=false;setBusy(false);}}
  async function submit(command:TaxConfigurationCommand){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError("");setNotice("");setPending(command);
    try{const result=await api(command),receipt=result.state.receipts.find(r=>r.request_id===command.request_id&&r.command===command.command);
      if(!receipt||result.applied_revision!==receipt.revision||command.command==="activate"&&!result.state.publications.some(p=>p.revision===receipt.revision))throw new Error("Unconfirmed response");
      setLoaded(result);setContent(result.state.draft);setPending(null);setReviewed(false);
      setNotice(command.command==="save_draft"?"草稿已保存，付款状态不变。 / Draft saved. Payment availability is unchanged.":result.state.active_revision===receipt.revision?"经营税务配置已记录，完整计税和付款验收仍须通过。 / Business tax configuration recorded. Checkout still requires complete tax and payment verification.":"此前启用已确认，当前已有较新的配置。 / Earlier activation confirmed; a newer configuration is now current.");
    }catch(reason){if(reason instanceof ApiError&&[400,401,403,409].includes(reason.status)){setPending(null);setReviewed(false);setError(reason.message);}else setError("操作结果尚未确认，编辑已锁定；请使用原请求重试。 / Outcome is unconfirmed. Editing is locked; retry the original request.");}
    finally{inFlight.current=false;setBusy(false);}
  }
  async function loadCodes(){if(inFlight.current||pending)return;inFlight.current=true;setBusy(true);setError("");try{const response=await fetch("/admin/snowforce/tax/codes",{credentials:"include",cache:"no-store"});if(!response.ok)throw new ApiError(response.status);const result=taxCodeCatalogSchema.parse(await response.json());setCodes(result.codes.filter(c=>shippingTaxCodeIds.some(id=>id===c.id)));}catch{setCodes([]);setError("无法读取官方运费分类，请检查商城 Stripe 访问权限。 / Official shipping categories unavailable. Check the shop Stripe access.");}finally{inFlight.current=false;setBusy(false);}}
  return <Container className="max-w-5xl space-y-6">
    <div><Heading>经营税务配置 / Business tax configuration</Heading><Text className="text-ui-fg-subtle">保存草稿不会开启收税或付款。 / Saving a draft does not enable tax collection or payment.</Text></div>
    <div className="flex gap-4"><a href="/app/snowforce-tax-setup" className="text-ui-fg-interactive">核对 Stripe 设置 / Stripe tax setup</a><a href="/app/snowforce-policies" className="text-ui-fg-interactive">购买政策 / Shop policy</a></div>
    <Text>请按真实经营资料填写，不在此保存证件号码或税务账号。Stripe 登记不能代替政府许可；仓库发货地址与 Stripe 经营地址分别核对。 / Use verified business facts. Do not enter permit numbers or tax credentials. Review the ship-from and Stripe business addresses separately.</Text>
    <Button disabled={locked} onClick={()=>void reload()}>重新载入 / Reload</Button>
    {error&&<Text role="alert">{error}</Text>}{notice&&<Text role="status">{notice}</Text>}
    {pending&&<Button disabled={busy} onClick={()=>void submit(pending)}>重试原请求 / Retry original request</Button>}
    {content&&loaded&&<>
      <Text>草稿版本 / Revision: {loaded.state.revision} · 当前启用版本 / Active revision: {loaded.state.active_revision??"—"}</Text>
      <div className="space-y-2"><Label htmlFor="business-seller">正式销售主体 / Legal seller name</Label><Input id="business-seller" value={content.legal_seller_name} disabled={locked} onChange={e=>update("legal_seller_name",e.target.value)} /><Text className="text-ui-fg-subtle">需与已发布购买政策的销售主体一致。 / Must match the seller in the published shop policy.</Text></div>
      <div className="space-y-2"><Label htmlFor="business-warehouse">发货仓库 / Ship-from warehouse</Label><select id="business-warehouse" className="w-full rounded-md border border-ui-border-base bg-ui-bg-base p-2" disabled={locked} value={content.stock_location_id??""} onChange={e=>update("stock_location_id",e.target.value||null)}><option value="">请选择 / Choose</option>{loaded.warehouse&&<option value={loaded.warehouse.id}>{loaded.warehouse.name}</option>}{content.stock_location_id&&content.stock_location_id!==loaded.warehouse?.id&&<option value={content.stock_location_id}>{content.stock_location_id} · 需重新核对 / Review required</option>}</select>
        {loaded.warehouse?.address&&<Text>{[loaded.warehouse.address.address_1,loaded.warehouse.address.address_2,loaded.warehouse.address.city,loaded.warehouse.address.province,loaded.warehouse.address.postal_code,loaded.warehouse.address.country_code].filter(Boolean).join(", ")}</Text>}
        <Text className="text-ui-fg-subtle">地址从原生仓库记录读取；更改仓库地址后需重新审阅配置。 / The address comes from the native warehouse. Address changes require a fresh review.</Text>
      </div>
      <div className="space-y-2"><Label htmlFor="business-shipping-code">运费税务分类 / Shipping tax category</Label><Button disabled={locked} onClick={()=>void loadCodes()}>读取官方分类 / Load official categories</Button><select id="business-shipping-code" className="w-full rounded-md border border-ui-border-base bg-ui-bg-base p-2" disabled={locked} value={content.shipping_tax_code??""} onChange={e=>update("shipping_tax_code",e.target.value||null)}><option value="">不自动选择 / No automatic selection</option>{codes.map(code=><option value={code.id} key={code.id}>{code.name} · {code.id}</option>)}{content.shipping_tax_code&&!codes.some(c=>c.id===content.shipping_tax_code)&&<option value={content.shipping_tax_code}>{content.shipping_tax_code} · 需重新核对 / Verify category</option>}</select>{codes.find(c=>c.id===content.shipping_tax_code)&&<Text>{codes.find(c=>c.id===content.shipping_tax_code)?.description}</Text>}
        <Text>应由经营者或申报负责人审阅运费安排、实际运输成本和分类适用条件；不自动把运费设为免税。 / Review the shipping arrangement, actual carrier costs and category conditions with the responsible filer.</Text>
      </div>
      <div className="space-y-3">
        <div><Label htmlFor="business-permit-type">许可类型 / Permit type</Label><select id="business-permit-type" className="w-full rounded-md border p-2" value={content.california_permit_type??""} disabled={locked} onChange={e=>update("california_permit_type",e.target.value==="temporary"?"temporary":e.target.value==="ongoing"?"ongoing":null)}><option value="">请选择 / Select</option><option value="ongoing">持续经营 / Ongoing</option><option value="temporary">临时许可 / Temporary</option></select></div>
        <div><Label htmlFor="business-permit-from">生效日期（加州时间）/ Effective date (California)</Label><Input id="business-permit-from" type="date" value={content.california_permit_valid_from??""} disabled={locked} onChange={e=>update("california_permit_valid_from",e.target.value||null)} /></div>
        <div><Label htmlFor="business-permit-through">最后有效日期（临时许可必填）/ Valid through (required for temporary permits)</Label><Input id="business-permit-through" type="date" value={content.california_permit_valid_through??""} disabled={locked} onChange={e=>update("california_permit_valid_through",e.target.value||null)} /><Text>临时许可到期后将停止新的计税与付款准备。原订单售后与历史税账继续处理。持续经营应核对 ongoing permit。 / After expiry, new checkout preparation stops. Historical orders and tax records remain available. Review an ongoing permit for continued operation.</Text></div>
        <Label className="flex items-start gap-2"><input id="business-permit" type="checkbox" checked={content.california_permit_confirmed} disabled={locked} onChange={e=>update("california_permit_confirmed",e.target.checked)} />已核实本主体有效加州销售许可 / Valid California seller permit verified</Label>
        <Label className="flex items-start gap-2"><input id="business-obligations" type="checkbox" checked={content.obligations_reviewed} disabled={locked} onChange={e=>update("obligations_reviewed",e.target.checked)} />已核对各渠道和州的登记/申报责任 / Registration and filing obligations reviewed</Label>
        <Label className="flex items-start gap-2"><input id="business-shipping-review" type="checkbox" checked={content.shipping_tax_treatment_reviewed} disabled={locked} onChange={e=>update("shipping_tax_treatment_reviewed",e.target.checked)} />已审阅运费税务处理及分类条件 / Shipping tax treatment and category conditions reviewed</Label>
      </div>
      <div className="space-y-2"><Label htmlFor="business-review-note">审核依据 / Review basis</Label><Textarea id="business-review-note" value={content.review_note} disabled={locked} onChange={e=>update("review_note",e.target.value)} /><Text className="text-ui-fg-subtle">启用至少需要 20 个字符的依据说明；不填写敏感证件号码。 / Activation needs at least 20 characters of review basis, without sensitive identifiers.</Text></div>
      <Button disabled={locked||saved} onClick={()=>void submit({command:"save_draft",request_id:crypto.randomUUID(),expected_revision:loaded.state.revision,content})}>保存草稿 / Save draft</Button>
      <div className="border-t border-ui-border-base pt-4 space-y-3"><Label className="flex items-start gap-2"><input id="business-confirm" type="checkbox" checked={reviewed} disabled={locked||!saved||!complete} onChange={e=>setReviewed(e.target.checked)} />已复核保存的资料、已发布政策与当前 Stripe 环境 / Reviewed the saved facts, published policy and Stripe environment</Label><Button disabled={locked||!saved||!complete||!reviewed} onClick={()=>void submit({command:"activate",request_id:crypto.randomUUID(),expected_revision:loaded.state.revision,source_fingerprint:loaded.source_fingerprint,confirm_review:true})}>启用经营税务配置 / Activate business tax configuration</Button></div>
      {active&&<div className="border-t border-ui-border-base pt-4"><Heading level="h2">审核记录 / Review record</Heading><Text>{active.content.legal_seller_name} · {active.livemode?"正式 / Live":"测试 / Sandbox"} · {active.shipping_code.name}</Text><Text>{active.reviewed_at} · {active.reviewed_by}</Text><Text>{active.content.review_note}</Text></div>}
    </>}
    <a href="https://docs.stripe.com/tax/tax-codes" target="_blank" rel="noreferrer" className="text-ui-fg-interactive">Stripe 官方分类及适用条件 / Official categories and conditions</a>
  </Container>;
}
export const config=defineRouteConfig({label:"SnowForce business tax"});
