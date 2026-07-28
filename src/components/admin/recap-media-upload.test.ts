import { describe, expect, it } from "vitest";

import {
  type SignedUploadClient,
  type UploadBatchOptions,
  type UploadProgress,
  UploadOrchestrationError,
  uploadRecapMediaBatch,
  validateUploadFile,
} from "./recap-media-upload";

function makeFile(name: string, type: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type });
}

function createClient(overrides?: Partial<SignedUploadClient>): SignedUploadClient {
  return {
    sign: async ({ candidates }) => ({
      ok: true,
      signed: candidates.map((candidate, index) => ({
        path: `recaps/slug/${index + 1}-${candidate.name}`,
        token: `token-${index}`,
        name: candidate.name,
        type: candidate.type,
        size: candidate.size,
      })),
    }),
    uploadToSignedUrl: async () => ({ ok: true }),
    abort: async () => {},
    finalize: async () => {},
    ...overrides,
  };
}

function createOptions(files: File[]): UploadBatchOptions {
  return {
    slug: "slug",
    files,
    draftPayload: JSON.stringify({ title: { en: "Recap", zh: "回顾" } }),
    onProgress: () => {},
  };
}

describe("validateUploadFile", () => {
  it("accepts a valid image file", () => {
    const file = makeFile("photo.jpg", "image/jpeg");
    const candidate = validateUploadFile(file);
    expect(candidate).toEqual({ name: "photo.jpg", type: "image/jpeg", size: 100 });
  });

  it("rejects an empty file", () => {
    const file = makeFile("empty.jpg", "image/jpeg", 0);
    expect(() => validateUploadFile(file)).toThrow(UploadOrchestrationError);
    try {
      validateUploadFile(file);
    } catch (error) {
      expect(error).toBeInstanceOf(UploadOrchestrationError);
      if (error instanceof UploadOrchestrationError) {
        expect(error.code).toBe("invalid");
      }
    }
  });

  it("rejects unsupported MIME type", () => {
    const file = makeFile("doc.pdf", "application/pdf");
    expect(() => validateUploadFile(file)).toThrow(UploadOrchestrationError);
  });

  it("rejects oversized files", () => {
    const file = makeFile("big.jpg", "image/jpeg", 11 * 1024 * 1024);
    expect(() => validateUploadFile(file)).toThrow(UploadOrchestrationError);
  });
});

describe("uploadRecapMediaBatch", () => {
  it("reports signing, upload progress, and finalizing in order", async () => {
    const files = [makeFile("a.jpg", "image/jpeg"), makeFile("b.png", "image/png")];
    const progress: UploadProgress[] = [];
    const client = createClient();

    await uploadRecapMediaBatch(client, {
      ...createOptions(files),
      onProgress: (p) => progress.push(p),
    });

    expect(progress).toEqual([
      { phase: "signing", done: 0, total: 2 },
      { phase: "uploading", done: 0, total: 2 },
      { phase: "uploading", done: 1, total: 2 },
      { phase: "uploading", done: 2, total: 2 },
      { phase: "finalizing", done: 2, total: 2 },
    ]);
  });

  it("signs, uploads each file via signed URL, then finalizes with metadata", async () => {
    const files = [makeFile("a.jpg", "image/jpeg"), makeFile("b.png", "image/png")];
    const uploadedPaths: string[] = [];
    const finalizeForm = new FormData();
    const client = createClient({
      uploadToSignedUrl: async (entry, file) => {
        uploadedPaths.push(`${entry.path}:${file.name}`);
        return { ok: true };
      },
      finalize: async (formData) => {
        finalizeForm.append("slug", formData.get("slug") as string);
        finalizeForm.append("recapPayload", formData.get("recapPayload") as string);
        finalizeForm.append("uploaded", formData.get("uploaded") as string);
      },
    });

    await uploadRecapMediaBatch(client, createOptions(files));

    expect(uploadedPaths).toEqual([
      "recaps/slug/1-a.jpg:a.jpg",
      "recaps/slug/2-b.png:b.png",
    ]);
    expect(finalizeForm.get("slug")).toBe("slug");
    expect(finalizeForm.get("recapPayload")).toBe(createOptions(files).draftPayload);
    const uploaded = JSON.parse(finalizeForm.get("uploaded") as string);
    expect(uploaded).toEqual([
      { path: "recaps/slug/1-a.jpg", name: "a.jpg", type: "image/jpeg", size: 100 },
      { path: "recaps/slug/2-b.png", name: "b.png", type: "image/png", size: 100 },
    ]);
  });

  it("throws invalid without signing when any file is rejected", async () => {
    const files = [
      makeFile("a.jpg", "image/jpeg"),
      makeFile("big.jpg", "image/jpeg", 11 * 1024 * 1024),
    ];
    const client = createClient({
      sign: async () => {
        throw new Error("sign should not be called");
      },
    });

    await expect(uploadRecapMediaBatch(client, createOptions(files))).rejects.toThrow(
      UploadOrchestrationError,
    );

    try {
      await uploadRecapMediaBatch(client, createOptions(files));
    } catch (error) {
      expect(error).toBeInstanceOf(UploadOrchestrationError);
      if (error instanceof UploadOrchestrationError) {
        expect(error.code).toBe("invalid");
      }
    }
  });

  it("throws sign_failed and does not upload when signing fails", async () => {
    const files = [makeFile("a.jpg", "image/jpeg")];
    const client = createClient({
      sign: async () => ({
        ok: false as const,
        code: "recap_not_found",
        reason: "Recap not found.",
      }),
      uploadToSignedUrl: async () => {
        throw new Error("upload should not be called");
      },
      finalize: async () => {
        throw new Error("finalize should not be called");
      },
    });

    await expect(uploadRecapMediaBatch(client, createOptions(files))).rejects.toThrow(
      UploadOrchestrationError,
    );

    try {
      await uploadRecapMediaBatch(client, createOptions(files));
    } catch (error) {
      expect(error).toBeInstanceOf(UploadOrchestrationError);
      if (error instanceof UploadOrchestrationError) {
        expect(error.code).toBe("sign_failed");
      }
    }
  });

  it("aborts all signed paths and does not finalize when an upload fails", async () => {
    const files = [makeFile("a.jpg", "image/jpeg"), makeFile("b.png", "image/png")];
    const abortedPaths: string[] = [];
    let finalized = false;
    const client = createClient({
      uploadToSignedUrl: async (entry) => {
        if (entry.name === "a.jpg") {
          return { ok: true };
        }
        return { ok: false, error: new Error("network failure") };
      },
      abort: async ({ paths }) => {
        abortedPaths.push(...paths);
      },
      finalize: async () => {
        finalized = true;
      },
    });

    await expect(uploadRecapMediaBatch(client, createOptions(files))).rejects.toThrow(
      UploadOrchestrationError,
    );

    expect(abortedPaths).toEqual(["recaps/slug/1-a.jpg", "recaps/slug/2-b.png"]);
    expect(finalized).toBe(false);
  });

  it("does not abort when all uploads succeed", async () => {
    const files = [makeFile("a.jpg", "image/jpeg")];
    const abortedPaths: string[] = [];
    const client = createClient({
      abort: async ({ paths }) => {
        abortedPaths.push(...paths);
      },
    });

    await uploadRecapMediaBatch(client, createOptions(files));

    expect(abortedPaths).toEqual([]);
  });

  it("throws finalize_failed when finalization rejects", async () => {
    const files = [makeFile("a.jpg", "image/jpeg")];
    const client = createClient({
      finalize: async () => {
        throw new Error("database write failed");
      },
    });

    await expect(uploadRecapMediaBatch(client, createOptions(files))).rejects.toThrow(
      UploadOrchestrationError,
    );

    try {
      await uploadRecapMediaBatch(client, createOptions(files));
    } catch (error) {
      expect(error).toBeInstanceOf(UploadOrchestrationError);
      if (error instanceof UploadOrchestrationError) {
        expect(error.code).toBe("finalize_failed");
      }
    }
  });
});
