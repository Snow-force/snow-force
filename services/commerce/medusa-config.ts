import { defineConfig, loadEnv } from "@medusajs/framework/utils";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { isManagementMode } from "./src/lib/operating-mode";

loadEnv(process.env.NODE_ENV || "development", process.cwd());
// Medusa loads .env for development; our ignored operator file is explicit.
const developmentEnv = resolve(process.cwd(), ".env.development");
if ((process.env.NODE_ENV || "development") === "development" && existsSync(developmentEnv)) {
  process.loadEnvFile(developmentEnv);
}
const redisUrl = process.env.REDIS_URL;
// Railway private DNS is dual-stack. Every Redis client uses the same verified trust.
const redisOptions = {
  family: 0,
  ...(process.env.REDIS_CA_CERT ? { tls: { rejectUnauthorized: true, ca: process.env.REDIS_CA_CERT.replace(/\\n/g, "\n") } } : {}),
};
const production = process.env.NODE_ENV === "production";
const workerMode = process.env.MEDUSA_WORKER_MODE;
if (workerMode && !["shared", "server", "worker"].includes(workerMode)) throw new Error("Invalid commerce worker mode");

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseSchema: "commerce",
    databaseDriverOptions: {
      connection: {
        ssl: process.env.DATABASE_CA_CERT ? { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n") } : undefined,
      },
      pool: { min: 0, max: 5 },
    },
    redisUrl,
    redisOptions,
    workerMode: workerMode === "server" || workerMode === "worker" ? workerMode : "shared",
    http: {
      storeCors: process.env.STORE_CORS || "http://127.0.0.1:3100",
      adminCors: process.env.ADMIN_CORS || "http://127.0.0.1:9000",
      authCors: process.env.AUTH_CORS || "http://127.0.0.1:3100,http://127.0.0.1:9000",
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
      jwtExpiresIn: "15m",
      authMethodsPerActor: { customer: ["supabase"], user: ["emailpass"] },
    },
    cookieOptions: { secure: production, sameSite: "lax" },
  },
  admin: { disable: workerMode === "worker" },
  modules: [
    { resolve: "@medusajs/medusa/fulfillment", options: { providers: [
      { resolve: "@medusajs/medusa/fulfillment-manual", id: "manual" },
      { resolve: "./src/modules/snowforce-fulfillment", id: "snowforce" },
    ] } },
    {
      resolve: "@medusajs/medusa/auth",
      options: {
        providers: [
          { resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass" },
          { resolve: "./src/modules/supabase-auth", id: "supabase", options: { url: process.env.SUPABASE_URL, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY } },
        ],
      },
    },
    ...(redisUrl ? [
      { resolve: "@medusajs/medusa/caching", options: { providers: [{ resolve: "@medusajs/caching-redis", id: "caching-redis", is_default: true, options: { redisUrl, redisOptions } }] } },
      { resolve: "@medusajs/medusa/event-bus-redis", options: { redisUrl, redisOptions } },
      { resolve: "@medusajs/medusa/workflow-engine-redis", options: { redis: { redisUrl, redisOptions } } },
      { resolve: "@medusajs/medusa/locking", options: { providers: [{ resolve: "@medusajs/medusa/locking-redis", id: "locking-redis", is_default: true, options: { redisUrl, redisOptions } }] } },
    ] : []),
    ...(!isManagementMode() && process.env.COMMERCE_STRIPE_API_KEY ? [{
      resolve: "@medusajs/medusa/payment",
      options: { providers: [{ resolve: "./src/modules/snowforce-stripe", id: "stripe", options: { apiKey: process.env.COMMERCE_STRIPE_API_KEY, webhookSecret: process.env.COMMERCE_STRIPE_WEBHOOK_SECRET, automaticPaymentMethods: true, capture: false } }] },
    }] : []),
    ...(process.env.S3_ACCESS_KEY_ID ? [{
      resolve: "@medusajs/medusa/file",
      options: { providers: [{
        resolve: "@medusajs/medusa/file-s3", id: "s3",
        options: {
          file_url: process.env.S3_FILE_URL, access_key_id: process.env.S3_ACCESS_KEY_ID,
          secret_access_key: process.env.S3_SECRET_ACCESS_KEY, region: process.env.S3_REGION,
          bucket: process.env.S3_BUCKET, endpoint: process.env.S3_ENDPOINT,
          prefix: "products/", acl: false, additional_client_config: { forcePathStyle: true },
        },
      }] },
    }] : []),
  ],
});
