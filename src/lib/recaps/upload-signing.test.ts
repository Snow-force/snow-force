import { describe, expect, it } from "vitest";

import {
  RECAP_MEDIA_BUCKET,
  RECAP_MEDIA_MAX_BYTES,
  RECAP_MEDIA_TYPES,
  safePathSegment,
  safeRecapMediaPath,
  safeRecapPrefix,
  assertSafeRecapPath,
  validateRecapPath,
  validateUploadCandidate,
  parseFinalizeEntries,
  type FinalizeEntry,
  type ValidationCode,
} from "./upload-signing";

describe("RECAP_MEDIA_BUCKET", () => {
  it("is recap-media", () => {
    expect(RECAP_MEDIA_BUCKET).toBe("recap-media");
  });
});

describe("RECAP_MEDIA_MAX_BYTES", () => {
  it("is 10 MB", () => {
    expect(RECAP_MEDIA_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("RECAP_MEDIA_TYPES", () => {
  it("allows jpeg, png, webp, gif", () => {
    expect(RECAP_MEDIA_TYPES).toEqual(
      new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    );
  });
});

describe("safePathSegment", () => {
  it("lowercases and replaces non-alphanumeric chars with hyphens", () => {
    expect(safePathSegment("My Cool Event!!", "fallback")).toBe("my-cool-event");
  });

  it("keeps dots and hyphens", () => {
    expect(safePathSegment("photo.001.jpg", "fallback")).toBe("photo.001.jpg");
  });

  it("strips leading and trailing hyphens", () => {
    expect(safePathSegment("--hello--", "fallback")).toBe("hello");
  });

  it("returns fallback when normalized is empty", () => {
    expect(safePathSegment("!!!", "recap")).toBe("recap");
  });

  it("handles empty string input", () => {
    expect(safePathSegment("", "media")).toBe("media");
  });

  it("handles unicode characters by stripping them", () => {
    expect(safePathSegment("中文-slug", "fallback")).toBe("slug");
  });

  it("collapses multiple consecutive special chars into one hyphen", () => {
    expect(safePathSegment("a!!!b???c", "fallback")).toBe("a-b-c");
  });
});

describe("safeRecapMediaPath", () => {
  it("builds path under recaps/<safe-slug>/<timestamp>-<safe-file>", () => {
    const path = safeRecapMediaPath("2026 Spring Trip", "group-photo.jpg", 1717000000000);
    expect(path).toBe("recaps/2026-spring-trip/1717000000000-group-photo.jpg");
  });

  it("sanitizes slug and filename", () => {
    const path = safeRecapMediaPath("../../etc", "../passwd", 1000000);
    expect(path).toBe("recaps/..-..-etc/1000000-..-passwd");
  });

  it("uses fallback segments when inputs are empty", () => {
    const path = safeRecapMediaPath("", "", 999);
    expect(path).toBe("recaps/recap/999-media");
  });

  it("keeps file extension through sanitization", () => {
    const path = safeRecapMediaPath("demo", "IMG_1234.JPG", 500);
    expect(path).toBe("recaps/demo/500-img-1234.jpg");
  });

  it("inserts an index segment when provided so duplicate names get unique paths", () => {
    expect(safeRecapMediaPath("demo", "photo.jpg", 1000, 0)).toBe("recaps/demo/1000-0-photo.jpg");
    expect(safeRecapMediaPath("demo", "photo.jpg", 1000, 1)).toBe("recaps/demo/1000-1-photo.jpg");
  });
});

describe("safeRecapPrefix", () => {
  it("returns recaps/<safe-slug>/", () => {
    expect(safeRecapPrefix("My Trip!!")).toBe("recaps/my-trip/");
  });

  it("falls back to recap when slug is empty", () => {
    expect(safeRecapPrefix("")).toBe("recaps/recap/");
  });
});

describe("assertSafeRecapPath", () => {
  it("passes for a valid path matching slug", () => {
    expect(() => assertSafeRecapPath("recaps/my-event/123-photo.jpg", "my-event")).not.toThrow();
  });

  it("throws when path does not start with recaps/", () => {
    expect(() => assertSafeRecapPath("other-bucket/foo.jpg", "my-event")).toThrow(
      'Path must start with "recaps/',
    );
  });

  it("throws when slug segment does not match expected slug", () => {
    expect(() => assertSafeRecapPath("recaps/wrong-slug/123-photo.jpg", "my-event")).toThrow(
      /slug segment mismatch/,
    );
  });

  it("throws on path-traversal with ..", () => {
    expect(() =>
      assertSafeRecapPath("recaps/my-event/../../etc/passwd", "my-event"),
    ).toThrow(/traversal/);
  });

  it("throws on path-traversal with single dot", () => {
    expect(() =>
      assertSafeRecapPath("recaps/my-event/./photo.jpg", "my-event"),
    ).toThrow(/traversal/);
  });

  it("throws when path has fewer than 3 segments", () => {
    expect(() => assertSafeRecapPath("recaps/missing-file-segment", "my-event")).toThrow(
      /at least 3 segments/,
    );
  });
});

describe("validateRecapPath", () => {
  it("accepts a valid path matching slug and returns basename", () => {
    const result = validateRecapPath("recaps/my-event/123-photo.jpg", "my-event");
    expect(result).toEqual({ ok: true, basename: "123-photo.jpg", safeSlug: "my-event" });
  });

  it("rejects non-string paths", () => {
    const result = validateRecapPath(123 as unknown, "my-event");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("bad_path");
    }
  });

  it("rejects empty string paths", () => {
    const result = validateRecapPath("", "my-event");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("bad_path");
    }
  });

  it("rejects paths with wrong prefix", () => {
    const result = validateRecapPath("other/foo.jpg", "my-event");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("wrong_prefix");
    }
  });

  it("rejects paths with wrong slug via wrong_prefix", () => {
    const result = validateRecapPath("recaps/other-event/1.jpg", "my-event");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("wrong_prefix");
    }
  });

  it("rejects paths with traversal segments", () => {
    const result = validateRecapPath("recaps/my-event/../etc", "my-event");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("traversal");
    }
  });

  it("rejects paths with fewer than 3 segments via wrong_prefix", () => {
    const result = validateRecapPath("recaps/my-event", "my-event");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("wrong_prefix");
    }
  });
});

describe("validateUploadCandidate", () => {
  it("accepts valid jpeg", () => {
    const result = validateUploadCandidate("photo.jpg", "image/jpeg", 500_000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidate).toEqual({ name: "photo.jpg", type: "image/jpeg", size: 500_000 });
    }
  });

  it("accepts valid png", () => {
    expect(validateUploadCandidate("img.png", "image/png", 1024).ok).toBe(true);
  });

  it("accepts valid webp", () => {
    expect(validateUploadCandidate("img.webp", "image/webp", 1).ok).toBe(true);
  });

  it("accepts valid gif", () => {
    expect(validateUploadCandidate("img.gif", "image/gif", 10).ok).toBe(true);
  });

  it("rejects unsupported MIME type", () => {
    const result = validateUploadCandidate("file.pdf", "application/pdf", 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_mime");
      expect(result.reason).toContain("Unsupported MIME type");
    }
  });

  it("rejects empty file (size 0)", () => {
    const result = validateUploadCandidate("empty.jpg", "image/jpeg", 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_size");
      expect(result.reason).toContain("positive finite number");
    }
  });

  it("rejects oversized file", () => {
    const oversized = RECAP_MEDIA_MAX_BYTES + 1;
    const result = validateUploadCandidate("big.jpg", "image/jpeg", oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("too_large");
      expect(result.reason).toContain("exceeds");
      expect(result.reason).toContain(String(RECAP_MEDIA_MAX_BYTES));
    }
  });

  it("accepts exactly at the boundary of max size", () => {
    expect(validateUploadCandidate("exact.jpg", "image/jpeg", RECAP_MEDIA_MAX_BYTES).ok).toBe(true);
  });

  it("rejects negative size", () => {
    const result = validateUploadCandidate("neg.jpg", "image/jpeg", -100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_size");
    }
  });

  it("rejects non-finite size", () => {
    const result = validateUploadCandidate("nan.jpg", "image/jpeg", Number.POSITIVE_INFINITY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_size");
    }
  });

  it("rejects missing name", () => {
    const result = validateUploadCandidate("", "image/jpeg", 100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_name");
    }
  });

  it("rejects non-string name", () => {
    const result = validateUploadCandidate(42 as unknown, "image/jpeg", 100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_name");
    }
  });

  it("rejects missing type", () => {
    const result = validateUploadCandidate("a.jpg", "", 100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_type");
    }
  });

  it("rejects non-number size", () => {
    const result = validateUploadCandidate("a.jpg", "image/jpeg", "big" as unknown);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_size");
    }
  });
});

describe("parseFinalizeEntries", () => {
  const validEntry: FinalizeEntry = {
    path: "recaps/demo/123-photo.jpg",
    name: "photo.jpg",
    type: "image/jpeg",
    size: 500_000,
  };

  it("parses a valid array of entries", () => {
    const result = parseFinalizeEntries([validEntry]);
    expect(result).toEqual({ ok: true, entries: [validEntry] });
  });

  it("parses multiple entries", () => {
    const a: FinalizeEntry = { ...validEntry, path: "recaps/demo/1-a.jpg", name: "a.jpg" };
    const b: FinalizeEntry = { ...validEntry, path: "recaps/demo/2-b.png", name: "b.png", type: "image/png" };
    expect(parseFinalizeEntries([a, b])).toEqual({ ok: true, entries: [a, b] });
  });

  it("returns not_array for null input", () => {
    const result = parseFinalizeEntries(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_array");
      expect(result.reason).toContain("Expected an array");
    }
  });

  it("returns not_array for undefined input", () => {
    const result = parseFinalizeEntries(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_array");
    }
  });

  it("returns not_array for object input", () => {
    const result = parseFinalizeEntries({ not: "array" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_array");
    }
  });

  it("returns invalid_entry when entry is a string", () => {
    const result = parseFinalizeEntries(["string-entry"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_entry");
      expect(result.reason).toContain("Entry at index 0");
    }
  });

  it("returns invalid_entry when entry is null", () => {
    const result = parseFinalizeEntries([null]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_entry");
    }
  });

  it("returns invalid_entry when entry is an array", () => {
    const result = parseFinalizeEntries([["nested"]]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_entry");
    }
  });

  it("returns missing_path when path is missing", () => {
    const result = parseFinalizeEntries([{ name: "x.jpg", type: "image/jpeg", size: 100 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_path");
    }
  });

  it("returns missing_name when name is missing", () => {
    const result = parseFinalizeEntries([
      { path: "recaps/demo/x.jpg", type: "image/jpeg", size: 100 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_name");
    }
  });

  it("returns missing_type when type is missing", () => {
    const result = parseFinalizeEntries([
      { path: "recaps/demo/x.jpg", name: "x.jpg", size: 100 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_type");
    }
  });

  it("returns missing_size when size is missing", () => {
    const result = parseFinalizeEntries([
      { path: "recaps/demo/x.jpg", name: "x.jpg", type: "image/jpeg" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_size");
    }
  });

  it("returns missing_size when size is not a number", () => {
    const result = parseFinalizeEntries([
      { path: "recaps/demo/x.jpg", name: "x.jpg", type: "image/jpeg", size: "big" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_size");
    }
  });

  it("returns missing_size when size is zero", () => {
    const result = parseFinalizeEntries([
      { path: "recaps/demo/x.jpg", name: "x.jpg", type: "image/jpeg", size: 0 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_size");
    }
  });

  it("returns missing_path when path is empty string", () => {
    const result = parseFinalizeEntries([
      { path: "", name: "x.jpg", type: "image/jpeg", size: 100 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_path");
    }
  });

  it("reports the index of the first bad entry", () => {
    const result = parseFinalizeEntries([
      { path: "recaps/demo/a.jpg", name: "a.jpg", type: "image/jpeg", size: 1 },
      "bad",
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("index 1");
    }
  });
});

describe("deterministic plan output", () => {
  it("safeRecapMediaPath with explicit timestamp is deterministic", () => {
    const a = safeRecapMediaPath("slug", "file.jpg", 1234567890);
    const b = safeRecapMediaPath("slug", "file.jpg", 1234567890);
    expect(a).toBe(b);
    expect(a).toBe("recaps/slug/1234567890-file.jpg");
  });

  it("validateUploadCandidate returns stable ValidateResult shape", () => {
    const pass = validateUploadCandidate("x.jpg", "image/jpeg", 100);
    expect(pass).toHaveProperty("ok", true);
    if (pass.ok) {
      expect(Object.keys(pass.candidate).sort()).toEqual(["name", "size", "type"]);
    }

    const fail = validateUploadCandidate("x.pdf", "application/pdf", 100);
    expect(fail).toHaveProperty("ok", false);
    if (!fail.ok) {
      expect(Object.keys(fail).sort()).toEqual(["code", "ok", "reason"]);
    }
  });

  it("parseFinalizeEntries returns ParseResult with stable shape", () => {
    const ok = parseFinalizeEntries([
      { path: "recaps/x/1.jpg", name: "1.jpg", type: "image/jpeg", size: 500 },
    ]);
    expect(ok).toEqual({
      ok: true,
      entries: [{ path: "recaps/x/1.jpg", name: "1.jpg", type: "image/jpeg", size: 500 }],
    });

    const bad = parseFinalizeEntries(null);
    expect(bad).toHaveProperty("ok", false);
    if (!bad.ok) {
      const codes: ValidationCode[] = ["code"];
      codes.forEach((key) => {
        expect(bad).toHaveProperty(key);
      });
    }
  });
});
