import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui";
import { merchandisingCommand, merchandisingRecord, type MerchandisingFields } from "../../lib/merchandising-contract";
import { z } from "zod";

type RecordValue = z.infer<typeof merchandisingRecord>;
type Command = z.infer<typeof merchandisingCommand>;
export function MerchandisingEditor({ kind, id }: { kind: MerchandisingFields["kind"]; id: string }) {
  const [record, setRecord] = useState<RecordValue | null>(null);
  const [fields, setFields] = useState<MerchandisingFields | null>(null);
  const [pending, setPending] = useState<Command | null>(null);
  const [status, setStatus] = useState("loading");
  const mounted = useRef(true), busy = useRef(false);
  const url = `/admin/snowforce/merchandising/${kind}/${encodeURIComponent(id)}`;
  const load = useCallback(async () => {
    if (busy.current) return; busy.current = true; setStatus("loading");
    try {
      const response = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error();
      const value = merchandisingRecord.parse(await response.json());
      if (value.id !== id || value.fields.kind !== kind) throw new Error();
      if (mounted.current) { setRecord(value); setFields(value.fields); setPending(null); setStatus("ready"); }
    } catch { if (mounted.current) setStatus("load-error"); }
    finally { busy.current = false; }
  }, [url, id, kind]);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);
  async function save() {
    if (busy.current || !record || !fields) return;
    const parsed = merchandisingCommand.safeParse(pending ?? { expected_fingerprint: record.fingerprint, fields });
    if (!parsed.success) { setStatus("invalid"); return; }
    const command = parsed.data; setPending(command); busy.current = true; setStatus("saving");
    try {
      const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      if ([400, 401, 403, 404, 409, 422].includes(response.status)) { if (mounted.current) { setPending(null); setStatus(response.status === 409 ? "conflict" : "rejected"); } return; }
      if (!response.ok) throw new Error();
      const value = merchandisingRecord.parse(await response.json());
      if (value.id !== id || JSON.stringify(value.fields) !== JSON.stringify(command.fields)) throw new Error();
      if (mounted.current) { setRecord(value); setFields(value.fields); setPending(null); setStatus("saved"); }
    } catch { if (mounted.current) setStatus("uncertain"); }
    finally { busy.current = false; }
  }
  const locked = pending !== null || status === "loading" || status === "saving";
  const prefix = `merch-${kind}-${id}`;
  return <Container className="space-y-4"><Heading level="h2">商城展示 / Storefront merchandising</Heading>
    <Text>分类与商品关联在 Medusa 原生编辑器管理。此处管理品牌和导航展示，保存后前台下一次加载自动读取。 / Manage category assignments in the native editor. Changes here appear on the next storefront load.</Text>
    {fields?.kind === "product" && <div><Label htmlFor={`${prefix}-brand`}>品牌 / Brand</Label><Input id={`${prefix}-brand`} maxLength={80} value={fields.brand} disabled={locked} onChange={event => setFields({ ...fields, brand: event.target.value })} /></div>}
    {fields && fields.kind !== "product" && <>
      <div><Label htmlFor={`${prefix}-zh`}>中文名称 / Chinese name</Label><Input id={`${prefix}-zh`} maxLength={200} value={fields.name_zh} disabled={locked} onChange={event => setFields({ ...fields, name_zh: event.target.value })} /></div>
      <div><Label htmlFor={`${prefix}-image`}>展示图片 HTTPS URL / Editorial image</Label><Input id={`${prefix}-image`} maxLength={2000} value={fields.image} disabled={locked} onChange={event => setFields({ ...fields, image: event.target.value })} /></div>
      <div><Label htmlFor={`${prefix}-section`}>导航栏目 / Navigation section</Label><select id={`${prefix}-section`} className="w-full rounded border px-3 py-2" value={fields.section} disabled={locked} onChange={event => setFields({ ...fields, section: event.target.value } as MerchandisingFields)}>
        {fields.kind === "category" ? <><option value="auto">自动 / Automatic</option><option value="men">MEN / 男士</option><option value="women">WOMEN / 女士</option><option value="kids">KIDS / 儿童</option><option value="ski-snowboard">SKI & SNOWBOARD / 双板与单板</option><option value="accessories">ACCESSORIES / 配件</option></> : <><option value="featured">FEATURED / 精选</option><option value="sale">SALE / 优惠</option><option value="hidden">从导航隐藏 / Hide from navigation</option></>}
      </select><Text>分类栏目仅对顶级分类生效；子分类跟随父分类。 / Category sections apply to roots; descendants follow their parent.</Text></div>
    </>}
    {fields?.kind === "collection" && <>
      <div><Label htmlFor={`${prefix}-rank`}>展示顺序 / Display order</Label><Input id={`${prefix}-rank`} type="number" min={0} max={10000} value={fields.rank} disabled={locked} onChange={event => setFields({ ...fields, rank: Number(event.target.value) })} /></div>
      <div><Label htmlFor={`${prefix}-promotion`}>公开促销码（可选）/ Public promotion code</Label><Input id={`${prefix}-promotion`} maxLength={100} value={fields.promotion_code} disabled={locked} onChange={event => setFields({ ...fields, promotion_code: event.target.value })} /><Text>填写 Promotions 中已有的 code。只有已启用、在有效期内且未用尽的促销才会展示；具体优惠由购物车核验。 / Link an existing promotion. Only active, current promotions are shown; the cart verifies eligibility.</Text></div>
    </>}
    <div role="status" aria-live="polite"><Text>{({ loading: "加载中 / Loading…", "load-error": "读取失败，请重试 / Could not load. Retry.", invalid: "请检查 HTTPS 图片及字段 / Check the image URL and fields.", saving: "保存中 / Saving…", saved: "已保存 / Saved.", conflict: "数据已变化，请重新加载 / Data changed. Reload before saving.", rejected: "保存未被接受，请检查登录状态 / Save rejected. Check your session.", uncertain: "保存结果未知；重试会复用相同内容 / Save outcome unknown; retry uses the same values." } as Record<string, string>)[status]}</Text></div>
    <div className="flex gap-3"><Button variant="secondary" disabled={locked} onClick={() => void load()}>重新加载 / Reload</Button><Button disabled={!fields || status === "loading" || status === "saving" || status === "conflict"} onClick={() => void save()}>{pending ? "重试保存 / Retry save" : "保存展示 / Save merchandising"}</Button></div>
  </Container>;
}
