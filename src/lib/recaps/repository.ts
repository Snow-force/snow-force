import type { EventRecap } from "@/lib/types";
import { seedRecaps } from "./seed";

const recaps = [...seedRecaps];

export function getRecaps(): EventRecap[] {
  return recaps.filter((r) => r.status === "published");
}

export function getRecap(slug: string): EventRecap | undefined {
  return recaps.find((r) => r.slug === slug && r.status === "published");
}

export function getAllRecaps(): EventRecap[] {
  return [...recaps];
}

export function createRecap(recap: EventRecap): void {
  recaps.push(recap);
}

export function updateRecap(slug: string, data: Partial<EventRecap>): EventRecap | undefined {
  const idx = recaps.findIndex((r) => r.slug === slug);
  if (idx === -1) return undefined;
  recaps[idx] = { ...recaps[idx], ...data };
  return recaps[idx];
}
