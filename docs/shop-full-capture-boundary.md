# Stripe 全额扣款边界

本轮新增代码和迁移尚未部署；正式付款继续关闭。此文说明已在本地验证的约束，不能作为正式 Stripe 交易验收结果。

## 为什么需要

安装的 Medusa 2.21.2 支付模块允许部分 capture，但当前 Stripe provider 的 `capturePayment` 不向 PaymentIntent capture 传递该部分金额。管理员输入部分金额可能使 Medusa 记录与实际收款不一致。当前商城明确只支持一次原始 USD 全额 capture。

## 实施范围

`services/commerce/src/lib/full-capture.ts` 在管理员原生 capture 路由进入工作流前检查员工身份、付款 ID、原始金额与 raw amount、币种、取消状态以及既有扣款记录。输入部分金额、零金额或不足一美分的精度会拒绝；数据库不可用时拒绝继续，并隐藏连接错误内容。

`supabase/migrations/20261009043348_shop_single_full_capture.sql` 在原生 `commerce.capture` 表的写入处加锁并校验，使直接调用 Medusa 支付模块的路径也受约束。安装前先检查历史活跃 Stripe captures；如已有部分金额或不一致记录，迁移会停止，经营者必须先核对处理。函数使用私有 schema 和 security invoker，没有给前台角色执行权限。

sales 模式启动时核对真实触发器的启用状态、执行事件、所有列与所有行覆盖、函数内容指纹、所有者和权限上下文。未安装或被改动时不能进入 sales 模式。management 模式仍可管理商品和分类。

原生 provider 失败时可以删除临时 capture 并重试；已完成的正常重复请求沿用 Medusa 幂等处理。数据库约束不替代 Stripe webhook、税账、退款或账务核对。

## 本地原生验证

`services/commerce/scripts/verify-full-capture-local.mjs` 固定连接 `127.0.0.1:15432` 的测试 PostgreSQL，创建唯一 `sf_capture_validation_*` 数据库，执行实际安装版 Medusa payment migrations 和原生支付模块操作，最后删除该临时数据库。脚本不加载项目环境文件，不接收远程数据库 URL；provider 是本地 fixture，不调用 Stripe。

在 PostgreSQL 17.11 / Medusa 2.21.2 上，九项检查通过：启动校验；部分、零和过度精确金额在 provider 前拒绝；全额与重复请求；并发请求；provider 失败后的重试；其他 provider 的原生行为；阻止直接修改金额、重绑定和重复记录；禁用触发器时拒绝启动；前台角色无执行权限。证据见 `output/shop-full-capture-local-verification.json`。

运行命令：在 commerce 目录执行 `node scripts/verify-full-capture-local.mjs`。需要先启动该端口的独立本地测试数据库；不能对生产库运行本地 verifier。

正式上线前仍需审阅并应用迁移，在独立 Stripe Sandbox 完成真实金额、重复请求、失败恢复和 webhook 验证，以及完成部分退款与税务 reversal 路径。当前没有增加正式 Tax registration、配置支付密钥或发起正式交易。
