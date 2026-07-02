"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/language";
import type { ShopCategory, ShopItem, ShopItemStatus } from "@/lib/shop/types";
import { saveShopItemAction, deleteShopItemAction, type ShopItemFormData } from "@/lib/shop/actions";

type AdminShopViewProps = {
  initialItems: ShopItem[];
};

const CATEGORY_OPTIONS: { value: ShopCategory; label: { en: string; zh: string } }[] = [
  { value: "merch", label: { en: "Club Merch", zh: "社团周边" } },
  { value: "partner", label: { en: "Partner Brand", zh: "合作品牌" } },
  { value: "limited", label: { en: "Limited", zh: "限定款" } },
];

const STATUS_OPTIONS: { value: ShopItemStatus; label: { en: string; zh: string } }[] = [
  { value: "draft", label: { en: "Draft", zh: "草稿" } },
  { value: "published", label: { en: "Published", zh: "已发布" } },
  { value: "sold_out", label: { en: "Sold Out", zh: "已售罄" } },
];

const emptyForm: ShopItemFormData = {
  slug: "",
  name_en: "",
  name_zh: "",
  description_en: "",
  description_zh: "",
  category: "merch",
  price_usd: 0,
  cover_image: "",
  images: [],
  external_url: "",
  partner_brand: "",
  status: "draft",
  sort_order: 0,
};

export function AdminShopView({ initialItems }: AdminShopViewProps) {
  const { t } = useLanguage();
  const [items, setItems] = useState<ShopItem[]>(initialItems);
  const [editing, setEditing] = useState<ShopItem | null>(null);
  const [form, setForm] = useState<ShopItemFormData>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(item: ShopItem) {
    setEditing(item);
    setForm({
      id: item.id,
      slug: item.slug,
      name_en: item.name.en,
      name_zh: item.name.zh,
      description_en: item.description.en,
      description_zh: item.description.zh,
      category: item.category,
      price_usd: item.priceUsd,
      cover_image: item.coverImage,
      images: item.images,
      external_url: item.externalUrl,
      partner_brand: item.partnerBrand ?? "",
      status: item.status,
      sort_order: item.sortOrder,
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveShopItemAction(form);
      // Refresh items by reloading the page data
      window.location.reload();
      setMessage(t({ en: "Product saved", zh: "商品已保存" }));
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      setMessage(t({ en: "Error saving product", zh: "保存商品时出错" }));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(slug: string) {
    if (!confirm(t({ en: "Delete this product?", zh: "确定删除此商品？" }))) return;
    try {
      await deleteShopItemAction(slug);
      setItems(items.filter((i) => i.slug !== slug));
      setMessage(t({ en: "Product deleted", zh: "商品已删除" }));
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      setMessage(t({ en: "Error deleting product", zh: "删除商品时出错" }));
    }
  }

  function updateField(field: keyof ShopItemFormData, value: string | number | string[]) {
    setForm({ ...form, [field]: value });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          {t({ en: "Shop Management", zh: "商城管理" })}
        </h2>
        <div className="flex items-center gap-3">
          {message && <span className="text-sm text-green-600">{message}</span>}
          <button
            onClick={openCreate}
            className="rounded-lg bg-[#0066cc] px-4 py-2 text-sm font-medium text-white hover:bg-[#0071e3]"
          >
            {t({ en: "Add Product", zh: "添加商品" })}
          </button>
        </div>
      </div>

      {/* Product List */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
              <th className="py-3 px-4">Slug</th>
              <th className="py-3 px-4">{t({ en: "Name", zh: "名称" })}</th>
              <th className="py-3 px-4">{t({ en: "Category", zh: "分类" })}</th>
              <th className="py-3 px-4">{t({ en: "Price", zh: "价格" })}</th>
              <th className="py-3 px-4">{t({ en: "Status", zh: "状态" })}</th>
              <th className="py-3 px-4">{t({ en: "Actions", zh: "操作" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => (
              <tr key={item.slug} className="hover:bg-gray-50">
                <td className="py-3 px-4 font-mono text-xs text-gray-500">{item.slug}</td>
                <td className="py-3 px-4">
                  <p className="font-medium text-gray-900">{item.name.en}</p>
                  <p className="text-xs text-gray-500">{item.name.zh}</p>
                </td>
                <td className="py-3 px-4">
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                    {t(CATEGORY_OPTIONS.find((c) => c.value === item.category)?.label ?? { en: item.category, zh: item.category })}
                  </span>
                </td>
                <td className="py-3 px-4 font-medium text-[#0066cc]">
                  ${(item.priceUsd / 100).toFixed(2)}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      item.status === "published"
                        ? "bg-green-100 text-green-700"
                        : item.status === "sold_out"
                        ? "bg-gray-200 text-gray-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {t(STATUS_OPTIONS.find((s) => s.value === item.status)?.label ?? { en: item.status, zh: item.status })}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(item)}
                      className="rounded px-2 py-1 text-xs text-[#0066cc] hover:bg-blue-50"
                    >
                      {t({ en: "Edit", zh: "编辑" })}
                    </button>
                    <button
                      onClick={() => handleDelete(item.slug)}
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      {t({ en: "Delete", zh: "删除" })}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">
                  {t({ en: "No products yet. Click 'Add Product' to create one.", zh: "暂无商品。点击'添加商品'创建。" })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit/Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editing
                  ? t({ en: "Edit Product", zh: "编辑商品" })
                  : t({ en: "Add Product", zh: "添加商品" })}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Slug */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => updateField("slug", e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0066cc] focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                  placeholder="club-hoodie"
                />
              </div>

              {/* Name EN/ZH */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t({ en: "Name (English)", zh: "名称（英文）" })}
                  </label>
                  <input
                    type="text"
                    value={form.name_en}
                    onChange={(e) => updateField("name_en", e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0066cc] focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t({ en: "Name (中文)", zh: "名称（中文）" })}
                  </label>
                  <input
                    type="text"
                    value={form.name_zh}
                    onChange={(e) => updateField("name_zh", e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0066cc] focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                  />
                </div>
              </div>

              {/* Description EN/ZH */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t({ en: "Description (English)", zh: "描述（英文）" })}
                  </label>
                  <textarea
                    value={form.description_en}
                    onChange={(e) => updateField("description_en", e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0066cc] focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t({ en: "Description (中文)", zh: "描述（中文）" })}
                  </label>
                  <textarea
                    value={form.description_zh}
                    onChange={(e) => updateField("description_zh", e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0066cc] focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                  />
                </div>
              </div>

              {/* Category + Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t({ en: "Category", zh: "分类" })}
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => updateField("category", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0066cc] focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.label)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t({ en: "Status", zh: "状态" })}
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => updateField("status", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0066cc] focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.label)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Price + Sort Order */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t({ en: "Price (USD cents)", zh: "价格（美分）" })}
                  </label>
                  <input
                    type="number"
                    value={form.price_usd}
                    onChange={(e) => updateField("price_usd", parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0066cc] focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                  />
                  <p className="text-xs text-gray-500 mt-1">${(form.price_usd / 100).toFixed(2)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t({ en: "Sort Order", zh: "排序权重" })}
                  </label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => updateField("sort_order", parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0066cc] focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                  />
                </div>
              </div>

              {/* Cover Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t({ en: "Cover Image URL", zh: "封面图 URL" })}
                </label>
                <input
                  type="text"
                  value={form.cover_image}
                  onChange={(e) => updateField("cover_image", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0066cc] focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                  placeholder="https://..."
                />
              </div>

              {/* External URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t({ en: "Purchase Link", zh: "购买链接" })}
                </label>
                <input
                  type="text"
                  value={form.external_url}
                  onChange={(e) => updateField("external_url", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0066cc] focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                  placeholder="https://..."
                />
              </div>

              {/* Partner Brand */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t({ en: "Partner Brand", zh: "合作品牌" })}
                </label>
                <input
                  type="text"
                  value={form.partner_brand}
                  onChange={(e) => updateField("partner_brand", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0066cc] focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
                  placeholder="AlpineGear"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t({ en: "Cancel", zh: "取消" })}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#0066cc] px-4 py-2 text-sm font-medium text-white hover:bg-[#0071e3] disabled:opacity-50"
                >
                  {saving
                    ? t({ en: "Saving...", zh: "保存中..." })
                    : t({ en: "Save", zh: "保存" })}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
