# Event 代报名：全部开放活动上线记录

日期：2026-10-23（America/Los_Angeles）。用户本次要求准备上线，并适配当前全部开启活动；取代 10/22 的暂不部署范围。

## 本次发布内容

- 会员可分别为自己及最多 5 位朋友报名。每位朋友独立问卷、名额、付款、签署、审批与核销。
- 当前活动矩阵：MetroSlopes 11/7 全款 USD 118、需审批；Mammoth 11/13 押金 USD 99、需审批；Mammoth 感恩节 11/26 押金 USD 99、无需审批。保留现有价格、容量、截止时间、审批及退款条款。
- 新增代理票审批状态与工作人员批准/拒绝操作。付款后预留名额，朋友可先签署；审批通过前不能显示可核销二维码或签到。审批要求在出票时保存，不因后来编辑活动而绕过。
- 拒绝审批取消该人的名额，保留原付款与审计。工作人员须按活动条款单独处理退款；审核按钮不自动转账。
- 迁移不重新激活历史弃单的名额；邀请有效期至少覆盖活动日期后 7 天，兼容感恩节多日行程。
- 异步支付明确失败时，签名 Webhook 处理器重新读取 Session 与 PaymentIntent 并核对身份、attempt 和失败状态后才释放席位；processing、succeeded 或身份不符继续保留，避免迟到的失败通知释放已付款名额。
- 本次仍为一人一付款；满员不自动创建代理候补。原有本人报名和本人审批产品流程未扩大改造。

## 验证与来源

- 发布副本以 GitHub `origin/main` 的 `92e3acb` 为起点，合入生产已部署的 Node 24.22.1 安全修复 `99ed9d2`，保留最新商城改动；未直接发布旧本地 main。
- 全量单元/组件测试：198 文件、1314 用例通过。
- `npm run build`：ESLint、Next.js 生产构建与 TypeScript 通过。
- 覆盖率：行 63.91%、分支 59.55%。邀请存取和 Checkout 过期核对行覆盖率 100%；guest actions 97.67%。支付履约的异常/备用分支仍未全部穷举。
- [PostgreSQL + 浏览器验收](../output/event-proxy-registration-db-acceptance-20261023.json)：16 组；6 并发客户端争抢最后名额、付款/审批/个人签署独立、拒绝释放席位、RLS 和权限拒绝均覆盖。
- [本地实际 Next 浏览器验收](../output/event-proxy-registration-browser-20261023.json)：手机英文签署 → Server Action → PostgreSQL → 待审批不展示票据；工作人员批准 → 桌面中文二维码。无页面脚本错误和移动端溢出。
- 10/22 已完成两笔 Stripe 沙箱托管 Checkout、重复签名 Webhook 及全额退款验证，证据见 [前次记录](event-proxy-registration-execution-20261022.md)。本次未在正式环境发起测试扣款。

## 生产操作

状态：**上线完成**。主站 [snow-force.com](https://snow-force.com) 的 Railway 部署 `ff2743eb-dfcd-4719-8e74-cdf1314918ce` 已成功并通过健康检查；代码提交 `89294beda8ad5c25e0539b48994dc84f58f937f4`，发布分支 `codex/event-proxy-launch-20261023`，Node 24.22.1、sfo。相同提交另有成功部署 `7af2263f-6068-4965-a399-2414769bdb9d`。15:39 PDT 核对时三个活动均已开放代报名。

| 活动 | 付款 | 审批 | 代报名 | 已占 / 容量 |
| --- | --- | --- | --- | --- |
| MetroSlopes 11/7 | 全款 USD 118 | 逐人审批 | 开启，每会员最多 5 位朋友 | 48 / 50 |
| Mammoth 开幕周末 11/13 | 押金 USD 99 | 逐人审批 | 开启，每会员最多 5 位朋友 | 35 / 150 |
| Mammoth 感恩节 11/26 | 押金 USD 99 | 无需审批 | 开启，每会员最多 5 位朋友 | 4 / 100 |

席位数字为验收时快照；新报名和付款中的预留会继续改变可用名额。审批活动付款后须在 `/admin/registrations` 逐人批准，参加者还需亲自签署邀请，二者都完成才能核销；拒绝后单独核对应退金额。

生产验收：[发布证据](../output/event-proxy-registration-release-20261023.json)、[页面与手机端](../output/event-proxy-registration-production-smoke-20261023.json)、[Data API 权限](../output/event-proxy-registration-api-permissions-20261023.json)、[Stripe 回调配置](../output/event-proxy-registration-webhook-20261023.json)。三个页面均返回 200 并携带正确代报名、付款与审批配置；手机端无横向溢出或页面脚本错误。无签名 Webhook 返回 400；邀请页包含 noindex/no-referrer。新表和审批 RPC 已通过正式 Data API 确认，匿名访问均拒绝，权限探测写入为 0。

活动 Stripe 回调现已订阅 completed、async_payment_succeeded、async_payment_failed、expired 及 refund.created/updated/failed 共 7 项。保留原 URL、签名密钥及商城独立回调；连接器缺少 webhook_write 时使用同账号已有服务端 SDK 凭据完成更新，未记录密钥。

运行日志抽查仅覆盖启动和上线冒烟阶段，未发现应用失败；Railway tracing 的 3 条 debugger stderr 启动信息不属于应用异常。没有在正式环境创建测试扣款或测试报名；完整个人签署/审批链路由本地实际 Next + PostgreSQL 验收覆盖。既有 Supabase [泄露密码检测提示](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) 未因本次改变，新增两个仅服务端表的无用户策略 INFO 符合权限设计。本次没有新增持续监控、自动提醒或法律条款审查。

生产 migration 记录由 MCP 写入，实际版本分别为 `20261023222235`（优惠券前置）、`20261023222237`（代理报名 V1）、`20261023222238`（代理审批）。对应本地已有 SQL 文件，不重复推送旧文件版本。

旧 Checkout 对账结果：5 笔已过期席位已释放，2 笔原有付款已补全独立报名；未发起新扣款或退款。见 [对账记录](../output/event-proxy-registration-legacy-reconciliation-20261023.json)。

迁移前业务备份位于 Git 忽略的 `.cache/event-proxy-private-backups/pre-launch-20261023.json`，包含 12 活动、257 报名、133 pending、150 waiver、146 webhook receipt。SHA-256：`caaa36097eb75d8b4cf1d9af73ab0aaf5735f2e3dfb11c6bd28401c66509a863`。明文资料不提交 Git。

数据库只应用已审查的优惠券前置迁移、代理报名 V1、代理审批三项，不批量推送存在历史版本漂移的 migration 目录。主站实际运行于 Railway `snowforce-web`，本次不操作旧 Vercel 站点，不应用既有 Railway staged patch `b2de2a43-2321-441f-91c2-d7a0550ff591`。

Stripe 正式账号只读核对发现 7 笔未完成 pending：5 笔 Session 已 expired/unpaid，2 笔 complete/paid 却没有对应报名。上线前按原 Session、Booker、pending、attempt 与金额核对完成过期释放和已付款补单。不得按本地时间单独丢弃未知付款。

回退方式：关闭这 3 个活动的 `allow_proxy_registrations`；保留当前履约、已付款核对、签署及退款代码和新数据库字段。不可删除已有代理票、pending 或付款记录，也不可盲目回滚旧二进制后继续收款。

## 重跑

```powershell
npm test
npm run build
npm run test:coverage
node scripts/test-event-proxy-registration.mjs --web
```

本地数据库和浏览器脚本需要 PostgreSQL、PostgREST 与 Playwright 工具；`--web` 不连接 Stripe。真实 Stripe 重跑仍仅允许无外部生产回调的独立测试 sandbox。
