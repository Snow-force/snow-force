# 成熟商城界面参考与落地

调研日期：2026-09-29。先查看官方项目说明，再实际浏览 CRMEB 和 Spree 的官方演示。以下是适用于 SnowForce 装备商城的界面结构判断。

| 项目 | 查阅依据 | 借鉴方向 | 本次落地 |
| --- | --- | --- | --- |
| [CRMEB](https://github.com/crmeb/CRMEB) | [官方演示](https://v6.crmeb.net/)的桌面首页、商品分类页；项目 README | 搜索前置、左侧分类导航、主视觉与推荐位、品牌/商品入口集中 | 首页搜索、带数量的分类入口、较紧凑的雪山主视觉、儿童装备推荐位、品牌入口 |
| [Spree Storefront](https://github.com/spree/storefront) | [官方演示](https://demo.spreecommerce.org/us/en)首页和 Digital Air Fryer 6.2L 详情页 | 分类导航、面包屑、商品大图、规格选择、数量步进、商品描述分区 | 分类面包屑、原图放大、配色/尺码/数量、详情/尺码/配送分区 |
| [Saleor Storefront / Paper](https://github.com/saleor/storefront) | 项目 README 的 Product Pages、What's in the Box 与 Accessibility 部分 | 多属性规格、商品图库、购物袋数量编辑、移动购买入口、键盘操作 | 选款抽屉单价与参考合计、手机底部规格入口、原生模态大图与焦点管理 |
| [Medusa DTC Starter](https://github.com/medusajs/dtc-starter) | 项目 README 的 Features 部分 | 商品浏览、规格、购物袋、结账和订单模块各有明确职责 | 继续使用独立商品目录和选款清单；确认报价、供货和配送的咨询路径保持清晰 |

## 适配判断

CRMEB 的 ThinkPHP / UniApp 技术栈与当前 Next.js 项目不同，但其搜索、分类、商品推荐的页面组织可直接参考。SnowForce 当前有 14 款、5 个品牌的真实产品资料，更适合分类导航、品牌入口、清晰的商品卡片和规格选择。所有修改均在现有 Next.js 中原创实现，没有引入参考项目源码或依赖。

商城首页保留雪山与儿童装备的品牌氛围，同时缩短首屏主视觉，让用户更快到达商品列表。商品卡片增加明确的选款入口，完整展示原产品图，并将名称限制为两行以便横向比较价格。

详情页集中展示商品信息、美元参考价、配色、尺码与数量，补充大图、商品资料、尺码建议、配送与退换信息。选款抽屉展示每件参考价与按数量计算的美元参考合计；合计采用已显示的美元单价乘数量，避免汇率换算舍入导致金额相差一美分。

## 当前业务范围

目前仍为装备选款咨询：保存喜欢的款式，通过微信或邮件确认实际报价、库存、配送与退换政策。参考价和选款合计均以美元显示。现有资料不足以提供实际库存或成交价格，因此界面使用明确的咨询状态。

验证记录见 [shop-verification.md](./shop-verification.md)。
