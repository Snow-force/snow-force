import { mapStoreProduct, nativeProductSchema, type StoreProduct } from "./storefront";
import type { NativeCart } from "./commerce-cart";
export const fixtureUserId = "24f1b3c7-1eac-45e7-b16a-3f68aa31d60f";
export const fixtureNativeProduct = {
  id: "prod_fixture", handle: "fixture-jacket", title: "Current jacket title", description: "Current description", status: "published", thumbnail: "https://images.example.com/jacket.webp",
  metadata: { snowforce_name: { en: "Old catalog title", zh: "测试滑雪服" }, snowforce_description: { en: "Old catalog description", zh: "后台中文简介" }, snowforce_brand: "VECTOR", snowforce_category: "outerwear", snowforce_candidate_colors: [{ en: "Pink", zh: "粉色" }] },
  images: [{ url: "https://images.example.com/jacket-detail.webp" }],
  options: [{ id: "opt_color", title: "Color", values: [{ value: "Pink" }, { value: "Blue" }] }, { id: "opt_size", title: "Size", values: [{ value: "M" }] }],
  variants: [
    { id: "variant_pink", title: "Pink / M", sku: "JACKET-PINK-M", manage_inventory: true, allow_backorder: false, inventory_quantity: 2, options: [{ option_id: "opt_color", value: "Pink" }, { option_id: "opt_size", value: "M" }], calculated_price: { currency_code: "usd", calculated_amount: 79.95, original_amount: 89.95 } },
    { id: "variant_blue", title: "Blue / M", sku: "JACKET-BLUE-M", manage_inventory: true, allow_backorder: false, inventory_quantity: 0, options: [{ option_id: "opt_color", value: "Blue" }, { option_id: "opt_size", value: "M" }], calculated_price: { currency_code: "usd", calculated_amount: 99.95, original_amount: 99.95 } },
  ],
};
export function fixtureProduct(overrides: Partial<StoreProduct> = {}): StoreProduct {
  const product = mapStoreProduct(nativeProductSchema.parse(fixtureNativeProduct));
  if (!product) throw new Error("Invalid product fixture");
  return { ...product, ...overrides };
}
export const fixtureProducts = [fixtureProduct(), fixtureProduct({ id: "prod_kids", slug: "fixture-kids", category: "kids", name: { en: "Rogue kids jacket", zh: "儿童滑雪服" }, price: 39.95 }), fixtureProduct({ id: "prod_goggles", slug: "fixture-goggles", category: "goggles", brand: "ISEE MIGGA", name: { en: "Magnetic goggles", zh: "磁吸滑雪镜" }, price: 29.95 })];
export const fixtureCart: NativeCart = { id: "cart_fixture", currency_code: "usd", customer: { id: "cus_fixture" }, region_id: "reg_us", completed_at: null, total: 79.95, subtotal: 79.95, tax_total: 0, shipping_total: 0, discount_total: 0, items: [{ id: "cali_fixture", variant_id: "variant_pink", product_handle: "fixture-jacket", product_title: "Current jacket title", title: "Current jacket title", variant_title: "Pink / M", thumbnail: "https://images.example.com/jacket.webp", quantity: 1, unit_price: 79.95, total: 79.95 }] };
