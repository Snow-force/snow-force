"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { useLanguage } from "@/lib/language";
import {
  deleteRecapMediaAction,
  moveRecapMediaAction,
  setRecapCoverAction,
  updateRecapMediaCaptionAction,
  uploadRecapMediaAction,
} from "@/lib/recaps/actions";
import type { EventRecap } from "@/lib/types";
import { adminCopy } from "./admin-copy";

type RecapMediaManagerProps = {
  recap: EventRecap;
  draftPayload: string;
};

function DraftPayloadInput({ value }: { value: string }) {
  return <input type="hidden" name="recapPayload" value={value} />;
}

function UploadSubmitButton({ label }: { label: string }) {
  const { t } = useLanguage();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary mt-3 px-4 py-2 text-sm disabled:opacity-60"
    >
      {pending ? t({ en: "Uploading…", zh: "上传中…" }) : label}
    </button>
  );
}

export function RecapMediaManager({ recap, draftPayload }: RecapMediaManagerProps) {
  const { t } = useLanguage();
  const [advancedId, setAdvancedId] = useState<string | undefined>();

  return (
    <section className="card space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.recapEditor.media)}</h3>
        <p className="mt-1 text-sm text-gray-500">
          {t(adminCopy.recapEditor.mediaHelp)}
        </p>
      </div>

      <form action={uploadRecapMediaAction} encType="multipart/form-data" className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
        <input type="hidden" name="slug" value={recap.slug} />
        <DraftPayloadInput value={draftPayload} />
        <label className="block text-sm font-medium text-gray-700">
          {t(adminCopy.recapEditor.selectPhotos)}
          <input
            name="mediaFiles"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="mt-2 block w-full text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          />
        </label>
        <UploadSubmitButton label={t(adminCopy.recapEditor.uploadSelectedPhotos)} />
      </form>

      {recap.media.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
          {t(adminCopy.recapEditor.noPhotos)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recap.media.map((item, index) => (
            <article key={item.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="relative h-40 bg-gray-100">
                <img src={item.url} alt="" className="h-full w-full object-cover" />
                {item.isCover ? (
                  <span className="absolute left-2 top-2 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {t(adminCopy.recapEditor.cover)}
                  </span>
                ) : null}
              </div>
              <div className="space-y-2 p-3">
                <div className="flex flex-wrap gap-1">
                  <form action={moveRecapMediaAction}>
                    <input type="hidden" name="slug" value={recap.slug} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <input type="hidden" name="direction" value="up" />
                    <DraftPayloadInput value={draftPayload} />
                    <button disabled={index === 0} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40">
                      ↑
                    </button>
                  </form>
                  <form action={moveRecapMediaAction}>
                    <input type="hidden" name="slug" value={recap.slug} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <input type="hidden" name="direction" value="down" />
                    <DraftPayloadInput value={draftPayload} />
                    <button disabled={index === recap.media.length - 1} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40">
                      ↓
                    </button>
                  </form>
                  <form action={setRecapCoverAction}>
                    <input type="hidden" name="slug" value={recap.slug} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <DraftPayloadInput value={draftPayload} />
                    <button className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">
                      {t(adminCopy.recapEditor.setCover)}
                    </button>
                  </form>
                  <form action={deleteRecapMediaAction}>
                    <input type="hidden" name="slug" value={recap.slug} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <DraftPayloadInput value={draftPayload} />
                    <button className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                      {t(adminCopy.editor.delete)}
                    </button>
                  </form>
                </div>
                <button
                  type="button"
                  onClick={() => setAdvancedId(advancedId === item.id ? undefined : item.id)}
                  className="text-xs font-medium text-snow-600"
                >
                  {t(adminCopy.recapEditor.advancedSettings)}
                </button>
                {advancedId === item.id ? (
                  <form action={updateRecapMediaCaptionAction} className="space-y-2 rounded bg-gray-50 p-2">
                    <input type="hidden" name="slug" value={recap.slug} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <DraftPayloadInput value={draftPayload} />
                    <label className="block text-xs text-gray-600">
                      {t(adminCopy.recapEditor.captionZhOptional)}
                      <input name="caption.zh" defaultValue={item.caption?.zh ?? ""} className="mt-1 w-full rounded border border-gray-200 px-2 py-1" />
                    </label>
                    <label className="block text-xs text-gray-600">
                      {t(adminCopy.recapEditor.captionEnOptional)}
                      <input name="caption.en" defaultValue={item.caption?.en ?? ""} className="mt-1 w-full rounded border border-gray-200 px-2 py-1" />
                    </label>
                    <button className="rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white">
                      {t(adminCopy.editor.save)}
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
