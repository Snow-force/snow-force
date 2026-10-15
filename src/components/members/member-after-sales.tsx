"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/language";
import { formatOrderDate } from "@/lib/shop/member-orders";
import { afterSalesReasonLabels,afterSalesStatusLabels,type AfterSalesList,type AfterSalesResult } from "@/lib/shop/after-sales";
import { getAfterSalesAction,submitAfterSalesAction,updateAfterSalesAction } from "@/lib/shop/after-sales-actions";
import { MemberPurchaseTerms } from "./member-purchase-terms";

export function MemberAfterSales({orderId,initial}:{orderId:string;initial:AfterSalesResult}) {
  return <MemberAfterSalesFlow key={orderId} orderId={orderId} initial={initial} />;
}
function MemberAfterSalesFlow({orderId,initial}:{orderId:string;initial:AfterSalesResult}) {
  const {t,lang}=useLanguage();
  const [data,setData]=useState<AfterSalesList|null>(initial.state==="ready"?initial.data:null);
  const [notice,setNotice]=useState(initial.state==="ready"?"":initial.state);
  const [busy,setBusy]=useState(false),[requestKey,setRequestKey]=useState("");
  const accept=(result:AfterSalesResult)=>{if(result.state==="ready"){setData(result.data);setNotice("saved");return true;}setNotice(result.state);return false;};
  async function refresh(){setBusy(true);try{accept(await getAfterSalesAction(orderId));}catch{setNotice("unavailable");}finally{setBusy(false);}}
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();const form=new FormData(event.currentTarget);const key=requestKey||crypto.randomUUID();setRequestKey(key);setBusy(true);
    const items=(data?.eligibleItems??[]).flatMap((item)=>{const quantity=Number(form.get(`qty-${item.id}`));return quantity>0?[{id:item.id,quantity}]:[];});
    try{if(accept(await submitAfterSalesAction(orderId,{requestKey:key,kind:form.get("kind"),reason:form.get("reason"),description:form.get("description"),items})))setRequestKey("");}catch{setNotice("unavailable");}finally{setBusy(false);}
  }
  async function update(requestId:string,command:unknown){setBusy(true);try{accept(await updateAfterSalesAction(orderId,requestId,command));}catch{setNotice("unavailable");}finally{setBusy(false);}}
  const active=data?.requests.some((request)=>["pending","approved","processing"].includes(request.status));
  const inputClass="mt-2 min-h-11 w-full rounded-lg border border-[#dce2d9] bg-white px-3 text-sm";
  return <section aria-label={t({en:"Returns and exchanges",zh:"退货与换货"})} className="rounded-[18px] border border-[#dce2d9] bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{t({en:"Returns and exchanges",zh:"退货与换货"})}</h2><button type="button" disabled={busy} onClick={refresh} className="min-h-10 text-sm text-[#0066cc] disabled:opacity-50">{t({en:"Refresh",zh:"刷新进度"})}</button></div>
    <p className="mt-3 text-sm leading-6 text-[#687163]">{t({en:"Choose items you have received and tell us what happened. Wait for approval and return instructions before sending your gear back.",zh:"请选择已收到的商品并说明原因。收到审核结果和退回指引后，再寄回装备。"})}</p>
    {data&&<MemberPurchaseTerms purchase={data.purchase??null} />}
    <div role="status" className="mt-3 text-sm leading-6">{notice==="saved"?t({en:"Request updated.",zh:"申请进度已更新。"}):notice==="invalid"?t({en:"Select an item and enter a description of 5–2,000 characters.",zh:"请至少选择一件商品，并填写 5–2,000 字的原因说明。"}):notice==="signed-out"?t({en:"Sign in with your verified SnowForce account to continue.",zh:"请登录已验证的 SnowForce 账号后继续。"}):notice==="rejected"?t({en:"This request or its available quantities changed. Refresh before retrying.",zh:"申请状态或可退数量已变化，请先刷新再重试。"}):notice==="unavailable"?t({en:"Unable to load or update requests. Refresh to check the latest status before retrying.",zh:"暂时无法读取或更新申请，请刷新确认最新进度后重试。"}):null}</div>
    {data?.requests.map((request)=><article key={request.id} className="mt-5 border-t border-[#edf0e9] pt-5">
      <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{t(request.kind==="return"?{en:"Return request",zh:"退货申请"}:{en:"Exchange request",zh:"换货申请"})}</h3><span className="text-sm text-[#476450]">{t(afterSalesStatusLabels[request.status])}</span></div>
      <p className="mt-2 text-xs text-[#70776e]">{formatOrderDate(request.created_at,lang)} · {t(afterSalesReasonLabels[request.reason])}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{request.description}</p>
      {data.purchase?.dispatches.filter(line=>line.requestId===request.id).map(line=><p key={line.requestId} className="mt-3 text-sm">{t({en:"Approved return dispatch deadline",zh:"获批后的退回交运截止日"})}: {formatOrderDate(line.dispatchBy,lang)} · {t({en:"Pacific Time. Carrier acceptance is required; a tracking number alone is not proof of dispatch.",zh:"美国太平洋时间。请以承运商实际接收凭证为准，填写追踪号不代表已交运。"})}</p>)}
      <ol className="mt-4 space-y-3">{request.history.map((event,index)=><li key={index} className="text-sm leading-6"><span className="font-medium">{t(afterSalesStatusLabels[event.status])}</span><span className="ml-2 text-xs text-[#70776e]">{formatOrderDate(event.at,lang)}</span>{event.message&&<p className="whitespace-pre-wrap break-words text-[#687163]">{event.message}</p>}</li>)}</ol>
      {request.status==="pending"&&<button type="button" disabled={busy} onClick={()=>update(request.id,{command:"cancel",version:request.version})} className="mt-3 min-h-10 text-sm text-[#0066cc] disabled:opacity-50">{t({en:"Cancel request",zh:"撤销申请"})}</button>}
      {["approved","processing"].includes(request.status)&&<form onSubmit={(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);void update(request.id,{command:"tracking",version:request.version,carrier:form.get("carrier"),trackingNumber:form.get("trackingNumber")});}} className="mt-5 space-y-3"><fieldset disabled={busy}><legend className="text-sm font-semibold">{t({en:"Return shipment",zh:"退回包裹"})}</legend><label className="mt-3 block text-sm">{t({en:"Carrier",zh:"承运商"})}<input name="carrier" required maxLength={100} defaultValue={request.return_carrier} className={inputClass}/></label><label className="mt-3 block text-sm">{t({en:"Tracking number",zh:"追踪号"})}<input name="trackingNumber" required maxLength={200} defaultValue={request.return_tracking_number} className={inputClass}/></label><button className="mt-4 min-h-11 rounded-lg bg-[#1d3430] px-4 text-sm text-white disabled:opacity-50">{t({en:"Save return tracking",zh:"保存退回物流"})}</button></fieldset></form>}
      {request.return_tracking_number&&<p className="mt-3 break-words text-xs text-[#70776e]">{request.return_carrier} · {request.return_tracking_number}</p>}
    </article>)}
    {data&&!active&&data.eligibleItems.length>0&&<form onSubmit={submit} className="mt-5 border-t border-[#edf0e9] pt-5"><fieldset disabled={busy} className="space-y-4"><legend className="text-sm font-semibold">{t({en:"Start a request",zh:"提交申请"})}</legend>
      <label className="block text-sm">{t({en:"Request type",zh:"申请类型"})}<select name="kind" className={inputClass}><option value="return">{t({en:"Return",zh:"退货"})}</option><option value="exchange">{t({en:"Exchange",zh:"换货"})}</option></select></label>
      <div className="space-y-3">{data.eligibleItems.map((item)=><label key={item.id} className="flex items-center justify-between gap-4 text-sm"><span className="min-w-0 break-words">{item.title}{item.variant&&` · ${item.variant}`}<span className="mt-1 block text-xs text-[#70776e]">{t({en:"Available quantity",zh:"可申请数量"})} {item.available}</span></span><input aria-label={`${t({en:"Quantity",zh:"申请数量"})} ${item.title}`} name={`qty-${item.id}`} type="number" min={0} max={item.available} step={1} defaultValue={0} className="h-11 w-20 shrink-0 rounded-lg border border-[#dce2d9] px-3"/></label>)}</div>
      <label className="block text-sm">{t({en:"Reason",zh:"申请原因"})}<select name="reason" className={inputClass}>{Object.entries(afterSalesReasonLabels).map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>
      <label className="block text-sm">{t({en:"Description / preferred exchange size or color",zh:"原因说明 / 希望更换的尺码或颜色"})}<textarea name="description" required minLength={5} maxLength={2000} rows={4} className={`${inputClass} py-3`}/></label>
      <button className="min-h-11 rounded-lg bg-[#1d3430] px-5 text-sm font-semibold text-white disabled:opacity-50">{busy?t({en:"Submitting…",zh:"提交中…"}):t({en:"Submit for review",zh:"提交审核"})}</button>
    </fieldset></form>}
    {data&&!active&&!data.eligibleItems.length&&<p className="mt-4 text-sm text-[#687163]">{t({en:"There are currently no received items available for a new request.",zh:"当前没有可提交新申请的已收货商品。"})}</p>}
  </section>;
}
