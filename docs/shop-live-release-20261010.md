# 正式收款发布进度

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
