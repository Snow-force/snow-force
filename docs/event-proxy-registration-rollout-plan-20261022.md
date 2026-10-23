# SnowForce Event 代报名功能：技术改造与上线计划

**日期：** 2026-10-22

**状态：** 10/22 完成 V1 代码和本地验证；10/23 按用户新要求适配全部开放活动并执行上线。详见 [上线记录](event-proxy-registration-launch-20261023.md)。下文保留原始方案审查结论。
**审查范围：** Harry 本地 C:\Users\123\OneDrive\Project\snow-force；与 GitHub main 关键文件对照一致

## 1. 结论与产品边界

目标：已验证 SnowForce 会员可以替朋友报名同一 Event；报名者（Booker/Payer）与实际参加者（Attendee）明确分离；每位参加者单独占名额、留问卷、签署免责、签到、核销及退款。

**推荐分两期：**
- **V1 / 可控上线：** 一个已验证会员可为自己或朋友分别创建报名记录；朋友不强制开会员；每位朋友独立付款/确认；不做一次付多人。保持现有 Stripe PaymentIntent 对应单条 registration 的账务模型。
- **V2 / 完整团体报名：** 一次录入多人、一次 Stripe Checkout、按人拆分价款/优惠/退款；需要独立 booking/payment/line-item 财务模型和原子预留名额。
- **不推荐：** 只去掉邮箱唯一索引，或用同一个 member_id 填在所有朋友 registration 上。这会影响权限、付款、签到、退款与重复报名判定。

### V1 产品规则（建议默认值，发布前由运营确认）
- 发起代报名的人必须登录并验证会员邮箱；参加者不必拥有会员账户。
- Event 管理后台单独开关“允许代报名”；现有活动默认关闭，灰度活动开启。
- 每名发起人同场活动最多代理 5 名朋友；后台可调；防止抢票与滥用。自己报名不计入朋友上限。
- 允许本人已经报名后继续代理朋友；本人仍只能拥有一条有效的本人报名。
- 朋友姓名必填；手机号建议必填（可由活动决定）；朋友邮箱可选。发起人邮箱作为订单/票务联系人，不等于朋友身份。
- 每位参加者填自己对应的自定义问题（水平、装备、紧急联系人、乘车信息等）；禁止把第一人的答案直接复制给其他人。
- 付费活动一人一单，支付成功才占正式名额；名额在付款中需要短时预留，超过时限须核实 Stripe 状态才能释放。
- 不允许发起人替成年朋友签署免责条款；每位成年人通过个人邀请链接或现场签名完成；未成年人由法定监护人按适用政策办理。
- 已付款不可由发起人任意更换参加者身份；需走有审计记录的管理员修改/取消流程。
- 每人独立取消、退款、签到；代报名人管理自己代理的记录，但不能代朋友同意营销订阅/肖像授权。

## 2. 已确认的代码约束

| 位置 | 当前行为 | 影响 |
|---|---|---|
| src/lib/registrations/actions.ts | 按当前登录 memberId 检查是否已报名 | 已报自己的人无法替朋友再报 |
| supabase/migrations/20260603090000_pending_registration_confirmation.sql | registrations(event_slug, lower(contact_email)) 唯一 | 同一联系人邮箱不能出现两条记录 |
| supabase/migrations/20260604120000_member_only_registration_finance.sql | registrations(event_slug, member_id) 与 pending(event_slug,member_id) 唯一 | 一个会员不能有多个已提交/待支付的同活动记录 |
| src/lib/events/required-registration-questions.ts | 系统问题强制 email 必填 | 需拆开代报名联系人邮箱与参加者邮箱 |
| src/lib/payments/actions.ts / fulfillment.ts | pending.memberId = 实际 registration.memberId；一笔 Stripe 支付只对应一条报名 | 必须区分 payer 与 attendee，保留安全归属校验 |
| supabase/migrations/20260819030926_add_registration_refunds.sql | Stripe session_id / payment_intent_id 在 registrations 中唯一 | V2 合并支付不能简单把相同 payment_id 写入多人报名 |
| src/lib/payments/refunds.ts | 退款针对单条 registration 与一个 PaymentIntent | V1 可复用；V2 需共享支付下的个人额度账本 |
| src/lib/reviews/repository.ts | 二维码签到/评论通过 member_id 找单条已确认记录 | 没会员的朋友无法走当前签到入口 |
| src/app/member/page.tsx / member/trips/page.tsx | getRegistrationsByMember(member.id) | 发起人看不到 member_id 为空的朋友记录 |
| src/app/admin/registrations/page.tsx | 管理员手动报名也检查 email 是否已存在 | 管理后台必须同步更改 |
| src/lib/registrations/repository.ts | 容量仅靠“查 count -> 插入” | 并发付费抢最后名额存在竞态 |
| src/lib/coupons/validation.ts / migrations/20260823071209... | 优惠码按单条报名计算/限领 | V1 一人一单可复用，V2 必须定义券按人还是按单 |

额外发现：现有 registrations 的 email/member 唯一索引未排除 cancelled，已取消记录仍可能挡住重新报名；Event 配置有 requiresApproval/allowWaitlist，但现有会员报名动作没有完整分支处理，扩展时须专项回归。

## 3. V1 数据模型和安全约束

### 3.1 向后兼容的字段设计
现有 registrations.member_id 继续表示**参加者自己的会员资料 ID**，不能改成付款者。建议逐步新增：
- registrations.booker_member_id：发起报名的会员（必备新记录；旧数据回填 member_id）。
- registrations.registration_kind：self / proxy；默认 self。
- registrations.attendee_email：参加者自己的邮箱，可为 null；contact_email 暂保留联系人/通知邮箱。
- registrations.attendee_confirmation_status：not_required / pending / accepted / declined；仅真实参加者能签授权。
- registrations.client_request_key：单次提交的幂等键（唯一），禁止连续点按钮创建重复单。
- pending_registrations.registration_kind / participant_key / attendee_email：同一个 booker 可存多个独立朋友的 pending；现有 member_id 在 pending 表中仍代表操作/付款会员。
- 附加 guest invitations 表：registration_id、token_hash、到期时间、使用状态、签署记录；不得存明文访问 token。
- 正常会员报名的既有字段与接口须兼容；旧记录回填后逻辑仍可按 member_id 读取。

### 3.2 唯一约束迁移
- 先新增字段、索引、读写兼容，再切换功能；检查线上真实索引是否已应用，避免凭迁移文件假定生产状态。
- 删除“同一活动 contact_email 唯一”索引；联系人邮箱可以被多个朋友共享。
- 将“同一活动 member_id 唯一”改为只约束 status <> cancelled 且 member_id 非空的**本人关联报名**，避免取消后永久不可再报名。
- 删除 pending 中 event+member 的全局唯一约束，改为 V1 的 self pending 唯一，以及 event+booker+participant_key 幂等唯一。
- 对朋友 email/name/phone 进行规范化与**软重复提醒**；不能仅凭相同姓名强拒绝。对于已验证的本人会员 ID 可硬防重复。
- 不改写老报名的款项、签名、历史取消和退款数据。所有 DB 结构变更通过新 migration、备份和 staging 回归。

### 3.3 RLS 和授权
- 发起人仅能查看/管理 booker_member_id = 当前会员的自己的代理记录；朋友已绑定账号时只看自己参加的单条资料。
- 邀请链接仅有领取/签署当前一张票的最小权限，不允许读取团体其他人的个人信息、支付账单或更改参加者身份。
- 服务端校验会员身份、活动状态、人员上限、付款归属、未过期 token、签名是否来自参加者/监护人；切勿信任浏览器传的 memberId。
- 使用后端受控写入；新公开表启用 RLS，限制 grant；若通过数据库函数进行预留/确认，应限制 execute 权限，防止绕过业务授权。
- 个人身份、紧急联系人、签名、免责版本与营销/照片授权分开记录，按最小必要收集与保留策略处理。

## 4. V1 前端及流程

### 4.1 Event 详情页
选择：**为自己报名 / 替朋友报名**。会员已为自己报名时，保留“替朋友报名”按钮。

替朋友报名流程：
1. 读取当前已验证会员作为 Booker，显示订单联系人资料（邮箱预填、可核对）。
2. 录入朋友姓名、电话（按活动）、可选邮箱、个人问卷；摘要明确“参与者 ≠ 付款者”。
3. 显示活动余额/押金/退款条款与邀请签署规则；勾选“我已获得朋友同意代为提交报名信息”。
4. 服务端二次验证、创建独立 pending 与幂等键，预留一个名额；若已付款流程锁定参与者快照。
5. 免费活动由 Booker 在会员中心确认；付费活动进入每人独立 Stripe Checkout。失败或取消时可恢复同一 pending，不创建第二笔支付。
6. 成功后展示朋友姓名、状态、费用、邀请链接/转发操作，并在会员中心“我替别人报名”列表追踪待签免责。

### 4.2 邀请/免责/签到
- 先签再活动：朋友收到专属邀请链接；如未填写邮箱，发起人可复制转发；签名版本和操作审计与每张票绑定。
- 未签免责的票可保持已付款/已确认，但**不得完成到场核销或实际参与**；活动临近前发送提醒。
- V1 的访客核销由现场工作人员检查票据 + 身份/姓名后完成；不要用发起人账号代替所有朋友扫码。单人二维码需不可预测 token、防重复使用与签署状态检查。
- 无账号访客评论/评分可作为 V1 已知限制，V2 再做绑定/领取流程；若运营需要同期开启，必须增加专属安全访问授权。

### 4.3 运营后台
- 增加列：参与者姓名、Booker 联系人、自己/代报、付款状态、免责状态、签到状态、创建渠道。
- 可按 Event、发起人、参加者、支付状态筛选；导出 CSV 增加 booker_member_id / attendee_email / registration_kind。
- 管理员手动新增不再按 contact_email 唯一拒绝，而是检查参加者是否真的重复。
- 管理员可撤销邀请、重发链接、现场完成独立授权；修改身份和退款均需审计。

## 5. 名额与支付一致性（上线拦截项）

### V1 每人一单
- 建议用单笔 Postgres 事务/数据库受控函数在锁定同一 Event 库存后进行“检查容量 + 预留/创建”；不能用前端显示的剩余人数作为唯一依据。
- 保存 pending、报价、锁价币种、席位 hold 有效期与 checkout attempt；支付 webhook 按 pending ID + Stripe session/payment ID 幂等完成。
- paid 后必须可以唯一归属 Booker 和参加者；不能把“相同邮箱”当成支付归属证明。
- session 创建失败释放**未开始支付**的 hold；支付结果未知时不立即释放；过期由对账任务核对 Stripe 后处理。
- 已收钱但容量冲突，标记 paid_requires_review 并报警，由客服处理补位/全额退款；严禁自动再扣一次。
- 免费、押金、全额预付、100% 优惠券、后台手动创建、取消、退款全部走同一容量守卫。
- 防并发：双击、两个页面、Webhook 重放、会员同时提交五位朋友、最后一个座位抢购、过期后支付成功。

### V2 合并支付前置重构
- 新增 event_bookings（Booker）、booking_attendees（每人）、booking_payments（Stripe PaymentIntent 唯一）、booking_payment_allocations（逐人金额/税/折扣/退款额度）。
- 一单 N 人、一个 Checkout Session；支付成功以数据库事务一次性确认 N 张票，库存按 N 原子预留。
- 一人退款仅退该参加者可退额度，所有退款之和不可超过真实 capture；不同人共享 PaymentIntent 不再写入 registrations 的唯一支付字段。
- 优惠券需明确“按整单一次”或“每人一次”，金额与可用次数用最小货币单位记账；保留旧券兑换口径。
- 先在 sandbox 跑完整支付/取消/部分退款/优惠券/重放矩阵，再开放 V2，不应作为 V1 阻塞项。

## 6. 实施顺序（每阶段独立验收）

| 阶段 | 工作 | 交付和退出标准 |
|---|---|---|
| 0. 基线与备份 | 核查生产 migration/index/RLS 状态、订单与退款样本、现有事件类型；留 schema 备份与 feature flag | 自己报名现有流程的测试基线清晰 |
| 1. 数据迁移 | 新字段、回填、索引切换、权限、邀请记录、幂等与席位安全 | 老报名不丢失；唯一约束与取消重报正确 |
| 2. 后端行为 | 代报名 action、pending 区分、Checkout/fulfillment/return-status、会员查询、后台查询 | 正确判断付款者、参加者、状态、资金归属 |
| 3. 产品界面 | Event 自己/朋友切换、双语表单、会员代报名管理、邀请/签名、后台导出、访客核销 | 移动端可完成完整路径；无个人信息越权 |
| 4. 质量保障 | Vitest 单元/集成、Supabase 本地或 staging SQL 测试、Stripe sandbox E2E、并发压测、a11y、双语校对 | 下方阻断用例全部通过；npm test / npm run build 通过 |
| 5. 灰度发布 | migration 先行，默认 flag=false；内部成员测试 -> 免费活动 -> 低风险付费活动 -> 常规活动 | 每一步无资损、重复付款和超卖 |
| 6. 观察与扩容 | 跟踪转化/授权/付款异常/签到支持工单；稳定后规划 V2 | 运营可以处理异常工单，回滚演练完成 |

建议优先修改/新增：src/lib/registrations/{actions,validation,pending-repository,repository}.ts；src/lib/payments/{actions,fulfillment,return-status}.ts；src/components/events/registration-form.tsx；src/lib/members/actions.ts；src/app/member/{page,trips/page}.tsx；src/lib/reviews/{actions,repository}.ts；src/app/admin/registrations/{page,export/route}.ts；supabase/migrations 新增迁移与配套测试文件。

## 7. 回归测试矩阵（发布门槛）

- 本人首次/重复报名；本人已报名后继续代朋友；同邮箱代理两位不同朋友。
- 两位朋友同名但电话不同；同朋友重复提交；使用其他人的邮箱冒认（不能直接绑定会员）。
- 取消后重新报名；已退款后重新报名；旧数据仍可显示并发起退款。
- 活动已关闭、满员、最后一个名额并发、零容量代表不限名额。
- 免费确认、押金支付、全额预付、100% 券、过期券、单次券/多次券。
- Checkout 取消/恢复、双击、Stripe webhook 两次、支付成功浏览器未返回、网络超时、late webhook。
- 两名朋友各自付款和分别退款；不能混淆 PaymentIntent 或退错人。
- 代报名人可看自己的朋友，无法看其他 Bookers 的记录；朋友链接只能看到自己。
- 成人亲自签免责、未成年人监护人流程、没有邮箱时现场补签、签署状态阻止未签签到。
- 本人原有扫码签到/评论不回归；朋友新核销不冒用会员 ID。
- 管理员导出/财务/签到字段完整，CSV 不泄漏不相关成员数据。
- EN/ZH 文案、移动端表单、错误恢复、提交加载与可访问性。

## 8. 监控、运营与回滚

- 最小监控：proxy_create_success/failure、coupon_denied、checkout_created/paid、paid_unfulfilled_age、capacity_conflict、duplicate_attempt、waiver_pending_24h、guest_checkin_success、refund_failure。
- 阻断发布：任何真实资金重复扣款、出现已付款却无可追踪 ticket 的记录、超卖、越权读取、代签成人免责、支付金额与记录不一致。
- 事件追踪不要携带原始姓名、邮箱、电话或签名；按 booking/pending/registration UUID 关联。
- 回滚：关闭按 Event 的 allowProxyRegistrations 标记即可停止新代理报名；老票和待付款必须继续支持确认/对账/退款，**不可直接回滚/删除已写入数据的新字段**。
- 运营 SOP：谁能查 Paid Requires Review，如何确认付款、补位、全额/部分退款、重发邀请、现场签免责。
- 无需改变商城 Medusa 结算链路；Event 当前走独立 Stripe 代码，避免把两套订单域混在第一版。

## 9. 需要产品负责人最终确认的规则

1. 朋友不填邮箱时是否允许注册？建议允许，但必须有可转发邀请/现场核验的补充方式。
2. 每名 Booker 的代理人数限制？建议首发 5 人/场，可在 Event 管理台调整。
3. 已付款但朋友拒签免责时的退款规则？须与活动退款条款一致，并请法务审阅。
4. 第一版是否接受“一人一单”的体验？建议接受，先验证需求并控制财务风险。
5. 访客自助扫码与活动后评论是否必须同时上线？建议先工作人员核销，评论后续扩展。

## 10. 代码审查范围与限制

本方案依据 Harry 本地源码及对应 GitHub main 代码审查制定；已核对主要报名、待付款、支付、会员、签到文件和关键迁移与 GitHub 内容一致。**未运行生产数据库查询、未核实线上索引实际应用状态、未修改业务代码、未执行发布或数据迁移。** 所有数据库和付款假设必须在 staging 验证后再上线。
