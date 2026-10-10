import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "zod";
import { exactTaxUsdCents } from "./tax-quote-money";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { readCapturedTaxSale } from "./tax-sale-source";
import { saleOrderId, taxSaleFingerprint, taxSaleRequest } from "./tax-sale-contract";
import { bindRefundOrderLines, checkedRefundSale, TaxRefundConflict } from "./tax-refund-contract";

type NativeReader = typeof readCapturedTaxSale;
const recorded = z.object({ operation_id: z.uuid(), order_id: saleOrderId, account_id: z.string(), livemode: z.boolean(), transaction_id: z.string(),
  source: z.unknown(), source_fingerprint: z.string(), request: z.unknown(), request_fingerprint: z.string(), snapshot: z.unknown(),
});
const cents = z.unknown().transform(exactTaxUsdCents), quantity = z.coerce.number().int().positive().max(10000);
const rawLine = z.object({ unit_price: cents, raw_unit_price: z.object({ value: cents }), quantity, raw_quantity: z.object({ value: quantity }) });
/** Internal server read. The admin/customer ownership boundary must run before
 * calling this; no provider calls, mutations or current product prices are used. */
export async function readTaxRefundSource(scope: MedusaContainer, rawOrderId: unknown, readNative: NativeReader = readCapturedTaxSale) {
  const orderId = saleOrderId.parse(rawOrderId), native = await readNative(scope, orderId);
  const db = scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
  const result = await db.raw(`select t.id as operation_id,s.order_id,s.account_id,s.livemode,s.transaction_id,
    t.source,t.source_fingerprint,t.request,t.request_fingerprint,s.snapshot
    from commerce.snowforce_tax_sales s join commerce.snowforce_tax_sale_tasks t on t.id=s.task_id
    where s.order_id=? and t.order_id=s.order_id and t.state='ready'`, [orderId]);
  const row = z.array(recorded).length(1).parse(result.rows)[0];
  if (row.order_id !== orderId || taxSaleFingerprint(native) !== row.source_fingerprint || taxSaleFingerprint(row.source) !== row.source_fingerprint ||
    taxSaleFingerprint(row.request) !== row.request_fingerprint || taxSaleFingerprint(taxSaleRequest(native, row.operation_id)) !== row.request_fingerprint) throw new TaxRefundConflict();
  const sale = { source: native, operation_id: row.operation_id, snapshot: row.snapshot }, checked = checkedRefundSale(sale);
  if (row.account_id !== native.input.account_id || row.livemode !== native.input.livemode || row.transaction_id !== checked.original.transaction.id) throw new TaxRefundConflict();
  // Original order version retains purchased quantity and price after native
  // returns. Newly added exchange lines have no original quote-line marker.
  const orderLines = (await db.raw(`select i.id,i.variant_id,oi.quantity,oi.raw_quantity,
    coalesce(oi.unit_price,i.unit_price) as unit_price,coalesce(oi.raw_unit_price,i.raw_unit_price) as raw_unit_price,
    (select jsonb_agg(jsonb_build_object('provider_id',t.provider_id,'metadata',t.metadata) order by t.id)
      from commerce.order_line_item_tax_line t where t.item_id=i.id and t.deleted_at is null) as tax_lines
    from commerce.order_item oi join commerce.order_line_item i on i.id=oi.item_id
    where oi.order_id=? and oi.version=1 and oi.deleted_at is null and i.deleted_at is null
      and exists(select 1 from commerce.order_line_item_tax_line t where t.item_id=i.id and t.deleted_at is null
        and t.provider_id='snowforce_stripe_tax' and t.metadata->>'quote_id'=?) order by i.id`, [orderId, native.quote_id])).rows;
  for (const raw of orderLines) {
    const line = rawLine.parse(raw);
    if (line.unit_price !== line.raw_unit_price.value || line.quantity !== line.raw_quantity.value) throw new TaxRefundConflict();
  }
  const bindings = bindRefundOrderLines(sale, orderLines);
  return { sale, order_lines: orderLines, bindings };
}
