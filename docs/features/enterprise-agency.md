# 企业代办（企业注册）

> 本期范围：移动 Web + 管理后台 + 后端 API。微信小程序按用户明确要求**不移植**，属于双向同步规则的显式例外。

## 1. 业务目标

为没有企业资质的用户提供企业注册代办：用户在移动端提交公司、股东、主要人员与证件材料，社区工作人员在后台受理、请求补充、完成或驳回，结果通过站内信通知。

本期只开放「企业注册」；「财税服务」「工商变更」「资质许可」仅保留后台菜单与占位页，移动端标记「筹备中」。

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

### 管理后台

一级菜单「企业代办」紧随「用户留言」：

| 二级菜单 | 路由 | 本期能力 |
| --- | --- | --- |
| 企业注册 | `/enterprise-agency/registration` | 列表、详情、受理、请求补充、完成、驳回、内部备注、附件预览 |
| 财税服务 | `/enterprise-agency/finance-tax` | 建设中占位页 |
| 工商变更 | `/enterprise-agency/business-change` | 建设中占位页 |
| 资质许可 | `/enterprise-agency/license` | 建设中占位页 |

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
- 本期不收费、不做办理结果附件回传；完成后由工作人员线下交付材料。
- 孤儿附件（上传后未提交）暂不自动清理，后续可加定时任务。
- 小程序端不提供企业代办入口与页面；恢复移植时需按小程序契约重新实现，不能照搬 Vue 组件。
