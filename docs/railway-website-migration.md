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

- SnowForce Railway 身份、现有两个服务已实时核对；新增网站服务及临时域名已建立，尚未部署。
- 网站全量 955 项测试、生产构建和覆盖率命令通过。覆盖率为语句 57.18%、分支 51.68%、函数 54.58%、行 58.30%；新增 liveness 接口无外部服务依赖，该检查不能替代公网业务验收。
- 凭据保存确认已向经营者发出，等待回复。Vercel sensitive 变量的 API 不返回明文，需要使用现有受保护配置并核对来源。
- 正式 DNS 尚未修改，现有 Vercel 网站继续提供服务。

尚未完成公网验收或域名切换，不能把本文件当作迁移完成证明。
