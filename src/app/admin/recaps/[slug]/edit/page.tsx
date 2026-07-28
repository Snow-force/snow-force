import { RecapEditorForm } from "@/components/admin/recap-editor-form";
import {
  RECAP_MEDIA_ERRORS,
  RecapEditorNotice,
  type RecapMediaErrorKey,
} from "@/components/admin/recap-editor-notice";
import { getRecapAdmin } from "@/lib/recaps/repository";

const SAVED_NOTICE = { en: "Recap saved.", zh: "回顾已保存。" } as const;

export default async function RecapEditPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { saved?: string; mediaError?: string; translationWarning?: string };
}) {
  const recap = await getRecapAdmin(params.slug);

  if (!recap) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-xl font-semibold text-gray-900">Recap not found</h2>
      </div>
    );
  }

  const saved = searchParams.saved === "1";
  const mediaErrorKey = searchParams.mediaError as RecapMediaErrorKey | undefined;
  const mediaError = mediaErrorKey && mediaErrorKey in RECAP_MEDIA_ERRORS ? RECAP_MEDIA_ERRORS[mediaErrorKey] : null;
  const translationWarning = searchParams.translationWarning === "1";
  const noticeKind = saved ? "success" : mediaError ? "error" : null;
  const noticeText = translationWarning
    ? { en: "Recap saved in English. Chinese translation could not be refreshed.", zh: "Recap saved in English. Chinese translation could not be refreshed." }
    : saved ? SAVED_NOTICE : mediaError ?? { en: "", zh: "" };

  return (
    <div className="space-y-4">
      <RecapEditorNotice kind={noticeKind} text={noticeText} />
      <RecapEditorForm recap={recap} />
    </div>
  );
}
