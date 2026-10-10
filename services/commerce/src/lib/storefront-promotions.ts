import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "zod";
export const storefrontPromotion = z.object({ collection_id: z.string().regex(/^pcol_[A-Za-z0-9]+$/), code: z.string().min(1).max(100), is_automatic: z.boolean(), ends_at: z.union([z.string(), z.date()]).nullable().transform(value => value === null ? null : new Date(value).toISOString()) }).strict();
/** Codes are public only when deliberately linked from a visible collection.
 * Native cart promotion evaluation remains authoritative for customer/rule eligibility. */
export async function publicCollectionPromotions(scope: MedusaContainer) {
  const db = scope.resolve<{ raw(sql: string): Promise<{ rows: unknown[] }> }>(ContainerRegistrationKeys.PG_CONNECTION);
  const result = await db.raw(`select c.id as collection_id,p.code,p.is_automatic,cam.ends_at
    from commerce.product_collection c
    join commerce.promotion p on p.code=c.metadata->>'snowforce_promotion_code' and p.deleted_at is null and p.status='active'
    left join commerce.promotion_campaign cam on cam.id=p.campaign_id and cam.deleted_at is null
    left join commerce.promotion_campaign_budget b on b.campaign_id=cam.id and b.deleted_at is null
    where c.deleted_at is null and coalesce(c.metadata->>'snowforce_navigation_section','featured')<>'hidden'
    and (p.limit is null or p.used<p.limit)
    and (p.campaign_id is null or cam.id is not null)
    and (cam.starts_at is null or cam.starts_at<=clock_timestamp())
    and (cam.ends_at is null or cam.ends_at>clock_timestamp())
    and (b.id is null or b.attribute is not null or b.limit is null or b.used<b.limit)
    order by c.id`);
  return { promotions: z.array(storefrontPromotion).parse(result.rows) };
}
