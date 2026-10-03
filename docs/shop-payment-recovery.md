# 取消付款后的购物车恢复

更新时间：2026-10-01。此流程属于现有 Medusa 2.21.2 商城，使用现有 Supabase 私有 `commerce` 数据和独立商城 Stripe 设置。

## 顾客操作

结账、Stripe 付款及订单核验页面提供“检查付款状态”。开始检查时移除旧付款表单并清除本次政策勾选；正在提交或确认 Stripe 付款时，检查按钮不可用。

- Stripe 付款仍有效或正在处理：保留原付款，继续付款或核验订单。
- 服务器确认付款已取消、没有到账、没有可捕获金额，也没有原生授权或 Payment 记录：解除购物车编辑限制。顾客重新核对商品、地址、运费、税费和当前政策后才能再次付款。
- 连接失败、金额或归属不符、状态不明确：保留限制。错误提示不能恢复旧付款表单，也不能自动生成新付款。
- 订单已创建：只返回本人订单并同步会员订单投影。

另一浏览器可能在检查结束后开始付款，因此最终页面以重新读取的购物车为准，不把新付款描述成已取消。

## 服务端判定与数据写入

客户端只能提交 `{ "kind": "recover" }`；不能指定 PaymentIntent、客户、金额或取消状态。Next 服务端重新验证现有会员及购物车归属，Medusa 再验证真实 customer 归属。

恢复接口持有 `snowforce-checkout:<cart_id>` 与原生 `cart.id` 两把锁。恢复不依赖税务开关或政策签名正常，因为配置或条款缺失时也需要检查既有付款；它不会启用结账。

后端读取原生购物车、关联 collection/session，以及历史订单、授权和 Payment 证据。只允许一个未授权的 Stripe session；`pending`、`requires_more` 和 `error` 都要经过相同核验。`error` 本身不代表没有付款，HTTP 和原生工作流中的购物车编辑仍被阻止。原生 payment collection refresh 也受工作流锁内校验保护，不能因重新报价删除未核实付款。

Stripe 查询只使用服务端保存的 PI ID，并核对以下事实：

1. PI 与原生 session 的 ID、`metadata.session_id`、USD、美分金额一致。
2. API 密钥、原生数据和 Stripe 回应的 test/live 环境一致。
3. Stripe 返回 `canceled`，且 `amount_received`、`amount_capturable` 都为 0。
4. 原生 collection 未结算，购物车未完成，没有已存在或历史软删除的 Payment/订单/授权记录。

Stripe GET 在短数据库事务之前执行。取得结果后，再锁定原生 cart、collection 和 session 行，重新读取并比较全部绑定事实的指纹。会话条件更新仅写 `commerce.payment_session.status='canceled'` 和 `updated_at`，保留金额、`raw_amount`、provider data 和 metadata。确认 collection 中每个会话均远程取消且无资金事实后，对 cart_payment_collection 当前关联设置 deleted_at，保留关联身份与所有 collection/session 历史行。写入后再次核验并检查锁租约；竞态或租约失效时事务回滚。本地已取消状态也必须经过这次确认才能释放购物车。

这里刻意不调用原生 `updatePaymentSession`：其 provider 分支可能执行 Stripe UPDATE。恢复也不调用原生 session 删除、新建、确认、取消、捕获或退款。没有新增表、权限或数据库迁移。Stripe 规定取消不可撤销、旧 PI 不能再次付款；依据为 [PaymentIntent 生命周期](https://docs.stripe.com/payments/paymentintents/lifecycle) 与 [服务端读取 PaymentIntent](https://docs.stripe.com/api/payment_intents/retrieve)。

## 验证与实际限制

已用实际 `snowforce_commerce` 角色和验证 CA 的 TLS 连接，调用本服务源码完成原生 SQL 事务回滚验证：确切美分、非终态保留、外国 PI/金额拒绝、并发状态改变拒绝、原生授权/历史订单拒绝、取消状态条件更新、重复检查和 provider metadata 保留。临时记录全部回滚，原始购物车、session、Payment、订单、退款数量不变。该测试注入 Stripe reader，没有执行真实 Stripe 请求或付款。

隔离测试覆盖归属、环境和金额不符、多会话、软删除历史、网络超时、锁过期、旧页面异步返回及政策勾选重置。真实 Stripe Sandbox 授权、取消、重试和 webhook 到订单的完整链路仍需验收，单元测试及回滚验证不等同于这一验收。

SnowForce 的后续新建已替换为先持久化本次原生 session、再用相同 ID 幂等创建 Stripe PI 的流程；取消后退役旧的当前关联，避免原生重算删除或补偿重建旧会话。实现、数据与过期人工核对限制见 [付款创建与重试](shop-payment-creation.md)。签名取消 webhook 和定时漏事件恢复本轮未新增，人工检查入口覆盖主动查询需求；生产还需要 TLS Redis、真实 sandbox 完整演练和实际异常处理。

证据：`output/shop-payment-recovery-database-rollback.log` 及同前缀 root/commerce tests、build、coverage、typecheck 日志。主站和商城的完整检查结果另见 [验证记录](shop-verification.md)。商品仍由经营者填写真实规格、售价与库存后发布，税务和正式收款尚未开启。
