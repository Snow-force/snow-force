# Event 代报名 V1 执行记录

日期：2026-10-22（America/Los_Angeles）。

用户最终范围：**暂不部署，只完成代码与验证**。未执行生产 migration、Vercel 发布或活动代报名开关更新；V2 团体合并支付不在本次实现范围。

## 已实现

- Event 独立开关，默认关闭；每会员每场默认代报 5 位朋友，可配置 1–20。本人不计入朋友额度。
- Booker 与 Attendee 分开：代理票的 `member_id=null`，付款/管理归属写入 `booker_member_id`。朋友邮箱选填，不通过邮箱自动绑定会员。
- 每人独立 pending、问卷、Checkout 和 PaymentIntent；客户端请求键防重复，已有付款中的身份与报价保持锁定。同名不硬拒绝，相似资料给软提醒。
- 免费确认、100% 优惠券、Stripe 支付及后台手工报名共享数据库名额守卫。保留未确定支付结果的席位；只有核实 Stripe expired 后才能释放。已付款冲突进入后台 `paid_requires_review` 队列。
- 可取消的旧本人报名不再永久挡住重新报名。已提交票据但后续确认失败时，可恢复完成而不创建第二张票。
- 会员主页/活动页分别显示自己的行程和“我替朋友的报名”；可生成/替换个人邀请。代理票不会增加 Booker 本人的行程数。
- 邀请只保存 SHA-256 token hash，具有期限、替换/撤销和单次响应状态。成年人亲自签署；监护人单独声明身份。已登录 Booker 不能以成年朋友身份签署。签名、签署身份与时间独立记录，不代为授权营销或肖像使用。
- 个人邀请页 `/events/guest/[token]` 不被搜索引擎索引，设置 no-referrer。接受后可重新打开个人二维码票据，不能再次签署；仅返回该人的姓名、票据和活动/授权/核销状态。
- 工作人员核验姓名、身份与票据后核销；数据库阻止未授权或已取消票据核销，重复核销不会重复写审计。
- 后台查看付款者/参加者、创建渠道、授权与核销状态，提供邀请重发/撤销、筛选及 CSV；导出使用相同筛选并防止公式注入。
- 退款核对 Booker 和对应 pending ID，不能因为两位朋友共用联系人邮箱而关联到另一人的付款。

## 验证

| 检查 | 结果 |
| --- | --- |
| 原始基线 | 186 个测试文件、1210 个用例通过 |
| 最终 `npm test` | 196 个测试文件、1275 个用例全部通过；无意外 console/React act 警告 |
| 最终 `npm run build` | ESLint、Next.js 生产编译与 TypeScript 检查通过，无构建警告 |
| 最终 `npm run test:coverage` | 通过；全站行覆盖率 63.79%、分支 59.16% |
| 独立 PostgreSQL 17 | 12 组验收通过；包含迁移前置检查、旧数据回填、并发最后名额、代理人数上限、单次/多次券、问卷快照、RLS、独立签署与核销、开关回退 |
| Stripe 测试模式 | 桌面和移动端分别完成独立托管 Checkout；双击复用同一 Session；4 次签名 Webhook 投递仍仅生成两张票；两笔测试付款均已全额退款 |
| 实际 Next.js 浏览器链路 | 移动端英文邀请 → Server Action → 本地 PostgreSQL → 个人二维码票据；重新打开中文桌面票据；无浏览器脚本错误、无移动端横向溢出 |

验收证据：

- [数据库验收](../output/event-proxy-registration-db-acceptance-20261022.json)
- [Stripe 与浏览器验收](../output/event-proxy-registration-stripe-acceptance-20261022.json)
- [移动端英文票据](../output/event-proxy-registration/guest-ticket-mobile-en.png)
- [桌面中文票据](../output/event-proxy-registration/guest-ticket-desktop-zh.png)

这些浏览器截图使用隔离测试资料和已经停止的本地数据库，不是生产会员资料。最后的 SQL 快照完整性加固由数据库验收另行覆盖。

覆盖率复核：邀请存取与付款过期对账的行覆盖率均为 100%；访客授权 Action 行覆盖率 97.05%，付款返回状态 90%。仍有数据库异常、空结果和备用返回分支未穷举；全站覆盖率不代表全部历史支付路径已完整覆盖。关键越权、错误票据付款关联、重复签署、未签核销和并发超卖均有定向用例或真实 PostgreSQL 验收。

## 数据库与未来上线前置项

生产只读核查确认：旧的 contact-email/member 唯一索引仍存在；优惠券的旧全局单次使用索引也仍存在。没有凭本地 migration 文件假设线上已经应用。

新增迁移为 `20261022194930_event_proxy_registration_v1.sql`。执行前必须先核对并应用已有 `20260823071209_allow_configurable_coupon_redemptions.sql`；新迁移会在旧优惠券规则存在时先报错，且不会留下部分结构变更。不能未经核对就把整个历史 migration 目录直接推向生产。

新迁移使用 security invoker 和明确 execute grants；邀请、审计表启用 RLS，仅服务端有访问权限。活动编辑器的 aggregate RPC 也在同一事务内保存代报名开关与上限。

本地保存了受 Git 忽略的业务数据备份 `.cache/event-proxy-private-backups/`；[公开结构基线](event-proxy-registration-schema-baseline-20261022.json) 只含字段、约束、索引和策略，不含会员资料或密钥。基线包含 12 个活动、256 条报名、133 条 pending、149 条免责接受记录；无退款和优惠券记录。该备份不是完整的 Supabase 平台灾备备份。

既有 Stripe 测试账号配置了指向 `snow-force.com` 的 Checkout 回调。本轮完成事件另经只读核对，对应生产报名、pending 和 Webhook receipt 均为 0；未更改该回调配置。可重复执行的沙箱脚本现在会在存在此类外部回调时提前停止，未来应使用没有生产回调的独立 Stripe sandbox。

未来发布时还需订阅 `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.expired`，先迁移、再发布，保持活动默认关闭，再选择灰度活动。当前线上没有可直接作为首轮灰度的免费活动；这次没有选择或开放任何付费灰度。

## 本期边界与操作方式

- V1 不开放需要审批的活动代报名；编辑器和服务器均拦截该组合。满员时不自动创建代理候补，现有本人审批/候补产品流程不在这次扩展中改造。
- 每位朋友独立取消/退款通过既有管理员流程处理；不能由 Booker 任意换人。现场由真正参加者/监护人完成邀请授权后，再由工作人员核验。
- 无账号朋友的评论、账号领取/绑定，以及 V2 一次付多人，保留为后续工作。
- 若付款状态未知，不可重新收费或仅按本地时间释放名额；从会员继续付款入口核对现有 Session。后台 Paid requires review 需核实原付款后处理补位或对应 PaymentIntent 退款。
- 未来回退时关闭 Event 的代报名开关即可阻止新增代理；已有 pending、票据、对账与退款必须继续保留，不能删除新字段或历史记录。
- 生产灰度观察、提醒发送、监控告警接入和运营/法律条款最终验收尚未进行，均属于用户本次明确暂缓的上线阶段。

## 重跑方式

```powershell
npm test
npm run build
npm run test:coverage
node scripts/test-event-proxy-registration.mjs
# 仅在独立 Stripe 测试 sandbox 中执行：
node scripts/test-event-proxy-registration.mjs --stripe --web
```

SQL 脚本创建单独的 localhost PostgreSQL 集群并在结束时停止；不读取生产数据库连接。可通过 `EVENT_TEST_PG_BIN` 指定 PostgreSQL 工具目录；Stripe/浏览器脚本使用现有本地 PostgREST 工具及 Playwright，可通过 `EVENT_TEST_PLAYWRIGHT_MODULE` 指定模块路径。所有明文邀请链接、测试运行日志和数据库临时目录仅存放在被 Git 忽略的 `.cache/` 中。
