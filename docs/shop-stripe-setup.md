# 商城 Stripe 测试配置

本文对应 SnowForce 的 Medusa 商城。活动付款使用的已有 Stripe 配置继续独立维护。

当前本机状态（2026-10-01）：三个商城测试设置均已填写且 Git 忽略；用户截图中的 CLI 已显示 `Ready!`，本轮安全比较确认其签名密钥与后台保存值一致，未输出完整值。用户自己的监听窗口保持运行，代理的重复监听已停止。实际数据库可见 `pp_stripe_stripe` provider；购物车和订单仍为 0。这是环境配置验证，尚未进行测试付款。

## 从哪里取得两个 API 密钥

1. 打开 [Stripe Dashboard](https://dashboard.stripe.com/)，在账号选择菜单中选择 **Switch to sandbox**。
2. 进入商城专用 Sandbox；若尚未建立，可以用 **Create sandbox** 创建，例如 `SnowForce Commerce Test`。页面顶部应显示 Sandbox 标识。
3. 在该环境打开 [API keys](https://dashboard.stripe.com/apikeys)。在 **Standard keys** 中找到 Publishable key 和 Secret key；测试环境前缀分别为 `pk_test_`、`sk_test_`。点击 Reveal test key 可查看测试秘密密钥。
4. 将值直接粘贴到本机环境文件，两个 API 密钥必须属于同一 Sandbox。

| Stripe 中的值 | 本机文件 | 设置名称 |
| --- | --- | --- |
| Secret key，`sk_test_…` | `C:\Project\snow-force\services\commerce\.env.development` | `COMMERCE_STRIPE_API_KEY` |
| Publishable key，`pk_test_…` | `C:\Project\snow-force\.env.local` | `NEXT_PUBLIC_COMMERCE_STRIPE_PUBLISHABLE_KEY` |
| 本地 CLI 签名密钥，`whsec_…` | `C:\Project\snow-force\services\commerce\.env.development` | `COMMERCE_STRIPE_WEBHOOK_SECRET` |

只替换相应行等号右边的值，不修改其他已有设置。两个文件均已被 Git 忽略。密钥不要发送到聊天或提交到 Git。API keys 页面若不可见，需要账号管理员授予相应权限。

Stripe 也支持 `rk_test_` 受限密钥，本项目后台配置校验允许该前缀；使用时必须实际验证 Medusa 所需的支付、客户、退款等权限。首轮测试可使用现有测试 Secret key，正式上线前确认最小权限配置。

## 本机 webhook 签名密钥

本机商城后台监听端口 9000，其原生支付回调路径是 `/hooks/payment/stripe_stripe`。Dashboard 上的远程 webhook 无法直接访问本机 127.0.0.1 地址；使用已安装的 Stripe CLI 转发。

在 PowerShell 执行：

```powershell
stripe login
stripe listen --forward-to http://127.0.0.1:9000/hooks/payment/stripe_stripe
```

第一条命令打开浏览器授权时，选择与上面 API 密钥相同的商城 Sandbox。第二条命令启动后显示 `whsec_…`，将它填入后台文件的 `COMMERCE_STRIPE_WEBHOOK_SECRET`。保持监听终端运行，测试事件才能送达本机；不要使用 `--live`。

用户随后在自己的 PowerShell 窗口完成 `stripe login` 和监听，显示 `Ready!`。代理以只输出比较结果的方式核对默认 CLI 的签名密钥，与项目保存值一致；代理的重复监听已停止，保留用户窗口。请保持该窗口运行。

CLI 生成的签名密钥与 Dashboard 注册的 webhook 签名密钥不同，不能混用。不要把商城转发目标设置为主站活动付款的 `/api/stripe/webhook`。

## 填完后

保存两个文件，重启主站 Next.js 与 Medusa，让配置重新加载。主站公开密钥在正式构建时也必须注入；生产环境不能依赖本机 `.env.local`。

当前商品全为草稿，真实 USD region、美国仓库与配送范围尚待建立。实际税务配置确认后，还需将后台 `COMMERCE_TAX_POLICY_CONFIRMED` 设为 `true` 才允许开始付款；不要为了绕过门槛直接假设免税。填入三个 Stripe 值只完成支付环境配置，不代表完整订单、履约和退换货流程已经验收。

## 将来线上 webhook 在哪里找

进入相应 Stripe 环境的 **Workbench → Webhooks**，打开商城专用 event destination / endpoint，在 Signing secret 处选择 Reveal。线上 endpoint 必须是部署后商城后台的公开 HTTPS URL，路径保持 `/hooks/payment/stripe_stripe`；其 `whsec_…` 存入商城服务器的环境变量。生产密钥、公开密钥和 webhook 都须属于同一线上环境。

参考：[API keys](https://docs.stripe.com/keys)、[Sandbox 创建和 CLI 登录](https://docs.stripe.com/sandboxes/dashboard/manage)、[webhook 签名密钥区别](https://docs.stripe.com/webhooks/signature)、[Workbench 注册 webhook](https://docs.stripe.com/webhooks)。
