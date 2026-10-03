import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const role = "snowforce_commerce";
const projectRef = "bhmwxkynhyhquspiyact";

export function commerceConnectionString(bootstrapUrl, password) {
  const url = new URL(bootstrapUrl);
  const pooled = url.hostname.endsWith(".pooler.supabase.com");
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.pathname !== "/postgres" ||
      (url.hostname !== `db.${projectRef}.supabase.co` && !(pooled && url.username === `postgres.${projectRef}`)) ||
      (url.port && url.port !== "5432")) throw new Error("Use the existing Supabase direct or session-pooler connection.");
  if (!url.password || decodeURIComponent(url.password).includes("[YOUR-PASSWORD]")) throw new Error("Replace the database-password placeholder locally.");
  url.username = pooled ? `${role}.${projectRef}` : role;
  url.password = password;
  return url.toString();
}

async function configureDatabase() {
  const rootEnv = resolve("../../.env.local");
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  const bootstrapUrl = process.env.SUPABASE_BOOTSTRAP_DATABASE_URL;
  if (!bootstrapUrl) throw new Error("Add SUPABASE_BOOTSTRAP_DATABASE_URL to the protected root .env.local file.");
  if (existsSync(".env.development")) throw new Error("Existing commerce environment preserved. Configure credentials manually rather than overwrite it.");
  const password = randomBytes(32).toString("hex");
  const databaseUrl = commerceConnectionString(bootstrapUrl, password);
  const require = createRequire(import.meta.url);
  const { Client } = require("pg");
  const client = new Client({ connectionString: bootstrapUrl, connectionTimeoutMillis: 10_000, ssl: { rejectUnauthorized: true, ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n") } : {}) } });
  try {
    await client.connect();
    const { rows } = await client.query("select r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolcanlogin, n.nspname from pg_roles r join pg_namespace n on n.nspowner=r.oid where r.rolname=$1 and n.nspname='commerce'", [role]);
    const existing = rows[0];
    if (!existing || existing.rolsuper || existing.rolcreaterole || existing.rolcreatedb || existing.rolbypassrls || existing.rolcanlogin) throw new Error("Apply the reviewed commerce foundation migration first; existing active roles are never rotated by this helper.");
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!publicKey) throw new Error("Existing Supabase publishable configuration is missing.");
    const example = await readFile(".env.example", "utf8");
    const replacements = { DATABASE_URL: databaseUrl, SUPABASE_PUBLISHABLE_KEY: publicKey, DATABASE_CA_CERT: process.env.DATABASE_CA_CERT || "", JWT_SECRET: randomBytes(32).toString("hex"), COOKIE_SECRET: randomBytes(32).toString("hex"), SNOWFORCE_DRAFT_MANIFEST: "./draft-products.json" };
    const output = example.replace(/^([A-Z_]+)=.*$/gm, (line, key) => key in replacements ? `${key}=${replacements[key]}` : line);
    await client.query("begin");
    // Password contains only generated hex. It is never logged or passed on the command line.
    await client.query(`alter role snowforce_commerce login password '${password}'`);
    await writeFile(".env.development", output, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await client.query("commit");
    console.log("Dedicated commerce connection saved to the ignored .env.development file. No password was printed.");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error instanceof Error && !('code' in error)) throw error;
    throw new Error("Database configuration failed. Verify connection, password, network and CA certificate locally; credentials are not printed.");
  } finally { await client.end().catch(() => undefined); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  configureDatabase().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
