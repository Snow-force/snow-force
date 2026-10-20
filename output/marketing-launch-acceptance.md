# SnowForce 营销与新人折扣验收记录

> 2026-10-11 更新：经营者要求暂停新人 10% 弹窗上线。生产 `NEWCOMER_ENABLED=false`、`NEWCOMER_EMAIL_ENABLED=false` 已生效；匿名公共首页返回 200，优惠 policy=null，页面无新人弹窗或领码链接。新人功能已保存到 `feature/newcomer-10-percent`，本记录下方的新人验收清单暂缓执行，不再要求用户为本轮注册测试账户。活动和商城推广继续保留。
>
> 邮件页脚名称已改为 Snow Force LLC，保留现有邮寄地址。活动及商城的实际线上预览都已核对正确，旧已投递邮件不作追溯修改。

## 暂停发布后的最终核对（2026-10-11）

- 当前 main 已提交、推送并发布：`aa9e43e57fefea84f85a8568d3d3e579e39a49c5`。
- 新人完整实现保存于 [feature/newcomer-10-percent](https://github.com/Snow-force/snow-force/tree/feature/newcomer-10-percent)，分支提交 `76d51e7423820de6e9bc0e4f7bb71595091fae9b`，基于当前 main，领先 1 个提交。分支未上线。
- 网站部署 `ec5ed697-3665-4250-8b5d-d955642ca00b` 和商城后端部署 `86275b29-76e8-412a-b17c-2c0834308203` 均为 SUCCESS，源代码均为上述 main 提交；当前错误日志查询均为空。
- 最新匿名公共首页返回 200，无新人弹窗、领取或欢迎页链接；商城优惠 policy=null，健康检查 200；`/member/welcome` 返回 404。自动发码及欢迎信关闭。
- 本轮网站完整测试 1,014 项、商城完整测试 631 项通过；两个生产构建及针对本轮变更的覆盖率检查均通过。[Quality Gate](https://github.com/Snow-force/snow-force/actions/runs/38128838628) 已成功完成。
- 活动与商城线上邮件预览均包含 `Snow Force LLC`，不再包含 `CLN GLOBAL LLC`；保留原地址。截图见 [邮件页脚](email-footer-snow-force-llc.jpg)。本轮未另发测试邮件或客户群发。
- 原有活动及商城推广保留；新人个人领码与欢迎信真实注册闭环仍未完成，待恢复上线准备后继续验收。

## 以下为暂停前的历史验收记录

核对时间：2026-10-11 07:12 UTC。源代码：main / `32d88e1e3afa581eaf400b9315b0d6912a1d3f29`，已提交并推送。

## 已完成的代码及配置验证

网站完整测试 1,038 项、商城完整测试 630 项通过；两个生产构建通过。网站运行了完整覆盖率检查，商城新增功能的专项覆盖率检查 50 项通过。关键折扣支付防护、原生折扣计算、身份校验、数据库唯一约束、队列及 webhook 均有针对性测试。测试成功不等于线上流程已验收。

GitHub 当前提交的 [Quality Gate #28](https://github.com/Snow-force/snow-force/actions/runs/38116072610) 已成功完成，包含网站完整测试和生产构建。此 CI 不替代商城本地完整测试，也不证明线上投递成功。

| 用户要求 | 已检查的证据 | 线上验收状态 |
| --- | --- | --- |
| 活动在现有活动后台推广 | 活动列表、编辑页、推广页入口；staff 身份由 requireAdmin 校验；源活动必须公开且未变化 | 线上管理员浏览器通过，选择 Mammoth 未来活动 |
| 商城在现有商城后台推广 | 原生商品、集合、Promotion 详情入口和邮件推广页；原生管理员权限 | 线上原生后台通过，选择 SNOWFORCECLUB Promotion |
| 一键生成、编辑、预览、发送 | 两个表面共用编辑器；版本冲突、来源变化、复制草稿、发送前预览和显式试发均测试 | 两端线上生成、编辑、保存第 2 版、预览及试发通过 |
| 给现有客户发送邮件 | 会员、历史报名、商城客户去重；仅已订阅且未退订/投诉/硬退信的邮箱可发送 | 实际受众 308，符合条件 241、待同意 65、排除 2；只试发到指定邮箱 |
| 邮件类别分开 | 商城和欢迎信 Reply-To 为 shop@snow-force.com；活动和一般咨询为 hello@snow-force.com；测试验证类别隔离 | 两封实际邮件的 From、To、Reply-To 均正确；欢迎信仍待发行 |
| Resend / noreply | notifications.snow-force.com 已验证，SPF/DKIM 验证通过；发件身份 noreply；共用送达/退信回调已启用 | 两封实际邮件 delivered；签名 webhook 经网站转入生产数据库 |
| 首页立即出现新人注册弹窗 | 公共域名无 Cookie 请求包含完整弹窗、10% 和 30 天及注册回跳；已登录线上会员不显示。相同生产构建在独立 localhost 访客会话连接线上后端，自动弹出、关闭、重开、Escape、中英文及注册跳转通过 | 匿名线上 HTML 通过；390×844 手机弹窗宽 358、高 524，全部内容可见。隔离浏览器交互为本地相同构建，并非公共域名会话 |
| 新人优惠 10%、无最低消费 | 原生 Promotion 百分比计算测试；固定 10、minimum=0；管理员改成固定金额时拒绝应用和支付 | 个人码尚未真实发行 |
| 原价商品、不叠加 | 原生混合购物车仅原价行折扣；打折行、手动/自动叠加及超额金额在付款前拒绝 | 原生计算和 SQL 测试通过；销售流程仍有原有门槛 |
| 每人/账户/邮箱一次 | 绑定已验证会员和商城客户；规范化邮箱唯一记录；领取、删除、到期、已用及并发购物车不能重发/复用 | 待真实领码和重复领取；系统不能识别一人多个不同邮箱 |
| 每人独立码、30 天 | 确定性个人码、第一次领取后的到期日；重复领取不换码/延期 | 30 天配置已发布；待指定邮箱真实注册、领码及重复领取 |
| 注册邮箱欢迎信一起发码 | 邮箱验证/登录/隐私同意服务端入队；冻结首次注册邮箱；重试正文和请求键不变；重复请求不重发 | 队列为空，待真实注册邮箱验证与欢迎信 |
| 原生 SNOWFORCECLUB 显示错误 | 生产原生优惠已从固定 $10 改为 10%，截图及数据库已核对 | 已修正；该通用码不是个人新人码 |

## 生产发布与实际邮件证据

- 三份生产迁移已应用：marketing_campaigns / newcomer_email_limits / newcomer_welcome_emails。
- 用户已明确批准“现在发布并验收”，Railway 补丁 `fe5aea8e-ea44-4707-a1b5-49dd62164f4c` 已提交。
- 网站部署 `ae415607-52d5-4d7d-9b16-3acbf61d6ea6` SUCCESS；商城后端部署 `753407c5-0884-45eb-9efc-ed8c9b3dce2e` SUCCESS。两端均为 `32d88e1`，健康检查通过；后端错误日志为空。
- 活动草稿 `7c8e546f-db35-426b-baa3-bc67a3842123`、商城草稿 `7bf21aea-7186-449f-8af2-f24172f9dd32` 均为 draft，第 2 版，test_version=2；没有触发客户群发。
- 活动验收邮件 `01a129c1-c3c2-7592-8544-c02f9e7e6149`：Resend delivered；To/Reply-To 为 hello@snow-force.com；活动 CTA 指向 `/events/mammoth-opening-weekend-2026`。
- 商城验收邮件 `01a129c2-03f7-73a6-82cf-7f427232ec03`：Resend delivered；To 为 hello@snow-force.com，Reply-To 为 shop@snow-force.com；正文为 10% 优惠，CTA 指向 `/shop/sale`。
- 两封邮件 From 均为 `SnowForce <noreply@notifications.snow-force.com>`。生产收到 email.delivered webhook：`msg_3KXRSuhhLtsxRvF5Q6V54S5ZF2F`、`msg_3KXRVyTPvULsPzEMe945eeLGxqh`。试发没有营销收件任务，事件 processed=false 属预期，不人为改数据库来制造已处理结果。
- 截至核对时，指定邮箱 hello@snow-force.com 尚无会员账户；欢迎信及个人优惠尚未真实发行，不能宣称完整验收成功。
- 当前验收未执行真实扣款，也未开启已有销售/税务门槛。

## 浏览器截图

- [活动推广线上试发成功](event-promotion-live-test.jpg)
- [商城推广线上试发成功](shop-promotion-live-test.jpg)
- [原生后台已纠正为 10%](promotion-percentage-corrected.jpg)
- [相同生产构建访客桌面弹窗](newcomer-popup-production-build-desktop.jpg)
- [相同生产构建访客手机弹窗](newcomer-popup-production-build-mobile.jpg)
- [注册入口保留领取后的回跳](newcomer-registration-production-build.jpg)
- 匿名线上响应存于 `homepage-anonymous-live.html`。

## 剩余真实新人验收

1. 用户在公共域名的未登录或无痕窗口用 hello@snow-force.com 注册，由本人设置密码、同意隐私条款并验证邮箱。
2. 核对自动领取的独立原生百分比优惠码、10%、单次限制、绑定客户及首次发行后 30 天到期；重复领取不得换码、延期或重复邮件。
3. 欢迎信仅发一次，包含相同优惠码、规则和商城链接；核对 From/Reply-To、Resend delivered 及对应生产队列/webhook。
4. 公共域名访客弹窗实际显示及邮箱收件确认可由收件人一起反馈；此处不把本地浏览器证据标为公共域名截图。

当前结论：网站及商城后端已发布；活动和商城推广的线上编辑、试发及真实送达通过。新人界面和规则测试通过，个人码及欢迎信的真实注册闭环仍待用户完成邮箱验证，目标不能标记完成。
