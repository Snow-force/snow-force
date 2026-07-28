import {
  validateUploadCandidate,
  type FinalizeEntry,
  type UploadCandidate,
} from "@/lib/recaps/upload-signing";

export type UploadPhase = "idle" | "signing" | "uploading" | "finalizing" | "error";

export function isUploadBusy(phase: UploadPhase): boolean {
  return phase === "signing" || phase === "uploading" || phase === "finalizing";
}

export type UploadProgress = {
  phase: UploadPhase;
  done: number;
  total: number;
};

export type SignedEntry = {
  path: string;
  token: string;
  name: string;
  type: string;
  size: number;
};

export type SignedUploadClient = {
  sign(input: { slug: string; candidates: UploadCandidate[] }): Promise<
    { ok: true; signed: SignedEntry[] } | { ok: false; code: string; reason: string }
  >;
  uploadToSignedUrl(
    entry: SignedEntry,
    file: File,
  ): Promise<{ ok: true } | { ok: false; error: unknown }>;
  abort(input: { slug: string; paths: string[] }): Promise<void>;
  finalize(formData: FormData): Promise<void>;
};

export type UploadBatchOptions = {
  slug: string;
  files: File[];
  draftPayload: string;
  onProgress(progress: UploadProgress): void;
};

export class UploadOrchestrationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function validateUploadFile(file: File): UploadCandidate {
  const validation = validateUploadCandidate(file.name, file.type, file.size);
  if (!validation.ok) {
    throw new UploadOrchestrationError("invalid", validation.reason);
  }
  return validation.candidate;
}

export function isNextRedirectError(error: unknown): boolean {
  const digest =
    error instanceof Error ? Object.getOwnPropertyDescriptor(error, "digest")?.value : undefined;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export async function uploadRecapMediaBatch(
  client: SignedUploadClient,
  options: UploadBatchOptions,
): Promise<void> {
  const { slug, files, draftPayload, onProgress } = options;

  if (files.length === 0) {
    throw new UploadOrchestrationError("missing", "No file selected.");
  }

  onProgress({ phase: "signing", done: 0, total: files.length });

  const candidates: UploadCandidate[] = [];
  for (const file of files) {
    candidates.push(validateUploadFile(file));
  }

  let signResult: Awaited<ReturnType<SignedUploadClient["sign"]>>;
  try {
    signResult = await client.sign({ slug, candidates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signing failed.";
    throw new UploadOrchestrationError("sign_failed", message);
  }
  if (!signResult.ok) {
    throw new UploadOrchestrationError("sign_failed", signResult.reason);
  }

  const signed = signResult.signed;
  const signedPaths = signed.map((entry) => entry.path);
  if (signed.length !== files.length) {
    await client.abort({ slug, paths: signedPaths });
    throw new UploadOrchestrationError(
      "sign_failed",
      "Signed upload response did not match selected files.",
    );
  }
  onProgress({ phase: "uploading", done: 0, total: signed.length });

  const uploaded: FinalizeEntry[] = [];
  for (let i = 0; i < signed.length; i += 1) {
    const entry = signed[i];
    const file = files[i];
    const uploadResult = await client.uploadToSignedUrl(entry, file);
    if (!uploadResult.ok) {
      await client.abort({ slug, paths: signedPaths });
      throw new UploadOrchestrationError("upload", "Upload failed.");
    }
    uploaded.push({
      path: entry.path,
      name: entry.name,
      type: entry.type,
      size: entry.size,
    });
    onProgress({ phase: "uploading", done: i + 1, total: signed.length });
  }

  onProgress({ phase: "finalizing", done: signed.length, total: signed.length });

  const formData = new FormData();
  formData.append("slug", slug);
  formData.append("recapPayload", draftPayload);
  formData.append("uploaded", JSON.stringify(uploaded));

  try {
    await client.finalize(formData);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    await client.abort({ slug, paths: signedPaths });
    const message = error instanceof Error ? error.message : "Finalize failed.";
    throw new UploadOrchestrationError("finalize_failed", message);
  }
}
