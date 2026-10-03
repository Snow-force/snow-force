"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Package, Truck } from "lucide-react";
import { useLanguage } from "@/lib/language";
import type { MemberProfile } from "@/lib/types";
import type { MemberOrderList } from "@/lib/shop/member-order-repository";
import { formatOrderDate, formatOrderMoney, orderFilterLabels, orderFilters, orderStatusLabels, type OrderFilter, type ShopMemberOrder } from "@/lib/shop/member-orders";
import { MemberAccountShell, previewMemberHref } from "./member-account-shell";

export function OrderStatusBadge({ order }: { order: ShopMemberOrder }) {
  const { t } = useLanguage();
  const tone = order.status === "delivered" ? "bg-[#eaf2e9] text-[#365c37]" : order.status === "cancelled" || order.status === "refunded" ? "bg-[#f0f1ef] text-[#616665]" : "bg-[#edf4fb] text-[#0555a1]";
  return <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${tone}`}>{t(orderStatusLabels[order.status])}</span>;
}

export function OrderReadNotice() {
  const { t } = useLanguage();
  const router = useRouter();
  return <div role="status" className="rounded-[18px] border border-[#d9deda] bg-white px-6 py-7"><h2 className="font-semibold">{t({ en: "We couldn’t load your orders", zh: "暂时无法读取订单" })}</h2><p className="mt-2 text-sm leading-6 text-[#656d6c]">{t({ en: "Please try again shortly.", zh: "请稍后重试。" })}</p><button type="button" onClick={() => router.refresh()} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0066cc]">{t({ en: "Try again", zh: "重新加载" })}<ArrowRight size={16} /></button></div>;
}

export function OrderCard({ order, preview = false }: { order: ShopMemberOrder; preview?: boolean }) {
  const { lang, t } = useLanguage();
  const firstItem = order.items[0];
  const detailHref = previewMemberHref(`/member/orders/${order.id}`, preview);
  const itemCount = order.items.reduce((count, item) => count + item.quantity, 0);
  return (
    <article className="overflow-hidden rounded-[18px] border border-[#dfe2dd] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0eb] px-5 py-4 sm:px-6">
        <div><p className="text-xs text-[#737b79]">{formatOrderDate(order.createdAt, lang)}</p><Link href={detailHref} className="mt-1 inline-block text-sm font-semibold">{t({ en: "Order", zh: "订单" })} {order.orderNumber}</Link></div>
        <OrderStatusBadge order={order} />
      </div>
      <div className="flex items-center gap-4 px-5 py-5 sm:gap-5 sm:px-6">
        <Link href={detailHref} tabIndex={-1} aria-hidden="true" className="relative grid h-24 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#f3f4f0] sm:h-28 sm:w-24">
          {firstItem.image ? <Image src={firstItem.image} alt="" fill sizes="(min-width: 640px) 96px, 80px" unoptimized className="object-contain" /> : <Package size={28} className="text-[#87908b]" />}
        </Link>
        <div className="min-w-0 flex-1"><Link href={detailHref} className="text-[15px] font-semibold leading-6 hover:text-[#0066cc]">{t(firstItem.name)}</Link><p className="mt-1 text-xs leading-5 text-[#6b7370]">{t(firstItem.variant)}</p><p className="mt-2 text-xs text-[#747b78]">{itemCount} {t({ en: itemCount === 1 ? "item" : "items", zh: "件装备" })}{order.items.length > 1 && ` · ${t({ en: "including", zh: "含" })} ${t(firstItem.name)}`}</p></div>
        <p className="hidden shrink-0 text-base font-semibold sm:block">{formatOrderMoney(order.totalCents, lang)}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0eb] px-5 py-3.5 sm:px-6">
        <p className="text-sm text-[#65716b]"><span className="font-semibold text-[#171b1d] sm:hidden">{formatOrderMoney(order.totalCents, lang)}</span><span className="hidden sm:inline">{order.status === "shipped" ? <span className="inline-flex items-center gap-2"><Truck size={15} />{t({ en: "Shipment details are available", zh: "可以查看包裹与物流信息" })}</span> : <span>{t({ en: "Order total", zh: "订单总额" })} · USD</span>}</span></p>
        <Link href={detailHref} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#d8ded7] px-4 text-xs font-semibold transition hover:border-[#0066cc] hover:text-[#0066cc]">{t({ en: "View order", zh: "查看订单" })}<ArrowUpRight size={14} /></Link>
      </div>
    </article>
  );
}

export function OrdersEmptyState({ filtered = false, preview = false }: { filtered?: boolean; preview?: boolean }) {
  const { t } = useLanguage();
  return <div className="grid min-h-[260px] place-items-center rounded-[18px] border border-[#dfe2dd] bg-white px-6 py-10 text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#eff2ed] text-[#46564c]"><ShoppingBagIcon /></span><h2 className="mt-5 text-xl font-semibold">{t(filtered ? { en: "No orders in this category", zh: "这个分类下还没有订单" } : { en: "Your next adventure starts with the right gear", zh: "下一趟滑行，从合适的装备开始" })}</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#6b7470]">{t(filtered ? { en: "Try another category to find your order.", zh: "切换到其他分类查看你的订单。" } : { en: "Once you place an order, you can find its items, delivery updates and details here.", zh: "下单后，商品明细、配送进度和订单信息都会在这里显示。" })}</p><Link href={filtered ? previewMemberHref("/member/orders", preview) : "/shop"} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0066cc] px-6 text-sm font-semibold text-white">{t(filtered ? { en: "View all orders", zh: "查看全部订单" } : { en: "Explore gear", zh: "逛逛装备商城" })}<ArrowRight size={16} /></Link></div></div>;
}

function ShoppingBagIcon() { return <Package size={25} strokeWidth={1.4} aria-hidden="true" />; }

export function MemberOrdersView({ profile, result, filter, preview = false }: { profile: MemberProfile; result: MemberOrderList; filter: OrderFilter; preview?: boolean }) {
  const { t } = useLanguage();
  const pageHref = (page: number) => previewMemberHref(`/member/orders?status=${filter}&page=${page}`, preview);
  return <MemberAccountShell active="orders" profile={profile} preview={preview} title={t({ en: "My orders", zh: "我的订单" })} subtitle={t({ en: "Your gear, from checkout to the mountain. Follow every order and shipment here.", zh: "从下单到送达，在这里查看每一笔装备订单与包裹。" })}>
    <nav aria-label={t({ en: "Order filters", zh: "订单分类" })} className="flex gap-2 overflow-x-auto pb-1">{orderFilters.map((item) => <Link key={item} href={previewMemberHref(`/member/orders?status=${item}`, preview)} aria-current={filter === item ? "page" : undefined} className={`inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-xs font-medium ${filter === item ? "border-[#171b1d] bg-[#171b1d] text-white" : "border-[#d6dcd4] bg-white text-[#626a65] hover:border-[#0066cc] hover:text-[#0066cc]"}`}>{t(orderFilterLabels[item])}</Link>)}</nav>
    {result.state === "unavailable" ? <OrderReadNotice /> : <>
      <p className="text-xs text-[#747c76]">{result.count} {t({ en: "orders", zh: "笔订单" })}{result.count > 0 && ` · ${t({ en: "Page", zh: "第" })} ${result.page}${langPageSuffix(t)}`}</p>
      {result.orders.length === 0 ? <OrdersEmptyState filtered={filter !== "all"} preview={preview} /> : <div className="space-y-5">{result.orders.map((order) => <OrderCard key={order.id} order={order} preview={preview} />)}</div>}
      {(result.page > 1 || result.hasMore) && <nav aria-label={t({ en: "Order pages", zh: "订单分页" })} className="flex items-center justify-between border-t border-[#d9dfd5] pt-5">{result.page > 1 ? <Link href={pageHref(result.page - 1)} className="inline-flex min-h-11 items-center gap-2 text-sm"><ChevronLeft size={16} />{t({ en: "Previous", zh: "上一页" })}</Link> : <span />}{result.hasMore && <Link href={pageHref(result.page + 1)} className="inline-flex min-h-11 items-center gap-2 text-sm">{t({ en: "Next", zh: "下一页" })}<ChevronRight size={16} /></Link>}</nav>}
    </>}
  </MemberAccountShell>;
}

function langPageSuffix(t: (value: { en: string; zh: string }) => string) { return t({ en: "", zh: " 页" }); }
