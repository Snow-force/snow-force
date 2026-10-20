# Mammoth 重复付款与可疑报名排查

核查时间：2026-09-08（America/Los_Angeles）。本轮只读核查生产 Supabase、Stripe Dashboard 和当前生产对应源码；没有退款、删除报名、更改生产配置或部署代码。

## 1. 已确认的两笔付款

活动：Snowforce Mammoth Opening Weekend Nov 13-15 2026（mammoth-opening-weekend-2026）。
会员：jicheng8524@hotmail.com；member_id：6914e79c-64c2-4757-a59e-252b701de5ee。

| 项目 | 第一笔 | 第二笔 |
| --- | --- | --- |
| 洛杉矶付款成功时间 | 2026-09-04 20:47:37 | 2026-09-04 20:56:14 |
| 金额/当前 Stripe 状态 | USD 99 / Succeeded，无退款显示 | USD 99 / Succeeded，无退款显示 |
| Stripe 付款人姓名 | Lanfeng Sun | Cheng Ji |
| PaymentIntent | pi_3UCAZoAItQQT9la80z0ahGUU | pi_3UCAeaAItQQT9la801Mxe7uO |
| pendingRegistrationId | 4eabb842-acc2-4a83-acd7-b49e68f145af | 07fd514d-f25b-448e-9985-2795dc5e9034 |
| 当前关联报名数 | 0 | 1 |

两笔付款的 metadata 都指向同一个会员和活动，但结账付款人/邮箱不同。只用会员邮箱搜索 Stripe 会漏掉第一笔；按会员 ID 查询才能找到两笔。合计收取 USD 198，对一份 USD 99 报名多收 USD 99。

- [第一笔 Stripe 付款](https://dashboard.stripe.com/acct_1ToZcEAItQQT9la8/payments/pi_3UCAZoAItQQT9la80z0ahGUU)
- [第二笔 Stripe 付款](https://dashboard.stripe.com/acct_1ToZcEAItQQT9la8/payments/pi_3UCAeaAItQQT9la801Mxe7uO)

第一笔 checkout.session.completed 事件 evt_1UCAZqAItQQT9la8QkEy7Eog 于 20:47:38 投递至 https://snow-force.com/api/stripe/webhook，Stripe 显示 200 OK，响应正文为 "OK"；生产 stripe_webhook_events 同时保留该事件。故已排除“第一笔成功通知一直没有到网站”的解释。

第二笔对应报名 2b61bcb4-27ee-4ec1-9b54-6563ef8f2167，于 20:56:15 创建，同时有 waiver acceptance。该报名 member_id 正确、status=confirmed，活动公开且在未来，符合当前 Upcoming trips 的筛选条件。这是数据/代码核对，未冒用会员身份登录验证页面。

两个 pending ID 现在都不存在。缺少当时的 pending 数据历史和网站分支日志，不能确定第一笔回调具体在哪个分支退出，也不能排除第一笔报名曾经创建后被删除；不能把推测写成已证实根因。

## 2. 源码中的明确缺陷

当前生产部署 dpl_DkqAZBpTuUsBGJy3VyGKQWrPuhVf 对应 cd07c51f57d5f4ef3cd54e078e3be94fcd30a5a5，与本地 HEAD 一致。

1. `src/lib/payments/actions.ts:86`：每次调用都新建 Stripe Checkout Session，没有传入幂等键，也没有复用已创建的 Session。通过本地运行实际函数、注入假 Stripe 客户端，复现同一 pending 连续调用产生两次创建请求；未连接 Stripe、未扣款。
2. `src/lib/registrations/pending-repository.ts:191`：再次提交时先删除该会员该活动的旧 pending，再插入新 ID。旧付款仍可继续完成，但回调可能已找不到原 pending。
3. `src/app/api/stripe/webhook/route.ts:122` 等分支：pending 不存在、容量等条件不满足时直接返回 200 OK，没有完成报名，也没有持久化需要人工处理的付款异常。已收到 webhook 的数据库记录并不能证明报名完成。
4. `src/app/member/page.tsx` 不使用 session_id 向 Stripe 核实或补齐履约；`src/components/members/member-status-message.tsx:70` 仅凭 payment=success 就显示“行程已确认”。这使付款与报名状态不一致时的提示不可靠。
5. `src/app/api/stripe/webhook/route.ts:149`：若已有同会员报名，回调会更新其 Stripe ID；没有区分同笔重试和另一笔真实付款，存在覆盖原付款关联的风险。

第一笔“被网站确认接收但当前没有对应报名”，与上述履约缺陷相符；旧 pending 被替换是可能原因，尚未获得历史证据证明这一具体顺序。

Stripe 官方建议以 webhook 履约，并在付款返回页面调用同一幂等履约逻辑，减少通知延迟或返回时序导致的状态差异：[Fulfill orders](https://docs.stripe.com/checkout/fulfillment)。

## 3. 额外确认：保存结算会把 Stripe 付款改成未付

- `src/components/admin/registration-finance-control.tsx:132` 禁用了 Stripe depositStatus 下拉框。
- HTML disabled 控件不进入 FormData；`src/app/admin/registrations/page.tsx:37` 却把缺失的 depositStatus 默认成 pending 并写入数据库。
- 以 jsdom 创建相同表单结构复现：选择 paid 的 disabled 下拉框提交后返回 null，现有服务器默认值变成 pending；仅修改 settlementStatus 即可触发。
- 当前 Mammoth 有 6 条 payment_method=stripe、deposit_paid_at 非空，却 deposit_status=pending 的记录；其中该会员记录最后更新于 2026-09-05 10:57:47 PDT。数据与此缺陷吻合，但没有操作审计可指认具体操作者。

此缺陷会误显示未付款，不会撤销 Stripe 的实际扣款；Upcoming trips 当前也不以 deposit_status 过滤，因此它不是最初没有行程的充分解释。其余 5 条必须逐笔对账后才能修正，不能仅凭 payment_method 批量标成 paid。

## 4. a/b/c/d/e 可疑报名

截图的 5 条 Mammoth 报名在 2026-09-05 11:34:38–11:35:50 PDT 内依次创建。相同邮箱中的两个又在 11:40:14 和 11:40:27 被用于 Greenroom 活动。

七条记录共同特征：member_id=null，answers 只有 name/email，没有付款、没有关联会员；confirmed 是报名状态，不能理解为邮箱已验证。

`src/app/admin/registrations/page.tsx:69` 的手动添加入口会创建完全相同结构的数据，该动作通过 requireAdmin（当前允许 admin/manager）保护。正常公开报名要求已验证会员且 member_id 非空。

生产 registrations 表 RLS 已开启；INSERT 策略要求 private.is_staff()，该函数查询 staff_roles，没有使用用户可编辑 metadata。当前没有发现普通匿名直接插入的开放策略。

结论：更像有权限的后台手动录入/测试数据，证据不足以认定外部机器人攻击。仅凭行结构也不能证明一定由哪个后台账号创建，不能排除其他持有权限的写入方式。Vercel 历史请求日志查询返回 ExceedsBillingLimitError；这不是“查到没有日志”。当前记录没有 created_by/source 审计字段。

仍需确认：用户或团队是否在上述时间进行手动报名测试。若都否认，应继续调查 staff 会话和其他持有写入权限的入口。

## 5. 处理顺序与验收条件（尚未实施）

1. 保留第二笔已经关联的有效报名。确认退款选择后，可将未关联的第一笔 USD 99 原路退回第一位付款人的卡；不要误用第二笔报名上的 Refund & cancel，导致退错付款或取消有效报名。退款应保留原交易、金额、状态与执行人记录。
2. 先修复后台保存：服务器重新读取报名；Stripe 管理的金额和付款状态不得由普通结算表单覆盖。验收：改变结算状态后仍保留 paid、原金额、付款 ID 和退款累计值。
3. 为付款创建持久化且不可被重新报名删除的订单/付款尝试关联，复用有效 Checkout Session，处理并发、过期重试和改价；付款前检查已有报名/已支付状态。
4. 回调与返回页使用同一套履约逻辑，先验证身份归属、实际付款状态和订单金额。每笔付款单独记录；不同付款不得覆盖既有付款；无法落报名的已付款订单须进入可见的待处理状态。不要把所有找不到 pending 的重复回调统一当成失败，也不要直接信任 URL 的 payment=success。
5. 验收涵盖：重复点击只产生一个可付款 Session；旧页面/重新提交不会丢失已付款单；回调延迟、重试和并发幂等；不同付款可对账；未付款不能履约；越权 session_id 不泄露信息；桌面/手机、中英文返回页显示实际状态。
6. 给手动报名添加 source、created_by、created_at 审计，确认 a–e 来源后再取消测试记录；不能仅凭数字邮箱批量删除。

实现代码后按项目要求执行 focused tests、npm test、npm run test:coverage、npm run build、git diff --check，并完成浏览器验收。此次仅做诊断复现，未改源码，因此未宣称全量测试、构建或上线完成。
