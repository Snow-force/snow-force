import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Input, Label, Select, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";
import type { PickupOffer } from "../../../lib/local-pickup";

type Option = { id: string; policy: { fee_cents: number; free_threshold_cents: number } };
export default function SnowforceShippingPage() {
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState("");
  const [fee, setFee] = useState("");
  const [threshold, setThreshold] = useState("");
  const [status, setStatus] = useState("loading");
  const choose = (id: string, values = options) => { const option = values.find((value) => value.id === id); if (option) { setSelected(id); setFee((option.policy.fee_cents / 100).toFixed(2)); setThreshold((option.policy.free_threshold_cents / 100).toFixed(2)); } };
  useEffect(() => {
    let mounted = true;
    fetch("/admin/snowforce/shipping", { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ options: Option[] }>; }).then((data) => { if (mounted) { setOptions(data.options); choose(data.options[0]?.id ?? "", data.options); setStatus(data.options.length ? "ready" : "empty"); } }).catch(() => { if (mounted) setStatus("error"); });
    return () => { mounted = false; };
  // Initial load only. Selection changes are handled by the select control.
  }, []);

  async function save() {
    if (!/^\d+(\.\d{1,2})?$/.test(fee) || !/^\d+(\.\d{1,2})?$/.test(threshold)) { setStatus("invalid"); return; }
    setStatus("saving");
    try {
      const policy = { fee_cents: Math.round(Number(fee) * 100), free_threshold_cents: Math.round(Number(threshold) * 100) };
      const response = await fetch("/admin/snowforce/shipping", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected, policy }) });
      if (!response.ok) throw new Error();
      setOptions((values) => values.map((value) => value.id === selected ? { ...value, policy } : value));
      setStatus("saved");
    } catch { setStatus("error"); }
  }
  return <Container className="max-w-3xl space-y-6">
    <div><Heading>美国配送 / US shipping</Heading><Text className="text-ui-fg-subtle">美元运费与包邮门槛保存后用于结账。包邮按商品优惠后的金额计算，运费与税费不计入门槛。 / Free shipping uses the discounted item total, excluding shipping and tax.</Text></div>
    {status === "loading" ? <Text>加载中 / Loading…</Text> : options.length === 0 ? <Text>请先配置美国仓库和配送服务区域，再初始化配送方式。 / Configure the US stock location and service zone first.</Text> : <>
      <div><Label>配送区域 / Shipping option</Label><Select value={selected} onValueChange={(value) => choose(value)}><Select.Trigger><Select.Value /></Select.Trigger><Select.Content>{options.map((option) => <Select.Item key={option.id} value={option.id}>{option.id}</Select.Item>)}</Select.Content></Select></div>
      <div><Label htmlFor="shipping-fee">基础运费 / Base shipping (USD)</Label><Input id="shipping-fee" inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} /></div>
      <div><Label htmlFor="free-threshold">包邮门槛 / Free shipping from (USD)</Label><Input id="free-threshold" inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} /></div>
      <Button disabled={status === "saving"} onClick={save}>{status === "saving" ? "保存中 / Saving…" : "保存 / Save"}</Button>
    </>}
    <div role="status">{status === "saved" && "已保存 / Saved"}{status === "error" && "无法读取或保存，请重试 / Unable to load or save. Please retry."}{status === "invalid" && "请输入最多两位小数的美元金额 / Enter a dollar amount with at most two decimal places."}</div>
    <PickupSettings />
  </Container>;
}
export const config = defineRouteConfig({ label: "SnowForce shipping" });

function PickupSettings() {
  const [offer, setOffer] = useState<PickupOffer | null>(null);
  const [state, setState] = useState("loading");
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => {
    let mounted = true;
    fetch("/admin/snowforce/shipping/pickup", { credentials: "include" }).then(async response => {
      if (!response.ok) throw new Error("Pickup settings unavailable");
      return response.json() as Promise<{ pickupOffer: PickupOffer | null }>;
    }).then(data => { if (mounted) { setOffer(data.pickupOffer); setState("ready"); } }).catch(() => { if (mounted) setState("error"); });
    return () => { mounted = false; };
  }, []);
  async function enable() {
    if (!reviewed || state !== "ready") return;
    setState("saving");
    try {
      const response = await fetch("/admin/snowforce/shipping/pickup", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm_review: true }) });
      if (!response.ok) throw new Error("Pickup setup needs review");
      const data: { pickupOffer: PickupOffer } = await response.json();
      setOffer(data.pickupOffer); setState("ready");
    } catch { setState("error"); }
  }
  return <div className="space-y-4 border-t pt-6">
    <Heading level="h2">免费预约自提 / Free appointment pickup</Heading>
    <Text>顾客先联系客服预约，再在网站选择自提、确认预约并付款。自提费为 US$0；税费按已配置的加州自提地点计算。 / Customers contact support first, confirm their appointment at checkout and pay online. Pickup is free; tax uses the configured California pickup location.</Text>
    {state === "loading" ? <Text>加载中 / Loading…</Text> : state === "error" ? <Text role="alert">自提设置需要核对，请重新载入并检查仓库、销售渠道及配送模板。 / Reload and review the warehouse, sales channel and shipping profile.</Text> : offer ? <div role="status"><Text>已启用 / Enabled · {offer.name}</Text><Text>{offer.address.address_1}, {offer.address.address_2} · {offer.address.city}, CA {offer.address.postal_code}</Text></div> : <>
      <Text>启用前，请在原生库存地点页面核对默认仓库地址，并确认该地点接受预约自提。 / Before enabling, check the default warehouse address in Stock Locations and confirm appointment pickup is available there.</Text>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={reviewed} disabled={state === "saving"} onChange={event => setReviewed(event.target.checked)} /><span>我已核对当前默认仓库可供预约自提。 / I reviewed the default warehouse for appointment pickup.</span></label>
      <Button disabled={!reviewed || state !== "ready"} onClick={enable}>{state === "saving" ? "配置中 / Configuring…" : "启用免费预约自提 / Enable free appointment pickup"}</Button>
    </>}
  </div>;
}
