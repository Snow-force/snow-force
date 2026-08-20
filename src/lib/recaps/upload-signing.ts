import {
  PUBLIC_IMAGE_ALLOWED_TYPES,
  PUBLIC_IMAGE_UPLOAD_MAX_BYTES,
} from "../images/public-image-policy";

export const RECAP_MEDIA_BUCKET = "recap-media" as const;
export const RECAP_MEDIA_MAX_BYTES = PUBLIC_IMAGE_UPLOAD_MAX_BYTES;
export const RECAP_MEDIA_TYPES = PUBLIC_IMAGE_ALLOWED_TYPES;

export type FinalizeEntry = {
  path: string;
  name: string;
  type: string;
  size: number;
};

export type UploadCandidate = {
  name: string;
  type: string;
  size: number;
};

export type ValidationCode =
  | "invalid_name"
  | "invalid_type"
  | "invalid_size"
  | "unsupported_mime"
  | "empty"
  | "too_large"
  | "not_array"
  | "invalid_entry"
  | "missing_path"
  | "missing_name"
  | "missing_type"
  | "missing_size"
  | "bad_path"
  | "unsafe_path"
  | "traversal"
  | "wrong_slug"
  | "wrong_prefix";

export type ValidateResult =
  | { ok: true; candidate: UploadCandidate }
  | { ok: false; code: ValidationCode; reason: string };

export type ParseResult =
  | { ok: true; entries: FinalizeEntry[] }
  | { ok: false; code: ValidationCode; reason: string };

export function safePathSegment(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

export function safeRecapMediaPath(
  slug: string,
  fileName: string,
  timestamp?: number,
  index?: number,
): string {
  const recapSegment = safePathSegment(slug, "recap");
  const fileSegment = safePathSegment(fileName, "media");
  const ts = timestamp ?? Date.now();
  const prefix = index === undefined ? `${ts}` : `${ts}-${index}`;
  return `recaps/${recapSegment}/${prefix}-${fileSegment}`;
}

export function safeRecapPrefix(slug: string): string {
  return `recaps/${safePathSegment(slug, "recap")}/`;
}

function pathBasename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? "";
}

export function assertSafeRecapPath(
  path: string,
  slug: string,
): asserts path is string {
  if (typeof path !== "string" || !path) {
    throw new Error(`Path must be a non-empty string`);
  }
  if (!path.startsWith("recaps/")) {
    throw new Error(`Path must start with "recaps/": ${path}`);
  }

  const parts = path.split("/");
  if (parts.length < 3) {
    throw new Error(`Path must have at least 3 segments: ${path}`);
  }

  const recapSegment = safePathSegment(slug, "recap");
  if (parts[1] !== recapSegment) {
    throw new Error(
      `Path slug segment mismatch: expected "${recapSegment}", got "${parts[1]}"`,
    );
  }

  if (parts.some((p) => p === ".." || p === ".")) {
    throw new Error(`Path contains traversal segments: ${path}`);
  }
  if (!parts[parts.length - 1]) {
    throw new Error(`Path must include a file name: ${path}`);
  }
}

export type PathValidationResult =
  | { ok: true; basename: string; safeSlug: string }
  | { ok: false; code: ValidationCode; reason: string };

export function validateRecapPath(path: unknown, slug: string): PathValidationResult {
  if (typeof path !== "string" || !path) {
    return { ok: false, code: "bad_path", reason: "path is required" };
  }
  const recapSegment = safePathSegment(slug, "recap");
  const prefix = `recaps/${recapSegment}/`;
  if (!path.startsWith(prefix)) {
    return {
      ok: false,
      code: "wrong_prefix",
      reason: `Path must start with "${prefix}": ${path}`,
    };
  }
  const parts = path.split("/");
  if (parts.length < 3) {
    return { ok: false, code: "bad_path", reason: `Path must have at least 3 segments: ${path}` };
  }
  if (parts.some((p) => p === ".." || p === ".")) {
    return { ok: false, code: "traversal", reason: `Path contains traversal segments: ${path}` };
  }
  const basename = pathBasename(path);
  if (!basename) {
    return { ok: false, code: "bad_path", reason: `Path must include a file name: ${path}` };
  }
  if (parts[1] !== recapSegment) {
    return {
      ok: false,
      code: "wrong_slug",
      reason: `Path slug segment mismatch: expected "${recapSegment}", got "${parts[1]}"`,
    };
  }
  return { ok: true, basename, safeSlug: recapSegment };
}

export function validateUploadCandidate(
  name: unknown,
  type: unknown,
  size: unknown,
): ValidateResult {
  if (typeof name !== "string" || !name) {
    return { ok: false, code: "invalid_name", reason: "name must be a non-empty string" };
  }
  if (typeof type !== "string" || !type) {
    return { ok: false, code: "invalid_type", reason: "type must be a non-empty string" };
  }
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return {
      ok: false,
      code: "invalid_size",
      reason: "size must be a positive finite number",
    };
  }
  if (!RECAP_MEDIA_TYPES.has(type)) {
    return {
      ok: false,
      code: "unsupported_mime",
      reason: `Unsupported MIME type "${type}". Allowed: image/jpeg, image/png, image/webp, image/gif`,
    };
  }
  if (size > RECAP_MEDIA_MAX_BYTES) {
    return {
      ok: false,
      code: "too_large",
      reason: `File exceeds ${RECAP_MEDIA_MAX_BYTES} byte limit`,
    };
  }
  return { ok: true, candidate: { name, type, size } };
}

export function parseFinalizeEntries(entries: unknown): ParseResult {
  if (!Array.isArray(entries)) {
    return { ok: false, code: "not_array", reason: "Expected an array of entries" };
  }

  const parsed: FinalizeEntry[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return {
        ok: false,
        code: "invalid_entry",
        reason: `Entry at index ${i} is not a plain object`,
      };
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.path !== "string" || !e.path) {
      return {
        ok: false,
        code: "missing_path",
        reason: `Entry at index ${i} missing or invalid "path"`,
      };
    }
    if (typeof e.name !== "string" || !e.name) {
      return {
        ok: false,
        code: "missing_name",
        reason: `Entry at index ${i} missing or invalid "name"`,
      };
    }
    if (typeof e.type !== "string" || !e.type) {
      return {
        ok: false,
        code: "missing_type",
        reason: `Entry at index ${i} missing or invalid "type"`,
      };
    }
    if (typeof e.size !== "number" || !Number.isFinite(e.size) || e.size <= 0) {
      return {
        ok: false,
        code: "missing_size",
        reason: `Entry at index ${i} missing or invalid "size"`,
      };
    }
    parsed.push({ path: e.path, name: e.name, type: e.type, size: e.size });
  }
  return { ok: true, entries: parsed };
}
