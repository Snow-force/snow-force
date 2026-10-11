import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types";
import { Container } from "@medusajs/ui";
export default function ProductMarketing({ data }: DetailWidgetProps<AdminProduct>) { return <Container><a className="text-blue-600" href={`/app/snowforce-marketing?kind=product&source=${encodeURIComponent(data.id)}`}>Email promotion / 邮件推广</a></Container>; }
export const config = defineWidgetConfig({ zone: "product.details" });
