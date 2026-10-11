import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminPromotion, DetailWidgetProps } from "@medusajs/framework/types";
import { Container } from "@medusajs/ui";
export default function PromotionMarketing({ data }: DetailWidgetProps<AdminPromotion>) { return <Container><a className="text-blue-600" href={`/app/snowforce-marketing?kind=promotion&source=${encodeURIComponent(data.id)}`}>Email promotion / 邮件推广</a></Container>; }
export const config = defineWidgetConfig({ zone: "promotion.details" });
