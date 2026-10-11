import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminCollection, DetailWidgetProps } from "@medusajs/framework/types";
import { Container } from "@medusajs/ui";
export default function CollectionMarketing({ data }: DetailWidgetProps<AdminCollection>) { return <Container><a className="text-blue-600" href={`/app/snowforce-marketing?kind=collection&source=${encodeURIComponent(data.id)}`}>Email promotion / 邮件推广</a></Container>; }
export const config = defineWidgetConfig({ zone: "product_collection.details" });
