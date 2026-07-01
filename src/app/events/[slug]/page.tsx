import type { Metadata } from "next";
import { EventDetailView } from "@/components/events/event-detail-view";
import { getEvent } from "@/lib/events/repository";
import { getCurrentMemberAccount } from "@/lib/members/actions";

import { buildEventMetadata } from "./metadata-builder";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  try {
    const event = await getEvent(params.slug);
    return buildEventMetadata(event, siteUrl);
  } catch {
    return buildEventMetadata(undefined, siteUrl);
  }
}

export default async function EventDetailPage({ params }: { params: { slug: string } }) {
  const account = await getCurrentMemberAccount();
  try {
    return <EventDetailView event={await getEvent(params.slug)} memberProfile={account?.profile ?? null} emailConfirmed={account?.emailConfirmed ?? false} />;
  } catch {
    return <EventDetailView event={undefined} loadError memberProfile={account?.profile ?? null} emailConfirmed={account?.emailConfirmed ?? false} />;
  }
}
