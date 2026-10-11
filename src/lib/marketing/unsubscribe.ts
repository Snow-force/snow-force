import "server-only";
import { marketingRequest } from "./client";
import { marketingSourceClient } from "./source";
import { z } from "zod";
export async function unsubscribeMarketingCustomer(token: string) {
  // The commerce service verifies the token and suppresses both surfaces first.
  await marketingRequest({ kind: "unsubscribe", token });
  const email = z.string().email().parse(Buffer.from(token.split(".")[0], "base64url").toString());
  const { error } = await marketingSourceClient().from("member_profiles").update({ marketing_email_opt_in: false }).ilike("email", email.replace(/[%_\\]/g, "\\$&"));
  if (error) throw new Error("Preference update needs retry.");
}
