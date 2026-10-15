import "server-only";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { createClient } from "@/lib/supabase/server";
import { commerceClient, CommerceAuthorizationError, linkCommerceCustomer } from "./commerce-client";
import { z } from "zod";

export async function getCommerceCustomerSession() {
  const account = await getCurrentMemberAccount();
  if (!account?.profile || !account.privacyAccepted || !account.emailConfirmed || !z.string().email().safeParse(account.user.email).success) throw new CommerceAuthorizationError();
  const client = await createClient();
  // Session storage supplies only the credential. Revalidate that exact token;
  // the serialized session.user object is not an authorization source.
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) throw new CommerceAuthorizationError();
  const verified = await client.auth.getUser(data.session.access_token);
  if (verified.error || !verified.data.user?.email_confirmed_at || verified.data.user.id !== account.user.id || verified.data.user.email !== account.user.email) throw new CommerceAuthorizationError();
  const request = commerceClient();
  const customer = await linkCommerceCustomer(data.session.access_token, request);
  return { ...customer, userId: account.user.id, createdAt: account.user.created_at, email: z.string().email().parse(account.user.email), request };
}
