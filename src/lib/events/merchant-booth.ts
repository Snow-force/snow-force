import type { Event } from "@/lib/types";

export function isMerchantBoothEventEligible(event: Event): boolean {
  const program = event.merchantBoothProgram;
  return Boolean(
    event.status === "published" &&
      program?.enabled &&
      program.plans.some((plan) => program.booths.some((booth) => booth.boothPlanId === plan.id)),
  );
}
