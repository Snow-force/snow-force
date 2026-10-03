# Shop verification

## 2026-10-02：GitHub 源码同步验收

按用户要求准备提交商城、会员订单和所需的 Next.js 16 / React 19 兼容改动。已先整合远端 `01bf582` 的会员页面修复，保留当前客户端会员中心和远端付款按钮实现。

- 完整网站测试：151 文件 / 945 项通过；仅针对本次提交范围的覆盖率运行：150 文件 / 942 项通过，58.24% lines / 51.64% branches。额外 3 项属于原有未提交的 `is_staff` 迁移测试，该测试与迁移一并保留在本地。
- 商城后台：375 项测试、类型检查及 backend / Admin 构建通过。主站 lint、类型检查及 Next.js 生产构建通过。
- 提交范围经过受保护环境变量和管理员密码的本地比对，未发现凭据；真实环境文件、密码文件、原始商品 PDF、截图和本地输出不纳入提交。
- 本次为源码同步。付款仍关闭，商品保持草稿；生产运行环境、退款税务冲销与真实交易全流程仍按 [上线清单](shop-launch-status.md) 继续验收。下方记录是各阶段的历史状态。

## 2026-10-02：成交税账、数据库任务与后台核对

- 应用单份 `20261003021222_shop_tax_sale_outbox.sql`，远端版本/本地文件一致。两表所有者为 snowforce_commerce，RLS 启用，anon/member/service_role 权限撤销；未批量推送迁移。
- 固定原订单/报价/付款/capture 身份和请求，SQL 租约/令牌/行锁持久领取。真实 Stripe funds GET 后才允许创建税账，完整交易/逐项净额税额/运费政府费核对；原 source 在网络调用后再次核对。未知创建只在固定窗口用原键重试，已保存远端 ID 以后只 GET，长期未知人工 GET 核对并关联已有交易。
- 后台新增成交税账状态、已有 tax_ ID 核对及已捕获但尚未建任务的订单列表。仅支持单次全额 capture；原生部分 capture 全路径限制及退款冲销仍未完成。
- 后台 375 tests、typecheck、backend/Admin build 全通过。21 项重点测试及 coverage 通过，所选税账模块 99.71% lines/92.92% branches。主站 151 文件/945 tests、coverage、lint/类型/完整 Next build 通过；58.24% lines/51.66% branches。修复了初次 Admin 构建发现的服务端模块导入，浏览器响应结构已独立。
- 实际专用角色/验证 CA TLS 的迁移审阅先回滚，正式应用后再核验；22 次隔离写入最终全部 ROLLBACK，14 个相关表前后均零。原生 capture/私有报价 SQL、租约、不可变请求、最终更新失败回滚、结果不可删除/重开、私有权限通过；graph/provider 为替身，无真实 Stripe POST。
- 两个指定管理员实际登录/身份核对和新税账 API GET 为 200，匿名 GET/POST 为 401。主站及后台 HTML 为 200，真实空队列任务运行通过，无新增任务/成交。此前审批额度及后台 EACCES 故障已恢复；没有绕过浏览器策略或把 HTTP 当作视觉/E2E 验收。
- 2026-10-03 02:26 UTC 实际只读状态：14 商品草稿、0 发布商品/订单/任务/成交，运费 US$9.95/满 US$100 包邮；经营未启用、政策未发布、客服 Shop@snow-force.com；Stripe 测试设置 pending、登记 0、付款关闭。没有真实收款、退款、政策/商品发布或生产部署。
- Security Advisor：两张私有 RLS 无策略表为 INFO，符合撤销 API 访问的设计；既有 Auth 泄露密码保护关闭为 WARN，未改其设置，见 [官方处理说明](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)。
- 脱敏证据/日志为 `output/shop-tax-sale-*`。实现、操作及剩余限制见 [成交税账](shop-tax-sale-ledger.md) 与 [上线清单](shop-launch-status.md)。

## 2026-10-02：顾客结账编排与报价生命周期

- 修正「没有报价就不能填写地址」的入口循环：经营配置 readiness 和当前报价 readiness 独立。顾客先地址/配送，再显式 POST 计算报价；GET 始终只读。准确美分展示消费税及独立政府费用，过期或修改后要求更新报价和重新同意政策。已有付款不能被报价刷新或原生编辑替换。
- 新 edit 服务在原生行锁与私有历史证明下原子软删除本次税行/费用并移除当前引用，历史证据保留；middleware 和原生工作流冻结带报价的直接修改。pending 未知请求阻止编辑并按原键/参数重试；已应用历史不能重新预留为新应用。付款创建及完成仍检查完整当前私有证明。
- 后台 354 tests、typecheck、完整 backend/Admin build 通过。95 项重点覆盖率测试通过，refresh 100% lines/92.68% branches，withdrawal 100% lines/93.85% branches，所选组件 97.89% lines/94.31% branches。主站完整测试及 coverage 为 151 文件/945 tests，58.24% lines/51.66% branches；lint、类型和完整 Next build 通过。
- 实际 commerce 角色及验证 CA 的 TLS 下，40 次隔离 SQL 写入尝试最终 ROLLBACK。首次报价/重复零写入、清理最后写入失败全部回滚、退役取消付款的资金检查、清理费用及新报价保留旧应用通过；16 表计数/Store metadata 摘要完全不变。经营事实、商品审核、graph 关联和 provider 是隔离替身，无实际 Stripe POST 或订单，不是顾客交易 E2E。
- 该阶段收尾时 HTTP 核验曾因审批额度/后台联网失败未执行；后续已补验，`output/shop-tax-lifecycle-http.json` 记录页面 200、新接口匿名边界 400/401，后台恢复。无新浏览器视觉或交易验收，无政策/商品发布或生产部署。
- 证据为 `output/shop-tax-lifecycle-*`；行为与余项见 [报价生命周期](shop-tax-quote-lifecycle.md) 和 [上线清单](shop-launch-status.md)。

## 2026-10-02：准确支付美分、未知结果重试和历史恢复

- 已验证私有报价的准确美分连接空且无资金的 payment_collection、持久 payment_session 和 Stripe PaymentIntent；原生 amount/raw_amount 成对保存，有会话时拒绝任何重新定价。前端从后台固定 USD/整数美分回应显示付款金额，完成路由和原生订单创建 hook 也核对准确支付金额。
- 实际 snowforce_commerce 与验证 CA 的 TLS 回滚验证通过：原生 float4 总额 112.349996125 对应报价 11235 美分，collection/session/隔离 provider 请求均使用 112.35；写入失败原子回滚、复用零写入、未知结果同键同参数重试仅一个 session、GET-only 取消恢复和历史保留均通过。23 次 SQL 写入尝试及隔离原生记录最终 ROLLBACK，16 个相关表计数与 Store metadata 摘要与之前完全相同。经营事实、商品分类、graph 关联和 provider 为隔离替身，不是实际交易验收。
- 后台 344 tests、typecheck、完整 backend/Admin build；重点覆盖率 88 tests，新金额连接 100% lines/branches，付款创建 100% lines/94.57% branches，账本 100% lines/94.15% branches，所选组件合计 99.59% lines/95.82% branches。主站 151 文件/937 tests、完整 lint/类型/Next build 和 coverage 均通过，整体 58.10% lines/51.33% branches。
- 3100 和 9000 页面/健康接口恢复且 HTTP 200；prepare 无 store key 为 400、有 store key 无客户 token 为 401。真实 Sandbox 只读核对仍为 pending/0 registrations、付款开关 false；14 草稿、0 订单。没有真实 Stripe POST、迁移、权限/凭据修改、政策/商品发布或部署。
- 证据为 output/shop-payment-amount-*；当前边界见 [支付金额连接](shop-payment-amount.md)。顾客编排、过期/编辑重新报价、订单/售后金额适配、税务交易与 reversal、生产运行环境和真实浏览器购买/发货/退货全链路仍未完成。

## 2026-10-02：税费原子应用、实际存储精度与包邮联动

- 新增私有 applyCartTaxQuote：已验证 customer 与本人购物车、现有两把锁、不可变报价和当前来源复核；同一 SQL 事务写入商品/运费税行、无商品/规格关联的政府费用、私有应用记录和签名引用。来源表使用真实 SHARE 锁及 5 秒等待限制；已有支付/订单/资金、credit line、pending 请求、过期/变更来源和锁到期均拒绝，末次失败全部回滚。空且无资金的 payment_collection 只解除购物车关联，集合完整记录保留。
- 数据库验证暴露内存测试未涵盖的 REAL/float4 和 Shared pooler extra_float_digits=0 输出差异。计划按真实存储类型生成率，仅接受该特定率的可往返/六位有效数字表示，并用实际原生率复算金额；每项、运费和整单应付美分与私有报价严格一致。新增累计误差改变整单应付时必须拒绝的回归测试，原商品/优惠/运费/政府费价格仍要求整数美分；没有修改持久数据库设置或依赖。
- 原生费用属性和私有报价/签名全部通过后才从商品分类与包邮商品金额排除。隔离样例商品 9,999 美分加 28 美分政府费仍收 995 美分运费；顾客标签、任意 custom line 或缺少私有证明不能通过。
- 实际 snowforce_commerce、验证 CA 的 TLS、真实源表/原生行锁和本地 SQL 事务验证通过。17 次服务 SQL 写入尝试及原生测试插入全部最终 ROLLBACK；最后一步失败无残留，成功复用零写入。客户/cart/地址/优惠/配送/税行/operations/quotes/applications/order/session 最终计数与测试前相同且均为零，完整 Store metadata 摘要一致。来源经营事实、graph 关联、actor、锁租约及 provider 为隔离替身；没有真实 Stripe POST、永久业务修改、迁移、权限变更或部署。
- 实际 Medusa Query 接受 50 个来源字段及 4 个税率/费用属性字段，缺失购物车为空；商品仍 14 草稿/0 发布。实际 Stripe 单独 GET 仍为 test/pending/0 registrations，付款开关关闭。SQL 正向测试与缺失购物车查询计划验证不能合称真实顾客购买验收。
- 后台 337 tests、typecheck、完整后端/Admin build 通过；92 项重点覆盖率测试通过，application 100% lines/86.76% branches、money 100% lines/98.25% branches、ledger 100% lines/94.61% branches，SQL/商品金额排除/配送联动各 100% lines/branches，所选组件整体 99.90% lines/95.93% branches。主站 151 文件/935 tests 和完整 lint/类型/build 通过；此次主站源码未改，之前同轮 coverage 58.1% lines/51.32% branches。
- 脱敏数据库、原生字段及测试/覆盖率/构建证据为 output/shop-tax-application-*。私有应用尚无顾客路由；报价生命周期、付款集合/session 美分桥接、费用完整展示和订单/售后适配仍未连接。具体边界见 [原子应用](shop-tax-quote-application.md)，全范围见 [上线清单](shop-launch-status.md)。
- 本地 3100 主站和 9000 后台已恢复。商城、政策、结账、会员订单登录入口、后台健康及登录页面 HTTP 200；未带 store key 的 normalize 被 400 拒绝，带有效 store key 但没有客户 token 的请求被 401 拒绝。证据为 output/shop-tax-application-http.json；这是可用性和匿名边界检查，没有新浏览器视觉或实际顾客交易验收。Git 及本轮未跟踪源文件的空白检查通过，临时核验/调试脚本已删除，既有工作区修改保留，未提交、推送或部署。

## 2026-10-02：固定报价请求、完整明细及结果复用

- 严格服务端来源已接入 Calculation writer 与私有账本；保存原输入/操作 UUID 后才在事务外 POST，按固定 SDK 资源取得全部展开明细。分页端没有 total_count 时允许读取，但只有完整匹配且唯一的商品、数量、金额、税码、模式和税务理由才保存准确总数。创建响应带明细时与列表逐行核对，不跟随供应商提供的 URL。
- 未知 POST、分页失败及数据库记录失败保留同一请求；重试的键、时间和参数不变。成功提交后丢失响应可直接复用不可变本地结果，零额外 POST；内容/账户/设置/凭据/窗口变化拒绝未解决请求的替换。POST 期间修改购物车可保留历史结果，但不能作为当前报价返回。15 分钟边界拒绝新报价，窗口末段不再发起 POST。
- 安装版本 Stripe SDK 对隔离 HTTP server 的真实序列化验证通过，检查版本、POST 请求体、幂等头和 GET 展开/游标。真实 snowforce_commerce 与 CA 校验 TLS 的数据库回滚验证通过：四次隔离 provider 请求使用同一身份和参数，记录失败整体回滚，完成结果读取/复用及不可改写保护生效。账本 SQL 写入尝试 4 次，另有两条原生 customer/cart 测试插入；均最终回滚，Store metadata 校验值相同，测试记录及全部业务计数保持 0。
- 正向核验的原生来源、经营资料、锁和 Stripe provider 是隔离替身；不属于实际顾客认证、真实 Calculation 或购买验收。实际 Stripe 单独只读核对仍为 test/pending/0 registrations，付款开关关闭。没有实际 Stripe POST、永久业务变更、迁移、权限调整、政策/商品发布或部署。新组件仅供服务端使用，返回 applied:false，尚无顾客报价路由和原子税务应用。
- 后台全量 326 tests、typecheck、完整后端/Admin build 通过；61 项重点覆盖率测试通过：新 creation 100% lines/91.89% branches、provider 100% lines/98.75% branches，账本 100% lines/93.75% branches，重点报价组件整体 100% lines/96.45% branches。主站 151 文件/935 tests 及 coverage 通过，58.1% lines/51.32% branches。主站首次并行构建的 Windows native worker 在静态生成期间退出（3221226505）；保留原日志后单独重跑完整 lint/类型/build 已通过，未更改检查或框架配置。原因未确认，不能将其解释为业务逻辑错误或已证实的资源不足。
- 脱敏证据为 output/shop-tax-creation-database-rollback.json 和同前缀测试、覆盖率、类型与构建日志。使用方式和边界见 [报价生产](shop-tax-quote-production.md)，剩余全范围见 [上线清单](shop-launch-status.md)。

## 2026-10-02：优惠分币写回与空支付集合处理

- 新增 customer 认证及本人购物车保护的 normalize POST；只接受空对象，商品/优惠/运费来自原生数据及私有审核事实。先获得与结账相同的两把锁，再在短 SQL 事务锁定原生购物车/地址/商品/优惠/配送/当前支付记录并复核。Stripe GET 在事务外。source 计划不提供可保留的报价输入，严格读取仍拒绝未处理金额。
- 最大余数分配保留优惠行 ID、promotion_id、metadata；amount 与 raw_amount 一起更新，配送按后台当前规则及精确商品净额重新计算。金额改变清除旧报价引用，其他 metadata 保留；有未解决税务请求时拒绝金额变化。金额已精确的重复请求不写入。已验证没有会话、资金、授权或支付/订单的空集合只退役 cart link，集合完整记录保留；仅旧空集合金额不匹配时不改变金额/报价引用，也不废弃相同输入的未解决税务请求。
- 原生角色与验证 CA 的 TLS 下，12 次隔离 SQL 写入均位于最终回滚的事务：真实写入/raw_amount、严格重新读源、重试、末次写入失败、过期锁、两类空关联退役通过。Store metadata 和原生空集合完整字段相同；最终 cart/优惠/关联/集合/session/order/operations/quotes 全部 0。实际 Query 接受新增含税标记后的 49 字段。
- 正向数据库测试注入隔离经营审核、Stripe 和锁替身，并由事务内 SQL 行及安装版本的 decorateCartTotals 得到购物车；不是顾客认证、原生 Query 正向读取、真实 Calculation 或购买端到端测试。实际 Stripe 单独只读核对仍为 test/pending/0 registrations；真实付款开关始终未启用。没有迁移、权限变更、永久业务写入、Stripe POST、收款或发布。
- 最终后台 309 tests、typecheck、完整后端/Admin build 通过；55 项覆盖率测试通过：接口 100% lines/branches，归一化服务 99.2% lines/93.33% branches，source 100% lines/96.36% branches。主站正常和覆盖率均 151 文件/935 tests，完整 lint/类型/build 通过，58.1% lines/51.32% branches。没有跳过测试、替换原生数学或降低检查。
- 本地服务已恢复；实际 HTTP 页面及匿名接口检查见 output/shop-tax-normalization-http.json。这是可用性/权限核验，尚无新浏览器视觉或真实购买验收。开发 Redis/事件总线/内存锁仍待生产替换。
- 前台和实际报价处理器还没有自动连接此接口；税务请求、税行/政府费用原子应用、成交/退款税账、部分退货财务适配及生产全链路仍待完成。行为与边界见 [金额归一化](shop-tax-money-normalization.md)，全范围见 [上线清单](shop-launch-status.md)。测试/构建/回滚日志为 output/shop-tax-normalization-*；临时回滚核验脚本已删除，没有提交、推送或部署，原有修改保留。

## 2026-10-02：服务端报价来源与精确运费

- 新增仅供服务端使用的报价输入读取：先检查本人归属/已完成状态/既有支付，再读取原生商品、优惠、地址和配送。读取不选择 payment session data/client_secret；输入中的税码、许可确认、发货地址及时间来自私有审核版本、原生仓库、实际 Stripe GET 和数据库时钟，不信任浏览器提交的经营标记。
- 用已安装版本的 decorateCartTotals 验证折后 US$99.99/US$100 的运费边界。原生半美分优惠尚未统一写回，当前拒绝金额不一致；保存的运费和门槛改为精确美分校验，不再静默舍入。读取期间重新核对商品审核、经营配置、仓库、政策、配送、region 和支付变化。新增回归测试复现费用标记改变未被识别的问题，修正来源指纹后通过；完整二次读取前的归属、畸形数据、支付和查询失败也有覆盖。
- 真实 Medusa Query 接受全部 47 个字段；缺失购物车只执行一次最小归属查询，未读取私有经营资料或调用 Stripe。独立真实只读核对确认：运费 995 美分、包邮门槛 10000 美分、14 草稿、0 发布商品、0 订单，私有请求/报价/应用三表为 0。Stripe 测试设置 pending、登记 0，付款开关关闭。本轮没有数据库写入、Calculation POST、支付、发布或部署。
- 最终后台 296 tests、typecheck、完整后端/Admin build 通过；97 项报价/配置/账本/结账/付款/配送覆盖率测试通过。来源服务 98.15% lines / 97.59% branches，配送规则 100% lines / branches，私有账本 100% lines / 95.14% branches。网站正常与覆盖率均 151 文件/935 tests，完整 lint/类型/build 通过，58.1% lines / 51.32% branches。没有跳过测试、替换原生金额函数或降低检查。
- 已恢复本地服务；后台 health、经营配置 Admin HTML、商城、结账和政策 HTTP 为 200，私有配置匿名 401，公开商品 API 数量 0，政策 HTML 包含已确认客服邮箱。此核验是 HTTP/数据检查，没有新的浏览器视觉或真实购买验收。开发 Redis、事件总线和内存锁仍需生产替换，已记录在上线清单。
- 新服务尚未连接实际 Calculation 请求处理器和原子应用；优惠写回、独立政府费用、成交税账、部分退货财务适配、退款税冲销及生产端到端验收仍待完成。源码边界见 [报价来源](shop-tax-quote-source.md)，完整顺序与经营者资料见 [上线状态](shop-launch-status.md)。
- 脱敏证据为 output/shop-tax-source-{native,pages}.json 和同前缀测试/覆盖率/构建日志。git diff --check 与本轮新增源文件空白检查通过；两份忽略的临时只读核验脚本已删除，原有工作区修改保留，未提交或推送。

## 2026-10-02：受控经营税务配置后台

- 新增原生 Admin 的 SnowForce business tax 页面和私有管理接口。资料及版本/审计历史保存在私有 Store metadata；发货地址读取原生仓库，启用前核对当前已发布政策主体、许可/申报/运费审阅、准确官方分类和实际 Stripe 设置。网络读取在事务外，事务内锁 Store/仓库/地址并复核版本与来源。报价接受新增这些受控事实的核对，不采用浏览器传来的确认标记。
- 已通过实际管理员接口保存 revision 1 未确认草稿：无正式主体、无运费税码、全部确认 false、无启用版本，保留实际仓库关联及其他 Store metadata。两名指定管理员读取为 200，匿名为 401，未确认草稿启用为 400；同 UUID 原请求重试不重复保存。未添加许可、Stripe 登记、经营地址或开启付款。
- 真实 snowforce_commerce 和验证 CA 的 TLS 回滚测试通过，覆盖草稿、重试、隔离启用、实际仓库快照和其他 metadata 保留；回滚后完整 Store metadata 校验值相同。启用正向测试使用注入的隔离只读 Stripe 数据，不是正式经营审核。实际仍为零发布商品、零订单及零税务报价。
- 后台全量 284 tests、typecheck、完整后端/Admin build 通过；80 项配置/账本/付款相关覆盖率测试通过。新页面 100% lines / 92.04% branches，配置服务 97.62% lines / 93.84% branches，私有账本 100% lines / 95.14% branches。网站正常和覆盖率均 151 文件/935 tests，lint/类型/build 通过，58.1% lines / 51.32% branches。git diff --check 通过，没有新增依赖、跳过测试或降低检查。
- 服务已恢复，后台 /health、新 Admin HTML、/shop、/shop/checkout、/shop/policies HTTP 为 200；私有接口匿名 401，公开商品 API 数量为 0。页面功能验证使用真实 React 18 组件与管理员 HTTP，未完成真实登录浏览器视觉验收：已有政策浏览器标签处于错误页面，浏览器安全策略拒绝读取该标签，本轮未绕过策略或使用替代浏览器。
- Stripe 测试设置仍 pending、登记 0，经营者许可待核实，税务确认开关关闭。本地事件总线/内存锁仍是开发配置。真实报价生产/原子应用、成交及退款税账、部分退货财务适配、真实购买/发货/退款和生产基础设施仍待完成；未部署。
- 操作和数据边界见 [经营税务后台](shop-business-tax-configuration.md)。脱敏证据为 output/shop-tax-configuration-{database-rollback,live,pages}.json，测试/构建日志为同名前缀。临时验证脚本已删除，原有工作区修改保留。

## 2026-10-02：私有税务报价持久化与付款证据

- 已应用单份 `20261002152248_shop_tax_quote_ledger.sql`，新增私有 operations、quotes、applications 表，专用角色所有/RLS/无顾客与 service_role 读取权限。远端版本、本地迁移及执行 SQL 内容核对一致；没有批量推送或修复其他迁移。
- 新增永久请求身份、原输入/精确请求、不可变结果及签名引用校验；准备付款、锁内准备、付款初始化和原生完成 hook 都要求私有应用记录。逐行金额、商品分类/地址、当前账户/模式/登记及 payment session 核对，缺失证据不能被环境开关绕过。报价过期后不重试创建；已绑定的准确 PI 可以完成。恢复取消付款仍可用。
- 真实 snowforce_commerce/TLS 回滚测试通过：保留/重放、不可修改/删除和付款关联防替换；回滚后的测试 customer/cart/session/账本行全部为零。JSONB 对象键顺序加入回归测试。实际数据库核验与隔离付款场景分别记录，不称为交易端到端验收。
- 后台 264 tests、typecheck、完整后端/Admin build 通过；新增账本覆盖率 100% lines / 94.96% branches / 100% functions。网站正常测试和覆盖率均 151 文件/935 tests，lint/类型/build 通过，58.1% lines/51.32% branches。没有新增依赖、跳过测试或降低检查。
- 当前只读复核：Stripe 测试模式、设置 pending、登记 0；确认开关未启用；私有三表为空、零发布商品和零订单。没有真实 Calculation、成交税事务、收款/退款、发布或部署。报价生产、原子购物车应用、部分退货财务适配、成交/退款税账及生产验收仍待完成。
- 实现边界及下一步见 [私有报价账本](shop-tax-quote-ledger.md)，脱敏证据和日志见 output/shop-tax-ledger-*。已有工作区修改保留。
- 本地服务已恢复；/health、商城/结账/政策和 Admin 页面 HTML 为 200，匿名私有设置 GET 为 401，见 output/shop-tax-ledger-pages.json。本轮未修改视觉界面，也没有声称完成新的登录浏览器视觉验收；内存锁、开发事件总线仍不能作为生产服务验收。

## 2026-10-02：实际 Stripe 税务设置核对与结账登记门槛

- 新增 SnowForce tax setup 原生 Admin 页面及私有 GET。同一商城 Stripe 凭据读取账户、Tax Settings 和全部状态的 Registrations，核对完整分页、模式、有效日期、US 经营地址、加州 state_sales_tax、支持税种/CO-MN 配送费用、重复有效记录和即将到期。设置指纹含经营地址、默认设置与原登记选项；拒绝异常或过慢读取，不显示部分列表或旧的就绪状态。只读接口返回 private, no-store，没有任何设置、登记或数据库写入。
- 准备付款、购物车锁内准备与原生完成 hook 增加实际登记核对；加锁前后设置变化停止新付款。仅修改环境确认开关不能绕过缺失登记。前台只取得准备状态，取消付款恢复仍可使用；这一步没有完成实际 Tax Calculation 或税账。
- 实际两名指定管理员 HTTP 登录及 GET 为 200，匿名 401；当前 Stripe 为测试模式、Tax Settings pending、登记 0、经营地址未完成、经营者确认 false。结果保存在 output/shop-tax-setup-live.json，不包含凭据、JWT、账户联系人或税务证件。临时验证脚本已删除，没有自动填写总部地址、激活登记、计税、付款或退款。
- 最新后台正常全量 245 tests、typecheck、完整后端/Admin build 通过；39 项核对/页面/结账覆盖率测试通过，tax-setup 100% lines / 96.55% branches，实际 React 18 页面 100% lines / 93.75% branches。主站正常与覆盖率均 151 文件/935 tests，完整 lint/类型/build 通过，覆盖率 58.1% lines / 51.32% branches。没有新增依赖或跳过检查。证据为 output/shop-tax-setup-*。
- 详细边界见 [税务设置核对](shop-tax-setup-review.md)。仍缺真实经营/许可资料、商品运营数据、完整税务交易接入、生产服务与真实购买/发货/退款验收，未部署。
- 构建后本地服务已恢复；/health、/shop、/shop/checkout、/shop/policies 及新 Admin 页面 HTML 为 200，记录见 output/shop-tax-setup-pages.json。私有页面正向场景验证为实际 React 18 测试和管理员 HTTP 接口；尚未在真实登录浏览器中完成该新页面的视觉验收。开发实例仍使用本地事件总线与内存锁，不能作为生产基础设施验收。git diff --check 和本轮源码空白检查通过。

## 2026-10-02：税额分币模型与原生整单数学验证

- 新增 Tax Quote 输入/返回契约、整数美元美分、稳定优惠分配、逐行税额核对、单独政府费用表达、原生整单逐项核对和按原金额逐件退款分配。只对原生已计算结果允许极小数值残差；源价格、Stripe 美分、优惠与原单退款严格核对。法定税率与原生映射百分比分开保留。
- 16 个 focused tests 与覆盖率通过；tax-quote-contract 100% lines / branches，tax-quote-money 100% lines / 96.82% branches。使用实际安装的 decorateCartTotals 验证 160 个金额组合，并调用实际 Order Module formatOrder 验证整单及固定费用；没有模拟替换原生数学函数。全量测试与构建结果见上。
- 已证明默认原生部分退货可能与原分配相差 1 美分；辅助金额函数尚未解决原生订单余额和退款工作流的适配。Calculation 数据全部是隔离输入/返回，不是 Stripe 实际计税或订单端到端验收。没有真实购物车写入、报价账本、税交易/冲销或支付操作；代码尚未接入运行时。
- 金额与退款约束、下一步见 [候选金额模型](shop-tax-amount-model.md)。证据为 output/shop-tax-quote-{commerce-tests,root-tests,money-coverage}.log；本轮最终构建记录为 output/shop-tax-setup-*。源码仍未提交、推送或部署，既有工作区修改保留。

## 2026-10-02：商品税务分类后台与付款前置条件

- 新增 SnowForce product tax 页面及管理员 API，从当前商城 Stripe 只读 API 取得全部官方分类，保存时再次核对选中的精确代码。商品所有规格共用审核分类，价格为 exclusive；礼品卡和需要额外活动地点的类别不支持，不自动分类或默认免税。
- 私有 Store metadata 按 product ID 保存内容 fingerprint、代码/名称/说明、依据、管理员、数据库时间、版本及完整追加审计。Stripe GET 在事务外；事务内锁 Store/商品并核对版本，只改对应设置键。重复 UUID 不重复保存，改 payload/身份拒绝；未知结果 UI 锁编辑并重试原请求。分类不进入公开 Product metadata。准备付款、锁内准备及原生完成 hook 拦住未审核或变化的商品，恢复取消付款仍可用。
- 真实 snowforce_commerce 角色与 CA 验证客户端 TLS 通过；Stripe 返回 677 个分类。真实 PostgreSQL 回滚事务核对保存、重试、旧版本拒绝及其他 metadata 保留，回滚后整份 Store metadata 完全相同，14 草稿、0 发布、0 订单、0 付款。两名指定管理员 GET 新接口为 200/14 件；错误 offset 和未确认保存为 400，匿名为 401。
- 主站 151 文件/935 tests、coverage、完整 lint/类型/build 通过；全站 58.1% lines/51.32% branches。后台分类核心 100% lines/95.52% branches，覆盖管理员边界、官方分类分页/错误、内容变化、重试、并发冲突、价格模式与付款门槛；实际 React 18 页面覆盖不自动分类、成功保存、未知结果、冲突和异常响应。后端及 Admin 完整构建通过。
- 本轮没有新表、迁移、授权、正式分类审核、Tax Calculation、Tax registration、Tax transaction、收款、退款、发布或部署。税务 Provider、逐行/固定费用、签名报价与账本/冲销仍未完成，税务确认开关保持 false。正向业务案例为隔离数据和回滚验证，尚无真实商品分类保存或完整交易端到端验收。
- 实现与限制见 [商品税务分类管理](shop-product-tax-classifications.md)；证据为 output/shop-tax-classification-*。

## 2026-10-02：顾客购买政策与退换期限显示

- 本人订单售后读取接口新增公开购买政策和日期投影：真实归属、HMAC、原生 order_cart 与准确历史发布版本核对后才显示。较新政策不缩短旧订单期限；缺失/篡改记录返回人工核查，不假定期限。一次读取只验证一次政策，不返回签名、原始 metadata、内部备注或管理员资料。
- 会员订单详情显示原购买版本、完整双语文案、商品申请截止日期/分包范围和获批交运期限。普通超期仍可提交，质量/错发不按普通期限自动拒绝；追踪号不作为实际交运证明。切换订单时重建售后组件，清除上一订单的请求/条款。主站严格验证日历日期、期限状态和返回订单归属。
- 主站 151 文件 / 935 tests、覆盖率与完整 lint/类型/build 通过；全站覆盖率 58.1% lines / 51.32% branches。后台 197 tests、typecheck、完整后端/Admin build 与串行覆盖率通过；窗口和原购买政策服务 100% lines / 98.46% branches，购买政策签名验证 100% lines / branches。
- 实际 snowforce_commerce 角色与验证 CA 的 TLS 只读执行原关联与政策查询，缺失订单记录返回人工核查且不生成期限。订单/申请仍为 0，没有新表、迁移、权限、数据写入或金融操作。临时只读脚本已删除。正向历史购买、送达与审批场景使用隔离数据和实际 React 组件，不能当作真实顾客/交易/承运商端到端验收。
- 证据为 `output/shop-purchase-terms-{root-tests,root-coverage,root-build,commerce-tests,commerce-coverage,typecheck,commerce-build}.log` 及 `output/shop-purchase-terms-readonly.json`。完整数据与限制见 [顾客购买条款](shop-member-purchase-terms.md)。客服配置保持 Shop@snow-force.com；正式经营资料、产品、税务、生产服务和真实交易演练仍待完成。
- 构建后本地服务恢复：/shop、/shop/checkout、/shop/policies、/member/orders 与后台 /health 为 200；带有效公开 Store key 的匿名购买条款/售后 GET 为 401。实际页面 HTML 包含已确认的客服 mailto 链接；此前浏览器已看到同一客服入口。新顾客政策场景尚未用真实订单浏览器验收。HTTP 记录为 `output/shop-purchase-terms-http.json`，git diff --check 通过。

## 2026-10-01：后台付款异常核对与商城客服入口

- 新增 `SnowForce payments` 原生 Admin 页面和私有 GET/POST API。管理员先只读核对 Stripe，随后明确勾选确认才关联到原付款会话；两把购物车锁、签名政策、原生指纹、实时资金校验与事务 CAS 防止错误关联。响应丢失保持相同请求 UUID，审核信息保留在原生 session metadata；不创建、取消、确认、捕获或退款 Stripe 付款。
- 客服邮箱实际草稿仍为 `Shop@snow-force.com`、revision 1、未发布。政策页在尚未发布或读取失败时也显示已确认的客服入口；会员订单详情用它替换旧客服链接，发布后优先读取当前生效政策的邮箱，邮件主题安全编码订单号。没有创建邮箱、发送邮件或验证收发。
- 主站 `npm test` / `npm run test:coverage`：150 文件、928 tests 通过；覆盖率 58% lines / 51.08% branches。完整 lint、类型检查和 Next build 通过。后台正常及串行覆盖率 195 tests、typecheck、完整后端/Admin build 通过；核对服务 100% lines / 93.39% branches，付款 Admin 页面 98.85% lines / 93.58% branches。没有新增依赖或跳过失败检查。
- 两个既有管理员实际 HTTP 登录和本人身份核对成功，新列表 200/空，未知记录 404；匿名列表、详情与 POST 为 401。客服草稿再读核对一致。没有在浏览器输入管理员凭据或执行真实金融操作。
- 实际 snowforce_commerce 角色通过验证 CA 的客户端 TLS 连接 Shared Pooler，外层事务/savepoint 执行新列表 SQL、23 小时尝试关联、并发购物车变化拒绝、精确美元分币、metadata 保留和幂等重放。全部回滚，Store metadata 与 updated_at 完全恢复；最终 cart/session/payment/order/refund 均为 0。Stripe 为注入 GET 替身，不是实际 sandbox/webhook/订单验收。临时验证脚本已删除。
- 证据：`output/shop-payment-operations-{commerce-tests,commerce-coverage,typecheck,commerce-build,root-tests,root-coverage,root-build}.log`，`output/shop-payment-operations-http.json`、`output/shop-payment-operations-database-rollback.json`。完整步骤及边界见 [后台付款异常核对](shop-payment-operations.md)，客服说明见 [管理员与客服配置](shop-admin-access.md)。没有迁移、改权限、发布商品/政策、提交、推送或部署。正式经营资料、真实商品、税务、生产服务和真实交易验收仍待完成。

## 2026-10-01：持久付款创建与终态记录保留

- SnowForce prepare 已替换原生并行创建/删除工作流：先保存原生 session，随后使用相同 ID 幂等创建 Stripe PI；超时和条件写入失败保留本次尝试。创建后 GET 实时状态，核对 ID/金额/环境/状态资金及原生指纹后采用；不会补偿删除或另建尝试。
- 尚无 PI ID 的不确定尝试在 22 小时后、凭据或报价变化时停止自动 POST。后台需核对真实 Stripe 事实；没有自动清理或自动假设零付款。
- 恢复核验包括所有本地 canceled 会话，只有逐个远程确认零资金取消后才退役 cart_payment_collection 当前关联。session、collection 和关联历史保留。HTTP/原生锁内编辑校验在任何会话仍关联时阻止重算；异步授权返回 processing。
- 主站 150 文件 / 925 tests 和完整 lint/类型/build 通过。后台最新 174 tests、typecheck、完整后端/Admin build 与串行 coverage 通过；payment-creation 为 100% lines / 97% branches，payment-recovery 为 100% lines / 95.86% branches，checkout-policy 为 100% lines / branches。后台首次构建遇到默认用户配置目录 EPERM，改用项目内 XDG_CONFIG_HOME 后原构建命令通过，没有修改源码检查或跳过构建。
- 实际 snowforce_commerce 角色与验证 CA 的 TLS 源码回滚验证通过：准确分币、原生插入/条件采用、同键同参数重试、历史完整保留与退役关联、新 collection、23 小时停止。验证使用外围事务/savepoint 与假 Stripe 接口，不能当作真实提交后的进程崩溃或 Stripe/webhook/订单验收。临时脚本已删除，所有临时记录回滚。
- 远程只读后置统计：0 cart/session/payment/order/refund、14 草稿、0 发布商品、2 管理员、未发布政策。没有增加永久业务记录。
- 构建后本地服务已恢复：/health、/shop、/shop/checkout 和 /shop/policies 为 200；带有效 Store key 的匿名 prepare 为 401。git diff --check 与本轮新文件空白检查通过；没有执行登录或付款。
- 证据为 output/shop-payment-creation-*；实现与限制见 [付款创建与重试](shop-payment-creation.md)。没有改表或权限，没有真实 Stripe 调用、收款、退款、发布或部署。正式经营资料、税务与生产基础设施仍待完成。

## 2026-10-01：购买时政策与退换货期限审批

- 后台按购买时签名政策、真实 order_cart 关联及原生商品送达日期审核普通退换货期限，核对准确的历史发布版本；新政策不缩短旧订单期限。按原始申请日期和太平洋日历日判断，分包交叉或证据缺失要求人工核查。
- 超期或证据不完整的普通原因申请必须明确勾选例外并填写内部原因，批准时服务端再次核验。质量问题和错发不按普通期限自动拒绝。批准后的例外备注可由管理员查看，顾客响应不包含内部备注。
- 原购买政策的批准后交运期限已显示；实际交运仍需核对承运商凭证，填写追踪号或创建原生退货记录不作为交运证明。未接入承运商扫描或凭证上传，真实购买/送达/退货仍待演练。
- 主站 150 文件 / 925 tests、coverage、完整 lint/类型/build 通过，行覆盖率 57.96%、分支 51.03%。后台最终 158 tests、typecheck、完整后端/Admin build 与串行 coverage 通过。新增期限服务和购买政策验证均为 100% lines / branches；售后 Admin 为 97.44% lines / 90.41% branches。
- 实际私有 schema 确认 order_cart 的查询列均存在；0 订单、0 售后申请、2 管理员，政策草稿 revision 1 且未发布。没有新表、迁移、权限或业务数据写入，没有 Stripe 调用、退款、交运或政策发布。期限场景使用隔离数据和实际 React 18 组件测试，不能当作真实订单端到端验证。
- 本地服务已恢复；/health、/shop、/shop/policies 为 200，匿名售后 Admin 为 401，已认证管理员列表为 200/空，未知申请为 404。git diff --check 通过。源码和限制见 [退换货期限审核](shop-return-window.md)；日志及只读 HTTP 记录为 output/shop-return-window-*。

## 2026-10-01：实际商城管理员与客服邮箱

- 按经营者指定的 snowforceclub@gmail.com 和 经营者指定的个人邮箱，通过原生 emailpass Auth 和 createUserAccountWorkflow 建立两个独立商城管理员。没有重置已有密码或修改 Supabase 会员；RBAC 未启用，使用当前版本标准后台管理员权限。
- 两个账号均通过真实原生密码验证、HTTP 登录、本人管理身份检查及商品/库存/订单/配送/政策管理接口读取；错误密码为 401。本地后台重新启动后，浏览器显示实际 /app/login。没有把密码或 JWT 输出到日志。
- 独立随机初始凭据保存于 Git 忽略的 services/commerce/.data/admin-initial-access.json，ACL 仅授予本机 taiyu 用户访问。一次性执行脚本在验证后删除；入口和自行改密说明见 [商城管理员与客服配置](shop-admin-access.md)。
- Shop@snow-force.com 通过已认证 Admin POST 保存为实际政策草稿客服邮箱，revision 1，published_version null；重新读取确认其他草稿内容和发布历史保留。没有发送邮件、创建邮箱或发布政策。
- 未改变源码、依赖或数据库结构。本次验证为原生运行及只读数据库后置检查；上一阶段的全量测试/构建记录继续保留，不声称本轮重新执行了全量构建。上线仍需要正式主体、真实销售规格/价格/库存、税务、生产服务和完整交易验收。

## 2026-10-01：取消付款核验与购物车恢复

- 新增严格本人购物车 POST `kind:recover` 和“检查付款状态”入口。只读 Stripe GET 核验 ID/session_id、test/live、USD 和确切美分；仅 canceled、零到账、零可捕获且没有原生授权/Payment/订单时，以事务行锁、指纹复核和条件更新保存本地 canceled。没有新表、权限、迁移或 Stripe 金融操作。
- `error` 状态仍冻结购物车，不能当作零付款依据；原生 payment collection refresh 也受锁内编辑校验保护。检查会立即移除旧 Stripe Elements 并清除政策勾选，正在提交/确认时禁止检查；异步旧表单和另一浏览器的新付款都有回归测试。
- 专用 `snowforce_commerce` 与验证 CA 的 TLS 源码回滚测试通过：原生 SQL、非终态保留、金额/归属/授权/历史订单/竞态拒绝、取消更新、重试和 provider metadata 保留。临时记录全部回滚，cart/session/payment/order/refund 数量保持不变。Stripe reader 为注入测试替身，不能据此声称真实 Stripe 取消演练通过。
- 主站全量 150 文件 / 925 项 tests 与 coverage 通过；全站为 57.96% lines / 51.03% branches。完整 lint、类型和构建通过：首次与后台并行构建时，Windows 静态生成 worker 以 3221226505 异常退出；后台结束后单独原命令重跑成功，没有改检查配置、降低检查或跳过页面。
- 后台全量 139 tests、typecheck、完整后端/Admin 构建和串行 coverage 通过。恢复服务为 99.42% lines / 96.00% branches，原生锁内校验为 100% lines / branches；checkout route 为 93.85% lines / 88.52% branches。
- 本地 /health、/shop/checkout、/shop/policies 为 200，使用有效公开 Store key 的匿名恢复 POST 为 401。浏览器实际结账页呈现原 SnowForce 会员登录入口，没有执行登录、付款或新建商品。开发服务恢复；本地 Event Bus / 内存锁提示仍对应尚缺的正式 TLS Redis。
- 最新数据库只读统计：14 草稿、0 发布、0 规格、0 库存位置数量记录、0 cart/session/order/refund、0 staff、0 USD region。正式主体/客服邮箱、管理员、实际销售资料、税务与生产基础设施仍待完成。原生重试新建/删除/补偿行为、真实付款与完整退换退款仍须上线前演练。没有提交、推送或部署。

说明见 [取消付款恢复](shop-payment-recovery.md)。证据为 `output/shop-payment-recovery-{root-tests,root-build-retry,root-coverage,commerce-tests,commerce-typecheck,commerce-build,commerce-coverage,database-rollback,http,diff-check}.log`。

## 2026-10-01：政策发布、公开页和结账签名快照

- 新增商城后台已保存草稿发布流程、公开 EN/ZH `/shop/policies` 与结账明确同意；主体、售后邮箱和已审阅双语文案为发布条件，禁止默认待确认占位句。草稿仍不会对外展示。
- 报价绑定政策内容；付款会话创建前持久化后端签名条款。原生完成 hook 校验实际将被订单复制的初始购物车和当前报价；准确历史版本保证并发发布不改写已接受付款，租约丢失后停止新的付款操作。
- 专用数据库角色源码回滚验证已通过：保存、发布、重试、其他 Store metadata 保留和真实 JSONB 签名校验。原 Store metadata/updated_at 完全恢复，仍无永久政策发布；订单、退款、资金核对及历史均为 0。
- 主站全量 `npm test` 为 149 文件 / 901 tests 通过；`npm run build` 完整 lint/类型/构建通过。全量覆盖率 57.82% lines / 50.70% branches，针对 checkout UI 的覆盖率为 98.18% lines / 82.46% branches。
- 后台最终全量 119 tests、typecheck、完整后端/Admin build 与串行 coverage 通过。政策签名服务和原生完成验证均 100% lines / 100% branches；发布服务 99.09% lines / 96.12% branches，checkout route 为 85.22% lines / 86.00% branches。真实付款与订单创建仍未执行，不能从单元覆盖率推断其已验收。
- 本地公开政策接口为 200，返回 policy:null、Cache-Control:no-store；Admin GET/POST 未登录均 401。/health 和 /shop/policies 为 200，浏览器实际呈现“商城政策尚未生效”与页脚入口。Admin 登录后的实际发布页面未验收；React18 DOM 的 8 项测试通过。开发服务仍提示本地 Event Bus/内存锁，正式部署必须补 TLS Redis。

数据和操作说明见 [政策发布与订单条款](shop-policy-publication.md)。证据为 output/shop-policy-{root-tests,root-build,root-coverage,commerce-tests,commerce-typecheck,commerce-build,commerce-coverage,database-rollback}.log。未提交、推送、部署或执行实际 Stripe 付款。该阶段的远端取消付款缺口由上方后续阶段处理，真实链路验收仍待执行。

## 2026-10-01：Stripe 退款最终状态与私有核对记录

- 售后完成改为实时核对 Stripe 付款和成功退款美分金额，pending / requires_action、失败未对账、未捕获、金额不符或查询失败均阻止完成。后台提供只查询和记账的“核对 Stripe 款项”；原生退款请求、库存和交运仍由原生操作执行。
- 两张资金观察表已通过单一迁移创建在现有私有 commerce schema，本地版本对齐远程 `20261001212924`。实际 snowforce_commerce 源码事务回滚证明原生 SQL、保存、旧观察与竞态拒绝、不可变历史；匿名/会员/service_role 读取被拒绝。订单、退款和资金观察记录最终仍为 0。
- 独立 SDK 23.0.0（API 2026-09-30.endive）只用于查询和原始签名校验；保留原生支付 provider SDK。退款事件和原生 payment.refunded 观察器重读当前 Stripe 状态，忽略其他业务的订单；不会自动补退款或启用税务。
- 后台 97 项测试、typecheck、构建和串行覆盖率通过；核对服务 97.01% lines / 92.86% branches，观察器 100% lines / 90.91% branches。主站 868 项测试、覆盖率、完整 lint/类型检查和构建通过。安装时在线 audit 与离线复核均为 0。
- 本地服务恢复后 /shop 与 /health 为 200，新核对 POST 和售后详情 GET 未登录为 401。数据库仍零订单，没有实际退款、购买、后台账号登录、提交或部署。

完整数据方案、验证限制与后续缺口见 [退款最终状态核对](shop-refund-verification.md)。证据：output/commerce-refund-finality-{tests,typecheck,build,coverage,rollback}.log、output/shop-refund-finality-root-{tests,build,coverage}.log。

## 2026-10-01：依赖安全升级与政策后台草稿

- 主站按官方迁移工具从 Next.js 14 → 15.5.27（过渡构建通过）→ 16.3.8；配套 React 19.3.0、Vitest/coverage 5.0.3、Vite 8.3.2，Node 24 与既有 CI 一致。请求 cookies/headers、动态路由参数和 Supabase server client 均改为 await；proxy 替代 middleware 入口，表单采用 useActionState。Next 16 不再自动 lint，因此 npm run build 明确先跑完整主站 ESLint，再编译和完整类型检查。
- npm audit：主站从 17 个已知问题（含 3 critical）降为 0；commerce 既有审计为 0。没有使用强制 audit major 修复、忽略 peer 的安装选项、跳过测试或放宽类型检查。Next 当前 bundled lint plugins 尚限定 ESLint 9；实测 ESLint 10 出现 scopeManager API 不兼容，采用匹配 peer 的 9.39.5，其 upstream 维护提示仍需随 Next 插件兼容版本更新处理。
- 修复新版检查发现的实际状态问题：购物车初始请求、结账/付款返回模式切换、回顾图片源变化、后台付款说明和财务草稿状态重置。公开活动和回顾页保留数据库失败状态；修正旧 Event/Registration/Stripe 测试样本缺失字段和 mock 类型，没有通过排除测试文件来获得构建通过。
- 最终主站 npm test 和 npm run test:coverage 均为 144 文件 / 868 项通过。全站覆盖率为 57.59% lines、50.09% branches；这不是所有页面或安全路径已完全覆盖的声明。ESLint 0 errors/0 warnings；完整 Next 16 Turbopack 构建与完整 TypeScript 检查通过。测试不再产生先前的 act/formAction/Vite CJS 警告。
- 商城后台新增 SnowForce policies 双语草稿页与私有 Admin API，支持期限、时效、主体、邮箱和文案；只保存草稿。建议默认值在首次读取时提供，没有永久初始化或发布，也没有自动执行退换期限。将来的公开政策投影和独立订单快照函数已提供，实际发布及 checkout 快照链路仍待接入。
- commerce typecheck、完整后台/Admin 构建、84 项正常测试和串行覆盖率均通过。政策服务 94.44% lines、95.59% branches。实际 snowforce_commerce 受限角色的保存/CAS/UUID 幂等/不同 payload/actor/禁止发布回滚校验通过；仓库等其他 metadata 保留，回滚后整行 metadata 和 updated_at 完全恢复。这不是实际管理员登录验收。
- 浏览器实测主站商城渲染、购物车登录提示、会员订单沿用原账号登录、结账未登录提示；首页实际活动回顾后紧接 gear-shop 板块，优化后的团队照片和导航标识保持原有布局。政策后台路径跳转 Medusa 原生 /app/login；未登录政策 GET/POST 均为 401，health 为 200。最终构建后本地商城与后台 health 再次为 200。没有在浏览器中输入会员/管理员凭据、发布政策或执行购买。
- 销售税方案已补充原生百分比模型无法表达包邮固定政府费用、逐行分币差异、单次全额捕获和真实 Refund 最终状态门槛。California Seller’s Permit 仍“不确定”；未建税务账本或启用收税，正式收款保持关闭。新代码未部署、提交或推送。

证据：output/shop-launch-next15-build.log、output/shop-launch-next16-{tests,coverage,build}.log、output/shop-launch-root-audit-final-20261001.json；output/commerce-shop-policy-{typecheck,tests,coverage,build,rollback}.log。最新方案见 [商城实施状态](shop-commerce-implementation.md)、[销售税方案](shop-sales-tax-plan.md)。

## 2026-10-01：实际仓库、配送覆盖与未税包邮

- 已按用户确认通过原生 Medusa 工作流保存 Irvine 发货及退回地址：1 Park Plaza, #600 Office 44, Irvine, CA 92614；1 个库存位置、1 个 fulfillment set、1 个 service zone、49 个州级 geo zone，包含 48 州和 DC，不含 AK、HI、属地。默认位置、销售渠道和自发货 provider 关联已建立；重复初始化保留已有设置。
- 费用和门槛真实价格记录为 995 / 10000 美分。发现原生 item_total 含税，已修正为读取商品总额减商品税额，自发货 calculated provider 使用数据库金额；Admin 价格保存走原生有补偿的价格工作流。切换计算模式与保留原费用/门槛在同一有补偿工作流中执行。商品仍为 14 草稿、0 发布、0 订单。
- 付款和完成订单重新核对实际 geo zone、provider、计算模式和费用；新增本人购物车配送报价端点，匿名/他人读取拒绝。含税金额不足门槛却得到免运费的旧报价被拒绝。
- 实际原生 Query 及已注册 fulfillment provider 只读验证通过：CA/NY/DC 允许、AK/HI/PR 拒绝；用合成商品金额上下文调用实际 provider，99.99 收取 9.95，100.00 为 0。没有在这些检查中创建客户、购物车或订单；这不代替真实会员/购物车/付款端到端验收。
- 后台覆盖率：72 项通过，配送覆盖、初始范围、未税金额与 provider 服务行覆盖率 100%；quotes 行覆盖率 100%、分支 83.33%。保持原测试断言及 30 秒子进程限制；默认后端测试改为串行，解决并行加载框架的配置子进程超时。主站 140 文件 / 839 项测试通过。
- 后台源码类型检查、完整 Medusa 后台/Admin 构建及完整 Next 构建均通过。原有 React/Vite/图片警告和开发内存队列提示仍需作为上线后续工作处理；未扩大超时或忽略类型、构建错误。
- 最终正常后台 npm test 同样 72 项通过。本地 Next /shop 和 Medusa /health 恢复为 200；未登录的 Admin 配送设置和有效公开 key 下的新结账配送报价端点均为 401。没有模拟后台已登录或声称完成真实购买。
- 已保存双语配送退换货草稿与销售税实施方案。30 天申请/14 天交运期限未发布也未强制执行；California Seller’s Permit 用户反馈不确定，Tax Provider、Tax Transactions/Reversals、申报和真实交易仍待完成，付款税务开关保持未确认。

证据日志：output/commerce-fulfillment-{setup,repeat,pricing-setup,live-read,live-pricing,typecheck,tests,coverage,build}.log、output/shop-fulfillment-root-{tests,build}.log。运费计算和覆盖已做真实读取；库存在后台尚未填写。详见 [双语政策草稿](shop-shipping-returns-policy.md) 和 [税务方案](shop-sales-tax-plan.md)。代码未提交或部署。

## 2026-10-01：会员退换申请与后台审核

- 应用单一迁移 `20261001073705_shop_after_sales_requests.sql`，本地与远程版本一致。私有表 owner、RLS、五个索引、表/函数权限已核对。
- 回滚验证通过：重复进行中申请、归属修改、跳过审核、旧版本更新及三类无权限读取被拒绝；内部备注不进入顾客历史。实际订单/售后/回滚客户最终为 0，14 个商品草稿保留，未发布。
- 新增会员申请、撤销和追踪进度及 Medusa Admin 审核页面。关联核对原生订单、类型、商品、数量、创建时间和重复使用；完成核对收货、账款差额和换货送达。申请 API 不执行退款、入库或发货。
- 全站 `npm test` 和 `npm run test:coverage`：140 个文件、839 项测试通过。售后契约/actions 为 100% 行覆盖率，actions 分支 92.3%；新 UI 专项测试没有 act 警告，原有全站警告保留。
- 后台 63 项测试及保持原断言/超时的串行覆盖率通过。售后服务行覆盖率 100%、分支 89.31%，policy 行覆盖率 96.15%；已导入源文件整体行覆盖率 87.26%。模拟工作流测试不代表真实交易验收。
- 完整 Next 和 Medusa 后台/Admin 构建通过。既有图片、测试适配和本地内存锁/事件总线提示仍在；生产 Redis 与依赖治理待完成，未放宽检查。
- 原生 return/order_exchange 查询字段在实际服务只读验证成功。游客申请 GET 与未登录后台列表返回 401；原生 Store 退货 POST 返回 400 的审核入口提示，没有执行退货。构建后恢复本地服务，shop、会员订单和后台 health 为 200；Chrome 实际会员订单显示原有登录页，售后 Admin 路径重定向原生运营登录页。真实会员/后台操作仍待账号与订单。
- 用户 CLI 和后台签名密钥比较为 true；三个测试设置符合前缀且 Git 忽略，没有输出完整值或执行支付、退款、邮件、运单购买。
- Security Advisor 新增私有申请表的 [RLS 无 policy INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)，符合 owner-only 私有访问模型；原有四个同类提示与 [泄露密码保护 WARN](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)仍在，未更改既有 Auth 设置。

日志：`output/shop-after-sales-{focused,tests,coverage,build}.log`、`output/commerce-after-sales-{tests,coverage,typecheck,build,native-read}.log`。详见 [操作与数据方案](shop-after-sales.md)。代码和迁移尚未提交或部署；真实商品、库存、仓库、后台账号、税务/售后政策及完整联调仍待完成。

## 2026-10-01：会员订单同步、权限和状态

原生 Medusa 订单快照已接入现有 Supabase 会员投影：结账完成和订单详情读取校验本人归属；后台下单、付款/退款和物流事件发送签名通知。客户端不能提交价格或 owner。支付与履约分别记录，金额保留抵扣和舍入，页面显示部分退款、分批配送和退回数量。实施方案见 [商城后台实施与上线状态](shop-commerce-implementation.md)。

- 单一迁移 `20261001063635_shop_order_projection_sync.sql` 已应用于原有项目。本地文件与远程记录已对齐；六个字段、只授 service_role 的 SECURITY INVOKER RPC、原有 RLS/policy 和商城专用角色无 public 订单权限已读回核对。
- 回滚式数据库验证通过：重复投递、旧版本、旧抓取时间、不一致金额、过量退回、已有订单 owner 重分配、本人/他人读取和普通/匿名角色拒绝写入。全部验证数据回滚，commerce 订单和 public 投影仍为 0。
- 主站 `npm test`：137 个文件 / 825 项通过；`npm run test:coverage` 同样 825 项通过；`npm run build` 完整通过。商城域行覆盖率 99.37%、分支覆盖率 91.74%。同步契约、签名、写入/归属检查和订单仓库均 100% 行覆盖率；同步 API 分支覆盖率 94.44%，签名分支 95.45%。
- 后台 `npm run typecheck`、52 项测试和完整后台/Admin 构建通过。首次并发执行 Node 覆盖率时，一个配置子进程触及既有 30 秒限制；失败日志保留为 `commerce-order-sync-coverage-attempt1.log`。随后单独以 `--test-concurrency=1` 运行，保持相同断言和超时，52 项全部通过。已导入源文件行覆盖率 78.66%；快照映射 100%，native workflow 读取及 subscriber 执行部分仍需真实订单验收，未通过扩大 mock、跳过测试或放宽超时掩盖。
- 实际本机接口：`/shop`、`/member/orders`、后台 `/health` 为 200；带有效公开 API key 的匿名订单 GET 为 401；无签名投影 POST 为 401；正确签名但无合法快照的 POST 为 400。没有生成支付或业务订单。服务在构建后恢复。
- Chrome 访问真实 `/member/orders` 显示原有 Supabase 登录页，没有另建客户登录；开发订单详情 DOM、美元金额、物流链接及截图已查看，视口页面宽度均为 798，无横向溢出。设计示例不作为真实订单/支付验证；没有填写凭据、接受同意条款或付款。
- 用户自己的 Stripe CLI 窗口显示 `Ready!`；默认 CLI 签名密钥与项目保存值的比较为 true。代理重复监听已停止，保留用户窗口；完整密钥未打印、复制到文档或 Git。两端新订单同步密钥也仅存入 Git 忽略环境文件。
- Supabase Security Advisor 未新增商城项；原有四条 RLS 无 policy 提示和泄露密码保护提示仍在。原有 React/Vite/表单适配警告、六条旧 `<img>` 构建提示仍需清理。额外全目录 `tsc --noEmit` 命中既有测试 fixture 类型错误；正式 Next 构建的源码类型门禁通过，未放宽 TypeScript 配置。
- `git diff --check` 通过（Git 仍提示既有 CRLF 转换）。日志：`output/shop-order-sync-tests.log`、`shop-order-sync-build.log`、`shop-order-sync-coverage.log`、`commerce-order-sync-tests.log`、`commerce-order-sync-build.log`、`commerce-order-sync-coverage.log`。

代码与迁移仍未提交、未部署。真实 SKU/价格/库存、后台运营账号、美国仓库/配送和税务配置、Stripe 成功/失败/重复/退款、会员身份浏览器联调、在线退换货申请/审核与生产基础设施仍待完成。本轮完成订单同步的代码与权限验证，不代表可上线收款。

## 2026-09-30：本地 Stripe 签名密钥与事件转发

运营人员填写商城测试 API 密钥与公开密钥后，代理检查后台 API key 为 `sk_test_` 或 `rk_test_` 测试前缀，再通过已安装的 Stripe CLI `listen --print-secret` 取得签名密钥。值只写入 Git 忽略的 `services/commerce/.env.development` 的 `COMMERCE_STRIPE_WEBHOOK_SECRET`，不打印或写入文档；原有环境设置保留。

随后显式使用同一商城测试 API 密钥启动 `stripe listen --forward-to http://127.0.0.1:9000/hooks/payment/stripe_stripe`，启动行的签名密钥与环境文件一致。监听器运行时输出隐藏签名/API 密钥。后台重载新环境后，只读数据库查询确认 `pp_stripe_stripe` 已注册、购物车和订单均为 0；没有创建 Stripe 测试支付、订单或修改活动付款配置。

真实支付、税务与订单/售后链路仍未验收。本轮仅修改本地秘密配置和实施文档，未改业务源码；上一阶段通过的完整测试/构建记录保留在下面。

## 2026-09-30：结账、Stripe 配置入口与连接检查

新增 `/shop/checkout` 和 `/shop/checkout/return`：保存实际美国收货地址、读取原生配送选项、重新计算税费、校验报价并恢复同一 Stripe PaymentIntent。原生购物车完成与 webhook 完成均执行归属、币种、美国 region、税务配置和支付金额校验。客户继续使用已有 Supabase 登录；支付开始后禁止修改购物车。

最新验证结果：

- 主站 `npm test`：134 个文件、806 项测试通过；`npm run test:coverage` 同样 806 项通过；`npm run build` 通过。商城域行覆盖率 99.80%、分支覆盖率 91.10%；结账 actions/repository 为 100% 行覆盖率，分支覆盖率分别为 73.23%/85.71%。未覆盖分支和真实支付流程仍需要后续验证。
- 后台 `npm run typecheck`、43 项隔离测试和完整后端/Admin 构建全部通过。测试覆盖旧报价、客户归属、USD 与美国 region、金额不一致、重复 session、锁内修改门槛和已有 intent 恢复；没有用跳过测试或放宽超时掩盖失败。
- 原有 Vite CJS、React `act`/表单兼容性提示、故意模拟错误的测试日志以及 6 条旧 `<img>` 构建提示仍在，未宣称无警告。主站审计报告 17 个漏洞，未通过强制框架升级自动处理；正式上线前须清理这些风险。
- 实际只读 TLS 数据库连接：bootstrap URI 连接为 `postgres`，商城 URI 连接为 `snowforce_commerce`；后者无 superuser/createDB/createRole/bypassRLS，允许创建 commerce 对象、禁止创建 public/auth 对象。bootstrap 连接可见 147 张商城表。本轮未旋转凭据或写入数据库业务记录。
- 本地服务恢复后，商城健康检查 200、公开商品查询 200 且数量为 0；匿名访问自定义 checkout 或原生购物车均返回 401。主站 `/shop`、checkout、return 页面均为 200，仍未发布的旧图册详情返回 404。
- Chrome 实际结账显示现有会员登录入口，点击进入原 `/member?next=%2Fshop%2Fcheckout`。人为提供 `redirect_status=succeeded` 的回跳仍要求登录、不显示订单成功；随后查询参数被移除。实际 meta referrer 为 `no-referrer`。当前桌面视口 1679、页面宽 1664，无横向溢出；未操作真实账号或支付。
- 后台两个 Stripe 设置仍为空；根 `.env.local` 只补齐缺少的公开密钥空项，原有配置保留，两个文件均 Git 忽略。已安装 Stripe CLI 的 `listen --help` 确认支持本机转发；尚未执行 `stripe login`、监听或真实支付请求。取得步骤见 [商城 Stripe 测试配置](shop-stripe-setup.md)。
- `git diff --check` 通过，存在 Git 对 CRLF 的普通提示。日志保存在 `output/shop-checkout-final-tests.log`、`shop-checkout-final-coverage.log`、`shop-checkout-final-build.log` 和 `output/commerce-checkout-final-*`。

当前仍缺实际售卖 SKU/价格/库存、美国 region/仓库/配送、后台运营账号、Stripe Sandbox 联调、税务确认、会员订单同步、在线退换货和生产基础设施；此轮验证不能视为可上线收款。没有部署、真实付款、退款、发信或购买运单。

以下保留各阶段历史验证记录；旧阶段的功能描述和测试数量不代表最新状态。

## 2026-09-30：真实前台目录与购物车接入

首页商城、商城列表与详情已改为读取 Medusa Store API，不再展示静态图册参考价；只显示发布商品。新增数据库购物车、SKU 选择与增减删除服务端操作；金额由原生工作流计算。签名 cookie 绑定现有 Supabase 用户 UUID，并逐次验证 Medusa customer 归属；客户端不能提交价格、客户 ID 或购物车 ID。

验证证据：

- 主站 `npm test`：131 个文件 / 781 个测试通过；`npm run build` 通过；`npm run test:coverage` 通过。商城域行覆盖率 99.77%；新增购物车操作、cookie、购物车仓库、商品映射与仓库均为 100% 行覆盖率，仍有部分异常分支和未完成的交易流程。
- 后台类型检查、32 个测试与完整构建通过；Node 覆盖率检查通过，已导入文件的行覆盖率 81.24%。新配置工具只补齐被 Git 忽略环境文件中的缺失值，保留运营配置，不输出凭据。
- 实际本机 Store API 区域和商品查询均为 200，公开商品 0；不存在的购物车查询为 404，原生查询字段通过校验。不是购物车写入或支付的端到端验证。
- 数据库只读读回：14 草稿，0 发布、0 SKU、0 region、0 购物车、0 订单、0 后台用户；未创建虚构售价、库存、仓库或订单。
- Chrome 实际页面显示“新品即将上架”；购物车提示登录现有 SnowForce 账号；点击后到原 `/member?next=%2Fshop%2Fcart`。未填写登录凭据，也未建立后台运营账号。
- 390 × 844 手机视口下，中文商城与菜单可操作，DOM 宽度 375、视口 390，无横向溢出，目录无草稿卡片；临时视口已恢复。浏览器截图 API 两次超时，因此未取得可分享截图，不将 DOM 检查描述为完整视觉验收。
- 浏览器记录中只有 Chrome 扩展自身的 `tabs:outgoing.message.ready` 错误，未见 SnowForce 页面应用错误。原有测试 React `act`、Vite CJS 与旧 `<img>` 构建提示仍需后续处理，未关闭规则或跳过测试。

真实会员购买、后台商品发布/改价/入库的端到端联调、Stripe、仓库配送、退换货审核与生产服务部署仍未完成；购物车结账明确显示准备中。本记录不代表可上线收款。当前状态和配置说明见 [商城实施与上线状态](shop-commerce-implementation.md)。

## September 30: real commerce foundation and drafts

Medusa 2.21.2 is installed under `services/commerce`. The same existing Supabase database now contains 147 private commerce tables, including 20 verified module link tables. Fourteen products were imported as drafts; variants, sale prices, inventory levels and orders remain empty. The native store uses USD. Product images live in the existing Storage `shop-products` bucket, and all 14 public WebP URLs return 200. Repeating the importer creates zero products and preserves all 14.

The dedicated database role has no database CREATE, superuser, bypass-RLS or existing public/auth table permissions. Anonymous/member roles have no commerce schema or core-table access. Public/auth table counts remain 33/27. The Store API returns zero published products; anonymous admin/customer bridge requests return 401, and the commerce Data API request returns 406. Existing live home and event pages return 200.

Backend type checking, 30 tests, build and Node coverage pass. Main application tests pass (124 files / 753 tests), build and coverage pass; the shop domain has 99.67% line coverage. Dependency overrides address the actual lodash/ajv/uuid advisories, and the install audit reports zero vulnerabilities. The actual Medusa login UI is visible in Chrome at `http://127.0.0.1:9000/app/login`; no admin account was invented or private credentials printed.

This is a verified data/backend stage. Real catalog/cart/checkout integration, customer-auth browser validation, warehouse/shipping setup, payment webhooks, order projections, return requests and production infrastructure remain outstanding. The current public shop is still the reference catalog and consultation selection. See [implementation and launch criteria](shop-commerce-implementation.md) for the precise state and operations. No deployment, collection of payment, email send or shipping-label purchase occurred.

## Homepage section placement update

The featured shop section now directly follows the past-event recap section and precedes current events. English and Chinese homepage tests assert both neighboring sections. `npm test` passed (112 files / 689 tests), `npm run build` passed, and `npm run test:coverage` passed. The built homepage DOM confirms `past-recaps → gear-shop → open-events`. Browser verification at the comment's 653×757 viewport shows the recap's “browse all recaps” link directly above the shop. Screenshot: `output/playwright/home-shop-after-recaps.png`. The viewport override was reset.

## Latest: mature storefront refinement

Reference research: `docs/shop-reference-research.md`. The current interface adds category and brand discovery, prominent search, compact product cards, category URL entry, product photo expansion, desired quantity, product information sections, a mobile options shortcut and USD selection estimates.

- Final `npm test`: 112 files / 689 tests passed. Final `npm run build`: passed. `npm run test:coverage`: 689 tests passed; shop domain logic has 100% statement/line coverage and 98.9% branch coverage. `git diff --check`: passed.
- Browser checked at 1440×1000 and 390×844. Desktop discovery uses a category menu, mountain hero and kids' recommendation. Mobile stacks the hero and recommendation; the product grid has two columns. Product images show the complete source photo. No horizontal overflow at either viewport.
- Category entry shows two kids' products; English `Rogue` search narrows it to one. Reset restores all products. The detail breadcrumb opens `/shop?category=kids#catalog` and renders the correct category.
- Photo expansion opens and closes. Color, size and desired quantity work together. Adding two Rogue jackets alongside the existing goggles selection gives $267.73 = $104.14 × 2 + $59.45. The test jackets were removed afterward; the preexisting goggles selection, variant and quantity were preserved.
- Mobile bottom options entry scrolls the form to approximately 160px below the viewport top, beneath both sticky navigation bars. Color, size, quantity and the submit button are visible together.
- All inspected public text uses USD prices; there are no CNY/yen-symbol prices. Loaded images have no failures, and the final preview's warning/error console log is empty.
- Current screenshots: `output/playwright/shop-mature-desktop.png`, `shop-mature-detail.png`, `shop-mature-mobile.png`, `shop-mature-mobile-catalog.png`, `shop-mature-mobile-detail.png` and `shop-mature-selection.png`. Temporary viewport overrides were reset.

The earlier checks below record preceding implementation stages. Current work remains local and uncommitted, with the final production preview at `http://127.0.0.1:3100/shop`.

## USD-only follow-up

The catalog grid, related products and product detail price now display USD only, with two decimal places in both languages. Internal CNY source values are converted using the documented fixed display-rate snapshot; labels clearly identify estimated reference prices. Original catalog page previews/links were removed from the public detail UI because their embedded prices are CNY. The original PDFs and provenance records remain available in the repository.

Updated currency and UI assertions pass. Full `npm test` (680 tests), `npm run build`, `npm run test:coverage` and `git diff --check` passed again. The local browser was refreshed and verified to show dollar amounts and the Chinese USD reference label. Screenshot: `output/playwright/shop-usd.png`. Earlier screenshots below describe the initial release before this currency update.

## Final checks

### Homepage shop section follow-up

Added a bilingual featured gear section after the homepage current-events section. Three existing catalog products link to their detail pages, and the section CTA opens `/shop`. Prices use the shared USD formatter. Focused homepage tests assert both languages, placement, product destinations and USD-only amounts.

`npm test` passed: 112 files / 682 tests. `npm run build`, `npm run test:coverage` and `git diff --check` passed. The built homepage was checked at 1440×1000 and 390×844: three-column desktop and two-column mobile cards render correctly, mobile has no horizontal overflow, and the shop CTA navigates to `/shop`. Screenshots: `output/playwright/home-shop.png` and `output/playwright/home-shop-mobile.png`. Temporary viewport overrides were reset; the homepage preview tab was kept open.

- `npm test`: passed, 112 files / 680 tests. Includes 14 focused shop tests.
- `npm run build`: passed, with `/shop` and `/shop/[slug]` in the route output. Type checking and lint completed.
- `npm run test:coverage`: passed, 680 tests. Shop domain logic: 100% statements/lines/functions, 98.61% branches. Shop components: 100% lines, 89.79% branches, 71.87% functions. The remaining component functions mostly cover additional filter/quantity/link callbacks; browser checks exercise the real controls.
- `git diff --check`: passed. No new dependencies or environment changes.

## Browser checks

Used the built production server, bound to `127.0.0.1:3100`, in the Codex in-app browser. Checked English and Chinese at a 1440×1000 desktop viewport and a 390×844 mobile viewport. Temporary viewport overrides were reset afterward.

- Desktop hero, brand strip, filters and four-column product grid render correctly; mobile filters stack and cards use two columns.
- Combined little-rider category + `Rogue` search shows the matching product and opens the real detail route.
- Adding without known color/size shows validation feedback. Choosing Racing red-blue / 130 opens the selection drawer with those exact choices.
- Escape dismisses the drawer. Reloading the page preserves the saved variant and quantity.
- Chinese switching updates product, variant and inquiry copy. Mobile navigation exposes the shop link.
- Removing the item produces the empty-selection state and a zero badge. Test-generated selection was removed from the browser.
- DOM inspection found no horizontal overflow at the mobile viewport and no failed images among loaded images. Below-fold images lazy-load. Browser warning/error log was empty on the final shop page.
- Email inquiry URLs include product identifier, variant, quantity and confirmation terms. No email or WeChat message was sent.

Screenshots: `output/playwright/shop-desktop.png`, `shop-catalog.png`, `shop-mobile.png`.

## Existing warnings and coverage follow-up

The new shop dialog cleanup warning was fixed, and the final build has no warnings in shop components. Existing `<img>` lint warnings remain in about, recap admin gallery, event sharing, member components and the site logo. These are outside this change's scope. Next.js also recommends the optional `sharp` package for production image optimization; this project currently uses its existing fallback.

The existing suite emits React `act(...)` warnings in event registration/sharing and merchant tests, React form-action compatibility warnings, intentional mocked failure logs, and Vite's CJS API deprecation warning. They were not suppressed or hidden with skipped tests. Follow-up should migrate the Vite config to ESM, await asynchronous UI effects in affected tests and update the server-action test adapters.

Whole-project line coverage is 55.16%. Existing payment branch coverage is 49.61%; `fulfillment.ts` branch coverage is 36.17%, and `return-status.ts` has no coverage. Dedicated payment failure/retry/return-status tests are a follow-up before extending transactional commerce. The shop does not introduce a payment or authorization path.

## Release state

Changes remain local and uncommitted. No deployment was performed. The existing untracked source PDFs, incident outputs and Supabase migration/test were preserved. The local preview is available at `http://127.0.0.1:3100/shop`.
