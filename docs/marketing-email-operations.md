# 活动与商城邮件推广

邮件统一使用英语。活动入口位于活动管理列表、活动编辑页及“活动推广”；商城入口位于“邮件推广”和商品、集合、Promotion 详情页。

## 操作

1. 从活动或商城来源打开推广入口，点击 Generate draft。商城 Promotion 使用关联集合；未关联集合时使用 Sale 页面。折扣规则仍在原生 Promotions 编辑。
2. 编辑 Subject、Preheader、Heading、Body、Image URL 和 Button text，保存。目标链接由来源生成。
3. 点击 Preview and audience，检查邮件和客户数。Total 包含去重后的会员、历史报名及商城客户；Pending consent 没有订阅资格，Excluded 包含退订、硬退信和投诉客户。
4. 使用管理员测试邮箱 Send test。服务商接收仅代表接收成功，实际收件需检查邮箱。
5. 核对预览及人数，勾选确认，再 Confirm delivery。关闭页面不会中断已入队的发送；Refresh status 查看结果。
6. 已投放邮件锁定。重新推广使用 Copy to new draft，再编辑、预览和确认。注意：复制并投放会构成一次新的营销发送。

Draft → Queued → Processing → Completed / Attention。Completed 表示队列已处理，实际送达数由 webhook 更新；Accepted 不代表 Delivered。失败列表最多显示 100 条。

来源的日期、标题、图片、公开链接或优惠码更新后，需要重新生成草稿。发送前和实际逐封发送时都会核对来源快照；活动下架、优惠过期或资料变化不会继续投放旧内容。临时或无法判定的退信只记录本次投放失败，不会自动取消客户订阅；永久退信和投诉进入共用抑制名单。

网络响应未知时，先刷新状态；同一页面重试保留原请求键。已接收邮件不会再次发送。超过 23 小时的未知发送进入 Attention；本版本不提供一键重发这些收件人，必须先通过服务商记录核实结果。

## 共用订阅状态

现有会员 `marketing_email_opt_in=true` 提供订阅资格；同一邮箱任何明确的退订记录优先。历史报名及商城购买不会自动创建订阅资格。无资格客户只计入待确认人数。

邮件退订无需登录，同时停止活动和商城营销；必要的账号、报名及订单通知保持现有流程。退订会同步关闭会员营销开关。会员明确重新开启营销订阅可以解除普通退订；硬退信或投诉抑制不会被解除。

## 部署配置

网站与 commerce 共用 `MARKETING_INTERNAL_SECRET`（至少 32 字符的新随机密钥），用于双向签名请求及防重放。网站沿用 `MEDUSA_BACKEND_URL` 和 Supabase 服务端配置；commerce 沿用 `SNOWFORCE_STOREFRONT_URL`。生产必须使用 HTTPS origin，不带路径、用户名或查询参数。

commerce 配置：

| 变量 | 含义 |
| --- | --- |
| `MARKETING_ENABLED` | 默认为关闭；最终启用时设为 `true` |
| `MARKETING_RESEND_API_KEY` | 专用于营销发送的 Resend 服务端密钥 |
| `MARKETING_EMAIL_FROM` | 已验证域名上的发件身份，例如 `SnowForce <news@notifications.snow-force.com>` |
| `MARKETING_REPLY_TO` | 客服回复邮箱 |
| `MARKETING_POSTAL_ADDRESS` | 实际公司邮寄地址，必填；不要使用示例地址 |
| `MARKETING_UNSUBSCRIBE_SECRET` | 至少 32 字符的独立随机密钥；保持稳定以使历史邮件的退订链接有效 |
| `MARKETING_SENDS_PER_MINUTE` | 默认 30，允许 1–120；按实际 Resend 套餐额度配置 |

网站配置 `MARKETING_WEBHOOK_SECRET`。在营销 Resend 账户创建 webhook，地址为 `https://<网站域名>/api/marketing/webhook`，订阅 `email.delivered`、`email.bounced`、`email.complained`、`email.failed`。签名验证使用原始请求正文。

先完成 Resend 发件域名验证及 SPF/DKIM/DMARC 配置，检查账户发送额度。不要复制或提交实际密钥。

## 发布顺序与回退

1. 用正常 Supabase 发布流程应用 `20261011003726_marketing_campaigns.sql`。数据表为私有 commerce 表，网站防重放表仅 service role 可访问。
2. 部署 commerce 服务和网站代码，配置上述变量；保持 `MARKETING_ENABLED` 关闭。
3. 验证草稿、预览、双向签名和两个管理员身份的访问权限；配置 webhook。
4. 开启发送，用管理员自己的邮箱试发并验证退订、收件及事件更新，再允许正式投放。此代码变更不会自动创建或发送推广。
5. 暂停发送将 `MARKETING_ENABLED` 设为 `false`；保留数据库及密钥，队列不会丢失，退订入口继续工作。

每分钟 job 消费持久化队列，跨 worker 使用数据库限额及共享锁。重试使用固定收件任务键和冻结后的邮件正文。临时失败采用退避；不会因为配置缺失把邮件标记为已发送。

## 验证

根目录运行 `npm test`、`npm run test:coverage`、`npm run build`；commerce 目录运行 `npm test`、`npm run typecheck`、`npm run build`。营销 SQL 集成测试使用开发依赖 PGlite，在独立本地数据库验证迁移、权限、队列、重试、退订、限额及 webhook 顺序，不使用生产客户或真实发送服务。

两个后台的编辑器使用一致的源代码；修改编辑器后同步另一份，合约测试检查一致性。首版不包括开信／点击追踪、定时发送、客户 CSV 导入、非会员订阅表单或外部广告平台。
