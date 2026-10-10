import {useEffect,useRef,useState} from "react";
import {Button,Input,Label,Text} from "@medusajs/ui";
type Plan={id:string;state:string;allocation_fingerprint:string;total_cents:number;items:{item_id:string;quantity:number;net_cents:number;sales_tax_cents:number}[];shipping_cents:number;shipping_tax_cents:number;fees:{state:string;amount_cents:number}[]};
type Data={case_id:string;version:number;can_prepare:boolean;execution_enabled:boolean;items:{item_id:string;title:string;available_quantity:number}[];shipping_available:boolean;fees:{state:"CO"|"MN";amount_cents:number}[];plans:Plan[];executions?:{id:string;state:string;tax_state:string|null}[]};
const usd=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
async function api(path:string,signal?:AbortSignal,body?:unknown):Promise<Data>{
  const response=await fetch(path,{credentials:"include",cache:"no-store",signal,...(body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new Error(response.status===409?"审核或收货数量已变化，请刷新。 / Review or receipt changed; refresh.":"退款预览暂不可用，请刷新。 / Refund preview unavailable; refresh.");
  return response.json() as Promise<Data>;
}
export default function RefundPlans({caseId}:{caseId:string}){
  const [data,setData]=useState<Data|null>(null),[quantities,setQuantities]=useState<Record<string,string>>({}),[shipping,setShipping]=useState(false),[feeChoices,setFeeChoices]=useState<Record<string,{refund:boolean;rationale:string}>>({});
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[confirmed,setConfirmed]=useState<Record<string,boolean>>({});const pending=useRef<{id:string;body:string}|null>(null);
  const active=useRef<AbortController|null>(null);
  const path=`/admin/snowforce/after-sales/${encodeURIComponent(caseId)}/refunds`;
  useEffect(()=>{const controller=new AbortController();active.current=controller;setBusy(false);setData(null);setQuantities({});setShipping(false);setFeeChoices({});setConfirmed({});setError("");pending.current=null;
    api(path,controller.signal).then(value=>{if(!controller.signal.aborted)setData(value);}).catch((e:unknown)=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Unable to load");});
    return()=>controller.abort();},[path]);
  useEffect(()=>{
    if(!data?.execution_enabled||!data.executions?.some(value=>["queued","pending","retry","running"].includes(value.state)||(value.tax_state&&["queued","retry","running"].includes(value.tax_state))))return;
    const controller=new AbortController(),timer=setTimeout(()=>{api(path,controller.signal).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(()=>{if(!controller.signal.aborted)setError("退款状态读取失败，请刷新后核对。 / Refresh to verify the refund status.");});},5000);
    return()=>{clearTimeout(timer);controller.abort();};
  },[data,path]);
  async function execute(plan:Plan){const controller=active.current;if(!data||!confirmed[plan.id]||!controller||controller.signal.aborted)return;setBusy(true);setError("");try{
    await api(`${path}/${encodeURIComponent(plan.id)}/execute`,controller.signal,{version:data.version,allocation_fingerprint:plan.allocation_fingerprint,confirmed:true});
    if(controller.signal.aborted)return;
    const value=await api(path,controller.signal);if(controller.signal.aborted)return;
    setConfirmed(previous=>({...previous,[plan.id]:false}));setData(value);
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Unable to execute; refresh to verify status.");}finally{if(!controller.signal.aborted)setBusy(false);}}
  async function prepare(){const controller=active.current;if(!data||!controller||controller.signal.aborted)return;setBusy(true);setError("");try{
    const input={items:data.items.map(item=>({item_id:item.item_id,quantity:Number(quantities[item.item_id]??0)})).filter(item=>item.quantity>0),refund_shipping:shipping,
      fee_decisions:data.fees.map(fee=>({state:fee.state,refund:feeChoices[fee.state]?.refund??false,rationale:feeChoices[fee.state]?.rationale??""}))};
    const fingerprint=JSON.stringify({version:data.version,input});if(!pending.current||pending.current.body!==fingerprint)pending.current={id:crypto.randomUUID(),body:fingerprint};
    await api(path,controller.signal,{operation_id:pending.current.id,version:data.version,input});if(controller.signal.aborted)return;
    const value=await api(path,controller.signal);if(!controller.signal.aborted)setData(value);
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Unable to prepare");}finally{if(!controller.signal.aborted)setBusy(false);}}
  const valid=Boolean(data&&(data.items.some(item=>Number(quantities[item.item_id]??0)>0)||shipping)&&data.items.every(item=>{const value=Number(quantities[item.item_id]??0);return Number.isInteger(value)&&value>=0&&value<=item.available_quantity;})&&data.fees.every(fee=>(feeChoices[fee.state]?.rationale.trim().length??0)>=5));
  return <section className="space-y-3 rounded border p-3" aria-label="退款预览 / Refund preview"><Text>原始成交退款预览 / Original sale refund preview</Text>
    {error?<Text role="alert">{error}</Text>:null}
    {!data&&!error?<Text>读取原始成交与收货信息… / Loading original sale and receipt…</Text>:null}
    {data?.can_prepare?<><Text>按已收货数量预留原始折后金额及税额。保存预览不会向顾客退款。 / Reserve original discounted amounts and tax for received goods; saving a preview does not issue a refund.</Text>
      {data.items.map(item=><div key={item.item_id}><Label htmlFor={`refund-qty-${item.item_id}`}>{item.title} · 可预留 / available: {item.available_quantity}</Label><Input id={`refund-qty-${item.item_id}`} type="number" min={0} max={item.available_quantity} step={1} disabled={busy} value={quantities[item.item_id]??"0"} onChange={event=>setQuantities(previous=>({...previous,[item.item_id]:event.target.value}))}/></div>)}
      <label className="flex gap-2 text-sm"><input type="checkbox" disabled={busy||!data.shipping_available} checked={shipping} onChange={event=>setShipping(event.target.checked)}/>退回原始运费和运费税 / Refund original shipping and its tax</label>
      {data.fees.map(fee=><div key={fee.state} className="space-y-2"><label className="flex gap-2 text-sm"><input type="checkbox" disabled={busy} checked={feeChoices[fee.state]?.refund??false} onChange={event=>setFeeChoices(previous=>({...previous,[fee.state]:{rationale:previous[fee.state]?.rationale??"",refund:event.target.checked}}))}/>{fee.state} 配送费 / delivery fee {usd(fee.amount_cents)}</label><Label htmlFor={`refund-fee-${fee.state}`}>费用保留或退回的审核理由 / Reason for retaining or refunding the fee</Label><Input id={`refund-fee-${fee.state}`} disabled={busy} value={feeChoices[fee.state]?.rationale??""} onChange={event=>setFeeChoices(previous=>({...previous,[fee.state]:{refund:previous[fee.state]?.refund??false,rationale:event.target.value}}))}/></div>)}
      <Button disabled={busy||!valid} onClick={prepare}>保存退款预览 / Save refund preview</Button></>:null}
    {data?.plans.map(plan=>{const execution=data.executions?.find(value=>value.id===plan.id),canExecute=data.execution_enabled&&data.can_prepare&&["reserved","started"].includes(plan.state)&&!execution&&/^[a-f0-9]{64}$/.test(plan.allocation_fingerprint);return <div key={plan.id} className="rounded border p-3"><Text>{usd(plan.total_cents)} · {plan.state}</Text><Text>商品 / goods {usd(plan.items.reduce((sum,item)=>sum+item.net_cents,0))} · 商品税 / goods tax {usd(plan.items.reduce((sum,item)=>sum+item.sales_tax_cents,0))} · 运费及税 / shipping and tax {usd(plan.shipping_cents+plan.shipping_tax_cents)} · 配送费 / fees {usd(plan.fees.reduce((sum,fee)=>sum+fee.amount_cents,0))}</Text>{execution?<Text>退款 / Refund: {execution.state} · 税务冲销 / Tax reversal: {execution.tax_state??"等待资金退款 / waiting for funds"}</Text>:null}{canExecute?<><label className="flex gap-2 text-sm"><input type="checkbox" disabled={busy} checked={confirmed[plan.id]??false} onChange={event=>setConfirmed(previous=>({...previous,[plan.id]:event.target.checked}))}/>确认按以上原始金额向顾客退款 / Confirm refund of the original amounts above</label><Button disabled={busy||!confirmed[plan.id]} onClick={()=>execute(plan)}>执行退款 / Issue refund {usd(plan.total_cents)}</Button></>:null}</div>;})}
    {!data?.execution_enabled?<Text className="text-ui-fg-subtle">资金退款执行尚未启用。 / Funds refund execution is not enabled.</Text>:null}
  </section>;
}
