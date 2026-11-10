# Registration follow-up desk / 报名跟进工作台

The registration page now opens a conversation-oriented workspace above the existing cancellation and finance controls. Manual entry is available under **Add a registration / 手动添加报名**.

Select the event and apply existing attendee, booker, payment or approval filters. The desk uses that selection, so its counts describe the filtered records, not the whole organization. Each attendee appears once, with the next action chosen in this order:

1. Pending cancellation request.
2. Recorded pending refund settlement, including cancelled registrations.
3. Pending registration approval on a non-cancelled registration.
4. Recorded pending balance on a confirmed registration that has not been rejected.
5. Pending positive recorded deposit on a confirmed, non-rejected registration for a known paid event.

Free or unknown events, missing finance records, and waitlisted or cancelled registrations do not generate deposit reminders. These queues are based on existing records; they do not track every payment exception, refund operation, verified waiver or group participant. Keep using the existing payment exception notice, cancellation panel and group booking/waiver screen for those workflows.

Choose a queue, then an attendee. The desk shows the booker/contact email and the attendee email separately. Review the recipient, particularly for proxy registrations and shared contacts. Edit the generated English or Chinese draft before copying. If clipboard access fails, select the text and copy it manually. No messages are sent, no contact history is recorded, and no registration changes when a draft is copied. Draft edits are temporary and reset when the selected attendee, next action or language changes.

**Open attendee record** jumps to the exact existing finance/approval row and highlights it. Cancellation items also link to the existing cancellation review panel. Those controls retain their current permissions and confirmation steps. Refund settlement drafts describe review, never successful execution. Payment drafts ask staff and bookers to reconcile prior payments before any further payment. Refresh the page after changing a record.

## 中文速查

选择活动并应用原有筛选后，工作台按“取消审核 → 退款结算 → 报名审批 → 尾款 → 定金”显示下一步，每位参加者只出现一次。同类按报名时间从早到晚排列。

选择参加者，核对预订人／联系人与参加者邮箱，编辑消息草稿后复制，自行发送。复制不发送邮件、不记录沟通历史、不更改报名；参加者、下一步事项或语言变化时草稿会重置。可用“查看参加者记录”定位原有操作行；取消事项可进入原有审核面板。操作完成后请刷新。免责签署、多人报名及付款异常仍使用原有入口核对。

No new dependencies, environment variables or database migrations are required.
