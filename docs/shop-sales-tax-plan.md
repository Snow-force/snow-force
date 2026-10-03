# SnowForce 美国商城销售税方案

核对日期：2026-10-02。适用装备商城，USD 结算、Irvine 加州实际存货自行发货、48 州及 DC 配送。经营者反馈 California Seller’s Permit 状态“不确定”；正式主体和已有其他州注册情况仍待核实。本文件是实施方案，未启用收税或提交税务登记。

## 建议采用的方案

建议采用 Stripe Tax 的 Tax Calculations / Tax Transactions API，并在 Medusa 中建立报价适配、金额核验、税务账本及收款/退款对账。独立 Tax Provider 只负责接入税务引擎与返回税行，不能单独解决原生百分比税行的分币舍入、固定政府费用和退款最终状态问题。现有 Stripe Payment Element、Medusa Stripe payment provider 和 webhook 不会自动完成这些 Tax API 与对账工作。Medusa 默认 system tax provider 是基本占位方案；不能将其零税额当作已完成合规配置。参见 [Medusa Tax Provider](https://docs.medusajs.com/resources/commerce-modules/tax/tax-provider) 与 [Stripe Standalone Tax APIs](https://docs.stripe.com/tax/standalone-tax-api)。

先验证金额模型：逐行、运费、政府费用和整单应付美分必须与税务引擎一致，并覆盖订单、退货、换货和退款。Medusa 2.21.2 的限制已有本地实证；2026-10-02 已实现分币/优惠写回、报价生产/账本及 [税费原子应用](shop-tax-quote-application.md)，并验证真实 SQL 存储税率与原生 Cart/Order 金额。实际写入测试最终全部回滚；尚无真实 Tax Calculation、顾客购买或部分退货财务验收，不能仅配置 Provider 或解除环境开关就开启正式付款。

实际只读核对发现：当前商城 Stripe 测试环境 Tax Settings 为 pending，Tax Registrations 为 0，经营地址尚未完成。已新增后台核对页及准备/锁内/原生完成路径的实际登记门槛，拒绝缺失、过期、未知税种或不完整列表；设置核对通过也不代表交易接入完成。没有自动新增登记或填写经营地址，详见 [税务设置核对](shop-tax-setup-review.md)。

经营税务后台已保存未确认草稿，并核对正式审核版本、原生仓库和已发布政策来源。[报价来源](shop-tax-quote-source.md) 从本人购物车、精确优惠/配送、审核分类、经营资料、实际 Stripe 设置和数据库时间生成输入。归一化、固定报价生产、原子应用、政府费包邮排除、前台编排、过期/编辑恢复、准确付款金额桥接和 [全额成交持久税账](shop-tax-sale-ledger.md) 已实现并有隔离核验。实际 Calculation/成交、原生 capture 完整限制、部分退货金额、退款冲销及生产验收仍未完成，见 [上线清单](shop-launch-status.md)。

先核实加州登记，再按实际州注册情况收税。根据用户描述在加州存货和发货，判断其存在加州实体经营联系；这不是仅依赖远程销售金额门槛的业务。CDTFA 对在加州经营并销售实物商品的登记和纳税规则见 [Internet Sales / Publication 109](https://www.cdtfa.ca.gov/formspubs/pub109/)。最终登记范围、经营地址性质和产品税务分类请由负责申报的会计师或 CDTFA 确认。

## 开始顺序

| 步骤 | 操作 | 验收 |
| --- | --- | --- |
| 1. 核实主体与加州许可 | 查现有 CDTFA 注册确认函和申报账号；可从 [CDTFA Online Services](https://onlineservices.cdtfa.ca.gov/) 使用 Verify a Permit 查询已有许可。EIN、公司注册或 Stripe 账号本身不等于 Seller’s Permit | 确认许可对应实际销售主体、经营地点、是否有效、申报周期；证件号码仅在官方系统/受保护配置处理 |
| 2. 必要时办理 | 若没有，应在 CDTFA Online Services 的 Register a New Business Activity 中按实际情况申请；避免重复登记 | 取得许可、有效日期及申报要求，记录经营者或会计师确认结果 |
| 3. 设置 Stripe Tax | 商城对应 Stripe 账户/环境的 Tax 设置，填写真实销售主体总部地址；计算时另外传 Irvine ship-from 地址 | 测试与正式环境分开，不能把测试注册状态视为正式许可 |
| 4. 加入已有税务注册 | Tax → Locations → Add registration；仅在已核实许可时使用 I’ve already registered 并填写实际生效日期 | 在应收税区域有正确 active registration；添加 Stripe 记录不等于向税局登记 |
| 5. 商品与运费分类 | 后台记录服装、运动装备、雪镜等对应税务分类，逐类选择 Stripe 官方 tax code；不同州服装豁免/税额规则由税务引擎处理 | 缺失或未审阅分类不发布付款；不从品牌或中文名称猜税码 |
| 6. 接入和测试 | 完成下述计算、交易和冲销代码；逐笔核对实际金额与报表 | 验收通过后才启用正式结账，不只修改环境开关 |
| 7. 申报缴款 | 初期建议会计师按规定周期用交易报表申报与缴税；后续再评估独立开通自动申报服务 | 明确负责人、申报截止日、零销售期是否仍需申报、付款方式和申报确认记录 |

Stripe 的登记添加流程及有效日期设置见 [Register for sales tax](https://docs.stripe.com/tax/registering)。普通自动计税接入不会代替向税局申请许可，也不自动代表已购买或配置申报缴税服务。

## 顾客看到什么

商品价格以未含税美元标价。结账显示商品小计、折扣、Shipping、Sales tax 和 Total；如实际依法需要收取固定政府配送费用，另行明确列示。销售税由真实收货地址、Irvine 发货地址、商品分类、实际注册区域及当前规则计算，付款前给出确定的应付总额。金额和币种只由后台决定。

满 US$100 包邮按优惠后商品金额判断，税费不计入门槛。未满时 US$9.95 运费单列，运费可能产生税额，不能展示“运费一律免税”。不把 Irvine 的某一个税率统一应用到所有客户，也不把“全美配送”理解为“必须同时注册全美”或“其他州永远零税”。

## 数据位置和日常管理

继续使用已有 Supabase PostgreSQL 的私有 commerce schema，顾客继续使用现有 Supabase Auth 及会员登录页。

| 数据 | 源数据及管理方式 |
| --- | --- |
| 商品、SKU、未税价、库存 | Medusa 原生商品/价格/库存表，Admin 日常管理 |
| 发货与退回地址 | 原生 stock_location / stock_location_address；店铺 metadata 仅引用位置 ID，不复制地址文本 |
| 配送范围和运费 | 原生 service_zone / geo_zone、shipping_option、price_set / price；Admin 配送设置 |
| 商品税码和税价模式 | 私有 commerce.store.metadata.snowforce_tax_classifications，按 product ID 保存精确官方代码、exclusive 方式及完整审核历史；SnowForce product tax 后台编辑，付款前核对当前内容。14 商品尚未分类。详见 [分类管理](shop-product-tax-classifications.md) |
| 经营资料、仓库来源及运费分类 | 私有 commerce.store.metadata.snowforce_tax_configuration，SnowForce business tax 后台保存草稿和显式启用审核；读取原生仓库地址、核对已发布政策主体及实际 Stripe 设置。当前 revision 1 未确认草稿、无启用版本。详见 [经营税务后台](shop-business-tax-configuration.md) |
| 税务注册、总部与申报记录 | Stripe Tax Dashboard、CDTFA/各州税局；正式许可状态以税局为准 |
| 订单税额 | 原生订单 item_tax_line / shipping_tax_line 表示比例税行；已建私有报价快照保存精确分币及固定费用，应用和成交环节仍待完成。已成交金额作为历史快照，不按新价格或新税率重算 |
| calculation / transaction / reversal 对账 | commerce 私有 operations、quotes、applications 三表已创建；报价请求/结果、签名和付款关联校验已实现，当前均为空。成交与退款税事务/冲销持久账本仍待建立 |
| 会员订单摘要 | 现有 shop_member_orders 投影，保留原税额；不向浏览器发送税务凭据或原始报表 |

后续日常修改注册区域通过 Stripe Dashboard，商品分类和经营资料通过 Admin，税率通过税务引擎更新。分类和经营税务后台、私有审核历史与付款前置检查已实现；未自动给真实商品分类或确认许可。单份报价账本迁移已审阅、执行并核对远端历史；后续新增成交/退款账本仍需单一受控迁移。尚无真实 Calculation 生产或购物车应用。

### 五类私有账本及实施状态

报价类已用 snowforce_tax_operations、snowforce_tax_quotes、snowforce_tax_quote_applications 实施；逐行金额目前保存在不可变报价 JSONB 快照，不另建 quote_lines 表。下表其余成交、退款和通用任务账本仍为设计，不能据此声称完整税账已完成。金额使用受约束的整数美分，区分销售税与固定政府费用；税率只作税务明细和原生映射信息。顾客继续映射现有 Supabase 会员，不复制登录账号。

| 类别与拟定表 | 核心数据和约束 |
| --- | --- |
| 报价：snowforce_tax_quotes | cart/order 来源、报价版本、完整输入 fingerprint、税务配置版本、Stripe account/livemode、calculation ID、tax_date/expires_at、商品净额/运费/销售税/固定费用/总额美分、状态及受控请求/响应快照。calculation ID 按 account + livemode 唯一 |
| 报价明细：snowforce_tax_quote_lines | quote 外键、稳定 line reference、原数量、优惠后税基、tax code/behavior、逐行税额和司法辖区明细。商品、运费及固定费用分别记录，不把法定税率与分币映射税率混为一谈 |
| 成交：snowforce_tax_sales | quote 外键、native order/payment/capture ID、真实 PaymentIntent/charge、成功捕获金额、唯一 sale reference、Tax Transaction ID、实际 transaction line ID 映射、posting 时点和状态。成交财务快照不随之后改价更新 |
| 退款：snowforce_tax_refunds / snowforce_tax_refund_lines | native refund/售后 ID、唯一 Stripe Refund ID、资金状态、原 transaction line ID、每行净额/税/固定费用冲销美分、原剩余额度、reversal ID及状态。Calculation line ID 与 Transaction line ID 分开保存，不能假设两者相同 |
| 任务：snowforce_tax_jobs / outbox | 稳定 operation UUID、action、不可变 payload hash、Stripe idempotency key、唯一 reference、attempts/next_attempt_at、处理 lease、响应 ID、错误分类和审计时间。按同一操作恢复，而不是失败后生成新操作 |

计划沿用商城专用 snowforce_commerce 角色，不新增 public/auth schema 权限。税表只供后台访问，不暴露 Data API；启用 RLS 作为防护，并明确撤销 PUBLIC、anon、authenticated、service_role 的直接表访问。地址和税务响应按最小必要范围受控保存，不含 API 密钥、数据库密码或无关会员资料。退款累计额度在短事务行锁下检查；Stripe 网络请求放在事务外，由持久任务 lease 防止并发重复处理。

## 已确认的 Medusa 金额模型限制

本地安装版本为 Medusa 2.21.2。TaxLineDTO 只提供 rate，没有固定税额 amount；tax line 的 data 可以存明细，但原生 calculateTaxTotal 只用 taxableAmount × rate / 100，不使用 data 中的 amount_tax。核查位置是 services/commerce/node_modules/@medusajs/types/dist/tax/common.d.ts 和 @medusajs/utils/dist/totals/tax/index.js；这是已安装版本源码证据，尚未对这些依赖做任何修改。

本地直接运行原生数学函数，复现 Stripe 官方例子的 US$14.99 × 10.25%：Medusa 一行得到 US$1.536475；两行相加再取整为 307 美分。若两行 Stripe Calculation 各返回 154 美分，应该相加为 308 美分。该复现没有调用真实 Stripe API，证明的是不能把引擎已给出的逐行美分税额当作比例税率后统一舍入；真实交易仍需实测。参见 [Stripe Calculations API 的逐行 amount_tax 示例](https://docs.stripe.com/api/tax/calculations/create)。

仅用 154 / 1499 × 100 反推“有效税率”也不构成无损证明：本地原生函数得到 US$1.5400000000000000421，数量、优惠和部分退货后还会按比例重新计算。若采用这种适配，必须锁定报价，分别保存法定税率和映射税率，逐行及整单核验实际美分，并以原始财务分配计算退款。不能只检查整单四舍五入碰巧相同。

另一个不能用比例税行表达的情况是固定政府配送费用：Stripe 支持在 Colorado、Minnesota 的适用情形计算 retail delivery fee；这是按配送收取的固定政府费用，与商家 US$9.95 运费不同，包邮也可能发生。官方示例的 shipping_cost.amount=0，而 shipping_cost.amount_tax>0；Medusa 对零运费乘任何有限税率仍等于零。是否需要本店收取、何时登记及是否可退必须按实际业务和州规定核实，本方案不据此认定本店已有这两州义务。参见 [Stripe Retail Delivery Fee](https://docs.stripe.com/tax/standalone-tax-api#calculate-the-retail-delivery-fee)。

解决方向是经验证的分币税额适配，加上正式独立费用建模或支持固定税额的 Cart/Order totals 扩展。若采用自定义政府费用明细，必须排除配送、库存、优惠、商品退货数量及包邮门槛，并避免再次传入 Tax Calculation 重复计税；前台和 Admin 要清楚列示其费用性质。所有订单、投影和售后流程都需要验收，这还不是可直接上线的实现。无法准确表达的结果应停止付款，不能改成零、伪造其他商品税率或用未披露的优惠补差。

## 报价与 Provider 接入要求

1. 在保存/修改地址、商品、数量、优惠和运费后，以优惠后的实际美元美分调用 stripe.tax.calculations.create。传递完整收货地址、address_source=shipping、真实 ship_from_details、商品税码、tax_behavior=exclusive 和实际 shipping_cost。line_items.amount 是整行金额，quantity 保留真实数量；数量会影响服装等商品的单件税务门槛。默认最多 100 行，增额许可及分页读取另行验证。参见 [Stripe Calculations API](https://docs.stripe.com/api/tax/calculations/create) 与 [按数量计算的示例](https://docs.stripe.com/tax/payment-intent/custom)。
2. ITaxProvider.getTaxLines 作为适配接口，配置到 @medusajs/medusa/tax。本地 getItemTaxLinesStep 会分别对商品和运费调用 Tax Module，传入的商品只有数量、单价及标识，缺少优惠后完整税基。需通过 updateTaxLinesWorkflow、upsertTaxLinesWorkflow、updateOrderTaxLinesWorkflow 的 setTaxLineContext hook 加载完整报价上下文；两次 Provider 调用复用同一标准报价，分别返回对应税行，避免做两次不完整计税。参见 [Medusa 税行与上下文接口](https://docs.medusajs.com/resources/commerce-modules/tax/tax-calculation-with-provider) 与 [Cart 税行工作流和上下文 hook](https://docs.medusajs.com/resources/commerce-modules/cart/tax-lines)。
3. 持久保存 calculation ID、全部明细、报价版本、fingerprint、税务配置版本及到期信息。付款前逐行、运费、固定费用、原生整单和 Stripe 应付美分核验；商品、数量、价格、优惠、地址、运费、税务配置变化均废弃旧报价。税服务错误、必需登记未确认、金额不齐时停止付款，不吞异常转为零。
4. 区分 not_collecting、产品豁免、免税证书和地区不征收等零税原因。加州登记未核实不走正常零税额付款；其他州引擎返回零也不单独证明本店没有登记义务。是否允许该结果，以核实的经营事实和登记配置为依据。

## 捕获、成交登记与幂等恢复

当前配置为先授权、后捕获。安装版本 StripeBase.capturePayment 未把 amount_to_capture 传给 Stripe，Provider CapturePaymentInput 也没有金额字段；虽然原生 capture workflow 接收 amount，当前 Stripe Provider 实际捕获整个授权。因此首版必须限定一次全额捕获；真实部分捕获另做 Provider/workflow 和 Stripe 能力验收，不能仅依赖后台金额输入。

实际成功捕获后，核对 PaymentIntent/charge、amount_received、报价与原生订单金额，按会计师确认的记账时点运行 stripe.tax.transactions.createFromCalculation({ calculation, reference, posted_at })。仅授权、取消或付款失败不记为已收到款项。Tax Transaction 绑定稳定 sale 操作、唯一 reference 和原订单/capture；Calculation 90 天后不能再用于成交登记，失败队列需在失效前处理。参见 [Stripe Create Transaction from Calculation](https://docs.stripe.com/api/tax/transactions/create_from_calculation)。

成交登记失败只重试税务任务，不再次捕获资金。outbox 持久保存请求和响应；同一操作始终使用同一幂等键与 reference，拒绝改变 payload。Stripe 幂等记录可能在至少 24 小时后被清理，所以长期恢复还需要本地唯一操作约束、保存的响应 ID、远端读取对账和“不确定结果”状态。网络超时不能被当作确定未成功，也不能换 reference 再提交。参见 [Stripe Idempotent Requests](https://docs.stripe.com/api/idempotent_requests)。

正式部署需持久事件队列、数据库任务/分布式锁、重试 worker 和定期对账，不能用本机内存事件总线作保障。逐日核查 Medusa capture/refund、Stripe 资金记录与 Tax Transactions/Reversals；异常在 Admin 可见，并记录运营处理结果。

## 退款最终状态、部分冲销和失败恢复

本地 StripeBase.refundPayment 调用 refunds.create 后没有保存返回的 Refund 对象，而是返回原 PaymentIntent data；原生 webhook 分支也不处理 refund.created、refund.updated、refund.failed。因此 payment.refunded 只能触发对账，不能证明资金已成功退回；不能只依据 order.summary.pending_difference=0 完成售后。

拟建流程必须保存真实 re_ Refund ID、金额和状态，验签处理 refund.created/updated/failed 并重读 Refund。pending、requires_action 等状态保留为资金处理中；failed/canceled 显示异常，不做成功税冲销。仅确认 succeeded 后按审阅过的退款规则创建税 reversal，或在无需退款的案件中记录明确的无需退款理由。若已发起原生退款但结果不确定，先对账原 Refund，不能盲目生成新 native refund ID 重发；原生退款异常会删除退款行，下一次调用可能换幂等键。参见 [Stripe Refund 状态及事件](https://docs.stripe.com/refunds)。

使用 stripe.tax.transactions.createReversal 对原 Tax Transaction 冲销。指定商品退货用 mode=partial，提交原 transaction line ID、负的净额 amount 和税额 amount_tax；quantity 只是报表数量，不会自动算退款税额。商品、运费和固定费用分开处理，累计不超过原实付与可冲销税额。flat_amount 是含税总额，并按剩余商品/运费比例分配，不能代替指定某件商品的逐项退款；单独税额补退的 flat tax-only 功能仍有 preview 限制，不作为稳定补差接口。参见 [Stripe Create Reversal](https://docs.stripe.com/api/tax/transactions/create_reversal) 与 [Custom Tax API 退款控制](https://docs.stripe.com/tax/payment-intent/custom)。

同一 sale 最多 30 次 partial reversal。已有 partial 后再 mode=full 不会自动抵消此前 partial，会重复冲销；建议最后一次仍用 partial 只退剩余额度。确需 full 时，先完整反冲销以前的 partial 并核验，再执行 full。按原始分币分配处理多次部分退货、换货价差和运费退款，保留累计额度和每次操作记录，不按当日税率重算。参见 [Stripe Partial Reversals 与 Full Reversal 的关系](https://docs.stripe.com/tax/payment-intent/custom#partially-refund-a-sale)。

资金退款成功但税冲销失败：保留同一 reversal 操作并重试税任务，不重复退钱。若退款随后失败或取消，且税 reversal 已登记，应对该 reversal 做独立反冲销以恢复税账，再由运营处理资金异常；不自动重新向顾客扣款。反冲销也必须有独立稳定 reference、幂等记录与对账。参见 [Stripe 撤销已记录的退款冲销](https://docs.stripe.com/tax/payment-intent/custom#reversals-void-refund)。

建议使用稳定的 Calculations / Transactions / Reversals API；上线前核查当前支持，不依赖未经正式验证的预览版 PaymentIntent 自动税务关联。批准退换货申请、寄回商品或原生账面余额归零都不等于已成功退款或已完成税务冲销。

## 固定 US$9.95 运费的税务处理

加州对单独列示的第三方承运配送费是否免税，取决于实际条件和可证明的运输成本。若收取超过实际运输成本，超出部分可能应税；没有每笔实际运输成本证据时，相关配送费可能全部应税。不能因为把费用命名 Shipping 就直接全部免税。依据 [CDTFA Shipping and Delivery Charges](https://www.cdtfa.ca.gov/formspubs/pub100/) 及 Publication 109。

建议首版坚持 US$9.95 的顾客运费，保留每单实际 USPS/UPS/FedEx 邮费票据，且不混入未单列的 handling 费用。与会计师确定加州运费处理，并核查 Stripe shipping tax code 是否能表达该安排。对不能精确表达的收费方式，应调整运费结构或增加经审阅的精确计算，不默认全部免税，也不未经核实向顾客多收。满额包邮时顾客 shipping_cost=0，商家自付邮费按会计处理，不虚增顾客税基。

## SDK 选择与其他税务引擎

2026-10-01 退款核对阶段已在 commerce 顶层明确锁定独立 Stripe SDK 23.0.0，独立客户端 API 为 2026-09-30.endive；根目录仍为 22.3.0，Medusa payment-stripe 私有 SDK 仍为 15.12.0。三者不是同一客户端，新类型没有替换原生 Provider。独立客户端现用于退款读取/签名、报价/付款创建及成交 Tax API，仍逐项核验固定费用和金额模型。没有改写 node_modules 或替换原生私有 SDK。参见 [Stripe Node SDK](https://github.com/stripe/stripe-node) 与 [Stripe API 版本说明](https://docs.stripe.com/upgrades)。

| 方案 | 接入工作及适配判断 |
| --- | --- |
| Stripe Tax | 复用现有支付账户；自行实现标准报价、金额表达、五类持久账本、成功捕获/退款对账及税冲销。现有 Payment Element 和 Provider 不会代做这些工作。当前建议继续评估该方案 |
| Avalara | 有官方 Medusa v2 示例，需自建 Provider、配置另一套账户/主体、税码与商品同步，建立成交和退款记录。示例用 detail.rate × 100 回填比例税行，未解决本文件中的固定税额和舍入限制；其 order.placed 登记方式还需适配本店授权/捕获与记账时点。教程没有完整退款处理，不能作为已经验收的生产闭环 |
| TaxJar | 官方 API 支持税额计算、销售与退款交易；本次未找到当前官方 Medusa v2 完整维护包，本地也未安装 TaxJar。仍需自建适配、账本和对账，不能把 v1 插件或文档中的名称举例当作即装即用方案 |

比较依据：[Medusa 官方 Avalara 教程](https://docs.medusajs.com/resources/integrations/guides/avalara)、[Medusa v2 示例仓库](https://github.com/medusajs/examples/tree/main/avalara-integration) 和 [TaxJar 官方 API](https://developers.taxjar.com/api/reference/)。如果负责申报的会计师已有 Avalara 工作流程，再评估其接入与申报服务；不能为了避开 Medusa 金额模型问题而单纯更换税务引擎。

## 其他州、成本和申报责任

Stripe Tax 的正式环境 threshold monitoring 可以辅助发现其他州潜在 economic nexus，但不代替判断；它主要监测 Stripe 处理/录入的交易，需合并其他渠道和相关主体业务数据。若以后在其他州存货、雇员或经营，应主动重新确认，不能等销售门槛提醒。见 [Stripe Monitor your obligations](https://docs.stripe.com/tax/monitoring)。

Stripe Tax 和可能选用的注册/申报服务有额外费用；启用前按当前账户展示的费率、调用次数和交易规模确认。后台计算应缓存未变化报价，限制重算频率并记录调用成本，但付款前必须核实有效性。

建议首版使用自动计税与交易报表、会计师申报的组合。后续交易增长时，另行评估正式开通的自动申报服务。Stripe 报表用于对账和申报辅助，不能把生成报表当成已申报/已缴款。见 [Stripe Tax reporting](https://docs.stripe.com/tax/reports)。

## 上线退出条件

- 主体、加州 Seller’s Permit 和其他已有税务注册、生效日期、申报负责人均确认。
- 产品分类及税价模式、加州运费处理得到审阅，并正确配置到实际商城环境。
- 加州不同完整地址、外州有/无注册、服装与装备混合、99.99/100.00 包邮边界、优惠、数量变化均验证逐行及整单精确税额；覆盖分币舍入和适用时的免费配送固定政府费用。
- 首版单次全额捕获限制经验证；支付成功/失败/重复事件、授权未捕获、取消、退款 pending/succeeded/failed/canceled、全额与多次部分退款、换货价差和税服务失败重试演练通过。
- 已 partial 后退剩余金额、30 次 partial 上限、退款失败后的税账恢复、24 小时后不确定请求的对账恢复均有可操作方案并验证；不重复扣款或退款。
- 每个订单付款金额、原生金额表达、税账本、Stripe Tax Transaction 和退款 reversal 一致；资金最终状态与售后完成门槛一致，且报表可供申报负责人使用。
- 正式环境密钥、HTTPS、持久数据库/Redis/事件队列和上线依赖安全检查完成。最后才开启 COMMERCE_TAX_POLICY_CONFIRMED；该布尔值只是最后一道发布门槛，不是税务正确性的依据。

当前状态：仓库和配送配置已建立；许可证待核实，14 商品仍为草稿。经营审核草稿、报价三表、固定报价生产、原子应用、顾客报价生命周期、美分付款桥接及全额单次 capture 的成交税账/持久恢复已实现，但没有真实交易验收。退款状态核对见 [退款核对方案](shop-refund-verification.md)；原生 capture 完整限制、部分退货财务适配、退款税账冲销/恢复及完整交易/生产验收仍待完成。没有为“不确定”状态创建正式税务注册、启用收税或解除付款限制。
