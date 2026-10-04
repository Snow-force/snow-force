import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { AuthWorkflowEvents, Modules } from "@medusajs/framework/utils";
import { sendAdminReset } from "../lib/admin-password-reset";

type ResetEvent = { actor_type?: string; entity_id?: string; token?: string };
type Users = { listUsers: (filter: { email: string }, options: { take: number }) => Promise<{ email: string }[]> };

export default async function adminPasswordReset({ event, container }: SubscriberArgs<ResetEvent>) {
  if (event.data.actor_type !== "user") return; // Customer authentication remains Supabase-owned.
  if (typeof event.data.entity_id !== "string") throw new Error("Invalid admin password reset event");
  const users = await container.resolve<Users>(Modules.USER).listUsers({ email: event.data.entity_id }, { take: 2 });
  if (users.length !== 1 || users[0].email !== event.data.entity_id) return;
  await sendAdminReset(event.data, process.env);
}

export const config: SubscriberConfig = { event: AuthWorkflowEvents.PASSWORD_RESET, context: { subscriberId: "snowforce-admin-password-reset" } };
