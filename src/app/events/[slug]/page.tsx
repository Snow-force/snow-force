import type { Metadata } from "next";
import { EventDetailView } from "@/components/events/event-detail-view";
import { getEvent } from "@/lib/events/repository";
import { getCurrentMemberAccount } from "@/lib/members/actions";

import { buildEventMetadata } from "./metadata-builder";

export async function generateMetadata(
  props: {
    params: Promise<{ slug: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  try {
    const event = await getEvent(params.slug);
    return buildEventMetadata(event, siteUrl);
  } catch {
    return buildEventMetadata(undefined, siteUrl);
  }
}

export default async function EventDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const account = await getCurrentMemberAccount();
  const result = await getEvent(params.slug)
    .then((event) => ({ event, loadError: false }))
    .catch(() => ({ event: undefined, loadError: true }));
  return <EventDetailView {...result} memberProfile={account?.profile ?? null} emailConfirmed={account?.emailConfirmed ?? false} />;
}
