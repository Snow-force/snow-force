// Fictional fixtures for the DEVELOPMENT-ONLY /design-preview/member route.
// Live member routes never import this module or use it as a persistence source.
import type { User } from "@supabase/supabase-js";
import type { MemberProfile } from "@/lib/types";
import { defaultMemberEquipment, defaultMemberNotificationPreferences } from "./profile-fields";
import type { MemberDashboardData } from "./dashboard";
import { normalizeShopOrder, type ShopOrderRowInput } from "@/lib/shop/member-orders";
import type { ShippingAddress } from "@/lib/shop/shipping-addresses";

export const previewUser: User = {
  id: "10000000-0000-4000-8000-000000000001", email: "rider@example.com", aud: "authenticated",
  app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z",
};
export const previewProfile: MemberProfile = {
  id: "20000000-0000-4000-8000-000000000001", userId: previewUser.id, displayName: "Alex",
  email: "rider@example.com", phone: "+1 555 010 1000", riderLevel: { en: "Intermediate", zh: "中级" },
  riderType: "snowboarder", structuredRiderLevel: "intermediate", homeMountain: "Mammoth Mountain",
  bio: "", carpoolInterest: false, lodgingInterest: false, preferredLanguage: "zh", instagram: "", discord: "",
  avatarUrl: "", passes: ["ikon"], equipment: defaultMemberEquipment, savedEventSlugs: [],
  notificationPreferences: defaultMemberNotificationPreferences, emergencyContact: "", emergencyPhone: "",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
};
export const previewDashboard: MemberDashboardData = {
  upcomingTrips: [], registrationHistory: [], pendingConfirmations: [], savedEvents: [], recentRecaps: [],
  notifications: [], profileCompletion: 75, quickActions: [],
};

const address = { name: "Alex", address1: "123 Example Street", address2: "Apt 2", city: "Los Angeles", state: "CA", postalCode: "90001", countryCode: "US" as const };
export const previewOrderRows: ShopOrderRowInput[] = [
  {
    id: "ord_preview_dusk", user_id: previewUser.id, order_number: "SF-1008", status: "shipped", currency: "usd",
    subtotal_cents: 10415, shipping_cents: 0, tax_cents: 989, discount_cents: 0, total_cents: 11404,
    items: [{ id: "item_dusk", productSlug: "vector-insnow-dusk", name: { en: "Insnow Dusk softshell jacket", zh: "Insnow Dusk 软壳滑雪服" }, variant: { en: "Dawn pink / M", zh: "晨曦粉 / M" }, image: "/shop/vector-insnow-dusk.webp", quantity: 1, unitPriceCents: 10415, totalCents: 10415 }],
    shipments: [{ id: "shipment_dusk", carrier: "UPS", trackingNumber: "EXAMPLE-TRACKING", trackingUrl: "https://www.ups.com/track", status: "shipped", shippedAt: "2026-09-28T16:00:00Z", deliveredAt: null, itemIds: ["item_dusk"] }],
    shipping_address: address, created_at: "2026-09-26T19:00:00Z", updated_at: "2026-09-28T16:00:00Z",
  },
  {
    id: "ord_preview_goggles", user_id: previewUser.id, order_number: "SF-1003", status: "processing", currency: "usd",
    subtotal_cents: 5945, shipping_cents: 500, tax_cents: 565, discount_cents: 0, total_cents: 7010,
    items: [{ id: "item_goggles", productSlug: "isee-magnetic-goggles", name: { en: "Magnetic goggles 2.0", zh: "磁吸雪镜 2.0" }, variant: { en: "Sakura pink", zh: "落樱粉" }, image: "/shop/isee-magnetic-goggles.webp", quantity: 1, unitPriceCents: 5945, totalCents: 5945 }],
    shipments: [], shipping_address: address, created_at: "2026-09-25T19:00:00Z", updated_at: "2026-09-25T19:00:00Z",
  },
  {
    id: "ord_preview_kids", user_id: previewUser.id, order_number: "SF-0992", status: "delivered", currency: "usd",
    subtotal_cents: 10415, shipping_cents: 0, tax_cents: 989, discount_cents: 0, total_cents: 11404,
    items: [{ id: "item_kids", productSlug: "vector-rogue-kids", name: { en: "Rogue kids’ insulated jacket", zh: "Rogue 儿童加棉滑雪服" }, variant: { en: "Pink / ice blue · 130", zh: "粉雪冰蓝 / 130" }, image: "/shop/vector-rogue-kids.webp", quantity: 1, unitPriceCents: 10415, totalCents: 10415 }],
    shipments: [{ id: "shipment_kids", carrier: "USPS", trackingNumber: "EXAMPLE-DELIVERED", trackingUrl: null, status: "delivered", shippedAt: "2026-09-15T16:00:00Z", deliveredAt: "2026-09-18T16:00:00Z", itemIds: ["item_kids"] }],
    shipping_address: address, created_at: "2026-09-12T19:00:00Z", updated_at: "2026-09-18T16:00:00Z",
  },
];
export const previewOrders = previewOrderRows.map(normalizeShopOrder);
export const previewAddresses: ShippingAddress[] = [{ ...address, id: "30000000-0000-4000-8000-000000000001", userId: previewUser.id, phone: "+1 555 010 1000", isDefault: true, createdAt: "2026-09-01T16:00:00Z" }];
