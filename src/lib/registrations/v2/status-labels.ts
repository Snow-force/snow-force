const labels: Record<string, { en: string; zh: string }> = {
  confirmed: { en: "Place confirmed", zh: "名额已确认" }, pending_payment: { en: "Awaiting payment", zh: "待付款" },
  paid_requires_review: { en: "Payment received; staff review needed", zh: "已收到付款，待工作人员核对" },
  expired: { en: "Expired", zh: "已过期" }, cancelled: { en: "Cancelled", zh: "已取消" },
  not_sent: { en: "Awaiting email", zh: "待发送邮件" }, queued: { en: "Email queued", zh: "邮件排队中" },
  sending: { en: "Sending email", zh: "正在发送邮件" }, sent: { en: "Email sent", zh: "邮件已发出" },
  delivered: { en: "Email delivered", zh: "邮件已送达" }, bounced: { en: "Email returned", zh: "邮件被退回" },
  failed: { en: "Email failed; contact staff", zh: "邮件发送失败，请联系工作人员" }, complained: { en: "Email marked as spam", zh: "邮件被标记为垃圾邮件" },
  retrying: { en: "Retrying email delivery", zh: "正在重试邮件投递" },
  signed: { en: "Signed", zh: "已签署" }, declined: { en: "Declined", zh: "已拒签" },
  invalidated: { en: "Invitation revoked", zh: "邀请已撤销" }, needs_review: { en: "Awaiting identity / guardian review", zh: "待核验身份或监护资格" },
  pending: { en: "Awaiting staff approval", zh: "待工作人员审批" }, approved: { en: "Approved", zh: "已批准" },
  rejected: { en: "Declined by staff", zh: "工作人员未批准" }, not_required: { en: "No approval required", zh: "无需审批" },
};
export function bookingStatusLabel(status: string) { return labels[status] ?? { en: "Contact staff for status", zh: "请联系工作人员核对状态" }; }
