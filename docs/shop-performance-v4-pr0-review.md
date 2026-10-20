# 商城性能 v4：PR-0 核对与 PR-1 / PR-2 执行材料

核对日期：2026-10-20。部署与日志查询截止：08:56:31 UTC。

后续 main 候选门禁、真实浏览器观测、成功 3DS 与 Cash App Sandbox 授权/撤销结果见 [隔离验收进度](shop-performance-v4-acceptance-progress.md)。本文保留首轮核对时点，不将后续结果回填为当时已经完成。

本文件是对会话中 v4 摘要的补充。会话提及的 32 KB / 310 行完整 Markdown 未提供，不能认定其具体要求已全部复核。此轮未修改商城源码、生产配置、Redis、数据库或支付逻辑，未发起任何资金操作。

## 1. 当前结论

PR-0 已核实版本、区域、Trace 和公开采集端点；代表性浏览器性能基线、完整跨层关联仍待补齐，因此 PR-0 尚未全部验收。PR-1 可复用已经合并的 PR #38，但生产启用前仍有明确的 Sandbox 验收缺口。PR-2 应先形成完全隔离的区域对照实验。

不能将 SDK 预热、Web 区域迁移和后端读取优化同时发布并归因。现有 Railway 暂存包包含读取优化开关，不能作为 PR-1 的一键发布包使用。

## 2. 本次实际核对的版本与配置

| 对象 | 核对结果 | 含义 |
| --- | --- | --- |
| 本地工作区 | `codex/shop-optimization-v1`，`68007e9` | 本地早于现网观测与 main 预热代码；保留原有未提交文档及输出文件 |
| GitHub main | `ab573fc31138f9f7e2cc3e6126650f1119433696` | 已包含 PR #38；该提交的 GitHub Test and production build 为 success |
| PR #36 | merged，`c420c2c` | 观测代码 |
| PR #37 | merged，`1f97bee` | Web Docker 构建修复 |
| PR #38 | merged，`ab573fc` | Stripe SDK / 支付模块预热；默认关闭；尚未部署 |
| Railway Web | SUCCESS，`1f97bee`，实际部署区域 `sfo` | 部署 ID：`b0ad5943-fd41-4d4f-b4fa-72cf2c755293` |
| Railway Commerce | SUCCESS，`c420c2c`，`us-east4-eqdc4a` | 部署 ID：`7fd342bb-bf9a-4c3c-ad06-954d1923c305` |
| Railway Redis | SUCCESS，配置区域 `sfo` | `/data` Volume 为 512 MB，Volume 区域也为 `sfo` |
| Supabase PostgreSQL 区域 | 此轮未独立核对 | v4 摘要称 US East；不得将该描述冒充本次云端核验结果 |
| PR #35 | open，未合并 | 已存在购物车所有权 / payment preflight 读取去重实现，后续 PR-3 应先审查，避免重复开发 |

Railway 当前暂存包 `b2de2a43-2321-441f-91c2-d7a0550ff591` 仍是 STAGED，包含三个字段变更：删除 Web 的 SFO 区域、添加 US East 副本，以及添加 `SHOP_CHECKOUT_OPTIMIZED_READS`。后者的值被脱敏，不能认定其已生效或可安全启用。此轮保留该暂存包，未执行 accept-deploy。

Web 变量名清单没有 `SHOP_STRIPE_PREWARM` 或 `SHOP_STRIPE_PREWARM_SAMPLE_RATE`。变量名清单不能证明其他观测变量的具体值；历史记录中的 10% 采样率不等于本次确认的运行值。

## 3. 性能证据及测量边界

以下为 2026-10-20 UTC 的单次生产请求，均通过 Railway get-trace 复核，四条 Trace 均未截断。

| 请求 | Trace ID | 耗时口径 | PostgreSQL Span 数 | Redis Span 数 |
| --- | --- | --- | ---: | ---: |
| 原生加购 | `a7e7232031aa10952c14b77924727cc2` | HTTP edge 3,900.540 ms；Commerce handler 3,824.864 ms | 151 | 26 |
| 继续付款的 Web POST | `a416453b0743834fb44ec1fa0a829d75` | HTTP edge 21,916.113 ms；Web handler 21,880.674 ms | 不适用 | 不适用 |
| Draft Commit | `f2bc575fd7ceba44ec7c64915a44b385` | HTTP edge 12,818.132 ms；Commerce handler 12,742.154 ms | 387 | 56 |
| Payment Prepare | `98328f7da4d09e4d72b110e8f39913f3` | HTTP edge 7,693.507 ms；Commerce handler 7,619.810 ms | 161 | 26 |

21.916 秒 Web Trace 中，两个串行客户端调用分别耗时 12,821.863 ms（Draft Commit）和 7,695.821 ms（Payment Prepare）。后端内部请求由独立 Trace 导出，时间和路由匹配；仍需 operationId / 父子上下文确认完整跨层关联，不能声称四条记录属于一个完整分布式 Trace。

原生加购的 list-traces 总包络为 4,032.634 ms，而 get-trace 的 HTTP edge 为 3,900.540 ms。包络会包含最后结束的子 Span；报告比较时应固定一种口径，避免把两者混用。

三个 Commerce 样本中 Redis Span 中位数约 61.5 ms，PostgreSQL Span 中位数约 20.8–22.0 ms。Draft Commit 出现 5 组 account/settings/registrations 外部读取；Payment Prepare 出现 4 组。这支持调查同请求内税务证据复用和跨区域 Redis，但不能证明所有调用均可省略，也不能据此计算迁移的确定收益。

Span 数不是唯一 SQL 数；客户端 Span 包含网络、等待和返回处理，不等同于数据库执行时间。并行 Span 的耗时不能直接相加，也不能把其总和当作可节省时间。上述样本不建立 p95，不测量浏览器 Stripe 表单可输入时间，也不代表持续生产流量的整体表现。

## 4. PR-0 尚缺的观测验收

对两个服务的 deploy 日志查询：过滤 `snowforce.shop_performance`，窗口为 `2026-10-18T20:51:00Z` 至 `2026-10-20T08:56:31Z`，上限各 500 条，Web / Commerce 均返回 0 条。只能得出本次查询没有采集到该类记录，不能推断没有交易、采样关闭或日志实现损坏。

对 `snow-force.com` 和 `www.snow-force.com` 各做了三次有界 HTTP 检查：health 为 200，同域空对象采集请求为 400，外域请求为 403。请求不含 Cookie、operationId 或有效观测载荷，不生成合成绩效样本。结果证明这两种拒绝路径当前有效，不能证明浏览器到日志的完整链路有效。

PR-0 后续步骤：

1. 核实两端运行中的 timing 开关与采样值；仅记录开关、采样率和 revision，不导出凭据或完整环境变量。
2. 在隔离环境跑一次真实浏览器加购，核对 browser/web/commerce 的同一 operationId，以及实际原生 SQL / Redis Trace 的关联。保留原有观测实现，不另建一套计时系统。
3. 生产自然流量分别收集新购物车、已有购物车、优惠码、支付锁场景。付款就绪起点为继续付款点击，终点为 Element onReady 且 Stripe / Elements 可用。
4. 固定 revision、设备、网络及实验条件，对照成功、业务拒绝、错误、超时与缺失终点数。重复访问必须额外标记真实冷热条件；`subsequent` 本身不证明热缓存。
5. 使用已合并的 `scripts/shop-performance-summary.mjs` 输出分组分位数。每组不足 100 条 p95 或 1,000 条 p99 需保留低样本提示；达到该数量也不自动构成统计显著或性能通过。

v4 的加购 p95 ≤2 秒、热付款表单 p95 ≤5 秒是新目标，尚未实现；旧 v3 文档中的目标不同，后续实施 PR 必须明确采用的版本。

## 5. PR-1：复用 PR #38 的发布与验收步骤

候选源码为上述 main 提交。先在隔离环境基于该提交重新运行质量门禁；本地旧分支的通过结果不能替代候选版本验收。不要重写预热实现，也不要顺带合并 PR #35 或应用暂存区域变更。

预热只下载 SDK 和静态模块。真实 PaymentIntent 创建、条款确认、当前报价核验、所有权、库存、金额核对和 Manual Capture 均沿用原有受保护路径。当前实现按 Checkout mount 分组，并非持久用户分组；重复 mount 应纳入实验解释。

PR #38 记载已验证 SDK 失败重试、原 intent 恢复、失败 3DS、35 秒延迟 prepare、取消后相同地址重新估价。仍须补齐：成功 3DS；可支持的钱包 / 异步付款完整闭环；桌面和移动设备限速矩阵。仅展示 Cash App 面板不能作为钱包支付验收。

建议发布顺序：

1. 隔离 Sandbox 补齐上述缺口，并验证新旧购物车、优惠码、库存改变、配送 / 自提、地址变化、跨标签页、报价过期、重复点击、网络中断恢复，以及支付拒绝。
2. 先部署候选源码且保持预热关闭，确认实际 serving revision、区域和健康状态，保留 rollback 部署；单独记录这次源码发布。
3. 基线可观测且安全矩阵通过后，再单独启用 `SHOP_STRIPE_PREWARM=true`、`SHOP_STRIPE_PREWARM_SAMPLE_RATE=0.1`。观测采样与预热采样独立，10% 预热与 10% 观测的交集可能很小，应事先估算每组有效样本量。
4. 同 revision / 场景 / 设备 / 网络 / 访问条件内比较 baseline 和 prewarm 的完整 `payment.interactive`，并核对失败、超时和缺失终点。SDK 残余等待变短不代表用户总等待达标。
5. 任一重复订单、金额不一致、跨客户访问或状态误判，立即停止扩大并关闭新路径。普通性能退化的数值阈值和观察窗口需在启用前固定；不能事后按结果挑选。

回滚是关闭预热并发布同一源码，刷新已打开的页面；保留付款、报价、幂等和恢复证据。不要清空 Redis 或删除 PaymentIntent 来完成回滚。

## 6. PR-2：完全隔离的 Redis 区域对照实验

此轮未创建任何付费资源或实验环境。正式迁移仍是独立工作和独立维护窗口。

实验须使用相同 Commerce 构建、相同资源配额、相同合成业务数据及数据库配置、相同 Redis 版本 / TLS / 持久化配置。后端固定在 US East，分别连接隔离的 SFO Redis 和隔离的 US East Redis；不得把实验后端连接现有生产 Redis 来当作对照。

实验数据库、Redis、锁、队列、Webhook、存储及 Stripe Sandbox 必须与生产隔离；不能只换 Redis 却仍让测试操作写生产数据库、投递生产队列或发送真实邮件。禁止两个实验组同时共享购物车锁或消费同一队列。

交替顺序执行相同场景，区分预热与正式测量样本，并控制并发和后台工作负载。记录端到端 `/line-items`、Draft Commit、Payment Prepare、Redis Span 数 / 时间、SQL 数、错误 / 超时、队列积压和锁冲突。保存版本、地区、样本量、分组方法、实验时段及不确定性。收益门槛和安全门槛需在采样前固定；样本不足时只能报告方向。

只有同区域收益和安全验收足够，才提交生产迁移方案。该方案至少应包含：可恢复备份与恢复演练、停止新写入及 worker / scheduler 的次序、在途任务清点、幂等与付款恢复核对、持久化完整性、切换时的唯一锁域与唯一队列消费方，以及重新开放流量的条件。已在新实例接受写入后，回滚前必须停写并对账或同步新增状态，不能直接切回过期实例。

Railway 官方文档明确：带 Volume 的区域迁移需要移动数据并会停机。不能把 Redis 按流量百分比切换，也不能承诺无停机。

## 7. 验证与交付边界

此文件为只读核对及执行材料，未完成 PR-1 发布、PR-2 实验或任何 p95 验收。没有重置、切换或清理用户工作区；原有未提交修改保留。

远端候选提交的 GitHub 质量门禁已确认 success。本次本地 `npm test` 通过（179 个文件、1,168 个测试）；`npm run build` 通过（含 ESLint、TypeScript 与生产构建），日志未发现测试 stderr、React act 警告或构建警告。仅新增文档与核对输出，未新增或修改测试，因此未重复运行覆盖率。本地验证仅适用于 `68007e9` 所在工作区，不能替代 main 候选提交、隔离 Sandbox 或生产验收。

本次证据：`output/incidents/2026-10-20-v4-pr0-evidence.json`。本地门禁日志：`output/incidents/2026-10-20-v4-pr0-local-tests.log` 和 `output/incidents/2026-10-20-v4-pr0-local-build.log`。

## 来源

- [PR #36：性能观测](https://github.com/Snow-force/snow-force/pull/36)
- [PR #37：Web 构建修复](https://github.com/Snow-force/snow-force/pull/37)
- [PR #38：预热实现及未完成验收](https://github.com/Snow-force/snow-force/pull/38)
- [PR #35：已有读取去重实现](https://github.com/Snow-force/snow-force/pull/35)
- [main 候选提交](https://github.com/Snow-force/snow-force/commit/ab573fc31138f9f7e2cc3e6126650f1119433696)
- [候选提交质量门禁](https://github.com/Snow-force/snow-force/actions/runs/39391410762/job/118523560613)
- [PR-A 观测口径](https://github.com/Snow-force/snow-force/blob/ab573fc31138f9f7e2cc3e6126650f1119433696/docs/shop-performance-v3-observation.md)
- [预热开关、验收与回滚](https://github.com/Snow-force/snow-force/blob/ab573fc31138f9f7e2cc3e6126650f1119433696/docs/shop-stripe-prewarm-v3.md)
- [Railway 区域与 Volume 迁移](https://docs.railway.com/deployments/regions#volumes)
- 部署、暂存包、日志和 Trace：本次 Railway 只读 API 查询；以上给出部署及 Trace ID 供原项目复核。
