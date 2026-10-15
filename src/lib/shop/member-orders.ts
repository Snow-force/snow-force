import { z } from "zod";

const text = z.string().max(300);
const money = z.number().int().nonnegative().max(2_000_000_000);
const localized = z.object({ en: text, zh: text });

export const shopOrderStatuses = ["pending", "processing", "shipped", "delivered", "cancelled", "refunded"] as const;
export type ShopOrderStatus = (typeof shopOrderStatuses)[number];
export const orderFilters = ["all", "pending", "processing", "shipped", "delivered", "after-sales"] as const;
export type OrderFilter = (typeof orderFilters)[number];

export const shopOrderItemSchema = z.object({
  id: text.min(1),
  productSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).nullable(),
  name: localized,
  variant: localized,
  image: z.string().max(2000),
  quantity: z.number().int().positive().max(10_000),
  returnedQuantity: z.number().int().nonnegative().max(10_000).default(0),
  unitPriceCents: money,
  totalCents: money,
});

export const shopShipmentSchema = z.object({
  id: text.min(1),
  carrier: text,
  trackingNumber: text,
  trackingUrl: z.string().max(2000).nullable(),
  status: z.enum(["preparing", "shipped", "delivered", "exception"]),
  shippedAt: z.string().datetime({ offset: true }).nullable(),
  deliveredAt: z.string().datetime({ offset: true }).nullable(),
  itemIds: z.array(text.min(1)).max(100),
});

const orderAddress = z.object({
  pickup: z.boolean().optional(),
  name: text,
  address1: text,
  address2: text,
  city: text,
  state: text,
  postalCode: text,
  countryCode: z.literal("US"),
});

export const shopPaymentStatuses = ["not_paid", "awaiting", "authorized", "partially_authorized", "captured", "partially_captured", "partially_refunded", "refunded", "canceled", "requires_action"] as const;
export const shopFulfillmentStatuses = ["not_fulfilled", "partially_fulfilled", "fulfilled", "partially_shipped", "shipped", "partially_delivered", "delivered", "canceled"] as const;

export const shopOrderRowSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),
  user_id: z.string().uuid().nullable(),
  order_number: text.min(1),
  status: z.enum(shopOrderStatuses),
  currency: z.literal("usd"),
  subtotal_cents: money,
  shipping_cents: money,
  tax_cents: money,
  discount_cents: money,
  credit_cents: z.number().int().min(-2_000_000_000).max(2_000_000_000).default(0),
  rounding_cents: z.number().int().min(-3).max(3).default(0),
  native_version: z.number().int().positive().default(1),
  payment_status: z.enum(shopPaymentStatuses).nullable().default(null),
  fulfillment_status: z.enum(shopFulfillmentStatuses).nullable().default(null),
  total_cents: money,
  items: z.array(shopOrderItemSchema).min(1).max(100),
  shipments: z.array(shopShipmentSchema).max(50),
  shipping_address: orderAddress.nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type ShopOrderRow = z.infer<typeof shopOrderRowSchema>;
export type ShopOrderRowInput = z.input<typeof shopOrderRowSchema>;
export type ShopOrderItem = z.infer<typeof shopOrderItemSchema>;
export type ShopShipment = z.infer<typeof shopShipmentSchema>;
export type ShopMemberOrder = {
  id: string;
  userId: string | null;
  orderNumber: string;
  status: ShopOrderStatus;
  currency: "usd";
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  creditCents: number;
  roundingCents: number;
  nativeVersion: number;
  paymentStatus: (typeof shopPaymentStatuses)[number] | null;
  fulfillmentStatus: (typeof shopFulfillmentStatuses)[number] | null;
  totalCents: number;
  items: ShopOrderItem[];
  shipments: ShopShipment[];
  shippingAddress: z.infer<typeof orderAddress> | null;
  createdAt: string;
  updatedAt: string;
};

export const orderStatusLabels: Record<ShopOrderStatus, { en: string; zh: string }> = {
  pending: { en: "Awaiting payment", zh: "待付款" },
  processing: { en: "Preparing your gear", zh: "待发货" },
  shipped: { en: "On the way", zh: "运输中" },
  delivered: { en: "Delivered", zh: "已送达" },
  cancelled: { en: "Cancelled", zh: "已取消" },
  refunded: { en: "Refunded", zh: "已退款" },
};

export const paymentStatusLabels: Record<(typeof shopPaymentStatuses)[number], { en: string; zh: string }> = {
  not_paid: { en: "Not paid", zh: "未付款" }, awaiting: { en: "Awaiting confirmation", zh: "等待付款确认" },
  authorized: { en: "Authorized, awaiting capture", zh: "已授权，待扣款" }, partially_authorized: { en: "Partially authorized", zh: "部分授权" },
  captured: { en: "Paid", zh: "已付款" }, partially_captured: { en: "Partially paid", zh: "部分付款" },
  partially_refunded: { en: "Partially refunded", zh: "部分退款" }, refunded: { en: "Refunded", zh: "已退款" },
  canceled: { en: "Payment canceled", zh: "付款已取消" }, requires_action: { en: "Payment needs attention", zh: "付款需要处理" },
};

export const orderFilterLabels: Record<OrderFilter, { en: string; zh: string }> = {
  all: { en: "All orders", zh: "全部订单" },
  pending: { en: "Awaiting payment", zh: "待付款" },
  processing: { en: "To be shipped", zh: "待发货" },
  shipped: { en: "In transit", zh: "运输中" },
  delivered: { en: "Delivered", zh: "已送达" },
  "after-sales": { en: "Cancelled & refunded", zh: "取消 / 退款" },
};

export function parseOrderFilter(value: string | undefined): OrderFilter {
  return orderFilters.find((filter) => filter === value) ?? "all";
}

export function orderStatusesForFilter(filter: OrderFilter): ShopOrderStatus[] {
  if (filter === "all") return [...shopOrderStatuses];
  if (filter === "after-sales") return ["cancelled", "refunded"];
  return [filter];
}

export function safeTrackingUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizeShopOrder(input: unknown): ShopMemberOrder {
  const row = shopOrderRowSchema.parse(input);
  if (row.subtotal_cents + row.shipping_cents + row.tax_cents - row.discount_cents - row.credit_cents + row.rounding_cents !== row.total_cents) {
    throw new Error("Invalid order total");
  }
  if (row.items.reduce((sum, item) => sum + item.totalCents, 0) !== row.subtotal_cents || new Set(row.items.map((item) => item.id)).size !== row.items.length || row.items.some((item) => item.returnedQuantity > item.quantity)) {
    throw new Error("Invalid order items");
  }
  return {
    id: row.id, userId: row.user_id, orderNumber: row.order_number, status: row.status,
    currency: row.currency, subtotalCents: row.subtotal_cents, shippingCents: row.shipping_cents,
    taxCents: row.tax_cents, discountCents: row.discount_cents, creditCents: row.credit_cents, roundingCents: row.rounding_cents,
    nativeVersion: row.native_version, paymentStatus: row.payment_status, fulfillmentStatus: row.fulfillment_status, totalCents: row.total_cents,
    items: row.items.map((item) => ({ ...item, image: item.image.startsWith("/") && !item.image.startsWith("//") ? item.image : safeTrackingUrl(item.image) ?? "" })),
    shipments: row.shipments.map((shipment) => ({ ...shipment, trackingUrl: safeTrackingUrl(shipment.trackingUrl) })),
    shippingAddress: row.shipping_address, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function formatOrderMoney(cents: number, lang: "en" | "zh" = "en") {
  return new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US", { style: "currency", currency: "USD", currencyDisplay: "symbol" }).format(cents / 100);
}

export function formatOrderDate(value: string, lang: "en" | "zh") {
  // Event dates without a time are calendar days, not midnight UTC instants.
  const timeZone = /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : "America/Los_Angeles";
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone }).format(new Date(value));
}
