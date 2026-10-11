import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Container } from "@medusajs/ui";
import { MarketingEditor } from "../../components/marketing-editor";
export default function MarketingPage() {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get("kind");
  return <Container><MarketingEditor endpoint="/admin/snowforce/marketing" surface="shop" initialSource={params.get("source") ?? ""} initialKind={kind === "collection" || kind === "promotion" ? kind : "product"} /></Container>;
}
export const config = defineRouteConfig({ label: "邮件推广 / Email promotion" });
