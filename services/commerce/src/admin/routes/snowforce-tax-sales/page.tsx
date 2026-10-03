import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Input, Text } from "@medusajs/ui";
import { useEffect, useRef, useState } from "react";
import { taxSaleAdminSchema } from "../../../lib/tax-sale-admin-contract";
import type { z } from "zod";

const stateCopy = { queued: "待记账 / Queued", running: "核对中 / Checking", retry: "等待重试 / Retry", reconcile_required: "需要核对 / Review required", ready: "已记账 / Recorded" };
const errorCopy = { provider_unavailable: "税务服务暂不可用", evidence_changed: "原订单或收款证据不一致", request_aged: "请求结果未知且已超过自动重试期限", transaction_mismatch: "税账、明细或收款核对未通过" };
export default function SnowforceTaxSalesPage() {
  const [result, setResult] = useState<z.infer<typeof taxSaleAdminSchema> | null>(null), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false), [ids, setIds] = useState<Record<string, string>>({});
  const active = useRef(true), running = useRef(false);
  async function load() {
    const response = await fetch("/admin/snowforce/tax/sales", { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error();
    const current = taxSaleAdminSchema.parse(await response.json()); if (active.current) setResult(current);
  }
  async function refresh() {
    if (running.current) return; running.current = true; setBusy(true); setMessage("");
    try { await load(); } catch { if (active.current) { setResult(null); setMessage("无法读取税账任务，请重新核对。 / Tax records could not be loaded."); } }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  async function reconcile(id: string) {
    if (running.current) return; running.current = true; setBusy(true); setMessage("");
    try {
      const transactionId = ids[id] ?? result?.tasks.find(task => task.id === id)?.transaction_id ?? "";
      const response = await fetch(`/admin/snowforce/tax/sales/${id}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transaction_id: transactionId.trim() }) });
      if (!response.ok) throw new Error();
      const outcome = await response.json() as { status?: string };
      await load();
      if (active.current) setMessage(outcome.status === "ready" ? "原有税账已核对并关联。 / Existing tax sale verified." : "尚未通过核对，请检查对应账户、订单和税账明细。 / Review the account, sale and line amounts.");
    } catch { if (active.current) setMessage("核对未完成，请刷新状态后检查税账 ID。 / Refresh and verify the tax transaction ID."); }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  useEffect(() => { active.current = true; void refresh(); return () => { active.current = false; }; }, []);
  return <Container className="space-y-6">
    <div><Heading>成交税账 / Sale tax records</Heading><Text className="text-ui-fg-subtle">全额收款核对通过后记账；自动重试的任务保存在数据库。 / Verified full captures are recorded with durable retries.</Text></div>
    <Button disabled={busy} onClick={() => void refresh()}>刷新 / Refresh</Button>
    {message && <Text role="status">{message}</Text>}
    {result && result.unrecorded_orders.length > 0 && <div className="space-y-2"><Heading level="h2">已捕获但尚未建立税账任务 / Captured orders awaiting tax tasks</Heading>
      <Text>系统会自动核对并建立任务；若持续出现，请检查是否为部分收款、重复收款或原订单关联缺失。 / Review persistent entries for partial captures, duplicate payments or missing original order links.</Text>
      {result.unrecorded_orders.map(order => <a className="block text-ui-fg-interactive" key={order.order_id} href={`/app/orders/${order.order_id}`}>{order.order_id}</a>)}
    </div>}
    {result?.tasks.length === 0 && <Text>还没有成交税账任务。 / No sale tax tasks yet.</Text>}
    {result && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">订单 / Order</th><th className="p-3">实收 / Captured</th><th className="p-3">状态 / Status</th><th className="p-3">税账 / Tax transaction</th><th className="p-3">核对 / Review</th></tr></thead><tbody>
      {result.tasks.map(task => <tr key={task.id} className="border-b align-top"><td className="p-3"><a href={`/app/orders/${task.order_id}`} className="text-ui-fg-interactive">{task.order_id}</a><Text className="text-ui-fg-subtle">{task.livemode ? "正式 / Live" : "测试 / Sandbox"}</Text></td>
        <td className="p-3">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(task.total_cents / 100)}</td>
        <td className="p-3">{stateCopy[task.state]}<Text className="text-ui-fg-subtle">尝试 / Attempts: {task.attempts}</Text>{task.error_code && <Text>{errorCopy[task.error_code]}</Text>}</td>
        <td className="p-3">{task.transaction_id ?? "—"}<Text className="text-ui-fg-subtle">{task.updated_at}</Text></td>
        <td className="min-w-64 p-3">{task.state === "reconcile_required" && <form className="space-y-2" onSubmit={event => { event.preventDefault(); void reconcile(task.id); }}>
          <Input aria-label={`Existing tax transaction for ${task.order_id}`} placeholder="tax_…" value={ids[task.id] ?? task.transaction_id ?? ""} onChange={event => setIds(current => ({ ...current, [task.id]: event.target.value }))} disabled={busy} />
          <Button type="submit" disabled={busy || !/^tax_[A-Za-z0-9]+$/.test((ids[task.id] ?? task.transaction_id ?? "").trim())}>核对已有税账 / Verify existing</Button>
        </form>}</td></tr>)}
    </tbody></table></div>}
    <Text className="text-ui-fg-subtle">结果长期未知时，从对应 Stripe 账户找到已有 Tax Transaction，填写 tax_ ID 核对。此操作读取并关联已有税账，不重新收款或创建另一笔税账。退款冲销需另行核对。 / Resolve unknown results with the existing Stripe tax transaction ID. Refund reversals require separate reconciliation.</Text>
  </Container>;
}
export const config = defineRouteConfig({ label: "SnowForce tax sales" });
