import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getAllRecaps, updateRecap } from "@/lib/recaps/repository";

export async function POST(request: Request) {
  await requireAdmin();
  const formData = await request.formData();
  const slug = String(formData.get("slug") ?? "");
  const status = String(formData.get("status") ?? "");

  if (slug && ["draft", "published"].includes(status)) {
    await updateRecap(slug, { status: status as "draft" | "published" });
    revalidatePath("/");
    revalidatePath("/recaps");
    revalidatePath(`/recaps/${slug}`);
    revalidatePath("/admin/recaps");
  }

  return NextResponse.json(await getAllRecaps());
}
