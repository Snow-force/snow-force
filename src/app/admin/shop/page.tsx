import { getAllShopItems } from "@/lib/shop/repository";
import { AdminShopView } from "./admin-shop-view";

export const dynamic = "force-dynamic";

export default async function AdminShopPage() {
  const items = await getAllShopItems().catch(() => []);
  return <AdminShopView initialItems={items} />;
}
