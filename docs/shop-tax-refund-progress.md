# 部分退款与税务冲销实现进度

2026-10-10 原生商城 Sandbox 联调：实际会员登录、原生购物车、Stripe Tax 报价、支付授权 webhook 创建原生订单和预留库存、员工全额捕获、后台发货/送达、顾客退货申请、员工审批和原生收货、三笔退款及税务冲销已串联通过。商品 $30.00、税 $2.33、实收 $32.33；原始金额分批退款 $10.78/$10.78/$10.77，税务冲销合计 $2.33。实际定时任务执行资金及税账，真实签名 webhook 关联三个原生退款；员工完成售后，会员订单投影显示已退款。再次提交执行返回 409，没有第四笔退款；库存恢复十件、预留为零。验收证据：`output/shop-native-sandbox-acceptance-20261010.json`。

联调修复了未关联支付集合的原生 graph 投影、安装版配送规则字段、原生送达数量及退货的 claim/exchange 关联读取，以及已完成售后的重复执行状态码。前台 984 项测试、覆盖率与构建通过；后台最终源码完整 575 项测试、类型检查和构建通过，相关 97 项及退款专项 78 项覆盖率检查通过；退款运行时覆盖率 100%，后台退款命令行覆盖率 98.65%。测试账号、会员测试订单、隔离数据库、临时进程和 webhook secret 已清理，经营者提供的 Stripe 密钥保留。测试环境使用隔离数据库、回环 HTTP 和本地事件总线/锁；本次完成的是实际 API 交易链路，完整前台浏览器购买、生产迁移与部署、正式账户配置及正式收款尚未完成。以下为历史记录，不代表最新验收边界。

2026-10-10 退款运行时更新：本地后台新增按已审核原始金额执行退款的入口、逐笔确认和状态读取；现金退款及税务冲销任务每两分钟调度，每队列单次最多处理十笔。失去响应时重试原 operation，切换售后申请会终止旧请求的界面更新。启用检查核对实际 Medusa 支付模块当前派发的 GET-only adapter 实例、同一数据库连接、密钥指纹、销售模式和 webhook 配置，避免旧实例曾被创建就错误授权 stock provider 再退款。配置默认关闭，预检拒绝管理模式或不完整凭证下启用。前台 984 项、后台 570 项完整测试及两端构建通过；重点 45 项含覆盖率通过，运行时检查覆盖率 100%。隔离 PostgreSQL 中实际 MedusaApp/payment module 派发及后台 allocation/cash/tax 状态查询通过，原生 workflow 四项与预留八项检查通过，无进程警告；临时数据库清理，PostgreSQL 停止。数据库联调仍使用 fixture Stripe/税账数据，无真实网络资金调用；完整真实订单/库存/webhook 串联及生产迁移、部署、正式登记和正式收款尚未完成。证据：`output/shop-refund-runtime-native-dispatch-verification.json` 与 `output/shop-refund-runtime-validation.json`。以下为先前记录。

2026-10-10 最新：经营者批准的 California Sandbox sales-tax 登记已 active，实际应用税务设置校验通过。含税测试金额 3233 美分经实际支付创建工厂和继承的 capture 方法手动捕获；三个退款 1078/1078/1077 美分、税务冲销 78/78/77 美分成功，远端重试保持同一 ID，金额完全守恒。测试使用合成订单等标识和 receipt 字段，未执行原生账本/后台/队列/库存/webhook，完整商城验收仍未完成。真实接入揭示的循环导入和不支持的 currency 退款参数已修复，新增十种首次模块加载顺序回归及严格退款 schema 检查；前台 984 项、后台最终源码 554 项完整测试、覆盖率、类型检查和两端构建通过；原生 workflow 四项和预留八项数据库检查通过，无进程警告，隔离 PostgreSQL 已停止。证据为 `output/shop-sandbox-ca-registration-20261010.json`、`output/shop-sandbox-tax-quote-check-20261010.json`、`output/shop-sandbox-tax-refund-check-20261010.json`。以下补充为历史状态。

2026-10-10 补充：受保护的前后端测试密钥已通过同账户核验；经营者确认 Irvine 为总部后，独立 Sandbox 的总部地址已保存并读回 active。使用实际支付创建工厂完成未付款手动 capture PaymentIntent 的创建、同键重试、前端读取与取消，资金始终为 0。Sandbox 尚无 California 登记，实际商城税务校验正常拦截；创建测试登记方案待经营者确认。生产账户和正式收款未变，完整商城交易/退款/税务/webhook 验收仍未完成。新增证据见 `output/shop-provided-sandbox-key-preflight-20261010.json`、`output/shop-sandbox-irvine-headquarters-20261010.json`、`output/shop-sandbox-payment-key-check-20261010.json`。

## 2026-10-10 接入批准与真实 Stripe 侧测试

经营者已明确批准退款 provider 全服务接入范围。本地 `snowforce-stripe` 已继承安装版 provider，保留原 ID 和非退款方法，退款回调只 GET 核验持久保存的成功 Sandbox Refund。修复内部 Stripe 15 与商城 Stripe 23 声明冲突，未修改依赖或跳过检查。七项适配器测试包含真实原生 loader 和管理/销售配置；结合八项原生回调测试共十五项通过，Lines/Functions 100%、Branches 97.73%。

独立 Snow Force Club sandbox 已实际授权，`acct_1ToZcNAbMQunT3pr`、`livemode=false`。托管结账以测试卡完成 3153 美分付款；通过 connector 连续退款 1052、1051、1050 美分，各自 GET 核验成功。最终 charge captured=true、amount_refunded=3153、refunded=true；追加一美分被拒绝，累计金额不变。原生收据显示三个退款和 Adjusted total $0.00。证据：`output/shop-stripe-sandbox-probe-20261010.json`、`output/shop-stripe-sandbox-refund-receipt-20261010.jpg`。

本次真实网络测试仅验证 Stripe 侧，使用自动 capture，未通过商城创建订单、库存/税务/原生退款关联，未验证应用幂等恢复或 webhook。完整商城 Sandbox 联调、后台实际执行和调度仍未完成。前台 984 项、commerce 543 项完整测试、覆盖率及两端构建通过；四项原生 workflow 数据库检查再次通过无 process warning，其 Stripe 和 dispatch 仍为 fixture。临时数据库清理、PostgreSQL 停止。生产迁移、部署与正式收款未执行，原生换货警告仍为独立待办。以下为历史记录。

2026-10-09，本地代码及隔离测试；正式收款仍关闭。**退款分配、预留、资金成功证明和税务冲销队列已本地实现。后台已增加原始金额预览和保存审核计划的入口，候选资金执行模块及只读原生核验已完成隔离验证，但未接入服务。实际退款后台执行、运行调度、售后完成校验和真实 Stripe Sandbox 验收仍未完成，不能将本报告视为可上线退款链路。**

## 本轮已实现

`tax-refund-contract.ts` 从已经提交的原始税账计算退回数量对应的折后商品金额和销售税，不读取当前商品价格、不重新套用税率。连续分批退回的美分总和等于原始成交金额。模型检查重复操作、重复商品、已经退回数量和各项金额。

新增 `tax-refund-reservations.ts` 与 CLI 生成的 `20261009052229_shop_refund_allocations.sql`。私有预留保存原始成交来源、原生订单明细、审核输入、退款金额、固定税务冲销请求和内容指纹；订单与付款行锁串行化预留。已批准的售后申请必须仍处于 processing、版本匹配且绑定正确原生退货/换货。退款商品数量受原生已收货数量限制，raw 数值也必须一致；不存在或已取消的关联不能授权预留。

相同 operation ID 与相同审核内容重试时返回已保存结果，输入顺序变化不会产生新请求；更换数量、运费决定、售后申请或审核人会被拒绝。所有历史记录都必须通过完整性校验，取消记录仅从有效数量计算中排除。预留进入 started 前再次检查审核与收货信息并冻结其数量；started 表示已进入执行尝试边界，不表示顾客已经收到退款。预留服务本身不发起资金退款。

取消保留审计证据，只允许最后一笔从未尝试执行的预留，以免破坏后续计划的分币位置。started 不能取消或释放数量。存在尚未绑定本账本的原生资金退款时，新预留或首次启动会拒绝继续；最新追加逐笔核对已完成原生退款与预留、资金、税务和订单扣减关系，详见本报告末节。

预留命令通过新增私有后台退款预览入口调用，入口先完成真实员工会话鉴权，不能将存在的 user ID 当作登录凭证。返回经过裁剪的原始金额明细，不返回原始地址、付款来源及私有快照。新表与函数属于私有 commerce 角色，启用 RLS，无浏览器或 service_role 授权；invoker 触发器保护金额、身份、审计和状态。

运费及其原销售税只能按原始金额退回一次。原报价中的政府配送费必须逐项保留审核决定及理由，可单独保留或退回，不能重复退回；模型不替经营者决定适用规则。

新报价应用时，在原生商品税行 metadata 中保存 quote ID 和 cart line ID。安装版 Medusa 的 `prepareLineItemData` 将该标记复制进订单税行，使重复 SKU 仍可分别对应原始成交明细。旧订单若缺少标记，读取会进入核对错误，不能猜测关联。

`tax-refund-source.ts` 重新核对已捕获的原始成交证据、已完成且内容指纹匹配的税账，以及原始订单版本的商品数量、价格和 raw 数值。订单后续版本的价格修改不会改变原始退款基数。本函数是内部服务，未来入口必须先完成员工权限或订单归属校验。

冲销请求使用原始 tax transaction line IDs、负数商品金额与税额、固定 operation reference，并逐项检查返回结果的关联、数量、税码、币种、环境及金额。依据 [Stripe create_reversal API](https://docs.stripe.com/api/tax/transactions/create_reversal)。税务冲销记录税负变化，本身不向顾客退款；调用者必须先核对实际成功的资金退款。

## 已获得的证据

新增金额模型与来源读取共 18 项测试通过；结合报价应用回归共 26 项通过。覆盖连续分批退货、重复 SKU、零税额、运费、配送费审核、被改动的历史数据和金额不一致。focused coverage 为 Lines 100%、Branches 95.05%、Functions 93.83%；它不覆盖尚未接入的资金退款、持久化或后台入口。

实际安装的 Stripe SDK 已向本地 HTTP fixture 发送并验证了逐行负数请求和 idempotency key，未调用 Stripe 服务器；此项不证明正式或 Sandbox 环境的 API 响应语义。

`scripts/verify-tax-refund-native-local.mjs` 在 PostgreSQL 17.11 的临时 loopback 数据库执行实际 Medusa 2.21.2 order migrations、创建含重复 SKU 的原生订单、将原生价格编辑到版本二，然后使用实际 SQL 读取原始版本并计算三次退款。五项验证通过。成交税账表与已捕获来源为 fixture；**该验证没有覆盖完整生产税账迁移、真实支付 provider 或真实 Stripe 税务冲销响应。** 临时数据库已删除，本地测试服务器已停止。

证据：`output/shop-tax-refund-native-local-verification.json`、`output/shop-tax-refund-native-local.log`、`output/shop-tax-refund-contract-coverage.log`。

本轮完成后重新运行前台全部 984 项、commerce 全部 438 项测试、前台 test:coverage、commerce typecheck、Medusa 前后台 build 和前台 Webpack build，均通过。默认 Turbopack 的 OneDrive 占位文件限制见导航核对报告；未删除经营记录。

## 仍需接入

退款分配、串行预留、原生/远端成功资金证明和税务冲销任务已本地实现并验证，逐笔已绑定退款继续预留也已本地接入。实际资金执行候选模块仍未注册，尚需接入后台实际执行、任务调度和售后完成校验。还需独立 Sandbox 中的连续退款、失败恢复、重复请求和 webhook 验收。不要将 started 状态作为资金成功或税账完成依据。

正式 Tax registration、总部地址确认、受保护密钥/webhook 和生产备份恢复也仍在上线清单中。本轮没有变更生产分类、税务登记、付款设置或正式交易。

## 2026-10-09 预留验证

新增 17 项聚焦测试通过，Lines 100%、Branches 99.28%、Functions 95%。覆盖重复请求、输入顺序、审核/收货限制、历史被改动、取消边界、事务回滚、付款变化与启动前复查。

`scripts/verify-tax-refund-reservations-local.mjs` 在 PostgreSQL 17.11 临时 loopback 数据库执行实际 Medusa 2.21.2 order、user、payment migrations 和原生履约、退货申请、分批收货接口。八项验证通过，包括真实并发预留、分币金额 1052/1051/1050、取消后安全重建、数据库拒绝篡改与私有角色权限。原始税账、售后申请和 Stripe provider 使用明确 fixture；不证明完整生产迁移或真实 Stripe 退款成功。临时数据库已删除，测试 PostgreSQL 已停止。

证据：`output/shop-tax-refund-reservations-local-verification.json`、`output/shop-tax-refund-reservations-local-verification.log`、`output/shop-tax-refund-reservations-coverage.log`。生产迁移未应用。

本轮最终完整回归：前台 159 文件 / 984 项、commerce 455 项测试通过；前台 test:coverage、lint/类型检查/Webpack standalone build、commerce typecheck 和 Medusa 前后台 build 均通过。日志为 `output/shop-navigation-root-tests.log`、`output/shop-navigation-root-coverage.log`、`output/shop-navigation-root-build.log`、`output/shop-commerce-tests.log`、`output/shop-commerce-typecheck.log`、`output/shop-commerce-build.log`。测试与构建未出现额外 warning、React act 警告或错误输出。

## 2026-10-09 资金证明与税务冲销队列验证

新增 `tax-refund-funds.ts`、`tax-refund-ledger.ts`、`tax-refund-worker.ts` 和 CLI 生成的 `20261009170338_shop_refund_tax_outbox.sql`。资金证明必须对应原始全额 capture、正确原生退款 ID、审核人、预留金额与指纹，以及 Stripe 的具体 Refund ID、PaymentIntent、账户和密钥环境。只接受 succeeded；pending、requires_action、failed、canceled 或关联不一致不能排队。Stripe Refund 本身没有 livemode，环境证据来自账户、受保护密钥及原始 PaymentIntent，依据 [Refund 对象](https://docs.stripe.com/api/refunds/object)。

短事务重新锁定原生付款和退款，检查网络证据仍新鲜，再原子保存不可变 funds 与 queued task。任务使用 SKIP LOCKED、三分钟认领租约和独立 token；过期持有者不能提交结果。逐行冲销使用固定 `snowforce-tax-refund:<operation ID>` 幂等键和已保存请求。未知 POST 结果可在保守的 22 小时内重试；超过窗口且没有远端 ID 时转人工核对。已有远端 ID 的恢复只 GET，不再创建冲销。

冲销前及完成前都重新读取账户、PaymentIntent、具体 Refund 和原生退款；账户、环境或金额变化会进入人工核对。完整读取冲销行并核对原始成交关联、数量、负数美分、税码及日期后，才原子保存结果和 ready 状态。员工补关联同样只 GET，不能用其输入替换已保存远端身份。服务尚未接入 HTTP、调度或售后完成条件，原始私有快照也不向顾客公开。

20 项聚焦测试通过；三模块合计 Lines 99.05%、Branches 92.98%、Functions 87.67%。资金 reader 的独立 SDK 调用闭包仍有未覆盖行；worker adapter 已使用实际 Stripe 23.0.0 SDK 向 loopback HTTP fixture 验证 GET、POST、API version、幂等键和分页参数。此覆盖率与本地请求不能证明真实 Stripe 响应语义。

运行 `node scripts/verify-tax-refund-reservations-local.mjs --with-tax-outbox`，在 PostgreSQL 17.11 的临时数据库执行实际 Medusa 2.21.2 原生退款 API，以及私有角色下的资金证明/任务 SQL。六项新增验证通过：原生 raw 金额与 capture 身份、插入故障事务回滚、重复观察、并发认领、固定请求重试与保存 ID 后的 GET 恢复、不可变结果和私有权限。原有八项预留验证也再次通过。Stripe 响应、成交税账及售后资料使用明确 fixture；没有调用 Stripe 服务器。临时数据库已删除，本地 PostgreSQL 已停止。

当前完整回归：前台 159 文件 / 984 项、commerce 475 项测试通过；前台 test:coverage、lint/类型检查/Webpack standalone build、commerce typecheck 与 Medusa 前后台 build 均通过。隔离管理编译的 fake Redis 信息不是正式 Redis 配置证据。证据为 `output/shop-tax-refund-outbox-local-verification.json`、`output/shop-tax-refund-outbox-local-verification.log`、`output/shop-tax-refund-outbox-coverage.log` 及上述全量日志。新迁移未应用生产，代码未发布，收款继续关闭。

## 2026-10-09 后台预览及未启用的资金执行候选模块

新增员工鉴权的 `GET/POST /admin/snowforce/after-sales/:id/refunds` 及售后页退款预览。预览只读取原始成交金额，数量受已收货和已预留数量限制；换货关联从服务器推导。员工逐项决定运费与政府配送费并填写理由，服务器拒绝客户端金额、成功标记或私有成交来源。重复提交相同审核计划保留 operation ID；输入改变才产生新的 ID。响应为 `private, no-store`，只返回审核明细，当前明确显示实际资金执行未启用。界面不把保存预览描述为已退款。

新增 `refund-execution.ts` 和 CLI 生成的 `20261009220808_shop_refund_execution.sql`。候选任务保存不可变资金请求、固定 `snowforce-cash-refund:<operation ID>` 键及具体 Refund ID；先保存远端身份再做原生记账，未知响应可在保守窗口内重试相同请求，已知身份仅通过 GET 恢复。退款成功后才加入税务冲销队列；资金 ready 与税务 ready 是不同完成条件。原生付款、capture、账户、环境、全部已知退款历史及有效认领均重新核对，发起新的资金 POST 前再次核对售后版本、原生退货状态与收货数量。

新增未注册的 `native-refund-reconciliation.ts`。回调仅 GET 核验已经成功的特定退款，要求原生记录关联当前具体 claim token，网络读取后再次核对同一个认领和请求。旧工作者不能借用新的有效认领。普通未关联的原生退款不能使用这个回调。

**候选引擎默认入口、正式环境和现有原生 bookkeeper 均被主动拒绝；只读回调同样拒绝默认及正式环境。当前 `medusa-config.ts` 继续使用原安装版 Stripe provider，没有运行调度或实际资金执行 HTTP 入口。** 自动审批拒绝全服务 provider 替换，需明确范围批准，具体提案见 [退款适配方案](shop-refund-provider-proposal.md)。原生重复记账约束与售后资金/税账完成条件随后已在本地补齐；provider 注册、实际执行后台、任务调度和真实 Sandbox 验收仍未完成。

PostgreSQL 17.11 / Medusa 2.21.2 一次性数据库新增六项执行验证通过：审核队列重复恢复、原生退款与具体只读核验 SQL、并发单次认领、真实负数 USD 订单交易、请求/完成/审计不可变及私有权限。原有八项预留和六项税务冲销验证再次通过，其中预留验证加入首次资金 POST 前审核版本变化拒绝。Stripe 账户、付款和退款响应均为明确 fixture；实际 Stripe API 调用为零。临时数据库已清理，本机 PostgreSQL 已停止。

实际安装版 Stripe 23.0.0 SDK 已向本机 HTTP fixture 验证具体账户/PaymentIntent/Refund GET、完整退款分页参数、准确美分 POST、API version 和固定资金幂等键；路径注入、无关幂等键或无效 metadata 在 HTTP 前拒绝。这不能代替真实 Stripe Sandbox 验收。证据见 `output/shop-refund-execution-local-verification.json`、`output/shop-refund-execution-local.log`、`output/shop-refund-execution-focused.log` 与 `output/shop-refund-execution-coverage.log`。

2026-10-09 再次只读核对：已连接 Stripe 仍只有 Snow Force Club 正式账户；Tax Settings active，总部 Irvine，Tax Registrations 完整列表为 0。经营者已确认实际发货 Irvine，但 Tax 总部用途仍待确认；独立 Sandbox 连接、正式税务记录、受保护 API key/webhook 以及备份恢复仍待完成。Railway commerce 变量名称清单未见支付 key/webhook secret；未读取或写入秘密值。没有执行真实资金退款、发布代码、应用生产迁移或开启正式收款。

最终完整回归：前台 159 文件 / 984 项、commerce 509 项测试通过；前台 test:coverage、lint/类型检查/Webpack standalone build、commerce typecheck 和 Medusa 前后台 build 均通过。本轮新增 34 项测试；最新 47 项聚焦测试包含既有 17 项预留测试，另有四项后台预览组件测试。四个模块合计 Lines 92.48%、Branches 94.15%、Functions 90.43%；只读原生核验模块三项均为 100%。未覆盖的候选原生 bookkeeper 及部分队列路径仍不构成完整实际财务验收；默认/正式执行被拒绝，不能根据覆盖率解除收款门槛。最终日志无意外 warning、React act 警告或失败；编译的 fake Redis 为隔离管理构建信息。

## 2026-10-09 连续已绑定退款核对

新增 `tracked-refund-balance.ts` 和 CLI 创建的 `20261009224620_shop_tracked_refund_continuation.sql`，接入新预留和首次启动。保留原生付款锁，完整读取所有当前退款与所有私有资金证明，要求每一笔一一对应。逐笔重新验证同一份原始成交、预留分配、原生金额/raw 金额、审核人、付款环境、原始 capture 和不可变资金指纹。每笔必须有 ready 资金执行、同一 Refund ID、ready 税务任务和完整可复核 reversal，以及唯一、准确的负数 USD 订单交易。总额不能超过原始成交，原生退款 ID、Stripe Refund ID 和操作 ID 都不能重复。

资金或税务尚未完成时，后续首次执行不能绕过等待。旧原生退款、人工退款、已删除的原生记录、孤立证明、重复记账或内容不一致都会要求核对，不根据汇总“已退金额”猜测。这个服务只做私有读取和短事务锁，不调用 Stripe，也不向顾客返款。实际资金请求前的 Stripe 历史读取仍会核对当前远端状态；本组件使用已提交的完成证据授权继续预留。

新迁移新增私有 invoker 核对函数，并完整保留原预留触发器的不可变证据、售后版本、退货/换货关联、已收数量和最新预留取消规则。仅将“存在任何原生退款即拒绝”替换为逐笔完成证明检查。不注册 provider，不启用销售、HTTP 执行或调度。

七项新增测试通过；结合预留回归共 24 项通过。逐笔/累计核对模块 Lines、Branches、Functions 均为 100%；包含恰好原始总额、超额一美分、重复三种身份、未完成任务、改动税务明细、错误 raw 值及孤立/缺失证据。该覆盖率不是实际 Stripe 交易证据。

PostgreSQL 17.11 / Medusa 2.21.2 一次性数据库五项追加验证通过：未完成资金状态拒绝；第一笔 1052 美分完成资金、税务和原生负数交易后，实际第二笔原始金额预留以 1051 美分进入 started；订单 raw 扣减变化拒绝；原生退款软删除后的孤立证明拒绝；私有函数无 browser/service-role 权限且保持 invoker。原有预留、税务冲销和候选执行验证再次通过。明确 fixture 的 Stripe 响应及原始成交用于本机验收；没有实际 Stripe HTTP 或生产修改。临时数据库已清理，测试 PostgreSQL 已停止。

证据：`output/shop-tracked-refund-coverage.log`、`output/shop-tracked-refund-local-verification.json`、`output/shop-tracked-refund-local.log`。新迁移未应用生产，实际资金执行及全服务 provider 注册仍等待范围批准，真实独立 Sandbox 尚未连接。

本轮最终完整回归：前台 159 文件 / 984 项、commerce 516 项测试通过；前台 test:coverage、lint/类型检查/Webpack standalone build、commerce typecheck 和 Medusa 前后台 build 均通过。连续核对与预留组合的覆盖率为 Lines 99.57%、Branches 99.47%、Functions 96.49%，连续核对模块自身三项均为 100%。未出现意外警告、React act 警告或错误；Medusa fake Redis 信息来自隔离管理编译，不是生产配置验收。所有生产付款、provider 配置及数据库迁移继续保持未启用/未应用状态。

## 2026-10-09 售后完成的逐笔退款校验

已接入 `reviewAfterSales` 的完成命令。Stripe 查询在锁外进行，短事务按订单、申请、付款顺序加锁，并保存最新核对记录。关闭前逐笔核验同一原始成交、具体 Stripe/native Refund ID、准确美分、原生负数订单交易，以及 ready 资金任务和已完成税务 reversal。不能用相等的汇总金额替代退款关联。退货申请的各行退款数量必须完整覆盖批准并收货的数量；未执行预留也会阻止关闭。换货仍检查原生收货、差额结清和替换商品送达，等价换货可无现金退款；涉及退款时仍需完整资金和税务证明。后续顾客上传物流导致的版本递增不会否定已完成退款，但未来版本、变更关联或其他申请的证明均不能关闭本申请。

CLI 创建的 `20261009230429_shop_after_sales_refund_completion.sql` 增加私有 invoker 触发器，防止通过直接更新状态绕过逐笔资金/税务、申请数量、完整收货、换货送达与新鲜员工核对。保留原申请不可变字段、版本递增、状态流转和审计历史触发器，没有新增浏览器/service-role 权限，没有启用 provider 或销售。旧人工/原生退款只有汇总核对时，申请继续保留处理中并要求完整对账。

新增 12 项测试，全量 commerce 528 项通过；新模块及售后服务/后台交互聚焦合计 35 项通过，模块 Lines 100%、Branches 98.57%、Functions 100%。新旧逐笔核验共享可复用的完整资金/税务 fixture，没有跳过测试或将金融核验替换为固定成功。前台 159 文件 / 984 项、test:coverage、lint/类型检查/Webpack standalone build，commerce typecheck 与 Medusa 前后台 build 均通过。全量测试和构建无新 warning、React act 警告或失败；管理构建 fake Redis 仍是隔离编译提示。

PostgreSQL 17.11 / Medusa 2.21.2 一次性数据库八项功能检查通过：无最新员工核对拒绝；错配 ID/金额或处理中 Refund 拒绝；改动 raw 收货数拒绝；超过 120 秒的核对拒绝；对应退款、订单记账和税务完成后原申请可关闭且不可重开；后续两件全收货申请不能借用前一申请已完成退款；实际等价换货在替换商品送达前拒绝，送达后无现金退款也可关闭；私有 invoker 权限保持隔离。使用实际 customer/order/return/payment/user 模块迁移与 API、完整售后及资金账本迁移，订单/付款跨模块 Link 和 Stripe 响应为明确 fixture。既有八项预留、六项冲销、六项候选执行和五项连续退款验证也再次通过。

**尚未取得无警告的真实数据库验收。** 新增换货路径重现 pg 8.23.1 的同一客户端并发查询弃用警告，trace 定位到 pg → Knex → MikroORM 原生事务查询。原生 `createExchange` 包含同一事务下的并行持久化调用；需要进一步验证受支持的原生事务串行化或依赖修复。未修改 node_modules、降级依赖或禁止警告。报告记录为 `functional_checks_passed_with_warning`，不能据此宣称完整上线验收已通过。

证据：`output/shop-after-sales-refund-completion-coverage.log`、`output/shop-after-sales-refund-completion-local-verification.json` 与带 trace 的 `output/shop-after-sales-refund-completion-local.log`。临时数据库清理；本轮没有真实 Stripe HTTP、资金退款、生产迁移或部署。正式收款继续关闭。实际执行后台/调度、provider 范围批准、独立 Sandbox、真实税务/受保护密钥和备份恢复仍待完成。

## 2026-10-09 原生退款重复记账与恢复保护

CLI 生成的 `20261009233013_shop_native_refund_bookkeeping_guards.sql` 为退款 operation ID 和原生退款订单交易建立唯一约束。已有重复历史会使安装失败并要求核对，迁移不改写历史。私有 invoker trigger 验证原生退款的原始金额、raw 金额、付款及审核关联；已有资金证明或订单交易的退款不能删除，已结算负数订单交易不能改金额、关联或删除。新增交易要求成功资金快照和仍有效的认领。迁移尚未应用生产，不注册 provider、不发起退款、不打开收款。

恢复记账在写入前重新读取原生退款、原付款、唯一全额 capture、审核人及分配指纹，并再次核对认领。已有订单交易必须唯一，普通与 raw 金额均为准确的负数 USD 美分。六项新增测试与原执行模块共 21 项聚焦测试通过；执行模块 Lines 89.37%、Branches 88.89%、Functions 87.18%。剩余初次原生 workflow 和部分队列路径仍需集成验证。

一次性 PostgreSQL 17.11 / Medusa 2.21.2 数据库五项新增检查通过：重复原生退款在 fixture provider 回调前拒绝、实际并发订单交易只有一次成功、实际候选 existing-record 恢复复用唯一正确交易、已结算记录不可变及私有函数权限。原有预留八项、税务冲销六项、执行六项、连续退款五项检查也通过。provider 响应是明确 fixture，真实 Stripe API 调用为零；这里没有验证初次 `refundPaymentWorkflow`，不能替代独立 Sandbox 验收。

加入这层约束后，售后完成八项数据库功能检查再次通过，等价换货仍出现同一 pg → Knex → MikroORM 警告。安装版当前 Admin workflow 分步骤调用原生服务，与 bundled `createExchange` 的共享事务并行写入不同；尚未把完整 Admin workflow 作为无警告验收通过，未通过调整 fixture 或禁止警告消除这项待办。临时数据库已清理，本机 PostgreSQL 已停止。

证据：`output/shop-native-refund-bookkeeping-local-verification.json`、`output/shop-native-refund-bookkeeping-local.log`、`output/shop-native-refund-bookkeeping-coverage.log`。当前 provider 配置、执行入口和收款状态均未启用；生产迁移、provider 范围批准、独立 Sandbox、税务总部确认、受保护密钥和备份恢复仍待完成。

本轮最终完整回归：前台 159 文件 / 984 项、commerce 534 项测试通过，失败和跳过均为零；前台 test:coverage、lint/类型检查/Webpack standalone build，commerce typecheck 与 Medusa 前后台 build 均通过。全量测试和构建日志没有意外 warning、React act 警告或失败。隔离管理编译的 fake Redis 是信息提示，不作为生产 Redis 配置证据。新增数据库换货警告仍单独记录，不能因为全量单元测试与构建通过就忽略。

## 2026-10-09 初次原生退款 workflow 集成修复

新增 `--with-native-refund-workflow` 隔离验证模式，使用实际安装版 Medusa Query、Link、payment/order 模块和 `refundPaymentWorkflow`。Link 表按现有 `sync-private-links.cjs` 的审核 DDL 校验器创建，并用实际 Link API 建立付款关联；没有使用固定 Query 返回值。安装版 Link planner 的 `createPlan` 会关闭共享迁移池，因此完成规划及迁移后重新启动原生模块，使用新的本地连接池。未调用会吞掉逐表失败的 upstream `executePlan`。

初次实测暴露 provider 回调金额类型不兼容：安装版 payment 模块传递 `refund.raw_amount`，而只读核验此前只接受普通字符串或数字。`native-refund-reconciliation.ts` 现明确处理原生 `{ value, precision }` 和安装版 BigNumber，保留准确十进制字符串再检查美分，不通过浮点转换接受小数美分。未知字段、无效 precision、非数字、负数、不匹配金额和小数美分均在读取 provider 前拒绝。

聚焦测试由六项增加至八项，相关模块 Lines、Branches、Functions 均为 100%。四项原生数据库检查通过：实际订单付款 Link/Query 关联、错误回调在网络读取前拒绝且失败 workflow 清理退款不留订单交易、初次 workflow 创建一个正确关联的退款和负数 USD 交易、相同操作重试复用记录且不再次调用 provider。该初次 workflow 验证没有 process warning；原有 bundled 换货警告仍未修复，不能将本结果推广到完整换货验收。

证据：`output/shop-native-refund-workflow-local-verification.json`、`output/shop-native-refund-workflow-local.log`、`output/shop-native-refund-reconciliation-coverage.log`。Stripe 响应和原始税账前置数据仍为明确 fixture；本地事件总线仅用于测试，不代表生产共享事件队列。没有真实 Stripe HTTP、正式退款、provider 注册、生产迁移或部署。临时数据库已删除，本机 PostgreSQL 已停止。真实 Sandbox、provider 范围批准及正式税务/密钥/备份检查仍是收款前置条件。

最终完整回归：前台 159 文件 / 984 项、commerce 536 项测试全部通过，失败和跳过为零；前台 test:coverage、lint/类型检查/Webpack standalone build、commerce typecheck 和 Medusa 前后台 build 全部通过。最新全量日志无意外 warning、React act 警告或失败。隔离编译 fake Redis 与本地测试事件总线的生产适用性提示均保留，不能作为生产共享基础设施的证据。未改动 provider 配置、未发布或启用资金操作。
