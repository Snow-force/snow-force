# 商城 Stripe 税务设置核对

更新：2026-10-02。后台入口为 `http://127.0.0.1:9000/app/snowforce-tax-setup`，菜单名称 **SnowForce tax setup**。这是只读核对页；不创建税务登记、不更新经营地址、不发起计税、收款或退款。

## 实际核对结果

两名指定商城管理员的实际登录和新接口均通过；管理员 GET 为 200，匿名 GET 为 401。使用当前受保护的商城 Stripe 测试凭据读取：Tax Settings 为 **pending**，登记列表为 **0**，美国经营地址未完成。经营者税务确认仍为 false。证据保存在 `output/shop-tax-setup-live.json`，其中没有密码、JWT、API 密钥或账户联系人信息。

测试环境设置与正式环境分别管理。Stripe 里的登记是计算服务的设置，不能替代真实政府许可证。当前经营者尚未确认加州许可，代码不会代其作出确认，也没有添加测试或正式登记。有关字段意义见 [Stripe Tax Settings](https://docs.stripe.com/api/tax/settings/object) 和 [Tax Registration](https://docs.stripe.com/api/tax/registrations/object)。

## 核对方法与数据位置

后台以同一商城 API key 只读取得账户 ID、Tax Settings、完整的 Registrations 列表。包括 active、scheduled 和 expired；按日期判断核对完成时是否生效。分页必须全部成功，拒绝重复、卡住、超过限额、测试/正式模式混用、异常响应及超过 60 秒的读取，不用部分列表推断某州没有登记。

需要有效加州 state_sales_tax、美国经营地址和受支持的 Stripe 计算供应商。即将到期、重复有效登记、未知有效税种以及缺少对应销售税的 CO/MN 配送费用登记均要求处理。无到期日的有效登记可继续核对；已到期和尚未生效的记录不作为收税依据。核对页显示各项阻碍和最近读取时间，重新核对失败时清除之前的结果。

这些数据的权威位置是当前 Stripe 环境。此次没有新增数据库表或把快照写入 Supabase；私有后台接口按需读取，返回 `private, no-store`。后续实际报价账本需要持久保存对应账户、模式、设置/登记指纹和报价原件，当前只读页不代替该账本。

## 结账前置检查

准备付款、准备路径内原生购物车锁和原生完成 hook 都会重新读取并检查这些设置。加锁前后设置或登记指纹发生变化，会停止新付款。前台核对失败时仅显示尚未配置，不返回 Stripe 账户、登记或内部错误；取消付款恢复流程仍可使用，不依赖税务准备完成。

**这只补齐登记前置条件，不代表实际税额已接入。** 后续[私有报价账本与付款校验](shop-tax-quote-ledger.md) 已完成基础存储和签名校验；真实报价生产、原子应用、成交税账、原生部分退货与退款冲销及真实 Sandbox 交易验收仍待完成。经营者确认开关未启用，不得把单独打开开关或通过此核对页当作收款上线验收。

管理员可以先查看 [Stripe Tax Settings](https://dashboard.stripe.com/settings/tax) 和 [Tax Locations / 登记](https://dashboard.stripe.com/tax/locations)，确认真实经营地址与许可后再配置；进入后应核对页面所选账户及测试/正式环境。入口由 [Stripe 官方登记指南](https://docs.stripe.com/tax/registering) 核实。此页没有自动填地址或激活登记按钮，避免把仓库地址未经审核当作税务经营地址。商品分类继续在 **SnowForce product tax** 审核；新品售价、规格和现货数量继续由经营者填写后发布。
