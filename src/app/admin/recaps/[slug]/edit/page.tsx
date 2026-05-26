import { RecapEditorForm } from "@/components/admin/recap-editor-form";
import { getRecapAdmin } from "@/lib/recaps/repository";

export default async function RecapEditPage({ params }: { params: { slug: string } }) {
  const recap = await getRecapAdmin(params.slug);

  if (!recap) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-xl font-semibold text-gray-900">Recap not found</h2>
      </div>
    );
  }

  return <RecapEditorForm recap={recap} />;
}
