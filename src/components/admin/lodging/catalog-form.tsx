"use client";

import { useActionState, useId, useState } from "react";
import { ArrowLeft, Building2, CalendarDays } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { saveLodgingCatalog, type CatalogState } from "@/lib/lodging/actions";
import type { Catalog, CatalogKind, Offer, Property, Room } from "@/lib/lodging/catalog";
import { PackagePriceField } from "./package-fields";
import type { LodgingEvent } from "./types";

export const lodgingControl = "mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100";
const labels = { property: { en: "hotel", zh: "酒店" }, room: { en: "room type", zh: "房型" }, offer: { en: "activity package", zh: "活动套餐" } };

function Field({ name, label, value, type = "text", min, max, step, optional = false }: { name: string; label: string; value?: string | number; type?: string; min?: number; max?: number; step?: number; optional?: boolean }) {
  const id = useId();
  return <label htmlFor={id} className="block text-sm font-medium text-gray-700">{label}<input id={id} name={name} type={type} defaultValue={value} required={!optional} min={min} max={max} step={step} maxLength={type === "url" ? 2000 : 200} className={lodgingControl} /></label>;
}

export function CatalogForm({ kind, catalog, row, events, defaultEventSlug, onClose, onSaved }: {
  kind: CatalogKind; catalog: Catalog; row?: Property | Room | Offer; events: LodgingEvent[]; defaultEventSlug: string;
  onClose(): void; onSaved(): void;
}) {
  const { t } = useLanguage();
  const [state, action, pending] = useActionState(async (previous: CatalogState, form: FormData) => {
    const result = await saveLodgingCatalog(previous, form);
    if (result.code === "saved") onSaved();
    return result;
  }, { code: "idle" });
  const property = kind === "property" ? row as Property | undefined : undefined;
  const room = kind === "room" ? row as Room | undefined : undefined;
  const offer = kind === "offer" ? row as Offer | undefined : undefined;
  const initialRoom = catalog.rooms.find(item => item.id === offer?.room_type_id);
  const [propertyId, setPropertyId] = useState(room?.property_id ?? initialRoom?.property_id ?? "");
  const [roomId, setRoomId] = useState(offer?.room_type_id ?? "");
  const [eventSlug, setEventSlug] = useState(offer?.event_slug ?? defaultEventSlug);
  const errors: Record<CatalogState["code"], { en: string; zh: string }> = {
    idle: { en: "", zh: "" }, saved: { en: "Saved", zh: "已保存" },
    invalid: { en: "Check the dates, prices and required bilingual fields before saving.", zh: "请检查日期、价格及必填的中英文字段后重试。" },
    conflict: { en: "Another staff member changed this record. Reload the page before editing it again.", zh: "其他工作人员已修改这条记录，请重新加载页面后再编辑。" },
    unavailable: { en: "Could not save. Your entries are retained. Check the connection or duplicate records and retry.", zh: "保存失败，输入内容已保留。请检查连接或是否有重复记录后重试。" },
  };
  return <div className="space-y-5">
    <button type="button" disabled={pending} onClick={onClose} className="inline-flex min-h-11 items-center gap-2 text-sm text-gray-600 hover:text-blue-700 focus-visible:outline focus-visible:outline-2"><ArrowLeft size={16} aria-hidden="true" />{t({ en: "Back to lodging management", zh: "返回住宿管理" })}</button>
    <div><h3 className="text-xl font-semibold">{row ? t({ en: `Edit ${labels[kind].en}`, zh: `编辑${labels[kind].zh}` }) : t({ en: `Add ${labels[kind].en}`, zh: `新增${labels[kind].zh}` })}</h3><p className="mt-1 text-sm text-gray-500">{t(kind === "offer" ? { en: "Choose the activity and room type, then set a fixed package price per person.", zh: "选择活动和对应房型，再设置含住宿的每人固定套餐价。" } : { en: "Reusable information for every activity that uses this hotel.", zh: "统一维护资料，可在不同活动中重复使用。" })}</p></div>
    <form action={action} className="rounded-xl border border-gray-200 bg-white">
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={row?.id ?? ""} /><input type="hidden" name="version" value={row?.version ?? 1} />
      <fieldset disabled={pending} className="space-y-7 p-5 sm:p-6">
        {kind !== "offer" && <div className="grid gap-4 md:grid-cols-2"><Field name="name_en" label="Name · English" value={(property ?? room)?.name.en} /><Field name="name_zh" label="名称 · 中文" value={(property ?? room)?.name.zh} /></div>}
        {kind === "property" && <>
          <Field name="address" label={t({ en: "Address", zh: "酒店地址" })} value={property?.address} />
          <div className="grid gap-4 md:grid-cols-2"><Field name="timezone" label={t({ en: "Hotel time zone", zh: "酒店时区" })} value={property?.timezone ?? "America/Los_Angeles"} /><Field name="photo_url" label={t({ en: "Photo URL (HTTPS, optional)", zh: "照片链接（HTTPS，选填）" })} type="url" value={property?.photo_url} optional /></div>
        </>}
        {kind === "room" && <>
          <label className="block text-sm font-medium text-gray-700">{t({ en: "Hotel", zh: "所属酒店" })}<select name="property_id" required defaultValue={room?.property_id ?? ""} className={lodgingControl}><option value="">{t({ en: "Choose a hotel", zh: "请选择酒店" })}</option>{catalog.properties.map(item => <option key={item.id} value={item.id}>{t(item.name)}</option>)}</select></label>
          <div className="grid gap-4 md:grid-cols-2"><Field name="beds_en" label="Bed layout · English" value={room?.beds.en} /><Field name="beds_zh" label="床型说明 · 中文" value={room?.beds.zh} /></div>
          <Field name="max_guests" type="number" min={1} max={30} step={1} label={t({ en: "Maximum guests per room, including children", zh: "每间最多入住人数（含儿童）" })} value={room?.max_guests} />
        </>}
        {kind === "offer" && <>
          <section className="space-y-4"><h4 className="flex items-center gap-2 font-semibold"><CalendarDays size={18} aria-hidden="true" />{t({ en: "Activity and stay", zh: "活动与入住安排" })}</h4>
            <label className="block text-sm font-medium text-gray-700">{t({ en: "Activity", zh: "关联活动" })}<select name="event_slug" required value={eventSlug} onChange={e => setEventSlug(e.target.value)} className={lodgingControl}><option value="">{t({ en: "Choose an activity", zh: "请选择活动" })}</option>{events.map(event => <option key={event.slug} value={event.slug}>{t(event.title)}{event.eventDate ? ` · ${event.eventDate}` : ""}</option>)}{offer && !events.some(event => event.slug === offer.event_slug) && <option value={offer.event_slug}>{offer.event_slug}</option>}</select></label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700">{t({ en: "Hotel", zh: "选择酒店" })}<select required value={propertyId} onChange={e => { setPropertyId(e.target.value); setRoomId(""); }} className={lodgingControl}><option value="">{t({ en: "Choose a hotel", zh: "请选择酒店" })}</option>{catalog.properties.map(item => <option key={item.id} value={item.id}>{t(item.name)}</option>)}</select></label>
              <label className="block text-sm font-medium text-gray-700">{t({ en: "Room type", zh: "选择房型" })}<select name="room_type_id" required value={roomId} onChange={e => setRoomId(e.target.value)} disabled={!propertyId} className={`${lodgingControl} disabled:bg-gray-50`}><option value="">{t({ en: "Choose a room type", zh: "请选择房型" })}</option>{catalog.rooms.filter(item => item.property_id === propertyId).map(item => <option key={item.id} value={item.id}>{t(item.name)}</option>)}</select></label>
            </div>
            <div className="grid gap-4 md:grid-cols-2"><Field name="check_in" type="date" label={t({ en: "Check-in (hotel local date)", zh: "入住日期（酒店当地）" })} value={offer?.check_in} /><Field name="check_out" type="date" label={t({ en: "Check-out", zh: "退房日期" })} value={offer?.check_out} /></div>
          </section>
          <section className="border-t border-gray-100 pt-6"><PackagePriceField offer={offer} /></section>
          <section className="space-y-4 border-t border-gray-100 pt-6"><h4 className="font-semibold">{t({ en: "Cancellation policy", zh: "取消政策" })}</h4><div className="grid gap-4 md:grid-cols-2">{(["en", "zh"] as const).map(language => <label key={language} className="block text-sm font-medium text-gray-700">{language === "en" ? "Cancellation policy · English" : "取消政策 · 中文"}<textarea name={`policy_${language}`} required maxLength={10000} defaultValue={offer?.policy[language]} rows={4} className={lodgingControl} /></label>)}</div></section>
          <details className="border-t border-gray-100 pt-5"><summary className="cursor-pointer text-sm font-medium text-gray-600"><Building2 size={16} className="mr-2 inline" aria-hidden="true" />{t({ en: "Internal hotel costs (optional)", zh: "内部酒店成本（选填）" })}</summary><p className="my-3 text-sm text-gray-500">{t({ en: "For internal estimates only. Never added to the per-person package price.", zh: "仅用于内部核算，不叠加到每人套餐价。" })}</p><div className="grid gap-4 md:grid-cols-3"><Field name="nightly_price" type="number" min={0} max={1000000} step={0.01} label={t({ en: "Room cost per night (USD)", zh: "每间每晚成本（美元）" })} value={(offer?.nightly_amount ?? 0) / 100} /><Field name="mandatory_price" type="number" min={0} max={1000000} step={0.01} label={t({ en: "Fees per room per stay (USD)", zh: "每间全程费用（美元）" })} value={(offer?.mandatory_fee ?? 0) / 100} /><Field name="tax_percent" type="number" min={0} max={100} step={0.01} label={t({ en: "Estimated hotel tax (%)", zh: "酒店税率估算（%）" })} value={(offer?.tax_basis_points ?? 0) / 100} /></div></details>
        </>}
      </fieldset>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-4 sm:px-6">
        <p role="status" aria-live="polite" className={`text-sm ${state.code === "idle" || state.code === "saved" ? "text-gray-500" : "text-red-700"}`}>{t(errors[state.code])}</p>
        <div className="flex gap-3"><button type="button" onClick={onClose} disabled={pending} className="min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium disabled:opacity-50">{t({ en: "Cancel", zh: "取消" })}</button><button disabled={pending} type="submit" className="min-h-11 rounded-lg bg-[#0066cc] px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{pending ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save draft", zh: "保存草稿" })}</button></div>
      </footer>
    </form>
  </div>;
}
