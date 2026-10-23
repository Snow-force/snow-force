# Event 代报名：全部开放活动上线记录

日期：2026-10-23（America/Los_Angeles）。用户本次要求准备上线，并适配当前全部开启活动；取代 10/22 的暂不部署范围。

## 本次发布内容

- 会员可分别为自己及最多 5 位朋友报名。每位朋友独立问卷、名额、付款、签署、审批与核销。
- 当前活动矩阵：MetroSlopes 11/7 全款 USD 118、需审批；Mammoth 11/13 押金 USD 99、需审批；Mammoth 感恩节 11/26 押金 USD 99、无需审批。保留现有价格、容量、截止时间、审批及退款条款。
- 新增代理票审批状态与工作人员批准/拒绝操作。付款后预留名额，朋友可先签署；审批通过前不能显示可核销二维码或签到。审批要求在出票时保存，不因后来编辑活动而绕过。
- 拒绝审批取消该人的名额，保留原付款与审计。工作人员须按活动条款单独处理退款；审核按钮不自动转账。
- 迁移不重新激活历史弃单的名额；邀请有效期至少覆盖活动日期后 7 天，兼容感恩节多日行程。
- 本次仍为一人一付款；满员不自动创建代理候补。原有本人报名和本人审批产品流程未扩大改造。

## 验证与来源

- 发布副本以 GitHub `origin/main` 的 `92e3acb` 为起点，合入生产已部署的 Node 24.22.1 安全修复 `99ed9d2`，保留最新商城改动；未直接发布旧本地 main。
- 全量单元/组件测试：198 文件、1307 用例通过。
- `npm run build`：ESLint、Next.js 生产构建与 TypeScript 通过。
- 覆盖率：行 63.85%、分支 59.43%。邀请存取和 Checkout 过期核对行覆盖率 100%；guest actions 97.67%。支付履约的异常/备用分支仍未全部穷举。
- [PostgreSQL + 浏览器验收](../output/event-proxy-registration-db-acceptance-20261023.json)：16 组；6 并发客户端争抢最后名额、付款/审批/个人签署独立、拒绝释放席位、RLS 和权限拒绝均覆盖。
- [本地实际 Next 浏览器验收](../output/event-proxy-registration-browser-20261023.json)：手机英文签署 → Server Action → PostgreSQL → 待审批不展示票据；工作人员批准 → 桌面中文二维码。无页面脚本错误和移动端溢出。
- 10/22 已完成两笔 Stripe 沙箱托管 Checkout、重复签名 Webhook 及全额退款验证，证据见 [前次记录](event-proxy-registration-execution-20261022.md)。本次未在正式环境发起测试扣款。

## 生产操作

状态：代码验证完成，生产迁移和发布待执行。完成后补记部署与活动开关证据。

迁移前业务备份位于 Git 忽略的 `.cache/event-proxy-private-backups/pre-launch-20261023.json`，包含 12 活动、257 报名、133 pending、150 waiver、146 webhook receipt。SHA-256：`caaa36097eb75d8b4cf1d9af73ab0aaf5735f2e3dfb11c6bd28401c66509a863`。明文资料不提交 Git。

数据库只应用已审查的优惠券前置迁移、代理报名 V1、代理审批三项，不批量推送存在历史版本漂移的 migration 目录。主站实际运行于 Railway `snowforce-web`，本次不操作旧 Vercel 站点，不应用既有 Railway staged patch `b2de2a43-2321-441f-91c2-d7a0550ff591`。

Stripe 正式账号只读核对发现 7 笔未完成 pending：5 笔 Session 已 expired/unpaid，2 笔 complete/paid 却没有对应报名。上线前按原 Session、Booker、pending、attempt 与金额核对完成过期释放和已付款补单。不得按本地时间单独丢弃未知付款。

回退方式：关闭这 3 个活动的 `allow_proxy_registrations`；保留当前履约、已付款核对、签署及退款代码和新数据库字段。不可删除已有代理票、pending 或付款记录，也不可盲目回滚旧二进制后继续收款。

## 重跑

```powershell
npm test
npm run build
npm run test:coverage
node scripts/test-event-proxy-registration.mjs --web
```

本地数据库和浏览器脚本需要 PostgreSQL、PostgREST 与 Playwright 工具；`--web` 不连接 Stripe。真实 Stripe 重跑仍仅允许无外部生产回调的独立测试 sandbox。
