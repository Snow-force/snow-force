import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Text } from "@medusajs/ui";
import { useEffect, useRef, useState } from "react";
import { adminTaxSetupSchema } from "../../../lib/tax-setup-contract";
import type { z } from "zod";

const blockerCopy: Record<string, string> = {
  settings_pending: "Stripe Tax 缺少必要设置 / Required Stripe Tax settings are missing",
  unsupported_provider: "当前税务供应商尚未接入 / The selected tax provider is unsupported",
  us_head_office_required: "需要核对美国经营地址 / Verify the US business location",
  california_registration_required: "缺少已生效的加州销售税登记 / Active California sales-tax registration is missing",
  registration_expiring: "登记即将到期，需要重新核对 / A registration is expiring",
  unsupported_active_registration: "存在尚未支持的税种 / An active tax type needs review",
  duplicate_active_registration: "存在重复的有效登记 / Duplicate active registrations need review",
  retail_fee_without_sales_tax: "配送政府费用与销售税登记不完整 / Retail delivery fee and sales-tax registrations need review",
};
export default function SnowforceTaxSetupPage() {
  const [result, setResult] = useState<z.infer<typeof adminTaxSetupSchema> | null>(null);
  const [status, setStatus] = useState("loading");
  const alive = useRef(true), busy = useRef(false);
  async function load() {
    if (busy.current) return;
    busy.current = true; setStatus("loading"); setResult(null);
    try {
      const response = await fetch("/admin/snowforce/tax/setup", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error();
      const snapshot = adminTaxSetupSchema.parse(await response.json());
      if (alive.current) { setResult(snapshot); setStatus("ready"); }
    } catch { if (alive.current) setStatus("error"); }
    finally { busy.current = false; }
  }
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, []);
  return <Container className="max-w-5xl space-y-6">
    <div><Heading>税务设置核对 / Tax setup review</Heading><Text className="text-ui-fg-subtle">只读核对商城 Stripe 账户，不创建或修改登记、税额和付款。 / This review only reads the shop Stripe account.</Text></div>
    <Text>Stripe 登记不能替代政府签发的销售许可证；测试登记也不代表正式经营资质。 / Stripe registrations do not replace government permits. Sandbox records do not establish live registrations.</Text>
    <Button disabled={status === "loading"} onClick={() => void load()}>{status === "loading" ? "核对中 / Checking…" : "重新核对 / Check again"}</Button>
    {status === "error" && <Text role="alert">无法完整核对，请检查商城 Stripe 的读取权限和设置后重试。 / Verification failed. Check the shop Stripe access and retry.</Text>}
    {result && <>
      <div className="space-y-2"><Heading level="h2">当前核对结果 / Current review</Heading>
        <Text>{result.snapshot.livemode ? "正式环境 / Live mode" : "测试环境 / Sandbox"} · {result.snapshot.account_id}</Text>
        <Text>核对时间 / Checked: {new Date(result.snapshot.observed_at * 1000).toISOString()}</Text>
        <Text>Stripe Tax: {result.snapshot.settings.status} · {result.snapshot.settings.provider}</Text>
        <Text>经营地址 / Business location: {result.snapshot.settings.head_office_state ?? "—"}, {result.snapshot.settings.head_office_country ?? "—"}</Text>
        <Text>有效销售税州 / Active sales-tax states: {result.snapshot.collecting_states.join(", ") || "—"}</Text>
        <Text>有效配送政府费用州 / Active retail-fee states: {result.snapshot.collecting_retail_fee_states.join(", ") || "—"}</Text>
        {result.snapshot.settings.missing_fields.length > 0 && <Text>缺少设置 / Missing: {result.snapshot.settings.missing_fields.join(", ")}</Text>}
        {result.snapshot.blockers.map(blocker => <Text key={blocker}>{blockerCopy[blocker]}</Text>)}
        {result.snapshot.api_ready && <Text>Stripe API 设置核对通过。 / Stripe API setup passed.</Text>}
        <Text>{result.policy_confirmed ? "经营者税务确认已记录 / Operator tax confirmation recorded" : "经营者税务确认尚未完成 / Operator tax confirmation pending"}</Text>
        <Text>报价、成交税账与退款冲销已接入。 / Quotes, sale tax records and refund reversals are integrated.</Text>
        <Text>{result.checkout_ready ? "付款运行开关已开启；每笔订单仍须通过政策、商品、地址和报价核验。 / Payment runtime gates are open; each order still requires policy, item, address and quote checks." : "付款运行开关尚未全部开启，结账保持关闭。 / Payment runtime gates are closed; checkout remains unavailable."}</Text>
      </div>
      <div className="space-y-2"><Heading level="h2">登记记录 / Registration records</Heading>
        {result.snapshot.registrations.length === 0 ? <Text>当前环境没有登记记录 / No registrations in this environment</Text> : result.snapshot.registrations.map(registration => <div key={registration.id} className="border-t border-ui-border-base pt-2">
          <Text>{registration.country} {registration.state ?? ""} · {registration.type ?? "—"} · {registration.status}</Text>
          <Text className="text-ui-fg-subtle">{registration.id} · {new Date(registration.active_from * 1000).toISOString()} → {registration.expires_at === null ? "无到期日 / No expiry" : new Date(registration.expires_at * 1000).toISOString()}</Text>
        </div>)}
      </div>
    </>}
    <div className="flex flex-wrap gap-4">
      <a className="text-ui-fg-interactive" href="https://dashboard.stripe.com/settings/tax" target="_blank" rel="noreferrer">Stripe 税务设置 / Tax settings</a>
      <a className="text-ui-fg-interactive" href="https://dashboard.stripe.com/tax/locations" target="_blank" rel="noreferrer">前往 Stripe 核对登记 / Review registrations in Stripe</a>
    </div>
  </Container>;
}
export const config = defineRouteConfig({ label: "SnowForce tax setup" });
