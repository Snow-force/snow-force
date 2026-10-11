import { createHash, randomUUID } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { applyNewcomerEmailEvents } from "./newcomer-email";
import { classifyContact, contactSchema, deliverMarketing, marketingCommand, marketingContent, marketingOrigin, marketingSource, renderMarketing, signMarketing, unsubscribeToken, verifyUnsubscribe } from "./marketing-policy";

const dbFor = (scope: MedusaContainer) => scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
const campaignSchema = z.object({ id: z.uuid(), surface: z.enum(["event", "shop"]), source: marketingSource, source_fingerprint: z.string(), content: marketingContent, version: z.number().int(), status: z.string(), send_key: z.string().nullable(), audience: z.unknown().nullable(), created_at: z.coerce.date(), sent_at: z.coerce.date().nullable() });
const sourceFingerprint = (content: z.infer<typeof marketingContent>) => createHash("sha256").update(JSON.stringify(marketingContent.parse(content))).digest("hex");
type Campaign = z.infer<typeof campaignSchema>;
const conflict = () => new MedusaError(MedusaError.Types.CONFLICT, "Refresh the draft and audience before sending.");
function configuration() {
  if (process.env.MARKETING_ENABLED !== "true") throw new Error("Marketing delivery is disabled.");
  const origin = marketingOrigin(process.env.SNOWFORCE_STOREFRONT_URL ?? "");
  const from = process.env.MARKETING_EMAIL_FROM ?? "", reply = process.env.MARKETING_REPLY_TO ?? "", address = process.env.MARKETING_POSTAL_ADDRESS ?? "";
  const key = process.env.MARKETING_RESEND_API_KEY ?? "", secret = process.env.MARKETING_UNSUBSCRIBE_SECRET ?? "";
  const rate = Number(process.env.MARKETING_SENDS_PER_MINUTE ?? "30");
  if (!key || secret.length < 32 || !address.trim() || !z.email().safeParse(reply).success || !/^[^\r\n]+<[^<>\s]+@[^<>\s]+>$/.test(from) || from.includes("resend.dev") || !Number.isInteger(rate) || rate < 1 || rate > 120) throw new Error("Marketing sender, address, delivery rate or credentials are not configured.");
  return { origin, from, reply, address, key, secret, rate };
}
async function websiteSource(payload: unknown) {
  const origin = marketingOrigin(process.env.SNOWFORCE_STOREFRONT_URL ?? "");
  const response = await fetch(`${origin}/api/marketing/source`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(30000), headers: { "Content-Type": "application/json" }, body: JSON.stringify(signMarketing(payload, process.env.MARKETING_INTERNAL_SECRET ?? "")) });
  if (!response.ok) throw new Error("Website marketing source unavailable.");
  return response.json() as Promise<unknown>;
}
export async function sourceDraft(scope: MedusaContainer, source: z.infer<typeof marketingSource>) {
  const origin = marketingOrigin(process.env.SNOWFORCE_STOREFRONT_URL ?? "");
  if (source.kind === "event") {
    const result = z.object({ source: marketingSource, subject: z.string(), preheader: z.string(), heading: z.string(), body: z.string(), image: z.string(), button: z.string(), path: z.string(), publishable: z.boolean() }).parse(await websiteSource({ action: "event", slug: source.id }));
    const { publishable, source: _source, ...content } = result;
    return { publishable, content: marketingContent.parse({ ...content, image: content.image ? new URL(content.image, origin).href : "" }) };
  }
  const db = dbFor(scope);
  if (source.kind === "product") {
    const row = z.object({ title: z.string(), handle: z.string(), description: z.string().nullable(), thumbnail: z.string().nullable(), status: z.string() }).parse((await db.raw("select title,handle,description,thumbnail,status from commerce.product where id=? and deleted_at is null", [source.id])).rows[0]);
    return { publishable: row.status === "published", content: marketingContent.parse({ subject: row.title, preheader: "Discover gear from SnowForce", heading: row.title, body: row.description || "Explore this product in the SnowForce shop.", image: row.thumbnail ? new URL(row.thumbnail, origin).href : "", button: "Shop now", path: `/shop/${encodeURIComponent(row.handle)}` }) };
  }
  let collectionId = source.id, code = "";
  let offerActive = true;
  if (source.kind === "promotion") {
    const promotion = z.object({ code: z.string(), active: z.boolean() }).parse((await db.raw("select p.code,(p.status='active' and (p.limit is null or p.used<p.limit) and (p.campaign_id is null or cam.id is not null) and (cam.starts_at is null or cam.starts_at<=clock_timestamp()) and (cam.ends_at is null or cam.ends_at>clock_timestamp()) and (b.id is null or b.attribute is not null or b.limit is null or b.used<b.limit)) as active from commerce.promotion p left join commerce.promotion_campaign cam on cam.id=p.campaign_id and cam.deleted_at is null left join commerce.promotion_campaign_budget b on b.campaign_id=cam.id and b.deleted_at is null where p.id=? and p.deleted_at is null", [source.id])).rows[0]);
    code = promotion.code; offerActive = promotion.active;
    const linked = z.array(z.object({ id: z.string() })).parse((await db.raw("select id from commerce.product_collection where metadata->>'snowforce_promotion_code'=? and deleted_at is null order by id limit 1", [code])).rows);
    if (!linked.length) return { publishable: offerActive, content: marketingContent.parse({ subject: `SnowForce offer · ${code}`, preheader: "Discover offers from SnowForce", heading: "Your next mountain adventure starts here", body: `Explore SnowForce gear with promotion code ${code}.\n\nEligibility, restrictions and final savings are confirmed in your cart.`, image: "", button: "Shop SnowForce", path: "/shop/sale" }) };
    collectionId = linked[0].id;
  }
  const row = z.object({ title: z.string(), handle: z.string(), metadata: z.record(z.string(), z.unknown()).nullable(), published: z.boolean() }).parse((await db.raw("select c.title,c.handle,c.metadata,exists(select 1 from commerce.product p where p.collection_id=c.id and p.status='published' and p.deleted_at is null) as published from commerce.product_collection c where c.id=? and c.deleted_at is null", [collectionId])).rows[0]);
  const visible = row.metadata?.snowforce_navigation_section !== "hidden";
  const image = typeof row.metadata?.snowforce_image === "string" ? row.metadata.snowforce_image : "";
  return { publishable: visible && row.published && offerActive, content: marketingContent.parse({ subject: code ? `${row.title} · ${code}` : row.title, preheader: "Discover offers from SnowForce", heading: row.title, body: code ? `Explore ${row.title} with promotion code ${code}.\n\nEligibility, restrictions and final savings are confirmed in your cart.` : `Explore ${row.title} in the SnowForce shop.`, image: image ? new URL(image, origin).href : "", button: "Explore the collection", path: `/shop/collections/${encodeURIComponent(row.handle)}` }) };
}
async function audience(scope: MedusaContainer) {
  const db = dbFor(scope);
  const { contacts } = z.object({ contacts: z.array(contactSchema) }).parse(await websiteSource({ action: "directory" }));
  const map = new Map(contacts.map(contact => [contact.email, contact]));
  for (const row of z.array(z.object({ email: z.string().nullable() })).parse((await db.raw("select email from commerce.customer where deleted_at is null")).rows)) {
    const email = row.email?.trim().toLowerCase();
    if (!email || !z.email().safeParse(email).success) continue;
    const contact = map.get(email) ?? { email, sources: [], subscribed: false, optedOut: false };
    contact.sources = [...new Set([...contact.sources, "shop"])]; map.set(email, contact);
  }
  const suppressions = new Set(z.array(z.object({ email: z.string() })).parse((await db.raw("select email from commerce.snowforce_marketing_suppressions")).rows).map(row => row.email));
  const eligible = [...map.values()].filter(contact => classifyContact(contact, suppressions.has(contact.email)) === "eligible").sort((a, b) => a.email.localeCompare(b.email));
  const suppressed = [...map.values()].filter(contact => classifyContact(contact, suppressions.has(contact.email)) === "suppressed").length;
  const counts = { total: map.size, eligible: eligible.length, suppressed, pending: map.size - eligible.length - suppressed };
  return { eligible, counts, hash: createHash("sha256").update(JSON.stringify(eligible)).digest("hex") };
}
async function readCampaign(db: TaxQuoteConnection, id: string, surface: string, lock = false) {
  const row = (await db.raw(`select * from commerce.snowforce_marketing_campaigns where id=? and surface=?${lock ? " for update" : ""}`, [id, surface])).rows[0];
  if (!row) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Campaign not found.");
  return campaignSchema.parse(row);
}
async function campaignResult(db: TaxQuoteConnection, campaign: Campaign) {
  const stats = z.array(z.object({ status: z.string(), count: z.coerce.number() })).parse((await db.raw("select status,count(*) as count from commerce.snowforce_marketing_recipients where campaign_id=? group by status", [campaign.id])).rows);
  const failures = z.array(z.object({ email: z.string(), status: z.string(), error_code: z.string().nullable() })).parse((await db.raw("select email,status,error_code from commerce.snowforce_marketing_recipients where campaign_id=? and status in ('failed','attention','bounced','complained') order by email limit 100", [campaign.id])).rows);
  return { campaign, stats, failures };
}
function message(campaign: Campaign, email: string, test = false) {
  const config = configuration();
  const unsub = `${config.origin}/marketing/unsubscribe?token=${encodeURIComponent(unsubscribeToken(email, config.secret))}`;
  const content = renderMarketing(campaign.content, config.origin, config.address, unsub);
  return { from: config.from, reply_to: config.reply, to: [email], subject: `${test ? "[TEST] " : ""}${campaign.content.subject}`, ...content, headers: { "List-Unsubscribe": `<${unsub.replace("/marketing/unsubscribe?", "/api/marketing/unsubscribe?")}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}
export async function marketingOperation(scope: MedusaContainer, surface: "event" | "shop", actor: string, raw: unknown) {
  if (!actor) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Authentication required.");
  const parsed = marketingCommand.safeParse(raw);
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter valid campaign details.");
  const input = parsed.data, db = dbFor(scope);
  if (input.action === "sources") {
    const schema = z.object({ sources: z.array(z.object({ kind: z.string(), id: z.string(), title: z.string(), status: z.string() })) });
    if (surface === "event") return schema.parse(await websiteSource({ action: "events" }));
    const result = await db.raw("select 'product' as kind,id,title,status from commerce.product where deleted_at is null union all select 'collection' as kind,id,title,'collection' as status from commerce.product_collection where deleted_at is null union all select 'promotion' as kind,id,code as title,status from commerce.promotion where deleted_at is null order by kind,title,id");
    return schema.parse({ sources: result.rows });
  }
  if (input.action === "list") {
    const campaigns = z.array(campaignSchema).parse((await db.raw("select * from commerce.snowforce_marketing_campaigns where surface=? order by created_at desc limit 100", [surface])).rows);
    let ready = true; try { configuration(); } catch { ready = false; }
    return { campaigns, ready };
  }
  if (input.action === "create") {
    if ((surface === "event") !== (input.source.kind === "event")) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Wrong promotion surface.");
    const draft = await sourceDraft(scope, input.source), id = input.requestKey;
    await db.raw("insert into commerce.snowforce_marketing_campaigns(id,surface,source,source_fingerprint,content,created_by) values(?,?,?::jsonb,?,?::jsonb,?) on conflict(id) do nothing", [id, surface, JSON.stringify(input.source), sourceFingerprint(draft.content), JSON.stringify(draft.content), actor]);
    const created = await readCampaign(db, id, surface);
    if (JSON.stringify(created.source) !== JSON.stringify(input.source)) throw conflict();
    return campaignResult(db, created);
  }
  const campaign = await readCampaign(db, input.id, surface);
  if (input.action === "get") return campaignResult(db, campaign);
  if (input.action === "copy") {
    const id = input.requestKey;
    if (id === campaign.id) throw conflict();
    await db.raw("insert into commerce.snowforce_marketing_campaigns(id,surface,source,source_fingerprint,content,created_by) values(?,?,?::jsonb,?,?::jsonb,?) on conflict(id) do nothing", [id, surface, JSON.stringify(campaign.source), campaign.source_fingerprint, JSON.stringify(campaign.content), actor]);
    return campaignResult(db, await readCampaign(db, id, surface));
  }
  if (input.action === "send" && campaign.send_key === input.requestKey) return campaignResult(db, campaign);
  if (campaign.status !== "draft" || campaign.version !== input.version) throw conflict();
  if (input.action === "save") {
    if (surface === "event" && !input.content.path.startsWith("/events/") || surface === "shop" && !input.content.path.startsWith("/shop/")) throw conflict();
    const rows = await db.raw("update commerce.snowforce_marketing_campaigns set content=?::jsonb,version=version+1,test_version=null where id=? and status='draft' and version=? returning *", [JSON.stringify(input.content), campaign.id, input.version]);
    if (!rows.rows.length) throw conflict();
    return campaignResult(db, campaignSchema.parse(rows.rows[0]));
  }
  if (input.action === "preview") {
    const origin = marketingOrigin(process.env.SNOWFORCE_STOREFRONT_URL ?? ""), recipients = await audience(scope);
    const source = await sourceDraft(scope, campaign.source);
    return { ...await campaignResult(db, campaign), counts: recipients.counts, audienceHash: recipients.hash, publishable: source.publishable && campaign.source_fingerprint === sourceFingerprint(source.content), preview: renderMarketing(campaign.content, origin, process.env.MARKETING_POSTAL_ADDRESS || "Postal address — configure before sending", "#unsubscribe-preview") };
  }
  if (input.action === "test") {
    const config = configuration();
    const result = await deliverMarketing(message(campaign, input.email, true), `marketing-test/${campaign.id}/${campaign.version}/${createHash("sha256").update(input.email).digest("hex")}`, config.key);
    if (result.status !== "accepted") throw new MedusaError(MedusaError.Types.CONFLICT, "Test delivery is unconfirmed. Retry this version and address.");
    await db.raw("update commerce.snowforce_marketing_campaigns set test_version=? where id=? and version=? and status='draft'", [campaign.version, campaign.id, campaign.version]);
    return { accepted: true };
  }
  configuration();
  const source = await sourceDraft(scope, campaign.source);
  if (!source.publishable || campaign.content.path !== source.content.path || campaign.source_fingerprint !== sourceFingerprint(source.content)) throw new MedusaError(MedusaError.Types.CONFLICT, "Source must be public and unchanged; regenerate the draft after source changes.");
  const recipients = await audience(scope);
  if (!recipients.eligible.length || recipients.hash !== input.audienceHash) throw conflict();
  return db.transaction(async tx => {
    const current = await readCampaign(tx, campaign.id, surface, true);
    if (current.send_key === input.requestKey) return campaignResult(tx, current);
    if (current.status !== "draft" || current.version !== input.version) throw conflict();
    for (const contact of recipients.eligible) await tx.raw("insert into commerce.snowforce_marketing_recipients(id,campaign_id,email,sources) values(?,?,?,?::jsonb)", [randomUUID(), campaign.id, contact.email, JSON.stringify(contact.sources)]);
    const row = (await tx.raw("update commerce.snowforce_marketing_campaigns set status='queued',send_key=?,audience=?::jsonb,sent_at=now() where id=? returning *", [input.requestKey, JSON.stringify(recipients.counts), campaign.id])).rows[0];
    return campaignResult(tx, campaignSchema.parse(row));
  });
}
export async function unsubscribeMarketing(scope: MedusaContainer, token: string) {
  const email = verifyUnsubscribe(token, process.env.MARKETING_UNSUBSCRIBE_SECRET ?? "");
  await dbFor(scope).raw("insert into commerce.snowforce_marketing_suppressions(email,reason) values(?,'unsubscribed') on conflict(email) do nothing", [email]);
  return { unsubscribed: true };
}
export async function marketingPreference(scope: MedusaContainer, email: string, optIn: boolean) {
  const normalized = z.email().parse(email.trim().toLowerCase());
  if (optIn) await dbFor(scope).raw("delete from commerce.snowforce_marketing_suppressions where email=? and reason='unsubscribed'", [normalized]);
  else await dbFor(scope).raw("insert into commerce.snowforce_marketing_suppressions(email,reason) values(?,'unsubscribed') on conflict(email) do nothing", [normalized]);
  return { saved: true };
}
export async function marketingWebhook(scope: MedusaContainer, raw: unknown) {
  const event = z.object({ id: z.string().min(1).max(200), type: z.string(), emailId: z.string().min(1).max(200), bounceType: z.enum(["Permanent", "Transient", "Undetermined"]).optional() }).parse(raw);
  const statuses: Record<string, string> = { "email.delivered": "delivered", "email.bounced": "bounced", "email.complained": "complained", "email.failed": "failed" };
  const status = event.type === "email.bounced" && event.bounceType !== "Permanent" ? "soft_bounced" : statuses[event.type]; if (!status) return { received: true };
  const db = dbFor(scope);
  await db.raw("insert into commerce.snowforce_marketing_events(id,email_id,type) values(?,?,?) on conflict do nothing", [event.id, event.emailId, status]);
  await applyMarketingEvents(db);
  if (process.env.NEWCOMER_EMAIL_ENABLED === "true") await applyNewcomerEmailEvents(db);
  return { received: true };
}
async function applyMarketingEvents(db: TaxQuoteConnection) {
  await db.transaction(async tx => {
    const events = z.array(z.object({ id: z.string(), recipient_id: z.uuid(), email: z.string(), type: z.string() })).parse((await tx.raw("select e.id,r.id as recipient_id,r.email,e.type from commerce.snowforce_marketing_events e join commerce.snowforce_marketing_recipients r on r.provider_id=e.email_id where not e.processed order by e.created_at for update of e,r skip locked limit 500")).rows);
    for (const event of events) {
      if (event.type === "soft_bounced") {
        await tx.raw("update commerce.snowforce_marketing_recipients set status='failed',error_code='transient_or_undetermined_bounce' where id=? and status not in ('delivered','bounced','complained')", [event.recipient_id]);
        await tx.raw("update commerce.snowforce_marketing_events set processed=true where id=?", [event.id]);
        continue;
      }
      // Delivery callbacks cannot undo a complaint, bounce or failure.
      await tx.raw("update commerce.snowforce_marketing_recipients set status=?,error_code=null where id=? and (status not in ('failed','bounced','complained') or (status='failed' and error_code='transient_or_undetermined_bounce' and ?='delivered') or ? in ('bounced','complained'))", [event.type, event.recipient_id, event.type, event.type]);
      if (event.type === "bounced" || event.type === "complained") await tx.raw("insert into commerce.snowforce_marketing_suppressions(email,reason) values(?,?) on conflict(email) do update set reason=excluded.reason", [event.email, event.type]);
      await tx.raw("update commerce.snowforce_marketing_events set processed=true where id=?", [event.id]);
    }
  });
}
export async function processMarketing(scope: MedusaContainer) {
  const config = configuration(), db = dbFor(scope);
  // Serialize workers globally so the configured rate is shared across surfaces/processes.
  const locking = scope.resolve<import("@medusajs/framework/types").ILockingModule>("locking");
  return locking.execute("snowforce-marketing-worker", async signal => {
    const started = Date.now();
    for (let index = 0; index < config.rate; index++) {
      if (signal?.aborted || Date.now() - started > 45000) break;
      if (!(await db.raw("insert into commerce.snowforce_marketing_rate_windows(minute,attempts) values(date_trunc('minute',now()),1) on conflict(minute) do update set attempts=snowforce_marketing_rate_windows.attempts+1 where snowforce_marketing_rate_windows.attempts<? returning minute", [config.rate])).rows.length) break;
      const row = await db.transaction(async tx => {
        const result = await tx.raw("select r.*,c.surface from commerce.snowforce_marketing_recipients r join commerce.snowforce_marketing_campaigns c on c.id=r.campaign_id where ((r.status='queued' and r.next_attempt_at<=now()) or (r.status='sending' and r.lease_until<now())) order by r.next_attempt_at for update of r skip locked limit 1");
        if (!result.rows.length) return null;
        const recipient = z.object({ id: z.uuid(), campaign_id: z.uuid(), email: z.string(), surface: z.string(), attempts: z.number(), first_attempt_at: z.coerce.date().nullable(), message: z.unknown().nullable() }).parse(result.rows[0]);
        if (recipient.first_attempt_at && Date.now() - recipient.first_attempt_at.getTime() > 23 * 3600000) {
          await tx.raw("update commerce.snowforce_marketing_recipients set status='attention',error_code='idempotency_window' where id=?", [recipient.id]); return { expired: true as const };
        }
        await tx.raw("update commerce.snowforce_marketing_recipients set status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_until=now()+interval '2 minutes' where id=?", [recipient.id]);
        return { expired: false as const, recipient };
      });
      if (!row) break; if (row.expired) continue;
      const recipient = row.recipient;
      try {
        const campaign = await readCampaign(db, recipient.campaign_id, recipient.surface);
        const source = await sourceDraft(scope, campaign.source);
        if (!source.publishable || source.content.path !== campaign.content.path || campaign.source_fingerprint !== sourceFingerprint(source.content)) {
          await db.raw("update commerce.snowforce_marketing_recipients set status='failed',error_code='source_unavailable',lease_until=null where id=?", [recipient.id]); continue;
        }
        const { contacts } = z.object({ contacts: z.array(contactSchema) }).parse(await websiteSource({ action: "eligibility", email: recipient.email }));
        const suppressed = (await db.raw("select email from commerce.snowforce_marketing_suppressions where email=?", [recipient.email])).rows.length > 0;
        if (suppressed || !contacts.some(contact => classifyContact(contact, false) === "eligible")) {
          await db.raw("update commerce.snowforce_marketing_recipients set status='suppressed',lease_until=null where id=?", [recipient.id]); continue;
        }
        if (signal?.aborted) break;
        const payload = recipient.message ?? message(campaign, recipient.email);
        // Freeze provider payload before first call; retries keep the exact body and key.
        await db.raw("update commerce.snowforce_marketing_recipients set message=?::jsonb where id=? and message is null", [JSON.stringify(payload), recipient.id]);
        const result = await deliverMarketing(payload, `marketing/${recipient.id}`, config.key);
        if (result.status === "accepted") await db.raw("update commerce.snowforce_marketing_recipients set status='accepted',provider_id=?,lease_until=null,error_code=null where id=?", [result.id, recipient.id]);
        else await db.raw("update commerce.snowforce_marketing_recipients set status=?,error_code=?,lease_until=null,next_attempt_at=now()+(? * interval '1 second') where id=?", [result.status === "failed" ? "failed" : "queued", result.code, Math.min(3600, 60 * 2 ** Math.min(recipient.attempts, 6)), recipient.id]);
      } catch {
        // No provider call on failed eligibility checks; uncertain calls retain their frozen payload.
        await db.raw("update commerce.snowforce_marketing_recipients set status='queued',error_code='service_unavailable',lease_until=null,next_attempt_at=now()+interval '2 minutes' where id=? and status='sending'", [recipient.id]);
      }
    }
    await applyMarketingEvents(db);
    await db.raw("update commerce.snowforce_marketing_campaigns c set status=case when exists(select 1 from commerce.snowforce_marketing_recipients r where r.campaign_id=c.id and r.status in ('queued','sending')) then 'processing' when exists(select 1 from commerce.snowforce_marketing_recipients r where r.campaign_id=c.id and r.status in ('attention','failed')) then 'attention' else 'completed' end where c.status<>'draft'");
    await db.raw("delete from commerce.snowforce_marketing_nonces where created_at<now()-interval '1 day'");
    await db.raw("delete from commerce.snowforce_marketing_events where created_at<now()-interval '90 days'");
    await db.raw("delete from commerce.snowforce_marketing_rate_windows where minute<now()-interval '1 day'");
  }, { timeout: 1, expire: 180 });
}
