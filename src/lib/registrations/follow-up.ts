import type { Event, Registration } from "@/lib/types";

export const followUpKinds = ["cancellation", "refund", "approval", "balance", "deposit"] as const;
export type FollowUpKind = typeof followUpKinds[number];
export type RegistrationFollowUp = { registration: Registration; kind: FollowUpKind };

export const followUpLabels: Record<FollowUpKind, { en: string; zh: string }> = {
  cancellation: { en: "Cancellation review", zh: "取消审核" },
  refund: { en: "Refund settlement", zh: "退款结算" },
  approval: { en: "Registration approval", zh: "报名审批" },
  balance: { en: "Balance follow-up", zh: "尾款跟进" },
  deposit: { en: "Deposit follow-up", zh: "定金跟进" },
};

export function buildRegistrationFollowUps(
  registrations: Registration[],
  paymentModel: Event["paymentModel"] | undefined,
  pendingCancellationIds: string[] = [],
): RegistrationFollowUp[] {
  const cancellations = new Set(pendingCancellationIds);
  const items: RegistrationFollowUp[] = [];
  for (const registration of registrations) {
    const finance = registration.finance;
    let kind: FollowUpKind | undefined;
    if (cancellations.has(registration.id)) kind = "cancellation";
    else if (finance?.settlementStatus === "pending_refund") kind = "refund";
    else if (registration.status !== "cancelled" && registration.approvalStatus === "pending") kind = "approval";
    else if (registration.status === "confirmed" && registration.approvalStatus !== "rejected") {
      if (finance?.settlementStatus === "pending_balance") kind = "balance";
      else if (paymentModel && paymentModel !== "free" && finance?.depositStatus === "pending" &&
        finance.depositAmount !== null && finance.depositAmount > 0) kind = "deposit";
    }
    if (kind) items.push({ registration, kind });
  }
  return items.sort((a, b) => followUpKinds.indexOf(a.kind) - followUpKinds.indexOf(b.kind) ||
    a.registration.createdAt.localeCompare(b.registration.createdAt) || a.registration.id.localeCompare(b.registration.id));
}

export function followUpDraft(item: RegistrationFollowUp, eventTitle: string, lang: "en" | "zh") {
  const messages: Record<FollowUpKind, { en: string; zh: string }> = {
    cancellation: { en: "We have received the cancellation request and are reviewing it. We will confirm the decision and any applicable refund separately.", zh: "我们已收到取消申请，正在审核。审核结果及适用退款将另行确认。" },
    refund: { en: "We are reviewing the refund settlement for this registration. We will confirm the amount and processing status after verification.", zh: "我们正在核对这份报名的退款结算，核实后将确认金额和处理状态。" },
    approval: { en: "This registration is awaiting staff review. We will follow up once a decision is available.", zh: "这份报名正在等待工作人员审核，有结果后我们会及时联系。" },
    balance: { en: "Our records show a balance needing review. Please check your payment records with us so we can confirm the amount and next steps. If you have already paid, please share your payment reference before making another payment.", zh: "目前记录显示有尾款待核对。请与我们核对付款记录，以便确认金额和后续步骤。如已付款，请先提供付款凭证，避免重复付款。" },
    deposit: { en: "Our records show a pending deposit for this registration. If you have already paid, please share your payment reference so we can reconcile it before any further payment.", zh: "目前记录显示这份报名的定金待付。如已付款，请提供付款凭证，以便先核对记录，避免重复付款。" },
  };
  return lang === "zh"
    ? `您好，关于 ${item.registration.contactName} 的「${eventTitle}」报名：\n\n${messages[item.kind].zh}\n\n谢谢！\nSnowForce 团队`
    : `Hello, regarding ${item.registration.contactName}'s registration for ${eventTitle}:\n\n${messages[item.kind].en}\n\nThank you,\nThe SnowForce team`;
}
