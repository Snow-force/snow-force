import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { processNewcomerEmails } from "../lib/newcomer-email";

export default async function newcomerEmailJob(container: MedusaContainer) {
  if (process.env.NEWCOMER_EMAIL_ENABLED !== "true") return;
  try { await processNewcomerEmails(container); }
  catch { container.resolve(ContainerRegistrationKeys.LOGGER).error("Welcome email worker unavailable; queued messages are retained."); }
}
export const config = { name: "snowforce-newcomer-emails", schedule: "* * * * *" };
