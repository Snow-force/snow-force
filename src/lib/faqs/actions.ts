"use server";

import { requireAdmin } from "@/lib/auth/admin";
import { createFAQ, updateFAQ } from "./repository";
import type { FAQItem } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function saveFAQAction(data: FAQItem, isNew: boolean) {
  await requireAdmin();

  if (isNew) {
    createFAQ(data);
  } else {
    updateFAQ(data.id, data);
  }

  revalidatePath("/admin/faq");
  return { success: true };
}
