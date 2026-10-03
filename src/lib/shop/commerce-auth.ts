import "server-only";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { createClient } from "@/lib/supabase/server";
import { commerceClient, CommerceAuthorizationError, linkCommerceCustomer } from "./commerce-client";
import { z } from "zod";

export async function getCommerceCustomerSession() {
  const account = await getCurrentMemberAccount();
  if (!account?.profile || !account.privacyAccepted || !account.emailConfirmed || !z.string().email().safeParse(account.user.email).success) throw new CommerceAuthorizationError();
  // getCurrentMemberAccount has already verified the user with auth.getUser().
  const { data, error } = await (await createClient()).auth.getSession();
  if (error || !data.session || data.session.user.id !== account.user.id) throw new CommerceAuthorizationError();
  const request = commerceClient();
  const customer = await linkCommerceCustomer(data.session.access_token, request);
  return { ...customer, userId: account.user.id, email: z.string().email().parse(account.user.email), request };
}
