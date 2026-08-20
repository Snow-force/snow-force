import { describe, expect, it } from "vitest";

import {
  type SignedUploadClient,
  UploadOrchestrationError,
  isUploadBusy,
  uploadRecapMediaBatch,
} from "./recap-media-upload";

function makeFile(name: string): File {
  return new File([new Uint8Array(100)], name, { type: "image/jpeg" });
}

function makeClient(overrides: Partial<SignedUploadClient>): SignedUploadClient {
  return {
    sign: async ({ candidates }) => ({
      ok: true,
      signed: candidates.map((candidate, index) => ({
        path: `recaps/slug/${index}-${candidate.name}`,
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

function upload(files: File[], client: SignedUploadClient): Promise<void> {
  return uploadRecapMediaBatch(client, {
    slug: "slug",
    files,
    draftPayload: "{}",
    onProgress: () => {},
  });
}

async function expectUploadError(
  operation: Promise<void>,
  code: string,
): Promise<void> {
  try {
    await operation;
    throw new Error("Expected upload to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(UploadOrchestrationError);
    if (error instanceof UploadOrchestrationError) {
      expect(error.code).toBe(code);
      return;
    }
    throw error;
  }
}

describe("isUploadBusy", () => {
  it("permits immediate retry after an error while locking active phases", () => {
    expect(isUploadBusy("idle")).toBe(false);
    expect(isUploadBusy("error")).toBe(false);
    expect(isUploadBusy("optimizing")).toBe(true);
    expect(isUploadBusy("signing")).toBe(true);
    expect(isUploadBusy("uploading")).toBe(true);
    expect(isUploadBusy("finalizing")).toBe(true);
  });
});

describe("uploadRecapMediaBatch failure cleanup", () => {
  it("wraps a signing exception as sign_failed", async () => {
    const client = makeClient({
      sign: async () => {
        throw new Error("signing unavailable");
      },
    });

    await expectUploadError(upload([makeFile("a.jpg")], client), "sign_failed");
  });

  it("aborts every signed path when finalization fails", async () => {
    const abortedPaths: string[] = [];
    const client = makeClient({
      abort: async ({ paths }) => {
        abortedPaths.push(...paths);
      },
      finalize: async () => {
        throw new Error("save failed");
      },
    });

    await expectUploadError(upload([makeFile("a.jpg"), makeFile("b.jpg")], client), "finalize_failed");

    expect(abortedPaths).toEqual(["recaps/slug/0-a.jpg", "recaps/slug/1-b.jpg"]);
  });

  it("aborts signed paths without uploading when the signed count mismatches files", async () => {
    const abortedPaths: string[] = [];
    let uploadCalls = 0;
    const client = makeClient({
      sign: async () => ({
        ok: true,
        signed: [
          {
            path: "recaps/slug/0-a.jpg",
            token: "token-0",
            name: "a.jpg",
            type: "image/jpeg",
            size: 100,
          },
        ],
      }),
      uploadToSignedUrl: async () => {
        uploadCalls += 1;
        return { ok: true };
      },
      abort: async ({ paths }) => {
        abortedPaths.push(...paths);
      },
    });

    await expectUploadError(upload([makeFile("a.jpg"), makeFile("b.jpg")], client), "sign_failed");

    expect(uploadCalls).toBe(0);
    expect(abortedPaths).toEqual(["recaps/slug/0-a.jpg"]);
  });
});
