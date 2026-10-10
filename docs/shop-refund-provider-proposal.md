# Stripe provider 退款接入范围与批准记录

2026-10-10：经营者已在本会话明确回复“批准退款接入方案”。本地配置已改为 `./src/modules/snowforce-stripe`，保留 `stripe` 标识、`pp_stripe_stripe` ID 和手动 capture。生产尚未部署、迁移或开启收款。下列范围已获批准，批准不代表验收完成。

适配器通过 SDK 无关的 Medusa `IPaymentProvider` 合约加载原安装实现，并检查原生 `AbstractPaymentProvider` 基类，解决内部 Stripe 15 和商城 Stripe 23 声明合并冲突；未降级依赖、修改 node_modules 或降低检查。非退款方法沿用原实现，退款回调只 GET 核验保存的成功 Sandbox Refund；live 退款仍拒绝。

七项适配器测试包含实际 Medusa loader 注册、管理/销售配置和原方法保留。结合原生只读回调共十五项通过，Lines/Functions 100%、Branches 97.73%。前台 984 项、commerce 543 项完整测试、覆盖率、类型检查及两端构建通过；四项原生 workflow 数据库检查再次通过无 process warning，其 Stripe 和 dispatch 仍是 fixture。

独立 Snow Force Club sandbox 已连接，`livemode=false`。实际托管测试结账 3153 美分成功，连续退款 1052、1051、1050 美分全部成功，累计全退，追加一美分被拒绝。此为 connector 和测试卡发起的 Stripe 侧探测，未验证商城订单、手动 capture、库存、售后、应用幂等恢复、税务 reversal 或 webhook。证据：`output/shop-stripe-sandbox-probe-20261010.json`、`output/shop-stripe-sandbox-refund-receipt-20261010.jpg`。

## 已批准的接入范围

在 `services/commerce/src/modules/snowforce-stripe` 注册继承安装版 Stripe provider 的适配器，保留 `stripe` 标识与现有 provider ID。只重写 `refundPayment` 回调，调用已经单独实现的 `native-refund-reconciliation.ts`；创建付款、授权、捕获、取消、付款方式、账户及 webhook 方法继续继承原实现。然后将 `medusa-config.ts` 的 Stripe provider resolve 改为这个适配器。该注册作用于整个 commerce 服务，因此需要明确范围批准。

资金退款先由 `refund-execution.ts` 的固定操作 ID 和原始成交金额发起。收到具体 Stripe Refund ID 后先持久保存，再进入原生记账。原生回调只能读取已保存的退款并 GET 核验成功状态，不能再次 POST 退款。未经审核、没有本账本关联或租约不足的普通原生退款将被拒绝。这会改变 Medusa 自带退款按钮的可用范围，员工应使用新的售后退款操作。

只读核验函数重新核对原生退款 ID、员工身份、付款金额、原始全额 capture、具体 Stripe Refund、账户、环境、操作指纹和当前有效认领。网络核验后再读一次关联，拒绝在核验中失去租约或改变退款身份。不会把员工输入的“成功”标记当作资金成功。

## 已验证与边界

只读函数已接入本地适配器，尚未发布生产。默认入口和 live reader 均在访问依赖前被拒绝。八项聚焦测试覆盖其只读行为、安装版 raw/BigNumber 金额、关联和金额错误、账户/退款状态变化、原生证据变化及租约失效；该函数聚焦覆盖率 Lines/Branches/Functions 均为 100%。安装版 Stripe 23.0.0 SDK 已向本机 HTTP fixture 验证固定退款请求、幂等键、GET 和分页参数；不是商城实际 Stripe 网络联调验收。

PostgreSQL 17.11 / Medusa 2.21.2 一次性数据库六项候选执行验证通过，包括实际原生退款关联、只读核验 SQL、单次并发认领、准确负数订单交易、不可变请求/审计和私有权限。完整证据见 `output/shop-refund-execution-local-verification.json`。

另有四项初次原生 workflow 检查通过，使用实际 Query/Link、payment/order 模块、安装版 `refundPaymentWorkflow` 和只读回调；验证错误回调的记录清理、准确负数交易及相同操作重试。证据为 `output/shop-native-refund-workflow-local-verification.json`。Stripe 响应仍为 fixture，没有验证注册后的全服务 provider 或真实 Stripe Sandbox。

## 批准后的工作顺序

批准允许接入适配器和继续完成后台实际执行、调度及完整原生 workflow 接入。连续退款核对、售后完成条件和原生重复记账保护已经在本地实现，尚未迁移或部署。首先在独立 Stripe Sandbox 验证完整下单、捕获、连续部分退款、失败/丢失响应恢复、重复点击、税务冲销和 webhook。所有测试、构建、Sandbox 验收及正式税务/密钥/备份检查通过后才发布并开启正式收款；该批准不等于允许使用正式资金做测试。

## 当前剩余条件

此前自动审批的全服务范围问题已由明确批准解决，本地配置已接入，生产尚未变更。后台实际执行/调度、后端测试密钥/专用 webhook 和商城全链路验收仍待完成。受保护的测试密钥输入文件为 `C:/Users/123/.codex/private/snowforce-commerce-sandbox.env`，位于 OneDrive 项目外，仅当前 Windows 用户和 SYSTEM 可访问；不能将密钥写入聊天、证据或文档。正式 Tax 总部事实、登记及经营/商品分类、备份恢复和原生换货警告仍待完成。
