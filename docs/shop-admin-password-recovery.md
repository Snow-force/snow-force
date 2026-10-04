# 商城后台密码恢复

更新：2026-10-04（洛杉矶时间）。仅适用于 Medusa 商城管理员；顾客会员继续使用现有 Supabase 登录流程。

## 原因与修复

原公网 `/app/reset-password` 能接受申请，但 `auth.password_reset` 没有订阅处理器，无法发送重置邮件。新订阅处理器只接收真实管理员的原生 emailpass 重置事件，通过 Resend 发信。无需读取或修改密码散列，也不运行数据库迁移。

邮件从 `SnowForce Shop <shop@notifications.snow-force.com>` 发出，回复地址为 `Shop@snow-force.com`。该子域名已在 Resend 验证且启用发送。邮件包含中英文说明，链接固定到 `https://snowforce-commerce-production.up.railway.app/app/reset-password?token=…`，忽略事件 metadata 中的 URL。不输出令牌、收件地址、密钥或供应商响应正文到错误日志。

JWT 必须由当前后台签名，声明为 user/emailpass/reset，收件人与 token 一致，且未过期。原生 Medusa token 自申请起 15 分钟有效、单次使用；再次申请使旧 token 失效。密码只在本人提交新密码时改变，发出邮件本身不改密码。未知管理员和 customer 事件不发送邮件。

## 配置与部署

后台独有的 `COMMERCE_RESEND_API_KEY` 是服务器端配置，不能放入前端构建参数、Git 或手册。可在 SnowForce Railway 的 `snowforce-commerce` 中引用已授权的 `snowforce-web.RESEND_API_KEY`，也可由经营者配置独立的受限发信密钥。保存到后台需单独获得经营者授权。无需更改主站 Resend 配置、管理员密码、JWT_SECRET 或数据库权限。

订阅处理器直接调用 Resend HTTPS API，不需要额外的通用 notification provider 或新依赖。10 秒请求超时；网络错误、429、5xx 和无效确认最多尝试三次，间隔 1 秒、2 秒。每次重试使用同一 token 哈希作为幂等键；新申请使用新键。永久 4xx 直接失败，重试前重新检查 token 有效期。最终失败会记录脱敏错误，不能等同于邮件送达。

网站 CI 当前只覆盖网站。后台发布仍为独立的已测试固定 commit；此功能只在后台新版本部署成功且配置已授权、真实邮件送达验收通过后可认定上线。商城付款仍关闭。

## 管理员操作

1. 打开公网商城后台登录页，选择忘记密码，输入实际管理员邮箱。
2. 检查收件箱及垃圾邮件，打开最新重置邮件中的链接。新申请后勿使用旧邮件。
3. 本人输入并确认新密码，提交后回到登录页验证。共享账号的新密码通过私密渠道交接。
4. 若邮箱不可用，可由另一个已登录管理员在 Settings → Users → 对应账号 → Copy reset password link 生成链接；链接只能私密交给该账号负责人。

恢复邮箱、重置 token 和本地初始密码不得出现在聊天、PDF、截图或 Git。旧初始密码文件不保证长期有效，使用当前本人设定的密码。

## 验收边界

代码测试覆盖目的地固定、JWT 签名/目的/身份/过期、未知用户忽略、幂等去重、瞬时失败重试与永久失败。线上验收应由经营者授权向指定管理员邮箱申请一次，核对 Resend delivery 状态，并由本人打开邮件链接。不自动提交新密码，保留经营者刚修改的密码。
