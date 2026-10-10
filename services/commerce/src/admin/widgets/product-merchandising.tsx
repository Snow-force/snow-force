import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types";
import { MerchandisingEditor } from "../components/merchandising-editor";
export default function ProductMerchandising({ data }: DetailWidgetProps<AdminProduct>) { return <MerchandisingEditor key={data.id} kind="product" id={data.id} />; }
export const config = defineWidgetConfig({ zone: "product.details" });
