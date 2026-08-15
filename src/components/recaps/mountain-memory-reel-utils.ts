import type { Bilingual, EventRecap, RecapMediaItem } from "@/lib/types";

export type RecapReelFrame = {
  id: string;
  recap: EventRecap;
  recapIndex: number;
  recapCount: number;
  photoIndex: number;
  photoCount: number;
  imageUrl: string;
  caption: Partial<Bilingual>;
  isChapterEnd: boolean;
};

export type ReelPosition = {
  index: number;
  frameProgress: number;
  overallProgress: number;
};

export function orderedRecapMedia(recap: EventRecap): RecapMediaItem[] {
  return [...recap.media].sort((a, b) => a.order - b.order);
}
export function buildRecapReelFrames(recaps: EventRecap[]): RecapReelFrame[] {
  return recaps.flatMap((recap, recapIndex) => {
    const sortedMedia = orderedRecapMedia(recap);
    const coverUrl = recap.coverImage || sortedMedia[0]?.url || "";
    const additionalMedia = sortedMedia.filter((item) => item.url !== coverUrl);
    const photos = [
      {
        id: `${recap.slug}-cover`,
        imageUrl: coverUrl,
        caption: recap.summary,
      },
      ...additionalMedia.map((item) => ({
        id: item.id,
        imageUrl: item.url,
        caption: item.caption ?? {},
      })),
    ];

    return photos.map((photo, photoIndex) => ({
      ...photo,
      recap,
      recapIndex,
      recapCount: recaps.length,
      photoIndex,
      photoCount: photos.length,
      isChapterEnd: photoIndex === photos.length - 1,
    }));
  });
}

export function getReelPosition(progress: number, frameCount: number): ReelPosition {
  if (frameCount <= 0) {
    return { index: 0, frameProgress: 0, overallProgress: 0 };
  }

  const overallProgress = Math.min(1, Math.max(0, progress));
  const scaled = overallProgress * frameCount;
  const index = Math.min(frameCount - 1, Math.floor(scaled));
  const frameProgress = overallProgress === 1 ? 1 : scaled - index;

  return { index, frameProgress, overallProgress };
}

export function getReelHeightVh(frameCount: number): number {
  return Math.min(320, Math.max(220, 180 + frameCount * 20));
}

export function shouldUseDesktopReel({
  isDesktop,
  reduceMotion,
  frameCount,
}: {
  isDesktop: boolean;
  reduceMotion: boolean;
  frameCount: number;
}): boolean {
  return isDesktop && !reduceMotion && frameCount > 1;
}
