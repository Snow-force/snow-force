# Stripe Live 上线状态与扩展路线

| 项目 | 内容 |
|---|---|
| 状态 | 已完成并通过生产验收 |
| 最后核验日期 | 2026-07-19 |
| 主要读者 | 开发与运维 |
| 范围 | SnowForce 活动报名的一次性 Stripe 支付 |

## 1. 当前结论

SnowForce 的 Stripe 支付链路已经从 Test Mode 安全切换到 Production Live Mode，并通过一次真实的 1 美元交易完成端到端验收。付款、webhook、正式报名生成、全额退款和 QA 数据清理均已验证。

当前生产版本适合处理银行卡一次性付款。Development、Preview 和本地开发继续使用 Test Mode，避免测试操作产生真实收费。

本文件记录实际生产状态。若其内容与上线前的设计或实施计划存在差异，应以本文件和当前生产配置为准。

## 2. 已完成事项

### 2.1 Checkout 与服务端安全

- Checkout Session 已明确设置 `payment_method_types: ["card"]`。
- Stripe SDK 仅在服务端使用，未进入客户端 bundle。
- 付款发生在 Stripe Hosted Checkout，SnowForce 不接收或保存卡号。
- Checkout 金额由服务端根据活动和报名数据计算。
- Webhook 不信任客户端或 metadata 中的金额，而是重新读取数据库记录进行校验。
- webhook 路由使用原始请求正文和 `stripe-signature` 验签。
- `stripe_webhook_events` 以 Stripe event ID 去重，避免同一事件重复处理。

### 2.2 生产环境

- `https://snow-force.com` 已部署包含 card-only Checkout 的生产版本。
- Vercel Production 已配置 Stripe Live Mode secret key、publishable key 和 webhook signing secret。
- Vercel Development 与 Preview 保持 Test Mode。
- 生产 webhook endpoint 为 `https://snow-force.com/api/stripe/webhook`。
- 当前 webhook 订阅事件为 `checkout.session.completed`。
- 首页和会员页生产 smoke test 均返回 HTTP 200。
- 无效 webhook 签名请求返回 HTTP 400。

### 2.3 自动化验证

- `src/lib/payments/actions.test.ts` 已覆盖 `payment_method_types: ["card"]`。
- 支付模块测试通过：10/10。
- 全量 Vitest 通过：43 个测试文件、232 个测试。
- `npm run build` 通过；仅保留已有的 `<img>` 提示，不影响本次支付上线。

### 2.4 真实交易验收

- 创建了临时 1 美元 Production Live Mode 活动。
- 已验证会员完成真实银行卡付款。
- Stripe Live charge 金额为 100 美分，付款状态为成功。
- Vercel 收到 `checkout.session.completed`，webhook 返回 HTTP 200。
- pending registration 被提升为正式报名。
- 正式报名财务状态已验证为 `deposit_status=paid`、`payment_method=stripe`。
- webhook 去重记录只生成一次。

验收标识只保留非敏感后缀：

| 对象 | 标识后缀 | 最终状态 |
|---|---|---|
| Charge | `3odNkMu4` | 已全额退款 |
| PaymentIntent | `3BQ53pYS` | 付款成功 |
| Refund | `3rAryb1z` | `succeeded` |

### 2.5 退款与 QA 清理

- 1 美元真实付款已全额退款。
- Stripe 最终状态已验证为 `amount_refunded=100`、`refunded=true`。
- 临时活动 `stripe-live-qa-20260719` 已删除。
- QA 正式报名、活动详情模块和对应 webhook 去重记录已删除。
- pending registrations、报名问题、收藏、活动回顾和免责记录均确认无残留。
- 删除后对 `events`、`registrations`、`pending_registrations`、`event_detail_modules`、`event_registration_questions`、`saved_events`、`event_recaps`、`waiver_acceptances` 和 `stripe_webhook_events` 执行了逐表计数核验，结果均为 0。

### 2.6 Git 与密钥文件

- `.stripe-live.env` 已加入 `.gitignore`，不会被 Git 跟踪。
- `.stripe-live.env` 当前保留在本地供受控运维使用。
- 未在代码、Git、文档或最终输出中记录完整 Stripe 密钥。
- 上线相关提交：
  - `f208f12`：Stripe Live 上线设计。
  - `3d7b554`：Stripe Live 实施计划。
  - `08d7d11`：限制 Checkout 为 card 支付。
  - `a13084a`：忽略本地 Stripe Live env 文件。

## 3. 当前支持范围

当前生产支付能力包括：

- 活动的 `free`、`deposit` 和 `full_prepay` 支付模型。
- Stripe Hosted Checkout 一次性银行卡付款。
- 符合 Stripe、设备和域名条件时，由 `card` 支付方式展示 Apple Pay 或 Google Pay。
- 付款成功后通过 webhook 将 pending registration 提升为正式报名。
- webhook 签名校验、事件去重和数据库金额复核。
- USD 等现有代码允许且活动已正确配置的币种。
- Stripe Dashboard/API 中的人工退款。

## 4. 当前能力边界

以下能力尚未实现，不应视为当前生产功能：

- 银行转账或其他延迟确认的支付方式。
- `checkout.session.async_payment_succeeded` 与 `checkout.session.async_payment_failed` 处理。
- 从 SnowForce 后台直接发起退款。
- Stripe 退款后自动更新或取消 SnowForce 报名。
- 部分退款、退款审批和退款原因审计。
- 自动对账、财务报表和异常差异告警。
- 税费计算、正式发票或收据管理。
- 保存银行卡、Stripe Customer 管理或 Customer Portal。
- 订阅、会员费和周期性扣款。
- 拒付争议和欺诈调查工作流。

## 5. 后续扩展路线

### P0：运维可靠性

#### 退款状态自动同步

目标：Stripe 发生全额或部分退款后，自动更新 SnowForce 的报名财务状态。

需要：

- 设计 `paid`、`partially_refunded`、`refunded` 等完整状态模型。
- 订阅并处理适用的 Stripe 退款 webhook 事件。
- 使用 Stripe refund ID 做幂等处理和审计。
- 明确退款是否自动取消报名、释放名额或发送通知。
- 增加退款 webhook 的单元测试和生产验收流程。

#### Webhook 监控与告警

目标：生产 webhook 失败时，运维可以及时发现并恢复。

需要：

- 对非 2xx、签名失败和业务处理失败建立结构化日志。
- 添加告警渠道和失败事件重放操作手册。
- 定期检查 Stripe Dashboard 中的失败投递。
- 建立 Stripe 付款与 SnowForce 报名的定时差异检查。

#### 密钥轮换流程

目标：让 Live keys 和 webhook secret 能够安全轮换且不中断付款。

需要：

- 在密码管理器中保存生产密钥来源和责任人。
- 记录 Vercel Production 更新、重新部署和回归验证步骤。
- 明确 `.stripe-live.env` 的本地保管策略。
- 未经运维人员明确授权，不得自动覆盖或删除 `.stripe-live.env`。

### P1：退款与报名生命周期

#### 后台退款操作

目标：管理员从 SnowForce 后台发起退款，并同步 Stripe 与报名状态。

需要：

- 管理员权限校验和二次确认。
- 全额与部分退款规则。
- 退款原因、操作者、时间和 Stripe refund ID 审计。
- 重复提交保护和失败后的可恢复状态。
- 报名取消、名额释放和会员通知策略。

#### 订金与尾款

目标：支持先付订金、后收尾款的完整活动结算流程。

需要：

- 明确订金、尾款、退款和最终结算状态机。
- 保存每次 PaymentIntent/Checkout Session 的独立记录。
- 后台展示应收、已收、待退和已结清金额。
- 设计尾款截止日期、提醒和逾期处理。

### P2：支付方式与地区扩展

#### 延迟支付方式

目标：支持需要异步确认的银行类或本地支付方式。

需要：

- 增加 `payment_pending` 状态，不能在 Checkout 返回页直接确认报名。
- 处理异步支付成功与失败事件。
- 重新评估名额预留、超时释放和重复付款规则。
- 针对每种支付方式验证退款、币种和地区限制。

#### 多币种与本地化

目标：针对不同活动和地区显示并收取合适币种。

需要：

- 明确活动定价币种，不在客户端进行可信汇率换算。
- 验证零小数币种的最小金额换算。
- 在管理后台和会员页统一显示币种与金额格式。
- 建立汇率、退款和财务报表规则。

#### 税费、发票与收据

目标：满足未来商品化或跨地区运营的财税要求。

需要：

- 先确认业务主体、销售地区和税务责任。
- 决定使用 Stripe Tax、外部财税系统或人工流程。
- 设计发票信息采集、收据发送和数据保留期限。

### P3：支付平台化

#### Stripe Customer 与保存支付方式

适用于需要复购、尾款或会员续费的场景。实施前需定义用户授权、支付方式管理、隐私保留和删除流程。

#### 订阅与会员费

订阅应作为独立 Stripe Billing 项目设计，不应直接复用当前一次性活动 Checkout 状态机。需要新增订阅状态、续费失败、宽限期、取消和权限同步逻辑。

#### 财务报表与自动对账

可以按活动汇总收入、退款、Stripe 手续费和净收入，并对 Stripe Balance Transactions 与 SnowForce 报名财务字段进行周期性核对。

#### 拒付与风险处理

需要接收争议相关事件、保存证据期限、通知管理员，并定义争议期间报名是否继续有效。

## 6. 运维规则

1. Production 只能使用 Live Mode keys；Development、Preview 和本地开发默认使用 Test Mode。
2. 不得在终端输出、聊天、截图、日志、Git 或文档中显示完整 secret key 或 webhook secret。
3. `STRIPE_SECRET_KEY` 和 `STRIPE_WEBHOOK_SECRET` 不得使用 `NEXT_PUBLIC_` 前缀。
4. `.stripe-live.env` 必须保持 Git ignored；未经明确授权不得覆盖、移动或删除。
5. webhook 验签必须继续使用原始请求正文，不能改为先调用 `request.json()`。
6. webhook 必须从数据库重新读取活动、报名和金额，不得信任客户端或 metadata 中的金额。
7. 新增 Stripe webhook event 时，必须同时补充幂等策略、失败恢复、测试和生产验收。
8. 真实付款 QA 必须先明确金额和处理费风险，并在完成后验证退款与测试数据清理。

## 7. 相关位置

| 内容 | 路径 |
|---|---|
| Checkout Session server action | `src/lib/payments/actions.ts` |
| 支付 action 测试 | `src/lib/payments/actions.test.ts` |
| Stripe 服务端客户端与验签 | `src/lib/payments/stripe-server.ts` |
| Stripe webhook route | `src/app/api/stripe/webhook/route.ts` |
| Pending registration repository | `src/lib/registrations/pending-repository.ts` |
| 上线设计 | `docs/superpowers/specs/2026-07-19-stripe-live-launch-design.md` |
| 实施计划 | `docs/superpowers/plans/2026-07-19-stripe-live-launch.md` |

## 8. 扩展项完成标准

未来任何支付扩展至少应满足：

- 先形成独立设计并明确状态机、失败路径和数据所有权。
- 服务端验证金额和权限，客户端只负责交互。
- 新 webhook 事件具备签名校验、幂等和重放安全性。
- 单元测试、全量测试和 production build 通过。
- Development/Preview Test Mode 验证通过后再配置 Production。
- 使用最小金额完成一次受控 Live QA，并验证 Stripe、Vercel 和 Supabase 三方结果一致。
- 对真实付款、退款和测试数据执行最终清理与书面记录。
