# 正式收款发布进度

## 2026-10-15 已批准的正式配置与恢复验收

经营者已确认临时许可 2026-10-07 至 2027-01-04，并批准政策草稿 revision 4 发布。生产读回正式政策版本 5、经营税务 active revision 6，绑定正式 Stripe 账户、Irvine 仓库和政策 5；CA 仍为唯一登记州。独立正式 goods webhook 已启用。

生产 commerce 加密备份恢复已通过：169 张表、2,686 行，以应用角色逐表核对数量和数据摘要。本机恢复数据库已清理，加密备份保留在经营者明确授权的 OneDrive 项目目录，密钥由 Windows DPAPI CurrentUser 保护。范围不含 Auth、public schema 或对象存储，未建立自动异地备份。

已获授权的 Redis 原地重启暴露旧脚本的临时目录重复创建错误，先用现有镜像恢复服务，再修改启动脚本为幂等创建并限制目录权限。源码 `45d852a` 已提交、推送并部署到 Redis；再次原地重启成功载入原卷 AOF 并恢复 TLS，后台 health 200。测试前没有未完成的资金/税务队列或持久工作流，未宣称验收非空交易任务的中途恢复。证据：`output/incidents/2026-10-15-redis-restart-recovery.json`。

前台 1,032 项、后台 649 项完整测试、前台覆盖率、后台启动回归检查、独立类型检查及两端构建通过，GitHub run `38695966973` success。应用业务源码仍为 `30ff27a`，本次只修改 Redis 启动脚本及回归测试。

正式付款已开放：经营者确认发布后，Railway 已应用 `COMMERCE_OPERATING_MODE=sales`、`COMMERCE_TAX_POLICY_CONFIRMED=true`、`COMMERCE_REFUND_EXECUTION_ENABLED=true`，后台部署 `318bbbff-341e-4dda-aeee-3a384873d3a7`（源码 `080508e`）SUCCESS。后台应用业务代码与 `30ff27a` 相同；网站部署仍为 `299021b6-fde0-4fcd-aa1f-cbe01e42cb09`，Redis 为 `e970f8ae-cb8d-4fe3-b723-1c33c6b20b17`。三个服务在线，环境没有待发布变更。

正式会员浏览器已从原购物车打开结账，显示配送、免费预约自提、政策版本 5；后台实际 Stripe Tax 核对为 live、CA active、经营者确认已记录、付款运行开关已开启。Railway 网站实际公开公钥摘要与此前同账户配对验证一致。真实购物车数量已完成 1→2→1，两次原生更新 HTTP 200，最终仍为一件 US$499，可售库存仍为 15。

使用实际应用 `createStripeTaxQuoteWriter` 与正式 restricted key 成功创建 Irvine 临时报价，商品 49,900 美分、配送 0、税 3,867 美分、总额 53,767 美分。此为临时报价，无客户订单、付款或 Tax Transaction；不将其表述为原生购物车报价或正式成交。证据：`output/incidents/2026-10-15-live-tax-creation-preflight.json`。

正式 goods webhook 为 enabled。已通过 Stripe CLI 重发此前正式密钥配对探测中未付款且已取消的真实 Stripe 事件；事件无 Medusa 支付会话，回调 HTTP 200，后台记录两名业务订阅者处理。正式容器只读 Redis stream 确认任务 591 已 completed，随后队列 drained，无失败重试；因此核对了真实 Stripe 投递、异步签名处理和外部非 Medusa 事件安全忽略。正式库订单、付款和成交税账仍为 0。本次没有正式扣款；真实授权、捕获、发货/领取和退款/税务冲销的资金验收使用独立 Sandbox，保持其范围边界。

## 2026-10-14 购物车修复与预约自提验收

购物车故障已在正式环境修复。HTTP 200 是 Next.js Server Action 的传输状态；原先隐藏的 Medusa 错误是 management 模式禁止销售操作，随后还发现原生新购物车的空地址字段与校验不兼容。这些问题已分别修复并部署，未通过调整真实库存或商品售价绕过。正式雪板仍为 US$499，库存 15、预留 0；正式结账开关尚未开启。

经营者选择“先联系客服预约，再在网站选择自提并付款”。新增免费预约自提：服务端限定现有默认 Irvine 仓库、销售渠道和配送模板，地址及 US$0 费用由后台提供。顾客只提交姓名、电话和已预约确认；签名记录绑定购物车、会员、区域及自提地点，报价、付款与订单投影均复核。切回配送会撤销旧报价；会员订单区分备货、可自提和已领取。

已在隔离本地原生 Medusa、真实 Stripe Sandbox 与网站浏览器完成两笔订单：纽约配送商品 US$499、运费 US$0、税 US$0；Irvine 自提商品 US$499、自提 US$0、加州税 US$38.67、合计 US$537.67。两笔均经真实测试支付授权、webhook 建单及后台全额捕获。自提还完成备货与领取，未建立承运商发货；会员领取后的售后入口和 30 天期限已核对。正式订单与资金均未变动。临时 Supabase 会员、隐私记录及两笔测试订单投影已精确清理，临时会话已撤销，未发送测试邮件。

证据在 `output/incidents/2026-10-14-browser-*.jpg`、`2026-10-14-browser-*-capture.json`、`2026-10-14-browser-pickup-collected.json` 与 `2026-10-14-browser-fixture-cleanup.json`，均未纳入源码提交。前台 1,032 项完整测试、覆盖率及生产构建通过；后台重点覆盖率和独立类型检查通过。生产政策草稿为 revision 4，包含预约自提流程，尚未发布；税务经营配置草稿 revision 3 尚未激活。

后端最终 648 项完整测试及生产构建均通过，自提验证模块重点覆盖率为 98.67% 行、95.83% 分支；税务设置模块为 100% 行、96.46% 分支。后台税务核对页面也已修正旧的“仍在接入”提示，读取实际付款运行开关，并明确每笔订单仍需独立核验。

经营者已确认无以往线上或线下销售、无其他州人员或仓库，目前仅保留 California 登记；已确认自提免费、每笔 US$9.95 付费配送的第三方实际运输成本不低于收费并保留凭证，四个已发布商品税码已审核。仍须核对临时许可的 2026-10-07 至 2027-01-04 日期，并最终审阅政策 revision 4；生产备份恢复和持久化队列恢复验收仍待落实。以下保留 10 月 10 日历史记录，不能据此认定当前正式收款已开启。

2026-10-10，经营者授权开启正式收款，并提交、推送到 `main`。

商城动态导航、原生订单/库存、完整捕获、后台退款执行和税务冲销已完成开发及实际 Sandbox API 联调。合并保留远端密码恢复修复后，前台 984 项、后台 582 项完整测试及两端生产构建全部通过，前台覆盖率检查通过；提交扫描未发现真实密钥。Sandbox 完整证据见 `output/shop-native-sandbox-acceptance-20261010.json`。

正式 Snow Force Club 账户的 Stripe Tax 总部已核对为 Irvine、状态 active。已依据经营者提供的现有 California 临时 seller’s permit 添加 Stripe sales-tax 记录，登记 ID 为 `taxreg_1UP4kIAItQQT9la8Mob6cEej`、livemode=true、active。记录在 2027-01-05 00:00 America/Los_Angeles 停止生效，以覆盖许可所示截至 2027-01-04 的有效期；持续许可取得后需要更新有效经营资料。此操作记录已有许可，没有申请新的政府许可。

正式收款尚未开启。经营者已填写正式 Restricted key 和 publishable key，服务器密钥核验属于 Snow Force Club 正式账户 `acct_1ToZcEAItQQT9la8`，该账户允许收款和出款。通过一笔未付款的正式 PaymentIntent 核验前端密钥可读取同一记录，随后取消；实际收到资金为 0。证据为 `output/shop-live-key-pair-preflight-20261010.json`。

Railway 商城后端已保存正式 API key 和独立 webhook signing secret，网站服务已保存商城 publishable key，新版本均已部署成功。商城独立正式回调 `we_1UP5DYAItQQT9la8bScU5Pfc` 指向 `/hooks/payment/stripe_stripe`，订阅原生支付和退款所需事件，目前 disabled；销售模式接收端验证后启用。原有活动报名回调保持运行。证据为 `output/shop-live-webhook-preparation-20261010.json`；凭证仅存受保护文件和部署变量，不进入源码或证据。

七个已通过 Sandbox 验证的正式数据库迁移已应用，并核对私有退款表、RLS 和原生账本守卫。MCP 应用时生成的远端版本与源码时间戳不同，映射如下；不能直接按本地时间戳重复执行。

| 源码版本 | 已应用远端版本 | 名称 |
|---|---|---|
| 20261009043348 | 20261010181904 | shop_single_full_capture |
| 20261009052229 | 20261010181910 | shop_refund_allocations |
| 20261009170338 | 20261010181911 | shop_refund_tax_outbox |
| 20261009220808 | 20261010181912 | shop_refund_execution |
| 20261009224620 | 20261010181913 | shop_tracked_refund_continuation |
| 20261009230429 | 20261010181914 | shop_after_sales_refund_completion |
| 20261009233013 | 20261010181916 | shop_native_refund_bookkeeping_guards |

生产经营资料仍有发布门槛：销售政策为未发布草稿 revision 2，销售主体已保存为 CLN GLOBAL LLC，并移除消费者权利段落的主体占位文字；税务经营配置未激活，商品税码审核尚未保存。实际仓库为 Irvine，许可有效期为 2026-10-07 至 2027-01-04。运费税务分类须按实际取货方式核对，不能自动勾选已审核。

## 已确认的实际经营条件

经营者已确认按以下条件执行，仍需在后台正式发布后才对顾客生效：销售主体 CLN GLOBAL LLC（SnowForce），客服 Shop@snow-force.com；配送美国本土 48 州及 Washington, DC，商品优惠后满 $100 免标准运费，否则 $9.95；付款确认后预计 1–2 个工作日处理、交运后预计 3–7 个工作日送达。

顾客在送达后 30 天内申请，审核预计 2 个工作日内回复，批准后 14 天内交运；商品需未使用、未清洗且包装吊牌完整，室内试穿可接受。检查通过后预计 5 个工作日内按原商品优惠后实付金额向原支付方式发起退款，退适用销售税；个人原因承担退回运费、原运费通常不退。经核实的质量问题、错发或运输损坏按审批承担合理运费，整单因此退回时退原运费；不收补货费、不追补原包邮运费。首次同款尺码/颜色换货的标准寄出运费由 SnowForce 承担，换货依实际库存处理。购买前明确标注的 Final Sale 排除个人原因退货，但保留缺陷、错发及适用消费者权利。

批准后退回地址拟沿用现有仓库：SnowForce — Returns, 1 Park Plaza, #600 Office 44, Irvine, CA 92614, United States；现场退货需预约。发布时补足销售主体并移除“将在发布前补充”占位文字，保留消费者权利段落。

$9.95 已由经营者确认为仅配送运费。官方 Shipping 分类还要求配送可选，与现有“不提供自提”草稿存在适用条件差异；实际可否预约自提或自行安排取货及商品税码候选仍待确认，不能只凭收费名称认定分类已审核。

GitHub 连接器已安装到 Snow-force 组织，并由经营者保存 All repositories 范围。通过已授权连接器的 Git 数据接口完成正常快进推送，源码提交为 `c6f3ba3e61f1c64bf3c0e17a3f5422c500c2e01d`，父提交为远端既有密码恢复修复 `92ed3e3271671509f9b879462507390c67faa3ba`；本地 main 与 origin/main 已同步，保留旧本地提交备份分支和用户未提交文件。

GitHub Quality Gate run `38078926034` 已成功。Railway 后端部署 `a3db3707-4a51-40c1-9b37-a015c53857b9`、前台部署 `0dfbbb40-6bdb-4d77-a606-259644915a88` 均为 SUCCESS，源码均为 `c6f3ba3`；前台保留 main 自动发布及 CI 检查。后端处于 management 模式，正式税务确认和退款执行开关尚未启用。

已通过登录后的 Medusa 原生编辑器创建五个公共主分类 Men、Women、Kids、Ski & Snowboard、Accessories，并保存 Women → Ski Suits、Ski & Snowboard → Skis、Accessories → Bag & Backpacks / Hats。四个已发布商品分别关联到对应子分类，原背包分类 ID 与关联保留，14 个草稿商品未发布。线上浏览器已核验八个导航栏目、Accessories 两列菜单、手机端展开，以及 Hats $39、Ski Suits $268、Skis $499 的正确分类商品；雪板图片实际加载成功。菜单截图见 `output/shop-live-accessories-menu-20261010.png`。这些后台分类变动无需修改或重建前台代码。

上线继续步骤：经营者确认商品税码候选和实际配送是否可选后，发布一致的经营政策、保存商品税码和运费税务审核，激活正式税务配置，验证独立回调后启用销售及退款执行。完整前台浏览器购买与生产恢复验收仍需完成。已完成发布和分类浏览验证不能替代这些收款门槛。

Git 修复仅备份了无法下载的 OneDrive reflog 占位文件，保留原有提交历史和所有未提交工作。密钥、证件附件、商品素材及临时截图未加入此次源码提交。
