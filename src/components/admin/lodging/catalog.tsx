"use client";
import { useActionState, useId, useState } from "react";
import { useLanguage } from "@/lib/language";
import { saveLodgingCatalog } from "@/lib/lodging/actions";
import { draftOfferTotal, draftPackageTotal, type Catalog, type CatalogKind, type Property, type Room, type Offer } from "@/lib/lodging/catalog";
import { PackagePriceField } from "./package-fields";

const copy = {
 title: { en: "Lodging catalog", zh: "住宿资料管理" },
 notice: { en: "Draft setup only. Rooms cannot be booked or paid for yet. Activity packages are priced per person, including lodging; staff arrange roommates. Hotel costs are internal estimates.", zh: "当前仅配置草稿，尚未开放订房和付款。活动套餐按每人定价，已含住宿，由工作人员安排同住。酒店成本为内部预估。" },
 disabled: { en: "Lodging setup is disabled. Enable it after the catalog migration has been applied.", zh: "住宿配置尚未启用，需先完成住宿数据库迁移。" },
 error: { en: "Lodging data could not be loaded. Check database configuration and migration, then reload.", zh: "住宿资料加载失败，请检查数据库配置和迁移后重新加载。" },
 property: { en: "Hotel", zh: "酒店" }, room: { en: "Room type", zh: "房型" }, offer: { en: "Event lodging draft", zh: "活动住宿草稿" },
 saved: { en: "Saved", zh: "已保存" }, idle: { en: "", zh: "" },
 invalid: { en: "Check the highlighted field name below and correct your input.", zh: "请根据下方字段名称检查并修改输入。" },
 conflict: { en: "Another administrator changed this record. Reload before editing again.", zh: "其他管理员已修改此记录，请重新加载后编辑。" },
 unavailable: { en: "Could not save. Check setup or duplicate records, then retry.", zh: "保存失败，请检查配置或重复记录后重试。" },
};
function Field({ name, label, value, type = "text", min, max }: { name: string; label: string; value?: string | number; type?: string; min?: number; max?: number }) {
 const id = useId();
 return <label htmlFor={id} className="grid gap-1 text-sm">{label}<input className="rounded border p-2" id={id} name={name} type={type} defaultValue={value} required={name !== "photo_url"} min={min} max={max} step={type === "number" ? 1 : undefined} maxLength={type === "url" ? 2000 : 200} /></label>;
}
function CatalogForm({ kind, catalog, row, eventSlug }: { kind: CatalogKind; catalog: Catalog; row?: Property | Room | Offer; eventSlug?: string }) {
 const { t } = useLanguage();
 const [state, action, pending] = useActionState(saveLodgingCatalog, { code: "idle" });
 const property = kind === "property" ? row as Property | undefined : undefined;
 const room = kind === "room" ? row as Room | undefined : undefined;
 const offer = kind === "offer" ? row as Offer | undefined : undefined;
 return <form action={action} className="my-4 space-y-4 rounded border bg-white p-4">
  <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={row?.id ?? ""} /><input type="hidden" name="version" value={row?.version ?? 1} />
  {kind !== "offer" ? <div className="grid gap-3 sm:grid-cols-2"><Field name="name_en" label="Name · English" value={(property ?? room)?.name.en} /><Field name="name_zh" label="名称 · 中文" value={(property ?? room)?.name.zh} /></div> : null}
  {kind === "property" ? <><Field name="address" label={t({ en: "Address", zh: "酒店地址" })} value={property?.address} /><Field name="timezone" label={t({ en: "Hotel time zone", zh: "酒店时区" })} value={property?.timezone ?? "America/Los_Angeles"} /><Field name="photo_url" label={t({ en: "Photo URL (HTTPS, optional)", zh: "照片链接（HTTPS，可选）" })} type="url" value={property?.photo_url} /></> : null}
  {kind === "room" ? <><label className="grid gap-1 text-sm">{t(copy.property)}<select name="property_id" defaultValue={room?.property_id} required className="rounded border p-2"><option value="">—</option>{catalog.properties.map(p => <option key={p.id} value={p.id}>{t(p.name)}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><Field name="beds_en" label="Bed layout · English" value={room?.beds.en} /><Field name="beds_zh" label="床型说明 · 中文" value={room?.beds.zh} /></div><Field name="max_guests" type="number" min={1} max={30} label={t({ en: "Maximum guests, including children", zh: "最多入住人数（含儿童）" })} value={room?.max_guests} /></> : null}
  {kind === "offer" ? <>
    {eventSlug ? <input type="hidden" name="event_slug" value={eventSlug} /> : <Field name="event_slug" label={t({ en: "Event slug", zh: "活动 slug" })} value={offer?.event_slug} />}
    <label className="grid gap-1 text-sm">{t(copy.room)}<select name="room_type_id" defaultValue={offer?.room_type_id} required className="rounded border p-2"><option value="">—</option>{catalog.rooms.map(r => <option key={r.id} value={r.id}>{t(catalog.properties.find(p => p.id === r.property_id)?.name ?? { en: "", zh: "" })} · {t(r.name)}</option>)}</select></label>
    <div className="grid gap-3 sm:grid-cols-2"><Field name="check_in" type="date" label={t({ en: "Check-in (hotel local date)", zh: "入住日期（酒店当地）" })} value={offer?.check_in} /><Field name="check_out" type="date" label={t({ en: "Check-out", zh: "退房日期" })} value={offer?.check_out} /></div>
    <PackagePriceField offer={offer} />
    <details className="space-y-3 rounded border p-3"><summary className="cursor-pointer text-sm font-medium">{t({ en: "Internal hotel cost estimate", zh: "酒店成本估算（内部）" })}</summary>
      <p className="text-sm text-gray-600">{t({ en: "These costs are not added to the per-person package price.", zh: "这些成本不再叠加到每人套餐价中。" })}</p>
      <Field name="nightly_amount" type="number" min={0} max={100000000} label={t({ en: "Cost per unit per night (USD cents)", zh: "每套每晚成本（美元分）" })} value={offer?.nightly_amount ?? 0} />
      <Field name="mandatory_fee" type="number" min={0} max={100000000} label={t({ en: "Mandatory cost per unit per stay (USD cents)", zh: "每套全程必付成本（美元分）" })} value={offer?.mandatory_fee ?? 0} />
      <Field name="tax_basis_points" type="number" min={0} max={10000} label={t({ en: "Estimated hotel tax basis points (100 = 1%)", zh: "酒店税率估算基点（100 = 1%）" })} value={offer?.tax_basis_points ?? 0} />
      {offer && <p className="text-sm">{t({ en: "Estimated cost per unit for the stay", zh: "每套全程成本估算" })}: USD {(draftOfferTotal(offer).total / 100).toFixed(2)}</p>}
    </details>
    <div className="grid gap-3 sm:grid-cols-2">{(["en", "zh"] as const).map(lang => <label key={lang} className="grid gap-1 text-sm">{lang === "en" ? "Cancellation policy · English" : "取消政策 · 中文"}<textarea name={`policy_${lang}`} required maxLength={10000} defaultValue={offer?.policy[lang]} className="min-h-28 rounded border p-2" /></label>)}</div>
  </> : null}
  <p role="status" aria-live="polite" className="text-sm">{t(copy[state.code])}{state.field ? ` (${state.field})` : ""}</p>
  <button type="submit" disabled={pending} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save draft", zh: "保存草稿" })}</button>
 </form>;
}
export function LodgingCatalog({ status, catalog = { properties: [], rooms: [], offers: [] } }: { status: "ready" | "disabled" | "error"; catalog?: Catalog }) {
 const { t } = useLanguage();
 return <div><h2 className="text-xl font-semibold">{t(copy.title)}</h2><p className="my-4 text-sm text-gray-600">{t(copy.notice)}</p>{status !== "ready" ? <p role="status">{t(copy[status])}</p> : <>{(["property", "room", "offer"] as const).map(kind => {
 const rows = kind === "property" ? catalog.properties : kind === "room" ? catalog.rooms : catalog.offers;
 return <section className="my-8" key={kind}><h3 className="text-lg font-semibold">{t(copy[kind])} ({rows.length})</h3>{rows.map(row => <details key={`${row.id}-${row.version}`} className="my-3 rounded border p-3"><summary className="cursor-pointer">{"name" in row ? t(row.name) : `${row.event_slug} · ${row.check_in} — ${row.check_out} · ${row.package_amount == null ? t({ en: "Package price not set", zh: "套餐价未设置" }) : `USD ${(row.package_amount / 100).toFixed(2)} ${t({ en: "per person, lodging included", zh: "每人，含住宿" })}`}`}</summary><CatalogForm kind={kind} catalog={catalog} row={row} /></details>)}<details className="my-3 rounded border p-3"><summary className="cursor-pointer">{t({ en: "Add", zh: "新增" })} · {t(copy[kind])}</summary><CatalogForm kind={kind} catalog={catalog} /></details></section>;
 })}</>}</div>;
}

export function EventLodgingPackages({ eventSlug, catalog, status }: { eventSlug: string; catalog?: Catalog; status: "ready" | "disabled" | "error" }) {
  const { t } = useLanguage();
  const [selectedId, setSelectedId] = useState("");
  const [participants, setParticipants] = useState(1);
  const offers = catalog?.offers.filter(offer => offer.event_slug === eventSlug) ?? [];
  const pricedOffers = offers.filter(offer => offer.package_amount != null);
  const selected = pricedOffers.find(offer => offer.id === selectedId);
  const total = selected ? draftPackageTotal(selected, participants) : null;
  return <section id="event-lodging-settings" className="card my-6 space-y-4 scroll-mt-6">
    <h2 className="text-xl font-semibold">{t({ en: "Room-type activity packages", zh: "活动房型套餐" })}</h2>
    <p className="text-sm text-gray-600">{t(copy.notice)}</p>
    {status !== "ready" || !catalog ? <p role="status">{t(copy[status === "ready" ? "error" : status])}</p> : <>
      <a href="/admin/lodging" className="inline-block text-sm text-blue-700 underline">{t({ en: "Manage reusable hotels and room types", zh: "维护通用酒店和房型资料" })}</a>
      <div className="rounded border p-4 space-y-3">
        <h3 className="font-semibold">{t({ en: "Staff price preview", zh: "工作人员价格预览" })}</h3>
        <label className="grid gap-1 text-sm">{t({ en: "Preview room type", zh: "预览房型" })}<select value={selected?.id ?? ""} onChange={e => setSelectedId(e.target.value)} className="rounded border p-2">
          <option value="">{t({ en: "Choose a priced package", zh: "选择已定价的套餐" })}</option>
          {pricedOffers.map(offer => <option key={offer.id} value={offer.id}>{t(catalog.rooms.find(room => room.id === offer.room_type_id)?.name ?? { en: "Room type unavailable", zh: "房型不可用" })} · {offer.check_in} — {offer.check_out} · USD {((offer.package_amount ?? 0) / 100).toFixed(2)} {t({ en: "per person", zh: "每人" })}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">{t({ en: "Preview participants", zh: "预览人数" })}<input type="number" min={1} max={1000} step={1} value={Number.isNaN(participants) ? "" : participants} onChange={e => setParticipants(e.target.valueAsNumber)} className="rounded border p-2" /></label>
        <p role="status" className="text-sm font-medium">{total === null ? t({ en: "Choose a package and a valid participant count to preview the total.", zh: "选择套餐并填写有效人数后预览总价。" }) : t({ en: `${participants} people · USD ${(total / 100).toFixed(2)} total, lodging included`, zh: `${participants} 人 · 总计 USD ${(total / 100).toFixed(2)}，已含住宿` })}</p>
      </div>
      {offers.map(offer => <details key={`${offer.id}-${offer.version}`} className="rounded border p-3"><summary className="cursor-pointer">{t(catalog.rooms.find(room => room.id === offer.room_type_id)?.name ?? { en: "Room type unavailable", zh: "房型不可用" })} · {offer.check_in} — {offer.check_out}</summary><CatalogForm kind="offer" catalog={catalog} row={offer} eventSlug={eventSlug} /></details>)}
      <details className="rounded border p-3"><summary className="cursor-pointer">{t({ en: "Add room-type package", zh: "新增房型套餐" })}</summary><CatalogForm kind="offer" catalog={catalog} eventSlug={eventSlug} /></details>
    </>}
  </section>;
}
