# 私有税务报价账本与付款校验

更新：2026-10-02。已完成数据库基础、报价保留/结果保存、Calculation 请求组件、税费原子应用、签名引用核对及付款绑定。**顾客入口、过期/编辑恢复、真实报价验收及完整成交/退款税账未完成，不能上线收款。**

## 数据放在哪里

继续使用现有 Supabase PostgreSQL，放在私有 `commerce` schema，不改变 Supabase 客户登录。

| 表 | 保存的数据 | 写入规则 |
| --- | --- | --- |
| `snowforce_tax_operations` | 永久 UUID、原始输入、精确请求、设置/内容指纹、凭据命名空间摘要和完成状态 | 先保存再请求供应商；同一购物车只能有一条未解决请求；只能从 pending 变为 ready |
| `snowforce_tax_quotes` | 原 Calculation、规范化报价、完整地址、商品/优惠/运费/税额/政府费用与司法辖区明细 | 不可修改或删除；原商品数量和净额/税额保留供后续逐件退款分配 |
| `snowforce_tax_quote_applications` | 已应用报价的签名引用、原生付款 session 及绑定时间 | 与原生税费和 cart 引用在同一事务保存；不能替换签名引用或已绑定的付款 |

迁移为 `20261002152248_shop_tax_quote_ledger.sql`，已经应用。远端记录版本与本地一致；远端执行 SQL 和本地去首尾空白 SQL 的 MD5 都为 `9204735437e227bb0d3a944e54ed9a63`。这是内容一致性核验，不用于凭据安全。

三个表及防改写函数归 `snowforce_commerce` 所有。表启用 RLS，不给 PUBLIC、anon、authenticated、service_role 读取权限；没有新增 Data API 策略或公开税务写接口。地址、完整计算和请求保存在私有账本。顾客购物车 metadata 只使用签名引用，不保存完整报价明细或后台审核人。

## 请求、重试与金额

`tax-quote-ledger.ts` 的 `reserveTaxQuote` 锁定真实归属购物车，再保留请求；重复调用返回原 UUID、时间和内容。调用者必须从受控配置、原生购物车及实际 Stripe 设置生成输入，并使用数据库时间。已实现 [服务端来源读取](shop-tax-quote-source.md)、[报价生产组件](shop-tax-quote-production.md) 和 [原子税费应用](shop-tax-quote-application.md)，顾客入口和报价生命周期仍待连接。测试输入中的许可确认不代表经营者已确认。

同一条未解决请求遇到购物车内容、设置、凭据命名空间变化或 15 分钟窗口到期，会停止复用并保留原记录。已实现 writer 使用这条 UUID 对应的固定幂等键与原请求；不能丢弃未知结果后换键重发。参考 [Stripe 幂等请求](https://docs.stripe.com/api/idempotent_requests)。已完成且仍新鲜的同一请求通过 `readRecordedTaxQuote` 核对原输入/计算/快照后复用，不重复 POST；临近到期且没有 pending 请求时才保留新操作。

`recordTaxQuote` 校验原请求、模式、金额、地址、逐行明细和有效期，在短事务内插入不可变结果并完成请求状态。写入失败整体回滚。已完成请求可以核对原结果，不接受另一个 Calculation 替换。JSONB 会改变对象键顺序，因此持久化内容比较采用递归排序，不把字段顺序当作金额或身份变化；原请求指纹与已有金额模型保持一致。

每件商品的原始数量、净額和税额在不可变快照内保存，已有分币函数可按原数量重建单位分配。这里还没有退款剩余额度、退款请求、成交税交易或税冲销表。

## 付款如何校验

HMAC 使用现有服务端 JWT_SECRET 派生独立用途密钥；不新增浏览器凭据。签名绑定报价 UUID、cart/customer、账户/模式、设置指纹、已应用购物车 fingerprint、美元总美分和有效期。JWT_SECRET 轮换会影响旧签名校验，当前没有历史密钥轮换机制，生产切换前需要补齐。

结账准备、购物车锁内准备、付款初始化和原生订单完成 hook 都读取私有报价与应用记录，并重新核对原生逐行金额、优惠、运费、税额、实际商品税务分类版本/内容及地址。原生完成 hook 还验证起始 workflow 购物车会复制同一签名到订单。只打开环境确认开关和 Stripe 登记，不能绕过缺失的私有报价。

创建 native payment session 的事务同时绑定报价与 session，然后才请求 PaymentIntent。过期报价不能启动或重试未知创建请求。完成已有订单可以使用到期前已绑定且持久保存了准确 PI 数据的 session；金额、模式、归属、原报价、时间或链接异常会停止完成，保留证据。取消付款恢复仍绕过上线门槛，不创建付款。

已有 [私有税费原子应用](shop-tax-quote-application.md)，实际隔离数据库事务验证后全部回滚，当前没有正式业务应用记录或顾客报价接口。它锁内复核来源并原子保存税行、费用、应用证据及签名；签名前还核对完整原生金额。分类与包邮读取只有在私有证据和原生费用属性全部验证后才排除费用行。未启用经营配置、来源改变、伪造标签或金额不匹配均不能接受报价。前台报价编排及过期/编辑恢复尚未接入。

## 已验证的范围

- 真实专用角色与 CA 校验 TLS；真实 SQL 的保留请求、重复请求、结果写入/重放、不可修改/删除、付款绑定和防替换均在一个回滚事务中通过。测试 customer/cart/session 和账本记录回滚后全部为零，没有调用 Stripe。
- 只读复核三个表的所有者/RLS/权限、空表和零订单；当前 Stripe 测试模式 Tax Settings pending、登记 0，税务确认开关未启用。
- 后台全量 264 tests；网站 151 文件/935 tests；typecheck、后端/Admin build、网站 lint/类型/build 均通过。新增账本 100% lines、94.96% branches、100% functions；网站覆盖率 58.1% lines/51.32% branches。测试没有跳过、替换原生金额数学函数或降低检查。
- 证据：`output/shop-tax-ledger-database-rollback.json`、`output/shop-tax-ledger-live.json` 及 `output/shop-tax-ledger-*` 日志。财务和过期付款场景使用隔离数据；数据库验证不等于真实购买、发货、退货或退款验收。

下一阶段按 [上线清单](shop-launch-status.md) 和 [销售税方案](shop-sales-tax-plan.md) 连接顾客报价编排、过期/编辑恢复及费用展示，再完成捕获后的成交税账、原生部分退货财务适配和退款税冲销，随后做真实 Sandbox 全流程与生产基础设施验收。经营者名称、加州许可状态和正式商品售价/库存仍需经营者提供。
