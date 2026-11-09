# SnowForce Super Agent

独立 Cloudflare 控制服务；不向现有 Next.js 或 Commerce 进程加入 AI 工作负载。

## 当前实现与边界

- GitHub 新 Issue 签名接收、仓库白名单、稳定 issue key 去重。
- 管理员手动任务，以及经过独立 token 鉴权的 support / monitor 技术摘要入口。
- D1 持久化、Queues 规则分类、失败队列、十分钟定时补偿；队列不可用时仍保存任务。
- 中文控制台：任务、草稿、调查审批、暂停、今日/本月费用；`GET /api/overview` 提供模型/agent 用量汇总，`GET /api/audit` 提供审计。
- DeepSeek Flash 单次分类与回复草稿：operator 提交经过脱敏的技术摘要后才调用。GitHub 原始正文、客户邮件和日志不传给模型。
- 隔离 Codex Runner 与可选 Draft PR 发布代码；需要 Docker 主机、该环境的 ChatGPT 授权及私有仓库读取权限。未配置 Runner 的控制服务不会自行改代码。

尚未接通 Gmail OAuth/PubSub/watch 续订、Sentry 原生签名、Railway 指标、DeepSeek 余额核对及独立 QA agent。monitor/support 入口不代表这些适配器已完成。当前采用 D1 状态机、队列和 cron，不依赖 Workflows；后续需要长时间等待、多阶段执行时再接入。当前相同 issue / source key 会去重，跨来源相似问题不自动合并。resolved case 不会因 issue 编辑自动重新打开。

## 启动与部署

需要 Node 24。在本目录执行：

```sh
npm ci
node configure-secrets.mjs
npm run db:local
npm run dev
```

本地 `.dev.vars` 保存四个随机 token 和可选 `DEEPSEEK_API_KEY`，已忽略提交。管理员令牌只在控制台当前内存中使用，不进入 URL 或浏览器存储。请用密码管理器保存，退出会清空控制台内容。

Cloudflare 新账户初次部署：

```sh
npx wrangler login --scopes account:read user:read workers:write d1:write queues:write
npx wrangler d1 create super-agent
npx wrangler queues create snowforce-agent-tasks
npx wrangler queues create snowforce-agent-dead-letters
```

将生成的数据库 ID 写入 `wrangler.jsonc`；当前配置已绑定本次部署创建的数据库，已有资源不应重复创建。

```sh
npm test
npm run test:coverage
npm run build
# 同时在仓库根目录运行 npm test、npm run test:coverage、npm run build。
npm run db:remote
npm run deploy
node configure-secrets.mjs --upload
```

默认 `AI_ENABLED=false`。只有填写 DeepSeek key、上传 secrets 后，才将其改成 `true` 并重新部署。缺少配置时 UI 会明确显示 DeepSeek 未启用；规则分类继续运行。不要将生产数据库、Stripe 或其他客户密钥放进本服务。

## 用量与费用

月预算默认 $5，单 case 累计默认 $0.05，50% 显示预警，80% 熔断所有新 DeepSeek 调用，保留剩余额度应对差异。人工暂停同时阻止新 AI 和新 Codex 领取；已在途工作可能继续完成。事件接收始终保留。

所有金额用整数 micro-USD 保存（1 USD = 1,000,000）。DeepSeek 2026-11-08 高峰费率作为保守估价：输入 $0.30/M、缓存输入 $0.006/M、输出 $1.20/M。以输入 UTF-8 byte bound + framing allowance、512 最大输出 token 预留费用；禁用 thinking 模式。provider 返回真实 usage 后结算。错误、超时、异常 usage 和进程崩溃不释放预留金额，记作 uncertain 等待核对。无自动 provider 重试；每个 case 最多三次人工触发的分析。

预算预留通过一个原子 SQLite INSERT…SELECT 判断本月、case 累计以及全局并发；不能在不同 Worker 中绕过账本直接调用付费模型。统计日/月按 UTC，前端明确标注。费率变动、未知供应商行为、其他应用共用 API key、基础设施、Codex 套餐及 Docker 计算费用不属于这个内部账本；它不是供应商总账单的硬上限。建议使用独立 DeepSeek key，并定期核对供应商账单。

参考：[DeepSeek 费率](https://api-docs.deepseek.com/quick_start/pricing/)、[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[Codex 非交互运行](https://learn.chatgpt.com/docs/non-interactive-mode)、[D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)。

## GitHub 接入

在 `Snow-force/snow-force` 仓库 Settings → Webhooks 添加：

- URL：`https://<worker-origin>/webhooks/github`
- Content type：`application/json`
- Secret：本机 `.dev.vars` 中的 `GITHUB_WEBHOOK_SECRET`
- 仅选择 Issues 事件；保持 TLS 验证。

端点仅接收 `issues.opened`，验证 raw body HMAC、delivery id 和仓库全名，忽略其他操作。未经验证的输入不会进入队列。默认最大 body 64 KiB，超过会返回 413。规则分类使用 issue 标题，不存正文。管理员在控制台填入脱敏技术摘要后可调用 DeepSeek。该确认步骤用于避免将任意私人 issue 正文误传给第三方。

support/monitor 的可信适配器可以 POST `/api/ingest`，使用 `Authorization: Bearer <INGEST_TOKEN>`，JSON 为 `{ "source": "monitor", "key": "stable-incident-key", "title": "Checkout error", "summary": "Sanitized technical summary" }`。调用方负责稳定 key、去除个人资料和上游鉴权。此 token 不能批准调查或领取 Runner 工作。

## Codex 执行器

本次用户选择独立云端执行。新增 `cloud-controller.mjs` 与 `cloud/Dockerfile`：轻量 Railway service 每 30 秒领取已批准任务，按需创建隔离 Sandbox，最多执行 20 分钟；每条命令另有超时，结束显式销毁，异常遗留由 1 分钟 idle timeout 回收。Sandbox 不加入生产私有网络，也不接收 Railway project token、Worker token、GitHub token 或客户数据库凭据。Codex 独立登录凭据在模型执行后、测试之前清空。源代码来自 GitHub 部署时的仓库快照，Docker 专用 ignore 排除本机密钥与运行状态。供应商 Sandbox API 为实验功能，外部兼容性需要实机验证。

控制服务绑定新 Railway 项目的 production Project Token（`RAILWAY_TOKEN`），不使用可访问商城的账户级 token。环境还需 `SUPER_AGENT_URL`、`RUNNER_TOKEN`；`CODEX_AUTH_JSON` 是专门给云端执行器登录后取得的 ChatGPT auth.json 内容，未配置时 `/health` 明确报告 `ready:false`，不会领取任务。不要将日常本机登录凭据直接复制到云端。`PUBLISH_DRAFT_PR` 仍默认 false，启用前必须提供受限 `GITHUB_TOKEN` 并完成真实 PR 验收。Sandbox 中刷新的 Codex 授权会通过只限本项目的凭据更新到同一控制服务，并跳过重新部署；授权失效或被撤销时仍需重新登录。

云端项目：`SnowForce Super Agent`，项目 ID `f3ef22c7-7183-40ab-a52a-7c8b878ca75c`，production `e18f3d3b-7e06-4a75-9189-dbc0ac790f20`，controller service `1a50ea5d-212c-4001-a31a-18d54a686820`。控制器上限 0.5 CPU / 0.5 GB；任务 Sandbox 上限 4 CPU / 4 GB。这些是资源上限，不是包月费用或账单硬上限；Railway 账单与内部 DeepSeek 账本分开。

以下 Docker supervisor 是可选的独立 Docker 主机路径，不在现有商城服务中运行。

在独立 Docker 主机上构建镜像：

```sh
docker build -t snowforce-agent-runner:0.1 runner
```

在隔离的 Codex 配置目录中执行官方 `codex login`，使用 ChatGPT 套餐授权。不要复制整个日常 Codex 配置目录；Runner 只需要该环境的 `auth.json`。不使用 OpenAI/DeepSeek API fallback。

Supervisor 的环境：

```text
SUPER_AGENT_URL=https://<worker-origin>
RUNNER_TOKEN=<from-local-secret-file>
CODEX_AUTH_FILE=<absolute-path-to-isolated-chatgpt-auth.json>
PUBLISH_DRAFT_PR=false
# 只有启用 PR 发布时才提供仓库 Contents/Pull requests 写权限的 GITHUB_TOKEN。
```

执行 `npm run runner` 领取一个批准的任务。可由你自己的主机调度器反复调用。先完成镜像与 auth preflight 才领取任务；控制服务全局只发放一个调查租约，30 分钟到期后标记 failed 并要求人工审核，不自动重复执行可能已有副作用的任务。

Runner 在临时 clone 中固定基准提交，将 clone 和隔离 Codex auth 挂载给容器；Worker token、GitHub token、生产凭据不传入容器。Codex 使用 workspace-write、关闭 shell 网络权限、不加载用户配置/execpolicy；若宿主不支持 sandbox，必须停下排查，不能改成 bypass。Docker 主机须满足 bind mount 权限（容器 node 用户可读写 clone，并可读写隔离 auth）。npm install 与验证在没有 Codex auth 挂载的另外容器内执行，验证容器禁用网络。

验证包括根目录测试、覆盖率和生产构建。修改本服务也运行本服务测试/构建。Draft PR 发布默认关闭；设置 `PUBLISH_DRAFT_PR=true` 后，只允许 `src/` 和本服务内最多 30 个普通文件，每个不超过 200 KB；隐藏文件、依赖、AGENTS、Runner、凭据、删除、symlink 和其他路径必须人工处理。GitHub 凭据仅由 host publisher 使用。当前不自动修改 Commerce，因此不触发其额外测试。所有 PR 均为 draft；不合并、不部署、不发送客户消息。

仓库为私有时，clone 需要宿主已配置受限 GitHub 读取凭据。失败日志/补丁保留在本机 reports 和临时工作目录，人工审查后清理；Runner 会清空复制的临时 auth。请使用一次性主机或隔离系统账号。Runner 实机 Docker/套餐执行和 Draft PR 的上线验收需在所选主机完成；单元测试不代表这条外部链路已验证。

## 运维与恢复

- `/health` 只报告服务存活，不代表 DeepSeek 或 Runner 就绪；控制台会分别显示 AI 配置状态。
- 所有 `/api/*` 数据读写要求管理员令牌；Runner 和 ingress 使用不同 token。
- 队列消费者失败使用有限指数延迟；DLQ 留存消息；cron 重新投递数据库内 pending case。
- triage 重启后悬挂的 reserved 费用转 uncertain；case 回到等待审批。
- Runner 超时之后迟到结果会因 lease token/expiry 校验被拒绝。先检查本机报告或分支再决定重新批准。
- 无自动邮件发送、付款、退款、生产数据库变更、main 合并或部署路径。
- 不向日志输出请求正文、令牌或 provider 返回错误；浏览器仅用 textContent 渲染不可信内容。
