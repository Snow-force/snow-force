import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Input, Label, Text, Textarea } from "@medusajs/ui";
import { useEffect, useRef, useState } from "react";
import type { ShopPolicyContent, ShopPolicyState } from "../../../lib/shop-policy";

type PolicyResponse = { store_id: string; persisted: boolean; state: ShopPolicyState; replayed?: boolean; applied_revision?: number };
type PublishRequest = { command: "publish"; request_id: string; expected_revision: number; confirm_review: true };
type Term = keyof ShopPolicyContent["terms"];
type Section = keyof ShopPolicyContent["copy"];
const termLabels: { key: Term; label: string }[] = [
  { key: "return_window_days", label: "送达后申请期限（自然日） / Return request window (calendar days)" },
  { key: "approved_dispatch_days", label: "批准后交运期限（自然日） / Approved return dispatch (calendar days)" },
  { key: "review_business_days", label: "预计审核回复（工作日） / Review response estimate (business days)" },
  { key: "refund_business_days", label: "验收后预计发起退款（工作日） / Refund initiation estimate (business days)" },
  { key: "processing_business_days_min", label: "现货处理预计最少工作日 / Minimum processing business days" },
  { key: "processing_business_days_max", label: "现货处理预计最多工作日 / Maximum processing business days" },
  { key: "transit_business_days_min", label: "交运后配送预计最少工作日 / Minimum delivery business days" },
  { key: "transit_business_days_max", label: "交运后配送预计最多工作日 / Maximum delivery business days" },
];
const sectionLabels: { key: Section; label: string }[] = [
  { key: "shipping", label: "配送范围、费用及时间 / Shipping coverage, costs and estimates" },
  { key: "requests", label: "退换货申请与审核 / Return and exchange requests" },
  { key: "conditions", label: "商品条件与例外 / Conditions and exceptions" },
  { key: "shipping_costs", label: "退换货运费承担 / Shipping cost responsibilities" },
  { key: "refunds", label: "退款与换货处理 / Refunds and exchanges" },
  { key: "return_address", label: "批准后的退回地址 / Approved return address" },
  { key: "consumer_rights", label: "客服与消费者权利 / Support and consumer rights" },
];
class PolicyApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function policyApi(body?: unknown, signal?: AbortSignal): Promise<PolicyResponse> {
  const response = await fetch("/admin/snowforce/policies", {
    credentials: "include", signal,
    ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    if (response.status === 409) throw new PolicyApiError("政策已被其他人修改，或此请求不一致。请重新载入后审阅；未保存内容仍保留在此页。 / Policy changed. Reload and review; your unsaved edits remain on this page.", response.status);
    if (response.status === 400) throw new PolicyApiError("请检查双语文案、邮箱及期限：天数必须为 1–365 的整数，最长时间不得短于最短时间。发布还需要正式销售主体、有效客服邮箱及已完成的消费者权利文案。 / Check bilingual copy, email and 1–365 whole-day limits. Publication also requires the legal seller, valid support email and completed consumer-rights copy.", response.status);
    if (response.status === 401 || response.status === 403) throw new PolicyApiError("请重新登录商城后台。 / Please sign in to the shop admin again.", response.status);
    throw new PolicyApiError("无法确认政策操作，请重试。 / Unable to confirm the policy operation. Please retry.", response.status);
  }
  return response.json() as Promise<PolicyResponse>;
}
export default function ShopPoliciesPage() {
  const [loaded, setLoaded] = useState<PolicyResponse | null>(null);
  const [content, setContent] = useState<ShopPolicyContent | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [pendingPublish, setPendingPublish] = useState<PublishRequest | null>(null);
  const operationInFlight = useRef(false);
  const pendingSave = useRef<{ request_id: string; content_json: string; expected_revision: number } | null>(null);
  const contentJson = content ? JSON.stringify(content) : "";
  const savedMatches = !!loaded?.persisted && contentJson === JSON.stringify(loaded.state.draft.content);
  const currentPublication = loaded?.state.publications.find((publication) => publication.version === loaded.state.published_version);
  const alreadyPublished = !!currentPublication && contentJson === JSON.stringify(currentPublication.content);
  const publicationDetailsReady = !!content?.seller_name.trim()
    && !!content?.customer_service_email.trim()
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.customer_service_email)
    && !content.copy.consumer_rights.zh.includes("正式销售主体、客服邮箱及生效日期将在发布前补充")
    && !content.copy.consumer_rights.en.includes("must be completed before publication");
  const canPublish = savedMatches && publicationDetailsReady && reviewed && !alreadyPublished;
  const editorDisabled = busy || !!pendingPublish;
  function confirmPublication(result: PolicyResponse, revision: number) {
    const publication = result.state.publications.find((entry) => entry.version === revision);
    if (!publication) throw new Error("发布响应缺少确认记录，请使用原请求重试。 / Publication confirmation is missing. Retry the original request.");
    setLoaded(result); setContent(result.state.draft.content); setReviewed(false); setPendingPublish(null); pendingSave.current = null;
    setNotice(`政策版本 ${publication.version} 已生效，后续草稿编辑不会修改此版本。 / Policy version ${publication.version} is effective. Later draft edits do not change this version.`);
  }
  useEffect(() => {
    const controller = new AbortController();
    policyApi(undefined, controller.signal).then((result) => {
      if (!controller.signal.aborted) { setLoaded(result); setContent(result.state.draft.content); }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load.");
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);
  async function reload() {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await policyApi();
      const receipt = pendingPublish && result.state.save_receipts.find((entry) => entry.request_id === pendingPublish.request_id);
      if (receipt) confirmPublication(result, receipt.revision);
      else {
        setLoaded(result); setContent(result.state.draft.content); setReviewed(false); pendingSave.current = null;
        setNotice(pendingPublish
          ? "后台尚未确认该发布请求；请重试原请求。 / The publication request is still unconfirmed. Retry the original request."
          : "已载入后台最新草稿。 / Loaded the latest draft.");
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load."); }
    finally { operationInFlight.current = false; setBusy(false); }
  }
  async function save() {
    if (!loaded || !content || pendingPublish || operationInFlight.current) return;
    operationInFlight.current = true;
    setBusy(true); setError(""); setNotice("");
    if (!pendingSave.current || pendingSave.current.content_json !== contentJson || pendingSave.current.expected_revision !== loaded.state.revision) pendingSave.current = { request_id: crypto.randomUUID(), content_json: contentJson, expected_revision: loaded.state.revision };
    try {
      const result = await policyApi({ command: "save_draft", request_id: pendingSave.current.request_id, expected_revision: loaded.state.revision, content });
      setLoaded(result); setContent(result.state.draft.content); setReviewed(false); pendingSave.current = null;
      setNotice(result.replayed && result.applied_revision !== result.state.revision
        ? "此前保存已确认；后台已有后续编辑，现已显示最新草稿，请审阅。 / Your earlier save is confirmed. Later edits are now shown; please review."
        : "草稿已保存。顾客仍查看当前已发布版本；请核对后单独发布。 / Draft saved. Customers still see the published version. Review it before publishing separately.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save."); }
    finally { operationInFlight.current = false; setBusy(false); }
  }
  async function publish() {
    if (!loaded || operationInFlight.current || (!pendingPublish && !canPublish)) return;
    const request: PublishRequest = pendingPublish ?? { command: "publish", request_id: crypto.randomUUID(), expected_revision: loaded.state.revision, confirm_review: true };
    operationInFlight.current = true; setPendingPublish(request); setBusy(true); setError(""); setNotice("");
    try {
      const result = await policyApi(request);
      confirmPublication(result, result.applied_revision ?? result.state.published_version ?? 0);
    } catch (reason) {
      if (reason instanceof PolicyApiError && (reason.status === 400 || reason.status === 409)) {
        setPendingPublish(null); setReviewed(false);
        setError(reason.message);
      } else {
        const detail = reason instanceof Error ? reason.message : "Unable to confirm publication.";
        setError(`${detail} 发布结果尚未确认，请点击“重试发布”使用原请求，不要重复建立发布。 / Publication is unconfirmed. Use Retry publication to resend the original request.`);
      }
    } finally { operationInFlight.current = false; setBusy(false); }
  }
  function updateTerm(key: Term, value: string) {
    setContent((previous) => previous ? { ...previous, terms: { ...previous.terms, [key]: value === "" ? 0 : Number(value) } } : previous);
    setReviewed(false); setNotice("");
  }
  function updateCopy(section: Section, language: "zh" | "en", value: string) {
    setContent((previous) => previous ? { ...previous, copy: { ...previous.copy, [section]: { ...previous.copy[section], [language]: value } } } : previous);
    setReviewed(false); setNotice("");
  }
  return <Container className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2"><Heading>商城政策 / Shop policies</Heading><Text className="text-ui-fg-subtle">编辑装备商城的配送与退换货文案；活动退款政策单独管理。 / Edit gear-shop shipping and returns; event refund terms are separate.</Text></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={reload}>重新载入 / Reload</Button><Button disabled={editorDisabled || !content} onClick={save}>保存草稿 / Save draft</Button></div>
    </div>
    <section className="space-y-2 rounded-lg border p-4" aria-label="Policy publication status">
      <Text weight="plus">{loaded?.state.published_version ? `当前发布版本 / Published version: ${loaded.state.published_version}` : "未发布 / Not published"}</Text>
      <Text>保存只更新草稿；发布会立即向顾客展示一个固定版本，订单保留购买时的条款。后续编辑草稿不会修改旧版本。正式销售主体和客服邮箱未确认时仍可保存草稿。 / Saving updates the draft. Publishing makes a fixed version visible immediately, and orders retain their purchase terms. Later draft edits do not change older versions. Unconfirmed seller and support details may remain blank in a draft.</Text>
      {currentPublication && <Text>生效时间 / Effective: {new Date(currentPublication.effective_at).toLocaleString()}</Text>}
      {loaded && <Text className="text-ui-fg-subtle">草稿版本 / Draft revision: {loaded.state.revision} · {loaded.persisted ? "已保存到后台 / Saved in admin" : "建议默认值，尚未保存 / Proposed defaults, not saved"}{loaded.state.draft.updated_at ? ` · ${new Date(loaded.state.draft.updated_at).toLocaleString()}` : ""}</Text>}
      <Text className="text-ui-fg-subtle">重新载入会替换本页尚未保存的编辑。 / Reload replaces unsaved edits on this page.</Text>
    </section>
    {error && <Text role="alert" className="text-ui-fg-error">{error}</Text>}
    <div aria-live="polite">{notice && <Text>{notice}</Text>}</div>
    {!content && busy && <Text>正在载入政策… / Loading policy…</Text>}
    {content && <>
      <section className="space-y-4"><Heading level="h2">经营者信息 / Seller information</Heading><div className="grid gap-4 md:grid-cols-2">
        <div><Label htmlFor="policy-seller">正式销售主体（待确认可留空） / Legal seller (blank until confirmed)</Label><Input id="policy-seller" disabled={editorDisabled} value={content.seller_name} maxLength={200} onChange={(event) => { setContent({ ...content, seller_name: event.target.value }); setReviewed(false); setNotice(""); }}/></div>
        <div><Label htmlFor="policy-email">客服邮箱（待确认可留空） / Support email (blank until confirmed)</Label><Input id="policy-email" type="email" disabled={editorDisabled} value={content.customer_service_email} maxLength={254} onChange={(event) => { setContent({ ...content, customer_service_email: event.target.value }); setReviewed(false); setNotice(""); }}/></div>
      </div></section>
      <section className="space-y-4 border-t pt-6"><Heading level="h2">期限与预计时效 / Deadlines and estimates</Heading><Text className="text-ui-fg-subtle">天数与下方双语文案应一起更新并审阅。数字字段保存的是拟定规则，不会立即改变现有订单或售后申请资格。 / Update the numbers and bilingual copy together. These proposed rules do not immediately change existing orders or return eligibility.</Text><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{termLabels.map(({ key, label }) => <div key={key}><Label htmlFor={`policy-${key}`}>{label}</Label><Input id={`policy-${key}`} type="number" min={1} max={365} step={1} disabled={editorDisabled} value={content.terms[key] || ""} onChange={(event) => updateTerm(key, event.target.value)}/></div>)}</div></section>
      <section className="space-y-6 border-t pt-6"><Heading level="h2">顾客双语文案 / Bilingual customer copy</Heading><Text className="text-ui-fg-subtle">运费、仓库和配送范围以相应后台记录为准；发布前核对本页文案与实际设置一致。每段每种语言最多 2000 字符，为纯文本。 / Native shipping prices, locations and coverage remain operational records; review copy against them before publication. Each paragraph permits up to 2,000 plain-text characters per language.</Text><a className="text-ui-fg-interactive underline" href="/app/snowforce-shipping">管理实际运费 / Manage actual shipping prices</a>{sectionLabels.map(({ key, label }) => <section key={key} className="space-y-3"><Heading level="h3">{label}</Heading><div className="grid gap-4 lg:grid-cols-2">{(["zh", "en"] as const).map((language) => <div key={language}><Label htmlFor={`policy-${key}-${language}`}>{language === "zh" ? "中文 / Chinese" : "英文 / English"}</Label><Textarea id={`policy-${key}-${language}`} disabled={editorDisabled} rows={8} maxLength={2000} value={content.copy[key][language]} onChange={(event) => updateCopy(key, language, event.target.value)}/></div>)}</div></section>)}</section>
      <section className="space-y-4 border-t pt-6" aria-label="Publish policy">
        <Heading level="h2">发布前核对 / Publication review</Heading>
        {!savedMatches && <Text>请先保存当前编辑；发布不会自动保存。 / Save the current edits first. Publishing does not save them automatically.</Text>}
        {!publicationDetailsReady && <Text>发布前须填写正式销售主体、有效客服邮箱，并补全消费者权利文案中的待确认信息。 / Complete the legal seller, valid support email and unfinished consumer-rights copy before publication.</Text>}
        {alreadyPublished && <Text>当前内容已发布。 / This content is already published.</Text>}
        <label className="flex items-start gap-3" htmlFor="policy-publication-review"><input id="policy-publication-review" type="checkbox" className="mt-1" checked={reviewed} disabled={editorDisabled || !savedMatches || !publicationDetailsReady || alreadyPublished} onChange={(event) => setReviewed(event.target.checked)}/><span>我已核对期限数字和中英文文案一致、销售主体和客服信息准确、配送范围和运费与实际设置一致，并确认立即发布。 / I reviewed the numeric limits and both languages, verified seller and support details, checked coverage and shipping prices against actual settings, and confirm immediate publication.</span></label>
        {pendingPublish && <Text>该发布请求结果尚未确认。编辑暂时锁定；重试会使用同一个请求标识。 / This publication request is unconfirmed. Editing is temporarily locked; retries use the same request ID.</Text>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={editorDisabled} onClick={save}>保存草稿 / Save draft</Button><Button disabled={busy || (!pendingPublish && !canPublish)} onClick={publish}>{pendingPublish ? "重试发布 / Retry publication" : "立即发布 / Publish now"}</Button></div>
      </section>
    </>}
  </Container>;
}
export const config = defineRouteConfig({ label: "SnowForce policies" });
