import { createHash } from "node:crypto";
import type { AuthContext } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { merchandisingCommand, merchandisingFields, merchandisingKind, merchandisingRecord, type MerchandisingFields } from "./merchandising-contract";

type Connection = { raw(sql: string, bindings?: string[]): Promise<{ rows: unknown[] }>; transaction<T>(action: (db: Connection) => Promise<T>): Promise<T> };
const targets = { product: { table: "commerce.product", prefix: "prod" }, category: { table: "commerce.product_category", prefix: "pcat" }, collection: { table: "commerce.product_collection", prefix: "pcol" } } as const;
function staff(auth?: AuthContext) {
  if (auth?.actor_type !== "user" || !/^user_[A-Za-z0-9]+$/.test(auth.actor_id)) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in to the shop admin.");
}
function target(kind: unknown, id: unknown) {
  const parsed = merchandisingKind.safeParse(kind);
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unknown catalog record kind.");
  const name = parsed.data, config = targets[name];
  const recordId = z.string().regex(new RegExp(`^${config.prefix}_[A-Za-z0-9]+$`)).safeParse(id);
  if (!recordId.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid catalog record ID.");
  return { kind: name, table: config.table, id: recordId.data };
}
function fields(kind: z.infer<typeof merchandisingKind>, metadata: Record<string, unknown>, handle: string | null) {
  const text = (key: string) => typeof metadata[key] === "string" ? metadata[key] : "";
  if (kind === "product") return merchandisingFields.parse({ kind, brand: text("snowforce_brand") });
  const common = { kind, name_zh: text("snowforce_name_zh"), image: text("snowforce_image") };
  if (kind === "category") return merchandisingFields.parse({ ...common, section: metadata.snowforce_navigation_section ?? "auto" });
  return merchandisingFields.parse({ ...common, section: metadata.snowforce_navigation_section ?? (handle === "sale" ? "sale" : "featured"), rank: metadata.snowforce_navigation_rank ?? 0, promotion_code: text("snowforce_promotion_code") });
}
export function merchandisingMetadata(value: MerchandisingFields): Record<string, unknown> {
  if (value.kind === "product") return { snowforce_brand: value.brand };
  const common = { snowforce_name_zh: value.name_zh, snowforce_image: value.image, snowforce_navigation_section: value.section === "auto" ? null : value.section };
  return value.kind === "category" ? common : { ...common, snowforce_navigation_rank: value.rank, snowforce_promotion_code: value.promotion_code };
}
async function read(db: Connection, config: ReturnType<typeof target>, lock = false) {
  const result = await db.raw(`select id,handle,metadata from ${config.table} where id=? and deleted_at is null${lock ? " for update" : ""}`, [config.id]);
  if (result.rows.length !== 1) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Catalog record not found.");
  const row = z.object({ id: z.string(), handle: z.string().nullable(), metadata: z.record(z.string(), z.unknown()).nullable() }).parse(result.rows[0]);
  const content = fields(config.kind, row.metadata ?? {}, row.handle);
  return merchandisingRecord.parse({ id: row.id, fields: content, fingerprint: createHash("sha256").update(JSON.stringify({ id: row.id, fields: content })).digest("hex") });
}
export async function getMerchandising(scope: MedusaContainer, auth: AuthContext | undefined, kind: unknown, id: unknown) {
  staff(auth); const config = target(kind, id);
  return read(scope.resolve<Connection>(ContainerRegistrationKeys.PG_CONNECTION), config);
}
export async function saveMerchandising(scope: MedusaContainer, auth: AuthContext | undefined, kind: unknown, id: unknown, raw: unknown) {
  staff(auth); const config = target(kind, id), command = merchandisingCommand.safeParse(raw);
  if (!command.success || command.data.fields.kind !== config.kind) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Check the merchandising fields.");
  const db = scope.resolve<Connection>(ContainerRegistrationKeys.PG_CONNECTION);
  return db.transaction(async tx => {
    const current = await read(tx, config, true);
    // Assignments are idempotent even when the first response was lost.
    if (JSON.stringify(current.fields) === JSON.stringify(command.data.fields)) return current;
    if (current.fingerprint !== command.data.expected_fingerprint) throw new MedusaError(MedusaError.Types.CONFLICT, "Merchandising changed. Reload before saving.");
    await tx.raw(`update ${config.table} set metadata=coalesce(metadata,'{}'::jsonb)||?::jsonb,updated_at=clock_timestamp() where id=? and deleted_at is null`, [JSON.stringify(merchandisingMetadata(command.data.fields)), config.id]);
    return read(tx, config);
  });
}
