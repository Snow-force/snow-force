# SnowForce 单数据库会员商城模块

2026-09-30。前端已在本地实现与验证，数据库新增模块已应用到现有 Supabase 项目；本次没有部署前端、提交或推送 Git。

## 数据与账号

只使用现有 Snow-Force web 项目（us-east-2）的一份 PostgreSQL 数据库，没有新建项目或数据库。客户沿用 Supabase Auth、原来的密码/Google/Magic Link 和登录界面，进入新的会员中心。

| 分类 | 当前存储 | 本次状态 |
| --- | --- | --- |
| 登录身份 | 现有 Supabase Auth / auth.users | 沿用；可信用户 UUID 是商城数据的归属依据 |
| 会员资料、活动与报名 | 现有 member_*、events、registrations 等业务表 | 沿用 |
| 我的装备订单 | public.shop_member_orders | 已建立；普通客户只读本人订单，保存商品、规格、金额、地址与物流快照 |
| 收货地址簿 | public.shop_shipping_addresses | 已建立；本人新增、编辑、删除美国地址和切换默认地址 |
| 商品、SKU、运营价格、库存与核心交易 | 同一数据库的 commerce schema | 后续 Medusa 服务接入，当前尚未安装 |
| 商品图片上传 | 现有 Supabase Storage 的商品 bucket | 后续接入；当前图片仍使用本地公开文件 |

所有商城金额使用整数美分并限定 USD。地址簿的修改不会改变已经下单时保存的收货地址。订单读取表不是库存或运营定价来源；可信商城服务后续须负责同步订单、支付、履约、售后状态和重试。

共用数据库不自动共享 Medusa 的认证会话。后续服务端使用自定义客户认证适配绑定现有 Supabase 用户 UUID，顾客无需第二次注册。商城后台的运行环境仍可能产生费用；当前没有增加第二个数据库项目的费用，新增模块消耗现有项目配额。

## 页面

- /member：订单分类入口、最近订单、下一趟活动、待确认/付款活动报名、邮箱验证提醒、资料完成度、收货地址入口。
- /member/orders：状态筛选、每页 10 笔、历史商品与价格快照；读取失败独立显示重试提示。
- /member/orders/[id]：进度、商品规格与数量、美元费用、多个包裹、承运商链接、下单地址与客服入口。
- /member/addresses：美国地址簿，服务器验证身份、邮箱、同意状态和字段。
- 现有活动、资料和账号安全页面沿用，统一会员导航。中英文切换，手机横向滚动导航，不覆盖主要操作。
- /design-preview/member：仅开发环境，明确标识虚构样例，不写真实订单/地址；生产环境返回 404。

## 迁移与权限验证

只应用了 20260930090530_shop_member_center.sql。原 CLI 文件时间为 20260930080821，应用工具记录的版本为 20260930090530，仓库文件已与远端对齐。没有执行 db push，也未应用其他本地迁移。

远端核实：两表启用 RLS；订单 1 条本人 SELECT 策略，地址 4 条本人 CRUD 策略；匿名角色无读取权限；会员不能写订单。两个地址函数是 SECURITY INVOKER、固定空 search_path，用户 ID 来自 auth.uid()。订单归属/状态/日期索引、地址归属索引与每用户单一默认地址唯一索引存在。

scripts/shop-member-permissions-check.sql 使用已有身份，但仅在新增商城表中建立事务内虚构记录，从未修改 auth、活动、报名或已有客户数据。实际验证了本人/他人/匿名/可信后台角色、伪造 app_metadata、禁止订单改价与删除、禁止地址归属转移、RPC 归属、默认地址切换、无效保存的回滚、删除默认地址后的替换。事务全部回滚，最后订单和地址表均为 0 条。

Security Advisor 与应用前基线一致，本次新增商城表无告警。既有事项：4 张其他业务表启用 RLS 而无策略，以及 [泄露密码保护未启用](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)，未在本次修改其他业务权限或 Auth 设置。

## 验证结果与边界

- npm test -- --cache=false：120 个文件、743 项测试通过。关闭结果缓存是为避开既有 node_modules/.vite 缓存写权限，不跳过任何测试。
- npm run test:coverage -- --cache=false：通过；shop 逻辑语句/行/函数覆盖率 100%，分支 94.47%。新增地址服务端操作全部覆盖，另有实际数据库权限验证。
- npm run build：通过，包括类型与 lint 检查。既有 img 提示在 about、recap-media-gallery、event-share-bar、nav；新增会员文件没有此提示。
- 原有事件/分享测试存在 act 警告，商家/管理表单测试存在 React 18 对 Server Action 的适配提示，Vite 存在 CJS 提示。本次会员测试没有新增这些警告；没有跳过测试、扩大模拟或调低检查。
- 生产模式 HTTP：member、orders、order detail、addresses 对未登录访问显示现有登录入口；样例订单未泄露；design-preview/member 为 404；shop 为 200。现有官网 GET 200。
- 实际浏览器：中文/英文概览、订单列表/筛选、详情、地址编辑与预览保存；390×844 手机订单和地址界面没有页面横向溢出，商品图片加载正常。未登录状态在生产模式再次核实。
- 活动的纯日期保留日历日期，订单时间戳按 Pacific 时间显示；新页面商品图片用固定容器与 fill，首屏图片标记 priority。最终组件检查验证了服务端读取、身份校验、并行加载、表单反馈与中英文导航。中文概览截图为 output/playwright/member-center-overview.jpg。
- 没有用真实客户账号完成登录后的浏览器全流程；页面交互用明确标识的开发样例验证，持久化和权限用服务端测试与实际 PostgreSQL 角色验证。没有发邮件、提交订单或付款。

真实商品管理后台、库存/售价读取、购物车结账、订单同步和自动物流更新尚未接入。当前商城仍是选款咨询流程，浏览器清单不是交易订单。会员地址簿可保存真实资料，订单页面在无交易数据时为空；不会写入演示购买记录。

前端源文件、该迁移、相关测试与文档当前未提交。现有混合工作区的其他修改保留；发布时须将本迁移与前端实现一起纳入范围，避免远端 schema 与仓库版本漂移。

详细后台、上架、库存、物流与部署方案见 [shop-backend-plan.md](shop-backend-plan.md)。
