# 商城退款最终状态核对

更新时间：2026-10-01。此阶段已完成代码、私有表、权限和事务回滚验证；没有执行真实 Stripe 退款，尚不代表商城可正式收款。

## 运营人员如何使用

Medusa 后台的 **SnowForce returns** 增加“核对 Stripe 款项”。操作只读取 Stripe 并保存结果，不发起退款、补扣款或修改库存。页面显示最近核对时间、处理中或金额不一致；原生付款记录变化后提示重新检查。

“核对并完成”每次都重新读取 Stripe，不能用旧的核对记录直接完成申请。原生收货完成、换货送达、`pending_difference=0` 之外，还要求每个有效 Stripe PaymentIntent 的币种、原金额、实收金额与原生付款/捕获金额一致，Stripe 成功退款合计与原生退款合计完全一致。任何 pending / requires_action 退款、未捕获付款、金额差异或查询失败都阻止完成。没有活动付款数据同样不会获得空集合的“验证通过”。

failed / canceled 退款不计作成功金额。历史失败尝试后已有成功替代退款、且总额完全一致时可通过；原生仍把失败退款计入已退金额时必须先由运营人员核查。Stripe Dashboard 的额外退款若没有对应原生金额，也会形成差异。这里没有自动再次退款或自动抵销原生财务记录。

Stripe `succeeded` 是当前支付机构状态，不等于顾客已看到银行入账。仍应告知顾客到账需要银行处理时间；状态以后可能失败或需要操作。依据 [Stripe Refunds](https://docs.stripe.com/refunds)。

## 数据与安全

沿用现有 Supabase 项目和会员登录；新增以下两张私有 `commerce` 表：

| 表 | 内容 |
| --- | --- |
| snowforce_refund_verifications | 每单最近观察时间、付款事实 fingerprint、verified / pending / exception、Stripe refund ID/状态/美分金额及操作来源 |
| snowforce_refund_verification_history | 每次观察的追加记录，含工作人员/申请或 Stripe event ID；触发器禁止修改和删除历史 |

两张表均由 `snowforce_commerce` 拥有，启用 RLS，PUBLIC、anon、authenticated、service_role 没有直接权限，不通过 Data API 暴露。没有把工作人员或支付核对信息写入顾客可读取的原生 order metadata。只读取所需支付事实，不保存 client secret、卡号、完整 PaymentIntent 或银行资料。

所有金额按精确 USD 美分核对，不把 0.001 美元偷偷舍入成有效金额。每笔 PaymentIntent 的退款列表完整翻页，拒绝重复 ID、错误币种/付款归属、未知状态或不完整分页。网络请求先完成，再以短事务锁原生 payment 行，重读 fingerprint 并保存；付款发生变化、观察过期或已有更新的观察时拒绝保存/完成。

独立 Stripe SDK 锁定 23.0.0，查询 API 明确为 2026-09-30.endive；没有替换 Medusa 原生支付 provider 的私有 SDK。自动观察器复用现有 `/hooks/payment/stripe_stripe` 接收队列，独立验证原始字节签名，处理 refund.created / refund.updated / refund.failed，并监听原生 payment.refunded。事件只定位本商城关联订单，再读取 Stripe 当前状态，不用乱序事件中的旧状态覆盖新状态，也不让共享 Stripe 账户的其他业务事件写入商城订单。参考 [Stripe 退款通知](https://docs.stripe.com/refunds#refund-events) 与 [退款列表 API](https://docs.stripe.com/api/refunds/list)。

## 当前验证证据

- 单一迁移 `20261001212924_shop_refund_finality.sql` 已执行，本地文件已对齐远程记录版本；两张表 owner/RLS/权限、4 个索引及 security-invoker 历史触发器已核实。
- 实际专用角色执行源码的读取、精确金额转换、pending/succeeded 保存、旧观察拒绝、付款竞态拒绝和历史更新/删除拒绝；整个测试事务回滚。测试前后订单、核对表和历史表均为 0，没有调用 Stripe 资金 API。
- 实际 anon / authenticated / service_role 无权限读取验证通过。Security Advisor 新增两条私有表 [RLS 无 policy INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)符合仅服务拥有者访问模型，没有新增 WARNING/ERROR。既有 [Auth 泄露密码保护 WARN](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)未更改。
- 后台 97 项测试、typecheck、完整后端/Admin 构建和串行覆盖率通过。核对服务 97.01% lines / 92.86% branches；观察器 100% lines / 90.91% branches。实际受限角色 SQL 验证补充了单元覆盖中的真实查询与 upsert 路径；这些证据仍不是成功支付/退款端到端演练。
- 主站 144 文件 / 868 项测试、覆盖率及完整 lint/类型/构建通过。安装独立 SDK 时在线依赖审计为 0，随后离线复核为 0。
- 恢复后 `/shop` 和后台 `/health` 为 200；未登录核对 POST 和售后详情 GET 均为 401。没有模拟已登录管理员浏览器验收。

日志：`output/commerce-refund-finality-{tests,typecheck,build,coverage,rollback}.log`、`output/shop-refund-finality-root-{tests,build,coverage}.log`。代码未提交、推送或部署。

## 上线仍需完成

本地仍使用内存事件总线和锁，正式环境必须配置并验证持久 Redis/server/worker。退款观察器依赖事件队列和签名时效；还需要漏通知/停机恢复的定时核对、异常工作队列及提醒。已关闭申请以后发生退款失败，目前只记录异常并在后台显示最近核对状态，不会自动重新打开申请。

原生 Stripe 退款请求本身仍需要稳定业务操作 UUID、网络结果不确定时的持久 outbox/恢复核对；当前金额核对不会修复原生新退款 ID 导致的重试风险。会员订单“refunded”的原生状态展示也仍需与真实资金状态对齐。

税务交易与部分退款税额分摊、Tax reversal、固定政府费用以及政策发布/订单快照尚未完成。这两张资金观察表不是五类税务账本的替代品，且记录的是每个付款的原生/Stripe 合计，没有臆造原生 refund ID 与某条 Stripe refund 的一对一分摊关系。

还需确认后台管理员、销售主体、商品正式价格/库存和许可证，完成 Sandbox 的实际付款、收货、退换货、失败退款/乱序事件与重试恢复演练。正式结账继续保持关闭。
