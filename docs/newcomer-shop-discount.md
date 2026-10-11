# 新人 10% 优惠：暂停上线

2026-10-11，按经营者要求暂停新人弹窗、个人领码及自动欢迎信。完整功能保存在 GitHub 分支 [feature/newcomer-10-percent](https://github.com/Snow-force/snow-force/tree/feature/newcomer-10-percent)，继续开发和完整验收后才能重新合并发布。

main 已移除首页弹窗、会员新人优惠入口、注册折扣承诺、领取页面及注册/登录/邮箱验证后的自动发码触发。生产商城设置 NEWCOMER_ENABLED=false、NEWCOMER_EMAIL_ENABLED=false。后台保留原生优惠的安全校验和已经应用的数据库迁移，不删除数据，也不放开管理模式的客户写入。

活动及商城推广继续使用现有后台，通用 SNOWFORCECLUB 促销保持 10%。邮件邮寄页脚使用 Snow Force LLC 及现有邮寄地址，活动回复至 hello@snow-force.com，商城回复至 shop@snow-force.com。

恢复前需在分支中完成真实注册、本人同意条款和验证邮箱、独立码发行、首次领取后 30 天、仅原价商品九折、不能叠加、账户/邮箱一次、重复领取不重发，以及欢迎信真实送达。重新发布与开启新人开关须取得经营者的明确上线指示。
