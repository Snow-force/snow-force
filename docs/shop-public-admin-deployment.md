# SnowForce 商城后台公网部署方案

部署检查更新：2026-10-04。价格核对日期见各方案来源，实际订阅页面为准。状态：SnowForce Railway 账户已升级 Hobby，GitHub 单仓库授权已生效，商城后台和私有 Redis 已上线。此前个人账户的空项目未用于部署。公网 API 与负责人登录后的管理界面已通过核验。Vercel 已保存商城读取配置，移除失效旧仓库连接后，重新连接被 Hobby 的组织私有仓库套餐限制拒绝，等待托管方案决定。当前目标为公网部署后完成完整测试，并提交推送到 main；此前已批准的计算费用上限继续保留。

本轮核对账户仍为 `snowforceclub@gmail.com`，工作区仍为 `snowforce-club's Projects`。用户已授权计算资源每账单周期 US$25 硬上限、US$20 邮件提醒；已在平台保存并回读确认。达到硬上限会停止工作区的计算服务，税费及现有 Vercel、Supabase 费用另计。截图为 `output/shop-railway-compute-budget-saved.jpg`。

GitHub App 访问范围由用户限定为 `Snow-force/snow-force`。两个服务均使用 `codex/commerce-public-admin` 分支的已检验提交 `30f671dec973d659fb47403122456686d318a7b7`，商城实例容量为 1 vCPU / 2 GB。新增 Redis 服务 `snowforce-redis`（`c8a53cb7-dac1-4c36-839c-6b429c22d5d1`）容量为 0.5 vCPU / 0.5 GB，挂载 `/data` 的 512 MB 持久化卷 `93488860-141b-41d4-927e-7a7a2e6941cd`。Redis 使用私有网络、TLS、密码认证和 noeviction；不创建公网 Redis 域名或 TCP 代理。

用户已授权将商城专用数据库连接、登录签名密钥、订单同步密钥、Redis 和 S3 凭据保存到该商城项目。用户自行生成并保存了 Supabase S3 访问密钥。S3 官方项目密钥可访问项目全部存储桶并绕过 RLS；Medusa 的图片配置固定为 `shop-products`，不能把此代码限制误称为密钥自身只有这个桶的权限。凭据只用于服务器，不包含数据库 bootstrap 连接或 Stripe 密钥，不提交 Git。

本轮 Redis 配置支持 `REDIS_CA_CERT`，同一证书校验覆盖管理员会话、缓存、事件、工作流和锁；私有 DNS 使用双栈解析。网站 954 项测试、构建与覆盖率通过；后台 397 项测试通过，类型检查及生产构建通过。Redis 初始化工具行覆盖率 100%、分支覆盖率 84.62%，实际 shell 启动脚本已验证缺失或畸形凭据时在监听前拒绝启动且不输出密钥。两个 Linux 镜像已在 Railway 成功启动。真实 Redis TLS 连接、错误密码拒绝、无明文监听、AOF 和 RDB 快照写入均已验证。管理后台重启后，专用验收草稿的价格、Irvine 库存和 Supabase 图片保持完整；测试草稿、库存项和上传图片已清理。Redis 自身重启恢复与异地恢复仍待单独演练。


## 当前公网入口与验收结果

- 管理员登录：[SnowForce 商城后台](https://snowforce-commerce-production.up.railway.app/app/login)。账号为 `snowforceclub@gmail.com`，使用现有管理员密码。
- 项目：[SnowForce Commerce](https://railway.com/project/026e1ce6-a125-422c-b29f-a44ee11bdac1)。托管身份已核对为 SnowForce 账户。
- 运行模式：`management`；付款、订单写入、退款及支付 webhook 仍关闭。没有上传 Stripe 密钥或执行真实收费。

| 核验 | 结果 |
| --- | --- |
| HTTPS `/health`、Admin 登录页 | HTTP 200；浏览器登录表单和资源能加载 |
| 未登录商品、库存管理 API | HTTP 401 |
| 现有 club 管理员密码 | 公网 API 登录与身份读取成功 |
| 原有商品 | 管理接口核对 14 件草稿；公开接口返回 0 件商品 |
| 临时验收草稿 | 创建尺码 M、US$25.99、Irvine 库存 3；保存与应用重启后读取均成功 |
| 商品图片 | 实际经 Medusa 上传到 Supabase，下载字节与原文件一致；应用重启后仍可读取 |
| 结账、购物车写入、Stripe webhook | 返回 `not_allowed`，明确为管理模式阻断 |
| Redis | 私网 TLS + 密码连接成功，错误密码被拒绝，`port=0`、`tls-port=6379`，AOF/RDB 写入成功 |
| 浏览器管理界面 | 负责人实际登录；临时草稿的 SKU、US$38.50、Irvine 库存 4 件及图片实际保存成功，刷新和 API 读取通过；临时数据已清理，原有 14 件草稿保留 |
| Vercel 前台连接 | Production 已保存 `MEDUSA_BACKEND_URL` 与商城公开读取用的 `MEDUSA_PUBLISHABLE_KEY`；旧连接已移除，现有授权可列出正确仓库，但 Hobby 无法连接组织私有仓库，尚未重新部署 |

最初云端样本：后台内存约 368 MB、Redis 约 10 MB，后台启动峰值约 710 MB。短时样本不能作为整月账单承诺；保留 2 GB 应用容量与 US$25 工作区计算硬上限。达到硬上限服务会停止。

Railway 当前 Hobby 的 Backups 页面明确：创建平台备份和 PITR 需要 Pro。本次未升级套餐。Redis 的 `/data` 持久化卷、AOF 与快照已经启用，但这些不能当作独立备份；恢复演练和异地备份方案须在销售上线前完成。Redis 云端宿主机还提示 memory overcommit 未启用；当前 `BGSAVE` 成功、AOF 写入正常，后续需结合负载与恢复测试核对，不能通过修改容器配置宣称已改变宿主机内核设置。

证据：`output/shop-railway-public-http-verification.json`、`output/shop-railway-admin-acceptance.json`、`output/shop-railway-public-admin-login.jpg`、`output/shop-railway-redis-persistence.jpg`、`output/shop-railway-backup-plan-limit.jpg`。以上记录不含登录密码、JWT 或平台变量值。

### Vercel 仓库连接待处理

现有 `snow-force` Vercel 项目（`prj_9HOG2P3lLvuKiv4h2NmAmjMh2Zxs`）的旧连接地址为 `Harrymeit/snow-force`，重新部署再次被拒绝，提示 `The provided GitHub repository can't be found`，没有产生新部署。已移除失效的旧仓库连接并保留项目配置，正在选择正确的现有组织仓库。当前线上部署仍为已核对的 `98e1ae9`。网站代码与本次发布分支中的 `src`、根目录依赖和环境模板相同；本次不部署本地未提交素材或其他工作。

此前准备的 GitHub App 授权页未代替用户提交。本轮 Vercel 已能通过现有访问列出现有组织仓库 `Snow-force/snow-force`，但连接该仓库被 Hobby 套餐拒绝：组织的私有仓库需要 Pro。当前项目保留配置、域名及既有生产部署，旧 Git 连接已移除，没有新部署；不将这个状态误称为网站前台已连接新后台。等待用户决定升级现有 Vercel 团队，或把前台连接另行安排。Pro 每月 US$20 平台费包含一个部署席位和 US$20 用量额度，额外席位、用量及税费另计，本次没有提交订阅。2026-10-04 核对依据：[Vercel Git 仓库限制](https://vercel.com/docs/git)、[Vercel Pro](https://vercel.com/docs/plans/pro-plan)。

确定方案后使用已验证代码重新部署，再核对公开商城草稿隐藏与后台数据联动。已有网站域名及会员 Supabase 登录继续使用原配置。本次只新增商城公开读取配置，没有向 Vercel 复制 Railway 的数据库、S3、Redis 或管理员签名密钥；购物车签名和订单同步生产密钥亦未新增。若后续出现新增权限授权，仍须由用户确认。

界面证据：`output/shop-railway-admin-products.jpg`、`output/shop-railway-admin-usd-form.jpg`、`output/shop-railway-admin-shipping.jpg`、`output/shop-railway-admin-policies.jpg`、`output/shop-vercel-commerce-env.jpg`、`output/shop-vercel-git-link-error.jpg`。合伙人在自己电脑上的实际培训和销售上线验收属于后续交接项。

交接提交前再次运行网站 954 项测试与构建，均通过。最初构建因 Next 扫描 `.data` 下受保护的部署临时凭据目录而返回访问拒绝；将本轮临时文件移至仍受保护、仍被 Git 忽略的 `.cache/railway-production` 后恢复，没有更改凭据权限或应用代码。PDF 按二进制保存，已核对 Git 中的字节与本地原文件一致；两份 PDF 的目录章节、可点击公网登录链接及渲染版面均已检查。最终构建记录为 `output/shop-cloud-handoff-root-validation.json`。

在迁移后的 OneDrive 目录再次完成网站 954 项测试与构建、后台 397 项测试、类型检查及生产构建。公网另有 31 项 HTTP 管理阶段检查通过。完整记录与仍未完成的项目见 [公网后台完整测试记录](shop-public-admin-test-report.md)，不能据本地构建或部分验收宣称所有部署要求完成。

## 目标与数据归属

你和合伙人在各自电脑的浏览器中登录 Medusa Admin，管理商品、颜色/尺码、美元售价、库存、图片和商城政策。合伙人使用现有 `snowforceclub@gmail.com` 管理员账号；个人管理员账号保留。密码通过你们自己的安全方式交接，本文不包含密码。

网站继续使用 Vercel。商城后台继续连接现有 Supabase PostgreSQL 的私有 `commerce` schema，使用商城专用数据库角色；商品图片使用现有 Supabase Storage 的 `shop-products` bucket。无需另建一套 PostgreSQL，也不需要让顾客重新注册：顾客登录仍由现有 Supabase Auth 处理，后台管理员使用 Medusa 的管理员登录。

首版公网部署使用 `COMMERCE_OPERATING_MODE=management`，并保持 `COMMERCE_TAX_POLICY_CONFIRMED=false`。商品、价格、库存、图片及政策编辑可以使用；顾客结账、支付 webhook、订单写入、捕获付款、退款和退换货处理写入关闭。管理模式不注册 Stripe 支付提供商，即使环境里留有旧测试密钥。开放销售需要另行完成支付、消费税、政策和订单流程验收。

## 新增后台费用从哪里来

现有前端网站继续部署在 Vercel，商品数据库和图片继续使用现有 Supabase。Medusa 开源自托管没有软件授权月费；新增账单来自运行它的计算资源，以及选择单独托管 Redis 时的资源费。

US$35 / 月是 Render 的一种托管组合报价：2 GB 后台 US$25，加持久化 Key Value US$10，并不是 Medusa 强制的最低费用。现有配置支持 `shared`，初期不必为了两个人登录管理就购买独立 worker 实例；也不必为商品数据库另购 PostgreSQL。Medusa 提供管理页面之外，还运行商品、价格、库存等 API 和后台任务，因此只托管管理页面的静态文件并不足够。

若优先减少现金支出，可以在一台 Linux 云服务器中同时运行 Medusa、Redis 和 HTTPS 反向代理，沿用已有 Supabase。DigitalOcean 的 2 GB / 1 vCPU 机器为 US$12 / 月，可作为初期管理模式的容量验证档；同机系统与 Redis 也占内存，目前未实测其是否足够，不能承诺它就是已验收的生产配置。4 GB / 2 vCPU 为 US$24 / 月，留出更多余量。备份、税费和超额流量另计，不因选择单机方案而放弃凭据隔离、HTTPS、Redis 持久化和图片持久化。

来源：[Medusa 开源仓库及 MIT 许可](https://github.com/medusajs/medusa)、[Medusa 的部署资源与内存建议](https://docs.medusajs.com/learn/deployment/general)、[Medusa shared / server / worker 模式](https://docs.medusajs.com/learn/production/worker-mode)、[Render 的资源费用示例](https://render.com/articles/production-rails-hosting-guide)、[DigitalOcean 机器价格](https://www.digitalocean.com/pricing/droplets)。

## Railway 费用

官方价格：[Railway Pricing](https://railway.com/pricing)、[计费说明](https://docs.railway.com/pricing/plans)。价格以实际订阅页面为准。

| 项目 | 当前价格或规则 |
| --- | --- |
| Hobby | 每月最低 US$5，包含 US$5 资源额度；超过后按实际用量收费 |
| Pro | 每月最低 US$20，包含 US$20 资源额度；超过后按实际用量收费 |
| 内存 | 约 US$10 / GB / 月，按实际消耗计费 |
| CPU | 约 US$20 / vCPU / 月，按实际消耗计费 |
| 出站流量 | US$0.05 / GB |
| 持久化卷 | US$0.15 / GB / 月 |

例如，一个服务整月平均占用 2 GB 内存，内存费用约 US$20，CPU、Redis 和流量另算。Medusa 官方建议托管方案至少提供 2 GB 内存容量；可用容量与实际消耗不同。因此不能把 Hobby 的 US$5 当成整个商城后台的固定月费。现有 Vercel、Supabase 账单和外部 Redis 服务费用分别计算。

合伙人登录商城后台并不等于加入 Railway 开发工作区。两个人管理商品，本身不要求购买两个 Railway 席位。若两个人都要直接管理托管平台、部署和环境变量，再评估 Pro 的团队功能。

部署后先观察实际内存、CPU 与账单，再确定月预算。Railway 可设置消费提醒和硬上限；硬上限达到时会停止服务，不能把它当成不影响运营的提醒。参考：[Cost Control](https://docs.railway.com/pricing/cost-control)。

## Railway 与 Render：针对当前商城的选择

2026-10-03 核对官方价格。两者都能运行当前 Medusa 后台；网站仍放在 Vercel，商品、库存、价格和顾客身份仍使用现有 Supabase。选择托管平台不改变 Medusa 管理界面，也不要求合伙人为了管理商品购买托管平台席位。

| 比较项 | Railway | Render |
| --- | --- | --- |
| 计费方式 | 按实际 CPU、内存、卷和出站流量消耗；套餐最低消费包含等额资源额度 | 按选定的服务规格计费；闲置时仍支付该规格费用 |
| 当前管理阶段的后台费用 | Hobby 为 `max(US$5, 实际资源费用)`，Pro 为 `max(US$20, 实际资源费用)`；后台与 Redis 的用量都需计入 | 一个 2 GB shared 后台 US$25，加 256 MB 持久化 Key Value US$10，基础 US$35 / 月 |
| 费用可预测性 | 低负载可能节省费用，增长时账单随消耗增加；有提醒与硬上限，硬上限会停服务 | 选定规格后的基础资源预算较明确；工作区、超额流量、税费另计 |
| Redis 维护 | 官方模板属于 unmanaged 容器，配置、持久化、备份和版本维护由我们负责 | 使用平台 Key Value 服务，选择付费持久化、`noeviction` 和 Journal + Snapshot |
| 套餐定位 | Hobby 面向个人项目，Pro 面向生产团队；Pro 提供团队功能、更长日志保留与平台支持 | 按应用规格和工作区功能选择；不需要新建 Render PostgreSQL |

只用于解释计费的示例：假设 Medusa 与 Redis 合计整月平均实际占用 1 GB 内存、0.1 vCPU，资源费约为 `1 × US$10 + 0.1 × US$20 = US$12`，再加卷和出站流量。Hobby 约 US$12 加上述额外资源费用，Pro 最低 US$20；若平均内存为 2 GB，同样 CPU 下约 US$22 加额外资源费用。这些是算术示例，未测量本项目完整云端服务，不能当作实际月费承诺。后台可用内存容量仍需按 Medusa 的至少 2 GB 建议设置并实测。

Railway 新账号试用每个服务的 RAM 上限为 1 GB，免费计划为 0.5 GB；不能用免费运行成功或失败代替本项目完整生产容量验证。生产验收需要满足实际内存需求的付费计划。

上述为平台选择阶段的比较记录。用户已选择 SnowForce Railway Hobby 并授权 US$20 计算提醒、US$25 计算硬上限，现已部署；本次没有升级 Pro。是否长期更便宜需要实际账单核对，不能用短时样本承诺。

来源：[Railway 套餐、资源单价和额度抵扣](https://docs.railway.com/pricing/plans)、[Railway 套餐功能与定位](https://railway.com/pricing)、[Railway Redis 模板的维护责任](https://docs.railway.com/databases/redis)、[Render 2026 年 9 月资源报价](https://render.com/articles/production-rails-hosting-guide)、[Render Key Value 持久化](https://render.com/docs/key-value)。

## Render 与其他云服务器的比较

以下保留平台选择阶段的基础资源比较，不包含现有 Vercel / Supabase 费用、税费、超额流量和额外备份。当前已选定并部署 SnowForce Railway，实际运行状态见本文开头。

| 方案 | 当前参考月费 | 适合的使用方式 |
| --- | --- | --- |
| Render：先运行一个 2 GB shared 后台 + 256 MB 持久化 Key Value | US$25 + US$10 = US$35；如选择付费工作区，工作区费用另计 | 商品运营优先，平台负责服务托管，较少服务器维护 |
| Render：各 2 GB 的 server / worker + 256 MB 持久化 Key Value | US$25 + US$25 + US$10 = US$60；工作区费用另计 | 正式销售时按 Medusa 推荐拆分后台任务 |
| DigitalOcean Basic Droplet，4 GB / 2 vCPU | US$24 服务器费；加每周机器备份约 US$28.80 | 自管 Linux、容器和 Redis，固定资源预算；容量仍需实测 |
| AWS Lightsail Linux，4 GB / 2 vCPU，含公网 IPv4 | US$24 服务器费 | 自管 Linux、容器和 Redis，使用 AWS 账号 |
| Hetzner 美国 ASH / HIL，CPX21，4 GB | US$37.49，IPv4 和备份另计 | 当前美国报价不比上述 4 GB 服务器便宜；不要套用欧洲或调价前报价 |
| Railway | 最低 US$5；后台和 Redis 的实际消耗另行核算 | 部署方便，接受按资源用量计费 |

Render 的 2 GB 服务为 `1c-2g`，Key Value 的 256 MB 套餐为 `256mb`。这份计算沿用已有 Supabase，不另买托管 PostgreSQL。管理阶段把 Medusa server / worker 合并为 `shared` 是控制初期资源成本的取舍；正式销售前再测量队列和任务负载，决定是否拆分。

Render 免费 Key Value 不提供持久化，不作为本项目的生产队列。队列使用 `noeviction` 与 Journal + Snapshot 持久化。当前生产检查要求 `rediss://`；如果使用 Render 的外部 TLS 地址，只允许实际后台服务的出站地址访问，不能开放给整个公网。

云服务器报价是机器价格。把 Redis 一起部署在同一台服务器可以减少独立服务账单，但需要另外配置 TLS、持久化、备份、内存限制、反向代理和自动重启。4 GB 不是无限容量或高可用保证；流量和订单增长后根据实测扩容。

DigitalOcean 每周机器备份为服务器费的 20%，即 US$4.80 / 月；每天备份为 30%，即 US$7.20 / 月。因此加每周备份的机器预算为 US$28.80 / 月，约 US$345.60 / 年，距离 Render 管理阶段的 US$35 / 月基础预算约差 US$6.20 / 月。机器备份不覆盖外部 Supabase 数据库和 Storage，也不能替代恢复演练；这部分仍按现有 Supabase 方案管理。

还有 OVHcloud、Fly.io、Google Cloud、Azure 等可选平台。2026-10-03 核对 OVHcloud 美国页面时，VPS-1 的 4 GB / 2 vCore 标价为 US$4.54 / 月起，但官网配置链接选择的是 `pricing=upfront12`（预付 12 个月）。当前未核实按月不承诺的最终报价和可用美国机房，不把这个展示价当成可随时取消的月费。官网也说明 Local Zone 暂不支持 Docker；若选 OVH，应核对标准数据中心、付款周期和最终含税价。Fly.io 则按机器规格和运行时间计算。

如果在 Render 与自管云服务器之间选择：两个人主要负责商品运营、希望减少日常技术维护时，选择 Render 的管理阶段约 US$35 基础方案；若更看重固定机器成本且接受持续服务器运维，选择 DigitalOcean 4 GB，并按含每周备份约 US$28.80 / 月规划。两种方案都能保留 Supabase 数据与现有顾客登录。与 Railway 的费用取舍见上一节。未确认平台、账号和费用前，不创建付费服务。

来源：[Render 定价](https://render.com/pricing)、[Render 2026 年 9 月的资源费用示例](https://render.com/articles/production-rails-hosting-guide)、[Render Key Value 持久化及连接规则](https://render.com/docs/key-value)、[DigitalOcean Droplet 及备份价格](https://www.digitalocean.com/pricing/droplets)、[AWS Lightsail Linux 套餐](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html)、[Hetzner 2026 年调价表（美国美元栏）](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)、[Hetzner Cloud 规格](https://www.hetzner.com/cloud/)、[OVHcloud 美国 VPS](https://us.ovhcloud.com/vps/)、[Fly.io 计费](https://docs.fly.io/about/pricing)。

## 为什么不直接把整套 Medusa 放到 Vercel

Vercel 可以承载后台接口、Node.js 服务和容器。当前 Vercel Services / Container Images 仍以请求驱动的 Functions 运行，实例没有请求时会缩容，不能原样承载一直等待队列的 worker。

Medusa 生产部署推荐 server 与 worker 分开运行，连接 PostgreSQL 和 Redis。server 提供管理页面及 API；worker 处理订阅事件、定时任务和后台工作流。将整个后台放到 Vercel，需要把这些任务改造成 Vercel Queues / Workflows / Cron 兼容的实现，或者仍在其他平台运行 worker。容器镜像本身并不消除这个限制。

这不是 Vercel 完全不能做后台，而是现有 Medusa 的运行方式与它不同。为了保留成熟商城已有的管理能力，优先采用支持持续运行 Node.js 容器的平台；现有 Next.js 网站仍留在 Vercel。

来源：[Medusa 部署概览](https://docs.medusajs.com/learn/deployment)、[Vercel 运行容器与 worker 的说明](https://vercel.com/kb/guide/docker-monolith-workers-vercel)、[Vercel Services 的运行方式](https://vercel.com/kb/guide/vercel-services-fluid-compute)。

## 已准备的部署入口

单机云服务器配置位于 `services/commerce/deploy/single-server`，包含 Compose、Caddy HTTPS 入口、Redis TLS / 密码认证 / 持久化配置和凭据初始化工具。Redis 不发布宿主机端口，Caddy 只能连接 Medusa 所在网络；启动等待 Redis 与 Medusa 的健康检查。具体 Linux 部署、内存限制、备份与证书维护步骤见该目录的 `README.md`。

本次实际 Docker Compose 解析通过；生成证书经过 Node TLS 实际握手验证，错误主机名和缺少可信 CA 时连接失败。隔离 Linux Redis 容器已实测 TLS、密码认证和重启后的数据保留；实际 Medusa 镜像中的 ioredis 客户端用同一 CA 验证并连接成功。Caddy 配置在断网容器中通过校验。这些测试没有连接真实商品数据库、没有开放宿主机或公网端口，测试容器、网络和卷已清理。初始化工具不打印密码、不覆盖已有目录。网站 954 项测试及构建、后台 394 项测试与类型检查及生产构建通过；初始化工具行覆盖率 100%。仍未运行完整单机应用组合或验证真实服务器内存容量，不能把这些检查当成公网部署完成。结果见 `output/shop-public-admin-single-server-container-verification.json`。

`services/commerce/Dockerfile` 使用 Node.js 24，多阶段构建 Medusa 和 Admin。镜像从 `.medusa/server` 运行编译后的应用，不把本地 `.env`、初始密码、数据库引导工具或草稿清单放入镜像。

构建上下文必须是 `services/commerce`，不能使用仓库根目录：

```powershell
docker build -t snowforce-commerce:management services/commerce
```

启动入口为 `node scripts/start-production.mjs`。它检查生产配置，监听平台提供的 `PORT` 和 `0.0.0.0`，转发停机信号。健康检查使用 `/health`。每次启动不自动修改数据库、不自动导入草稿、不自动运行迁移。

首次部署前，核对当前数据库迁移与本次构建相符；后续版本若有迁移，先审查并单独执行，再部署。本次管理模式不新增表。

已实际构建 Linux / amd64 镜像 `snowforce-commerce:management`，镜像标识为 `sha256:090b1df9e9e6a9b531ebf7c9ed62fd73d282ef2c902f81da0cd69e33b18f9b9d`。断网容器检查确认 Admin 构建、CLI 和启动脚本存在，使用非 root 用户运行，本地凭据及数据库引导工具未进入镜像，默认关闭付款。未配置真实生产环境时，容器在连接数据库前拒绝启动。

此前使用假配置和受控子进程在断网容器中实测启动包装进程：监听参数为平台端口 `8080`、主机 `0.0.0.0`，`SIGTERM` 转发到子进程，正常退出码为 `0`。该本地探针没有运行完整 Medusa 或连接数据库；后续真实云端连接、图片上传与应用重启保留已通过本页开头的托管验收。

本次本地检查：网站 954 项测试、后台 394 项测试、类型检查及双方构建通过；不加载本地开发凭据的 Medusa 生产构建也通过。2026-10-03 复核后台构建时，默认 CLI 配置目录因本机沙箱权限返回 EPERM；改用项目内 `.cache/railway-build-config` 并保持 production / telemetry disabled 后构建成功，没有修改个人 CLI 配置。复核结果保存在 `output/shop-railway-root-validation.json` 和 `output/shop-railway-backend-validation.json`。发布前再次核对覆盖率：网站整体行覆盖率 58.28%、分支 51.68%；本次管理模式路由和开关的行、分支与函数覆盖率均为 100%，实际配置的 HTTP 中间件测试也通过。报告为 `output/shop-railway-release-root-coverage.log` 和 `output/shop-railway-release-management-coverage.log`。容器检查结果保存在 `output/shop-public-admin-container-layout.json`、`output/shop-public-admin-container-lifecycle.json` 和 `output/shop-public-admin-container-preflight.log`。

Linux 安装日志存在上游间接依赖 `lodash.isequal`、`cron-parser` 的弃用提醒，以及 npm 的依赖安装脚本策略提示。已记录后续核对项；本次保留已锁定的 Medusa 版本，不把构建成功解释为所有依赖都没有风险。

本地 API 实测确认 `snowforceclub@gmail.com` 登录成功，商品和库存读取成功，未登录管理请求被拒绝，支付 webhook 与捕获付款接口被管理模式拒绝。个人管理员账号的初始凭据未通过本次登录验证；未重置其密码，公网交接时应使用个人账号的当前密码重新验证。这些检查只针对本机，不能替代公网验收。

## 托管平台配置清单

### Railway 创建服务时的设置

目标托管身份是用户指定的 **SnowForce Railway 账户**。必须先从平台界面确认登录身份和工作区归属，再创建资源、连接代码、录入凭据或授权费用；不能仅凭项目名称包含 SnowForce 判断归属。

此前误在个人账户 `taiyuanmei0824@gmail.com` 的 `harrymeit's Projects` 工作区建立私有项目 [SnowForce Commerce](https://railway.com/project/1710a67c-26c5-403b-9225-6bcd78238564)，工作区 ID 为 `3868cc9d-721a-42cf-9fe1-e4e0ba51b752`。其中空服务 `snowforce-commerce` 保存了源目录 `/services/commerce` 和健康检查 `/health`，状态为 offline；没有连接代码源、上传凭据、启动后台或生成公网域名。该项目不是已核对的 SnowForce 账户部署目标。个人账户的空项目尚未转移或删除。

2026-10-03 用户完成登录后，已从平台界面核对账户 `snowforceclub@gmail.com` 和工作区 `snowforce-club's Projects`，工作区 ID 为 `18937ccb-da72-4953-9c43-9daddc58553b`。在该工作区新建了私有项目 [SnowForce Commerce](https://railway.com/project/026e1ce6-a125-422c-b29f-a44ee11bdac1)，项目 ID 为 `026e1ce6-a125-422c-b29f-a44ee11bdac1`，production 环境 ID 为 `1245a65e-0f62-4182-8c85-1858aa98c634`。已应用空服务 `snowforce-commerce` 的设置：服务 ID 为 `ecc29173-f680-4ed5-a6e9-b69bffe8d17a`，源目录 `/services/commerce`，健康检查 `/health`。初始架构界面显示服务 offline；本次已连接 GitHub 代码并成功部署，当前状态见文首。

首次创建时正确账户仍为 Trial（现已升级 Hobby），服务界面显示 1 GB 内存上限。已在 SnowForce 工作区打开 Hobby 订阅页面，尚未提交订阅：先收 US$5 激活，此后每月最低 US$5，超出额度按实际资源用量收费。当时用户尚未授权月费用上限，订阅步骤交由用户自行完成；本次已授权并保存 US$20 提醒、US$25 计算硬上限。正确账户和项目截图为 `output/shop-railway-snowforce-project-created.jpg`，订阅页截图为 `output/shop-railway-snowforce-hobby-subscription.jpg`。原个人账户空项目保持原状，未做跨账户转移。

此前个人账号为 Trial。服务设置中显示每个服务最多 1 GB 内存 / 2 vCPU；套餐说明卡片另写 0.5 GB，两处均低于 Medusa 建议的 2 GB 托管容量。此前个人账户的 [Hobby 订阅页面](https://railway.com/workspace/upgrade) 显示最低 US$5 / 月、含 US$5 用量，超出按实际消耗收费；页面明确先收 US$5 激活。没有填写银行卡信息，没有提交订阅，没有升级 Pro。此记录不能证明 SnowForce 账户的套餐或账单状态，后续应在正确账户重新核对。初期只做商品管理，可由用户评估 Hobby；Pro 为最低 US$20 / 月，提供团队、日志和支持方面的额外功能。最终套餐和实际预算由用户决定。

插件管理此前确认 Railway 插件已安装、启用，但最初没有可调用的操作工具，因此建项目通过用户已登录的浏览器完成。2026-10-03 后续复核时，Railway 连接器工具已可调用；whoami 返回 `snowforceclub@gmail.com`，工作区及项目列表也确认正确归属。CLI 仍未配置。后续优先使用该连接器，避免将数据库和后台密钥通过聊天或截图交接。

早期准备记录：连接器已保存并重新读取验证 Dockerfile 构建、源目录 `/services/commerce`、健康检查 `/health` 与 300 秒等待时间。已录入 13 个非密钥变量，包括 production、management、shared、关闭付款的税务开关、9000 端口、commerce schema、现有图片 bucket 配置，以及已确认可访问的网站 origin `https://snow-force.com`。设置变量时使用 skipDeploys，平台 status 仍显示 latestDeployment 为 null，没有运行中的后台；数据库密码、JWT / cookie / 同步密钥、Redis 与 S3 access pair 均未上传。

提前生成 Railway 公网域名的请求被自动审批拒绝：代码源、生产密钥和部署验收尚未完成，此时生成域名会提前扩大服务暴露面。没有通过浏览器或其他方式绕过；待代码与生产配置齐备，再进行公网地址与上线步骤。当时没有创建公网域名。本次在代码、凭据和私网启动验收完成后，通过连接器创建了上文 HTTPS 域名，并把 ADMIN_CORS / AUTH_CORS 设置为实际地址。

部署代码已推送到现有私有 GitHub 仓库 `Snow-force/snow-force` 的独立分支 `codex/commerce-public-admin`，从已核对的 `main` 提交 `98e1ae9` 开始，部署代码提交为 `4e6a166`。GitHub 在推送时确认原 `Harrymeit/snow-force` 地址已迁移到该组织仓库；后续使用规范地址 `https://github.com/Snow-force/snow-force.git`。Railway 连接该分支中经过审查与测试的部署提交；不要直接假设 `main` 已包含部署文件。该发布分支只收录商城部署代码、相关测试及部署说明，不收录本地环境文件、凭据、运行记录、商品原始素材或其他未提交工作。Railway 目标是已核对的 SnowForce 工作区。连接私有仓库时核对实际授权范围。

早期 SnowForce 服务的 Connect Repo 窗口显示 No repositories found，并提供 Configure GitHub App；当时没有可选仓库；本次用户完成单仓库授权，两个服务均已连接 `Snow-force/snow-force` 的已检验提交。后续如选择 GitHub 自动部署，授权应限定到所需仓库，并在实际授权界面核对权限；不扩大到所有私有仓库。也可使用经授权的 CLI 上传经过审查的后台构建上下文。

| 设置 | 本项目所需值 |
| --- | --- |
| 服务源目录 / Root Directory | `/services/commerce`；构建上下文仅包含后台目录 |
| 构建方式 | 此目录中的 `Dockerfile`，由平台构建；无需复制整个网站环境文件 |
| 启动方式 | 保留镜像的 `CMD`，运行 `node scripts/start-production.mjs`；不要改成根目录的 Next.js 启动命令 |
| 健康检查 | `/health`，启动等待时间可先设为 300 秒，再依据实际启动耗时调整 |
| 实例 | 管理阶段一个 shared 后台；可用内存按至少 2 GB 容量验收，实际消耗另行计费 |
| 图片 | 现有 Supabase Storage；不把新上传图片放在容器临时文件系统 |
| 队列 | 已部署私网 TLS Redis 并验证认证、AOF 和 RDB；独立备份及 Redis 自身恢复演练仍待完成 |
| 外部入口 | 平台 HTTPS 域名验收通过后，再配置自定义域名及 CORS |

Railway 官方最新 IaC 文档说明，`railway.json` / `railway.toml` 已弃用，新服务不能采用旧配置方式，旧服务文件于 2026-12-01 停止生效。因此本项目没有新增旧式配置文件。首次可以使用平台界面设置；选定账号后，如需配置即代码，使用当前 `.railway/railway.ts` 方式，并先预览目标环境的变更。该文件描述项目资源，删去资源可能导致后续 apply 删除资源；只在独立商城项目和经过审查的变更中使用。

数据库密码、JWT / cookie、同步密钥与 S3 access pair 只录入服务变量。可评估平台的 sealed variables；密封后无法取消密封，复制环境也不会复制这些值，必须保留自己的受保护凭据记录。Dockerfile 不声明这些密钥为构建参数。此项目暂未安装 Railway CLI / SDK，也未新增自动部署或自动创建付费资源的流程。

平台的部署健康检查只在发布时检查服务，不能替代后续持续可用性监控。部署验收仍包括真实登录、商品和库存编辑、图片上传及重启后保留数据。

来源：[Railway Dockerfile 检测](https://docs.railway.com/builds/dockerfiles)、[独立子目录部署](https://docs.railway.com/deployments/monorepo)、[新的 IaC 配置与旧配置截止日期](https://docs.railway.com/infrastructure-as-code)、[密封变量的限制](https://docs.railway.com/variables)、[部署健康检查范围](https://docs.railway.com/deployments/healthchecks)。

### 2026-10-03 早期本地配置复核（历史记录）

复核只读取本地受保护配置并运行生产配置校验，没有启动生产实例、连接商品数据库或打印密钥。当前配置能通过已有数据库、CA、独立后台密钥和 Auth 项目的相关校验；但仍是本地开发配置，生产校验未通过。

- 网站 / 后台 / Auth 的 CORS 和 storefront origin 需要改为真实 HTTPS 地址。
- `REDIS_URL` 尚未提供；必须在选定托管环境中配置并验证 TLS、认证、持久化与备份。
- 图片的 S3 access pair 尚未提供，bucket / region / endpoint / public URL 也需显式录入生产变量。
- 当前没有可调用的 Railway / Render 托管连接器，未发现对应 CLI 命令或进程环境中的平台令牌；这只证明当前工作环境无法部署，不代表用户没有托管账号或浏览器登录。
- 本地复核 `/shop`、`/health` 和 `/app` 返回 200，未登录 `/admin/products` 返回 401；没有公网实例证据。

环境变量填写在后台服务的托管平台设置中，不通过聊天发送，不写入 Git，不上传整个本地 `.env.local`。

| 配置 | 要求 |
| --- | --- |
| `NODE_ENV` | `production` |
| `COMMERCE_OPERATING_MODE` | `management` |
| `COMMERCE_TAX_POLICY_CONFIRMED` | `false` |
| `MEDUSA_WORKER_MODE` | 初期可用 `shared`；正式销售前评估独立 `server` 与 `worker` |
| `PORT` | 使用平台分配的端口，未设置时为 `9000` |
| `DATABASE_URL` | 现有商城专用角色的连接串；Supabase session pooler `5432`，不能用 postgres 管理员或 `6543` transaction pooler |
| `DATABASE_SCHEMA` | `commerce` |
| `DATABASE_CA_CERT` | 现有 Supabase CA PEM；保持证书验证 |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | 现有会员 Auth 项目 |
| `REDIS_CA_CERT` | 与私网 Redis 服务器证书匹配的 CA；所有 Redis 客户端校验证书与主机名 |
| `REDIS_URL` | 可供 Medusa 队列、缓存和锁使用的 TLS Redis 连接串（`rediss://`）；不能只提供 HTTP REST API |
| `JWT_SECRET` / `COOKIE_SECRET` | 两个独立随机密钥，至少 32 字符；所有后台实例一致 |
| `COMMERCE_ORDER_SYNC_SECRET` | 与网站后端一致的独立随机密钥，不使用 JWT 或 cookie 密钥 |
| `SNOWFORCE_STOREFRONT_URL` | 网站的实际 HTTPS origin，不带路径和尾斜杠 |
| `STORE_CORS` | 实际网站 HTTPS origin；如需多个，以逗号分隔 |
| `ADMIN_CORS` | 公网后台 HTTPS origin |
| `AUTH_CORS` | 网站和后台的实际 HTTPS origins，以逗号分隔 |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Supabase Storage S3 access pair；仅放在后台服务 |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_FILE_URL` | 沿用 `.env.example` 中现有 `shop-products` 配置 |
| `COMMERCE_STRIPE_API_KEY` / `COMMERCE_STRIPE_WEBHOOK_SECRET` | 管理模式无需填写；正式收款前另行配置和验收 |

Redis 与 S3 凭据已在授权的 Railway 项目配置并实际验证。新上传图片通过 Supabase 持久化，不依赖后台容器磁盘。

服务部署完成后再将 Vercel 中网站后端的 `MEDUSA_BACKEND_URL` 指向已验收地址，并核对网站的商城开关、公开商品查询与同一订单同步密钥。密钥不会暴露给浏览器。后台和网站共用数据库，不等于网站一定已切换到这个服务地址。

本次使用平台生成的 HTTPS 域名 `https://snowforce-commerce-production.up.railway.app`。可选自定义地址 `commerce.snow-force.com/app` 只是建议，尚未配置 DNS，不能作为已可用的登录链接。

## 公网验收与交接

1. 构建成功，HTTPS `/health` 返回成功，`/app` 登录页与静态文件可访问。
2. 未登录请求管理 API 返回未授权；公开响应和日志不泄露管理员凭据、私密订单或环境变量。
3. 使用现有管理员登录，并核对合伙人使用的账号可正常进入商品和库存界面。
4. 创建专用验收草稿，编辑美元价格、尺码库存，上传图片；刷新和重启后数据与图片保持存在。完成后清理本次验收数据，不动真实商品。
5. 公开商品查询只显示已发布商品；草稿保持隐藏。后台改价和库存后，网站能读取同一份数据。
6. 顾客付款、原生付款 API、支付 webhook、订单与退款写入仍拒绝执行。测试不得产生真实收费。
7. 更新合伙人手册及 PDF，填入真正验收通过的公网登录地址。合伙人在另一台电脑实际登录后完成交接。

只有完成本轮范围内的检查，才把“公网后台部署”目标标为完成。Railway 后台已上线，账号、商品写入、图片和应用重启持久化已通过公网 API 核验；浏览器也已实际保存并读回商品 SKU、美元价格、Irvine 库存和图片，专用测试数据已清理。当前等待 Redis 重启授权及 Vercel 前台托管方案决定；合伙人在另一台电脑的实际培训和登录交接未代替她完成。销售启用前仍需独立备份恢复及支付税务验收，管理阶段部署完成不代表已开通收款。本轮验证结果见 [完整测试记录](shop-public-admin-test-report.md)。
