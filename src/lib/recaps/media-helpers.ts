import type { EventRecap } from "../types";

export function reindexMedia(media: EventRecap["media"]) {
  return media.map((item, order) => ({ ...item, order }));
}

export function ensureCover(recap: EventRecap): EventRecap {
  if (recap.media.length === 0) return { ...recap, coverImage: "" };
  if (recap.media.some((item) => item.isCover)) {
    const cover = recap.media.find((item) => item.isCover);
    return { ...recap, coverImage: cover?.url ?? recap.coverImage };
  }
  const [first, ...rest] = recap.media;
  return {
    ...recap,
    coverImage: first.url,
    media: [{ ...first, isCover: true }, ...rest],
  };
}

export function addMediaItems(recap: EventRecap, items: EventRecap["media"]): EventRecap {
  const existing = recap.media.map((item) => ({ ...item, isCover: item.isCover && recap.media.length > 0 }));
  const start = existing.length;
  const appended = items.map((item, index) => ({ ...item, order: start + index, isCover: false }));
  return ensureCover({ ...recap, media: reindexMedia([...existing, ...appended]) });
}

export function deleteMediaItem(recap: EventRecap, mediaId: string): EventRecap {
  const media = reindexMedia(recap.media.filter((item) => item.id !== mediaId));
  return ensureCover({ ...recap, media });
}

export function moveMediaItem(recap: EventRecap, mediaId: string, direction: "up" | "down"): EventRecap {
  const media = [...recap.media].sort((a, b) => a.order - b.order);
  const index = media.findIndex((item) => item.id === mediaId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= media.length) return recap;
  const current = media[index];
  media[index] = media[nextIndex];
  media[nextIndex] = current;
  return { ...recap, media: reindexMedia(media) };
}

export function setCoverMediaItem(recap: EventRecap, mediaId: string): EventRecap {
  const media = recap.media.map((item) => ({ ...item, isCover: item.id === mediaId }));
  return ensureCover({ ...recap, media });
}

export function updateMediaCaption(
  recap: EventRecap,
  mediaId: string,
  caption: EventRecap["media"][number]["caption"],
): EventRecap {
  return {
    ...recap,
    media: recap.media.map((item) => (item.id === mediaId ? { ...item, caption } : item)),
  };
}
