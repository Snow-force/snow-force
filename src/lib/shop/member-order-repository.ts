import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizeShopOrder, orderStatusesForFilter, type OrderFilter, type ShopMemberOrder } from "./member-orders";
import { getCommerceCustomerSession } from "./commerce-auth";
import { syncOwnedMemberOrder } from "./order-sync";
import { CommerceNotFoundError } from "./commerce-client";

export type MemberOrderList =
  | { state: "ready"; orders: ShopMemberOrder[]; count: number; page: number; hasMore: boolean }
  | { state: "unavailable"; orders: []; count: null; page: number; hasMore: false };
export type MemberOrderDetail =
  | { state: "ready"; order: ShopMemberOrder }
  | { state: "not-found" }
  | { state: "unavailable" };

export const memberOrderPageSize = 10;
type RowResult = { data: unknown[] | null; error: unknown; count: number | null };
export type MemberOrderSource = {
  list: (userId: string, filter: OrderFilter, page: number) => Promise<RowResult>;
  get: (userId: string, orderId: string) => Promise<{ data: unknown; error: unknown }>;
};

const source: MemberOrderSource = {
  async list(userId, filter, page) {
    return (await createClient()).from("shop_member_orders").select("*", { count: "exact" })
      .eq("user_id", userId).in("status", orderStatusesForFilter(filter))
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range((page - 1) * memberOrderPageSize, page * memberOrderPageSize - 1);
  },
  async get(userId, orderId) {
    if (/^order_[A-Za-z0-9]{1,114}$/.test(orderId)) {
      const customer = await getCommerceCustomerSession();
      if (customer.userId !== userId) throw new Error("Order ownership mismatch");
      await syncOwnedMemberOrder(customer, orderId);
    }
    return (await createClient()).from("shop_member_orders").select("*")
      .eq("user_id", userId).eq("id", orderId).maybeSingle();
  },
};

export function parseOrderPage(value: string | undefined): number {
  return value && /^\d+$/.test(value) ? Math.min(Math.max(Number(value), 1), 10_000) : 1;
}

export function createMemberOrderRepository(orderSource: MemberOrderSource = source) {
  return {
    async list(userId: string, filter: OrderFilter = "all", page = 1): Promise<MemberOrderList> {
      const safePage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
      try {
        if (!userId) throw new Error("Missing authenticated user");
        const result = await orderSource.list(userId, filter, safePage);
        if (result.error || result.data === null || result.count === null) throw new Error("Order read unavailable");
        const orders = result.data.map(normalizeShopOrder);
        if (orders.some((order) => order.userId !== userId)) throw new Error("Order ownership mismatch");
        return { state: "ready", orders, count: result.count, page: safePage, hasMore: safePage * memberOrderPageSize < result.count };
      } catch {
        return { state: "unavailable", orders: [], count: null, page: safePage, hasMore: false };
      }
    },
    async get(userId: string, orderId: string): Promise<MemberOrderDetail> {
      if (!userId || !/^[a-zA-Z0-9_-]{1,120}$/.test(orderId)) return { state: "not-found" };
      try {
        const result = await orderSource.get(userId, orderId);
        if (result.error) return { state: "unavailable" };
        if (!result.data) return { state: "not-found" };
        const order = normalizeShopOrder(result.data);
        return order.userId === userId && order.id === orderId ? { state: "ready", order } : { state: "not-found" };
      } catch (error) {
        if (error instanceof CommerceNotFoundError) return { state: "not-found" };
        return { state: "unavailable" };
      }
    },
  };
}

export const memberOrderRepository = createMemberOrderRepository();
