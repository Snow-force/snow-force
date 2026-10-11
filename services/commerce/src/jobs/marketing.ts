import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { processMarketing } from "../lib/marketing";

export default async function marketingJob(container: MedusaContainer) {
  if (process.env.MARKETING_ENABLED !== "true") return;
  try { await processMarketing(container); }
  catch { container.resolve(ContainerRegistrationKeys.LOGGER).error("Marketing worker unavailable; queued campaigns are retained."); }
}
export const config = { name: "snowforce-marketing", schedule: "* * * * *" };
