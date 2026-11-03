"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language";
import type { BookingView } from "@/lib/registrations/v2/repository";
import { bookingStatusLabel } from "@/lib/registrations/v2/status-labels";
import { createCheckoutSessionAction } from "@/lib/payments/actions";
import { confirmMemberPendingRegistrationAction } from "@/lib/members/actions";
import {
  cancelBookingPlaceAction,
  manageBookingWaiverAction,
} from "@/lib/registrations/v2/actions";

export function EventBookingList({ bookings }: { bookings: BookingView[] }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  if (!bookings.length) return null;
  return (
    <section
      aria-label={t({ en: "Group bookings", zh: "多人报名" })}
      className="mx-auto w-full max-w-6xl space-y-5 py-6"
    >
      <h2 className="text-xl font-semibold">
        {t({ en: "Your participant bookings", zh: "你的多人报名" })}
      </h2>
      {bookings.map((b) => (
        <div key={b.id} className="card space-y-4">
          <h3 className="font-semibold">
            <a href={`/events/${b.eventSlug}`} className="underline">
              {b.eventSlug}
            </a>
          </h3>
          <p className="break-all text-xs text-gray-600">
            {t({ en: "Booking", zh: "报名单" })}: {b.id}
          </p>
          <p className="text-sm">
            {t({
              en: "Total quoted for separate payments",
              zh: "独立付款报价合计",
            })}
            :{" "}
            {b.participants
              .reduce((sum, p) => sum + p.quotedAmount, 0)
              .toFixed(2)}{" "}
            {b.participants[0]?.currency.toUpperCase()}
          </p>
          <p className="text-sm">
            {
              b.participants.filter(
                (p) => p.registrationId && p.status !== "cancelled",
              ).length
            }
            /{b.participants.length}{" "}
            {t({ en: "individual places confirmed", zh: "个人名额已确认" })}
          </p>
          {b.participants.map((p) => (
            <div key={p.id} className="space-y-2 rounded-xl border p-4">
              <p className="font-semibold">
                {p.name} ·{" "}
                {t(
                  p.kind === "self"
                    ? { en: "Myself", zh: "本人" }
                    : { en: "Friend", zh: "朋友" },
                )}
              </p>
              <p className="text-sm">
                {p.quotedAmount} {p.currency.toUpperCase()} ·{" "}
                {t({
                  en: "Final price and coupon availability are checked again before payment",
                  zh: "付款前将再次核验最终价格及优惠资格",
                })}
              </p>
              {p.reviewRequired && (
                <p role="note" className="text-sm text-amber-900">
                  {t({
                    en: "Similar attendee details need staff review before entry. A shared family email alone does not prove a duplicate.",
                    zh: "参加者资料相近，入场前需工作人员核验；家人共用邮箱不单独构成重复报名。",
                  })}
                </p>
              )}
              <p className="text-sm">
                {t({ en: "Place / payment", zh: "名额 / 付款" })}:{" "}
                {t(bookingStatusLabel(p.status))} ·{" "}
                {t({ en: "Approval", zh: "审批" })}:{" "}
                {t(bookingStatusLabel(p.approvalStatus))}
              </p>
              <p className="text-sm">
                {t({ en: "Waiver", zh: "免责" })}:{" "}
                {t(bookingStatusLabel(p.waiverStatus))} ·{" "}
                {t(
                  p.signerRole === "unconfirmed"
                    ? { en: "Age confirmed at signing", zh: "签署时确认年龄" }
                    : p.signerRole === "guardian"
                      ? { en: "Guardian", zh: "监护人" }
                      : { en: "Attendee", zh: "本人" },
                )}{" "}
                {p.recipient}
              </p>
              <p className="text-sm">
                {t({ en: "Email delivery", zh: "邮件投递" })}:{" "}
                {t(bookingStatusLabel(p.deliveryStatus))}
              </p>
              {["retrying", "failed", "bounced", "complained"].includes(
                p.deliveryStatus,
              ) && (
                <p role="status" className="text-sm text-amber-900">
                  {t({
                    en: "The email has not been delivered successfully. Check the signer’s address or contact staff; your payment is retained.",
                    zh: "邮件尚未成功送达。请核对签署人地址或联系工作人员；付款记录仍保留。",
                  })}
                </p>
              )}
              {p.pendingId &&
                (p.paymentModel === "free" ? (
                  <form action={confirmMemberPendingRegistrationAction}>
                    <input type="hidden" name="pendingId" value={p.pendingId} />
                    <button className="btn-secondary">
                      {t({
                        en: "Confirm this free place",
                        zh: "确认此免费名额",
                      })}
                    </button>
                  </form>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      startTransition(async () => {
                        try {
                          const result =
                            await createCheckoutSessionAction(form);
                          if (result.success && result.url)
                            window.location.href = result.url;
                          else if (result.success && result.completed)
                            router.push("/member/trips");
                          else
                            setMessage(
                              result.success
                                ? t({
                                    en: "Refresh your member home to check this payment.",
                                    zh: "请刷新会员主页核对付款。",
                                  })
                                : result.error,
                            );
                        } catch {
                          setMessage(
                            t({
                              en: "Payment did not open. Your participant is saved; please retry.",
                              zh: "暂时无法打开付款页面；参加者资料已保存，请重试。",
                            }),
                          );
                        }
                      });
                    }}
                    className="space-y-2"
                  >
                    <input
                      type="hidden"
                      name="pendingRegistrationId"
                      value={p.pendingId}
                    />
                    <button disabled={pending} className="btn-secondary">
                      {t({
                        en: "Continue this person’s payment",
                        zh: "继续此人的付款",
                      })}
                    </button>
                  </form>
                ))}
              {p.assignmentId &&
                !["signed", "declined", "invalidated", "needs_review"].includes(
                  p.waiverStatus,
                ) && (
                  <>
                    <button
                      disabled={pending}
                      className="min-h-11 text-sm text-blue-700 underline"
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          const form = new FormData();
                          form.set("assignmentId", p.assignmentId!);
                          form.set("operation", "resend");
                          try {
                            const result =
                              await manageBookingWaiverAction(form);
                            setMessage(
                              t(
                                result.success
                                  ? {
                                      en: "Invitation queued for the designated signer",
                                      zh: "已为指定签署人排队发送邀请",
                                    }
                                  : {
                                      en: "Could not queue; wait a minute, check the address, or contact staff.",
                                      zh: "暂时无法发送，请稍后重试、检查地址或联系工作人员。",
                                    },
                              ),
                            );
                          } catch {
                            setMessage(t({ en: "Please retry", zh: "请重试" }));
                          }
                        })
                      }
                    >
                      {t({ en: "Resend to signer", zh: "向签署人重发" })}
                    </button>
                    <details className="text-sm">
                      <summary>
                        {t({
                          en: "Correct an unsigned recipient",
                          zh: "更正尚未签署的收件人",
                        })}
                      </summary>
                      <form
                        className="mt-2 space-y-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = new FormData(e.currentTarget);
                          startTransition(async () => {
                            try {
                              const result =
                                await manageBookingWaiverAction(form);
                              setMessage(
                                t(
                                  result.success
                                    ? {
                                        en: "New invitation queued; old link revoked",
                                        zh: "新邀请已排队，旧链接已撤销",
                                      }
                                    : {
                                        en: "Address could not be changed. Contact staff if already signed.",
                                        zh: "无法更改地址；已签署时请联系工作人员。",
                                      },
                                ),
                              );
                            } catch {
                              setMessage(
                                t({ en: "Please retry", zh: "请重试" }),
                              );
                            }
                          });
                        }}
                      >
                        <input
                          type="hidden"
                          name="assignmentId"
                          value={p.assignmentId}
                        />
                        <input type="hidden" name="operation" value="replace" />
                        <label className="block">
                          {t({ en: "Signer email", zh: "签署人邮箱" })}
                          <input
                            required
                            type="email"
                            name="email"
                            className="input-field"
                          />
                        </label>
                        {p.signerRole === "guardian" && (
                          <label className="block">
                            {t({
                              en: "Guardian’s legal name",
                              zh: "监护人法定全名",
                            })}
                            <input
                              required
                              name="guardianName"
                              className="input-field"
                            />
                          </label>
                        )}
                        <button disabled={pending} className="btn-secondary">
                          {t({ en: "Replace and send", zh: "替换并发送" })}
                        </button>
                      </form>
                    </details>
                  </>
                )}
              {p.registrationId && p.status !== "cancelled" && (
                <a
                  className="text-sm text-red-700 underline"
                  href="/member/trips#cancellations"
                >
                  {t({ en: "Request cancellation", zh: "申请取消报名" })}
                </a>
              )}
              {!p.registrationId &&
                p.status !== "cancelled" &&
                p.status !== "expired" && (
                  <button
                    type="button"
                    disabled={pending}
                    className="min-h-11 text-sm text-red-700 underline"
                    onClick={() =>
                      startTransition(async () => {
                        if (
                          !window.confirm(
                            t({
                              en: "Discard this unpaid place? Payments in progress must be verified first.",
                              zh: "确认放弃此未付款名额？进行中的付款须先核对。",
                            }),
                          )
                        )
                          return;
                        try {
                          const result = await cancelBookingPlaceAction(
                            p.pendingId,
                            p.registrationId,
                          );
                          setMessage(
                            t(
                              result.success
                                ? {
                                    en: "Unpaid place discarded.",
                                    zh: "未付款名额已放弃。",
                                  }
                                : {
                                    en: "Contact staff: cancellation policy or an in-progress payment requires review. No automatic refund was made.",
                                    zh: "请联系工作人员：取消条款或进行中的付款需要核验，系统未自动退款。",
                                  },
                            ),
                          );
                        } catch {
                          setMessage(
                            t({
                              en: "Cancellation unavailable; contact staff.",
                              zh: "暂时无法取消，请联系工作人员。",
                            }),
                          );
                        }
                      })
                    }
                  >
                    {t({ en: "Discard unpaid place", zh: "放弃未付款名额" })}
                  </button>
                )}
            </div>
          ))}
        </div>
      ))}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
