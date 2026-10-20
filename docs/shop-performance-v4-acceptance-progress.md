# 商城性能 v4：main 候选版本隔离验收进度

日期：2026-10-20。接续 [PR-0 初步核对](shop-performance-v4-pr0-review.md)。本轮推进到候选源码门禁、真实浏览器跨层观测、成功 3DS 和 Cash App Sandbox 授权及撤销；生产预热发布与 Redis 区域实验尚未实施。

## 候选版本与隔离边界

- GitHub main：`ab573fc31138f9f7e2cc3e6126650f1119433696`，已有 PR #38 的实现直接复用。
- 新工作树：`C:/Users/123/.codex/worktrees/shop-performance-v4-acceptance/snow-force`。未改动旧工作树 `codex/cart-edit-latency`，未重置原工作区的未提交修改。
- 从已停止的旧本地 Sandbox PostgreSQL 复制独立集群，端口 `55436`。旧集群与生产数据库连接均未用于商城业务写入。
- 本地 Web `3104`、Commerce `9004`，Stripe 使用原独立 Sandbox，保持 `capture: false` / Manual Capture；邮件关闭，后台订单同步目的地限定为未运行的本地端口。
- 测试 Web 不持有 Supabase 管理写入密钥，因此前端完成订单时也不能向生产订单投影写入。这会在原生订单完成后显示恢复提示，是本轮刻意保留的隔离边界，不能作为完整订单投影端到端验收。
- Supabase 共用 Auth 目录只创建一个 `@example.invalid` 合成身份及对应资料、同意记录；本轮结束时均已精确删除、撤销全部会话，生产订单投影为零。没有改变真实客户或实际资金。
- 本地未连接 Redis，使用 Medusa 本地内存组件；这些数据不能验证生产锁、队列、Redis 或跨区域性能。

本轮无商城运行源码、依赖、迁移或生产配置变更。新工作树 Redis 配置因 Windows checkout 转为 CRLF 导致既有断言失败，已恢复与 Git blob 相同的 LF 字节；`git diff --exit-code` 确认没有内容差异，未修改配置项或测试断言。

## main 门禁结果

| 检查 | 结果 | 证据文件（`output/incidents/`） |
| --- | --- | --- |
| Web `npm test` | 186 个文件，1,209 个测试通过 | `2026-10-20-v4-main-web-attempt2-0.log` |
| Web `npm run test:coverage` | 完整运行通过 | `2026-10-20-v4-main-web-attempt2-1.log` |
| Web `npm run build` | ESLint、TypeScript、生产构建通过 | `2026-10-20-v4-main-web-attempt2-2.log` |
| Commerce `npm test` | 749 通过，0 失败、0 跳过 | `2026-10-20-v4-main-commerce-attempt3-0.log` |
| Commerce `npm run typecheck` | 通过 | `2026-10-20-v4-main-commerce-attempt3-1.log` |
| Commerce `npm run build` | backend / admin frontend 均通过 | `2026-10-20-v4-main-commerce-attempt3-2.log` |

首次 Web 验证脚本错误注入应用运行环境，导致 37 个断言失败及图片校验异常；已改为干净的单测环境后完整重跑，失败日志保留在 `2026-10-20-v4-main-web-0.log`。首次 Commerce 有一个按 LF 分行的配置断言失败，原日志保留在 `2026-10-20-v4-main-commerce-attempt2-0.log`；恢复标准 checkout 字节后完整重跑。

测试服务器初次用 `next start` 启动产生 standalone 配置警告，已停止该实例并改用 `.next/standalone/server.js`。Medusa 本地 Event Bus / 内存锁提示保留，作为本轮环境限制，不代表生产组件已验证。

覆盖率不是 100%：全 Web 行覆盖率为 62.73%，分支覆盖率 58.24%。既有 `src/lib/payments` 的退款/持久化等分支仍有缺口，`return-status.ts` 本次报告为 0%；该目录还包含活动支付，不能将其数字直接当作 Medusa 商城覆盖率。后续资金路径重构仍需针对变化补测试和 Sandbox 场景；本轮没有以覆盖率通过替代安全验收。

## PR-0：已补齐的证据

1. 生产 `/shop` 页面实际下发 `timingSampleRate=0.1`，revision 为 `1f97bee42fdd3ef179bc0e78245d5921223bb1d8`。这证明本次响应启用了浏览器采样配置；Commerce 的变量值仍因连接脱敏未直接核实。
2. Supabase 项目清单确认 Snow-Force web 的区域为 `us-east-2`，状态 ACTIVE_HEALTHY。
3. 对生产 Web / Commerce 的日志继续查询到 `2026-10-20T18:51:54Z`，本次新增窗口 `08:56:31Z–18:51:54Z`、过滤 `snowforce.shop_performance`，各 500 条上限，仍各返回零条。不能推断没有业务流量或观测损坏。
4. 在 main 的真实浏览器中执行桌面新购物车、桌面已有购物车、移动视口新购物车三次加购；三次均由同一个 operationId 贯穿 browser / web / commerce，并由服务端确认成功。
5. 导出 284 条本地结构化观测，复用已有 `scripts/shop-performance-summary.mjs` 进行分组汇总，没有新增一套埋点。

以下是单个本地样本，**不是 p95，不是生产基线，也不是预热对照实验**：

| 场景 | 浏览器口径 | 单次耗时 |
| --- | --- | ---: |
| 桌面新购物车加购 | `action.return` | 1,821 ms |
| 桌面已有购物车加购 | `action.return` | 1,190 ms |
| 移动视口新购物车加购 | `action.return` | 1,768 ms |
| 桌面配送继续付款 | `payment.interactive` | 6,090 ms |
| 移动视口自提继续付款 | `payment.interactive` | 5,740 ms |

后两次均为 prewarm 组、普通网络，场景不同，不能互相比作性能提升。本轮没有 baseline 组，也未证明真实热缓存条件。SDK 挂载后残余等待只有 3–4 ms，但完整付款就绪仍需 5.74–6.09 秒，不能据此宣布 v4 的 ≤5 秒目标达成。

证据：`2026-10-20-v4-isolated-observations.ndjson`、`2026-10-20-v4-isolated-summary.json`、`2026-10-20-v4-isolated-results.json`。

PR-0 仍缺：代表性生产样本和同一操作与 PostgreSQL / Redis Span 的完整关联。本地环境没有安装额外 OTel provider 或数据库驱动，不伪造 SQL/Redis 耗时。

## PR-1：本轮新增付款验收

### 条款与预热边界

在首个付款动作前，核实隔离购物车只有一个真实合成客户、零付款 Session、零订单。预热已启用，条款未确认前没有创建真实付款。之后仅通过产品原有报价、条款确认和受保护准备动作创建各用例的付款。

### 成功 3DS：桌面配送

- 使用 Stripe 官方 `4000000000003220` 测试卡，进入官方 3DS 测试挑战页并选择 COMPLETE。
- Stripe 返回 `three_d_secure.result=authenticated`、`authentication_flow=challenge`，付款状态 `requires_capture`。
- 与当前购物车、Session、订单、币种、显示金额逐项核对；原生唯一订单为 `authorized`，没有重复订单或追加付款。
- 调用本地 Medusa 原生订单取消工作流。最终 Stripe 为 `canceled`，原生订单为 `canceled`，已收取金额和可捕获金额均为零。

### Cash App：移动视口自提

- 390×844 视口下完成自提联系资料、合成预约确认、税费报价和条款确认。
- 选择 Cash App Pay，触发官方 QR 指引，点击 Simulate scan，在官方测试页核对测试金额后选择 AUTHORIZE TEST PAYMENT，返回本站 `/shop/checkout/return`。
- Stripe 返回 `cashapp` 的 `requires_capture` 授权；原生唯一订单为 `authorized`，金额与本轮自提报价一致。
- 通过 Medusa 原生取消工作流撤销未捕获授权。最终 Stripe / 原生订单均为 `canceled`，已收取和可捕获金额均为零。

这是桌面浏览器在移动视口中的官方模拟扫码流程，不能代替真机 Cash App 深链或所有钱包。此轮没有接入 Webhook 转发，也没有借此声称异步 Webhook / 订单投影完整验收。

两个用例结束时：两个隔离购物车、两个原生 Session、两个已取消订单、两个已取消 Sandbox Intent；未调用 capture，零已收取 / 可捕获资金。财务、幂等和恢复记录保留；临时身份已清理，本地服务器和独立数据库均已停止。

证据：

- `2026-10-20-v4-before-payment.json`
- `2026-10-20-v4-payment-checkpoints.ndjson`
- `2026-10-20-v4-final-money.json`
- `2026-10-20-v4-checkout-fixture-cleanup.json`
- `2026-10-20-v4-3ds-recovery-guard.jpg`：订单投影写入关闭时，授权后的重复付款按钮保持禁用。它不是订单同步成功截图。

## 当前发布条件与下一步

生产部署复核仍为 Web `1f97bee` / SFO，PR #38 未部署，预热未启用。本轮最后检查 Railway 暂存包仍为 `b2de2a43-2321-441f-91c2-d7a0550ff591`、STAGED、三个字段变更；未接受或覆盖该暂存包。

main 源码门禁已补齐；若单独部署源码，必须保持预热关闭、保留 Web 区域及现有暂存包，避免混入读取优化或基础设施实验。启用预热仍须补齐：

1. 桌面 / 移动的真实限速网络矩阵。当前浏览器能力只有视口与可见性，没有网络限速；未用普通网络、伪造 network 标签或单纯延迟后端响应替代慢网验证。
2. 独立订单投影写入环境及完整异步 Webhook / 恢复链路。本轮为避免生产业务写入刻意关闭这些路径，未绕过同步校验来生成成功页面。
3. 已有计划规定的优惠码、库存变化、地址修改、跨标签页、报价过期、重复点击和中断恢复完整矩阵；自动测试通过不意味着本轮已逐项做完浏览器验收。
4. 足够的同版本 baseline / prewarm 生产样本和失败、超时、缺失终点统计。

PR-2 的 US East / SFO Redis 原生链路 A/B 尚未运行。必须使用独立的云端 Commerce、数据库、两个 Redis 以及隔离锁/队列/Stripe Sandbox；本轮本地内存组件数据不具备替代效力。生产 Redis 与 Volume 未迁移。

## 官方测试依据

- [Stripe 测试卡和 3DS 场景](https://docs.stripe.com/testing#regulatory-cards)
- [手动捕获与受支持付款方式](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method)
- [Cash App Pay / Elements / Payment Intents](https://docs.stripe.com/payments/cash-app-pay/accept-a-payment?payment-ui=elements&api-integration=paymentintents)

以上通过 Stripe CLI 1.53.0 的 `docs` 命令读取。技能中旧 `/references/payments` 地址返回 404，已改用上述现行官方页面。

## 2026-10-20 后续发布授权

经营者随后明确要求“全部 commit and push main and deploy”。本轮据此将当前工作区可提交的手册、PDF、商品图册、计划和验收材料纳入 main，并整合已有 `68007e9` 的后端购物车重复读取优化（原 PR #35）。该授权更新了上文仅发布旧 main 的范围；合并后重新运行网站测试、覆盖率、生产构建及 Commerce 测试、类型检查、构建。

部署采用兼容后端先行、网站随后发布的顺序，固定到已推送且验证通过的同一提交。网站 Stripe 预热明确保持关闭；Web 保持 SFO，Commerce 保持 US East，Redis 与 Volume 保持原位。现有 Railway 区域及实验读取开关暂存包不接受、不删除。没有数据库迁移，也不新增真实收付款。

`.env`、私有缓存、依赖缓存和工具附件状态不进入 Git。文本凭据扫描的命中已复核为官方文档示例及“已验证”描述，没有把它们误报成有效密钥。产品图册和既有验收材料作为私有仓库资料保存，不进入受限 Web Docker 构建上下文。

发布授权不等于性能达标；慢网、完整异步 Webhook / 订单投影、同条件预热对照及 Redis A/B 仍按上文保留为待验收事项。正式部署结果以 Railway SUCCESS、GitHub 提交和正式域名返回的版本共同核对，不能仅凭触发构建认定成功。

合并后的最终发布门禁已通过：网站 186 个文件 / 1,210 项测试、全量覆盖率及生产构建；Commerce 751 项测试（零失败、取消或跳过）、类型检查、后台和管理界面构建。新增测试验证 Git 忽略私有运行文件与工具缓存，同时保留计划、手册和图册等交付文件。网站覆盖率仍为 statements 62.28% / branches 58.24% / functions 59.20% / lines 62.73%，既有未覆盖路径没有因本次发布被隐去。

864 个部署源码 / 配置 / 测试文件已与隔离构建目录逐个核对一致。网站最终日志为 `2026-10-20-v4-main-web-attempt5-{0,1,2}.log`，Commerce 为 `2026-10-20-v4-main-commerce-attempt4-{0,1,2}.log`，均在本地忽略的日志文件中保留。未发现测试 / 构建告警；隔离 Medusa 的 fake Redis 是预期本地配置说明，不代表生产 Redis 已参与本次构建或通过区域实验。
