# 商城后台付款异常核对

更新：2026-10-01。后台新增 `SnowForce payments`，入口为 `http://127.0.0.1:9000/app/snowforce-payments`。需要使用已有商城管理员登录。

## 运营步骤

1. 打开“初始化中断”列表，选择会话。页面显示美元金额、购物车、顾客、创建时间和测试/正式环境；超过 22 小时的尝试提示人工核对。
2. 在 Stripe 后台选择相同环境，检查原付款的 `metadata.session_id` 是否等于页面的会话编号。找到原 PaymentIntent ID 后输入 `pi_…`，点击“查询并核对 Stripe”。不要以截图或浏览器跳转结果作为付款证据。
3. 服务端只 GET Stripe 的实时付款。金额、USD 币种、环境、会话绑定、PI 身份或资金事实不一致时拒绝核对。页面只显示状态、已收和可捕获金额，不提供 client secret 或 API 密钥。
4. 管理员核对后勾选确认，点击“保存核实关联”。服务端再次查询 Stripe，并检查购物车归属、原报价、签名购买政策和原生资金记录。如果信息变化，需刷新并重新核对。
5. 保存成功后，让顾客刷新原结账页面并检查订单。页面保留原 PI 和付款会话；授权、完成订单、捕获、发货与退款仍使用原订单流程。关联操作不会创建、确认、取消、捕获或退款 Stripe 付款。

查询成功不会自动保存。响应丢失或 5xx 时，页面锁定当前候选、筛选和刷新，使用原 UUID 重试同一关联请求。服务端已保存的相同请求返回原回执；不同管理员或不同内容不能冒用它。明确的输入、权限、缺失记录或冲突错误会要求重新核对。

“全部”列表保留已关联及已退役尝试的审核信息。此队列只包含 SnowForce 持久初始化流程建立的会话；其他原生付款仍在订单后台查看。列表每页 50 条。

## 数据与权限

使用原有私有 `commerce` schema，不新增表或权限。原始创建绑定保存在 `payment_session.metadata.snowforce_payment_creation`；审核回执保存在同一行的 `snowforce_payment_association`，包含请求 UUID、管理员 ID、PI ID、原生及 Stripe 事实指纹和时间。

关联在 SnowForce checkout 和原生 cart 两把租约锁内执行，外部 GET 不占用 SQL 事务。短事务锁 cart、collection、session，重新读取资金状态和指纹后条件更新 provider data/status，追加审核键并保留其他 metadata、context、金额和 raw_amount。已完成/删除购物车、已有订单/Payment/授权、多个关联、已退役会话、失效租约和并发变化均阻止保存。

原生 Admin 身份认证与服务内 `user` actor 校验共同保护接口，匿名或会员不能操作。API 白名单响应不包含 provider data、client secret、密钥摘要或内部原始 metadata。两个管理员拥有当前标准 Medusa 后台权限；尚未启用细分岗位 RBAC。

## 边界与验收

创建时凭据摘要和环境必须仍匹配当前配置；更换或撤销密钥后不能借此页面跳过原绑定，需要额外确认同一 Stripe 账户后制定恢复方案。无法找到原 PI 时不能假定从未付款，也不能解除购物车并另建付款。这一页面没有自动扫描 Stripe、清理记录或定时对账。

验证包括真实 React 18/Admin 组件、后台身份边界、丢失回执的幂等重试、错误绑定/金额/环境、租约及原生并发资金事实。实际商城专用角色通过验证 CA 的 TLS 连接 Shared Pooler，在外层事务/savepoint 中执行真实列表 SQL、条件关联、竞态拒绝、元数据保留和重放；全部回滚，Stripe 使用 GET 替身。两个既有管理员实际 HTTP 登录及新列表为 200，未知记录 404，匿名 GET/POST 为 401。

这不等同于真实 Stripe 支付、跨进程故障恢复、webhook 到订单、捕获、发货及退款全链路验收。当前没有真实订单；正式主体、商品销售资料、税务和生产 Redis/HTTPS 等仍待完成。证据前缀为 `output/shop-payment-operations-`。
