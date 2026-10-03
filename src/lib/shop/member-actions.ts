"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { parseShippingAddressForm } from "./shipping-addresses";
import { shippingAddressRepository } from "./shipping-address-repository";

export type AddressActionResult = { success: boolean; error?: "auth" | "verification" | "validation" | "save" | "delete"; fields?: string[] };

async function addressAccount() {
  const account = await getCurrentMemberAccount();
  if (!account?.profile || !account.privacyAccepted) return { error: "auth" as const };
  if (!account.emailConfirmed) return { error: "verification" as const };
  return { userId: account.user.id };
}

export async function saveShippingAddressAction(form: FormData): Promise<AddressActionResult> {
  const account = await addressAccount();
  if ("error" in account) return { success: false, error: account.error };
  const input = parseShippingAddressForm(form);
  if (!input.success) return { success: false, error: "validation", fields: Array.from(new Set(input.error.issues.map((issue) => String(issue.path[0])))) };
  const saved = await shippingAddressRepository.save(account.userId, input.data);
  if (!saved) return { success: false, error: "save" };
  revalidatePath("/member/addresses");
  revalidatePath("/member");
  return { success: true };
}

export async function deleteShippingAddressAction(id: string): Promise<AddressActionResult> {
  const account = await addressAccount();
  if ("error" in account) return { success: false, error: account.error };
  if (!await shippingAddressRepository.remove(account.userId, id)) return { success: false, error: "delete" };
  revalidatePath("/member/addresses");
  revalidatePath("/member");
  return { success: true };
}
