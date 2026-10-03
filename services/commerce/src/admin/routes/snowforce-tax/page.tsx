import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Input, Label, Text, Textarea } from "@medusajs/ui";
import { useEffect, useRef, useState } from "react";
import { taxClassificationCommandSchema, taxCodeCatalogSchema, taxProductPageSchema, taxSaveResponseSchema, supportedProductTaxCode, type TaxCode, type TaxClassificationCommand, type TaxProductRecord } from "../../../lib/tax-classification-contract";

type Pending = { productId: string; command: TaxClassificationCommand };
export default function SnowforceTaxPage() {
  const [page, setPage] = useState<{ products: TaxProductRecord[]; count: number; offset: number; limit: 50 } | null>(null);
  const [selected, setSelected] = useState("");
  const [codes, setCodes] = useState<TaxCode[] | null>(null);
  const [search, setSearch] = useState("");
  const [codeId, setCodeId] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState("loading");
  const [catalogStatus, setCatalogStatus] = useState("idle");
  const [pending, setPending] = useState<Pending | null>(null);
  const mounted = useRef(true), busy = useRef(false), loading = useRef(false), catalogBusy = useRef(false);
  const record = page?.products.find(product => product.id === selected);
  const current = record?.state?.history.at(-1);
  const picked = codes?.find(code => code.id === codeId);
  const filtered = codes?.filter(code => `${code.id} ${code.name} ${code.description}`.toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  function choose(product: TaxProductRecord | undefined) {
    setSelected(product?.id ?? ""); setCodeId(product?.state?.history.at(-1)?.code.id ?? "");
    setNote(""); setConfirmed(false);
  }
  async function load(offset: number) {
    if (loading.current || busy.current || pending) return;
    loading.current = true; setStatus("loading");
    try {
      const response = await fetch(`/admin/snowforce/tax/products?offset=${offset}`, { credentials: "include" });
      if (!response.ok) throw new Error();
      const result = taxProductPageSchema.parse(await response.json());
      if (result.offset !== offset) throw new Error();
      if (mounted.current) { setPage(result); choose(result.products.find(product => product.id === selected) ?? result.products[0]); setStatus("ready"); }
    } catch { if (mounted.current) setStatus("load-error"); }
    finally { loading.current = false; }
  }
  useEffect(() => { mounted.current = true; void load(0); return () => { mounted.current = false; }; }, []);
  async function loadCodes() {
    if (catalogBusy.current || busy.current || pending) return;
    catalogBusy.current = true;
    setCatalogStatus("loading");
    try {
      const response = await fetch("/admin/snowforce/tax/codes", { credentials: "include" });
      if (!response.ok) throw new Error();
      const result = taxCodeCatalogSchema.parse(await response.json());
      if (new Set(result.codes.map(code => code.id)).size !== result.codes.length) throw new Error();
      if (mounted.current) { setCodes(result.codes); setCatalogStatus("ready"); }
    } catch { if (mounted.current) setCatalogStatus("error"); }
    finally { catalogBusy.current = false; }
  }
  async function save() {
    if (!record || busy.current || loading.current) return;
    let attempt = pending;
    if (!attempt) {
      const command = taxClassificationCommandSchema.safeParse({ request_id: crypto.randomUUID(), expected_revision: record.state?.revision ?? 0, source_fingerprint: record.source_fingerprint, tax_code: codeId, confirm_review: confirmed, note });
      if (!command.success || !picked || !supportedProductTaxCode(picked) || record.unsupported) { setStatus("invalid"); return; }
      attempt = { productId: record.id, command: command.data }; setPending(attempt);
    }
    busy.current = true; setStatus("saving");
    try {
      const response = await fetch(`/admin/snowforce/tax/products/${attempt.productId}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(attempt.command) });
      if ([400,401,403,404,409,422].includes(response.status)) { if (mounted.current) { setPending(null); setConfirmed(false); setStatus(response.status === 409 ? "conflict" : "rejected"); } return; }
      if (!response.ok) throw new Error();
      const result = taxSaveResponseSchema.parse(await response.json());
      const receipt = result.product.state?.history.find(entry => entry.request_id === attempt.command.request_id);
      if (result.product.id !== attempt.productId || result.applied_revision !== attempt.command.expected_revision + 1 || !receipt || receipt.revision !== result.applied_revision || receipt.code.id !== attempt.command.tax_code || receipt.source_fingerprint !== attempt.command.source_fingerprint || receipt.note !== attempt.command.note) throw new Error();
      if (mounted.current) { setPage(value => value ? { ...value, products: value.products.map(product => product.id === result.product.id ? result.product : product) } : value); choose(result.product); setPending(null); setStatus(result.product.state?.revision === result.applied_revision ? "saved" : "saved-newer"); }
    } catch { if (mounted.current) setStatus("uncertain"); }
    finally { busy.current = false; }
  }
  const locked = !!pending || status === "loading" || status === "saving";
  return <Container className="max-w-5xl space-y-6">
    <div><Heading>商品税务分类 / Product tax classifications</Heading><Text className="text-ui-fg-subtle">为每件装备审核 Stripe 官方商品分类。美元售价未含税，所有颜色及尺码共用该分类；新增或更改商品内容后需重新审核。 / Review the official category for each product and all its variants. Prices exclude tax.</Text></div>
    <Text>分类保存不会启用收税。许可证、运费税务处理、精确计税及税账验收完成后才能开启付款。 / Saving a classification does not enable tax collection or payments.</Text>
    <div role="status" aria-live="polite">
      {status === "loading" && <Text>加载商品 / Loading products…</Text>}
      {status === "load-error" && <Text>商品加载失败，请重试。 / Products could not be loaded.</Text>}
      {status === "saved" && <Text>已保存审核记录。 / Review saved.</Text>}
      {status === "saved-newer" && <Text>此请求已保存，当前显示后续的最新版本。 / This request was saved; a newer review is shown.</Text>}
      {status === "conflict" && <Text>商品或审核版本已变化，请重新加载后审核。 / Product or review changed. Reload and review again.</Text>}
      {status === "rejected" && <Text>保存未被接受。请重新登录或检查分类及审核信息。 / Save rejected. Check your session and review.</Text>}
      {status === "invalid" && <Text>请选择已加载的官方分类，填写至少 5 个字的依据并勾选审核确认。 / Select an official category, add a review note and confirm.</Text>}
      {status === "uncertain" && <Text>保存结果尚未确认。编辑已锁定；重试会使用同一请求，避免重复记录。 / Save outcome is unknown. Retry uses the same request.</Text>}
    </div>
    <div className="flex items-center gap-3"><Button variant="secondary" disabled={locked} onClick={() => void load(page?.offset ?? 0)}>重新加载 / Reload</Button><Button variant="secondary" disabled={locked || !page || page.offset === 0} onClick={() => void load(Math.max(0,(page?.offset ?? 0)-50))}>上一页 / Previous</Button><Button variant="secondary" disabled={locked || !page || page.offset+page.products.length >= page.count} onClick={() => void load((page?.offset ?? 0)+50)}>下一页 / Next</Button>{page && <Text>{page.count} 件商品 / products</Text>}</div>
    {page && <div><Label htmlFor="tax-product">商品 / Product</Label><select id="tax-product" value={selected} disabled={locked} onChange={event => { choose(page.products.find(product => product.id === event.target.value)); setStatus("ready"); }} className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2">{page.products.map(product => <option key={product.id} value={product.id}>{product.title} · {product.status} · {product.ready ? "已审核 / reviewed" : product.state ? "需重新审核 / review again" : "未分类 / unclassified"}</option>)}</select>{!page.products.length && <Text>还没有商品。请先建立商品草稿。 / Create product drafts first.</Text>}</div>}
    {record && <>
      <div><Text>{record.variant_count} 个规格 / variants · {record.id}</Text><a href={`/app/products/${record.id}`} className="text-ui-fg-interactive">打开商品编辑 / Open product editor</a>{record.unsupported && <Text>礼品卡不适用本装备商城分类流程。 / Gift cards are not supported by this flow.</Text>}{current && <Text>当前分类：{current.code.name} ({current.code.id}) · v{current.revision} · {current.reviewed_at}{!record.ready && " · 内容已变化或分类不适用，请重新审核 / Review required"}</Text>}</div>
      <div className="space-y-3"><Button variant="secondary" disabled={locked || catalogStatus === "loading"} onClick={() => void loadCodes()}>{catalogStatus === "loading" ? "加载官方分类 / Loading…" : "加载 Stripe 官方分类 / Load official categories"}</Button>{catalogStatus === "error" && <Text>官方分类读取失败，请检查商城 Stripe 配置后重试。 / Check the commerce Stripe configuration and retry.</Text>}{codes && <>
        <div><Label htmlFor="tax-search">搜索分类名称、说明或代码 / Search categories</Label><Input id="tax-search" value={search} disabled={locked} onChange={event => setSearch(event.target.value)} /></div>
        <div><Label htmlFor="tax-code">官方商品税码 / Official product tax code</Label><select id="tax-code" value={codeId} disabled={locked || record.unsupported} onChange={event => { setCodeId(event.target.value); setConfirmed(false); }} className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2"><option value="">请选择 / Select</option>{picked && !filtered.some(code => code.id === picked.id) && <option value={picked.id}>{picked.name} ({picked.id})</option>}{filtered.map(code => <option key={code.id} value={code.id} disabled={!supportedProductTaxCode(code)}>{code.name} ({code.id})</option>)}</select><Text>{filtered.length} 个匹配项 / matches</Text></div>{picked && <Text>{picked.description}</Text>}
      </>}</div>
      <div><Label htmlFor="tax-note">审核依据 / Review note</Label><Textarea id="tax-note" value={note} maxLength={1000} disabled={locked || record.unsupported} onChange={event => setNote(event.target.value)} /></div>
      <label className="flex gap-3"><input id="tax-confirm" type="checkbox" checked={confirmed} disabled={locked || record.unsupported} onChange={event => setConfirmed(event.target.checked)} /><Text>已依据商品资料核实此分类适用于本商品全部规格；这是商品分类审核，不是税务登记确认。 / I reviewed this category for every variant of this product.</Text></label>
      <Button disabled={status === "saving" || status === "loading" || record.unsupported || (!pending && (!codes || !picked || !supportedProductTaxCode(picked) || !confirmed || note.trim().length < 5 || (record.state?.revision ?? 0) >= 100))} onClick={() => void save()}>{status === "saving" ? "保存中 / Saving…" : pending ? "重试同一保存请求 / Retry save" : "保存分类审核 / Save review"}</Button>
      {record.state && <div className="space-y-2"><Heading level="h2">审核历史 / Review history</Heading>{[...record.state.history].reverse().slice(0,10).map(entry => <div key={entry.revision} className="border-t border-ui-border-base pt-2"><Text>v{entry.revision} · {entry.code.name} · {entry.reviewed_at} · {entry.reviewed_by}</Text><Text>{entry.note}</Text></div>)}</div>}
    </>}
    <a className="text-ui-fg-interactive" href="https://docs.stripe.com/tax/tax-codes" target="_blank" rel="noreferrer">Stripe 官方分类说明 / Official classification guide</a>
  </Container>;
}
export const config = defineRouteConfig({ label: "SnowForce product tax" });
