import "server-only";
import { z } from "zod";
import { commerceClient } from "./commerce-client";
import { newcomerPolicySchema } from "./newcomer-contract";
export async function getNewcomerPolicy() {
  if ((process.env.NEWCOMER_SIGNING_SECRET?.length ?? 0) < 32) return null;
  try { return (await commerceClient()("/store/snowforce/newcomer", z.object({ policy: newcomerPolicySchema.nullable() }))).policy; }
  catch { return null; }
}
