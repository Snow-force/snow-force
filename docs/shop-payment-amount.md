# 税费报价与支付金额连接

核对：2026-10-02。本阶段连接已应用的私有报价与原生 payment_collection、payment_session、Stripe PaymentIntent 和前端付款金额。付款开关仍关闭，商品和政策保持草稿。

## 金额来源与保护

原生商品、优惠和运费仍要求准确美元美分。税率使用原生 REAL/float4 存储后，计算总额可能有不足一美分的小数。不能把该小数直接当成支付金额，也不能单凭顾客提交的金额或 metadata 四舍五入。

`normalizeQuotedPaymentCollection` 先通过完整私有报价证明，核对当前 Stripe 设置、经营配置、商品分类、原生逐行及整单金额，再取不可变报价的 `total_cents`。调用方持有既有 checkout/cart 两把租约锁；短 SQL 事务锁定 cart、当前关联、collection 和 sessions，核对归属、签名、physical/raw 金额一致、唯一关联、状态及历史支付/订单证据。

只有完全空且无资金的集合可以将 `amount`、`raw_amount` 一起调整为报价金额。存在会话时金额必须已经准确，不能修改、删除、取消或重新定价现有支付。条件更新失败、租约丢失、最终原生状态不匹配均回滚。重复调用金额相同且零写入。

持久支付创建继续先提交原生 session，再在 SQL 事务外调用 Stripe。session 的准确金额、原始金额、Stripe 请求和私有应用中的 payment binding 使用相同报价美分；原会话 ID 和请求参数在未知结果重试时保持不变。报价过期不能创建或重试新的 provider POST。

prepare 回应包含 `totalCents` 与固定 `currency: "usd"`。网站验证整数金额、币种和已审核购物车的应付金额，再显示 `totalCents / 100`，不沿用请求前的原生小数总额。完成路由及原生订单创建 hook 同样以完整私有报价证明核对准确 collection/session 金额。

## 已取消支付的恢复

原生小数总额不能通过普通精确美分解析。恢复接口此时读取已签名购物车引用和不可变私有报价/应用证据，核对归属、原生购物车指纹、签名、原计算及快照，取得历史准确美分；不能只凭 metadata 或任意舍入获得权限。

这个历史金额读取仅提供金额绑定，不授予创建支付或完成订单的权限，不依赖当前 Stripe Tax 登记。原生集合、会话和 provider 金额仍必须是准确美分。恢复继续逐一 GET Stripe；只有明确 canceled 且无资金、授权、订单证据时才更新本地状态并退役当前关联，完整历史保留。未知 PI、处理中或已有资金继续冻结。

## 实际验证与限制

- 后台 344 tests、typecheck 和完整 backend/Admin build 通过。88 项重点覆盖率测试通过；新金额连接 100% lines/branches，付款创建 100% lines/94.57% branches，账本 100% lines/94.15% branches，所选组件合计 99.59% lines/95.82% branches。
- 主站 151 文件、937 tests、完整 lint/类型/Next build 和全项目 coverage 通过。全项目 lines 58.10%、branches 51.33%；这不是所有支付/售后路径已验收的证明。
- 实际商城角色、验证 CA 的 TLS、原生 float4 金额计算和 SQL 行锁/写入通过回滚验证。隔离样例原生总额 `112.349996125`，不可变报价 `11235` 美分；collection/session 的两种金额存储和隔离 Stripe 请求均为 US$112.35。失败后回滚、金额复用零写入、未知结果同键同参数重试只有一个 session、GET-only 取消恢复及历史保留均通过。
- 23 次测试 SQL 写入尝试及全部隔离记录最终 ROLLBACK，16 个相关表的测试前后数量一致且均为 0，完整 Store metadata 摘要相同。经营事实、商品分类、graph 关联和 Stripe provider 为隔离替身；没有真实 Stripe POST、订单、库存变动或实际税务交易。
- 本地商城/政策/结账/会员登录入口和后台健康/登录页 HTTP 200。prepare 未带 store key 返回 400，带有效 store key 但无顾客 token 返回 401。真实 Sandbox 只读核对仍为 Tax Settings pending、0 registrations、付款开关 false；14 商品草稿、0 订单。

证据：`output/shop-payment-amount-database-rollback.json`、`output/shop-payment-amount-http.json` 和同前缀测试、覆盖率、构建日志。没有迁移、权限、凭据、税务事实或生产部署变更。

顾客报价编排、过期/编辑清理和重新报价、税费明细展示、订单/部分退货金额适配、实际全额捕获后的 Tax Transaction、退款 reversal 和可恢复税账任务仍须连接及完整验收。生产后端、Redis、HTTPS、正式经营许可与商品发布仍须完成。全部状态见 [上线清单](shop-launch-status.md)。

依据：[Stripe PaymentIntent 金额参数](https://docs.stripe.com/api/payment_intents/create)、[独立 Stripe Tax API](https://docs.stripe.com/tax/standalone-tax-api)，以及本机安装的 Medusa 2.21.2 原生流程与金额计算实现。
