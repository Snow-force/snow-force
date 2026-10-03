import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

export function storefrontEnvironment(existing, key, secret) {
  if (!/^pk_[a-zA-Z0-9_]+$/.test(key) || !/^[a-f0-9]{64}$/.test(secret)) throw new Error("Invalid storefront configuration.");
  const values = { MEDUSA_BACKEND_URL: "http://127.0.0.1:9000", MEDUSA_PUBLISHABLE_KEY: key, SHOP_CART_COOKIE_SECRET: secret };
  const additions = Object.entries(values).filter(([name]) => !new RegExp(`^\\s*${name}\\s*=`, "m").test(existing));
  return { content: existing + (additions.length ? `\n# Local Medusa storefront connection; do not commit credentials.\n${additions.map(([name, value]) => `${name}=${value}`).join("\n")}\n` : ""), added: additions.map(([name]) => name) };
}
async function run() {
  process.loadEnvFile(".env.development");
  const url = new URL(process.env.DATABASE_URL);
  const scoped = (url.hostname === "db.bhmwxkynhyhquspiyact.supabase.co" && decodeURIComponent(url.username) === "snowforce_commerce") || (url.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(url.username) === "snowforce_commerce.bhmwxkynhyhquspiyact");
  if (!scoped || !["postgres:", "postgresql:"].includes(url.protocol) || url.pathname !== "/postgres" || (url.port && url.port !== "5432") || !process.env.DATABASE_CA_CERT) throw new Error("Use the protected dedicated commerce connection and verified CA.");
  const root = resolve("../..");
  const file = resolve(root, ".env.local");
  execFileSync("git", ["check-ignore", ".env.local"], { cwd: root, stdio: "ignore" });
  const client = new pg.Client({ host: url.hostname, port: Number(url.port || 5432), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: "postgres", connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n") } });
  try {
    await client.connect();
    await client.query("begin read only");
    const { rows } = await client.query("select k.token from commerce.api_key k join commerce.publishable_api_key_sales_channel l on l.publishable_key_id=k.id join commerce.store s on s.default_sales_channel_id=l.sales_channel_id where k.type='publishable' and k.title='Default Publishable API Key' and k.revoked_at is null and k.deleted_at is null and l.deleted_at is null and s.deleted_at is null");
    if (rows.length !== 1) throw new Error("Inspect the default sales-channel API key before configuring the storefront.");
    await client.query("rollback");
    const result = storefrontEnvironment(await readFile(file, "utf8"), rows[0].token, randomBytes(32).toString("hex"));
    if (result.added.length) await writeFile(file, result.content, { encoding: "utf8", mode: 0o600 });
    console.log(`Storefront environment: ${result.added.length} missing settings added; existing values preserved. Credentials were not printed.`);
  } finally { await client.end().catch(() => undefined); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run().catch(() => { console.error("Storefront configuration failed; inspect project connection and default key locally. Credentials were not printed."); process.exitCode = 1; });
