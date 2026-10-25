import { requireAdmin } from "@/lib/auth/admin";
import { getEventAdmin } from "@/lib/events/repository";
import { getWaiverPolicy, listEventBookings } from "@/lib/registrations/v2/repository";
import { saveWaiverPolicyAction, staffWaiverOperationAction } from "@/lib/registrations/v2/staff-actions";
import { notFound } from "next/navigation";

export default async function EventWaiversAdminPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireAdmin(); const { slug } = await params; const query = await searchParams;
  const event = await getEventAdmin(slug); if (!event) notFound();
  const [policy, bookings] = await Promise.all([getWaiverPolicy(slug), listEventBookings(undefined, slug)]);
  return <div className="space-y-6">
    <h1 className="text-xl font-semibold">Group registration & verified waivers / 多人报名与验证免责 · {event.title.en || event.slug}</h1>
    <p className="text-sm">V2 defaults off. Enabling requires approved adult and guardian terms with media/marketing consent separated, verified sending configuration and a recovery worker. Existing V1 signatures are retained. / 默认关闭；启用前须审定成人与监护人文本、独立媒体授权、邮件配置和恢复任务。</p>
    {query.error && <p role="alert" className="rounded border border-red-200 p-3 text-sm text-red-800">Action failed: {query.error}. Check configuration, reviewed terms, signature state and permissions. / 操作失败，请核对配置、审定条款、签署状态与权限。</p>}
    {query.saved && <p role="status">Saved / 已保存</p>}
    <form action={saveWaiverPolicyAction} className="space-y-4 rounded border bg-white p-5">
      <input type="hidden" name="eventSlug" value={slug} />
      <label className="block text-sm">Event time zone / 活动时区<input required name="timeZone" defaultValue={policy?.timeZone ?? "America/Los_Angeles"} className="mt-1 block w-full rounded border p-2" /></label>
      <div className="grid gap-5 lg:grid-cols-2">
        <label className="block text-sm">Adult attendee waiver / 成年参加者免责<textarea name="adultText" required minLength={100} defaultValue={policy?.adultText ?? ""} rows={16} className="mt-1 w-full rounded border p-2" /></label>
        <label className="block text-sm">Parent / legal guardian waiver / 父母或法定监护人免责<textarea name="guardianText" required minLength={100} defaultValue={policy?.guardianText ?? ""} rows={16} className="mt-1 w-full rounded border p-2" /></label>
      </div>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="legalReviewed" required />I confirm these event-specific adult and minor/guardian terms have been reviewed and that photo/marketing permissions are separate. Changing terms invalidates current signatures and requests new individual signatures; historical evidence remains. / 已审定适用条款并分离肖像和营销授权；变更将要求重新签署并保留历史证据。</label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="enabled" defaultChecked={policy?.enableGroupForm && policy.requireEmailedWaiver} />Enable V2 group form and mandatory emailed waivers for NEW bookings / 为新报名开启 V2 多人表单和邮箱验证免责</label>
      <button className="btn-primary">Save policy and rollout settings / 保存文本与发布设置</button>
    </form>
    <form action={staffWaiverOperationAction}><input type="hidden" name="eventSlug" value={slug} /><button name="operation" value="dispatch" className="btn-secondary">Process pending emails / 处理待发邮件</button></form>
    <p className="text-sm">For a paid rejected/cancelled place, review the payment and refund separately in <a href={`/admin/registrations?event=${slug}`} className="underline">registration management</a>. No automatic refunds. / 取消或拒绝不代表退款完成。</p>
    {bookings.map((b) => <section key={b.id} className="rounded border bg-white p-4"><h2 className="mb-3 break-all font-semibold">Booking / 报名单 {b.id}</h2>
      {b.participants.map((p) => <div key={p.id} className="space-y-3 border-t py-4 text-sm">
        <p className="font-semibold">{p.name} · {p.kind} · {p.status}</p><p>{p.signerRole} · {p.recipient} · waiver: {p.waiverStatus} · email: {p.deliveryStatus} · approval: {p.approvalStatus}</p>
        {p.accompanyingGuardian && <p>Under 14 / 14 岁以下 · Accompanying parent / guardian / 陪同监护人: {p.accompanyingGuardian} · {p.accompanimentPresent ? "Verified present / 已核验到场" : "Presence not verified / 待核验到场"}. If the guardian leaves, stop the child’s participation and record departure below. / 陪同人离开时须停止孩子参加并登记离场。</p>}
        <form action={staffWaiverOperationAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="eventSlug" value={slug} /><input type="hidden" name="assignmentId" value={p.assignmentId ?? ""} /><input type="hidden" name="registrationId" value={p.registrationId ?? ""} />
          <label className="flex items-start gap-2"><input type="checkbox" name="identityChecked" />I personally verified identity / guardian authority / 已人工核验身份或监护资格</label>
          {p.accompanyingGuardian && p.registrationId && <button name="operation" value={p.accompanimentPresent ? "accompany_left" : "accompany_verified"} className="min-h-11 rounded border px-3">{p.accompanimentPresent ? "Guardian left — stop participation / 陪同人离场，停止参加" : "Verify accompanying guardian present / 核验陪同监护人到场"}</button>}
          {p.assignmentId && !["signed", "invalidated", "declined", "needs_review"].includes(p.waiverStatus) && <button name="operation" value="resend" className="min-h-11 rounded border px-3">Resend / 重发</button>}
          {p.waiverStatus === "needs_review" && <button name="operation" value={p.signerRole === "guardian" ? "guardian_verified" : "identity_verified"} className="min-h-11 rounded border px-3">Confirm authority / identity / 确认资格或身份</button>}
          {p.approvalStatus === "pending" && <><button name="operation" value="approve" className="min-h-11 rounded border px-3">Approve attendance / 批准参加</button><button name="operation" value="reject" className="min-h-11 rounded border px-3">Reject & review refund / 拒绝并核对退款</button></>}
          {p.waiverStatus === "signed" && <button name="operation" value="checkin" className="min-h-11 rounded border px-3">Check in / 签到</button>}
          {p.assignmentId && <button name="operation" value="revoke" className="min-h-11 rounded border px-3 text-red-700">Revoke / 撤销</button>}
          {["invalidated", "declined"].includes(p.waiverStatus) && <button name="operation" value="reissue" className="min-h-11 rounded border px-3">Request a new signature / 要求重新签署</button>}
        </form>
      </div>)}
    </section>)}
  </div>;
}
