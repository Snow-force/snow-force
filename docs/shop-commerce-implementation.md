# 商城后台实施与上线状态

更新时间：2026-10-02（洛杉矶时间）。Medusa 版本固定为 2.21.2。本文件记录实际实施，功能规划见 [完整商城方案](shop-backend-plan.md)。

## 已经进入现有 Supabase 的数据

只使用现有 Snow-Force web 项目 `bhmwxkynhyhquspiyact`、us-east-2 和原有 `postgres` 数据库。没有新增数据库项目。

| 数据 | 实际位置与状态 |
| --- | --- |
| 客户登录 | 原有 Supabase `auth`；账号、登录页和客户密码继续沿用 |
| 活动、报名、会员资料 | 原有 `public` 表；商城角色无这些表的读取或写入权限 |
| 商品、规格、价格、库存、购物车、订单、履约、退货 | 私有 `commerce` schema，147 张 Medusa 核心和关联表已创建；含 20 张实际验证存在的跨模块关联表 |
| 商品草稿 | `commerce.product` 中 14 条，均为 `draft`；销售规格、价格、库存和订单均为 0 |
| 商品图片 | 同一项目 Storage `shop-products/drafts/`；14 张 WebP 商品照片；不上传含人民币价格的图册页面 |
| 会员订单读取和地址 | 原有新增的 `public.shop_member_orders`、`public.shop_shipping_addresses`；普通会员只能访问自己的记录 |
| 退换货申请、审核、回复和退回追踪号 | 私有 `commerce.snowforce_after_sales`；新增 1 张申请表，顾客通过本人订单 API 访问，内部备注仅后台可见 |
| Stripe 退款最终状态核对 | 私有 `commerce.snowforce_refund_verifications` / `snowforce_refund_verification_history` 两张表；最近结果和追加历史，仅后台服务可访问，不放进顾客可读订单 metadata |
| 商品税务分类管理 | SnowForce product tax 页面已实现；在私有 `commerce.store.metadata.snowforce_tax_classifications` 按商品保存官方分类、未税方式、内容指纹及版本审计。14 个草稿尚未由经营者审核分类；计税 Provider/报价/税账未接入，详见 [分类管理](shop-product-tax-classifications.md) |
| 商城政策与购买条款 | 草稿、发布历史与审计回执仅在私有 `commerce.store.metadata.snowforce_shop_policy`；顾客只读已生效投影。签名购买条款在付款前保存到 cart metadata，随原生订单创建复制；代码已接通，客服邮箱已保存于政策草稿，正式主体待填写，尚未发布 |
| 取消付款恢复 | 服务端逐一 Stripe GET 核实后，短事务更新必要的 session 取消状态，并退役当前 cart-payment collection 关联；会话和关联历史保留，不新增表、不改 provider data 或金额 |
| 持久付款尝试 | 原生 payment_session 保存 pending 创建标记及报价/环境绑定，再用相同 ID 幂等创建 PI；超时保留本次尝试，超过窗口需人工核对，见付款创建与重试文档 |
| 后台付款异常核对 | `SnowForce payments` 先 GET Stripe 再经管理员确认，将原 PI 条件关联到原会话。请求 UUID、管理员与事实指纹审计在 `payment_session.metadata.snowforce_payment_association`；不新增表或发起金融操作 |
| 顾客购买条款与期限 | 本人订单售后读取核实签名、order_cart 与原发布历史，提供公开政策和日期投影；会员订单显示完整原条款、分包申请期限及批准后交运截止日，缺证进入人工核查，不新增表或泄露内部备注 |

店铺币种初始化为 USD；原生后台默认 EUR 已被替换。商品没有发布，也没有从图册推测真实 SKU、库存或售价。原生后台的商品、价格、库存与订单管理使用数据库记录；草稿导入清单仅用于首次导入，重复导入保留运营人员修改。

后台运营账号使用 Medusa 原生 staff 登录，客户使用现有 SnowForce 登录。已实现客户 Supabase provider：验证真实访问 token、已确认邮箱、会员资料与当前隐私同意，使用不可变 Auth UUID 关联身份；不根据同邮箱认领客户。创建客户的接口受身份验证与锁保护。购物车和结账都使用原会员登录页并保留返回路径；实际会员登录、持久购物车与支付仍需端到端联调。

## 前台与购物车数据链路

首页商城板块、`/shop` 和商品详情已改为服务端读取 Medusa Store API。只显示已发布商品，品牌和 SKU 由后台记录产生；不再向顾客展示代码图册中的参考价格。原图册目录仍作为首次草稿导入来源，不参与交易计算。当前 14 个商品全部为草稿，真实页面显示“新品即将上架”，首页保留商城入口与品牌视觉。

价格使用美国 USD region 的 `calculated_price`，按 Medusa 的美元主单位金额读取，包含原价与活动价；缺少 USD 价格不会转算人民币或其他币种。规格来自实际 variant/options；缺货、未匹配或重复匹配规格无法加入购物车。库存来自原生 `inventory_quantity`，更新时再由 Medusa 工作流核验。配置好的库存关闭或允许预订选项按后台规则处理，不推测现货数量。

购物车保存于同一 Supabase 的 `commerce` 表，浏览器不存商品价格或库存。Next 服务端操作仅接收规格 ID、行 ID 与数量；拒绝客户端金额、客户 ID 或购物车 ID。签名 HTTP-only cookie 绑定 Supabase 用户 UUID，服务端每次重新验证现有会员身份，并检查 Medusa 购物车的真实 customer 归属。已完成的购物车、他人行项目和非 USD 金额均拒绝。前台只取得必要购物车快照，不取得 Supabase/Medusa token、数据库连接串或购物车 customer ID。

根目录被 Git 忽略的 `.env.local` 已加入 `MEDUSA_BACKEND_URL`、`MEDUSA_PUBLISHABLE_KEY`、`SHOP_CART_COOKIE_SECRET`。运行 `npm run configure:storefront` 可从已关联默认销售渠道的原生公开 key 补齐缺失配置，保留已存在的值；数据库查询只读、密钥不输出。正式部署须把连接改为实际 HTTPS 商城服务地址，独立保存购物车签名密钥；数据库初始化管理员连接不进入前台运行。

实际仓库、48 州加 DC 配送区域和原生运费已按经营者确认建立；美国销售 region 和税务配置仍待完成，没有推测税率。真实销售规格尚不存在，不能把测试中的固定数据当成已验证的真实交易。购物车现已链接到 `/shop/checkout`，结账代码包含地址、原生配送费用、税费和 Stripe Payment Element；配置不完整时仍阻止付款。

## 结账与支付代码状态

2026-10-02 新增 **SnowForce tax setup** 只读核对页。实际 Stripe 测试 Tax Settings 为 pending、登记 0，经营地址未完成；两名指定管理员读取 200、匿名 401。准备付款、锁内准备和原生完成 hook 现会完整读取有效登记与设置，加锁期间变更会拒绝付款，恢复取消付款不受该条件限制。登记数据仍在 Stripe，没有新 Supabase 表或设置写入。详细状态见 [税务核对](shop-tax-setup-review.md)。分币金额模型已通过真实 Medusa Cart/Order 数学验证，但尚未应用到实际购物车、报价账本、成交税账或原生部分退款；不能视为可上线收款，见 [候选金额适配](shop-tax-amount-model.md)。税务确认仍为 false。

结账服务端重新验证当前会员和购物车归属，仅支持 USD、仅包含美国的 region 和美国收货地址。地址、配送方式与税费由原生 Medusa 工作流计算；顾客不能传入金额或其他客户的购物车 ID。选择的运费必须与当前可用配送记录一致，编辑地址后须先保存再进入付款。

付款使用独立商城 Stripe provider `pp_stripe_stripe`，显式设为 `capture: false`：先授权，再由商家按业务流程捕获款项。Stripe.js 通过官方 Payment Element 收集支付信息；客户端确认支付之后由后台完成原生购物车并读回所属订单，浏览器状态或回跳参数不能作为订单已付款的依据。

支付前的报价指纹绑定商品、数量、价格、客户、收货地址、配送和税费。后台加锁复核当前报价与 payment collection/session 金额、币种和 provider；重复提交恢复同一原生支付 session，避免重复创建 intent。付款开始后冻结购物车编辑，原生工作流锁内还会复核该约束；原生直接删除与直接创建 payment collection 的 Store API 路径已阻止。Webhook 完成订单也经过同一结账校验 hook。

新增“检查付款状态”流程：付款 `error` 仍冻结购物车，只有服务端确认已取消、零到账、零可捕获金额且没有原生授权/Payment/订单记录，才条件更新本地状态并恢复编辑；失败时保留锁定。前台检查时移除旧 Stripe 表单和本次条款勾选，继续有效付款或重新确认当前条款；正在确认付款时禁止恢复。专用角色源码事务回滚验证通过，详见 [取消付款恢复](shop-payment-recovery.md)。

SnowForce 付款创建已替换原生删除/补偿路径：原生 session 先持久化，Stripe POST 复用其 ID，随后 GET 当前状态并条件采用。取消后的旧 collection/session 与关联历史保留，仅退役当前关联，使购物车重算不删除或重建这些记录。超时、凭据变化和过期人工核对限制见 [付款创建与重试](shop-payment-creation.md)。隔离测试和实际 SQL 回滚验证通过，但尚无真实 Stripe Sandbox 授权、订单、取消重试、重复 webhook 或退款演练。其他原生后台手动付款操作、会员订单投影和售后链路仍需实际验收。生产使用 TLS Redis 锁和事件队列；开发内存锁不作为生产并发验收依据。

本机三个 Stripe 设置现已填写：运营人员提供测试 API 密钥和公开密钥，代理使用该测试 API 密钥取得本地 CLI 签名密钥，直接保存到后台 `.env.development`，不打印完整值。测试事件转发已启动，返回的签名密钥与保存值一致；后台重新加载后，数据库可见 `pp_stripe_stripe` provider，购物车和订单仍为 0。原有活动付款配置未复用。取得步骤见 [商城 Stripe 测试配置](shop-stripe-setup.md)。实际税务配置须确认并设置 `COMMERCE_TAX_POLICY_CONFIRMED=true` 后才允许开始支付；三个设置填写完成不代表真实付款已经验收。

## 数据库连接与权限

`snowforce_commerce` 是商城专用登录角色，只拥有 `commerce`。已验证：无超级用户、创建数据库、创建角色或绕过 RLS 权限；不能在 `public`、`auth` 创建对象；不能读取或写入原有业务表。`anon`、`authenticated` 无 `commerce` 的 USAGE 权限。核心数据通过 Medusa API 访问，不开放到 Supabase Data API。

基础 SQL 位于 `supabase/migrations/20261001023718_shop_commerce_foundation.sql`，与远程记录版本一致。Medusa 自身迁移记录位于 `commerce.mikro_orm_migrations`、`link_module_migrations`、`script_migrations`；不能用 Supabase `db push` 随意重放其他本地迁移。

安装发现上游关联表 SQL 包含重复的 `CREATE SCHEMA`，需要数据库级 CREATE 权限；上游执行器又未抛出逐项失败。项目迁移工具仅去除已存在 `commerce` 的重复创建语句、补齐部分索引的 schema，然后事务执行官方表与索引 SQL、记录并逐张验证。它拒绝其他 schema、删除和已有结构变更，不扩大角色权限。将来升级版本时应重新审阅计划。

凭据只保存在被 Git 忽略的本地文件：

- 根目录 `.env.local` 的 `SUPABASE_BOOTSTRAP_DATABASE_URL`：一次性配置专用角色时使用的管理员连接；Medusa 运行不读取它。
- `services/commerce/.env.development` 的 `DATABASE_URL`：自动生成的商城专用角色连接，以及不同的 JWT、cookie 密钥。
- `DATABASE_CA_CERT`：Supabase 官方 CA，保持证书验证开启；本机使用 session pooler 5432，未使用 transaction pooler 6543。
- `services/commerce/.env.example`：只包含配置名称和非秘密示例。

最新只读连接检查确认：根目录 bootstrap URI 已填写真实密码，使用现有项目的 session pooler 5432，连接用户为 `postgres`，可见 147 张商城表；后台 URI 使用独立 `snowforce_commerce` 凭据，TLS 连接成功，仍仅有商城 schema 权限。本轮没有重置数据库密码、重新激活角色或修改数据库记录。

Supabase 的 **Reset database password** 修改数据库管理员连接密码，不修改客户 Supabase Auth 密码。连接串在项目 Connect → URI / Session pooler 中获取，用实际数据库密码替换 `[YOUR-PASSWORD]`。重置后更新其他仍使用旧数据库密码的服务。已生成的商城专用角色密码独立于该管理员密码。

## 本地运行

在 `C:\Project\snow-force\services\commerce` 执行。项目要求 Node 22.12+ 或 24；当前验证使用 Node 24。

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.cache/config'
$env:MEDUSA_DISABLE_TELEMETRY = 'true'
npm ci
npm run typecheck
npm test
npm run build
npm run dev -- -H 127.0.0.1 -p 9000
```

后台入口为本机 `http://127.0.0.1:9000/app`。它是独立服务；网站仍在 `http://127.0.0.1:3100`。经营者已指定 `snowforceclub@gmail.com` 和 `经营者指定的个人邮箱`，两个商城管理员已通过原生流程建立，并验证实际登录及管理接口权限。独立初始密码仅存于 Git 忽略且只授予本机 taiyu 用户访问的文件；入口、改密与范围见 [商城管理员与客服配置](shop-admin-access.md)。

日常改价、入库、发布应在 Admin 中进行。以下命令是初始化或维护工具，不能代替日常运营：

| 命令 | 用途 |
| --- | --- |
| `npm run migrate` | 按当前固定版本迁移核心表、严格验证私有链接，再执行原生搜索和数据迁移脚本 |
| `npm run export:drafts` | 从当前图册目录导出一次性草稿资料；不包含价格、库存或可售组合 |
| `npm run upload:draft-assets` | 上传缺失的本地商品照片并更新草稿清单；现有对象不覆盖；临时使用根目录服务端 Storage 凭据，不复制到后台 |
| `npm run import:drafts` | 按 handle 创建缺失草稿；存在的商品和运营改动保留 |
| `npm run setup:store` | 一次初始化 USD 和默认销售渠道访问；已初始化的店铺设置保留 |
| `npm run configure:storefront` | 只读取得原生公开 key，将缺失的本地前台连接和购物车 cookie 签名密钥写入根目录 Git 忽略环境文件；不覆盖现有配置 |
| `npm run setup:shipping` | 为已存在的实际美国配送区域建立运费；需配置真实 `SNOWFORCE_SERVICE_ZONE_ID` |
| `npm run setup:fulfillment` | 读取本地审阅过的仓库/覆盖清单，初始化实际仓库、退回地址引用、州级区域、渠道和手动配送；重复执行保留后台后续更改 |

首次专用角色配置已执行，`configure:database` 不会再次旋转现有活动角色或覆盖环境文件。

## 运费、发货与售后

已确认优惠后商品小计满 US$100 包邮，否则 US$9.95；税费、运费不计入门槛。后台扩展 `SnowForce 配送` 从 Medusa 价格记录读取费用和门槛，保存修改到数据库。995/10000 美分只用于首次初始化；后续读取不使用这两个常量。

Medusa 默认 item_total 含商品税，因此不能直接把原生 gte 价格规则当成未税包邮的最终计算。现已配置 snowforce_us_snowforce 自发货 provider；价格记录仍用于保存运营金额，由原生工作流计算价格时重新读取商品总额和商品税额，以两者之差核对优惠后未税金额。标准 Store 配送列表的定价上下文也使用相同净额，SnowForce 结账读取本人购物车的原生库存筛选与 provider 报价。付款和订单完成时再次核对实际配送范围、provider、计算模式及应收运费，旧费用或把税费计入门槛的报价无法付款。

真实仓库和退回地址：1 Park Plaza, #600 Office 44, Irvine, CA 92614, US。已保存 1 个原生库存位置、1 个 shipping fulfillment set、1 个 service zone 和 49 个州级 geo zone，覆盖美国本土 48 州及 DC，排除 AK、HI 和属地；已关联默认销售渠道、manual_manual 与上述自发货 provider，并建立 1 个 calculated shipping option。自发货不自动购买运单。店铺 metadata 仅保存 native location / zone ID；地址、覆盖和运费日常从数据库读取，在 Admin 仓库与配送设置中修改。

初始化清单位于 Git 忽略的 services/commerce/.data/fulfillment.json，设置 SNOWFORCE_FULFILLMENT_MANIFEST 后执行 setup:fulfillment。重复执行已核验保留记录，不能用清单覆盖日常后台修改。setup:shipping 可从店铺 metadata 读取 zone ID，不再必须通过环境变量指定。

付款及原生完成订单 hook 重新读取所选配送方式的实际 geo zone，拒绝不覆盖当前地址的旧报价或 API 请求。订单发货由运营人员在原生 Admin 创建履约、交运并登记承运商与追踪号；自动物流回调尚未接入。

已生成双语 [配送与退换货政策草稿](shop-shipping-returns-policy.md)：建议送达后 30 天申请、批准后 14 天交运，区分个人偏好和质量问题费用。商城 Admin 的 `SnowForce policies` 编辑页（`/app/snowforce-policies`）支持主体、客服邮箱、期限、预计时效和双语文案，已接通已保存草稿的明确审阅与立即发布。数据保存在同一私有 `commerce.store.metadata.snowforce_shop_policy`，采用事务行锁、版本 CAS 和请求 UUID 幂等，只更新这一键，不覆盖仓库或配送 metadata。公开 `/shop/policies` 只读已生效投影；结账需同意当前版本，后端签名快照在付款前持久化，并由原生订单创建复制、原生完成 hook 再验证。真实角色源码回滚测试通过；当前已永久保存客服邮箱草稿，未发布政策。两个管理员已完成真实 HTTP 登录及管理接口验证，但尚未由经营者在浏览器完成政策发布，也没有实际付款订单。操作、数据和边界见 [政策发布与订单条款](shop-policy-publication.md)。管理员需用正式运营账号登录，顾客继续使用现有 Supabase 账号。

政策草稿尚未公开发布。售后批准已按购买政策快照与送达记录校验普通退换货期限，超期或证据不完整时需要管理员明确批准例外并说明原因；质量问题与错发不自动按期限拒绝。批准后的交运期限可显示，实际交运证据仍需核查，详见 [退换货期限审核](shop-return-window.md)。经营者指定的客服邮箱 `Shop@snow-force.com` 已保存于政策草稿，revision 为 1；正式销售主体名称仍待确认。经营者反馈加州 Seller’s Permit 状态“不确定”；[销售税实施方案](shop-sales-tax-plan.md) 已明确 Stripe Tax Provider 只是适配层，需同时解决逐行分币税额、包邮固定政府费用、持久账本、实际捕获和退款最终状态对账。当前尚未实施税务账本或计税，也没有开启税务确认付款开关。

会员订单详情已加入退货/换货申请、审核进度、顾客回复、待审核撤销和退回追踪号。提交和批准均核对本人订单及实际已送达、待退、已退和报损数量。请求 UUID 支持重试，每笔订单同时仅允许一个进行中申请。原生游客直接发起退货的接口已阻止，避免绕过审核。申请和批准都不直接退款或增加可售库存。

Medusa Admin 新增 `SnowForce returns`：按状态分页审核、填写顾客回复及内部备注，批准后在原生订单工作区创建对应退货或换货。关联核对订单、类型、商品、数量、创建时间及重复使用；收货、库存、退款和换货发货由原生后台执行。完成申请前再次核对原生全部收货、账款差额归零及换货商品送达。操作步骤见 [退换货操作与数据方案](shop-after-sales.md)。完整浏览器联调仍待实际经营资料。

迁移 `20261001073705_shop_after_sales_requests.sql` 已应用并与远程版本一致。私有申请表属于现有商城角色；RLS 和表/函数 ACL 阻止匿名、普通会员及主站 service_role 直接访问。归属和申请内容不可更改，版本必须递增；触发器保存顾客可见历史，内部备注不进入该历史。

## 会员订单同步的数据方案

Medusa 私有 `commerce` schema 是订单、支付、履约和库存的源数据；`public.shop_member_orders` 仅供现有 Supabase 会员读取订单摘要。订单不是从产品当前售价重新计算，而是读取原生订单的商品、金额、收货地址和包裹快照。顾客继续使用同一 Supabase Auth UUID，不需要另一套登录账户或界面。

后台根据 `commerce.provider_identity` 中 Supabase provider 的不可变 `entity_id` 关联会员 UUID；不使用邮箱或顾客可编辑 metadata 决定归属。结账完成与会员订单详情读取会重新校验本人订单并同步；后台原生下单、付款扣款/退款、创建履约、交运、送达和退货/换货事件也会读取最新订单后发送同步通知。

通知通过 HMAC SHA-256 和五分钟签名时间窗口验证，限制实际请求体大小；生产要求 HTTPS。共享的 `COMMERCE_ORDER_SYNC_SECRET` 分别设置在主站和后台的服务端环境中，后台的 `SNOWFORCE_STOREFRONT_URL` 指向主站 origin。两个设置都不属于浏览器公开变量。Medusa 不持有主站 Supabase service key，也没有 public/auth 表权限。

主站用既有服务端 Supabase client 调用 `shop_sync_member_order`，原子写入投影。函数为 SECURITY INVOKER，仅 service_role 可执行；普通会员和匿名角色均不可写。每订单事务锁保护不可变 owner，按 Medusa version 和抓取时间拒绝旧通知覆盖。顾客仍由原有 RLS 读取自己的订单。

本次单一迁移为 `20261001063635_shop_order_projection_sync.sql`，本地文件已对齐远程版本。新增 `credit_cents`、`rounding_cents`、`native_version`、`payment_status`、`fulfillment_status`、`source_observed_at`；保留原有表和读取 policy。金额使用整数美元美分，保留原生抵扣/退款调整及舍入；商品分配金额总和必须等于商品小计。付款和物流分别保存，部分退款不会显示为全额退款，创建物流标签不会显示为已发货。会员页增加部分配送、已退回数量和金额调整说明。

目前 commerce 订单与会员投影均为 0。回滚式数据库验证证明重复、旧版本、旧时间通知、金额错误、本人/他人读取和无权限写入均受控，所有验证写入已回滚。完整 Stripe 测试订单、后台发货/退款、事件丢失重试及生产 Redis 仍需端到端验收。此实现不代表商城可上线收款。

## 上线前仍须完成

| 工作 | 退出条件 |
| --- | --- |
| 管理员入口与产品编辑 | 实际账号进入后台；用户填写真实 SKU、美元售价与库存，再发布；中英文资料可编辑并正确显示 |
| 真实商城前台 | 已改为原生商品、价格、库存和购物车；仍需用户填写并发布实际商品后，验证从后台改价、入库到前台购买的完整流程 |
| 身份联调 | 现有邮箱、Google、邮件登录返回结账；他人订单、过期与退出身份无法访问；并发客户关联不重复 |
| 仓库与配送 | 实际仓库、48 州 + DC 与费用已初始化；优惠后未税金额、含税误判保护及 99.99/100.00 运费边界已验证。真实 Tax API 计税仍待实施，仍须后台真实账号改价、实际商品/购物车与发货流程端到端验收 |
| Stripe 测试支付 | 独立商城 provider 与 webhook 配置；成功、失败、重复、缺货、取消以及退款完整演练；不影响活动支付 |
| 订单与售后 | 商品/金额/收货快照、本人订单投影、部分发货、追踪链接、在线退换申请与审核同步一致 |
| 长期服务 | Medusa server/worker、TLS Redis、HTTPS 域名与访问控制、告警、备份恢复经过实际验证 |
| 持久图片上传 | 现有 Supabase Storage S3 凭据填写并实际验证 Admin 上传与删除；生产禁止仅依赖本地临时文件 |
| 经营政策 | 税费配置、处理时效、退货地址、期限和费用规则经运营确认；不自动假设零税费或任意退货期限 |
| 依赖与构建 | 主站 Next 16/React 19/Vitest 5 已通过 935 项测试、全量 lint/类型/构建和既有依赖审计；后台最新 197 项测试及完整后端/Admin 构建通过；正式部署仍需环境与浏览器联调，跟进 Next lint 插件对 ESLint 的维护版本支持 |

当前运行仍使用开发内存事件总线和锁；生产 preflight 要求 TLS Redis、CA、明确 HTTPS origins、S3 上传、确认实际税务设置和独立 Stripe provider/webhook 配置，缺失时拒绝启动。Supabase Dashboard 已显示配额宽限期结束的提示；数据库读取当前正常，正式上线前仍需核对实际用量，未自动升级付费套餐。

依赖升级前，主站审计报告 17 个漏洞（含 3 critical）。2026-10-01 升级后保存的最终报告已为 0，商城后台报告也为 0；主站现为 Next 16.3.8 / React 19.3.0 / Vitest 5.0.3。本轮恢复功能没有改变依赖。报告位置为 `output/shop-launch-root-audit-final-20261001.json`、`output/shop-launch-commerce-audit-20261001.json`；后续发布仍应按实际 lockfile 重新审计。

## 验证记录

最新顾客条款阶段：主站 935 项测试、coverage、完整 lint/类型/构建通过；后台 197 项测试、typecheck、完整后端/Admin 构建和串行 coverage 通过。窗口及原购买政策服务为 100% 行 / 98.46% 分支覆盖率，真实专用角色的原关联/政策只读检查通过。订单/申请仍为 0，其他运营状态未改变；没有金融操作、政策发布或产品发布。详见 [顾客购买条款](shop-member-purchase-terms.md) 和 [商城验证记录](shop-verification.md)。

此前付款核对与客服入口阶段：主站 928 项测试、coverage、完整 lint/类型/构建通过；后台 195 项测试、typecheck、完整后端/Admin 构建和串行 coverage 通过。核对服务为 100% 行 / 93.39% 分支覆盖率，两个实际管理员的新接口权限及真实 SQL 回滚检查通过；所有临时记录回滚，0 cart/session/payment/order/refund，14 草稿、0 发布商品、2 管理员、未发布政策。政策页与订单客服入口使用 Shop@snow-force.com，生效政策优先。没有真实 Stripe 调用或金融操作。后台步骤见 [付款异常核对](shop-payment-operations.md)，真实交易、税务和生产部署仍需完成，见 [商城验证记录](shop-verification.md)。

此前持久付款阶段：主站 925 项测试与完整 lint/类型/构建通过；后台 174 项测试、typecheck、完整后端/Admin 构建和串行 coverage 通过。付款创建为 100% 行 / 97% 分支覆盖率，实际专用角色与验证 TLS 的源码 SQL 回滚检查通过；所有临时记录回滚。没有真实 Stripe 调用或金融操作。

此前退换货期限阶段：主站 925 项测试、覆盖率、完整 lint/类型/构建通过；后台 158 项测试、typecheck、完整后端/Admin 构建和覆盖率通过。期限与购买政策验证为 100% 行/分支覆盖率。实际认证入口和私有查询列已核实，仍为 0 订单/售后申请、2 管理员和未发布政策草稿；真实交易与交运证据不能由隔离测试替代。完整记录见 [商城验证记录](shop-verification.md)。

此前取消付款恢复阶段：主站 150 文件 / 925 项测试与覆盖率通过，完整 lint/类型/构建通过；商城后台 139 项测试、typecheck、完整后端/Admin 构建与串行覆盖率通过。恢复服务为 99.42% 行 / 96.00% 分支覆盖率，原生锁内编辑校验为 100% 行 / 分支。专用角色验证 CA 的 TLS 源码回滚测试通过，所有临时记录已回滚；没有实际 Stripe 调用或金融操作。该阶段读取为 14 草稿、0 规格、0 库存、0 cart/session/order/refund、0 staff、0 USD region；随后已建立两个实际管理员并保存客服邮箱草稿，见上方配置说明。匿名恢复接口为 401；本地 /health、/shop/checkout 和 /shop/policies 为 200，浏览器结账页使用原会员登录入口。实际交易、后台产品编辑与发布验收、税务及生产部署仍未完成，完整记录见 [商城验证记录](shop-verification.md)。

此前退款核对阶段创建的两张私有资金观察表和单一迁移版本已经核实；售后完成除原生收货和账款差额外，还实时核对 Stripe 捕获及成功退款金额，未完成或不一致时拒绝关闭。具体边界与限制见 [退款最终状态核对](shop-refund-verification.md)。

以下订单同步检查为此前阶段记录：主站 137 个文件 / 825 个测试、构建与覆盖率通过；商城域行覆盖率 99.37%、分支覆盖率 91.74%，订单同步、签名、契约与订单仓库为 100% 行覆盖率。后台类型检查、52 个隔离测试与完整构建通过；串行 Node 覆盖率检查 52 项通过。实际 `/shop`、`/member/orders` 和后台健康为 200；匿名订单读取和无签名同步为 401，签名正确但无合法订单内容的同步为 400。数据库回滚验证通过，本地/远程迁移版本一致，业务订单仍为 0。Chrome 验证仍使用原有会员登录界面，订单详情设计预览未写入真实账户。真实交易端到端验收仍未完成。详见 [商城验证记录](shop-verification.md)。

以下为后台核心初始化阶段记录，保留作为历史证据：

数据库读回：147 张商城表全部归专用角色；20 条关联迁移记录全部对应实际表；14 条草稿、14 张图片；0 规格、0 售价、0 库存、0 订单。`public` 仍 33 张表、`auth` 仍 27 张表；无同名核心表落入 `public`。专用角色数据库 CREATE 仍为 false。

后台类型检查与 30 个测试通过，覆盖配置加载、权限配置、UUID 身份与同意门槛、并发身份、草稿保留、图片导入、私有链接验证、币种初始化与运费规则。安全审计发现 lodash、ajv、uuid 的间接依赖问题后固定到修补版本；安装复查为 0 个漏洞，Medusa 版本保持 2.21.2。公告：[lodash](https://github.com/advisories/GHSA-r5fr-rjxr-66jc)、[ajv](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6)、[uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq)。

Supabase Security Advisor 无新增商城告警；原有 4 条 RLS 无 policy 信息和 Auth 泄露密码保护未开启提示仍在，未改变现有认证设置。

主站全套测试 124 个文件 / 753 个测试、构建与覆盖率检查通过。商城域逻辑行覆盖率 99.67%；新身份适配 100%，传输适配 95.91%。后台构建与 30 个测试通过；Node 覆盖率检查的已导入代码行覆盖率 71.86%，身份与会员门槛逻辑均 100%；原生 HTTP 路由、完整支付与业务运行脚本仍需结合后续端到端验收，不能把此覆盖率当作完整交易验证。

实际本机 HTTP 检查：`/health`、`/app` 为 200；匿名管理扩展和客户关联接口为 401；私有 schema Data API 请求为 406；商城 Store API 为 200 且公开商品数为 0。Chrome 实际显示 `/app/login` 的后台登录界面，等待管理员账号建立。14 个 Storage 图片链接均通过 HEAD 检查，返回 200 和 WebP 类型。重复导入结果为 0 创建、14 保留。线上网站首页与活动页仍为 200。

`git diff --check` 通过；新后台 35 个源码、配置和清单文件无行尾空格；后台环境文件已验证受 Git ignore 保护。日志位于 `output/shop-commerce-next-tests.log`、`shop-commerce-next-build.log`、`shop-commerce-next-coverage.log`、`shop-commerce-backend-build.log`、`shop-commerce-backend-coverage.log` 与 `shop-commerce-migrate.log`。既有 React 测试适配、Vite CJS 和 `<img>` 提示仍保留，未跳过或压制测试；本地 Medusa 开发内存总线提示对应尚未配置的生产 Redis。

此阶段代码与迁移文件仍未提交，未部署服务、收款、发送邮件或购买物流面单。“核心表已写入”不代表完整交易链路已具备上线条件。
