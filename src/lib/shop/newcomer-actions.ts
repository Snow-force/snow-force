"use server";
import { getCommerceCustomerSession } from "./commerce-auth";
import { CommerceAuthorizationError } from "./commerce-client";
import { signMarketing } from "@/lib/marketing/protocol";
import { newcomerResultSchema, type NewcomerResult } from "./newcomer-contract";
export async function claimNewcomerAction(): Promise<NewcomerResult> {
  try {
    const customer = await getCommerceCustomerSession();
    const body = signMarketing({ kind: "newcomer", userId: customer.userId, email: customer.email, createdAt: new Date(customer.createdAt).toISOString() }, process.env.NEWCOMER_SIGNING_SECRET ?? "");
    return await customer.request("/store/snowforce/newcomer", newcomerResultSchema, { token: customer.token, method: "POST", body });
  } catch (error) { return { status: error instanceof CommerceAuthorizationError ? "signed-out" : "unavailable" }; }
}
