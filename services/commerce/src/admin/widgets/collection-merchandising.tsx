import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminCollection, DetailWidgetProps } from "@medusajs/framework/types";
import { MerchandisingEditor } from "../components/merchandising-editor";
export default function CollectionMerchandising({ data }: DetailWidgetProps<AdminCollection>) { return <MerchandisingEditor key={data.id} kind="collection" id={data.id} />; }
export const config = defineWidgetConfig({ zone: "product_collection.details" });
