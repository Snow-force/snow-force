import { getShopSupportEmail } from "@/lib/shop/support-repository";
import { Footer } from "./footer";

export async function ShopSupportFooter() {
  const supportEmail = await getShopSupportEmail();
  return <Footer supportEmail={supportEmail} />;
}
