export const PUBLIC_IMAGE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const PUBLIC_IMAGE_SOURCE_MAX_BYTES = 50 * 1024 * 1024;
export const PUBLIC_IMAGE_CACHE_CONTROL = "31536000";

export const PUBLIC_IMAGE_ALLOWED_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
