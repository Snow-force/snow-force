import { getProduct, usdReferencePrice } from "./catalog";
import type { Lang } from "@/lib/language";

export const SELECTION_KEY = "snowforce-shop-selection-v1";
export type SelectionItem = { slug: string; color: number | null; size: string | null; quantity: number };
export type SelectionDraft = Omit<SelectionItem, "quantity"> & { quantity?: number };
export function selectionId(item: SelectionItem) { return JSON.stringify([item.slug, item.color, item.size]); }
export function readSelection(raw: string | null): SelectionItem[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const result: SelectionItem[] = [];
    for (const entry of value.slice(0, 100)) {
      if (!entry || typeof entry !== "object" || typeof entry.slug !== "string") continue;
      const product = getProduct(entry.slug);
      if (!product) continue;
      if (entry.color !== null && (!Number.isInteger(entry.color) || entry.color < 0 || entry.color >= product.colors.length)) continue;
      if (entry.size !== null && (typeof entry.size !== "string" || !product.sizes.includes(entry.size))) continue;
      if (!Number.isInteger(entry.quantity) || entry.quantity < 1) continue;
      const item: SelectionItem = { slug: entry.slug, color: entry.color, size: entry.size, quantity: Math.min(99, entry.quantity) };
      const previous = result.find((row) => selectionId(row) === selectionId(item));
      if (previous) previous.quantity = Math.min(99, previous.quantity + item.quantity);
      else result.push(item);
    }
    return result;
  } catch { return []; }
}
export function addSelection(items: SelectionItem[], item: SelectionDraft): SelectionItem[] {
  const quantity = typeof item.quantity === "number" && Number.isInteger(item.quantity) ? Math.min(99, Math.max(1, item.quantity)) : 1;
  const candidate = { ...item, quantity };
  const found = items.some((row) => selectionId(row) === selectionId(candidate));
  return found ? items.map((row) => selectionId(row) === selectionId(candidate) ? { ...row, quantity: Math.min(99, row.quantity + quantity) } : row) : [...items, candidate];
}
export function selectionReferenceTotal(items: SelectionItem[]): number {
  const cents = items.reduce((total, item) => {
    const product = getProduct(item.slug);
    return total + (product ? Math.round(usdReferencePrice(product.referencePrice) * 100) * item.quantity : 0);
  }, 0);
  return cents / 100;
}
export function buildInquiry(items: SelectionItem[], lang: Lang) {
  const lines = items.flatMap((item) => {
    const product = getProduct(item.slug);
    if (!product) return [];
    return [`${product.brand} ${product.name[lang]} (${product.slug})\n${lang === "zh" ? "配色" : "Color"}: ${item.color === null ? (lang === "zh" ? "待确认" : "To confirm") : product.colors[item.color]?.[lang]} · ${lang === "zh" ? "尺码" : "Size"}: ${item.size ?? (lang === "zh" ? "待确认" : "To confirm")} · ${lang === "zh" ? "数量" : "Qty"}: ${item.quantity}`];
  });
  return [lang === "zh" ? "你好，我想咨询以下 SnowForce 装备：" : "Hello, I'd like to ask about this SnowForce gear:", ...lines, lang === "zh" ? "请确认最终报价、库存、尺码建议、配送和退换货政策。" : "Please confirm final pricing, availability, sizing, shipping and return terms."].join("\n\n");
}
