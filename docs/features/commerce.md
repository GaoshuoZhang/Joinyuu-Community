# 交易与支付：当前实现

核对日期：2026-10-29。依据 API 的 commerce 模块、Prisma 模型、两个客户端的 commerce 请求与收银台实现。以下描述代码能力，不是生产支付验收结论。

## 能力与边界

| 能力 | 当前状态 |
| --- | --- |
| 后台关联应收 | 租约、空间、活动、商城；需求与项目暂停新收费，保留历史单据 |
| 业务计价 | 服务端读取来源价格与资格，整数分计价；商品和空间不能同时设置正积分价与正现金价 |
| 客户端现金交易 | 已有报价、下单、收银台、取消、交易列表/详情、账单入口及退款申请 |
| 支付方式 | 后台 Native；移动 Web JSAPI/H5/Native 能力选择；小程序 openid 绑定与 wx.requestPayment 调起链路已存在 |
| 支付确认与履约 | 服务端通知/查单确认后，CommerceFulfillmentService 处理商城券码、空间预约、活动报名或租约账单；异常进入人工处理状态 |
| 退款与售后 | 全额申请、后台异人审批、渠道查询/重试；相关权益冻结、拒绝解冻与成功撤销在服务端处理 |
| 线下收款 | 全额登记与异人复核，使用独立凭证，不冒充微信交易 |
| 尚无实现 | 渠道逐笔对账与账单下载、退款通知路由、部分付款/退款、多商户分账、充值与发票 |

需求/项目、自动周期租金出账及未列出的产品能力不能由通用订单接口推断为已支持。真实支付权限、商户与 AppID 绑定、授权域名/通知地址和真机调用仍需单独验证。

## 服务端契约

客户端入口为 /api/app/commerce，来源类型 mall、space、event、lease_bill。先创建 quotes，再用 quoteId 创建 orders；金额、主体权限、库存/时段/报名资格由服务端计算和检查，不接受客户端指定结算金额。

实际端点与处理函数见 [HTTP 路由索引](../backend/routes.md)，主要流程为：

1. capabilities 查询当前账号及运行环境可用方式。
2. quotes / orders 创建报价与订单，orders/:id 查询状态。
3. orders/:id/payments 发起支付；小程序先使用 wechat/mini/bind 绑定 wx.login code 对应的 openid，网页微信授权走 wechat/oauth 路由。
4. payments/:id/sync 主动同步；客户端展示成功不直接写入资金终态。
5. orders/:id/cancel、orders/:id/refund-requests 以及 refund-requests/:id 处理取消、申请与查询。

/api/app/me/transactions、transactions/summary、bills 提供本人交易与账单。后台 /api/admin/commerce 受财务权限和 commerce 数据范围控制。系统收款参数 GET /api/admin/system/payment-config 与 PUT /wechat 沿用 /system/config 权限。

## 配置与密钥

后台系统配置中的收款配置保存商户非密钥参数和只写密钥/PEM，空密钥字段表示保留已有值；数据以 AES-256-GCM 加密保存于 PaymentMerchantConfig。默认主密钥位于 API 工作目录 .private/wechatpay-config.key，或使用 PAYMENT_CONFIG_KEY_FILE / PAYMENT_CONFIG_ENCRYPTION_KEY。主密钥与数据库分离持久保存，已有密文后不能直接替换或删除。

没有后台配置记录时回退 WXPAY_* 环境变量；保存后使用数据库配置。保存有版本冲突保护，与新支付共用事务锁，待确认交易限制凭据替换；关闭发起开关仍允许处理存量交易。具体参数字段以 payment-config.dto.ts 和 .env.example 为准。

小程序 AppID/openid 与公众号 AppID/openid 不能互换。小程序登录配置由后台功能开关维护，环境变量 WXMINI_* 仅作回退；公众号授权使用对应的服务端配置。前端环境判断只是交互提示，最终由服务端校验。

## 通知、补偿与资源

支付通知保留 rawBody，验证签名、时间戳、公钥 ID、解密报文及商户/AppID/金额/单号后确认，成功返回空 204。资金状态和关联履约由服务端事务与幂等约束控制；无法履约时保留异常记录，不把收款成功等同于业务已交付。

后台补偿任务处理待确认支付、超时关单和退款查单。网络失败保留原单继续核实，不能靠新建支付绕过不明资金状态。退款申请冻结相关权益，成功退款撤销对应权益；取消/超时未付订单释放相应资源。精确状态及分支见 app-commerce.service.ts、commerce-payment.service.ts、commerce-fulfillment.service.ts。

许可证失效时限制新业务写入；存量查单、退款和通知通过明确维护例外继续收尾，身份、权限与数据范围仍生效。商品 validDays=0 为长期有效，新券空到期时间不进入过期处理。

## 验证与上线边界

本地单元与隔离 HTTP 测试覆盖代码行为，不能替代真实商户端到端验收。真实收款上线前需完成商户及产品权限、通知可达性、实际收款退款、异常恢复、逐笔对账和运营处理流程。当前仓库不包含这些外部验收完成的证据；也不声称已经部署生产。

迁移以 API prisma/migrations 为准，执行 migrate deploy；不要只应用旧文档列出的前三份迁移，也不要用 db:reset/db:seed 升级已有数据。当前字段见 [数据模型](../backend/entity-fields.md)，部署见 [部署手册](../operations/deployment.md)。
