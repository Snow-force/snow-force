# SnowForce Event — Group Registration & Waiver Assignment V2

> 方案状态：**原 P0 已实现并隔离验证；10/24 新增的未满 14 岁陪同规则待接入，免责稿待审定；P1 合并付款未实施**（不是上线记录）
> 编写日期：2026-10-23（America/Los_Angeles）
> 适用项目：SnowForce Web / Supabase / Stripe Event 域
> 前置文档：[已上线 V1 记录](event-proxy-registration-launch-20261023.md)、[V1 修复记录](event-proxy-registration-fix-20261023.md)、[旧规划](event-proxy-registration-rollout-plan-20261022.md)
> 本文保留原设计与验收要求；执行结果见 [V2 实施与上线操作记录](event-group-registration-v2-readiness-20261023.md)。本次已修改业务源码并验证隔离环境，**未修改生产数据库、线上活动参数、部署或生产 Stripe 配置**。

> 2026-10-24 发布更新：用户另行授权后，已完成[默认关闭的代码与数据库扩展发布](event-group-registration-code-deployment-20261024.md)；所有活动仍走 V1，未开放 V2，免责草稿未作为正式政策发布。上段保留的是最初实施阶段的状态。

## 1. 目标、范围与关键解释

### 用户最新需求（2026-10-23）
1. 每位实际参与者在**同一个 Event 只允许拥有 1 个有效名额**；主用户本人也至多 1 个。一个 Booker 可以替多个**不同**朋友报名。
2. 每个参加者单独分配并完成一份与该 Event 对应的 Waiver；不能借用主报名人的签名。
3. Booker 代报的其他成年参与者应收到**发送到其本人邮箱**的私人 Waiver 签署邮件。
4. 活动当天未满 18 周岁的参与者，Waiver 应发给其**父母/法定监护人邮箱**，由其签署。
5. Booker 可以仅替朋友报名，不必本人参加；监护人签署不消耗活动名额。

**消歧：** “自己和朋友各 1 个名额”指每一名参加者只占一席、不能重复报名，**不等于**主用户永远最多只能替 1 位朋友报名。若运营想临时限制每 Booker 只能代报 1 人，应另行设置活动配额，不应混入“每位参加者唯一”规则。

### 设计时确认的 V1 代码现状（V2 实施前快照）
- 10/23 生产上线记录显示：V1 已开放当前 3 个活动的代报名，默认每个会员同场最多代报 **5 位朋友**（活动可配置 1–20），每人独立付款、问卷、审批与票据；本人名额不计入 5 人配额。该记录只是当时的生产快照，后续线上参数仍需核实。
- V1 已有 `booker_member_id` / `registration_kind` / `attendee_email` 与 `registration_guest_invitations`，私人链接保留 hash、撤销、过期、个人签署及后台核销。
- **当前缺口 A：** `createGuestInvitationAction` / `issueGuestInvitation` 仅生成并返回私人相对链接，**未在该链路自动给朋友/家长发邮件**。
- **当前缺口 B：** 访客表单 `guest-invitation-form.tsx` 让签署人自行选择 attendee / guardian，但没有由 DOB 和年龄自动限制签署对象；`respondGuestInvitation` 没有验证被邀请邮箱的实际控制权或监护关系。
- **当前缺口 C：** V1 是“一个朋友、一条 Pending、一笔 Stripe 付款”，不是一次表单录入多位朋友、一次统一结账。
- **当前缺口 D：** 原始默认 `DEFAULT_WAIVER_TEXT` 含自动媒体/肖像授权语句，而现有访客签署页声明不含营销或肖像授权。**必须在上线前由运营/法务拆分并统一文字**。
- V1 的代理审批和未签不得签到约束要保持；不能因为新增邮件流程把它们绕开。
- `sendEmail` 基于 Resend，未配置 API key 时目前会把“已记录日志”返回为成功；**新 Waiver 邮件绝不能将此路径视为真实送达**。

## 2. 参与者、报名者、付款者及签署人模型

| 概念 | 说明 | 是否占名额 |
|---|---|---|
| Booker（主报名会员） | 登录 SnowForce、创建/管理多人报名、接收订单状态通知 | 仅本人也实际参加时占 1 席 |
| Attendee（参与者） | 实际参加 Event 的自然人，每人 1 份 Registration | 是：1 人 = 1 席 |
| Payer（付款人） | 实际付款者，首期通常是 Booker | 不因为付款身份而占席 |
| Waiver signer（签署人） | 成人参与者本人；未成年人的父母/法定监护人 | 不因为签署而占席 |
| Staff（工作人员） | 审批、审核身份、跟进未签、核销和退款 | 否 |

### 业务约束
- 一个 Booker 可创建 N 条 attendee records；N 受到 Event 的 **代理人数上限**（现存 max_proxy_registrations）约束。保留已上线默认 5，不擅自调整生产配置。
- 一个 Event 内的同一已验证会员只能有一条**有效本人**报名；取消后按活动政策允许重新报名。
- 同一个 Booker 重复提交同一个 attendee 时，幂等键防止重复扣款/占位；不能以相同联系人邮箱判定不同朋友一定是同一个人。
- 不同 Booker 可能误为同一访客提交：已验证 member ID 可硬拦截；访客用规范化姓名 + 可验证联系方式 + 出生日期等候选重复信号进行**软提示/人工复核**。不得仅凭同名或家长共用邮箱误拦兄弟姐妹；对未验证身份不能宣称 100% 防重。
- 只报朋友但 Booker 不参加时，Booker 本身没有签到资格。
- 同一监护人可以签多个孩子的独立 Waiver；每位孩子的文件、签署证据、票据分开。

## 3. 目标用户流程（推荐逐步发布）

### 3.1 前端报名
1. 已登录且邮箱已验证的会员打开 Event，选择“仅自己 / 仅朋友 / 自己和朋友”，点击“添加参与者”录入多位朋友。
2. 对每位参与者展示独立姓名、年龄核验、电话或必要联系人、活动问卷；以**活动开始日当地时区**判断签署时是否未满 18 岁（具体年龄判断政策由法务确认），不得仅按当前访问日计算。
3. 若成年：需填写并验证参与者的真实联系邮箱，Waiver 发送给参与者。若未满 18 岁：需填写父母/法定监护人的姓名、关系、联系邮箱，Waiver 发送给监护人。未确定生日/年龄时不许误发成人自签链接，进入待补资料状态。
4. 结算/确认前展示每位参与者占位数量、个人报名费用、总费用、审批政策、Waiver 未完成不得参与的明确提示以及退款条款。
5. 发起创建后，每个参与者有自己的 Registration、问卷快照、Waiver Assignment、席位状态，统一由 Booking ID 组织展示。已支付与是否已签署分别记录。
6. Booker 在“我的代报名”页面可查每个人的 **Pending / Sent / Signed / Declined / Expired / Needs Review** 状态；可更新发送地址（仅未签且经安全验证）、重发或取消，不能代成人签署。
7. 每个人已满足：报名有效、应付款成功、如需审批已通过、对应 Waiver 完整有效，才允许下发/使用个人签到凭证。

### 3.2 本人报名
- 沿用登录会员的身份与原有本人签署 UI；其 Waiver 必须与自身 Registration 关联。
- 若会员本人在 Event 当天未满 18 岁，同样应改走监护人签署规则；不能因为有会员账号就把未成年人当成年人。

### 3.3 成人朋友邮件
- 仅发给该成人被指定的个人邮箱；邮件明确 Event、参与者姓名、Booker 名称（按隐私策略）、签署截止时间、官方域名与支持入口。
- 链接打开独立、最小信息的签署页：验证邮箱控制权（如一次性验证码）、阅读适用 Waiver 版本、本人姓名签署、明确确认、成功回执。
- Booker 只看到状态和必要的操作信息，不应看到私密签名图像或朋友的完整敏感信息。

### 3.4 未成年人监护人邮件
- 表单采集参加者生日（按最小必要保留）、监护人法定姓名、邮箱及与孩子的法定关系。
- 发给监护人，与成年自签模板明确分开。邮件显示孩子姓名和活动名称，不暴露其他同行参与者。
- 监护人完成邮箱控制验证、声明具有法定监护/代表权限、审阅专用未成年人条款并**以自己的名字**签署；系统记录孩子 ID + 监护人身份及关系。
- 若 Booker 本人就是监护人，可以以**监护人身份**签自己孩子的 Waiver，但必须经过相同监护验证流程。不能借此签成年朋友的 Waiver。
- 多子女共用一邮箱允许；每个孩子必须各完成一份 Waiver，不存在“一份签名自动覆盖所有孩子”。
- 监护权争议、关系异常、年龄不确定进入人工审核；不同活动所在地对监护人免责效力与所需证明的法律规定可能不同，正式文本需律师审阅。
- 对儿童资料采集及家长同意进行隐私合规评估，特别是可能涉及 13 岁以下儿童时；默认由成年人提供资料，不主动向儿童收集账号/营销信息。

## 4. Waiver 生命周期与权限闸门

### 4.1 独立状态
建议区分：
- Registration: pending / confirmed / cancelled / waitlist；保留现有状态与代理审批。
- Payment: pending / paid / requires_review / refunded；不与 Waiver 状态合并。
- Waiver assignment: not_sent / queued / sent / delivered / bounced / expired / signed / declined / invalidated / needs_review。
- Check-in: unmarked / attended / no_show，最终入场条件由服务端与数据库共同判断。

### 4.2 签署证据
每个 Registration 必须有独立签署记录：Waiver 正文和 SHA-256 版本快照、签署人法律姓名、签署角色（attendee / guardian）、监护关系声明、经过验证的签署邮箱、签署时间、电子签名、最低限度的 IP/UA 安全审计与隐私保留规则。旧 `waiver_acceptances` 历史数据不可破坏。

邮件“已发送”不代表“已签署”；签署人拒绝或链接过期不能自动视为同意。拒签后如何退款、截止前未签如何处理，应在报价和条款中预先展示。

**签到强制条件：**
- confirmed 且未取消；
- 费用/押金要求已满足，且已审批活动的审批结果为 approved；
- 必需 Waiver 已由适格签署人签署且未被作废；
- 未重复签到。
- 禁止仅凭 Booker 登录状态、有效邮件链接或显示二维码就绕过上述门槛。

### 4.3 身份和文案隔离
- 成人 Waiver 与未成年人监护人 Waiver 可以共享基础风险条款，但需要适用的不同签署声明及清晰的角色标签。
- 现有默认 Waiver 的肖像/媒体授权语句应与报名免责签署**分离为独立的可选择 consent**；儿童肖像需单独设计监护人授权。
- 政策变更时保存原文及版本，不在服务器静默替换历史签名；对显著影响签署范围的身份/条款变动重新签署。
- 电子签名是否满足各活动所在州的免责效力、未成年人条款、撤销及退款要求，发布前请有相关执业资格的律师复核，不作平台自动有效的法律保证。

## 5. 与当前生产 V1 的增量数据设计

**原则：在现有可运行的代理报名、独立付款、席位锁和 Guest Invitation 基础上渐进扩展；不要先删掉现有表或直接重做支付。**

| 表/模块 | V2 推荐改动 | 兼容要求 |
|---|---|---|
| events | 保留 allow_proxy_registrations 和 max_proxy_registrations；另加 enable_group_form / require_emailed_waiver 的灰度开关 | 默认关闭新开关，现有活动可继续 V1 |
| event_bookings（新增） | id、event_slug、booker_member_id、状态、人数/币种快照、创建时间 | 作为多参与者 UI/管理聚合，单人历史记录可为 booking_id null |
| registrations（扩展） | booking_id、attendee 年龄判定依据、waiver_status（或由 assignment 派生）、法定签署人角色要求、身份审核标志 | 保留每个人的唯一 registration_id、原 member_id 和 booker_member_id 语义 |
| waiver_assignments（新增） | registration_id、目标 signer_role、经过规范化的 recipient_email、状态、期满、重发次数、最近邮件投递状态 | 一人一条当前有效 assignment，历史版本保留 |
| registration_guest_invitations（扩展/复用） | 关联 assignment_id、验证码验证、撤销/消耗状态、邮件发送幂等关联 | 沿用现有随机 token 及 hash、Noindex/No-referrer |
| waiver_acceptances（扩展或新证据表） | signer_name/email/role、guardian_relationship、email_verified_at、签署时间、Waiver 快照、不可变审计 | 旧签署记录不回填虚构监护信息 |
| email_outbox / delivery_events（新增） | 模板类型、recipient、安全状态、provider_message_id、发送/退信/重试 | Resend 异步发送；无 API key 不能报告送达成功 |
| booking_payments / allocations（后续） | 一个 PaymentIntent 对应一份 Booking，多行按人分账、退款上限与幂等 | **只在合并付款阶段**启用；老订单仍按一人一款 |

年龄资料最小化：出生日期不进入客户端分析事件、日志或对账 CSV；可采用受限字段或加密保护。查阅权限按 Booker 与受邀请签署人分别限定，避免横向访问。

**数据库迁移顺序：**
1. 先核实生产 V1 的 migration、RLS、触发器、审批与退款实际状态；快照/备份并建立旧流程验收基线。
2. Expand：新增表与 nullable 字段、索引、唯一键、RLS / grants；保留旧读写 API。
3. 新代码双读/可选双写，后端 feature flag 关闭；回填可可靠推断的旧本人/代理关系，不能凭旧文本猜测签署人年龄。
4. 新 Waiver 验签、邮件派发及签署状态闸门通过 staging 后，指定少量 Event 开启；再推广。
5. 最后按需增加一次付款多人，不和 Waiver 邮件首发绑在同一次高风险发布中。

## 6. 邮件安全、隐私与可用性

- Resend 模板：adult_attendee_waiver、minor_guardian_waiver、waiver_reminder、waiver_signed、waiver_declined/expired；内容双语 EN/ZH。
- 邮箱控制验证可用一次性短期验证码，签署 token 是 32-byte 安全随机值，数据库只保存 hash；链接避免出现在 analytics/referrer、错误日志和客服截图中。
- 发送端使用持久 outbox 和幂等事件，支持重试退信、速率限制、重复发送、防刷屏。重发要撤销旧的**未签链接**；已签记录不可因重发而覆盖。
- Provider API key 未配置或邮件投递失败时返回 **queued/failed**，不能将当前适配器“记录日志即 success”的模拟路径当成生产成功。
- 邮件迟到/地址错误/无电子邮箱：不强迫 Booker 假扮成年参与者；安排现场人员向合法签署人发送新链接/完成可审计的现场签名。成年朋友和监护人的角色验证要求保持相同。
- 邮件内只包含本人/孩子的必要活动信息，不展示同团其他人、付款信息或身份证明。
- 记录 opt-in 和安全审计时，免责/风险告知、媒体许可与营销邮件订阅严格分离。

## 7. 付款、席位及审批策略

### 首发建议：保留一人一付款，先上线自动邮件与监护人签名
- V1 已有每人单独 Pending/PaymentIntent、独立票据与退款路径；最快、风险最低。
- 一个 Booker 在一个 Booking 下录入多人，但首轮依次创建/支付每个人的独立 Registration，状态聚合显示“2/3 已完成付款”；不假称是一笔全团付款。
- 利用现有 Postgres 原子容量保护：每位参与者 1 席，付款中 hold 与已确认席位都计入容量。整团部分失败时清楚展示每人成功/失败和对应退款/重试处理。
- 如果启用整团“全部成功才成立”，必须另行实现**整团原子库存预留**，不能先逐个卖票后声称 all-or-nothing；首发不承诺全部同时成功。
- 已付款但邮件未签，按活动政策保持名额/付款状态独立，不自动释放或自动退款；设置临近活动的后台警报及人工处理流程。
- 需审批的 Event 沿用现有逐人审批；拒绝不代表款项已退款，须单独完成对账/退款审核。

### 二期：多人一次 Stripe Checkout
- `event_bookings` 形成单一 Checkout/PaymentIntent；`booking_payment_allocations` 存各 attendee 的金额、折扣、税、退款额度与币种。
- 一个 PaymentIntent 不得直接写入多个 `registrations.stripe_payment_intent_id`，因为现有唯一索引和退款模型与一人一笔绑定。
- 采用 cents 为单位分配金额，合计必须与 captured amount 完全一致；拒付、取消、单人部分退款、Webhook 重放要按人和整单分别幂等。
- 合并付款可节省重复每笔固定处理费，但不能假设所有支付方式和币种费率相同；上线前核对真实 Stripe 定价和手续费。
- 合并付款前必须完成退款子账本、对账工具和异常人工处理 SOP。

## 8. 代码改造清单（按真实现有路径）

### 首发必改 P0
- `src/lib/registrations/actions.ts`、`participation.ts`、`validation.ts`：每个参与者信息、唯一名额、Booker 不参团、年龄/签署人计算。
- `src/lib/registrations/guest-actions.ts`、`guest-invitations.ts`：创建后发送 Waiver 邀请、核验邮箱与角色、过期/补发/审核。
- `src/components/events/registration-form.tsx`：多人编辑体验、成人及未成年资料分支、每人问卷与进度。
- `src/components/events/guest-invitation-form.tsx`：由服务端签署角色强制展示对应成人/监护人流程，不能仅靠客户端 select 自选。
- `src/lib/email/adapter.ts`：专属 Waiver 邮件模板、正确投递状态、失败恢复，防止 mock success 进入真实流。
- `src/lib/registrations/waiver-repository.ts`、`waiver.ts`：签署证据结构、法律文本版本和媒体授权隔离。
- `src/app/member/page.tsx` / `src/app/member/trips/page.tsx`：一份 Booking 管理所有参与者和 Waiver 进度。
- `src/app/admin/registrations/page.tsx`：监护人邮件状态、拒签、补发、人工核验、审批和签到守卫。
- 新增 Supabase migration 与 server-only repository、双语测试。

### 后续 P1
- `src/lib/payments/actions.ts`、`fulfillment.ts`、`refunds.ts` 以及 Stripe Webhook：合并付款、逐人分账与退款，仅在完成单付款扩展设计后改。
- 会员认领 guest ticket、访客活动后评论（非这次 Waiver 上线的阻断项）。

## 9. 端到端验收矩阵（上线阻断用例）

1. Booker 只给自己报：只占 1 席、本人签署；重复本人报名被拒绝。
2. Booker 只给 2 位成年朋友报：本人不占席；每人独立通知、签署与票据。
3. Booker 给自己 + 2 位朋友报：占 3 席，Waiver 共 3 份。
4. 17 岁参加者：邮件发监护人；成人自签角色在服务端被拒绝。
5. 活动当天刚满 18 岁：年龄边界按活动日正确选择对应规则。
6. 同一监护人两个孩子：同邮箱收到 2 个独立 token，分别签 2 份 Waiver。
7. Booker 是孩子的法定监护人：可以作为 guardian 签；不能因此替成年朋友签。
8. 冒充监护人、邮箱未验证、验证码错误、token 错误/撤销/重放/过期：不能写入 Signed。
9. 两个 Booker 为同一已验证参加者代报：最终仅 1 个有效名额；对无账号相似资料给复核提示，不误封同名者。
10. 替换参加者姓名、DOB、监护邮箱、关键 Waiver 文本：已有签署必须保留审计但不自动沿用。
11. 邮件发送失败、API key 缺失、退信、重发和并发请求：没有虚假的 sent/signed 状态。
12. Booker 查看/更改别人的 Waiver 或读取签名证据：RLS/API 拒绝；邀请链接只展示对应个人最小信息。
13. 免费 Event、押金 Event、全款 Event、优惠券、人工后台登记：均按人独立计数和验签。
14. 需审批 Event：已签但未获批不能签到；批准后才有入场资格。
15. 已付款未签署、已退款、取消、拒签、过期、活动日现场补签：检查状态与退款政策不被误触发。
16. 最后一个席位由多人并发争抢：无超卖；Stripe payment 状态未知时不二次扣款或错误释放席位。
17. Stripe Webhook 重复投递、付款成功后页面未返回、迟到的 async failed：履约、邀请与席位都幂等。
18. 旧 V1 本人和访客订单仍可查、签、审批、取消、退款、签到；原字段不丢失。
19. 手机/桌面、中英文、时间区、邮箱无障碍、加载重试、审计及后台导出均通过。
20. 法务核对成人与未成年人 Waiver 文案、监护人身份声明、媒体/营销独立授权、数据保留期和活动所在州规则。

项目现有要求：针对改动增加 Vitest/集成测试，必须运行 `npm test`、`npm run build`、`npm run test:coverage`；使用隔离 PostgreSQL、真实 Next 表单和不指向生产回调的 Stripe Sandbox 验证。所有生产写入、试扣款和真实邮箱通知均需要独立上线审批。

## 10. 灰度、监控、上线与回滚

### 推荐顺序
1. 审阅当前生产 V1 配置、签署日志与过去 Pending/退款数据；确认邮件域名 Resend 状态。
2. 上线仅后端和数据库的向后兼容变更，新增功能标记默认关闭。
3. 内测：一个成人、一位未成年人与一名法定监护人的专用测试资料；所有邮件只发测试收件箱。
4. 小规模灰度：先免费活动或内部预约，再对普通付费活动和需审批活动开放；不擅自变更当前生产 max_proxy_registrations。
5. 监控签署完成率、邮件延迟、退信率、未签人数、错误监护人角色、签到被拒、已付款未履约、超卖及退款异常。
6. 稳定后才开多人合并支付；先演练部分退款、双重 Webhook、订单恢复与异常资金 reconciliation。

### 失败时的安全回退
- 分别关闭 `enable_group_form` 与 `require_emailed_waiver` 让新提交退回现有 V1 路径；**已经创建的 Waiver 邮件、Paid Pending、票据和签名仍应由兼容后台继续处理**。
- 不回滚/删除已被新订单引用的数据表或签署证据；不直接回滚到无法理解新 Booking/Payment 的旧二进制继续收钱。
- 审批/签署/付款异常要具备后台人工兜底及追踪 UUID，不用客户邮箱作为支付主键。

## 11. 发布前待决策事项

2026-10-23 用户已确认：沿用当前每会员同场最多代报 5 位朋友；成人本人邮箱必填，未成年人填写监护人邮箱；每人独立付款；未签、拒签、邮件失败由后台跟进，不自动退款。以下原始问题保留作审计，其中监护资格/最低年龄/资料保留期限及正式免责文本仍需运营审定。

2026-10-24 补充确认：主办方为 **Snow Force LLC**，大多数活动在加州；**不设统一最低年龄，未满 14 岁须家长全程现场陪同，未满 18 岁须监护人签署**。最低年龄问题已据此明确。双语成人／监护人文本已起草，见 [审阅包](event-waivers-20261024/REVIEW-NOTES.txt)；文本仍待法律及运营审定，新增陪同规则尚未接入报名和签到，儿童资料保留规则仍待确定，暂不部署要求继续有效。

1. Event 可代报名人数的产品上限：当前实际 V1 记录默认 5 位朋友；继续按现有活动配置，还是单独调整？**不改变每位参与者 1 席的核心规则**。
2. 成年朋友必须填写可验证邮箱（推荐），还是允许无法提供邮箱但可现场独立签署的例外？
3. 未成年人的身份证明、监护资格确认等级、现场审核要求、最低参与年龄及数据保留期限？
4. 活动开始前多少时间提醒未签？过期/拒签是否释放名额或触发退款？需先确定完整退款 SOP。
5. 首发“多人管理但每人独立付款”（推荐）是否接受？“多人一次付款”应在单人退款账本重构后上线。

## 12. 交付与完成定义

**本文件交付内容：** 需求定义、现状差异、邮箱/监护签署流程、状态与安全约束、渐进数据模型、代码改造位置、测试矩阵、灰度回滚和待决策项。

**实现完成** 必须同时满足：不同朋友各占 1 席、合法签署人独立验证、邮件真实送达或可见失败、每人 Waiver 与签到一致、原 V1 支付/退款不回归、审批状态正确、线上可安全关闭新流程。保存本计划**不代表已部署或已验证上述功能**。
