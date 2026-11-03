"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { getRegistration, updateRegistrationStatus } from "./repository";
import { hasUnrefundedPayment } from "./cancellation";

export async function cancelRegistration(formData: FormData) {
  const staff = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const fallbackEvent = String(formData.get("returnEvent") ?? "").trim();
  const returnTo = (event: string, notice: string): never => {
    redirect(`/admin/registrations?${new URLSearchParams({ event, notice })}`);
  };
  if (formData.get("confirmation") !== "CANCEL") {
    returnTo(fallbackEvent, "Type CANCEL to confirm cancellation. / 请输入 CANCEL 确认取消。");
  }
  const registration = id ? await getRegistration(id) : undefined;
  if (!registration) return returnTo(fallbackEvent, "Registration was not found.");
  if (hasUnrefundedPayment(registration) && staff.role !== "admin") {
    returnTo(registration.eventSlug, "Admin approval is required to cancel a paid registration. / 已付款报名需管理员确认取消。");
  }
  if (registration.status !== "cancelled") {
    const updated = await updateRegistrationStatus(registration.id, "cancelled");
    if (!updated) returnTo(registration.eventSlug, "Cancellation failed. Reload and try again.");
    revalidatePath("/admin/registrations");
    revalidatePath("/member");
    revalidatePath("/member/trips");
    revalidatePath("/events");
    revalidatePath(`/events/${registration.eventSlug}`);
  }
  returnTo(registration.eventSlug, "Registration cancelled. No refund was issued. / 报名已取消，未执行退款。");
}
