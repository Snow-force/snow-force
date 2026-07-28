"use client";

import { useState } from "react";

import { useLanguage } from "@/lib/language";
import {
  deleteRecapMediaAction,
  moveRecapMediaAction,
  setRecapCoverAction,
  updateRecapMediaCaptionAction,
} from "@/lib/recaps/actions";
import type { EventRecap } from "@/lib/types";

import { adminCopy } from "./admin-copy";

type RecapMediaGalleryProps = {
  recap: EventRecap;
  draftPayload: string;
  busy: boolean;
};

function DraftPayloadInput({ value }: { value: string }) {
  return <input type="hidden" name="recapPayload" value={value} />;
}

export function RecapMediaGallery({ recap, draftPayload, busy }: RecapMediaGalleryProps) {
  const { t } = useLanguage();
  const [advancedId, setAdvancedId] = useState<string | undefined>();

  if (recap.media.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
        {t(adminCopy.recapEditor.noPhotos)}
      </div>
    );
  }

  return (
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
                <button
                  disabled={index === 0 || busy}
                  className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                >
                  ↑
                </button>
              </form>
              <form action={moveRecapMediaAction}>
                <input type="hidden" name="slug" value={recap.slug} />
                <input type="hidden" name="mediaId" value={item.id} />
                <input type="hidden" name="direction" value="down" />
                <DraftPayloadInput value={draftPayload} />
                <button
                  disabled={index === recap.media.length - 1 || busy}
                  className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                >
                  ↓
                </button>
              </form>
              <form action={setRecapCoverAction}>
                <input type="hidden" name="slug" value={recap.slug} />
                <input type="hidden" name="mediaId" value={item.id} />
                <DraftPayloadInput value={draftPayload} />
                <button
                  disabled={busy}
                  className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                >
                  {t(adminCopy.recapEditor.setCover)}
                </button>
              </form>
              <form action={deleteRecapMediaAction}>
                <input type="hidden" name="slug" value={recap.slug} />
                <input type="hidden" name="mediaId" value={item.id} />
                <DraftPayloadInput value={draftPayload} />
                <button
                  disabled={busy}
                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  {t(adminCopy.editor.delete)}
                </button>
              </form>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setAdvancedId(advancedId === item.id ? undefined : item.id)}
              className="text-xs font-medium text-snow-600 disabled:opacity-40"
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
                  <input
                    name="caption.zh"
                    defaultValue={item.caption?.zh ?? ""}
                    disabled={busy}
                    className="mt-1 w-full rounded border border-gray-200 px-2 py-1 disabled:opacity-60"
                  />
                </label>
                <label className="block text-xs text-gray-600">
                  {t(adminCopy.recapEditor.captionEnOptional)}
                  <input
                    name="caption.en"
                    defaultValue={item.caption?.en ?? ""}
                    disabled={busy}
                    className="mt-1 w-full rounded border border-gray-200 px-2 py-1 disabled:opacity-60"
                  />
                </label>
                <button
                  disabled={busy}
                  className="rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                >
                  {t(adminCopy.editor.save)}
                </button>
              </form>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
