import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CURRENT_PRIVACY_POLICY_VERSION, PRIVACY_CONSENT_TYPE } from "@/lib/members/member-consent-policy";

const readJson = (file: string) => JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8"));
describe("cross-service commerce contracts", () => {
  it("keeps the backend's required privacy consent aligned with the existing website", () => {
    expect(readJson("services/commerce/src/lib/member-policy.json")).toEqual({ policy_version: CURRENT_PRIVACY_POLICY_VERSION, consent_type: PRIVACY_CONSENT_TYPE });
  });
  it("keeps the independent backend out of the Next compilation and test runtime", () => {
    expect(readJson("tsconfig.json").exclude).toContain("services/commerce");
    const backend = readJson("services/commerce/package.json");
    const lock = readJson("services/commerce/package-lock.json");
    for (const name of ["@medusajs/framework", "@medusajs/medusa", "@medusajs/cli", "@medusajs/dashboard"]) expect(lock.packages[`node_modules/${name}`].version).toBe(backend.dependencies[name]);
  });
  it("documents the private order bridge on both servers without publishing the signing secret", () => {
    const website = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    const backend = readFileSync(resolve(process.cwd(), "services/commerce/.env.example"), "utf8");
    expect(website).toMatch(/^COMMERCE_ORDER_SYNC_SECRET=$/m);
    expect(backend).toMatch(/^COMMERCE_ORDER_SYNC_SECRET=$/m);
    expect(backend).toMatch(/^SNOWFORCE_STOREFRONT_URL=http:\/\/127\.0\.0\.1:3100$/m);
    expect(website).not.toContain("NEXT_PUBLIC_COMMERCE_ORDER_SYNC_SECRET");
    expect(backend).not.toMatch(/^SUPABASE_(SECRET|SERVICE_ROLE)_KEY=/m);
  });
});
