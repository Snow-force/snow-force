"use client";

import { useId, useState } from "react";
import { BedDouble, Building2, CalendarDays, Plus, Search, X } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { draftPackageTotal, type Catalog, type CatalogKind, type Offer, type Property, type Room } from "@/lib/lodging/catalog";
import { CatalogForm, lodgingControl } from "./catalog-form";
import type { LodgingEvent } from "./types";

const emptyCatalog: Catalog = { properties: [], rooms: [], offers: [] };
const sections = [
  { kind: "offer", title: { en: "Activity packages", zh: "活动套餐" }, icon: CalendarDays, add: { en: "Add activity package", zh: "新增活动套餐" } },
  { kind: "property", title: { en: "Hotels", zh: "酒店" }, icon: Building2, add: { en: "Add hotel", zh: "新增酒店" } },
  { kind: "room", title: { en: "Room types", zh: "房型" }, icon: BedDouble, add: { en: "Add room type", zh: "新增房型" } },
] as const;
type CatalogRow = Property | Room | Offer;
const money = (amount: number) => `USD ${(amount / 100).toFixed(2)}`;

function PackagePreview({ offer, name, onClose }: { offer: Offer; name: string; onClose(): void }) {
  const { t } = useLanguage();
  const [count, setCount] = useState(1);
  const total = draftPackageTotal(offer, count);
  return <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6" aria-label={t({ en: "Package price preview", zh: "套餐价格预览" })}>
    <div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-semibold">{t({ en: "Package price preview", zh: "套餐价格预览" })}</h3><p className="mt-1 text-sm text-gray-500">{name}</p></div><button type="button" onClick={onClose} aria-label={t({ en: "Close preview", zh: "关闭预览" })} className="min-h-11 min-w-11 rounded-lg hover:bg-gray-100"><X size={18} aria-hidden="true" className="mx-auto" /></button></div>
    <div className="mt-5 grid items-end gap-5 sm:grid-cols-[180px_1fr]"><label className="text-sm font-medium">{t({ en: "Participants", zh: "参加人数" })}<input type="number" min={1} max={1000} step={1} value={Number.isNaN(count) ? "" : count} onChange={event => setCount(event.target.valueAsNumber)} className={lodgingControl} /></label><div role="status" aria-live="polite"><p className="text-sm text-gray-500">{t({ en: "Package total, lodging included", zh: "套餐总价，已含住宿" })}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{total === null ? "—" : money(total)}</p></div></div>
    <p className="mt-4 text-sm text-gray-500">{t({ en: "Fixed price per person. Staff arrange roommates. This preview does not create a booking.", zh: "每人固定价，工作人员安排同住。本预览不会创建预订。" })}</p>
  </section>;
}

export function LodgingCatalog({ status, catalog = emptyCatalog, events = [], initialEventSlug = "" }: {
  status: "ready" | "disabled" | "error"; catalog?: Catalog; events?: LodgingEvent[]; initialEventSlug?: string;
}) {
  const { t } = useLanguage();
  const searchId = useId();
  const [active, setActive] = useState<CatalogKind>("offer");
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState(initialEventSlug);
  const [hotelFilter, setHotelFilter] = useState("");
  const [editor, setEditor] = useState<{ kind: CatalogKind; row?: CatalogRow } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const section = sections.find(item => item.kind === active)!;
  const hotelName = (id: string) => t(catalog.properties.find(item => item.id === id)?.name ?? { en: "Hotel unavailable", zh: "酒店不可用" }) as string;
  const roomName = (id: string) => t(catalog.rooms.find(item => item.id === id)?.name ?? { en: "Room type unavailable", zh: "房型不可用" }) as string;
  const eventName = (slug: string) => t(events.find(item => item.slug === slug)?.title ?? { en: slug, zh: slug }) as string;
  const offerName = (offer: Offer) => `${eventName(offer.event_slug)} · ${roomName(offer.room_type_id)}`;
  const rows = active === "property" ? catalog.properties : active === "room" ? catalog.rooms : catalog.offers;
  const search = query.trim().toLocaleLowerCase();
  const filtered = rows.filter(row => {
    if (active === "offer" && eventFilter && "event_slug" in row && row.event_slug !== eventFilter) return false;
    if (active === "room" && hotelFilter && "property_id" in row && row.property_id !== hotelFilter) return false;
    if (!search) return true;
    if ("event_slug" in row) {
      const room = catalog.rooms.find(item => item.id === row.room_type_id);
      return [row.event_slug, eventName(row.event_slug), roomName(row.room_type_id), room ? hotelName(room.property_id) : "", row.check_in, row.check_out].join(" ").toLocaleLowerCase().includes(search);
    }
    return [row.name.en, row.name.zh, "address" in row ? row.address : hotelName(row.property_id)].join(" ").toLocaleLowerCase().includes(search);
  });
  const preview = catalog.offers.find(offer => offer.id === previewId);
  const blocked = active === "offer" ? !events.length || !catalog.rooms.length : active === "room" ? !catalog.properties.length : false;
  const noActivityLodging = active === "offer" && Boolean(eventFilter) && !catalog.offers.some(offer => offer.event_slug === eventFilter);
  const emptyTitle = noActivityLodging && !search
    ? t({ en: "No lodging provided", zh: "此活动不提供住宿" })
    : query || eventFilter && active === "offer" || hotelFilter && active === "room"
      ? t({ en: "No matching records", zh: "没有符合条件的记录" })
      : t({ en: "Nothing here yet", zh: "还没有记录" });
  const emptyDescription = noActivityLodging && !search
    ? t({ en: "Lodging is optional. This activity can use its normal registration and pricing without any lodging setup. Add a package only if this activity needs accommodation.", zh: "住宿是可选项，无需补填。此活动沿用普通报名和原有价格；只有需要提供住宿时，才为它新增房型套餐。" })
    : t(active === "offer" ? { en: "Only add packages for activities that provide lodging. Other activities need no lodging setup.", zh: "仅为需要提供住宿的活动新增套餐，其他活动无需配置住宿。" } : active === "room" ? { en: "Create reusable room types under a hotel, including beds and guest capacity.", zh: "在酒店下建立房型，统一维护床型和入住人数。" } : { en: "Add the hotel details once, then reuse them across activities.", zh: "酒店资料只需维护一次，之后可用于多个活动。" });
  function open(kind: CatalogKind, row?: CatalogRow) { setSaved(false); setPreviewId(null); setEditor({ kind, row }); }

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold tracking-tight text-gray-900">{t({ en: "Lodging management", zh: "住宿管理" })}</h2><p className="mt-2 text-sm text-gray-500">{t({ en: "Configure lodging only for activities that need it. Other activities need no lodging setup.", zh: "仅为需要住宿的活动配置酒店、房型和套餐，其他活动无需设置。" })}</p></div>{status === "ready" && !editor && <button type="button" onClick={() => open(active)} disabled={blocked} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0066cc] px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"><Plus size={17} aria-hidden="true" />{t(section.add)}</button>}</header>
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-600"><span className="font-medium">{t({ en: "Draft setup", zh: "草稿配置" })}</span><span>{t({ en: "Fixed package price per person, lodging included. Customer booking is not open yet.", zh: "每人固定套餐价，已含住宿。会员端暂未开放选房与付款。" })}</span></p>
    {status !== "ready" ? <p role="status" className="rounded-lg border border-gray-200 bg-white p-6 text-sm">{status === "disabled" ? t({ en: "Lodging setup is disabled.", zh: "住宿管理尚未启用。" }) : t({ en: "Lodging data could not be loaded. Reload and try again.", zh: "住宿资料加载失败，请重新加载后再试。" })}</p> : <>
      {editor ? <CatalogForm key={`${editor.kind}-${editor.row?.id ?? "new"}-${editor.row?.version ?? 1}`} kind={editor.kind} row={editor.row} catalog={catalog} events={events} defaultEventSlug={eventFilter} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setSaved(true); }} /> : <>
        <nav aria-label={t({ en: "Lodging sections", zh: "住宿管理分类" })} className="flex gap-3 overflow-x-auto border-b border-gray-200 sm:gap-5">{sections.map(item => <button key={item.kind} type="button" aria-pressed={active === item.kind} onClick={() => { setActive(item.kind); setQuery(""); setPreviewId(null); setSaved(false); }} className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium ${active === item.kind ? "border-[#0066cc] text-[#0066cc]" : "border-transparent text-gray-500 hover:text-gray-900"}`}><item.icon size={17} aria-hidden="true" />{t(item.title)}<span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs tabular-nums text-gray-600">{item.kind === "property" ? catalog.properties.length : item.kind === "room" ? catalog.rooms.length : catalog.offers.length}</span></button>)}</nav>
        {saved && <p role="status" className="text-sm text-green-800">{t({ en: "Draft saved.", zh: "草稿已保存。" })}</p>}
        <div className="flex flex-wrap items-end gap-3"><label htmlFor={searchId} className="min-w-0 w-full sm:w-auto sm:flex-1 sm:max-w-md"><span className="sr-only">{t({ en: "Search lodging records", zh: "搜索住宿记录" })}</span><span className="relative block"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t(active === "offer" ? { en: "Search activity, hotel or room type", zh: "搜索活动、酒店或房型" } : { en: "Search name or hotel", zh: "搜索名称或酒店" })} className={`${lodgingControl} !mt-0 pl-10`} /></span></label>
          {active === "offer" && <label className="text-sm"><span className="sr-only">{t({ en: "Filter by activity", zh: "按活动筛选" })}</span><select value={eventFilter} onChange={event => { setEventFilter(event.target.value); setPreviewId(null); }} className={`${lodgingControl} !mt-0 sm:w-64`}><option value="">{t({ en: "All activities", zh: "全部活动" })}</option>{events.map(event => <option key={event.slug} value={event.slug}>{t(event.title)}</option>)}</select></label>}
          {active === "room" && <label className="text-sm"><span className="sr-only">{t({ en: "Filter by hotel", zh: "按酒店筛选" })}</span><select value={hotelFilter} onChange={event => setHotelFilter(event.target.value)} className={`${lodgingControl} !mt-0 sm:w-64`}><option value="">{t({ en: "All hotels", zh: "全部酒店" })}</option>{catalog.properties.map(property => <option key={property.id} value={property.id}>{t(property.name)}</option>)}</select></label>}
          <p className="mb-3 text-xs text-gray-500">{t({ en: `${filtered.length} records`, zh: `共 ${filtered.length} 条` })}</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          {filtered.length ? <table className="w-full text-left text-sm"><thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500"><tr>{(active === "offer" ? [t({ en: "Activity", zh: "活动" }), t({ en: "Hotel / room type", zh: "酒店 / 房型" }), t({ en: "Stay dates", zh: "入住日期" }), t({ en: "Package per person", zh: "每人套餐价" }), t({ en: "Actions", zh: "操作" })] : active === "property" ? [t({ en: "Hotel", zh: "酒店" }), t({ en: "Address", zh: "地址" }), t({ en: "Room types", zh: "房型数量" }), t({ en: "Actions", zh: "操作" })] : [t({ en: "Room type", zh: "房型" }), t({ en: "Hotel", zh: "所属酒店" }), t({ en: "Beds / capacity", zh: "床型 / 人数" }), t({ en: "Actions", zh: "操作" })]).map(label => <th key={label} scope="col" className="whitespace-nowrap px-5 py-4 font-medium">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">{filtered.map(row => <tr key={row.id} className="hover:bg-gray-50/70">{"event_slug" in row ? <>
              <td className="min-w-48 px-5 py-4"><p className="font-medium text-gray-900">{eventName(row.event_slug)}</p><span className="mt-1 inline-block text-xs text-gray-500">{t({ en: "Draft", zh: "草稿" })}</span></td><td className="min-w-40 px-5 py-4"><p>{roomName(row.room_type_id)}</p><p className="mt-1 text-xs text-gray-500">{hotelName(catalog.rooms.find(room => room.id === row.room_type_id)?.property_id ?? "")}</p></td><td className="whitespace-nowrap px-5 py-4 text-gray-600">{row.check_in}<br /><span className="text-xs text-gray-400">{t({ en: "to", zh: "至" })} {row.check_out}</span></td><td className="whitespace-nowrap px-5 py-4 font-semibold tabular-nums">{row.package_amount == null ? <span className="font-normal text-amber-800">{t({ en: "Not priced", zh: "未设置" })}</span> : money(row.package_amount)}<p className="mt-1 text-xs font-normal text-gray-500">{t({ en: "Lodging included", zh: "已含住宿" })}</p></td>
            </> : "address" in row ? <><td className="min-w-48 px-5 py-4 font-medium">{t(row.name)}</td><td className="min-w-40 px-5 py-4 text-gray-600">{row.address}<p className="mt-1 text-xs text-gray-400">{row.timezone}</p></td><td className="px-5 py-4 tabular-nums">{catalog.rooms.filter(room => room.property_id === row.id).length}</td></> : <><td className="min-w-36 px-5 py-4 font-medium">{t(row.name)}</td><td className="min-w-40 px-5 py-4 text-gray-600">{hotelName(row.property_id)}</td><td className="min-w-36 px-5 py-4">{t(row.beds)}<p className="mt-1 text-xs text-gray-500">{t({ en: `Up to ${row.max_guests} guests`, zh: `最多 ${row.max_guests} 人` })}</p></td></>}
              <td className="whitespace-nowrap px-5 py-3"><div className="flex items-center gap-3"><button type="button" onClick={() => open(active, row)} aria-label={t({ en: `Edit ${"event_slug" in row ? offerName(row) : t(row.name)}`, zh: `编辑${"event_slug" in row ? offerName(row) : t(row.name)}` })} className="min-h-11 text-sm font-medium text-[#0066cc] hover:underline">{t({ en: "Edit", zh: "编辑" })}</button>{"event_slug" in row && <button type="button" disabled={row.package_amount == null} onClick={() => setPreviewId(row.id)} aria-label={t({ en: `Preview ${offerName(row)}`, zh: `预览${offerName(row)}` })} className="min-h-11 text-sm text-gray-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-300">{t({ en: "Preview", zh: "预览" })}</button>}</div></td>
            </tr>)}</tbody></table> : <div className="px-6 py-14 text-center"><section.icon size={28} className="mx-auto mb-3 text-gray-300" aria-hidden="true" /><h3 className="font-semibold text-gray-800">{emptyTitle}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">{emptyDescription}</p>{blocked && !noActivityLodging && <div className="mt-4 flex flex-wrap justify-center gap-3">{!catalog.properties.length ? <button type="button" onClick={() => { setActive("property"); open("property"); }} className="min-h-11 text-sm font-medium text-[#0066cc]">{t({ en: "Add your first hotel", zh: "新增第一家酒店" })}</button> : !catalog.rooms.length ? <button type="button" onClick={() => { setActive("room"); open("room"); }} className="min-h-11 text-sm font-medium text-[#0066cc]">{t({ en: "Add a room type", zh: "新增一个房型" })}</button> : <a href="/admin/events/new" className="inline-flex min-h-11 items-center text-sm text-[#0066cc]">{t({ en: "Create an activity first", zh: "先创建活动" })}</a>}</div>}</div>}
        </div>
        {preview && <PackagePreview key={preview.id} offer={preview} name={offerName(preview)} onClose={() => setPreviewId(null)} />}
      </>}
    </>}
  </div>;
}
