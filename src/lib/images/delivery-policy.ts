export const MEDIA_WIDTHS = [320, 640, 1280, 1920] as const;
export type MediaWidth = typeof MEDIA_WIDTHS[number];
export const MEDIA_BUCKETS = ["event-covers", "recap-media", "shop-products"] as const;
export const MEDIA_VERSION = "v1";
export const MEDIA_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const MEDIA_MAX_VARIANT_BYTES = 384 * 1024;

export function publicMediaSource(src: string, projectUrl: string | undefined) {
  try {
    if (!projectUrl || src.length > 2048) return null;
    const url = new URL(src);
    const project = new URL(projectUrl);
    if (url.protocol !== "https:" || url.origin !== project.origin || url.username || url.password || url.search || url.hash) return null;
    const parts = url.pathname.split("/").map(decodeURIComponent);
    if (parts.slice(0, 5).join("/") !== "/storage/v1/object/public") return null;
    const bucket = parts[5];
    const path = parts.slice(6);
    if (!MEDIA_BUCKETS.includes(bucket as typeof MEDIA_BUCKETS[number]) || !path.length || path[0] === "_web") return null;
    if (path.some((part) => !part || part === "." || part === ".." || /[/\\\u0000-\u001f]/.test(part))) return null;
    if (!/\.(jpe?g|png|webp|gif)$/i.test(path.at(-1) ?? "")) return null;
    const objectPath = path.map(encodeURIComponent).join("/");
    return { bucket, objectPath, url: `${project.origin}/storage/v1/object/public/${bucket}/${objectPath}` };
  } catch { return null; }
}

export function mediaLoader({ src, width }: { src: string; width: number }) {
  const size = MEDIA_WIDTHS.find((candidate) => candidate >= width) ?? MEDIA_WIDTHS.at(-1)!;
  return `/api/media/image?${new URLSearchParams({ src, w: String(size), v: MEDIA_VERSION })}`;
}
