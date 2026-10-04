# SnowForce 网站迁入 Railway

更新：2026-10-04（America/Los_Angeles）。目标：将整个 Next.js 网站和现有 Medusa 后台统一托管到 SnowForce Railway 项目，保留现有域名与 Supabase 账号。

## 目标架构

- 项目：SnowForce Commerce，`026e1ce6-a125-422c-b29f-a44ee11bdac1`，SnowForce 账号。
- 网站：`snowforce-web`，`6fda6b39-d34b-4fb1-8457-e67f52a52ab3`；Node.js 24、Next.js standalone、单副本、1 vCPU / 1 GB 上限。
- 网站临时域名：`https://snowforce-web-production-5cbf.up.railway.app`。
- 商城后台：现有 `snowforce-commerce`；私有 Redis 与持久化卷继续沿用。
- 正式网站：`https://snow-force.com` 与 `https://www.snow-force.com`，只在临时域名验收完成后切换。
- 数据和顾客身份：沿用现有 Supabase。后台沿用 Medusa 管理员账号。
- 商城保持 management 模式，付款继续关闭。网站原有活动支付配置单独迁移，不能与商城 Stripe 配置混用。
- 维持工作区 US$25 计算硬上限和 US$20 提醒；新增网站资源计入同一上限，不能保证短时样本代表整月费用。

## 部署边界

`Dockerfile.web` 使用最小 standalone 运行目录并显式复制 `public` 与 `.next/static`。`Dockerfile.web.dockerignore` 只允许网站源代码与必要构建文件进入构建上下文；不包含本地环境文件、数据库连接、商城服务目录、Products、报告或工具缓存。Docker build args 仅包含公开浏览器配置；服务端凭据只在运行时注入。

现有商城源码连接固定在已验收提交；推送网站配置不应使 Redis 重启。保留全部原有未提交工作，不使用 `git add .`。

## 顺序与验收

1. 核对 SnowForce 账号、现有服务、预算及 DNS 记录。准备网站容器，执行全量测试、覆盖率、生产构建。
2. 安全迁移现有网站生产环境配置，确认同一 Supabase 项目、公开 URL、邮件与活动支付配置。凭据不打印、不写报告、不提交 Git。
3. 推送经过检查的部署源码，连接新网站服务，观察唯一部署直至终态，不因观察超时重复创建部署。
4. 临时域名验证首页、活动、回顾、商城、政策、会员登录界面、后台访问守卫、静态图片、视频和样式。额外检查实际 Supabase 数据、草稿隐藏与 Medusa 连接；HTTP 200 不足以证明功能正常。
5. 为正式 apex / www 添加 Railway 自定义域名，记录原 DNS 回滚值。只更新网站路由记录，保留邮件、域名验证和其他服务记录。确认证书、正式域名、登录回调、SEO canonical 与原有 Stripe webhook URL。
6. 在正式域名复验；核对三个服务运行状态、资源样本与预算。更新交接记录；通过全部验收后提交并推送相关内容至 main。

## 当前状态

- SnowForce 身份已再次核对为 `snowforceclub@gmail.com`。网站、Medusa、私有 Redis 均在同一 SnowForce Commerce Railway 项目，三项服务在线。
- 网站生产配置恢复部署 `377adb0c-cd7c-47ce-8656-edc9bbedb197` 成功；运行源码为 `1ee6e23223c7199d968338eda4f5c41aff167cf7`。Medusa 和 Redis 沿用之前的部署，本轮没有重启它们。
- 经营者已明确授权将网站生产密钥及商城连接配置仅保存到 `snowforce-web`。现有 Supabase、Resend、翻译、活动 Stripe 与正式 webhook、购物车和订单同步配置已恢复；未创建或轮换凭据，未上传整个环境文件。
- `snow-force.com` 与 `www.snow-force.com` 已切换至 Railway，两个域名的所有权验证和 TLS 证书有效。正式站点 HTTP 响应的 server 为 `railway-hikari`，健康接口返回 `snowforce-web`；不再依赖 Vercel 提供正式网站请求。
- 正式首页、活动及详情、回顾、商城、政策入口正常。浏览器先在同一新连接确认 Railway 健康接口，再确认原会员已登录会话、行程及订单入口继续有效，无需重新注册或迁移账号。视频 readyState 为 4，已加载图片正常，无横向溢出。
- 商城读取的是现有 Medusa 数据：公开商品 0、地区 0、已发布政策为 null；页面显示新品待上架和政策尚未生效，区别于连接失败。原有草稿由经营者填写后自行发布，管理模式和停止收款保持不变。
- 最终 `npm test` 为 154 文件 / 959 项通过，`npm run build` 通过；回调修复轮的覆盖率命令也通过。没有发送测试邮件、收取款项、新建业务订单或重放 Stripe 事件。
- Cloudflare 原有 12 条记录中，仅两个网站 CNAME 的目标改变，额外添加两个 Railway 所有权 TXT。其他 10 条记录逐项对比保持原值，包括 Microsoft 365 和 Resend 邮件记录。

本轮完成的是前端托管迁移与前后端统一，不是商城正式销售启用。经营主体、税务许可、商品正式价格和库存、政策发布及真实交易全链路验收仍属于销售上线前的独立工作。

## 2026-10-04 临时域名准备阶段记录

以下保留配置恢复前的核验过程；完成结果以“当前状态”和文末验收证据为准。

- 实际部署的 CSS、Logo 图片优化接口和首页 MP4 均返回 200，类型分别为 CSS、JPEG、MP4。浏览器确认视频可用、商城两张展示图片加载正常、中英文切换有效，页面能看到 `Shop@snow-force.com`。
- 未登录访问 `/admin`、`/admin/events` 和报名导出返回 307 至 `/staff-login`。会员行程和商家 dashboard 返回登录界面；这证明未登录守卫，不证明已登录账户的权限或业务流程。
- 公开 GET 请求支付 webhook、订单同步接口返回 405；本轮没有发起支付、创建订单或同步写入。付款关闭的业务验收仍应沿用后台验证并在网站完整连接后复验。
- Railway 变量名称已核对：网站没有 `SUPABASE_SECRET_KEY`、`MEDUSA_PUBLISHABLE_KEY`、邮件、翻译和活动支付配置。首页活动、回顾与商城政策尚未完成业务验收；不能将错误空状态视为真实空数据。
- 实际登录回调曾返回 `https://0.0.0.0:3000/member?error=callback`，确认独立容器中的 request origin 不适合作为浏览器跳转地址。登录回调与旧报名确认路由改为站内相对 `Location`，保留已有跳转路径校验，并设置 `Cache-Control: no-store`。相对 Location 的语义见 [HTTP 标准](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.2)。新部署已成功，实际 HTTP 对会员、商家无验证码回调和旧报名确认链接均返回站内相对地址；浏览器确认无验证码回调最终停留在临时公开域名的 `/member?error=callback`。未提交登录验证码，成功登录的完整流程仍待验收。
- 补充修复后 `npm test` 为 154 文件 / 959 项通过，`npm run build` 通过，覆盖率命令通过：语句 57.19%、分支 51.72%、函数 54.58%、行 58.31%。构建曾被 OneDrive 旧缓存属性阻止；旧 `.next` 已完整归档到 `.cache/next-build-backups/pre-callback-fix-20261004` 后重新生成，未修改源码或环境配置。
- 只读 HTTP 证据：`output/shop-railway-web-preview-acceptance.json`。首次采样的网站当前内存约 0.088 GB，当前 CPU 约 0.0023 核；服务刚启动，小时平均包括未运行时间，不能据此估算整月费用。
- 回调修复证据：`output/shop-railway-web-callback-http.json` 和 `output/shop-railway-web-callback-browser.png`。
- 受保护配置只读盘点已记录变量名称、存在标志与 Stripe 模式，未记录值：`output/shop-railway-web-configuration-inventory.json`。`.env.local` 的活动 Stripe secret / publishable key 属于测试模式；`.stripe-live.env` 仅有正式 secret key。现有生产 webhook 签名密钥必须从受保护的生产恢复来源核对，不能使用本地 CLI 的测试签名密钥代替。当前网站活动支付使用托管 Stripe Checkout 跳转，不在源代码中读取旧的公开活动 publishable key；商城 Stripe 属于独立配置并继续关闭。
- 正式域名实时核对仍未验证所有权，证书处于 `VALIDATING_OWNERSHIP`；`www` 仍指向原 Vercel CNAME。本轮未切换 DNS。续办 automation 的本地状态为 `PAUSED`，未改变其状态或启用旧的 Vercel 授权流程。

## 生产配置恢复来源与已处理的依赖

- 本地网站生产 Supabase URL / publishable key 与商城环境文件一致；网站与商城本地订单同步密钥也一致，网站 cart cookie 密钥达到现有代码的长度要求。仅比较本地受保护配置，Railway 渲染值被连接器隐藏，不能把本地比较当作服务器凭据逐值核对。部署缓存文件仍受 OS ACL 保护，没有更改权限；比较证据为 `output/shop-railway-web-config-comparison.json`。
- 已使用现有 storefront publishable key 对 SnowForce 公网商城执行只读查询，Store API 均返回 200。当前公开商品 0、返回草稿 0、地区 0、已发布政策为 null；这些属于当前经营数据状态，不能将其写成网络故障，也不在迁移中自行发布商品或政策。证据为 `output/shop-railway-web-commerce-source-readonly.json` 和 `output/shop-railway-web-commerce-state-readonly.json`。
- Stripe 连接器已确认正式 Snow Force Club 账户 `acct_1ToZcEAItQQT9la8`。现有端点 `we_1Tv2PpAItQQT9la8pAH6xLlv` 已启用，URL 为 `https://snow-force.com/api/stripe/webhook`，监听 `checkout.session.completed`。迁移保留此正式域名及路由，不需要新建或修改端点。API 未返回签名密钥。
- 浏览器从同一 Snow Force Club 沙盒切换至正式账户，定位到现有端点详情；经营者授权后读取原有签名密钥，仅保存到指定网站服务。读取后隐藏源页面，不需要经营者重建 webhook 或发送密钥到聊天。Stripe 官方入口说明见 [签名验证与查看现有端点密钥](https://docs.stripe.com/webhooks#verify-signature)。来源证据为 `output/shop-railway-web-stripe-source-readonly.json`、`output/shop-railway-web-stripe-endpoint.png`，均不含密钥值。
- 两项原阻塞均已处理：经营者完成 Cloudflare 登录，并明确授权指定生产配置保存至 `snowforce-web`。没有代替经营者接受条款、购买升级或扩大预算。

## 环境配置与运行验收

网站保留公开 Supabase 构建配置和正式 `NEXT_PUBLIC_SITE_URL=https://snow-force.com`。服务端恢复以下变量，值仅在 Railway 网站服务保存：

| 变量 | 来源和用途 |
| --- | --- |
| `SUPABASE_SECRET_KEY` | 网站现有受保护生产配置；服务端仓储读取和业务写入 |
| `RESEND_API_KEY` | 网站现有受保护生产配置；保留原邮件服务 |
| `STAFF_NOTIFICATION_EMAIL` | 保留现有配置；当前源码的通知函数仍使用既有收件设置，不能仅凭该变量存在宣称邮件送达通过 |
| `GOOGLE_TRANSLATE_API_KEY` | 网站现有受保护生产配置；保留原翻译服务 |
| `STRIPE_SECRET_KEY` | 受保护的正式活动 Stripe 密钥，不使用本地测试密钥 |
| `STRIPE_WEBHOOK_SECRET` | 原有正式 webhook 详情页；URL 仍为 `/api/stripe/webhook` |
| `MEDUSA_PUBLISHABLE_KEY` | 现有商城读取配置；只在网站服务器使用 |
| `SHOP_CART_COOKIE_SECRET` | 现有购物车签名配置，不更换现有签名密钥 |
| `COMMERCE_ORDER_SYNC_SECRET` | 现有网站与商城共享的同步签名配置 |

- 订单同步缺少签名返回 401；使用恢复的共享密钥签名、但提交无效结构返回 400 `invalid`。后者确认网站运行时密钥匹配，在结构校验处停止，没有写入订单。
- 活动 webhook 无效签名返回 400；本轮未通过有效事件写入账本或执行资金操作。商城 checkout 的只读探测被管理模式拒绝，并返回停止销售与付款的明确说明。
- 网站服务没有复制数据库 bootstrap 管理员连接、Redis、S3 或 Medusa 管理员密码。数据库和顾客身份不变；Medusa 管理员仍从其独立后台入口登录。
- 迁移不等于邮件送达、翻译准确性、新登录邮件或真实活动收费的端到端验收。没有替经营者发信或收费；原服务配置和正式 URL 保留。

## DNS 与回滚

| 名称 | 原控制台记录 | Railway 目标 | 代理 / TTL |
| --- | --- | --- | --- |
| `snow-force.com` | CNAME `2f583a945b1214e5.vercel-dns-017.com` | `yms0edov.up.railway.app` | DNS only / Auto |
| `www.snow-force.com` | CNAME `2f583a945b1214e5.vercel-dns-017.com` | `vpb9mqhe.up.railway.app` | DNS only / Auto |

控制台确认 apex 原记录是 Cloudflare 扁平化的 CNAME；早期公共 DNS 看到的两个 A 地址只是解析结果，不应作为控制台回滚记录。需要回滚时，仅将上述两个现有 CNAME 的目标改回原值，保留邮件、验证和其他服务记录。记录 ID 和完整回滚指引在 `output/shop-railway-web-dns-rollback.json`。

本轮保持 DNS only，没有修改 Cloudflare TLS 验证或绕过浏览器证书警告。域名验证和证书说明参考 [Railway 域名文档](https://docs.railway.com/networking/domains/working-with-domains)。浏览器首次复验曾使用旧连接，并出现一次本机 `ERR_BLOCKED_BY_CLIENT`；新浏览器连接随后正常打开正式站点、健康接口及原会员会话，未修改浏览器保护。浏览器日志另有来自 `chrome-extension://` 的扩展消息错误，未发现来自网站本身的控制台错误。

## 验收证据与交接

- `output/shop-railway-web-configured-http.json`：配置后的临时站点入口、业务公开内容、守卫和相对回调。
- `output/shop-railway-web-formal-http.json`：正式域名 20 个入口，Railway 响应头、公开活动和回顾、私有路由守卫及 canonical。
- `output/shop-railway-web-config-boundaries.json`：运行时订单同步签名、管理模式和无效 webhook 边界；无业务数据库写入。
- `output/shop-railway-web-member-before.json`、`output/shop-railway-web-member-after.json`：真实已登录会员会话在迁移前后保留，不记录账户资料或 token。
- `output/shop-railway-web-dns-audit.json`：两条网站路由改变、两个新增 TXT、其他十条记录保持原值。
- `output/shop-railway-web-config-applied.png`、`output/shop-railway-web-cloudflare-after.png`、`output/shop-railway-web-formal-home.png`、`output/shop-railway-web-formal-shop.png`：掩码配置、DNS 与公开页面截图。
- `output/shop-railway-web-final-tests.log`、`output/shop-railway-web-final-build.log`：最终全量测试及生产构建通过。

日常管理从 [公网商城后台](https://snowforce-commerce-production.up.railway.app/app/login) 完成；商品、美元价格、库存和图片不需要重新部署网站。2026-10-04 后续已将网站改为跟随 `main`、启用 Wait for CI；网站相关文件推送后，GitHub Quality Gate 的测试和生产构建成功才发布。仅修改文档或 `services/commerce` 不触发网站发布。商城后台仍固定到 `30f671d`，Redis 不跟随网站代码发布。详见下方自动发布验收记录。

保留原有未提交文件和旧目录。Vercel 项目暂留作回滚来源，未删除项目或配置；正式 DNS 已指向 Railway。续办 automation 保持 `PAUSED`，完成本轮后不启用旧的 Vercel 授权任务。

## 2026-10-04 自动发布验收记录

- 用户已授权关闭 Vercel 自动部署并启用 GitHub CI 通过后自动部署。
- 实时检查旧 Vercel 项目的 Settings → Git：项目未连接 Git 仓库，未配置 Deploy Hook，因此 GitHub 推送不会触发 Vercel 自动部署。保留项目、旧部署、环境配置作为回滚来源。
- Railway `snowforce-web` source 已切换到 `Snow-force/snow-force` 的 `main`，清除 commit pin；界面显示 Auto deploys when pushed to GitHub，Wait for CI 开启。
- `.github/workflows/ci.yml` 的 Quality Gate 在 main push 和 PR 运行，执行 `npm ci`、`npm test`、`npm run build`。提交 `4f4a71a` 的 GitHub run `37237632153` 已成功。
- 切换后的 Railway 部署 `26535a38-6782-4569-80f2-c5f760bc5322` 曾显示 Waiting for CI，随后 SUCCESS；运行 main 提交 `4f4a71a`。本轮未改变业务数据、凭据、预算或商城收款状态。
- 网站 watch paths 包括 `/src/**`、`/public/**`、根 package/lockfile、Next/TypeScript/proxy/ESLint/PostCSS/Tailwind/Vitest 配置、`/next-env.d.ts`、`/Dockerfile.web`、Docker ignore 文件及 `/.github/workflows/ci.yml`。文档、报告、商品素材源目录和后台目录的单独变更不触发网站发布。
- 商城后台无需独立 repository：保留同仓库的 `services/commerce`，独立依赖、Dockerfile、环境变量和 Railway 服务。网站 CI 当前未验证后台，故后台继续固定在已验收版本。若后续启用后台自动发布，应先补充后台 test/typecheck/build CI，再启用后台服务的 Wait for CI 和仅覆盖 `/services/commerce/**` 的 watch paths；数据库迁移应单独审核，不将自动发布等同于自动运行迁移。
- 证据截图：`output/vercel-git-disconnected.png`、`output/railway-web-ci-autodeploy.png`。旧阶段固定版本记录为历史，不代表此节更新后的前台发布设置。
