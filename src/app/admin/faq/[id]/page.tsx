import { notFound } from "next/navigation";
import { getFAQ } from "@/lib/faqs/repository";
import { requireAdmin } from "@/lib/auth/admin";
import { FaqEditorForm } from "@/components/admin/faq-editor-form";

export default async function AdminFAQEditorPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requireAdmin();

  const isNew = params.id === "new";
  const faq = isNew ? null : getFAQ(params.id);

  if (!isNew && !faq) {
    notFound();
  }

  const initialData = isNew ? null : faq!;

  return (
    <div>
      <FaqEditorForm initialData={initialData} />
    </div>
  );
}
