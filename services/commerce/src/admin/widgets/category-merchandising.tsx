import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminProductCategory, DetailWidgetProps } from "@medusajs/framework/types";
import { MerchandisingEditor } from "../components/merchandising-editor";
export default function CategoryMerchandising({ data }: DetailWidgetProps<AdminProductCategory>) { return <MerchandisingEditor key={data.id} kind="category" id={data.id} />; }
export const config = defineWidgetConfig({ zone: "product_category.details" });
