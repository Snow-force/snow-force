"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { useLanguage } from "@/lib/language";
import type { MemberProfile } from "@/lib/types";
import type { ShippingAddressList } from "@/lib/shop/shipping-address-repository";
import { usStates, type ShippingAddress } from "@/lib/shop/shipping-addresses";
import { deleteShippingAddressAction, saveShippingAddressAction, type AddressActionResult } from "@/lib/shop/member-actions";
import { MemberAccountShell } from "./member-account-shell";

const errors = {
  auth: { en: "Please sign in again to manage your addresses.", zh: "请重新登录后管理收货地址。" },
  verification: { en: "Verify your email before saving a shipping address.", zh: "请先验证邮箱，再保存收货地址。" },
  validation: { en: "Check the highlighted fields. Use a valid US state and ZIP code.", zh: "请检查标出的字段，并填写有效的美国州与邮政编码。" },
  save: { en: "The address could not be saved. Please try again.", zh: "地址保存失败，请稍后重试。" },
  delete: { en: "The address could not be removed. Please try again.", zh: "地址删除失败，请稍后重试。" },
};

export function MemberAddressesView({ profile, result, preview = false }: { profile: MemberProfile; result: ShippingAddressList; preview?: boolean }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [editing, setEditing] = useState<ShippingAddress | null | undefined>(undefined);
  const [removing, setRemoving] = useState<string | null>(null);
  const [message, setMessage] = useState<AddressActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage(null);
    if (preview) { setMessage({ success: true }); setEditing(undefined); return; }
    setPending(true);
    try {
      const saved = await saveShippingAddressAction(form);
      setMessage(saved);
      setFieldErrors(saved.fields ?? []);
      if (saved.success) { setEditing(undefined); router.refresh(); }
    } catch { setMessage({ success: false, error: "save" }); }
    finally { setPending(false); }
  }

  async function remove(id: string) {
    if (preview) { setRemoving(null); setMessage({ success: true }); return; }
    setPending(true);
    try {
      const deleted = await deleteShippingAddressAction(id);
      setMessage(deleted); setRemoving(null);
      if (deleted.success) router.refresh();
    } catch { setMessage({ success: false, error: "delete" }); }
    finally { setPending(false); }
  }

  const inputClass = "min-h-11 w-full rounded-lg border border-[#cfd6cc] bg-white px-3.5 text-sm text-[#243120] outline-none focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/15 disabled:opacity-50";
  const fields = [
    { name: "name", label: { en: "Recipient name", zh: "收件人姓名" }, autoComplete: "shipping name", max: 100 },
    { name: "phone", label: { en: "Phone", zh: "联系电话" }, autoComplete: "shipping tel", max: 30 },
    { name: "address1", label: { en: "Street address", zh: "街道地址" }, autoComplete: "shipping address-line1", max: 200 },
    { name: "address2", label: { en: "Apartment, suite, etc. (optional)", zh: "公寓、房间号等（选填）" }, autoComplete: "shipping address-line2", max: 200 },
    { name: "city", label: { en: "City", zh: "城市" }, autoComplete: "shipping address-level2", max: 100 },
    { name: "postalCode", label: { en: "ZIP code", zh: "邮政编码" }, autoComplete: "shipping postal-code", max: 10 },
  ] as const;

  return <MemberAccountShell active="addresses" profile={profile} preview={preview} title={t({ en: "Shipping addresses", zh: "收货地址" })} subtitle={t({ en: "Keep your US delivery details ready for your next gear order.", zh: "保存美国收货信息，为下一笔装备订单做好准备。" })}>
    {message && <p role={message.success ? "status" : "alert"} className={`rounded-lg border px-4 py-3 text-sm ${message.success ? "border-[#c8d6c0] bg-[#edf4e8] text-[#3a5830]" : "border-[#e2c5c1] bg-[#fff4f2] text-[#913f33]"}`}>{message.success ? t(preview ? { en: "Preview only. No real address was changed.", zh: "这是预览操作，没有修改真实地址。" } : { en: "Your address book has been updated.", zh: "收货地址已更新。" }) : t(errors[message.error || "save"])}</p>}
    {result.state === "unavailable" ? <section role="status" className="rounded-[18px] border border-[#dce2d7] bg-white p-6"><h2 className="font-semibold">{t({ en: "We couldn’t load your addresses", zh: "暂时无法读取收货地址" })}</h2><p className="mt-2 text-sm leading-6 text-[#697262]">{t({ en: "Please reload this page shortly before making changes.", zh: "请稍后重新加载本页，再管理你的地址。" })}</p><button onClick={() => router.refresh()} className="mt-4 min-h-11 text-sm font-semibold text-[#0066cc]">{t({ en: "Try again", zh: "重新加载" })}</button></section> : <>
      <div className="flex items-center justify-between gap-4"><p className="text-sm text-[#6c7665]">{result.addresses.length} {t({ en: "saved addresses", zh: "个收货地址" })}</p><button disabled={pending} onClick={() => { setEditing(null); setFieldErrors([]); setMessage(null); }} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0066cc] px-5 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16} />{t({ en: "Add address", zh: "添加地址" })}</button></div>
      {editing !== undefined && <section className="rounded-[18px] border border-[#c7d5c0] bg-white p-5 sm:p-7"><div className="mb-6 flex items-center justify-between"><h2 className="text-lg font-semibold">{t(editing ? { en: "Edit address", zh: "编辑地址" } : { en: "New address", zh: "新收货地址" })}</h2><button aria-label={t({ en: "Close address form", zh: "关闭地址表单" })} disabled={pending} onClick={() => setEditing(undefined)} className="grid h-10 w-10 place-items-center"><X size={18} /></button></div><form key={editing?.id ?? "new"} onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        {editing?.id && <input type="hidden" name="id" value={editing.id} />}<input type="hidden" name="countryCode" value="US" />
        {fields.map((field) => <div key={field.name} className={field.name.startsWith("address") ? "sm:col-span-2" : ""}><label htmlFor={`address-${field.name}`} className="mb-2 block text-xs font-semibold">{t(field.label)}</label><input id={`address-${field.name}`} name={field.name} defaultValue={editing?.[field.name] || ""} autoComplete={field.autoComplete} type={field.name === "phone" ? "tel" : "text"} maxLength={field.max} required={field.name !== "address2"} disabled={pending} aria-invalid={fieldErrors.includes(field.name)} aria-describedby={fieldErrors.includes(field.name) ? `address-${field.name}-error` : undefined} pattern={field.name === "postalCode" ? "[0-9]{5}(-[0-9]{4})?" : undefined} className={inputClass} />{fieldErrors.includes(field.name) && <p id={`address-${field.name}-error`} className="mt-2 text-xs text-[#a24d40]">{t({ en: "Please enter a valid value.", zh: "请填写有效内容。" })}</p>}</div>)}
        <div><label htmlFor="address-state" className="mb-2 block text-xs font-semibold">{t({ en: "State", zh: "州" })}</label><select id="address-state" name="state" autoComplete="shipping address-level1" defaultValue={editing?.state || ""} required disabled={pending} aria-invalid={fieldErrors.includes("state")} className={inputClass}><option value="">{t({ en: "Select state", zh: "请选择州" })}</option>{usStates.map((state) => <option key={state} value={state}>{state}</option>)}</select></div>
        <div><p className="mb-2 text-xs font-semibold">{t({ en: "Country", zh: "国家" })}</p><p className="flex min-h-11 items-center rounded-lg border border-[#dde2d7] bg-[#f5f7f1] px-3.5 text-sm text-[#617057]">{t({ en: "United States", zh: "美国" })}</p></div>
        <label className="inline-flex min-h-11 items-center gap-3 text-sm sm:col-span-2"><input name="isDefault" type="checkbox" defaultChecked={editing?.isDefault ?? result.addresses.length === 0} disabled={pending} className="h-4 w-4 accent-[#0066cc]" />{t({ en: "Use as my default address", zh: "设为默认收货地址" })}</label>
        <div className="flex flex-wrap gap-3 sm:col-span-2"><button type="submit" disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0066cc] px-6 text-sm font-semibold text-white disabled:opacity-50"><Check size={16} />{t(pending ? { en: "Saving…", zh: "保存中…" } : { en: "Save address", zh: "保存地址" })}</button><button type="button" disabled={pending} onClick={() => setEditing(undefined)} className="min-h-11 rounded-full border border-[#d6ded0] px-5 text-sm font-medium">{t({ en: "Cancel", zh: "取消" })}</button></div>
      </form></section>}
      {result.addresses.length === 0 && editing === undefined ? <section className="rounded-[18px] border border-[#dce2d7] bg-white px-6 py-12 text-center"><MapPin size={30} className="mx-auto text-[#6a7c5b]" strokeWidth={1.4} /><h2 className="mt-5 text-xl font-semibold">{t({ en: "Where should your gear go?", zh: "你的下一套装备，寄到哪里？" })}</h2><p className="mt-3 text-sm leading-6 text-[#6d7961]">{t({ en: "Add an address to keep your delivery details in one place.", zh: "添加收货地址，将配送信息统一保存在这里。" })}</p></section> : <div className="grid gap-5 xl:grid-cols-2">{result.addresses.map((address) => <article key={address.id} className="rounded-[18px] border border-[#dce2d7] bg-white p-6"><div className="flex items-start justify-between gap-3"><h2 className="text-base font-semibold">{address.name}</h2>{address.isDefault && <span className="rounded-full bg-[#eff4e9] px-3 py-1 text-xs font-semibold text-[#466337]">{t({ en: "Default", zh: "默认地址" })}</span>}</div><address className="mt-4 space-y-1 break-words text-sm not-italic leading-6 text-[#697660]"><p>{address.phone}</p><p>{address.address1}</p>{address.address2 && <p>{address.address2}</p>}<p>{address.city}, {address.state} {address.postalCode}</p><p>{t({ en: "United States", zh: "美国" })}</p></address><div className="mt-5 flex flex-wrap items-center gap-4 border-t border-[#edf0e8] pt-4"><button disabled={pending} onClick={() => { setEditing(address); setFieldErrors([]); setMessage(null); }} className="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-[#0066cc]"><Pencil size={14} />{t({ en: "Edit", zh: "编辑" })}</button>{removing !== address.id ? <button disabled={pending} onClick={() => setRemoving(address.id)} className="inline-flex min-h-10 items-center gap-2 text-xs text-[#6d7862]"><Trash2 size={14} />{t({ en: "Remove", zh: "删除" })}</button> : <div className="flex items-center gap-3"><span className="text-xs">{t({ en: "Remove this address?", zh: "确认删除这个地址？" })}</span><button disabled={pending} onClick={() => remove(address.id)} className="min-h-10 text-xs font-semibold text-[#a04336]">{t({ en: "Remove", zh: "确认删除" })}</button><button disabled={pending} onClick={() => setRemoving(null)} className="min-h-10 text-xs">{t({ en: "Keep", zh: "保留" })}</button></div>}</div></article>)}</div>}
    </>}
  </MemberAccountShell>;
}
