# 付款创建、超时重试与取消记录

更新：2026-10-01。此实现用于现有 SnowForce 结账入口，Medusa 2.21.2、原 Supabase 的私有 commerce schema 和独立商城 Stripe 配置。没有新增数据库或顾客账户。

## 顾客付款

顾客先核对真实购物车、配送、税费和有效政策，再同意付款。初始化失败后可以重试同一购物车；服务端保留本次尝试并核对它，不自动另开付款。正在异步授权的会话返回处理中，前台不会重新呈现付款表单。

已取消的本地状态仍需“检查付款状态”。只有所有关联会话都经 Stripe 确认 canceled、金额为零且无原生授权、Payment 或订单证据时，购物车才解除编辑限制。顾客随后重新核对商品、地址、金额和当前政策，再创建新的付款尝试。

## 数据与事务

准确美分现已连接完整私有税费报价：只有空且无资金的原生 collection 可以在行锁事务中将 amount/raw_amount 一起调整为不可变报价 total_cents；session、Stripe 请求和前端支付显示使用同一准确金额。原生税率小数、私有历史证明与取消恢复的边界，以及最新真实 SQL 回滚证据见 [支付金额连接](shop-payment-amount.md)。这不表示顾客报价生命周期和税账已经完成。

付款前持有 SnowForce checkout 和原生 cart 两把租约锁，并重新检查已签名政策、美国 USD 区域、启用的 Stripe provider、金额、归属和历史资金事实。

1. 在短事务中锁 cart、payment collection 和 session 行。原生 payment_session 先保存 pending 标记、准确的原生 amount/raw_amount、固定会话 ID，以及本次购物车/顾客/报价/test-live/凭据摘要绑定。没有持久化 Stripe API 密钥。
2. 事务结束后才创建 Stripe PaymentIntent。原生 session ID 同时是幂等键和 metadata.session_id。请求固定为准确美元美分、manual capture、动态支付方式；不自动确认、捕获，也不保存顾客支付方式。
3. 创建回应之后再 GET 当前 PI。校验真实 ID、session_id、币种、金额、环境、client_secret 归属、状态与已收/可捕获金额，避免用 Stripe 缓存的创建回应覆盖新状态。
4. 第二个短事务重新锁行，比较原生状态指纹并条件更新本次 session 的 provider data 和 status。网络超时、数据库失败、竞态或租约失效，都保留原来的 pending 尝试。不会通过补偿删除、取消或新建另一个 session。

实现位于 services/commerce/src/lib/payment-creation.ts；现有结账 prepare 路由已替换原生 createPaymentSessionsWorkflow。原生订单完成、授权、后台捕获和签名 webhook 仍使用既有 Medusa 流程。本次是一笔一次性订单，不新增 Stripe Customer 或离线保存支付方式。

## 取消后保留历史

取消核验逐一 GET 当前 collection 的所有会话，包括本地已为 canceled 的会话。短事务重新核对状态后，仅更新必要的 session.status，并对 cart_payment_collection 的当前关联设置 deleted_at。原生 collection/session 行及原来的关联身份保留；不删除 provider data、context、metadata、金额和原始付款身份。

解除当前关联后，原生购物车重算只能看到新的有效 collection，不会拿旧的已取消会话执行 deletePaymentSessionsWorkflow 或补偿重建。顾客再次 prepare 时由原生流程创建新 collection，再进入上述持久创建流程。原生 HTTP 及锁内编辑 hook 在任何会话仍关联时阻止修改，不能仅凭本地 canceled 绕过核验。

历史 Payment、order_cart、authorized_at 检查仍覆盖已退役的关联；软删除不会把已有资金事实变成未付款。此替换范围是 SnowForce 顾客结账，其他原生后台手动付款操作仍需在完整上线演练中检查。

## 需人工核对的情形

Stripe 创建键保证的重试窗口为 24 小时。本实现对尚无 PI ID 的不确定尝试在 22 小时后停止自动 POST；更换商城凭据、金额、归属或报价不一致也停止。不会过期后重新用键创建付款。运营人员可使用后台 `SnowForce payments` 查询原 PI，再明确确认关联；服务端只 GET Stripe 并条件更新原会话，保留审核回执。操作及边界见 [后台付款异常核对](shop-payment-operations.md)。没有自动撤销这类记录或自动对账任务。

若 Stripe 的回应尚未保存 PI ID，顾客的恢复接口不能猜测 ID 或认定无付款。prepare 的同键重试会继续本次初始化；超出窗口、权限或配置异常需运营处理。签名 webhook 和租约锁依然必需，生产不能使用开发内存锁。

依据：[Stripe 幂等请求](https://docs.stripe.com/api/idempotent_requests)、[Stripe 底层错误与重试](https://docs.stripe.com/error-low-level)、[PaymentIntent 生命周期](https://docs.stripe.com/payments/paymentintents/lifecycle)。原生新建/删除/补偿行为已以本机安装的 Medusa 2.21.2 源码核对。

## 验证范围

隔离测试覆盖响应丢失后的同键同参数重试、GET/条件写入失败、凭据变化、22 小时边界、精确分币、归属/政策/provider 拒绝、异步授权、状态与资金矛盾、并发原生资金事实和租约丢失。Stripe SDK 测试验证真实客户端的幂等键、超时、重试配置和请求形状，不连接 Stripe。

实际 snowforce_commerce 角色、验证 CA 的 TLS 和现有表结构已执行源码回滚测试：原生插入、同键重试、条件采用回应、取消后历史保留、退役关联后新的 collection、29 美分与过期停止。外围事务与 savepoint 最终全部回滚，业务数量保持不变；Stripe creator/reader 使用替身。它验证真实 SQL 和权限，不等同于跨进程崩溃恢复、真实 Stripe 支付或 webhook 到订单的验收。

日志前缀为 output/shop-payment-creation-。真实 sandbox 授权、取消、浏览器重试、webhook/订单、后台捕获、发货和退款全链路，以及生产 Redis/HTTPS/税务仍须完成；此实现没有开启正式收款、发布政策或商品，也没有部署。
