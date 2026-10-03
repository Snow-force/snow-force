# 商城管理员与客服配置

更新：2026-10-01。本次为实际运营配置，不是测试账号或硬编码白名单。

## 管理员登录

已按经营者指定创建两个 Medusa 商城管理员：

- snowforceclub@gmail.com
- 经营者指定的个人邮箱

本地后台入口：<http://127.0.0.1:9000/app/login>。后台需要独立运行；正式后台域名尚未部署。

两个账号分别使用独立随机初始密码。凭据仅保存在本机 `C:\Project\snow-force\services\commerce\.data\admin-initial-access.json`，该文件被 Git 忽略，Windows 文件 ACL 仅授予 `DESKTOP-HFRA7JB\taiyu` 访问。不要把文件或密码提交到 Git 或发送到聊天。

在本机打开该 JSON，找到相应 email 的 password，输入后台登录页。登录后可在 Settings → Users 打开对应用户，从操作菜单使用 Copy reset password link，自行打开链接设置自己的密码。此功能是已安装 Medusa Admin 的原生操作；本次没有重置密码或生成重置链接。

账号通过已安装版本的原生 Auth 和 createUserAccountWorkflow 建立；权限绑定使用服务端 auth identity 的 user_id。当前 Medusa RBAC 功能未启用，两个账号均为标准后台管理员，可以管理商品、价格、库存、订单、配送和 SnowForce 政策/售后扩展。

后台账号及登录身份保存于既有 Supabase 的私有 commerce schema，密码由原生 emailpass provider 使用 scrypt 保存为散列。现有网站会员继续使用 Supabase Auth，会员密码不变。商城管理员不会自动获得主站活动管理后台的权限。

## 客服邮箱

`Shop@snow-force.com` 已通过受认证的商城后台接口保存到 `commerce.store.metadata.snowforce_shop_policy.draft.content.customer_service_email`，草稿 revision 为 1。保留其他草稿内容和 Store 的其他 metadata，published_version 仍为 null。

正式销售主体名称尚未确认，因此政策未发布。管理员邮箱没有自动作为公开客服邮箱。这里只保存了联系方式，未创建邮箱账户，也未发送邮件或验证该邮箱收发能力。

会员订单详情的“联系客服”已改用经营者确认的商城邮箱，并将订单号编码为邮件主题。商城政策页面在政策尚未发布时也显示这个已确认的客服入口。政策发布后，这两处优先读取后台当前生效的客服邮箱；尚无生效政策或读取失败时使用本次确认的 `Shop@snow-force.com`。网站的一般活动与隐私联系邮箱保持原业务设置。

## 实际验证

两个账号均通过原生密码验证和 HTTP 登录。分别核对 `/admin/users/me` 的真实用户 ID/邮箱，并读取商品、库存、订单、SnowForce 配送与政策管理接口，均为 200；错误密码为 401。匿名管理接口保持 401。

客服邮箱保存后重新读取验证，草稿其他内容和发布历史保持不变。只读数据库查询核对两个原生 user 与 emailpass identity 的关联和政策草稿。

这次只配置实际账号和政策草稿，未改变网站或后台源码、依赖、数据库结构，没有执行付款、退款、发货、政策发布或正式部署。商城仍有 14 个商品草稿；真实规格、售价、库存、税务、生产基础设施与完整交易验收仍须完成。
