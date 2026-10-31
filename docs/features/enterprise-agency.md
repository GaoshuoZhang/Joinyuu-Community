# 企业代办（企业注册、财税服务、工商变更与资质许可）

> 开发基线为移动 Web + 管理后台 + 后端 API。用户后续已明确要求移植微信小程序，
> 小程序按同一接口与四步流程适配，视觉验收进度见 [小程序审查记录](../miniprogram/ui-ux-audit-2026-10-30.md)。

## 1. 业务目标

代办收费的实现、迁移及本地验收证据见[收费实施与验收记录](enterprise-agency-fees-2026-10-31.md)。真实商户/真机验收与生产发布仍待完成。

为没有企业资质的用户提供企业注册代办：用户在移动端提交公司、股东、主要人员与证件材料，社区工作人员在后台受理、请求补充、完成或驳回，结果通过站内信通知。

四类服务均已有 API、后台、移动 Web 与微信小程序实现，定位为社区代办前的需求与材料收集。任意登录用户可提交，与系统内企业身份解耦；工作人员受理时核实代表身份、实际可办范围及费用。提交不等于社区承诺承接、行政机关受理或已付款。

企业注册沿用既有开放策略；三个扩展服务有独立系统开关，迁移及新安装默认关闭。后台「系统管理 → 系统设置 → 站点与功能 → 功能开关 → 企业代办」逐项启用，不依赖空间预约开关。关闭只暂停新申请及新单上传，旧单查询、合法补件/重提及待处理撤回继续可用。

## 2. 信息架构

### 移动 Web

| 页面 | 路由 | 入口 |
| --- | --- | --- |
| 企业代办 | `/me/enterprise-agency` | 「我的」页「申请与预约」宫格 |
| 企业注册 | `/me/enterprise-agency/registration` | 企业代办页；`/intros/enterprise`；`/intros/talent` |
| 企业注册详情 | `/me/enterprise-agency/registration/:id` | 提交结果页；企业代办页办理记录 |

- 企业注册表单为四步：企业信息 → 股东信息 → 主要人员 → 材料与确认。
- 修改重提使用 `/me/enterprise-agency/registration?revise=<id>`。
- 企业代办页内嵌「我的办理记录」；有待处理的进行中申请时，主按钮进入详情或补充材料。

### 微信小程序

| 页面 | 路由 | 入口 |
| --- | --- | --- |
| 企业代办 | `/pkg/pages/me/enterprise-agency/index` | 「我的」页「申请与预约」宫格，不依赖空间预约开关 |
| 企业注册 | `/pkg/pages/me/enterprise-agency/registration/index` | 企业代办页、企业合作页、人才登记页；`?revise=<id>` 修改重提 |
| 企业注册详情 | `/pkg/pages/me/enterprise-agency/detail/index?id=<id>` | 提交结果页、办理记录 |

证件材料调用专用私有上传与鉴权下载接口，不能走 `/api/public/files`；未保存内容仅由页面内返回保护提示，不把证件表单保存到本地草稿。

### 管理后台

一级菜单「企业代办」紧随「用户留言」：

| 二级菜单 | 路由 | 本期能力 |
| --- | --- | --- |
| 企业注册 | `/enterprise-agency/registration` | 列表、详情、受理、请求补充、完成、驳回、内部备注、附件预览 |
| 财税服务 | `/enterprise-agency/finance-tax` | 列表、详情、受理、补件、完成、驳回、备注与私有附件 |
| 工商变更 | `/enterprise-agency/business-change` | 同上，按所选变更事项展示资料 |
| 资质许可 | `/enterprise-agency/license` | 同上，按许可/备案类型展示资料 |

权限码与路由一致，运营角色（R2）默认授予四项，超管 `*` 自动可见。

## 3. 状态机

| 状态 | 标签 | 进入方式 | 用户可操作 | 后台可操作 |
| --- | --- | --- | --- | --- |
| `pending` | 待处理 | 用户提交 / 修改重提 | 撤回 | 受理 / 请求补充 / 驳回 |
| `processing` | 代办中 | 后台受理 | 无 | 请求补充 / 完成 / 驳回 |
| `needs_info` | 待补充 | 请求补充 | 修改重提 | 完成 / 驳回 |
| `completed` | 已完成 | 完成 | 无 | 无 |
| `rejected` | 已驳回 | 驳回 | 修改重提 | 无 |
| `withdrawn` | 已撤回 | 用户撤回 | 修改重提 | 无 |

- 同一用户同一时间只允许一单处于 `pending/processing/needs_info`。
- 每次状态变化写入 `records` 时间线并推送站内信；内部备注 `visibility=admin`，用户端不返回。
- 创建和重提先在事务中锁定申请人；所有申请写操作先锁申请行再读取时间线。数据库部分唯一索引 `EnterpriseAgencyRequest_one_active_per_user_service` 限制同用户同服务仅一单未归档的 `pending/processing/needs_info` 申请，旧终态申请重提也必须检查此约束。部署须执行增量迁移，不能仅运行 `db push`；历史重复数据须人工核对，不自动删单。
- 申请写入、附件绑定、站内信及后台操作审计使用同一数据库事务。任何一步失败均回滚，客户端可重试；重复状态动作返回 409，不重复写入通知或时间线。通知静音规则仍然生效，内部备注不通知用户。此保证针对数据库站内信，不代表已完成短信/微信消息投递。
- 完成只改代办状态，不授予社区身份、不发积分，也不自动创建社区企业。

## 4. 表单字段与校验

### 企业信息

| 字段 | 规则 |
| --- | --- |
| 公司名称 | 2–60 字 |
| 注册地址 | 5–200 字 |
| 是否本社区地址 | 是/否；非本社区需产权人信息与房产证/租赁合同 |
| 产权人姓名 / 身份证号 / 电话 | 非本社区必填；身份证按 GB 11643 校验 |
| 经营范围 | 10–1000 字 |
| 注册资本（万元） | 大于 0，最多两位小数，上限 100000 |
| 联系人姓名 / 电话 | 必填，默认带出账号资料 |

### 股东（1–20 名，比例合计 100%）

| 类型 | 必填信息 | 材料 |
| --- | --- | --- |
| 自然人 | 姓名、身份证号、持股比例 | 身份证正面、反面 |
| 企业 | 公司名称、统一社会信用代码、该公司法定代表人姓名、持股比例 | 营业执照副本、该公司法定代表人身份证正反面 |

### 主要人员

| 角色 | 字段 | 规则 |
| --- | --- | --- |
| 法人 | 姓名、实名电话、邮箱、身份证正反面 | 必填 |
| 监事 | 姓名、实名电话、身份证正反面 | 可选；不设时提交 `supervisor: null` |
| 财务 | 姓名、实名电话、身份证正反面 | 法人可兼任；兼任时复用法人信息，不重复上传 |

### 授权

提交前必须勾选：已取得股东、法人、监事、财务、产权人授权，并同意社区为本次代办处理上述信息。授权版本 `2026-10` 与服务端写入的 `agreedAt` 一并落库。

## 5. 附件与隐私

身份证、房产证、租赁合同等属于敏感材料，**不得**走现有 `/api/app/uploads`（返回公开 `/api/public/files/:key`）。

本期独立链路：

- 上传：`POST /api/app/enterprise-agency/registration/uploads`，落 `EnterpriseAgencyFile`，返回 `fileId` 元数据。
- 客户端读取：`GET /api/app/enterprise-agency/registration/files/:fileId`，仅文件所有者。
- 管理端读取：`GET /api/admin/enterprise-agency/registrations/:id/files/:fileId`，需企业注册权限且文件属于该申请。
- 响应头 `Cache-Control: private, no-store`、`X-Content-Type-Options: nosniff`；管理端下载写审计日志。
- 移动端与管理端都用 Blob + 临时 objectURL 预览，不把私有接口地址直接放进 `<img src>`。
- 管理端列表手机号脱敏，身份证号不在列表展示；详情查看与状态变更写审计日志。
- 未绑定上传的孤儿清理默认仅预检，默认宽限72小时，开启条件与失败恢复见 [后端定时任务规范](../backend/development.md)。清理认领后禁止读取/绑定，已绑定历史材料不参与此任务。

## 6. API

### 客户端

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/app/enterprise-agency/registration/uploads` | 私有附件上传 |
| GET | `/api/app/enterprise-agency/registration/files/:fileId` | 本人附件读取 |
| POST | `/api/app/enterprise-agency/registrations` | 提交企业注册申请 |
| GET | `/api/app/enterprise-agency/registrations` | 我的办理记录 |
| GET | `/api/app/enterprise-agency/registrations/:id` | 我的申请详情 |
| POST | `/api/app/enterprise-agency/registrations/:id/withdraw` | 撤回（仅待处理） |
| POST | `/api/app/enterprise-agency/registrations/:id/resubmit` | 修改重提 |

### 管理端

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/enterprise-agency/registrations` | 列表（状态/关键词/分页） |
| GET | `/api/admin/enterprise-agency/registrations/:id` | 详情 |
| POST | `.../:id/accept` | 受理 |
| POST | `.../:id/request-info` | 请求补充（原因必填） |
| POST | `.../:id/complete` | 完成 |
| POST | `.../:id/reject` | 驳回（原因必填） |
| POST | `.../:id/notes` | 内部备注 |
| GET | `.../:id/files/:fileId` | 私有附件预览 |

## 7. 数据模型

- `EnterpriseAgencyRequest`：`serviceType=registration`、`userId`、`companyName/contactName/contactPhone`、`status`、`summary`、`payload`、`records`、`submittedAt/updatedAt`、归档字段。
- `EnterpriseAgencyFile`：`id`（UUID）、`userId`、`requestId?`、`storageKey`、`name/size/mime`、`createdAt/deletedAt`。
- 附件字段在 `payload` 中存 `{ fileId, name, size, mime }`，不存 URL。
- 与身份类 `Application` 完全独立，避免复用审核通过自动授予身份/积分的逻辑。

## 8. 已知边界

- 注册地址在本社区时，当前不要求产权人信息和房产证明；非本社区地址要求至少一项产权材料。
- 当前未接入线上代办收费，不代表社区免费服务；范围与线下费用由工作人员沟通确认。办理结果附件回传、报价/支付订单、退款与对账另行设计。
- 孤儿附件清理已实现，默认仅预检；正式开启仍需确定保留窗口、用户告知及观察期。已绑定任何一类服务的历史材料不参加孤儿清理。
- 小程序已提供四类代办入口、表单和详情；三类扩展服务的代表性闭环已通过微信开发者工具验收。完整条件组合、真机键盘与大字号仍待验证，范围及截图见 [验收记录](enterprise-services-acceptance-2026-10-31.md)。

## 9. 三个扩展服务的字段与交付口径

公共字段为公司名称、18位统一社会信用代码、联系人姓名/手机号、营业执照附件与授权版本。统一信用代码当前校验字符集与长度，不宣称已校验完整校验码。附件仅提交fileId，名称、大小、MIME由服务端重建。未知字段、非法枚举及条件必填错误由服务端返回400。

| 服务 | 条件字段 | 完成口径 |
| --- | --- | --- |
| 财税服务 | 代理记账/旧账整理/年报汇算三种目的；纳税人类型、月票据档位、社保/公积金、此前代账与交接情况；代理记账起始年月、旧账起止年月、年报年度及事项按目的显隐；交接/旧账整理的历史报表按条件收集 | 代理记账为签约与建账/交接；旧账为约定期间成果交付；年报/汇算为约定年度事项办妥及结果告知，不能全部“签约即完成” |
| 工商变更 | 名称、法定代表人、地址、经营范围、资本、股权、董监高备案及其他事项可多选；原/新信息按事项填写，未选类型的隐藏数据不提交；证件及协议按所选事项收集 | 所选事项全部达到双方确认的交付范围后完成；不能以部分办妥替代全部完成 |
| 资质许可 | 食品许可、仅销售预包装食品备案、人力资源、劳务派遣、二类医疗器械、ICP备案协助、进出口相关事项及其他；记录办理地区，负责人、场所、人员、资本、产品范围或网站信息按类型收集 | 根据许可、备案或咨询评估记录实际交付结果；提交材料不等于获批，实际条件和承接资格人工核验 |

公司注册表单已补充备选名称建议、出资期限提示、办理条件核查提示及营业执照交付完成说明。表单提示只用于说明当前流程，不代替当地办事指南。地区条件卡、材料保留政策及收费能力的后续事项见 [后续工作](enterprise-services-backlog.md)。

## 10. 跨端路由、记录与附件

| 服务 | serviceType/domain | 移动Web表单 | 小程序表单（均在pkg分包） |
| --- | --- | --- | --- |
| 财税 | finance_tax | `/me/enterprise-services/finance-tax` | `/pkg/pages/me/enterprise-services/finance-tax/index` |
| 工商变更 | business_change | `/me/enterprise-services/business-change` | `/pkg/pages/me/enterprise-services/business-change/index` |
| 资质许可 | license | `/me/enterprise-services/license` | `/pkg/pages/me/enterprise-services/license/index` |

Web详情为表单路径加 `/:id`；小程序详情为对应服务目录下 `detail/index?id=<id>`。修改重提使用表单 `?revise=<id>`，先确认本人和状态再回填。提交成功保留返回编号，重提保留原编号；原申请联系人和附件元数据均回填，不用当前账号资料覆盖。

枢纽读取 `/enterprise-services/catalog` 与 `/mine`，显示服务状态及聚合记录。`mine`含游标、hasMore与activeByService；进行中入口不依赖第一页记录，分页失败保留已加载内容与重试入口，游标失效提示刷新。记录键及通知目标均包含serviceType与id，不能只凭编号跨服务跳转。

扩展服务分别存于EnterpriseTaxEngagement、BusinessChangeRequest、LicenseApplication。EnterpriseAgencyFile通过domain及requestId/taxRequestId/changeRequestId/licenseRequestId关联，CHECK保证单一归属；未绑定上传也禁止跨服务复用。清理必须四个关联全空，数据库也禁止已绑定文件进入deleting。每个服务锁定自己的申请表后追加时间线；不能用注册表行锁代替其他表的行锁。

旧申请补件上传带 `requestId` 查询参数；服务暂停时仍校验本人、服务及可重提状态。客户端与管理端文件读取均鉴权，跨用户/跨服务/跨申请返回404。详情files只下发有效附件的元数据，不暴露存储键或公开URL。

## 11. 配置与验证

系统配置enterpriseTaxOpen、enterpriseChangeOpen、enterpriseLicenseOpen默认为false。旧后台省略新字段时保留原值，显式非布尔值返回400；沿用 `/system/config` 权限及操作审计，目录和新建检查直接读库，关闭与提交竞争同一配置行。

迁移包括 `20261030140000_enterprise_services_expansion`、`20261031010000_enterprise_service_switches` 与 `20261031011000_enterprise_service_cleanup_guard`。正常增量部署，不在日常/生产库执行seed或reset。验收脚本及隔离环境约定见 [浏览器联调](../workspace/browser-testing.md)。生产启用须由运营核对本社区可承接范围和用户告知，测试通过不自动打开线上开关。


## 企业代办入口开关（2026-10-31补充）

新增 `enterpriseAgencyOpen` 总开关及 `enterpriseRegistrationOpen` 注册业务开关（均默认true以保持已有注册能力），财税/工商变更/资质许可仍默认false。后台功能开关统一配置并留审计；旧载荷省略新字段保持原值。`/api/app/config`即时返回总开关及注册开关，后台壳读取同一公开配置，无需系统配置权限。

关闭单项时两端隐藏该服务申请卡片、介绍页引流入口；已有办理记录仍保留，旧单合法重提继续可用。关闭总开关时两端隐藏企业代办入口、直达页回到我的页；后台隐藏整个企业代办菜单并拦截直达页，清理已打开代办标签。总开关不覆写各子项设置。API总开关覆盖扩展服务目录和新建检查，注册新建也检查总/子开关；保留旧单读取及办理API，避免隐藏菜单等同删除业务数据。

## 2026-10-31 验收协议补强

聚合列表与进行中摘要不再返回联系人和电话，使用有界键集分页；四类申请提供持久revision及稳定时间线事件ID。三扩展服务记录表单/目录版本及服务端授权确认时间，两端从HTTP目录展示同版采集准备清单和动态附件状态。当前清单不是地区法定条件指南，办理条件、费用与代表授权仍由工作人员确认。具体契约、测试、迁移、截图与未决项见[验收补强记录](enterprise-services-hardening-2026-10-31.md)。

## 材料生命周期

未提交材料只存在客户端临时文件中，点击提交/重提时随表单上传；办理中（包括可修改重提的撤回、驳回、待补充）持续保留。完成时开始计时，上传附件默认保留90天，后台可配置；到期仅删除附件，不删除表单和办理记录。不向客户端显示保留期限、不开放用户申请删除入口。接口升级、后台入口、故障补偿与证据见[材料生命周期](enterprise-material-lifecycle-2026-10-31.md)。
