# Admin operations desk / 运营工作台

The admin home at `/admin` is now a work queue rather than a recent-registration feed. It uses existing records and existing management screens. No new environment variables, database migrations, or AI service are required.

## Interactive staff guide / 交互式使用向导

At the top of `/admin`, choose **Start / resume guide** (开始／继续引导). Choose one of five workflows: Daily shift, Publish an event, Registrations & refunds, Check-in & recaps, or Merchants & lodging. Each step explains what to do, what to verify, and where to go. Module links open in a new tab so the guide stays available; links to the desk queue, inquiries, or shift brief scroll within the same page.

Use **Understood, continue** to record reading progress and move to the next step. You can revisit any step, go back, hide the guide, or restart the selected workflow. Progress resumes after navigation or reload in the same browser tab; it is not synced across staff accounts or devices and should not be treated as training certification. If browser storage is unavailable, the guide still works and explains that progress cannot be saved.

在 Ops 顶部点击 **开始／继续引导**，选择“每日值班、活动发布、报名与退款、现场与回顾、商家与住宿”。每一步都提供操作说明、核对提醒与对应入口。模块在新标签页打开，方便边看引导边操作；工作台内的链接直接定位到对应区域。

点击 **已了解，下一步** 记录阅读进度；可随时跳转步骤、返回、收起或重新学习当前流程。进度仅保存在当前标签页，不跨账号或设备同步，也不代表业务任务已经完成。浏览器禁用存储时，仍可使用引导，但离开或刷新后进度会丢失。

## Start a shift

1. Sign in at `/staff-login` using an existing staff account. Both managers and admins can view the desk; existing destination-screen permissions still control approvals, cancellations, refunds, and staff management.
2. Check for an amber **incomplete data** notice. It identifies failed sources. A dash in a total means unavailable, not zero. Use **Reload desk** and resolve data access before making operational decisions.
3. Work down **Your work queue**: cancellation requests, refund settlements, registration approvals, pending balances, recorded pending deposits, event drafts, then recap drafts. Within each type, older dates appear first. Draft events use their event date and recap drafts use their recap date.
4. Use **People**, **Payments**, or **Publishing**, or search for a name/event in English or Chinese. **Reset filters** restores the full queue.
5. Select a row to open the existing event/attendee-filtered registration screen or content editor. Verify the current record before acting. Registration links can show multiple attendees when they share a contact email; confirm the attendee name. Cancellation review remains in the existing review panel on that page.
6. Return to `/admin` and **Reload desk** after a change. The desk is a snapshot, not a live feed.

## Queue rules

- Each attendee has one next decision: a pending cancellation takes precedence over a refund settlement, approval, balance, or deposit. Refresh after resolving it to reveal the next applicable item.
- Refund settlement review is based on `settlementStatus=pending_refund`, including cancelled registrations. This is not a Stripe refund-processing monitor; verify actual refund operations in registration management.
- Pending balances are based on the recorded settlement status. A pending deposit requires a confirmed registration, a known paid event, a positive recorded deposit, and a pending deposit status. Free events, absent finance fields, waitlist deposits, paid deposits, and waived deposits do not create deposit reminders.
- Draft events and draft recaps appear as preparation work. Published, hidden, and archived content do not appear as drafts.
- The queue is not an inventory of every admin task. Merchant operations, lodging, check-in, reviews, and other existing modules remain accessible through navigation.

## Hand off a shift

Choose **Copy shift brief**. Paste the brief into your staff handoff channel yourself. It summarizes the full queue, even when search or category filters are active, using the current site language. It contains counts by task type, not attendee names, contact details, payment amounts, or inquiry messages. Incomplete data is explicitly included in the brief.

If clipboard permission is denied, the desk shows a selectable text area for manual copying. Copying does not send a message, issue a refund, approve anything, or change a record. The next staff member should reload `/admin` for current data.

## Follow up with a partner

Expand an organization under **New partner conversations** to read its submitted message and contact information. **Draft email reply** opens your email app; you review and send the reply there. This does not automatically mark the inquiry contacted. Only inquiries with status `new` appear, while the summary total counts all inquiry statuses.

## 中文速查

1. 使用现有工作人员账号登录 `/staff-login`，进入 `/admin`。
2. 如有黄色“数据不完整”提示，请先刷新并解决数据来源问题；“—”不代表零。
3. 按顺序处理：取消申请 → 退款结算 → 报名审核 → 尾款 → 待付定金 → 活动草稿 → 回顾草稿。
4. 可按人员、款项、内容发布筛选，也可搜索中英文姓名或活动名称。每位参与者只显示当前优先级最高的一项；处理后刷新可显示下一项。
5. 点击待办打开原有管理页面，核对参与者身份后操作。共用邮箱的报名可能同时显示多人。退款与取消权限沿用原有规则。
6. 使用“复制交班简报”获取完整队列摘要，自行粘贴到交接渠道；内容不含参与者个人信息。复制失败时可手动选中文本复制。
7. 展开“新的合作咨询”阅读消息；“起草邮件回复”打开邮件应用，不会自动发送或更新咨询状态。
8. 工作台是快照，处理后应点击“刷新工作台”。商家、住宿、签到等任务继续使用原有导航模块。
