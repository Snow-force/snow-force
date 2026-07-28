"use server";

import { requireAdmin } from "@/lib/auth/admin";
import { createFAQ, updateFAQ } from "./repository";
import type { FAQItem } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { translateFAQToChinese } from "../admin/translate-content";

export async function saveFAQAction(data: FAQItem, isNew: boolean) {
  await requireAdmin();
  let savedData = data;
  let translationWarning = false;
  try {
    savedData = await translateFAQToChinese(data);
  } catch (error) {
    translationWarning = true;
    console.error("[saveFAQAction] Chinese translation failed", error);
  }

  if (isNew) {
    createFAQ(savedData);
  } else {
    updateFAQ(data.id, savedData);
  }

  revalidatePath("/admin/faq");
  return { success: true, translationWarning };
}
