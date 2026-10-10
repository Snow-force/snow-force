# 2026-10-08 商城导航与上线核对

本地实现及只读线上检查；**本轮尚未发布代码、迁移生产分类、增加税务登记或启用付款**。本报告补充此前 2026-10-04 状态，不将旧测试环境数据当作当前正式账户事实。

## 本轮改动

八个顶级栏目、响应式多列菜单、任意深度分类、分类/集合/品牌/栏目/精选/优惠页面已实现。商品使用原生分类关联、集合、图片、USD 价格及库存可用性；新增后台分类在下次请求读取，无跨请求目录缓存。后台新增商品品牌、分类导航和集合展示组件，保留无关 metadata，并用内容指纹防止并发覆盖。操作说明见 [分类管理](shop-navigation-management.md)。

新增临时许可类型及有效日期字段。启用经营资料和产生新报价都使用数据库时间按 California 日历核对期限，旧版本只有“已确认”布尔值不再足以授权新结账。到期后的历史订单处理不会因新报价前置条件被关闭。

## 当前只读线上事实

| 项目 | 本次结果 | 含义 |
| --- | --- | --- |
| Railway SnowForce Commerce production | web、commerce、Redis 三项 Online，无待应用变更 | 仅说明当前服务运行，不证明支付和税务完整。 |
| 原生公开分类 | 1 个，Bag & Backpacks / `bags-backpacks` | 保留经营者新增的原生分类。新导航层级尚未迁移。 |
| 原生集合 | 9 个 | 现有精选、Sale & Clearance 等由后台管理，发布后可配置导航栏目。 |
| 公开商品 | 3 件 | 更新此前“公开商品为 0”的历史结果；本轮没有发布或下架商品。 |
| 新促销展示接口 | 404 | 新后台代码尚未部署，必须后台先发布。 |
| Stripe 正式账户 | Snow Force Club；用户已明确选用 | 不自动替换活动收款配置或发起正式交易。 |
| 正式 Stripe Tax Settings | active，总部 Irvine / CA / US | 不能据此视为已有加州登记或完成税账交易链路。 |
| 正式 Stripe Tax Registrations | 0，完整列表 has_more=false | 许可事实尚未在该正式环境建立 Tax registration 记录。 |
| Railway commerce 支付变量 | 当前变量清单未见 COMMERCE_STRIPE_API_KEY、COMMERCE_STRIPE_WEBHOOK_SECRET | 本轮未读取或写入密钥；受保护环境中仍需连接正式账户及对应 webhook。 |

公开 HTTP 证据：`output/shop-navigation-public-audit.json`。Stripe 和 Railway 读取没有执行外部写入，密钥、许可号码、完整地址和许可证图片不进入报告。

## 已确认经营事实与待完成事项

经营者提供的临时 California seller’s permit 对应 CLN GLOBAL LLC / SNOW FORCE，证件经营地点 Eastvale，期限为 2026-10-07 至 2027-01-04。经营者确认实际仓库与发货仍在 Irvine，并准备长期经营、申请持续许可。照片是资料来源，真实性和持续许可状态仍以 CDTFA 记录为准。本轮没有将临时许可改标为持续有效许可。

长期经营应完成持续许可及申报安排；临时许可对应指定经营期间，见 [CDTFA 临时经营说明](https://cdtfa.ca.gov/industry/temporary-sellers/)。Stripe Tax 中添加登记记录不等于向税局申请登记，见 [Stripe 登记流程](https://docs.stripe.com/tax/registering)。Stripe Tax 的总部 Irvine 与许可证 Eastvale 的用途需经营者确认；发货来源保持实际 Irvine。

上线付款仍需：正式加州 Tax registration、核准的主体/政策/商品及运费税码、受保护支付密钥和 webhook、应用并验收原生 capture 约束、部分退货金额与税务 reversal、独立 Sandbox 的完整交易及失败恢复验收，以及备份与恢复演练。代码测试或 Tax Settings active 不能代替这些结果。当前不解除收款门槛。

全额 capture 约束已经在本地实现：管理员入口先检查，数据库约束覆盖直接原生模块调用，sales 启动校验实际触发器。实际安装版 Medusa payment 模块与 PostgreSQL 17.11 的九项验证通过，包含并发、重复、失败恢复以及 provider 前拒绝部分金额；provider 为本地 fixture，没有真实 Stripe 扣款。迁移未应用到生产库。详见 [扣款边界](shop-full-capture-boundary.md)。

部分退款的原始金额分配、原生订单明细标记、已提交税账来源读取及逐行 tax reversal 请求/结果检查已在本地实现。新增 18 项测试及五项实际 Medusa order 模块本地验证通过；订单价格编辑至新版本后仍使用原始购买价格。2026-10-09 已补齐私有预留、成功资金证明和税务冲销持久任务；预留追加 17 项测试与八项原生数据库验证，资金/队列追加 20 项测试与六项原生数据库验证。最新增加员工后台预览及未启用的资金执行/只读核验模块，共增加 34 项测试和六项真实数据库候选验证。连续退款核对、售后完成条件和原生重复记账保护已在本地实现；实际退款后台执行、provider 接入、任务调度、完整原生 workflow 和真实 Sandbox 验收仍待完成，详见 [部分退款进度](shop-tax-refund-progress.md)。

## 环境修复与验证

新设备已安装 npm、根目录与 commerce 依赖、Git 配套 shell/OpenSSL 和浏览器测试运行时。旧同步依赖及类型文件均备份。按用户授权将无法读取的 `.env.production.local` 原样保存在 `.cache/env-production-local-unavailable`；未删除原文件内容。commerce 的 `.env.development` 仍无法从 OneDrive 读取，因此本轮未做直连生产数据库迁移。

本地默认 Turbopack build 读取 OneDrive `.data/registrations.json` 占位文件时失败；未删除或挪动经营记录。采用安装版支持的 `npm run build -- --webpack` 完成 lint、类型检查、页面生成与 standalone 构建。发布打包明确排除 `.data`、`.cache` 和附件；运行时路径不变。需在完整可读 checkout 的 CI 中核验默认构建。

2026-10-09 最终 commerce 完整测试 536 项通过，类型检查和 Medusa 前后台构建通过。退款执行/预览聚焦验证为 47 项通过，另有四项后台预览组件测试；连续已绑定退款另增加七项测试及五项真实数据库检查。售后完成另增加 12 项测试，新模块及服务/后台交互合计 35 项聚焦测试通过，模块 Lines/Functions 100%、Branches 98.57%。八项追加真实数据库功能检查通过，但新增等价换货路径存在 pg → Knex → MikroORM 事务查询弃用警告，完整无警告数据库验收仍待修复。连续核对模块和只读原生核验模块聚焦覆盖率均为 100%。隔离编译未注入生产 Redis 配置，会输出 fake Redis 提示；该编译结果不作为生产 Redis 配置证据。正式生产必须使用已配置的共享 Redis。

新增 capture 模块的 focused coverage 为 Lines 100%、Branches 97.30%、Functions 100%；包含数据库连接故障时拒绝继续并隐藏错误内容的检查。覆盖率不包含真实 Stripe provider 或生产交易验收。报告为 `output/shop-full-capture-coverage.log`。

前台完整测试 159 文件 / 984 项通过；覆盖率 Statements 58.32%、Branches 52.84%、Functions 56.36%、Lines 59.20%。这些是全项目覆盖率，不代表支付所有路径已验收。新增分类树模块的语句覆盖率为 98.41%。lint、类型检查和 Webpack standalone 构建通过。

Playwright 浏览器 8 项验收通过：桌面八栏目、多列后代层级、Escape 关闭及焦点恢复、父分类商品范围与售价、带空格的品牌页、集合及真实规格降价的 SALE、后台新增子分类后下次请求出现，以及手机触控展开且无横向溢出。浏览器没有 pageerror、console error 或 warning。测试发现并修复了悬停菜单的 Escape 行为和本版本页面参数 URL 编码问题；编码处理覆盖中文、空格、斜杠和字面百分号，不重复解码。

2026-10-09 最新完整回归日志为 `output/shop-navigation-root-tests.log`、`output/shop-navigation-root-coverage.log`、`output/shop-navigation-root-build.log`、`output/shop-commerce-tests.log`、`output/shop-commerce-typecheck.log`、`output/shop-commerce-build.log`。售后完成验证记录在 `output/shop-after-sales-refund-completion-local-verification.json`。浏览器证据为 `output/shop-navigation-browser-verification.json`，截图为 `output/shop-navigation-desktop.png` 和 `output/shop-navigation-mobile.png`。浏览器验收使用只读本地 fixture，测试商品不代表线上商品；不发起支付。
