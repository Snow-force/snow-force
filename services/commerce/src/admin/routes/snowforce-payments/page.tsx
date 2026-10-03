import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui";
import { useEffect, useRef, useState } from "react";
import type { PaymentOperationsPreview, PaymentOperationsRecord } from "../../../lib/payment-operations";

type Result = { record: PaymentOperationsRecord; preview?: PaymentOperationsPreview; associated?: boolean; replayed?: boolean };
type Association = { command: "associate"; intentId: string; fingerprint: string; verifiedFingerprint: string; requestId: string; confirmed: true };
class PaymentApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const failureMessage = (error: unknown) => error instanceof PaymentApiError ? error.message : "未能确认操作结果。请重试同一操作。 / The result is unconfirmed. Retry the same operation.";
async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/admin/snowforce/payments${path}`, { credentials: "include", signal, ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (!response.ok) throw new PaymentApiError(response.status === 401 || response.status === 403 ? "请重新登录商城后台。 / Sign in to the shop admin again."
    : response.status === 409 ? "付款或购物车信息已变化，或该 Stripe 付款不属于此尝试。请刷新并重新核对。 / Facts changed or the intent does not match. Reload and verify again."
    : response.status === 400 ? "请填写有效的 PaymentIntent ID，并重新核对付款。 / Enter a valid PaymentIntent ID and verify again."
    : "未能确认操作结果。请重试同一操作。 / The result is unconfirmed. Retry the same operation.", response.status);
  return response.json() as Promise<T>;
}
const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount / 100);
const date = (value: string) => new Date(value).toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
export default function PaymentsPage() {
  const [records, setRecords] = useState<PaymentOperationsRecord[]>([]), [count, setCount] = useState(0);
  const [filter, setFilter] = useState("interrupted"), [offset, setOffset] = useState(0), [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<PaymentOperationsRecord | null>(null), [preview, setPreview] = useState<PaymentOperationsPreview | null>(null);
  const [intent, setIntent] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const mounted = useRef(true), inFlight = useRef(false), pending = useRef<Association | null>(null), sequence = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current++; }; }, []);
  useEffect(() => {
    let active = true; const controller = new AbortController();
    setBusy(true); setError(""); setSelected(null); setPreview(null); setConfirmed(false); pending.current = null;
    api<{ records: PaymentOperationsRecord[]; count: number }>(`?filter=${filter}&offset=${offset}`, undefined, controller.signal)
      .then(result => { if (active) { setRecords(result.records); setCount(result.count); } })
      .catch((e: unknown) => { if (active) setError(failureMessage(e)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; controller.abort(); };
  }, [filter, offset, reload]);
  async function choose(id: string) {
    if (inFlight.current) return; inFlight.current = true;
    const operation = ++sequence.current; setBusy(true); setError(""); setNotice(""); setPreview(null); setConfirmed(false); pending.current = null;
    try { const result = await api<Result>(`/${encodeURIComponent(id)}`); if (mounted.current && sequence.current === operation) { setSelected(result.record); setIntent(result.record.intentId ?? ""); } }
    catch (e) { if (mounted.current && sequence.current === operation) setError(failureMessage(e)); }
    finally { inFlight.current = false; if (mounted.current && sequence.current === operation) setBusy(false); }
  }
  async function inspect() {
    if (!selected || inFlight.current || pending.current) return; inFlight.current = true;
    const operation = ++sequence.current; setBusy(true); setError(""); setPreview(null); setConfirmed(false);
    try {
      const result = await api<Result>(`/${encodeURIComponent(selected.id)}`, { command: "inspect", intentId: intent.trim(), fingerprint: selected.fingerprint });
      if (!result.preview || result.record?.id !== selected.id || result.preview.sessionId !== selected.id || result.preview.intentId !== intent.trim() || result.preview.amountCents !== result.record.amountCents || result.preview.livemode !== result.record.livemode) throw new Error("Missing payment verification");
      if (mounted.current && sequence.current === operation) { setSelected(result.record); setPreview(result.preview ?? null); }
    } catch (e) { if (mounted.current && sequence.current === operation) setError(failureMessage(e)); }
    finally { inFlight.current = false; if (mounted.current && sequence.current === operation) setBusy(false); }
  }
  async function associate() {
    if (!selected || !preview || !confirmed || !selected.eligible || inFlight.current) return; inFlight.current = true;
    const operation = ++sequence.current; setBusy(true); setError("");
    pending.current ??= { command: "associate", intentId: preview.intentId, fingerprint: selected.fingerprint, verifiedFingerprint: preview.verifiedFingerprint, requestId: crypto.randomUUID(), confirmed: true };
    try {
      const result = await api<Result>(`/${encodeURIComponent(selected.id)}`, pending.current);
      if (result.associated !== true || result.record?.id !== selected.id || result.record.intentId !== pending.current.intentId || result.record.association?.intentId !== pending.current.intentId) throw new Error("Missing association receipt");
      if (mounted.current && sequence.current === operation) {
        pending.current = null; setPreview(null); setConfirmed(false); setSelected(result.record);
        setNotice("已保存核实的付款关联。请顾客刷新结账并检查订单；授权、扣款、发货仍按订单流程处理。 / Verified association saved. Ask the customer to refresh checkout and check their order; authorization, capture and fulfillment remain in the order workflow.");
        setReload(value => value + 1);
      }
    } catch (e) {
      if (mounted.current && sequence.current === operation) {
        if (e instanceof PaymentApiError && [400, 401, 403, 404, 409].includes(e.status)) { pending.current = null; setPreview(null); setConfirmed(false); }
        setError(failureMessage(e));
      }
    } finally { inFlight.current = false; if (mounted.current && sequence.current === operation) setBusy(false); }
  }
  return <Container className="space-y-6">
    <Heading>付款核对 / Payment review</Heading>
    <Text className="text-ui-fg-subtle">查看初始化中断的付款尝试，按会话编号核对 Stripe 的 metadata.session_id。核对仅查询 Stripe；保存关联只更新已核实的本次记录，不发起扣款、退款或新的付款。 / Review interrupted attempts against Stripe metadata.session_id. Verification reads Stripe; association updates the verified record without charging, refunding or creating a payment.</Text>
    <div className="flex flex-wrap items-center gap-3"><Label htmlFor="payment-filter">查看 / View</Label><select id="payment-filter" disabled={busy || !!pending.current} value={filter} className="rounded border p-2" onChange={event => { setFilter(event.target.value); setOffset(0); }}><option value="interrupted">初始化中断 / Interrupted</option><option value="all">全部本商城付款尝试 / All shop attempts</option></select><Text>{count} 条 / attempts</Text><Button variant="secondary" disabled={busy || !!pending.current} onClick={() => setReload(value => value + 1)}>刷新列表 / Reload</Button></div>
    {error ? <Text role="alert" className="text-ui-fg-error">{error}</Text> : null}
    {notice ? <Text role="status">{notice}</Text> : null}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)]">
      <div className="space-y-3">{records.map(record => <button key={record.id} disabled={busy || !!pending.current} onClick={() => choose(record.id)} className="w-full rounded-lg border p-4 text-left hover:bg-ui-bg-subtle"><Text className="break-all">{record.id}</Text><div className="mt-2 flex flex-wrap justify-between gap-2"><span>{money(record.amountCents)} · {record.livemode ? "正式 / Live" : "测试 / Test"}</span><span>{record.retired ? "已退役 / Retired" : record.interrupted ? record.expired ? "超过自动重试窗口 / Manual review required" : "初始化中断 / Interrupted" : record.status}</span></div><Text className="mt-2 text-ui-fg-subtle">{date(record.createdAt)} · Pacific</Text></button>)}{!busy && !records.length ? <Text>当前没有付款尝试 / No payment attempts in this view.</Text> : null}<div className="flex gap-3"><Button variant="secondary" disabled={busy || !!pending.current || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 50))}>上一页 / Previous</Button><Button variant="secondary" disabled={busy || !!pending.current || offset + 50 >= count} onClick={() => setOffset(value => value + 50)}>下一页 / Next</Button></div></div>
      {selected ? <section className="space-y-4 rounded-lg border p-5"><Heading level="h2">核对此次付款 / Review this attempt</Heading><Text className="break-all">会话 / Session: {selected.id}</Text><Text>{money(selected.amountCents)} · {selected.livemode ? "正式 Stripe 环境 / Live Stripe environment" : "Stripe 测试环境 / Stripe test environment"}</Text><Text className="break-all">购物车 / Cart: {selected.cartId ?? "需核实 / Needs review"}</Text>{selected.customerId ? <a href={`/app/customers/${encodeURIComponent(selected.customerId)}`} className="text-ui-fg-interactive underline">打开顾客记录 / Open customer</a> : null}<Text>创建时间 / Created: {date(selected.createdAt)} · Pacific</Text>{selected.interrupted && selected.expired ? <Text>已超过自动初始化重试窗口；需核对 Stripe 后关联原付款，不能直接重新创建。 / The automatic retry window ended. Verify and associate the original payment before taking further action.</Text> : null}<a href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer" className="text-ui-fg-interactive underline">打开 Stripe 后台，选择对应的测试或正式环境 / Open Stripe and select the matching environment</a><div><Label htmlFor="payment-intent">Stripe PaymentIntent ID</Label><Input id="payment-intent" value={intent} disabled={busy || !!pending.current || !!selected.intentId} placeholder="pi_…" onChange={event => { setIntent(event.target.value); setPreview(null); setConfirmed(false); }} /></div><Button variant="secondary" disabled={busy || !!pending.current || !/^pi_[A-Za-z0-9]+$/.test(intent.trim())} onClick={inspect}>查询并核对 Stripe / Verify with Stripe</Button>
        {preview ? <div className="space-y-2 rounded border p-3"><Text>Stripe 状态 / Status: {preview.status}</Text><Text>已收 / Received: {money(preview.receivedCents)} · 可捕获 / Capturable: {money(preview.capturableCents)}</Text><Text className="break-all">{preview.intentId}</Text>{selected.eligible ? <><label className="flex items-start gap-2 text-sm"><input id="payment-confirm" type="checkbox" checked={confirmed} disabled={busy || !!pending.current} onChange={event => setConfirmed(event.target.checked)} /><span>我已核对金额、环境和会话编号，确认将这个现有 Stripe 付款关联到本次尝试。 / I reviewed the amount, environment and session binding and confirm association of this existing Stripe payment.</span></label><Button disabled={busy || !confirmed} onClick={associate}>{pending.current ? "重试原关联请求 / Retry association" : "保存核实关联 / Save association"}</Button></> : <Text>此记录不能在这里关联；已存在的订单或原生资金事实请在订单后台核对。 / This record cannot be associated here. Review existing orders and native funds in the order workspace.</Text>}</div> : null}
        {selected.association ? <Text>上次关联审核 / Association audit: {selected.association.actorId} · {date(selected.association.associatedAt)}</Text> : null}
      </section> : null}
    </div>
  </Container>;
}
export const config = defineRouteConfig({ label: "SnowForce payments" });
