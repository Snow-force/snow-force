# Stripe Live Production Launch Design

## 目标 (Objective)

将 SnowForce 已验证的 Stripe Test Mode 支付链路安全切换到 Production Live Mode，并通过一次可退款的小额真实交易验证会员登录、Checkout、webhook、报名确认和退款流程。上线首版仅开放银行卡及基于银行卡的 Apple Pay / Google Pay，避免引入延迟支付状态。

## 已批准决策 (Approved Decisions)

1. Checkout 明确设置 `payment_method_types: ["card"]`。
2. Production 使用 Live Mode API keys 和独立的 Live webhook signing secret。
3. Development、Preview 和本地开发继续使用 Test Mode，避免开发操作产生真实收费。
4. 允许提交并推送代码、修改 Vercel Production 环境、创建 Live webhook、部署生产，以及执行并退款一次小额真实交易。
5. Live API keys 通过本地临时文件交接；工具不得回显密钥，配置完成后必须删除临时文件。

## 代码设计 (Code Design)

### Checkout Session

`src/lib/payments/actions.ts` 中的 `createCheckoutSessionResult()` 在创建 Stripe Checkout Session 时增加：

```ts
payment_method_types: ["card"]
```

现有 `mode: "payment"`、金额计算、成功/取消 URL、过期时间和 metadata 保持不变。卡钱包仍由 Stripe 在符合条件的设备和域名上通过 `card` 支付方式提供。

### Webhook

生产 endpoint 为：

```text
https://snow-force.com/api/stripe/webhook
```

首版只订阅 `checkout.session.completed`。由于 Checkout 被限制为 `card`，不实现 `checkout.session.async_payment_succeeded` 或 `checkout.session.async_payment_failed`。

Webhook 继续使用原始请求正文和 `stripe-signature` 验签，并从数据库重读报名、活动和金额信息；不得信任客户端或 metadata 中的金额。

## 测试策略 (Testing)

1. 在 `src/lib/payments/actions.test.ts` 先增加失败测试，断言传给 Stripe 的 Checkout 参数只包含 `payment_method_types: ["card"]`。
2. 运行目标测试并确认因缺少该参数而失败。
3. 添加最小生产代码使测试通过。
4. 运行支付模块测试、全量 Vitest 和 `npm run build`。
5. 不修改 Supabase schema；本次无数据库 migration。

## 环境与密钥矩阵 (Environment Matrix)

| 环境 | Secret key | Publishable key | Webhook secret |
|---|---|---|---|
| Local | `sk_test_…` | `pk_test_…` | Stripe CLI `whsec_…` |
| Vercel Development | Test Mode | Test Mode | 不配置；本地 webhook 使用 CLI secret |
| Vercel Preview | Test Mode | Test Mode | 不接收生产事件 |
| Vercel Production | `sk_live_…` | `pk_live_…` | Live endpoint `whsec_…` |

临时文件 `C:\Project\snow-force\.stripe-live.env` 只包含 Live secret key 与 publishable key。读取时仅验证前缀和 API 认证，不输出值；写入 Vercel 后立即删除。

## 发布流程 (Rollout)

1. 完成红绿测试、全量测试和生产 build。
2. 提交并推送代码，确保部署源码与 GitHub 一致。
3. 在 Stripe Live Mode 创建或确认唯一的生产 webhook endpoint，只订阅 `checkout.session.completed`，保存新生成的 signing secret。
4. 将 Live secret key、publishable key 和 signing secret 写入 Vercel Production；不覆盖 Development/Preview 的 Test Mode keys。
5. 触发 Vercel Production 部署并检查首页、会员页和付费活动页。
6. 确认生产环境不再使用 `sk_test_`、`pk_test_` 或 Test webhook secret。

## 真实交易验收 (Live Transaction QA)

1. 优先使用现有 1 美元付费活动；若不存在，则创建一个临时、明确标记的 1 美元活动。
2. 使用真实且已验证邮箱的会员账号提交报名并进入 Stripe Checkout。
3. 由用户本人在 Stripe Hosted Checkout 输入真实卡信息；卡号或其他敏感支付信息不得进入聊天、日志或本地文件。
4. 验证浏览器返回会员页、Vercel webhook HTTP 200、Stripe payment 状态成功、pending registration 被提升为正式报名且财务字段正确。
5. 通过 Stripe 执行全额退款并验证退款状态。Stripe 处理费可能不会随退款返还，因此在真实付款前再次获得用户确认。
6. 清理临时活动、测试报名和其他仅用于验收的数据。退款不会自动取消报名；验收数据需通过现有管理流程或受控数据库操作清理。

## 失败处理与回滚 (Failure Handling & Rollback)

- 若测试或 build 失败，不部署。
- 若 Live API key 认证失败，不修改生产环境。
- 若 webhook 验签或处理失败，保留 Test Mode 配置并修复后重试。
- 若部署后 Checkout 创建失败，立即关闭所有真实付费活动的报名。若问题来自代码，则回滚到上一生产部署；若问题来自 Live 配置，则修正密钥或 endpoint 后再开放报名。不得在公开付费报名开放时把 Production 切回 Test Mode。
- 若真实付款成功但应用未确认报名，保留 Stripe payment ID 作为证据，先退款，再调查数据流。

## 安全约束 (Security Constraints)

- 不在输出、Git、日志、截图或文档中记录完整 Stripe secrets。
- 不将 secret key 或 webhook secret 放入 `NEXT_PUBLIC_` 变量。
- 不接收或存储用户卡号；真实付款只在 Stripe Hosted Checkout 中完成。
- 不删除或覆盖本地 main checkout 中现有的未跟踪内容资产。

## 完成标准 (Success Criteria)

- 目标测试经历可证明的 red → green，支付测试、全量测试和 build 全部通过。
- GitHub、部署源码与生产运行版本一致。
- Stripe Live endpoint 已启用且只订阅 `checkout.session.completed`。
- Vercel Production 使用 Live Mode keys；Development/Preview 继续使用 Test Mode。
- 一次真实小额付款产生 webhook HTTP 200，并创建正确的正式报名。
- 该付款已全额退款，临时密钥文件和验收数据已清理。

## 非本次范围 (Out of Scope)

- 银行转账或其他延迟支付方式。
- 自动处理 `checkout.session.async_payment_succeeded` / `failed`。
- 收到退款事件后自动取消报名；正式退款业务规则需要单独设计。
