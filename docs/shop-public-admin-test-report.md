# 公网商城后台完整测试记录

更新日期：2026-10-04（洛杉矶时间）。本轮在迁移后的 OneDrive 工作目录执行。测试范围为已批准的公网管理阶段，顾客付款继续关闭。

## 当前结果

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| 工作目录完整性 | 原目录内部 131,200 个文件逐一核对，内容一致；14 个部署缓存文件已补拷，访问权限保持原样 | `output/workspace-copy-audit/migration-report.md` |
| 网站自动测试 | 153 个文件、954 项通过 | `output/shop-onedrive-root-test.log` |
| 网站生产构建 | lint、类型检查及 Next 构建通过 | `output/shop-onedrive-root-build.log` |
| 后台自动测试 | 397 项通过，无失败、跳过或取消 | `output/shop-onedrive-commerce-test.log` |
| 后台类型检查 | `npm run typecheck` 通过 | `output/shop-onedrive-commerce-typecheck.log` |
| 后台生产构建 | 后端和管理界面均编译成功 | `output/shop-onedrive-commerce-build-final.log` |
| 公网浏览器写入 | 创建临时草稿、保存 SKU、US$38.50、Irvine 库存 4 件及商品图片，刷新并通过 API 读回 | `output/shop-railway-ui-write-acceptance.json` |
| 测试数据清理 | 临时商品、库存项和上传图片已清理；原有 14 件草稿保留 | 同上 |
| 公网 HTTP 边界 | 31 项检查全部通过 | `output/shop-railway-management-http-full.json` |
| 管理员账户复核 | club 账号的 8 项登录、管理读取及会话退出检查通过；两个指定账户均存在。只读核对证实两者的原生身份关联正确；个人邮箱的初始密码不匹配当前散列，现用密码登录待经营者完成 | `output/shop-railway-public-admin-accounts.json`、`output/shop-railway-public-admin-roster.json`、`output/shop-railway-admin-identity-readonly.json`、`output/shop-admin-initial-password-readonly.json` |
| 合伙人共享账号会话 | 两个独立 club 会话可同时读取同一份商品；第一个退出后，第二个仍可读取管理员身份及库存。5 项检查通过，两次验收会话均已清理 | `output/shop-railway-concurrent-admin-sessions.json` |
| Redis 重启恢复 | 等待用户明确授权；尚未声称通过 | Railway 持久化服务的重启要求独立授权 |
| 网站前台联动 | 已移除失效的旧连接；现有授权可列出正确仓库，但 Vercel Hobby 明确拒绝连接组织私有仓库，等待托管方案决定 | `output/shop-vercel-hobby-private-org-blocker.jpg` |
| 现有网站连通性 | 首页、商城和政策页均为 HTTP 200，当前线上版本未被替换 | `output/shop-existing-website-http.json` |
| 操作手册与 PDF | 管理手册 14 页、合伙人说明 7 页，公网登录与菜单链接可点击，没有 localhost 操作链接；迁移后的负责人凭据路径已更新 | `output/shop-public-guides-link-verification.json` |

后台生产构建首次因沙盒不能读取用户目录中既有的 Medusa CLI 配置而失败。随后在用户环境执行同一生产构建通过，没有修改文件权限、启动本地后台或执行数据库迁移。构建阶段不连接云端 Redis；其日志中的构建用假实例不能当作生产 Redis 验收。公网 Redis 的真实连接、密码拒绝、TLS、持久化配置另有既有检查记录。

## 公网 HTTP 检查覆盖

- HTTPS 健康检查、现有 club 管理员登录及身份匹配。
- 未登录管理接口拒绝访问、未知商城公开 API key 拒绝访问。
- 管理会话采用 Secure、HttpOnly、SameSite=Lax cookie，并能读取正确管理员身份。
- 管理接口仍为 14 件草稿；公开目录为 0 件，直接请求草稿详情返回 404。
- 管理员能读取仓库、库存、运费、政策、税务配置、成交税账、付款核对和售后页面所需的 API。
- 顾客购物车、付款集合、结账与支付 webhook 写入由管理模式明确拒绝。
- 发货、捕获付款、退换货、索赔、售后资金及税账写入由管理模式明确拒绝。验收使用不存在的专用 ID，没有对真实订单或资金操作。
- 现有网站 HTTPS origin 通过 CORS，其他 origin 不获得允许跨域的响应。

## 浏览器操作证据

- `output/shop-railway-ui-price-saved.jpg`：美元售价保存后可见。
- `output/shop-railway-ui-stock-saved.jpg`：刷新后 Irvine 的在库和可售数量均为 4。
- `output/shop-railway-ui-image-saved.jpg`：Media 保存后显示商品图片。

当前操作手册允许运营人员准备草稿、价格、库存和图片。真实收款、销售税、发货和退款全链路另需销售上线验收，不能用管理阶段的阻断检查替代。

## 管理员复核中发现的待确认项

2026-10-04 通过现有 club 管理员只读查询，确认 `snowforceclub@gmail.com` 与 `taiyuanmei0824@gmail.com` 两个原生管理员记录都存在。club 账号当前公网登录成功，商品、库存、仓库、运费及政策读取通过，专用验收会话退出后原 cookie 返回 401。个人邮箱使用受保护文件中的初始密码登录返回 401。

进一步只读核对现有 Supabase 的私有 `commerce` schema，证实两个用户、`emailpass` provider identity 及 auth identity 均未删除，`app_metadata.user_id` 关联正确，均保存了原生密码散列。个人 provider identity 的更新时间晚于创建时间。随后通过商城专用数据库角色，在本机使用已安装 Medusa emailpass 所用的 `scrypt-kdf.verify` 对比初始密码：club 匹配，个人邮箱不匹配。由此证实个人账号的初始密码文件已不能作为现用密码，不能把 401 解释成账号丢失或后台地址错误；更新时间不能识别是谁作了变更。散列仅在本机内存参与校验，证据只保存布尔值，事务为只读并回滚。没有重置密码、修改账户或扩大权限，当前仍需经营者使用现用密码完成登录。

已在独立 Chrome 页面准备个人管理员登录，邮箱已填写，未填入密码或提交登录；页面保留供经营者接手。截图为 `output/shop-personal-admin-login-handoff.jpg`。这张登录页截图不能作为成功登录证据。

## 后续完成条件

1. 用户确定前台托管方案后，验证网站使用正确的现有组织仓库及公网商城读取配置，确认网站草稿隐藏和政策页面读取。当前 Vercel Pro 为每月 US$20 平台费，含 1 个部署席位及 US$20 用量额度，额外用量和税费另计，未替用户升级或订阅。依据：[Git 仓库限制](https://vercel.com/docs/git)、[Pro 计费](https://vercel.com/docs/plans/pro-plan)。
2. 用户授权后执行私有 Redis 的受控重启，验证重启前创建的管理员会话仍能使用，原有商品仍保留，再注销自己的验收会话。已安装 Medusa 的 `express-loader.js` 在配置 `redisUrl` 时使用真实 `RedisStore`；探针使用这条原生会话路径，私密 cookie 只存入受保护的非 OneDrive 临时目录，不进入报告或 Git。这个检查不能替代销售上线前的独立备份和异地恢复演练。
3. 经营者确认个人管理员当前密码后完成实际登录核验。初始密码文件不是当前密码的权威来源，不通过聊天收集密码；如需改密，由经营者在后台完成。
4. 更新公网交接记录及使用手册；全部要求通过后，将本次相关修改提交并推送到 `main`，不包含凭据、素材或其他未提交工作。
