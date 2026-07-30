import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  closeEventCampaignAction,
  moderateEventReviewAction,
  openEventCampaignAction,
} from "@/lib/reviews/actions";
import { buildQrCodeDataUrl } from "@/lib/events/share-payload";
import { getEventAdmin } from "@/lib/events/repository";
import { getRegistrations } from "@/lib/registrations/repository";
import { getEventCampaigns, listAdminEventReviews } from "@/lib/reviews/repository";
import type { EventQrCampaign, EventQrCampaignPurpose } from "@/lib/types";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function qrPath(purpose: EventQrCampaignPurpose, code: string) {
  return purpose === "checkin" ? `/check-in/${code}` : `/reviews/access/${code}`;
}

async function campaignView(campaign: EventQrCampaign | undefined) {
  if (
    !campaign ||
    campaign.status !== "open" ||
    !campaign.closesAt ||
    new Date(campaign.closesAt).getTime() <= Date.now()
  ) {
    return undefined;
  }
  const url = `${siteUrl()}${qrPath(campaign.purpose, campaign.accessCode)}`;
  return { campaign, url, qr: await buildQrCodeDataUrl(url) };
}

export default async function AdminEventReviewsPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: Record<string, string | undefined>;
}) {
  const event = await getEventAdmin(params.slug);
  if (!event) notFound();

  const [campaigns, registrations, reviews] = await Promise.all([
    getEventCampaigns(event.slug),
    getRegistrations(event.slug),
    listAdminEventReviews(event.slug),
  ]);
  const [checkin, review] = await Promise.all([
    campaignView(campaigns.find((item) => item.purpose === "checkin")),
    campaignView(campaigns.find((item) => item.purpose === "review")),
  ]);
  const confirmed = registrations.filter((item) => item.status === "confirmed");
  const attended = confirmed.filter((item) => item.attendanceStatus === "attended");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/reviews" className="text-sm font-medium text-blue-700">← All events</Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-950">{event.title.en || event.slug}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {event.eventDate} · {attended.length} attended / {confirmed.length} confirmed
        </p>
      </div>

      {searchParams.opened === "review" ? (
        <p className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Review is open and Check-in has been closed. The review form is now frozen to this
          campaign&apos;s snapshot.
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <CampaignCard
          title="1. Arrival Check-in"
          description="Scan on arrival. A successful scan is the only QR action that marks the confirmed registration as attended."
          purpose="checkin"
          eventSlug={event.slug}
          duration={120}
          view={checkin}
        />
        <CampaignCard
          title="2. Post-event Review"
          description="Open after the activity. Only confirmed members already marked attended can access the form."
          purpose="review"
          eventSlug={event.slug}
          duration={90}
          view={review}
        />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Review moderation</h2>
            <p className="mt-1 text-sm text-gray-600">
              Only approved reviews with member consent can appear on the public recap.
            </p>
          </div>
          <span className="text-sm text-gray-500">{reviews.length} submissions</span>
        </div>
        <div className="mt-4 space-y-4">
          {reviews.map((item) => (
            <article key={item.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">{item.contactName}</p>
                  <p className="text-sm text-gray-500">
                    {item.overallRating}/5 · {new Date(item.createdAt).toLocaleString()} · {item.moderationStatus}
                  </p>
                </div>
                <span className={`rounded px-2 py-1 text-xs font-semibold ${
                  item.consentToPublish ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                }`}>
                  {item.consentToPublish ? "Public consent" : "Internal only"}
                </span>
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                {Object.entries(item.answers).map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-medium text-gray-700">{key}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-gray-600">
                      {Array.isArray(value) ? value.join(", ") : String(value ?? "—")}
                    </dd>
                  </div>
                ))}
              </dl>
              <form action={moderateEventReviewAction} className="mt-4 flex flex-wrap items-end gap-2">
                <input type="hidden" name="reviewId" value={item.id} />
                <input type="hidden" name="eventSlug" value={event.slug} />
                <label className="min-w-56 flex-1 text-xs text-gray-600">
                  Internal moderation note
                  <input
                    name="moderationNote"
                    defaultValue={item.moderationNote}
                    className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <button name="status" value="approved" className="rounded bg-green-700 px-3 py-2 text-sm font-semibold text-white">
                  Approve
                </button>
                <button name="status" value="rejected" className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">
                  Reject
                </button>
                <button name="status" value="pending" className="rounded border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700">
                  Reopen
                </button>
              </form>
            </article>
          ))}
          {!reviews.length ? <p className="py-8 text-center text-sm text-gray-500">No reviews yet.</p> : null}
        </div>
      </section>
    </div>
  );
}

function CampaignCard(props: {
  title: string;
  description: string;
  purpose: EventQrCampaignPurpose;
  eventSlug: string;
  duration: number;
  view: Awaited<ReturnType<typeof campaignView>>;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">{props.title}</h2>
      <p className="mt-1 min-h-12 text-sm leading-6 text-gray-600">{props.description}</p>
      {props.view ? (
        <div className="mt-4 space-y-3">
          <div className="flex justify-center rounded-lg bg-gray-50 p-4">
            <Image
              src={props.view.qr.dataUrl}
              alt={`${props.title} QR code`}
              width={props.view.qr.width}
              height={props.view.qr.height}
              unoptimized
            />
          </div>
          <p className="break-all text-xs text-gray-500">{props.view.url}</p>
          <p className="text-sm text-gray-600">
            Closes {new Date(props.view.campaign.closesAt ?? "").toLocaleString()}
          </p>
          <form action={closeEventCampaignAction}>
            <input type="hidden" name="eventSlug" value={props.eventSlug} />
            <input type="hidden" name="purpose" value={props.purpose} />
            <button className="w-full rounded border border-red-300 px-4 py-2 text-sm font-semibold text-red-700">
              Close {props.purpose === "checkin" ? "Check-in" : "Review"}
            </button>
          </form>
        </div>
      ) : (
        <form action={openEventCampaignAction} className="mt-4 space-y-3">
          <input type="hidden" name="eventSlug" value={props.eventSlug} />
          <input type="hidden" name="purpose" value={props.purpose} />
          <label className="block text-sm text-gray-700">
            Open window (minutes)
            <input
              type="number"
              name="durationMinutes"
              min={15}
              max={720}
              defaultValue={props.duration}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
          </label>
          <button className="btn-primary w-full px-4 py-2">
            Open {props.purpose === "checkin" ? "Check-in" : "Review"} QR
          </button>
        </form>
      )}
    </section>
  );
}
