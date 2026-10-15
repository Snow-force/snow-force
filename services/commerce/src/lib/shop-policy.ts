import { createHash } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";

// Kept only on the native Store: do not copy this private key to product/region metadata.
export const shopPolicyMetadataKey = "snowforce_shop_policy";
const dayCount = z.number().int().min(1).max(365);
// 14 bilingual paragraphs remain below the native JSON parser's 100 KiB default.
const paragraph = z.string().trim().min(1).max(2000);
const bilingualParagraph = z.object({ zh: paragraph, en: paragraph }).strict();
export const shopPolicySections = ["shipping", "requests", "conditions", "shipping_costs", "refunds", "return_address", "consumer_rights"] as const;
export const shopPolicyContentSchema = z.object({
  seller_name: z.string().trim().max(200),
  customer_service_email: z.union([z.literal(""), z.email().max(254)]),
  terms: z.object({
    return_window_days: dayCount,
    approved_dispatch_days: dayCount,
    review_business_days: dayCount,
    refund_business_days: dayCount,
    processing_business_days_min: dayCount,
    processing_business_days_max: dayCount,
    transit_business_days_min: dayCount,
    transit_business_days_max: dayCount,
  }).strict().superRefine((value, context) => {
    if (value.processing_business_days_min > value.processing_business_days_max) context.addIssue({ code: "custom", path: ["processing_business_days_max"], message: "Maximum processing days must be at least the minimum." });
    if (value.transit_business_days_min > value.transit_business_days_max) context.addIssue({ code: "custom", path: ["transit_business_days_max"], message: "Maximum delivery days must be at least the minimum." });
  }),
  copy: z.object({ shipping: bilingualParagraph, requests: bilingualParagraph, conditions: bilingualParagraph, shipping_costs: bilingualParagraph, refunds: bilingualParagraph, return_address: bilingualParagraph, consumer_rights: bilingualParagraph }).strict(),
}).strict();
export type ShopPolicyContent = z.infer<typeof shopPolicyContentSchema>;
const actorIdSchema = z.string().trim().min(1).max(200);
const publicationSchema = z.object({
  version: z.number().int().min(1).max(1000000),
  effective_at: z.iso.datetime(),
  published_at: z.iso.datetime(),
  published_by: actorIdSchema,
  content: shopPolicyContentSchema,
}).strict();
const receiptSchema = z.object({ request_id: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/), revision: z.number().int().min(1).max(1000000) }).strict();
export const shopPolicyStateSchema = z.object({
  schema_version: z.literal(1),
  revision: z.number().int().min(0).max(1000000),
  draft: z.object({ version: z.number().int().min(0).max(1000000), updated_at: z.iso.datetime().nullable(), updated_by: actorIdSchema.nullable(), content: shopPolicyContentSchema }).strict(),
  published_version: z.number().int().min(1).max(1000000).nullable(),
  publications: z.array(publicationSchema).max(100),
  save_receipts: z.array(receiptSchema).max(64),
}).strict().superRefine((value, context) => {
  if (value.draft.version !== value.revision) context.addIssue({ code: "custom", path: ["draft", "version"], message: "The draft revision is inconsistent." });
  const versions = value.publications.map((publication) => publication.version);
  if (new Set(versions).size !== versions.length || versions.some((version) => version > value.revision) || (value.published_version !== null && !versions.includes(value.published_version))) context.addIssue({ code: "custom", path: ["publications"], message: "The publication history is inconsistent." });
  if (new Set(value.save_receipts.map((receipt) => receipt.request_id)).size !== value.save_receipts.length || value.save_receipts.some((receipt) => receipt.revision > value.revision)) context.addIssue({ code: "custom", path: ["save_receipts"], message: "The save history is inconsistent." });
});
export type ShopPolicyState = z.infer<typeof shopPolicyStateSchema>;
export const saveShopPolicyDraftSchema = z.object({ command: z.literal("save_draft"), request_id: z.uuid(), expected_revision: z.number().int().min(0).max(999999), content: shopPolicyContentSchema }).strict();
export const publishShopPolicySchema = z.object({ command: z.literal("publish"), request_id: z.uuid(), expected_revision: z.number().int().min(1).max(999999), confirm_review: z.literal(true) }).strict();
const policyCommandSchema = z.discriminatedUnion("command", [saveShopPolicyDraftSchema, publishShopPolicySchema]);
export const publishedShopPolicySchema = z.object({ schema_version: z.literal(1), version: z.number().int().positive(), effective_at: z.iso.datetime(), content: shopPolicyContentSchema }).strict();
export type PublishedShopPolicy = z.infer<typeof publishedShopPolicySchema>;
type SaveDraft = z.infer<typeof saveShopPolicyDraftSchema>;

// These are editable proposal defaults, never published terms or a checkout eligibility rule.
export function initialShopPolicyState(): ShopPolicyState {
  return shopPolicyStateSchema.parse({
    schema_version: 1, revision: 0,
    draft: { version: 0, updated_at: null, updated_by: null, content: {
      seller_name: "", customer_service_email: "",
      terms: { return_window_days: 30, approved_dispatch_days: 14, review_business_days: 2, refund_business_days: 5, processing_business_days_min: 1, processing_business_days_max: 2, transit_business_days_min: 3, transit_business_days_max: 7 },
      copy: {
        shipping: {
          zh: "我们从美国加州 Irvine 发货，配送覆盖美国本土 48 州及华盛顿特区，暂不配送 Alaska、Hawaii、美国属地、海外或 APO/FPO/DPO 地址。商品优惠后金额满 US$100 免标准运费，否则标准运费 US$9.95；税费和运费不计入包邮门槛。适用销售税于确认地址后在结账页单独显示。现货订单预计付款确认后 1–2 个工作日处理，交给承运商后 3–7 个工作日送达。工作日不含周末和节假日；天气、假期及承运商延误可能影响估计时间。发货后可在会员订单查看追踪信息；预约自提不收配送费：请先联系客服确认自提预约，再在网站选择自提并付款。自提地点及按该地点计算的适用销售税显示在结账页；出发前请向客服确认订单已备妥。暂不提供到付配送。",
          en: "We ship from Irvine, California to the contiguous 48 United States and Washington, DC, excluding Alaska, Hawaii, US territories, international and APO/FPO/DPO addresses. Standard shipping is free when the merchandise total after discounts is US$100 or more; otherwise it is US$9.95. Shipping and tax do not count toward the threshold. Applicable sales tax is shown separately after your address is confirmed. In-stock orders are expected to be processed within 1–2 business days after payment confirmation, with estimated delivery 3–7 business days after carrier handoff. Business days exclude weekends and holidays. Weather, holidays and carrier delays may affect estimates. Tracking appears in member order details. Appointment pickup is free: contact customer service to confirm your appointment, then choose pickup and pay on the website. Checkout shows the pickup location and applicable tax calculated at that location. Confirm your order is ready before travelling. Collect-on-delivery shipping is not available.",
        },
        requests: {
          zh: "请在商品送达或自提领取后 30 天内，通过会员订单详情提交退换货申请，注明商品、数量和原因。破损、质量问题或错发请保留商品和包装，并提供照片便于核实。我们预计在 2 个工作日内审核回复。请等候批准及退回说明再寄回；批准后 14 天内交给承运商，并填写追踪号。包裹不必在 14 天内送达，但应按时交运；特殊情况可通过申请联系售后协调。",
          en: "Submit a return or exchange request from your member order details within 30 days of delivery or collection, including the items, quantities and reason. For damage, defects or an incorrect item, retain the merchandise and packaging and provide photographs for review. We aim to review requests within 2 business days. Wait for approval and return instructions before shipping. Hand the package to the carrier within 14 days of approval and add its tracking number. It need not arrive within those 14 days, but it must be dispatched on time. Contact us through the request if an exception needs to be arranged.",
        },
        conditions: {
          zh: "个人原因退换货需未穿着、未使用、未清洗、未改装，吊牌、附件和原包装完整。室内试穿可以接受，滑雪等户外使用不适用个人原因退换货。使用外层包装，不要直接在商品包装粘物流标签。质量缺陷、错发或运输损坏单独核实，不受完好条件限制。超过 30 天的质量问题仍可按适用保修及消费者权利处理。普通商品均适用本政策；只有购买前在商品页明确标注 Final Sale 的商品，才排除个人原因退换，且不排除质量问题、错发或法定权利。",
          en: "Change-of-mind returns must be unworn, unused, unwashed and unaltered, with tags, accessories and original packaging. Indoor try-on is permitted; skiing or other outdoor use is not. Protect the item with an outer package and do not attach shipping labels directly to its original packaging. Defects, incorrect items and transit damage are reviewed separately and are not excluded by ordinary condition requirements. Contact us about defects after 30 days; applicable warranty and consumer rights still apply. Ordinary products follow this policy. Only items clearly marked Final Sale on the product page before purchase exclude change-of-mind returns; defects, incorrect items and statutory rights remain covered.",
        },
        shipping_costs: {
          zh: "个人原因退换货由顾客承担可追踪的退回运费，原寄出运费通常不退；首次同款尺码或颜色换货的标准再次寄出运费由 SnowForce 承担，其他情况在批准前说明。经核实的质量缺陷、错发或运输损坏由 SnowForce 按批准说明提供标签或报销事先批准的实际邮费，并承担换货寄出运费；整单因此退回时退原运费，部分退回的合理配送补偿在审核回复中列明。不收补货费；原包邮订单因部分退回低于门槛，不补扣原运费。不要自行到付寄回。",
          en: "For change-of-mind returns, you pay tracked return shipping and original outbound shipping is generally not refundable. SnowForce covers standard outbound shipping for the first same-style size or color exchange; other charges are explained before approval. For verified defects, incorrect items or transit damage, SnowForce provides an approved label or reimburses pre-approved actual postage and covers replacement shipping. Original shipping is refunded when the whole order is returned because of such an issue; reasonable shipping reimbursement for partial returns is specified in the review response. There is no restocking fee and no retroactive outbound charge when a partial return takes an originally free-shipping order below the threshold. Do not send packages collect-on-delivery.",
        },
        refunds: {
          zh: "退回商品收妥并检查通过后，预计 5 个工作日内向原支付方式发起退款，银行到账时间可能不同。按原订单该商品优惠后的实际支付金额退款，并退还适用销售税及按本政策处理运费；不按现价退款，也不退到另一张卡。换货取决于可用库存，同款尺码颜色原则上保留原价；不同商品或价差先说明退款或补款，经顾客同意后处理。缺货时可改为退货退款。提交申请不会自动退款或发替换商品。",
          en: "After returned items arrive and pass inspection, we aim to initiate refunds within 5 business days to the original payment method; your bank's posting time may differ. Refunds use the original discounted amount paid, include applicable refundable sales tax and follow this policy's shipping rules, rather than current prices or another card. Exchanges depend on available stock. Same-style size or color exchanges generally retain the original price. For other products or price differences, we explain the refund or additional payment and obtain your agreement. If stock is unavailable, you may choose a return and refund. Submitting a request does not automatically issue a refund or replacement.",
        },
        return_address: {
          zh: "批准后请寄至 SnowForce — Returns，1 Park Plaza, #600 Office 44, Irvine, CA 92614, United States，并附订单号及批准申请编号。该地址未经预约不接待现场退换货。请保留交运凭证和追踪号；运输丢失或损坏按承运商责任及适用法律处理。",
          en: "Send approved returns to SnowForce — Returns, 1 Park Plaza, #600 Office 44, Irvine, CA 92614, United States, with your order number and approved request number. Walk-in returns require an appointment. Retain dispatch and tracking evidence; carrier loss or damage is handled according to applicable carrier responsibilities and law.",
        },
        consumer_rights: {
          zh: "本政策不限制适用法律赋予消费者的权利。可通过会员订单内的售后申请联系支持。正式销售主体、客服邮箱及生效日期将在发布前补充。",
          en: "This policy does not limit your statutory consumer rights. Use the after-sales request in your member order details for support. The legal seller, customer service email and effective date must be completed before publication.",
        },
      },
    } },
    published_version: null, publications: [], save_receipts: [],
  });
}

export function readShopPolicyState(metadata: Record<string, unknown> | null): { state: ShopPolicyState; persisted: boolean } {
  const raw = metadata?.[shopPolicyMetadataKey];
  if (raw === undefined) return { state: initialShopPolicyState(), persisted: false };
  const result = shopPolicyStateSchema.safeParse(raw);
  if (!result.success) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "The saved policy is invalid. Inspect it before editing; it was not replaced with defaults.");
  return { state: result.data, persisted: true };
}
function policyActor(value: string | undefined): string {
  const result = actorIdSchema.safeParse(value);
  if (!result.success) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Staff authentication required.");
  return result.data;
}
function invalidInput() { return new MedusaError(MedusaError.Types.INVALID_DATA, "Enter valid bilingual policy details and confirm review before publication."); }
function conflict() { return new MedusaError(MedusaError.Types.CONFLICT, "The policy changed or this save key was reused. Reload before saving."); }
export function applyShopPolicyDraftSave(state: ShopPolicyState, input: SaveDraft, staffId: string, at: string) {
  policyActor(staffId);
  const digest = createHash("sha256").update(JSON.stringify({ expected_revision: input.expected_revision, content: input.content })).digest("hex");
  const receipt = state.save_receipts.find((entry) => entry.request_id === input.request_id);
  if (receipt) {
    if (receipt.digest !== digest) throw conflict();
    return { state, replayed: true, applied_revision: receipt.revision };
  }
  if (state.revision !== input.expected_revision || state.revision >= 1000000) throw conflict();
  const revision = state.revision + 1;
  const next = shopPolicyStateSchema.parse({ ...state, revision, draft: { version: revision, updated_at: at, updated_by: staffId, content: input.content }, save_receipts: [...state.save_receipts, { request_id: input.request_id, digest, revision }].slice(-64) });
  return { state: next, replayed: false, applied_revision: revision };
}

export function assertPublishableShopPolicy(content: ShopPolicyContent) {
  if (!content.seller_name.trim() || !content.customer_service_email || /正式销售主体、客服邮箱及生效日期将在发布前补充|must be completed before publication/i.test(`${content.copy.consumer_rights.zh}\n${content.copy.consumer_rights.en}`)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Complete the legal seller, support email and customer-rights copy before publishing. Review both languages and the operational settings.");
}
export function applyShopPolicyPublication(state: ShopPolicyState, input: z.infer<typeof publishShopPolicySchema>, staffId: string, at: string) {
  policyActor(staffId);
  // Separate from save receipts so a save key cannot be repurposed to publish.
  const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const receipt = state.save_receipts.find((entry) => entry.request_id === input.request_id);
  if (receipt) {
    if (receipt.digest !== digest) throw conflict();
    return { state, replayed: true, applied_revision: receipt.revision };
  }
  if (state.revision !== input.expected_revision || state.revision >= 1000000 || state.publications.length >= 100) throw conflict();
  assertPublishableShopPolicy(state.draft.content);
  const last = state.publications.find((entry) => entry.version === state.published_version);
  if (last && JSON.stringify(last.content) === JSON.stringify(state.draft.content)) throw new MedusaError(MedusaError.Types.CONFLICT, "This exact draft is already published.");
  const instant = z.iso.datetime().parse(at);
  if (state.publications.some((entry) => Date.parse(entry.published_at) > Date.parse(instant))) throw conflict();
  const revision = state.revision + 1;
  const next = shopPolicyStateSchema.parse({ ...state, revision, draft: { ...state.draft, version: revision }, published_version: revision,
    publications: [...state.publications, { version: revision, effective_at: instant, published_at: instant, published_by: staffId, content: state.draft.content }],
    save_receipts: [...state.save_receipts, { request_id: input.request_id, digest, revision }].slice(-64) });
  return { state: next, replayed: false, applied_revision: revision };
}

type Connection = { raw: (sql: string, bindings?: (string | number)[]) => Promise<{ rows: unknown[] }>; transaction: <T>(callback: (connection: Connection) => Promise<T>) => Promise<T> };
const storeRows = z.array(z.object({ id: z.string().regex(/^store_[A-Za-z0-9]+$/), metadata: z.record(z.string(), z.unknown()).nullable() }));
async function readStore(connection: Connection, lock: boolean) {
  const result = await connection.raw(`select id,metadata from commerce.store where deleted_at is null order by created_at,id limit 2${lock ? " for update" : ""}`);
  const stores = storeRows.parse(result.rows);
  if (stores.length !== 1) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Exactly one native store must be configured before editing policies.");
  return stores[0];
}
export async function adminShopPolicy(scope: MedusaContainer, staffId: string | undefined) {
  policyActor(staffId);
  const connection = scope.resolve<Connection>(ContainerRegistrationKeys.PG_CONNECTION);
  const store = await readStore(connection, false);
  return { store_id: store.id, ...readShopPolicyState(store.metadata) };
}
export async function saveShopPolicyDraft(scope: MedusaContainer, staffId: string | undefined, raw: unknown) {
  policyActor(staffId);
  const parsed = saveShopPolicyDraftSchema.safeParse(raw);
  if (!parsed.success) throw invalidInput();
  return changeShopPolicy(scope, staffId, parsed.data);
}
export async function changeShopPolicy(scope: MedusaContainer, staffId: string | undefined, raw: unknown) {
  const staff = policyActor(staffId);
  const parsed = policyCommandSchema.safeParse(raw);
  if (!parsed.success) throw invalidInput();
  return scope.resolve<Connection>(ContainerRegistrationKeys.PG_CONNECTION).transaction(async (connection) => {
    const store = await readStore(connection, true);
    const previous = readShopPolicyState(store.metadata);
    const result = parsed.data.command === "save_draft" ? applyShopPolicyDraftSave(previous.state, parsed.data, staff, new Date().toISOString()) : applyShopPolicyPublication(previous.state, parsed.data, staff, new Date().toISOString());
    if (!result.replayed) {
      // Update only this key in the locked row, preserving fulfillment, tax and native metadata.
      const written = await connection.raw("update commerce.store set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{snowforce_shop_policy}',?::jsonb,true),updated_at=now() where id=? and deleted_at is null and coalesce(metadata->'snowforce_shop_policy'->>'revision','0')=? returning id,metadata", [JSON.stringify(result.state), store.id, String(previous.state.revision)]);
      const rows = storeRows.parse(written.rows);
      if (rows.length !== 1) throw conflict();
      const saved = readShopPolicyState(rows[0].metadata);
      return { store_id: store.id, ...saved, replayed: false, applied_revision: result.applied_revision };
    }
    return { store_id: store.id, ...previous, replayed: true, applied_revision: result.applied_revision };
  });
}

export async function publicShopPolicy(scope: MedusaContainer, at = new Date().toISOString(), version?: number) {
  const store = await readStore(scope.resolve<Connection>(ContainerRegistrationKeys.PG_CONNECTION), false);
  return publishedShopPolicy(store.metadata, at, version);
}

/** The only safe projection for a customer endpoint. Never return Store metadata. */
export function publishedShopPolicy(metadata: Record<string, unknown> | null, at: string, version?: number) {
  const { state } = readShopPolicyState(metadata);
  const instant = z.iso.datetime().parse(at);
  const timestamp = Date.parse(instant);
  const publishedVersion = state.published_version;
  const publication = publishedVersion === null ? undefined : state.publications
    .filter((entry) => (version === undefined || entry.version === version) && entry.version <= publishedVersion && Date.parse(entry.effective_at) <= timestamp && Date.parse(entry.published_at) <= timestamp)
    .sort((left, right) => right.version - left.version)[0];
  if (!publication) return null;
  // Separate content from mutable metadata, and omit author, draft and save receipts.
  return { schema_version: 1 as const, version: publication.version, effective_at: publication.effective_at, content: shopPolicyContentSchema.parse(publication.content) };
}
/** Orders must save this independent value, not a pointer to the current Store policy. */
export function createShopPolicyOrderSnapshot(metadata: Record<string, unknown> | null, purchasedAt: string) {
  const policy = publishedShopPolicy(metadata, purchasedAt);
  if (!policy) throw new MedusaError(MedusaError.Types.CONFLICT, "A published, effective shop policy is required before recording purchase terms.");
  return { ...policy, purchased_at: z.iso.datetime().parse(purchasedAt) };
}
