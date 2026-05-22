import type { FAQItem } from "@/lib/types";
import { seedFAQs } from "./seed";

const faqs = [...seedFAQs];

export function getFAQs(): FAQItem[] {
  return [...faqs].sort((a, b) => a.order - b.order);
}

export function getFAQ(id: string): FAQItem | undefined {
  return faqs.find((f) => f.id === id);
}

export function createFAQ(faq: FAQItem): void {
  faqs.push(faq);
}

export function updateFAQ(id: string, data: Partial<FAQItem>): FAQItem | undefined {
  const idx = faqs.findIndex((f) => f.id === id);
  if (idx === -1) return undefined;
  faqs[idx] = { ...faqs[idx], ...data };
  return faqs[idx];
}

export function deleteFAQ(id: string): boolean {
  const idx = faqs.findIndex((f) => f.id === id);
  if (idx === -1) return false;
  faqs.splice(idx, 1);
  return true;
}
