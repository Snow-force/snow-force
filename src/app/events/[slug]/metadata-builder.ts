import type { Metadata } from "next";
import type { Event } from "@/lib/types";

export function buildEventMetadata(
  event: Event | undefined,
  siteUrl: string,
): Metadata {
  if (!event) {
    return { title: "Event Not Found" };
  }

  const title =
    event.seoTitle.en ||
    event.seoTitle.zh ||
    event.title.en ||
    event.title.zh;
  const description =
    event.seoDescription.en || event.seoDescription.zh || "";
  const url = `${siteUrl}/events/${event.slug}`;
  const hasImage = event.coverImage.length > 0;

  const metadata: Metadata = {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };

  if (hasImage) {
    metadata.openGraph = {
      ...metadata.openGraph,
      images: [{ url: event.coverImage }],
    } as Metadata["openGraph"];
    metadata.twitter = {
      ...metadata.twitter,
      images: [event.coverImage],
    } as Metadata["twitter"];
  }

  return metadata;
}
