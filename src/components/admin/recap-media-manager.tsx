"use client";

import { useMemo, useState } from "react";

import { useLanguage } from "@/lib/language";
import { optimizeImageFile } from "@/lib/images/client-image-optimizer";
import {
  abortRecapMediaUploadAction,
  finalizeRecapMediaUploadAction,
  signRecapMediaUploadAction,
} from "@/lib/recaps/actions";
import { RECAP_MEDIA_BUCKET, validateUploadCandidate } from "@/lib/recaps/upload-signing";
import { createClient } from "@/lib/supabase/client";
import type { EventRecap } from "@/lib/types";

import { adminCopy } from "./admin-copy";
import { RECAP_MEDIA_ERRORS } from "./recap-editor-notice";
import { RecapMediaGallery } from "./recap-media-gallery";
import {
  type SignedUploadClient,
  type UploadProgress,
  isUploadBusy,
  isNextRedirectError,
  UploadOrchestrationError,
  uploadRecapMediaBatch,
} from "./recap-media-upload";

type RecapMediaManagerProps = {
  recap: EventRecap;
  draftPayload: string;
};

function formatUploadMessage(
  template: { en: string; zh: string },
  values: Record<string, string>,
): { en: string; zh: string } {
  const replace = (text: string) =>
    Object.entries(values).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, value), text);
  return { en: replace(template.en), zh: replace(template.zh) };
}

export function RecapMediaManager({ recap, draftPayload }: RecapMediaManagerProps) {
  const { t } = useLanguage();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<UploadProgress["phase"]>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const busy = isUploadBusy(phase);
  const browserClient = useMemo(() => createClient(), []);

  const client = useMemo<SignedUploadClient>(
    () => ({
      sign: (input) => signRecapMediaUploadAction(input),
      uploadToSignedUrl: async (entry, file) => {
        const { error } = await browserClient
          .storage.from(RECAP_MEDIA_BUCKET)
          .uploadToSignedUrl(entry.path, entry.token, file, {
            contentType: file.type,
            cacheControl: "31536000",
          });
        return error ? { ok: false, error } : { ok: true };
      },
      abort: async (input) => {
        await abortRecapMediaUploadAction(input);
      },
      finalize: finalizeRecapMediaUploadAction,
    }),
    [browserClient],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || selectedFiles.length === 0) return;

    setPhase("idle");
    setProgress({ done: 0, total: 0 });
    setErrorCode(null);
    const validations = selectedFiles.map((file) =>
      validateUploadCandidate(file.name, file.type, file.size),
    );
    if (validations.some((validation) => !validation.ok)) {
      setPhase("error");
      setErrorCode("invalid");
      return;
    }

    try {
      setPhase("signing");
      const optimizedFiles: File[] = [];
      for (const file of selectedFiles) {
        optimizedFiles.push(await optimizeImageFile(file, { maxDimension: 2400, quality: 0.82 }));
      }
      await uploadRecapMediaBatch(client, {
        slug: recap.slug,
        files: optimizedFiles,
        draftPayload,
        onProgress: ({ phase: nextPhase, done, total }) => {
          setPhase(nextPhase);
          setProgress({ done, total });
        },
      });
    } catch (error) {
      if (isNextRedirectError(error)) throw error;
      setPhase("error");
      setErrorCode(error instanceof UploadOrchestrationError ? error.code : "upload");
    }
  };

  const errorMessage =
    Object.entries(RECAP_MEDIA_ERRORS).find(([key]) => key === errorCode)?.[1] ??
    RECAP_MEDIA_ERRORS.upload;
  const statusText = (() => {
    if (phase === "signing") return t(adminCopy.recapEditor.signingMedia);
    if (phase === "uploading") {
      return t(
        formatUploadMessage(adminCopy.recapEditor.uploadingMedia, {
          done: String(progress.done),
          total: String(progress.total),
        }),
      );
    }
    if (phase === "finalizing") return t(adminCopy.recapEditor.finalizingMedia);
    if (phase === "error") {
      return t(formatUploadMessage(adminCopy.recapEditor.uploadFailed, { reason: t(errorMessage) }));
    }
    return null;
  })();

  return (
    <section className="card space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.recapEditor.media)}</h3>
        <p className="mt-1 text-sm text-gray-500">{t(adminCopy.recapEditor.mediaHelp)}</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4"
      >
        <label className="block text-sm font-medium text-gray-700">
          {t(adminCopy.recapEditor.selectPhotos)}
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={busy}
            onChange={(event) => {
              setSelectedFiles(Array.from(event.currentTarget.files ?? []));
              setPhase("idle");
              setProgress({ done: 0, total: 0 });
              setErrorCode(null);
            }}
            className="mt-2 block w-full text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white disabled:opacity-60"
          />
        </label>

        {selectedFiles.length > 0 ? (
          <p className="mt-2 text-xs text-gray-500">
            {selectedFiles.length}{" "}
            {selectedFiles.length === 1
              ? t({ en: "file selected", zh: "个文件已选择" })
              : t({ en: "files selected", zh: "个文件已选择" })}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || selectedFiles.length === 0}
          className="btn-primary mt-3 px-4 py-2 text-sm disabled:opacity-60"
        >
          {t(adminCopy.recapEditor.uploadSelectedPhotos)}
        </button>

        {statusText ? (
          <div
            className={`mt-3 text-sm font-medium ${phase === "error" ? "text-red-600" : "text-blue-700"}`}
            role="status"
          >
            {statusText}
          </div>
        ) : null}
      </form>

      <RecapMediaGallery recap={recap} draftPayload={draftPayload} busy={busy} />
    </section>
  );
}
