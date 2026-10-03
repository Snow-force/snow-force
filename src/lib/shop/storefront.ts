import { z } from "zod";

export type Localized = { en: string; zh: string };
export const storeCategories = [
  { id: "all", label: { en: "All gear", zh: "全部装备" } },
  { id: "outerwear", label: { en: "Snow apparel", zh: "滑雪服饰" } },
  { id: "kids", label: { en: "Little riders", zh: "儿童装备" } },
  { id: "goggles", label: { en: "Goggles", zh: "滑雪镜" } },
  { id: "accessories", label: { en: "Helmets & accessories", zh: "头盔与配件" } },
] as const;
export type StoreFilters = { category: string; brand: string; query: string; sort: "featured" | "price-low" | "price-high" };
export const defaultStoreFilters: StoreFilters = { category: "all", brand: "all", query: "", sort: "featured" };
export function storeFiltersFromSearchParams(params: Record<string, string | string[] | undefined>): StoreFilters {
  return {
    category: storeCategories.some((item) => item.id === params.category) ? String(params.category) : "all",
    brand: typeof params.brand === "string" ? params.brand.slice(0, 80) : "all",
    query: typeof params.q === "string" ? params.q.slice(0, 200) : "",
    sort: params.sort === "price-low" || params.sort === "price-high" ? params.sort : "featured",
  };
}
export const commerceId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[a-zA-Z0-9]+$`)).max(100);
export const usdAmount = z.number().finite().nonnegative();
const optionalText = z.string().nullable().optional();
export const nativeProductSchema = z.object({
  id: commerceId("prod"), handle: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  title: z.string().min(1), description: optionalText, status: z.string(), thumbnail: optionalText,
  metadata: z.record(z.unknown()).nullable().optional(),
  images: z.array(z.object({ url: z.string() })).default([]),
  options: z.array(z.object({ id: commerceId("opt"), title: z.string(), values: z.array(z.object({ value: z.string() })).default([]) })).default([]),
  variants: z.array(z.object({
    id: commerceId("variant"), title: z.string(), sku: optionalText,
    manage_inventory: z.boolean(), allow_backorder: z.boolean(), inventory_quantity: z.number().finite().optional(),
    options: z.array(z.object({ option_id: commerceId("opt"), value: z.string() })).default([]),
    calculated_price: z.object({ currency_code: z.string(), calculated_amount: usdAmount, original_amount: usdAmount }).nullable().optional(),
  })).default([]),
});
export type StoreVariant = { id: string; title: string; sku: string | null; options: Record<string, string>; price: number | null; originalPrice: number | null; availableQuantity: number | null; available: boolean };
export type StoreProduct = { id: string; slug: string; name: Localized; description: Localized; brand: string; category: string; image: string; images: string[]; options: { id: string; title: Localized; values: { value: string; label: Localized }[] }[]; variants: StoreVariant[]; price: number | null; available: boolean };
export function safeProductImage(value: string | null | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function localizedValue(value: unknown, fallback: string): Localized {
  const parsed = z.object({ en: z.string().max(4000), zh: z.string().max(4000) }).safeParse(value);
  return parsed.success ? { en: fallback, zh: parsed.data.zh.trim() || fallback } : { en: fallback, zh: fallback };
}
export function mapStoreProduct(input: z.infer<typeof nativeProductSchema>): StoreProduct | null {
  if (input.status !== "published") return null;
  const metadata = input.metadata ?? {};
  const variants = input.variants.map((variant): StoreVariant => {
    const calculated = variant.calculated_price;
    const price = calculated?.currency_code.toLowerCase() === "usd" ? calculated.calculated_amount : null;
    const availableQuantity = variant.allow_backorder || !variant.manage_inventory ? null : Math.max(0, Math.floor(variant.inventory_quantity ?? 0));
    return { id: variant.id, title: variant.title, sku: variant.sku ?? null, options: Object.fromEntries(variant.options.map((option) => [option.option_id, option.value])), price, originalPrice: price === null ? null : calculated?.original_amount ?? price, availableQuantity, available: price !== null && (availableQuantity === null || availableQuantity > 0) };
  });
  const prices = variants.flatMap((variant) => variant.price === null ? [] : [variant.price]);
  const images = [input.thumbnail, ...input.images.map((image) => image.url)].flatMap((url) => { const safe = safeProductImage(url); return safe ? [safe] : []; });
  const candidates = z.array(z.object({ en: z.string(), zh: z.string() })).safeParse(metadata.snowforce_candidate_colors);
  return {
    id: input.id, slug: input.handle, name: localizedValue(metadata.snowforce_name, input.title), description: localizedValue(metadata.snowforce_description, input.description ?? ""),
    brand: typeof metadata.snowforce_brand === "string" ? metadata.snowforce_brand.slice(0, 80) : "SnowForce",
    category: typeof metadata.snowforce_category === "string" ? metadata.snowforce_category : "accessories",
    image: images[0] ?? "/shop/product-placeholder.svg", images: Array.from(new Set(images)),
    options: input.options.map((option) => ({ id: option.id, title: { en: option.title, zh: /^color$/i.test(option.title) ? "配色" : /^size$/i.test(option.title) ? "尺码" : option.title }, values: option.values.map(({ value }) => ({ value, label: { en: value, zh: candidates.success && /^color$/i.test(option.title) ? candidates.data.find((item) => item.en === value)?.zh ?? value : value } })) })),
    variants, price: prices.length ? Math.min(...prices) : null, available: variants.some((variant) => variant.available),
  };
}
export function filterStoreProducts(products: StoreProduct[], filters: StoreFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  const result = products.filter((product) => (filters.category === "all" || product.category === filters.category) && (filters.brand === "all" || product.brand === filters.brand) && `${product.brand} ${product.name.en} ${product.name.zh} ${product.description.en} ${product.description.zh}`.toLocaleLowerCase().includes(query));
  if (filters.sort !== "featured") result.sort((a, b) => {
    if (a.price === null) return b.price === null ? 0 : 1;
    if (b.price === null) return -1;
    return filters.sort === "price-low" ? a.price - b.price : b.price - a.price;
  });
  return result;
}
export function selectedStoreVariant(product: StoreProduct, choices: Record<string, string>) {
  if (product.options.some((option) => !choices[option.id])) return null;
  const matching = product.variants.filter((variant) => product.options.every((option) => variant.options[option.id] === choices[option.id]));
  return matching.length === 1 ? matching[0] : null;
}
export function formatStorePrice(amount: number, lang: "en" | "zh") {
  return new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}
