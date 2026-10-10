import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const projectRef = "bhmwxkynhyhquspiyact";

export function configurationErrors(env) {
  const errors = [];
  const management = env.COMMERCE_OPERATING_MODE === "management";
  if (env.COMMERCE_REFUND_EXECUTION_ENABLED && !["true", "false"].includes(env.COMMERCE_REFUND_EXECUTION_ENABLED)) errors.push("COMMERCE_REFUND_EXECUTION_ENABLED must be true or false.");
  if (env.COMMERCE_REFUND_EXECUTION_ENABLED === "true") {
    if (env.COMMERCE_OPERATING_MODE !== "sales") errors.push("Refund execution requires sales mode.");
    if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(env.COMMERCE_STRIPE_API_KEY ?? "") || !/^whsec_[A-Za-z0-9]+$/.test(env.COMMERCE_STRIPE_WEBHOOK_SECRET ?? "")) errors.push("Refund execution requires dedicated Stripe server and webhook credentials.");
  }
  if (env.COMMERCE_OPERATING_MODE && !["management", "sales"].includes(env.COMMERCE_OPERATING_MODE)) errors.push("COMMERCE_OPERATING_MODE must be management or sales.");
  if (env.NODE_ENV === "production" && !["management", "sales"].includes(env.COMMERCE_OPERATING_MODE)) errors.push("Production requires an explicit COMMERCE_OPERATING_MODE.");
  if (management && env.COMMERCE_TAX_POLICY_CONFIRMED !== "false") errors.push("Management mode requires COMMERCE_TAX_POLICY_CONFIRMED=false; payments stay disabled.");
  let database;
  try { database = new URL(env.DATABASE_URL); } catch { errors.push("DATABASE_URL is required."); }
  if (database) {
    const pooler = database.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(database.username).endsWith(`.${projectRef}`);
    if (!["postgres:", "postgresql:"].includes(database.protocol) ||
        (database.hostname !== `db.${projectRef}.supabase.co` && !pooler) || database.pathname !== "/postgres") {
      errors.push("DATABASE_URL must use the existing SnowForce Supabase postgres database.");
    }
    if (database.port && database.port !== "5432") errors.push("Use a direct connection or the session pooler on port 5432.");
    if (/^(postgres|supabase_admin)(\.|$)/.test(decodeURIComponent(database.username))) errors.push("Use a dedicated commerce database role.");
    if (!database.password) errors.push("The commerce database role needs a password.");
  }
  if (env.DATABASE_SCHEMA !== "commerce") errors.push("DATABASE_SCHEMA must be commerce.");
  if (env.SUPABASE_URL !== `https://${projectRef}.supabase.co`) errors.push("SUPABASE_URL must use the existing SnowForce Auth project.");
  if (!env.SUPABASE_PUBLISHABLE_KEY) errors.push("SUPABASE_PUBLISHABLE_KEY is required.");
  for (const key of ["JWT_SECRET", "COOKIE_SECRET"]) {
    if (!env[key] || env[key].length < 32 || /^(change|example|replace|supersecret)/i.test(env[key])) errors.push(`${key} needs an independently generated secret of at least 32 characters.`);
  }
  if (env.JWT_SECRET && env.JWT_SECRET === env.COOKIE_SECRET) errors.push("JWT_SECRET and COOKIE_SECRET must be different.");
  if (!["server", "worker", "shared"].includes(env.MEDUSA_WORKER_MODE ?? "shared")) errors.push("MEDUSA_WORKER_MODE is invalid.");
  for (const key of ["STORE_CORS", "ADMIN_CORS", "AUTH_CORS"]) {
    if (!env[key] || env[key].split(",").some((origin) => {
      try { const url = new URL(origin); return !["http:", "https:"].includes(url.protocol) || url.origin !== origin || origin.includes("*") || (env.NODE_ENV === "production" && url.protocol !== "https:"); }
      catch { return true; }
    })) errors.push(`${key} needs explicit trusted origins.`);
  }
  if (env.NODE_ENV === "production") {
    try { if (new URL(env.REDIS_URL).protocol !== "rediss:") throw new Error(); }
    catch { errors.push("Production requires a TLS Redis service (REDIS_URL)."); }
    if (!env.DATABASE_CA_CERT) errors.push("Production requires DATABASE_CA_CERT with certificate verification enabled.");
  }
  const stripeKey = env.COMMERCE_STRIPE_API_KEY;
  if (env.NODE_ENV === "production" && !management && !stripeKey) errors.push("Sales mode requires the configured commerce Stripe provider; manual test payments are not a launch configuration.");
  if (env.NODE_ENV === "production" && !management && env.COMMERCE_TAX_POLICY_CONFIRMED !== "true") errors.push("Confirm the actual US sales-tax configuration before enabling production checkout.");
  if (env.NODE_ENV === "production" || env.COMMERCE_ORDER_SYNC_SECRET || env.SNOWFORCE_STOREFRONT_URL) {
    if (!env.COMMERCE_ORDER_SYNC_SECRET || env.COMMERCE_ORDER_SYNC_SECRET.length < 32 || [env.JWT_SECRET, env.COOKIE_SECRET].includes(env.COMMERCE_ORDER_SYNC_SECRET)) errors.push("Configure an independent COMMERCE_ORDER_SYNC_SECRET in both backend and storefront.");
    try {
      const url = new URL(env.SNOWFORCE_STOREFRONT_URL);
      const validProtocol = url.protocol === "https:" || (env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol === "http:");
      if (url.origin !== env.SNOWFORCE_STOREFRONT_URL || url.username || url.password || !validProtocol) throw new Error();
    } catch { errors.push("SNOWFORCE_STOREFRONT_URL must be the trusted storefront origin (HTTPS in production)."); }
  }
  if (stripeKey && !/^(sk|rk)_(test|live)_/.test(stripeKey)) errors.push("COMMERCE_STRIPE_API_KEY is invalid.");
  if (stripeKey && !env.COMMERCE_STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) errors.push("Configure the dedicated commerce Stripe webhook secret.");
  if (env.NODE_ENV === "production" || env.S3_ACCESS_KEY_ID || env.S3_SECRET_ACCESS_KEY) {
    if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) errors.push("Configure both server-only S3 access credentials for durable product uploads.");
    if (env.S3_BUCKET !== "shop-products" || env.S3_REGION !== "us-east-2") errors.push("Use the existing project's shop-products bucket and us-east-2 region.");
    if (![ `https://${projectRef}.storage.supabase.co/storage/v1/s3`, `https://${projectRef}.supabase.co/storage/v1/s3` ].includes(env.S3_ENDPOINT)) errors.push("S3_ENDPOINT must use the existing Supabase project.");
    if (env.S3_FILE_URL !== `https://${projectRef}.supabase.co/storage/v1/object/public/shop-products`) errors.push("S3_FILE_URL must use the public product bucket.");
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const environmentFile = `.env.${process.env.NODE_ENV ?? "development"}`;
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
  const errors = configurationErrors(process.env);
  if (errors.length) {
    console.error("Commerce startup stopped; no database changes were attempted:\n" + errors.map((error) => `- ${error}`).join("\n"));
    process.exitCode = 1;
  } else console.log("Commerce configuration passed. Credentials are not printed.");
}
