# 收款后的成交税账与持久恢复

核验：2026-10-02，美国太平洋时间；最新只读状态为 2026-10-03 02:26 UTC。此模块已建立，商城整体尚不能正式上线收款。

## 数据保存与权限

仍使用现有 Supabase PostgreSQL 的私有 `commerce` schema。已应用单份迁移 `20261003021222_shop_tax_sale_outbox.sql`，远端记录与本地文件名一致。

| 表 | 用途 | 保留内容 |
| --- | --- | --- |
| `snowforce_tax_sale_tasks` | 固定请求与数据库任务 | 原订单/报价/付款/capture 身份、原报价与签名、美分金额、唯一 reference、固定 posting date、请求指纹、首次尝试时间、远端 ID、重试时间、租约和令牌 |
| `snowforce_tax_sales` | 不可变成交证据 | 受验证的 Stripe Tax Transaction、逐项 transaction line IDs、原商品 reference、净额/税额/运费/政府费用、人工核对审计 |

两表由现有 `snowforce_commerce` 角色所有，启用 RLS，不授予 anon、authenticated 或 service_role 读写权限。客户不能通过 Supabase Data API 读取原始地址、税务任务和成交证据；仍沿用既有会员登录。

触发器保护原任务身份、请求、首次请求时间、已关联远端 ID 和完成记录。每个订单、报价、付款、capture 只对应一个成交任务。存在任务不等于已经收款或记账。

## 记账流程

原生 `payment.captured` 事件先保存任务。每两分钟也从数据库发现遗漏的已捕获订单，覆盖事件丢失、事件先到订单后建立及进程重启。SQL 行锁、`SKIP LOCKED`、三分钟租约和令牌保护并发；网络调用在短 SQL 事务之外进行。

记账前同时核对原已完成购物车、订单归属与唯一关联、私有应用签名、准确原生金额、有效期内建立的付款关联、一笔付款及一次全额 capture 的 amount/raw_amount。随后 GET 当前 Stripe 账户和 PaymentIntent，核对模式、身份、session metadata、succeeded、全额实收及零待捕获金额。

全部通过后才调用 `tax.transactions.createFromCalculation`，固定 reference、posted_at 和幂等键。模块不捕获或退款资金；后续关闭税务开关不会取消已实际收款订单的记账。顾客报价有效期与成交历史分开，不按当日税率重算；原 Calculation 的失效期限和 posted_at 约束仍由 Stripe 校验。[创建成交税账](https://docs.stripe.com/api/tax/transactions/create_from_calculation)。

创建返回的 ID 先保存，再 GET 重读交易和完整分页明细。核对每件商品的净额、税额、数量、税码及 reference，另核对运费/政府费和整单金额。Stripe shipping amount_tax 包括原报价的适用政府费用；本店仍分开保留销售税与政府费。保存交易明细 ID 供后续按商品冲销。[读取成交](https://docs.stripe.com/api/tax/transactions/retrieve)、[读取明细](https://docs.stripe.com/api/tax/transactions/line_items)。

网络调用后再次核对本地原成交来源。来源变化或明细不符时留作核对。结果插入和任务 ready 更新在同一短事务内完成，最终更新失败时结果插入回滚。

## 重试与人工核对

| 状态 | 含义 | 后续操作 |
| --- | --- | --- |
| queued / running | 等待 / 正在核对 | 正常后台处理 |
| retry | 网络、读取或配置暂不可用 | 数据库存储递增间隔，恢复后继续原任务 |
| reconcile_required | 来源/资金/明细不符或结果长期未知 | 核对原订单和已有 Stripe 税账 |
| ready | 已保存受验证成交 | 保留证据，退款冲销使用独立记录 |

响应丢失时，22 小时窗口内只用原 payload 和原键重试。已保存远端 ID 的任务以后只 GET。超过窗口且不知道 ID 时停止 POST，不换 reference 创建另一笔。Stripe 幂等记录可能在至少 24 小时后被清理，本地永久身份不能代替远端对账。[幂等请求](https://docs.stripe.com/api/idempotent_requests)。

管理员入口 `/app/snowforce-tax-sales`：填写对应 Stripe 账户中的已有 `tax_…` ID，点击「核对已有税账」。只 GET 验证并关联，记录操作者；失败也不重新开放自动 POST。不匹配的 ID、账户、reference、metadata、地址或金额不能关联。

页面也显示已捕获却尚未建立任务的订单。持续出现时需检查部分 capture、重复付款或原始关联缺失。**仅实现单次全额 capture 的成交记账；原生部分捕获的全路径限制尚未接入。拒绝记账不等于阻止了部分收款。**

## 验证与限制

- 后台完整 375 tests、typecheck、backend/Admin build 通过。21 项重点测试覆盖重复事件、未知结果、重启恢复、超时、金额/身份不符、原始来源变化、权限和 UI；所选模块 99.71% lines / 92.92% branches。
- 主站完整测试/coverage 为 151 文件 / 945 tests，lint/类型/build 通过；全站 58.24% lines / 51.66% branches。
- 迁移先在实际专用角色和验证 CA 的 TLS 事务中审阅并回滚；应用后再次验证真实原生 capture/报价 SQL、租约、不可改写请求、最终更新失败回滚和私有权限。22 次隔离写入尝试最终全部 ROLLBACK，14 表前后均为零；graph 和供应商为隔离替身，无真实 Stripe POST。
- 两个现有管理员实际 HTTP 登录/身份/税账 API 核验通过；匿名 GET/POST 为 401。商城/结账/政策/会员订单和后台 HTML 为 200。真实空数据库任务运行不创建任务或税账。
- 最新数据：14 草稿、0 发布商品、0 订单、0 税账任务/成交；US$9.95 运费 / 满 US$100 包邮。经营资料未启用，政策未发布，客服 Shop@snow-force.com；Stripe 测试 Tax Settings pending、登记 0、付款开关关闭。
- Security Advisor 的私有表 RLS Enabled No Policy 为 INFO，符合无客户/API grants 的边界。项目已有「泄露密码保护关闭」WARN，未修改该 Auth 设置。[Supabase 密码保护](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)。

证据：`output/shop-tax-sale-{schema-review,database-rollback,http}.json`；测试/类型/构建/coverage 日志为 `output/shop-tax-sale-*`。回滚脚本 `services/commerce/scripts/verify-tax-sale-rollback.mjs` 仅限付款关闭且没有实际订单的测试开发配置。

没有真实浏览器视觉、购买/capture/发货/退款/税务成交 E2E，也没有商品/政策发布或生产部署。部分退货金额、退款税 reversal、冲销恢复、完整 capture 限制、生产 Redis/常驻服务和完整验收仍待完成，见 [上线状态](shop-launch-status.md)。
