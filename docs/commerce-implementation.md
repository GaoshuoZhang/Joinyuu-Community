# 交易经营第一批实现与接入说明

更新日期：2026-10-28。对应版本：1.6.2。本文记录实际代码范围，后续产品规划见 [在线收费增强方案](./online-payment-enhancement-plan.md)。

## 1. 已确认选型与实际范围

用户已确认客户自营、客户自己的商户号收款，以及 JSAPI / H5 / Native、APIv3、微信支付公钥验签。

本批实现后端和后台；客户端补充积分/现金展示和有效期适配，完整现金收银台仍未交付。交付“原业务表单定价 → 四类现行来源关联应收（保留需求/项目历史） → 后台 Native 展码收款 → 确认入账 → 全额退款申请/异人审批/查询”的基础能力，以及线下全额收款登记和异人复核。账单是独立应收，不冒充原商城兑换订单、活动票或预约。

| 能力 | 本批状态 |
| --- | --- |
| 办公位租约、空间、活动、商城关联账单 | 支持新出账；需求/项目收费方式待定，暂缓新收费并保留历史单据 |
| 原业务费用设置 | 商品与空间互斥选择积分或现金；活动保持现金单价和退款约定，租约复用租金与付款周期；需求/项目表单收费已移除 |
| 后台经营概览、应收列表、交易详情和系统收款配置 | 已实现；原业务详情及商品管理有收费账单入口 |
| Native 支付 | 已实现后端下单、后台二维码、回调及查单/超时关单；真实联调未执行，默认关闭 |
| JSAPI / H5 | 已有渠道客户端的下单适配与 JSAPI 签名方法；尚无用户授权、客户端收银台和对外发起入口，不能称为完整接通 |
| 退款 | 已实现全额退款申请、异人审批、轮询确认与原单重试；退款异常引导商户平台处理 |
| 线下收款 | 已实现全额登记、凭证唯一、异人复核；不伪造微信交易号 |
| 资金安全边界 | 数据库账单锁、金额约束、商户校验、单号持久化、成功确认幂等、事务内审计 |
| 客户端支付、自动发票券、时段/库存锁定、自动租金出账 | 尚未实现；保留积分链路，现金业务不能通过积分接口免费完成，不自动改变原业务履约状态 |
| 渠道账单下载与逐笔对账、对账差异处理 | 尚未实现，属于启用生产收费前的必补项 |
| 充值、部分付款/部分退款、押金、多商户/分账 | 未纳入本批 |

收款与使用服务之间目前由运营人员按收费依据执行交付。不要用该基础账单替代需要实时库存、名额、时段占用的自动售卖流程。

## 2. 后台操作

“交易经营”新增在原菜单之间，不移除原菜单；独立 `commerce` 数据范围。普通角色不自动获取财务权限，超级管理员依原 `*` 权限可访问。上线前应创建至少两名有相应权限的管理员，用于收款复核和退款审批。

1. 商品新增/编辑选择“积分售价”或“现金售价”；空间选择“积分费用”或“现金费用”（每小时），两者互斥。现金计价须填写退款约定；商品积分价须大于0，空间积分费可为0表示免费。活动按人次设置现金价，租约沿用原租金及付款周期。需求/项目暂不提供收费设置或新建收费账单。
2. 在“应收与交易”选择业务来源，页面读取其当前单价与退款约定；填写购买主体、计费数量、费用名称、账期/阶段、到期日及收费依据后出账。应收金额为业务单价 × 整数数量（1–10000），不可手改；业务价格改变后旧金额请求会被拒绝，须重新读取价格。相同模块/来源/购买主体/账期/费用名称不得重复创建。
3. 未启用微信时仅能登记实际发生的线下收款，另一位有权限管理员复核后才记已缴。
4. 微信通道部署、联调并启用后，未缴账单可生成 Native 二维码，由付款人使用微信扫一扫。页面展示付款截止时间；收款结果以回调或主动查单为准。
5. 已付款账单可申请全额退款；另一位审批人确认后提交。申请、处理、成功和异常分别展示。后台查单与定时补偿共同跟踪结果。
6. 尚无收款且无待复核登记、所有支付尝试均确认关闭的账单可作废。历史账单、支付、退款不提供删除和任意状态编辑。

列表支持模块、业务编号、关键词、收款状态和逾期筛选、分页、列配置与 URL 状态恢复。概览为累计口径：确认收款（微信 + 已复核线下）、成功退款、收款净额及未缴。净额未扣成本/手续费，不代表利润；原积分消费不计入现金合计。

## 3. 数据与 API 契约

交易表为 `CommerceBill`、`CommerceReceipt`、`CommercePayment`、`CommerceRefund`。旧 `CommerceService` 表仅保留历史，不再提供维护页面或接口，也不自动把旧价目表金额分配到业务。单据保留业务及购买主体快照，无级联删除原业务的关系。

- 金额字段为整数分，单笔范围 1–100,000,000 分。账单金额创建后不可编辑。已收和已退金额有数据库上限检查。
- 同一账单先锁定数据库行再创建支付。未确认尝试必须复用原商户单号、金额、标题与有效期，确认关闭后才允许新尝试；保留旧尝试历史。
- 一张账单首期只接受全额缴清；线下待复核登记与未关闭在线支付互斥。
- 待审批及处理中退款均占用可退额度。退款成功后保留原收款事实，单独累计退款；全退账单不自动重开应收。
- 退款申请不是自动判断业务应退资格；管理员应先按合同确认交付和售后。原票券/预约未接入本交易域，不会被自动冻结或取消。

统一前缀 `/api/admin/commerce`，返回遵循全局 `{code:0,data}` 包络。

| 方法与相对路径 | 权限 | 行为 |
| --- | --- | --- |
| GET `overview` | `/commerce/overview` | 累计收款、退款、应收和待办 |
| GET `capabilities` | `/commerce/receivables` | 必需项的本地格式/文件检查是否通过、是否允许发起、缺失/异常项名称；不返回密钥 |
| GET `sources/:id?module=` | `perm:commerce:bill:create` | 读取该业务当前现金单价、计价单位与退款约定 |
| GET `sources?module=&keyword=` | `perm:commerce:bill:create` | 按模块搜索未归档来源，最多30条 |
| GET `buyers?type=&keyword=` | `perm:commerce:bill:create` | 搜索活跃个人/企业主体，最多30条 |
| GET `bills`、GET `bills/:id` | `/commerce/receivables` | 分页、详情；详情含收款及退款历史 |
| POST `bills` | `perm:commerce:bill:create` | 读取业务单价，校验 amountFen=单价×quantity，保存不可变的价格/数量/退款约定快照 |
| POST `bills/:id/void` | `perm:commerce:bill:create` | 作废无收款且无未关闭交易/待复核登记的账单 |
| POST `bills/:id/receipts` | `perm:commerce:receipt:create` | 凭证编号 reference、实际收款说明 note，全额登记 |
| POST `receipts/:id/review` | `perm:commerce:receipt:review` | approved/rejected；不允许登记人自己复核 |
| POST `bills/:id/native-payment` | `perm:commerce:payment:create` | 新建/复用15分钟有效支付单；返回二维码及截止时间 |
| POST `payments/:id/sync` | `/commerce/receivables` | 核实已有交易；不创建新支付单 |
| POST `payments/:id/refunds` | `perm:commerce:refund:create` | 全额申请；先核实原支付，冻结可退额度 |
| POST `refunds/:id/approve`、POST `refunds/:id/reject` | `perm:commerce:refund:approve` | 异人审批并提交原单退款，或驳回待审批申请并释放额度 |
| POST `refunds/:id/sync` | `/commerce/receivables` | 核实退款；未知结果保留处理中 |

`bills` 创建字段：module、sourceId、buyerType(user/enterprise)、buyerId、title、period、amountFen、dueDate(YYYY-MM-DD)、agreement，可选 quantity（默认1，整数1–10000）。由后端查询名称，不信任前端提交的名称和支付金额。

活动、商品、空间原新增/编辑 DTO 接受 chargeAmountFen / chargeRefundPolicy；不传则保持原价。商品/空间同时存在正积分及正现金价格时拒绝，不将积分当现金。需求/项目 DTO 已移除收费字段，历史数据库字段保留但不参与新出账。商品 validDays=0 为不过期，null/省略仍兼容30天；新生成券码 voucherExpiresAt 为空串表示长期有效，过期任务显式排除空串。历史券码到期时间保持不变。

系统配置接口：GET `/api/admin/system/payment-config`、PUT `/api/admin/system/payment-config/wechat`，两者均沿用 `/system/config` 权限和 system 域。GET 回填非密钥字段、source、version、逐项状态、secrets布尔标记、完整通知URL；不回传密钥/PEM/文件路径。PUT 接收 version、enabled、mchid、appid、serial、publicKeyId、base，以及只写 key/privateKey/publicKey/certificate；空密钥与不上传文件表示保留。证书可选，serial留空时从证书提取；上传证书时检查期限和与私钥的配套关系。

账单状态 unpaid/paid/void/refunded；逾期是 unpaid 且到期日早于当前上海日期的派生状态。支付状态 pending/success/closed/attention；退款 pending/processing/success/closed/abnormal/attention；收款登记 pending/approved/rejected。

## 4. 支付部署配置与前置条件

后台入口：**系统配置 → 收款配置**，为归档管理之后的一级选项卡。二级选项卡“微信”“支付宝”；支付宝显示暂未开通。URL `/system/config?tab=payment&provider=wechat`，旧 `?section=payment` 自动归一。

管理员在微信页填写商户号、AppID、商户 API 证书序列号、微信支付公钥ID、APIv3密钥、HTTPS通知源站，上传商户私钥和微信支付公钥；可选上传商户API证书。单文件上限32KB，PEM/CRT本地读取后随保存提交，不经素材库或公开文件接口。选择文件不会立即生效，保存后清空页面内密钥原文。支持关闭状态下保存未完成的草稿，已填写但格式无效的参数仍会拒绝；启用时要求全部必需项通过本地检查。

保存时写入 `PaymentMerchantConfig`：AES-256-GCM密文、版本号、修改人和时间，审计只记操作与开关/版本。主密钥与数据库分离：默认由服务器在 `apps/api/.private/wechatpay-config.key`（以进程工作目录为准）自动创建；也可通过 `PAYMENT_CONFIG_KEY_FILE` 指定私有持久路径，或部署 `PAYMENT_CONFIG_ENCRYPTION_KEY`（64位十六进制）。目录不对外提供下载、不进Git。**备份和迁移必须同时保留数据库与原主密钥**；多实例必须共享同一主密钥。不要直接删除主密钥或用新值替换已有主密钥，否则存量配置无法解密。

没有后台配置记录时兼容原 `WXPAY_*` 环境配置；首次保存后整体改用数据库配置（不会混合环境变量覆盖后台字段）。支付服务每次从数据库读取配置，无需重启即可生效。没有完成参数或未打开页面收款开关时，不能新发起支付。关闭开关不关闭已有二维码，不影响存量通知/查单/退款。

配置保存采用版本冲突保护，与创建支付共用事务锁。存在待确认支付或未完成退款时不能替换参数，但可单独关闭发起开关；已有支付历史时暂不支持更换商户号或AppID。公钥多版本并行、多商户不在当前范围。

本地检查不发起微信请求，不能替代产品权限、商户/AppID绑定、实际通知可达性、真实echo、收款退款及对账验收。Native为当前后台入口；JSAPI/H5后续还需客户端授权和收银台。

当前 TypeScript 实现为依据官方协议编写的项目参考实现，非微信官方维护 SDK。官方请求示例和协议来源见本文末尾；签名本地通过不能替代真实 echo、产品权限及支付验证。

## 5. 通知、补偿及许可证

Nest 启用 rawBody；通知独立于管理员登录，仍必须验签、核对时间戳与公钥ID、AES-GCM解密，并核对商户/AppID/单号/金额/币种后才能入账。HTTP成功应答为空204；处理失败返回4xx FAIL，不被管理端包络包装。

`commerce-payment-recovery` 每分钟扫描持久待处理单，生产默认随 ScheduleModule 启动；NODE_ENV=test 不注册真实定时器，测试显式调用生产任务方法。每批最多30笔支付和30笔退款；请求8秒超时，失败退避最高1小时。请求故障后下一次请求切换备用域名，60秒后回主，正常有少量备域名流量。

超时支付先查单，再关闭未付款单；网络错误保留待确认。退款先查询原退款单，明确不存在或持续未明确受理时按原号原参数重试。自动核实达到120次仍未收敛时转 attention，保留资金占用，需后台人工复核，不允许直接新建支付绕过。批次容量及告警接入仍需结合实际交易规模验证。

许可证到期：原业务价格编辑、出账和新支付被全局写守卫阻止；已有支付查询、退款申请/审批/查询和支付通知使用明确的 handler 级维护例外，继续受各自身份与财务权限控制。补偿任务不经过原业务调度器的许可证停跑逻辑。

本批没有自动收取业务资源的能力，因此不承诺付款后自动发券、开票、预约或分配办公位。发票与支付凭证也是不同业务，尚无发票接口。

## 6. 迁移、验证与生产启用条件

迁移 `20261028000000_commerce_foundation` 新增交易表、约束与初始权限目录。随后必须应用 `20261028010000_business_charge`：为五类业务增加 chargeAmountFen（整数分、默认0）及 chargeRefundPolicy（最多2000字、默认空），收费时必须填写非空约定；删除独立价目表的2个权限，保留8个有效财务权限和历史数据。不自动给普通角色授权。开发种子清理按退款→支付→收款登记→账单→服务的外键顺序；生产升级执行 migrate deploy，禁止运行破坏性 seed。

实际验证和未验证项见 [微信支付接入质量记录](../wxpay-docs/代码质量检测报告.md)。开发验证先应用到隔离测试库；随后排查启动报错时，已为本机 `joinyuu` 数据库补执行第一份交易基础迁移。本次新增业务定价迁移只在隔离测试库执行，普通本机库须在重新启动后端时由包脚本应用。未部署生产环境。

1.6.2 增量迁移 `20261028020000_payment_configuration` 新增加密商户配置表与商品/空间价格互斥 CHECK。已有现金记录保留现金价并将其积分价置0；其余原积分数据不变。需求/项目旧价及账单历史保留，暂停新收费。有效期0使用现有字段，无须重写旧券码。

后端 `dev` 和 `start` 命令现在先执行 `prisma migrate deploy`，迁移成功才启动服务；本地 `start-backend.bat` 复用 `pnpm --filter @joinyuu/api dev`。出现“未登记 /commerce 权限码”时先检查迁移状态，不执行 `db:reset` 或 `db:seed`。

启用真实收款前仍须完成：商户及产品权限核实、独立程序复用项目代码的真实安全echo、真实通知入口与故障验证、小额交易及退款联调、账单下载及逐笔对账闭环、线上告警与异常处理流程。当前默认关闭，不作为可直接上线收款的验收结论。

## 7. 官方依据

知识库本地路径：`C:/Users/Gaoshuo/.codex/skills/wechatpay-payment-integration/assets/微信支付官网文档/`。

- [普通商户/JSAPI支付/开发指引](https://pay.weixin.qq.com/doc/v3/merchant/4012791870)：`APIv3/普通商户/支付产品/JSAPI支付/开发指引-4012791870.md`。
- [普通商户/Native支付/开发指引](https://pay.weixin.qq.com/doc/v3/merchant/4012791891)：`APIv3/普通商户/支付产品/Native支付/开发指引-4012791891.md`。
- [普通商户/H5支付/开发指引](https://pay.weixin.qq.com/doc/v3/merchant/4012791831)：`APIv3/普通商户/支付产品/H5支付/开发指引-4012791831.md`。
- [Native下单](https://pay.weixin.qq.com/doc/v3/merchant/4012791877)、[JSAPI下单](https://pay.weixin.qq.com/doc/v3/merchant/4012791856)、[H5下单](https://pay.weixin.qq.com/doc/v3/merchant/4012791834)：对应支付产品的API列表同编号主文件和Java请求示例。
- [查询订单](https://pay.weixin.qq.com/doc/v3/merchant/4012791880)、[关闭订单](https://pay.weixin.qq.com/doc/v3/merchant/4012791881)：`APIv3/普通商户/支付产品/Native支付/API列表/`下对应主文件。
- [申请退款](https://pay.weixin.qq.com/doc/v3/merchant/4013071036)、[查询退款](https://pay.weixin.qq.com/doc/v3/merchant/4013071041)：`APIv3/普通商户/支付产品/订单退款/API列表/`下对应主文件。
- [支付成功回调通知](https://pay.weixin.qq.com/doc/v3/merchant/4012791861)：`APIv3/普通商户/支付产品/JSAPI支付/API列表/支付成功回调通知-4012791861.md`。
- [请求签名](https://pay.weixin.qq.com/doc/v3/merchant/4012365336)、[公钥验签](https://pay.weixin.qq.com/doc/v3/merchant/4013053249)、[通知解密](https://pay.weixin.qq.com/doc/v3/merchant/4012071382)、[JSAPI调起签名](https://pay.weixin.qq.com/doc/v3/merchant/4012365339)：`APIv3/普通商户/通用规则/开发须知/`下对应签名、验签和解密文档。
- [API基本规则](https://pay.weixin.qq.com/doc/v3/merchant/4012081709)、[HTTP状态码](https://pay.weixin.qq.com/doc/v3/merchant/4012081717)：`APIv3/普通商户/通用规则/开发须知/接口规则说明/`下对应文档。


### 本批验证结果

后端29套件202个单元用例、交易/许可证/权限33个隔离e2e用例、后台35个UI契约检查通过；全仓typecheck/lint与三端构建通过。覆盖配置加密与只写、空值保留、即时生效、权限/版本冲突/未决交易保护、互斥计价、长期有效券码和现金业务防零积分绕过。浏览器检查说明见接入质量记录。


配置指引新增依据：
- [开发必要参数说明](https://pay.weixin.qq.com/doc/v3/merchant/4013070756)：`APIv3/普通商户/通用规则/开发须知/开发参数申请和配置/开发必要参数说明-4013070756.md`。
- [Native开发接入准备](https://pay.weixin.qq.com/doc/v3/merchant/4015614538)：`APIv3/普通商户/支付产品/Native支付/开发接入准备-4015614538.md`。
- [配置APIv3密钥](https://pay.weixin.qq.com/doc/v3/merchant/4012072195)：`APIv3/普通商户/通用规则/开发须知/开发参数申请和配置/配置APIv3密钥-4012072195.md`。

本轮新增迁移已先在隔离库验证，再核对本机回环地址 joinyuu 开发库后应用；本机后端健康检查为1.6.2。未在普通开发库运行测试或种子，未部署生产。
