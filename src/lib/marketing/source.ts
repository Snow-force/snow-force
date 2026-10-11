import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getEventAdmin } from "@/lib/events/repository";

export const sourceInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("directory") }),
  z.object({ action: z.literal("eligibility"), email: z.string().email() }),
  z.object({ action: z.literal("event"), slug: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(200) }),
  z.object({ action: z.literal("events") }),
]);
export function marketingSourceClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("Customer source is not configured.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export type MarketingContact = { email: string; sources: string[]; subscribed: boolean; optedOut: boolean };
export function mergeMarketingContacts(entries: { email: string; source: string; subscribed?: boolean; optedOut?: boolean }[]): MarketingContact[] {
  const contacts = new Map<string, MarketingContact>();
  for (const entry of entries) {
    const email = entry.email.trim().toLowerCase();
    if (!z.string().email().safeParse(email).success) continue;
    const contact = contacts.get(email) ?? { email, sources: [], subscribed: false, optedOut: false };
    contact.sources = [...new Set([...contact.sources, entry.source])];
    contact.subscribed ||= entry.subscribed === true;
    contact.optedOut ||= entry.optedOut === true;
    contacts.set(email, contact);
  }
  return [...contacts.values()];
}
export async function readMarketingSource(raw: unknown) {
  const input = sourceInput.parse(raw);
  if (input.action === "event") {
    const event = await getEventAdmin(input.slug);
    if (!event) throw new Error("Event not found.");
    return { source: { kind: "event", id: event.slug }, subject: event.title.en, preheader: `${event.eventDate} · ${event.activityLocation.en}`, heading: event.title.en, body: `${event.eventDate}\n${event.activityLocation.en}\n\n${event.seoDescription.en}`, image: event.coverImage, button: event.registrationState === "open" ? "View event and register" : "View event", path: `/events/${event.slug}`, publishable: event.status === "published" && !!event.eventDate && event.eventDate >= new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) };
  }
  const db = marketingSourceClient();
  if (input.action === "events") {
    const sources: { kind: string; id: string; title: string; status: string }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from("events").select("slug,title_en,status").neq("status", "archived").order("slug").range(offset, offset + 999);
      if (error) throw new Error("Unable to read event promotion sources.");
      const rows = z.array(z.object({ slug: z.string(), title_en: z.string(), status: z.string() })).parse(data);
      sources.push(...rows.map(row => ({ kind: "event", id: row.slug, title: row.title_en || row.slug, status: row.status })));
      if (rows.length < 1000) break;
    }
    return { sources };
  }
  const entries: { email: string; source: string; subscribed?: boolean; optedOut?: boolean }[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db.from("member_profiles").select("email,marketing_email_opt_in").order("id");
    if (input.action === "eligibility") query = query.ilike("email", input.email.replace(/[%_\\]/g, "\\$&"));
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw new Error("Unable to read marketing subscriptions.");
    const rows = z.array(z.object({ email: z.string(), marketing_email_opt_in: z.boolean().nullable() })).parse(data);
    entries.push(...rows.map(row => ({ email: row.email, source: "member", subscribed: row.marketing_email_opt_in === true, optedOut: row.marketing_email_opt_in === false })));
    if (rows.length < 1000) break;
  }
  if (input.action === "directory") for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("registrations").select("contact_email").order("id").range(offset, offset + 999);
    if (error) throw new Error("Unable to read registration contacts.");
    const rows = z.array(z.object({ contact_email: z.string() })).parse(data);
    entries.push(...rows.map(row => ({ email: row.contact_email, source: "event" })));
    if (rows.length < 1000) break;
  }
  return { contacts: mergeMarketingContacts(entries) };
}
