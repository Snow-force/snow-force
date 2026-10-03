# 商城税务报价请求与结果保存

更新：2026-10-02。服务端报价来源已接入固定请求、Stripe SDK 与私有账本，并已有独立的 [税费原子应用组件](shop-tax-quote-application.md)。**顾客结账编排尚未接入，不能上线收款。** 实际税务设置仍 pending、登记 0，付款开关关闭；没有向真实 Stripe 创建 Calculation。

## 数据与处理

`services/commerce/src/lib/tax-quote-creation.ts` 的 `createCartTaxQuote` 只接受已验证 customer 身份、本人购物车 ID 和取消信号。它没有浏览器可调用的新路由，也不接收价格、税码、许可确认或幂等键。

处理顺序：取得现有结账锁和原生购物车锁，读取严格服务端来源；用同一 writer 的账户 GET 核对账户和模式；重新读源后在数据库保存原始输入和永久操作 UUID；在事务外执行 Calculation POST、完整明细 GET；完整校验后在短事务保存不可变结果；再次读源，才把仍然有效的结果返回给服务端调用者。返回 `applied: false`，不写原生税行、政府费用、签名引用或应用记录。

数据仍在现有 Supabase PostgreSQL 的私有 commerce schema：`snowforce_tax_operations` 保存原请求，`snowforce_tax_quotes` 保存经校验的完整报价字段和金额快照。客户继续使用现有 Supabase 账户和登录界面，没有增加登录系统。受保护 Stripe 密钥留在本地环境配置；数据库仅保存其不可逆命名空间摘要，不保存密钥。

## 完整响应与重试

使用安装的 Stripe 23.0.0 SDK / API 2026-09-30.endive。请求从持久化原始输入重新构造，不受 PostgreSQL JSONB 字段排序影响；幂等键固定为该操作 UUID。具体 API 定义见 [创建 Calculation](https://docs.stripe.com/api/tax/calculations/create) 和 [读取其商品明细](https://docs.stripe.com/api/tax/calculations/line_items)。

商品明细始终从 SDK 的固定 `listLineItems` 资源读取全部页面，并展开税务理由。分页列表可以没有 total_count；本地只有在数量、唯一 ID/reference、模式、商品金额、税码、数量和税额都核对完整后才保存准确总数。创建响应若同时带有明细，则逐行与列表复核。缺失税务理由、循环/重复/空页、外部 URL、未知商品、截断或金额不同均停止保存；不跟随响应内的 URL 发请求。

网络未知结果、分页失败或本地写入失败保留 pending 操作。重试使用原时间、原内容、原键；购物车、设置、凭据或窗口变化时不能以新键覆盖未解决请求。窗口末段不再发起 POST，需保留记录核查。已保存结果且仍然有效时直接复用本地不可变报价，不再调用 Calculation POST；临近到期且没有 pending 请求时才允许新报价。

如果顾客在 POST 期间修改购物车，原结果可保存为历史证据，但不会作为当前报价返回，也不会开启付款。15 分钟窗口的边界到达即拒绝新报价。独立原子应用会重新锁定和验证实际源行，此次读源不能替代最终写入检查。

## 验证与剩余工作

- 安装版本 SDK 对隔离 HTTP 服务的真实序列化验证了 POST 参数、API 版本、幂等请求头、明细展开及分页游标；没有请求真实 Stripe。
- 真实专用数据库角色、验证 CA 的 TLS 和最终 ROLLBACK 验证了请求保留、分页失败、记录失败回滚、原请求重试、已完成结果复用及不可修改保护。原生来源、经营事实、锁和供应商为隔离替身；客户/购物车及账本测试记录最终为零，完整 Store metadata 相同。
- 全量测试、覆盖率、构建结果及脱敏证据见 [验收记录](shop-verification.md) 和 `output/shop-tax-creation-*`。这些证据不等同实际客户认证、真实 Calculation 或购买验收。

规范金额、税行、独立政府费用、应用记录和签名的原子写入已实现，见 [税费应用](shop-tax-quote-application.md)。下一步接入前台报价编排、过期/编辑恢复；之后实现捕获后的成交税账、部分退货金额适配、退款税冲销、生产服务和完整 Sandbox 验收。正式经营主体、已核实许可、商品税码与正式售价/库存仍须按真实业务填写，见 [上线清单](shop-launch-status.md)。
