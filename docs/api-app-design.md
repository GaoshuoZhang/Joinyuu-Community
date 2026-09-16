# 聚屿社区 · 客户端 API 设计（/api/app/**）

> M2 客户端 Web（居民端）端点设计。依据：M0 冻结的实体模型与状态流（`docs/wiki-admin-web.md`）、
> 后端既有契约与业务规则（`docs/wiki-backend.md` §4/§5/§8）、M1.5 已落地的数据模型（43 模型）。
> 本文档为 M2 实施的契约基线：实施前如有调整，先改本文档（记录变更）再改代码（wiki-backend §14 契约变更流程）。
> 状态：设计稿（M1-E 产出；2026-09-12 按 M1.5 代码现状同步词汇与类型）。

## 1. 定位与范围

- 服务对象：个人用户 / 社区个体 / 社区企业成员 / 合作企业成员（external_enterprise 身份，经企业合作/身份绑定申请产生，无独立注册入口）。
- 路径前缀：`/api/app/**`，与管理端 `/api/admin/**` 平行；复用同一 NestJS 应用、同一 Prisma 库与包络/异常底座。
- 不做：管理端能力（审核/发布/配置）、管理端通知中心（AdminNotification 为管理员维度）。

## 2. 鉴权模型

| 项 | 设计 |
|---|---|
| 注册 | `POST /api/app/auth/register`；受 `SystemConfig.registrationOpen` 开关控制（关闭 → 400「注册暂未开放」）；手机号唯一；默认授予 `individual` 身份 |
| 登录 | `POST /api/app/auth/login`（手机号+密码）；签发多身份 JWT：`{ sub: uid, scope: 'app', identities: [...], jti }` |
| 令牌校验 | 复用 JWT Guard（按 `scope` 区分 admin/app 两套守卫）；登出黑名单复用 `auth:blacklist:{jti}` |
| 登出 | `POST /api/app/auth/logout` |
| 每日登录积分 | 登录成功触发 `daily_login` 规则（PointsRule 固定触发项，种子默认停用；引擎按规则启停发放，自然日去重随 M2 客户端接入落地） |

## 3. 通用约定（沿用 wiki-backend §4）

- 响应包络 `{ code: 0, data }`；错误 `{ code, message }`，中文文案风格与 M0 一致。
- 分页 `page`/`pageSize` → `{ list, total }`。
- 时间字段 `YYYY-MM-DD HH:mm` 字符串（M1 既有口径）。
- 功能开关：`registrationOpen / mallOpen / demandOpen / reservationOpen` 由配置端点下发，写端点服务端二次校验。

## 4. 配置与字典下发

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/config | 站点信息 + 功能开关 + 站点标语（登录页/首页用；不含 updatedBy 等管理字段） |
| GET | /api/app/dicts/:type | 仅 `status=enabled` 字典项（复用 `dicts:{type}` 缓存，管理页缓存键一致） |

## 5. 个人中心

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/me | 资料 + 身份列表（含各身份经验/等级）+ 积分余额 |
| PUT | /api/app/me | 更新昵称/头像/性别/简介等可编辑字段（头像为 `POST /uploads` 返回的 url） |
| GET | /api/app/me/points-records | 我的积分流水（分页，含 balance）；积分按身份隔离：仅社区个体/个人用户可查看 |
| GET | /api/app/me/realname | 实名认证状态：`{ verified, realName? 脱敏（首字）, citizenIdMasked? 前 4 后 4, verifiedAt? }`；「编辑资料」页实名认证入口 note（已认证/未认证）；缺口 m2-client-plan §7.1-18 |
| PUT | /api/app/me/realname | 提交实名认证：`realName` + `citizenId`（18 位，含校验码）；已认证 409；真实后端需三要素/公安库核验后回写（mock 即时通过并发站内信） |
| GET | /api/app/me/experience-records | 我的经验与等级（按**当前身份**取数：社区个体 → 个人经验/我的等级；社区企业 → 企业经验/企业等级；个人用户/合作企业 → 空）；可选 `identity` 查询参数指定身份；响应 `{ identityLabel, level, levelName, nextLevelExp, records[] }`——缺口 m2-client-plan §7.1-7 |
| GET | /api/app/me/applications | 我提交的申请（含审核时间线） |
| GET | /api/app/application-form/:type | 申请表单 schema：`type` = settle 企业入驻 / cooperation 合作伙伴 / individual 人才登记；返回字段定义（text/textarea/select/number/date/upload、必填、选项、上传 accept/maxCount）与提交按钮文案，客户端按 schema 渲染（后台可配置，见 m2-client-plan §7.2-5） |
| POST | /api/app/applications | 提交申请：schema 驱动字段（`fields`: key → string \| number \| 附件数组）与 identity 身份绑定（`identityType`）；upload 字段值为 `POST /api/app/uploads` 返回的 `{ key, name, size, type, url }` 数组 → 管理端「申请审核」 |
| GET | /api/app/me/cards | 我的个人名片（社区个体；简历式分段字段；缺口 m2-client-plan §7.1-16） |
| PUT | /api/app/me/cards/individual | 保存个人名片：`displayName/age/politicalStatus/intro/industryExperience/skills` + 可增删分段 `education/work/projects/honors/socials/customLinks`（条目数组）；头像同步个人资料（只读）；真实后端应提交审核；保存后公开到社区人才库 |
| GET | /api/app/me/identities | 我的关联身份列表：社区个体 + 我关联的社区企业/合作企业（可多个）；企业项含 `roleLabel`（负责人/成员）、`isContact`、`permissions`（成员权限；负责人为全部）、`showcaseStatus` 与 `enterpriseId` 详情入口；「我的」页有关联身份时显示「关联身份」入口 |
| GET | /api/app/me/enterprises/:id | 企业详情：关联人可查看；含企业信息（`logo` 企业 Logo、`foundedAt` 成立时间、`website` 官网、`address` 办公地点、`services` 主营业务、`advantages` 核心优势）、成员列表（含 `isContact`、职位与 `permissions`）、`myPermissions`（我在该企业的权限集合；负责人为全部）、负责人、待接受邀请（仅负责人）与退驻/注销申请状态 |
| PUT | /api/app/me/enterprises/:id | 修改企业基本信息（需 `edit_card` 权限；负责人默认拥有；行业/规模/简介/`logo`/成立时间/官网/办公地点/主营业务/核心优势；真实后端应提交审核，企业走 `showcaseStatus`） |
| POST | /api/app/me/enterprises/:id/transfer-contact | 转移企业负责人（后台字段「联系人」= `contactUserId`，**仅负责人本人**）：`memberUid?` / `memberName`；转移后原负责人转为只读成员 |
| POST | /api/app/me/enterprises/:id/invite | 邀请企业成员（需 `invite_member` 权限；姓名 + 手机号 + **职位 `role` 必填**）：生成邀请记录并给被邀请人发站内信（`/me/invitations/:id`）；手机号需已注册，已是成员/重复邀请/邀请自己分别 409；真实后端应支持短信邀请未注册手机号（缺口 m2-client-plan §7.1-17） |
| PUT | /api/app/me/enterprises/:id/member | 修改企业成员信息：`memberUid?`/`memberName` + `role`/`phone`（需 `manage_members`；phone 为空串表示清空，冲突 409）+ `permissions`（需 `assign_permission`；负责人不可被分配，8 项枚举） |
| POST | /api/app/me/enterprises/:id/remove-member | 移除企业成员（需 `manage_members` 权限；`memberUid?`/`memberName`；负责人本人需先转移负责人，否则 409） |
| POST | /api/app/me/enterprises/:id/exit-application | 申请企业退驻/注销（可选 `reason`）→ 管理端审核；mock 记录 pending 状态 |
| GET | /api/app/invitations/:id | 企业成员邀请详情（被邀请人本人或邀请方负责人可看，否则 403）：企业概要（`enterpriseLogo/enterpriseIndustry/enterpriseSize`）+ 邀请人/受邀成员/职位/状态（pending/accepted/rejected）与时间 |
| POST | /api/app/invitations/:id/respond | 被邀请人处理邀请（body `action=accept\|reject`，仅被邀请人）：接受则写入企业成员并通知负责人；已处理 409 |

## 6. 需求广场

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/demands | 浏览列表：仅 `published`；按可见范围过滤（§9）；分页/类别/关键词；可选 `kind=task\|investment\|cooperation` 按需求类型筛选（分页与 total 统计前执行，省略时不限；历史无 kind 数据按 task）；返回 `kind`（task 找服务 / investment 找投资 / cooperation 找合作）与类型专属字段（task 含 `deliverBy` 预期交付日期；各类型含联系人 `contactName/contactPhone/contactEmail`） |
| GET | /api/app/demands/:id | 详情（不可见 → 404，不暴露存在性）；含响应数、`kind` 与类型专属字段（task: deliverable/budget/deliverBy；investment: cooperationNeed/returnOffer；cooperation: bottleneck/partnershipMode/returnOffer）与联系人信息 |
| POST | /api/app/demands | 提交需求：`demandOpen` 开关校验；`kind` 必填（task/investment/cooperation）；`categoryDict` 指定类目字典（task/cooperation→demand_category，investment→industry）；task 必填 `deliverable`（可选 `budget`）与 `deliverBy`（预期交付日期，希望在该日期前完成），investment 必填 `cooperationNeed`（可选 `returnOffer`），cooperation 必填 `bottleneck`（可选 `partnershipMode`/`returnOffer`）；`contactName`/`contactPhone` 必填、`contactEmail` 选填（校验格式）；`deadline` 不再收集（历史字段保留展示）；`asIdentity` 四类身份均可发布（含合作企业，类型不限），持有社区个体身份时不再单列个人用户选项；发布方身份快照按 wiki §8.7，`publisherName` 按主体取企业名/组织名（个人取昵称）；成员代企业发布时传 `asEnterpriseId`（服务端校验成员 `publish_demand` 权限，无权限 403）；创建即 `pending` → 管理端审核 |
| GET | /api/app/me/demands | 我发布的需求（全状态，含 `kind`） |
| POST | /api/app/demands/:id/respond | 响应需求：`published` 校验、不可响应自己的需求、防重复；通过后触发 `demand_responded` 积分（发放给响应成员，M2 批次） |
| GET | /api/app/me/responses | 我的需求响应记录 |
| POST | /api/app/me/responses/:id/withdraw | [MOCK-ONLY·缺口 §7.1-19] 响应者撤回待处理响应（撤回后可重新响应）；已处理 409 |
| GET | /api/app/me/demands/:id/responses | [MOCK-ONLY·缺口 §7.1-19] 需求发布者查看响应列表（响应方快照 + `status=pending/accepted/rejected` + 审核时间/驳回原因）；非发布者 403 |
| POST | /api/app/me/demands/:id/responses/:responseId/review | [MOCK-ONLY·缺口 §7.1-19] 发布者处理响应（`action=accept\|reject`，驳回必填原因）；接受后需求转 `projected` 并在事务内生成协作项目（双向记录 + 里程碑）、发放 `demand_undertaken` 积分与项目经验、通知双方、自动驳回其余待处理响应 |

## 7. 活动中心

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/events | 浏览列表：`published` 且未结束；按可见范围过滤（§9）；分页/类型/关键词 |
| GET | /api/app/events/:id | 详情：报名进度（已通过/容量）、我是否已报名 |
| POST | /api/app/events/:id/enroll | 报名：`enrollmentOpen` + 报名截止 + 容量 + 可报名范围（§9）校验；`requireReview` 时进入 pending |
| POST | /api/app/events/:id/enroll/cancel | 取消报名：pending/approved 可取消，approved 释放名额 |
| GET | /api/app/me/enrollments | 我的报名（含活动信息与状态） |

> 签到维持管理端代签（M0 口径）；客户端电子签到（签到码）列为 M2 可选项，需先补契约。

## 8. 项目协作 / 积分商城 / 空间 / 内容

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/me/projects | 我承接的项目（需求发起方 / 本人或其社区企业身份所在企业承接；进度与里程碑状态） |
| GET | /api/app/me/projects/:id | 项目详情（参与双方可看）：参与人、来源需求、进度与里程碑交付验收状态——[MOCK-ONLY·缺口 §7.1-19] |
| POST | /api/app/me/projects/:id/milestones/:milestoneId/submit | [MOCK-ONLY·缺口 §7.1-19] 承接方提交里程碑完成（可附说明）→ 待发起方验收；发起方调用 403 |
| POST | /api/app/me/projects/:id/milestones/:milestoneId/accept | [MOCK-ONLY·缺口 §7.1-19] 发起方验收里程碑；全部验收通过自动结项并按 wiki-backend §8.6 发放 `project_completed` 经验 |
| GET | /api/app/mall/goods | 商品列表：`on` 且有库存优先（`restock` 库存为 0 不展示）；`mallOpen` 关闭 → 400 |
| GET | /api/app/mall/goods/:id | 商品详情 |
| POST | /api/app/mall/orders | 兑换下单：积分充足 + 库存充足（事务：扣积分+写流水+扣库存+建订单 `pending_shipment`） |
| GET | /api/app/me/orders | 我的兑换订单 |
| GET | /api/app/spaces | 可预约空间列表（`needApproval`/时段/设备） |
| GET | /api/app/spaces/:id/availability?date= | 某日已占用时段（已通过预约 + 已发布活动占用，口径同 wiki §8.8） |
| POST | /api/app/spaces/reservations | 提交预约：`reservationOpen` 校验 + 提交前冲突预检（409 文案同 §8.8）→ 管理端审核；payload 增 `asIdentity`（预约主体：个人用户/社区个体/社区企业/合作企业，均可预约），企业身份以企业名/组织名入主体快照；成员代企业预约时传 `asEnterpriseId`（服务端校验成员 `space_reserve` 权限，无权限 403） |
| GET | /api/app/me/reservations | 我的预约（可取消 pending/approved）；返回 `identityType`/`subjectName` 主体快照 |
| GET | /api/app/articles | 文章列表（`published`，栏目筛选/关键词；浏览量详情时 +1） |
| GET | /api/app/articles/:id | 文章详情 |
| GET | /api/app/article-columns | 栏目列表（enabled） |
| POST | /api/app/articles | 投递文章（channel=submitted，编号 SU 前缀）：提交即待审核，审核通过转待发布（状态机同 wiki §8.1，作者身份快照） |
| GET | /api/app/me/articles | 我投递的文章（含驳回原因，可再提交） |
| GET | /api/app/enterprises/:id | 企业展示页（`showcaseStatus=published` 才可见；含 `logo`/`foundedAt`/`website`/`address`/`services`/`advantages` 精致名片字段） |
| POST | /api/app/showcase-requests | 展示页发布申请提交 → 管理端审核联动企业 showcaseStatus |
| POST | /api/app/uploads | 申请资料 / 配图上传：multipart（`file` + `bizType`），仅图片与 PDF（魔数嗅探），大小限制同系统配置；返回 `{ key, name, size, type, url }` |

### 8.1 v33~v37 Mock 超界端点（[MOCK-ONLY]，接入期逐条销号）

> 客户端已实现、后端尚无对应端点的能力（缺口 §7.1-19~22）。接入期需补服务端实现并在本节转为正式契约。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/me/demands/:id/responses | 需求发布者查看响应（响应方快照 + `status=pending/accepted/rejected` + 审核时间/驳回原因）；非发布者 403 |
| POST | /api/app/me/demands/:id/responses/:responseId/review | 发布者处理响应（`action=accept\|reject`，驳回必填原因）；接受后需求转 `projected` 并在事务内生成项目（双向记录 + 里程碑）、发放积分/经验、通知双方、自动驳回其余待处理响应 |
| POST | /api/app/me/responses/:id/withdraw | 响应者撤回待处理响应（撤回后可重新响应） |
| GET | /api/app/me/projects/:id | 项目详情（参与双方、来源需求、进度与里程碑交付验收状态） |
| POST | /api/app/me/projects/:id/milestones/:milestoneId/submit | 承接方提交里程碑完成（可附说明）→ 待发起方验收；发起方调用 403 |
| POST | /api/app/me/projects/:id/milestones/:milestoneId/accept | 发起方验收里程碑；全部验收通过自动结项并按 wiki-backend §8.6 发放 `project_completed` 经验 |
| POST | /api/app/me/demands/:id/withdraw · /resubmit · /appeal | 需求撤回（pending→withdrawn）、驳回/撤回后重提（保留编号）、驳回后一次性申诉 |
| POST | /api/app/me/articles/:id/withdraw · /resubmit · /appeal；GET /api/app/me/articles/:id/payload | 投稿撤回 / 重提（回填原始内容）/ 申诉 |
| POST | /api/app/me/applications/:id/withdraw · /resubmit；GET /api/app/me/applications/:id/payload | 申请撤回 / 修改重提（可补充材料；附件需重新上传） |
| POST | /api/app/mall/orders/:id/use | 服务权益核销（`pending_use → completed`）；`Goods` 增 `fulfillment=physical\|voucher\|service`，券码订单返回 `voucherCode` |
| POST | /api/app/mall/goods/:id/restock-subscribe | 缺货商品到货提醒订阅（补货通知依赖后台补货动作） |
| POST | /api/app/reports | 举报（需求 / 文章 / 企业名片；管理端举报处理与内容处置为后台缺口） |
| GET | /api/app/me/favorites · POST /api/app/me/favorites/toggle | 收藏需求 / 文章 / 活动与切换 |
| POST | /api/app/me/enterprises/invitations/:id/revoke | 撤销待接受的企业成员邀请（邀请 7 天有效期） |
| GET | /api/app/me/transfer-requests · POST /:id/respond · /:id/cancel | 负责人转移请求列表 / 目标成员接受或拒绝 / 发起方撤销（接受后变更负责人） |
| POST | /api/app/analytics/events | Mock 埋点漏斗（登录/注册/发布/响应/报名/签到/下单/投稿/预约/收藏/举报/搜索）；真实接入为数据平台上报 |
| GET/POST/PUT/DELETE | /api/app/me/addresses(/:id) | v38 收货地址簿（默认地址唯一）；实物订单创建必带 `addressId` 并写入收货快照 |
| POST | /api/app/auth/reset-password · /auth/change-phone · /me/change-password | v38 找回密码（短信码+限频）/ 换绑手机号（新号验证码+占用 409）/ 登录态改密（原密码校验，成功后其他会话失效） |
| POST | /api/app/me/deletion-request · /me/data-export | v38 注销申请（运营复核）与个人数据导出（异步打包 + 站内信） |
| GET/POST | /api/app/events/:id/feedback | v38 活动反馈（结束后 + 参与过，一人一条） |
| GET/PUT | /api/app/me/notices/prefs | v38 通知偏好（启用的类型集合，至少一种；同时约束推送） |
| POST | /api/app/mall/orders/:id/cancel | v38 用户取消实物待发货订单（退积分 + 回补库存）；券码订单签发 `voucherExpiresAt`（30 天） |
| POST | /api/app/me/projects/:id/milestones/:mid/return | v38 发起方退回里程碑（记录原因，承接方可重新提交；提交支持 `attachments[]`） |
| GET | /api/app/me/reports | v38 我的举报（状态 pending/resolved/rejected 由 admin 处置回写） |
| GET/POST | /api/app/me/blocklist(/:uid/remove) | v38 屏蔽名单（评论与内容列表过滤被屏蔽用户） |
| POST/GET | /api/app/articles/:id/likes/toggle · /articles/:id/comments | v38 文章点赞与评论（评论 2-200 字，过滤屏蔽用户） |
| POST | /api/app/auth/register（`agreed` 必填） | v38 注册须同意用户协议与隐私政策并留痕 |

## 9. 可见范围与可报名范围过滤（需求/活动通用）

- 用户身份集合 I（individual/community_individual/community_enterprise/external_enterprise）与等级集合 L（各身份 level）。
- 需求：`visibilityIdentities` 含 I 中任一身份类型 **且** `visibilityLevels` 与该身份等级有交集；空数组语义 = 不限（沿用 M0）。
- 活动：浏览按 `visibilityIdentities/Levels`；报名另校验 `enrollmentIdentities/enrollmentLevels`。
- 过滤在服务端实现（列表 SQL 条件 + 详情 404），不依赖前端隐藏。

## 10. 积分引擎触发点（M2 批次，wiki-backend §8.4）

`daily_login`（登录）、`article_accepted`（投稿审核通过）、`demand_published`（需求审核通过后由管理端发布即触发）、`demand_responded`（客户端响应）、`demand_undertaken`（立项）、`project_milestone`（里程碑完成）。M1/M1.5 已接入：`activity_enroll_approved` / `activity_checkin` / `identity_first_bind`（其余触发点随 M2 客户端行为落地；引擎一次建成、按规则启停发放）。

## 11. 里程碑建议

| 阶段 | 内容 |
|---|---|
| M2-A | 骨架 + 注册登录/多身份 JWT + 配置与字典下发 + 个人中心/积分流水 |
| M2-B | 需求广场（浏览/提交/响应）+ 活动中心（浏览/报名）+ 可见范围过滤 |
| M2-C | 商城兑换 + 空间预约 + 文章投递 + 企业名片申请 + 申请审核闭环联动 |

## 修订记录

| 日期 | 摘要 |
|---|---|
| 2026-09-10 | 初版：M1-E 产出 M2 客户端端点设计稿（覆盖注册登录/多身份、需求、活动、项目、商城、空间、内容、展示页、个人中心） |
| 2026-09-12 | 按 M1.5 现状同步：申请类型扩为 settle/individual/cooperation/identity（企业入驻/个体入驻/企业合作/身份绑定）；「外部企业」→「合作企业」、审批→审核；每日登录积分改由 PointsRule `daily_login` 控制（`SystemConfig.dailyLoginPoints` 已删）；投稿编号 SU 前缀与文章状态机口径更新；模型数 43 |
| 2026-09-13 | 企业合作/人才登记流程重构：新增申请表单 schema（`GET /application-form/:type`，后台可配置自定义字段）与 app 通用上传（`POST /uploads`，图片/PDF）约定；`POST /applications` 改为 schema 驱动字段 + 附件数组（identity 身份绑定保留 `identityType`） |
| 2026-09-13 | 需求类型与专属字段：`POST /demands` 增 `kind/categoryDict` 与 task/investment/cooperation 专属字段（deliverable/budget / cooperationNeed/returnOffer / bottleneck/partnershipMode/returnOffer），列表、详情与「我的需求」返回 `kind`（task 找人干活 / investment 找投资 / cooperation 找合作；缺口 m2-client-plan §7.1-15） |
| 2026-09-13 | 我的展示页自助编辑：新增 `GET/PUT /api/app/me/showcase`（社区企业/社区个体；企业编辑走展示页审核流，个人展示页联动社区人才库；缺口 m2-client-plan §7.1-16） |
| 2026-09-13 | 展示页更名「名片」+ 企业名片/企业管理：`GET /me/cards`、`PUT /me/cards/individual`、`PUT /me/cards/enterprise`（仅企业联系人）替换原 `/me/showcase`；新增企业管理 `GET/PUT /me/enterprise`、`POST /me/enterprise/transfer-contact`（转移负责人 = 后台 `contactUserId`）/`invite`/`exit-application`（缺口 m2-client-plan §7.1-16） |
| 2026-09-14 | 身份资产隔离：积分仅社区个体/个人用户可查看；新增 `GET /me/experience-records`（可选 `identity` 查询参数，按当前身份返回个人/企业经验与等级，社区个体→我的等级、社区企业→企业等级、个人用户/合作企业→空；缺口 m2-client-plan §7.1-7） |
| 2026-09-14 | 主体快照对齐：`POST /demands` 明确四类身份（含合作企业）均可发布全部类型，`publisherName` 按主体取企业名/组织名；`POST /spaces/reservations` 增 `asIdentity`（四类身份均可预约，企业主体记企业名/组织名），`GET /me/reservations` 返回 `identityType/subjectName` |
| 2026-09-14 | **身份模型收敛：移除全局「当前身份」切换**——身份仅在发布/提交表单内选择（归属快照）；「我的」页不再有身份切换，经验页按个人维度取数（`identity` 参数保留兼容）；企业能力收敛为「企业管理」：`GET /me/enterprises`（关联企业列表）+ `GET/PUT /me/enterprises/:id` + `POST /me/enterprises/:id/transfer-contact` / `invite` / `exit-application`（负责人可写、成员只读）；移除 `PUT /me/cards/enterprise` 与旧 `/me/enterprise` 系列端点 |
| 2026-09-14 | 「企业管理」升级为「关联身份」：列表端点由 `GET /me/enterprises` 改为 `GET /me/identities`（含社区个体 + 全部关联社区企业/合作企业，可多个）；企业详情与操作仍为 `/me/enterprises/:id` 系列 |
| 2026-09-14 | 需求表单调整：`deadline` 不再收集（保留历史字段展示，日期展示优先 `deliverBy`）；task 新增 `deliverBy`（预期交付日期）；三类需求新增 `contactName/contactPhone/contactEmail` 联系人信息；持有社区个体身份时发布身份选项不再单列个人用户 |
| 2026-09-14 | 头像与企业管理增强：`PUT /me` 增 `avatar`（头像上传 url）；企业增 `logo`（企业详情/展示页返回，`PUT /me/enterprises/:id` 可保存）；邀请成员增必填 `role` 职位，新增 `PUT /me/enterprises/:id/member-role`（负责人可修改成员职位） |
| 2026-09-14 | 个人名片简历化 + 企业名片丰富 + 头像同步：`PUT /me/cards/individual` 扩为分段字段（age/politicalStatus/industryExperience + education/work/projects/honors/socials/customLinks 可增删），新增 `GET /community/talents/:uid`（公开人才名片，头像取个人资料）；企业名片增 `foundedAt/website/address/services/advantages`（详情与展示页返回、负责人可编辑）；头像与 Logo 改为点头像直接上传/替换 |
| 2026-09-14 | 企业管理细化：新增 `POST /me/enterprises/:id/remove-member`（负责人可移除成员，负责人本人需先转移）；企业名片编辑独立成页（企业详情仅保留负责人/成员/退驻模块 + 「编辑企业名片」入口，编辑仍走 `PUT /me/enterprises/:id`）；企业名片页标题与人才名片底栏归属「社区」Tab |
| 2026-09-14 | **企业成员邀请闭环与成员手机号维护**：`POST /me/enterprises/:id/invite` 改为生成邀请记录 + 站内信（不再直接写入成员）；新增 `GET /invitations/:id`（邀请详情）与 `POST /invitations/:id/respond`（accept/reject，接受后写入成员并通知负责人）；`PUT /me/enterprises/:id/member-role` 改为 `PUT /me/enterprises/:id/member`（职位 + 手机号）；企业详情返回 `invitations`（待接受列表，仅负责人）；缺口 m2-client-plan §7.1-17 |
| 2026-09-14 | **企业成员权限体系**：成员增 `permissions`（8 项枚举：`publish_demand/respond_demand/space_reserve/article_submit/manage_members/invite_member/assign_permission/edit_card`），负责人默认全部；`PUT /me/enterprises/:id/member` 支持分配权限（需 `assign_permission`，role/phone 需 `manage_members`）；`invite`/`remove-member`/`PUT /me/enterprises/:id` 分别校验 `invite_member`/`manage_members`/`edit_card`；`GET /me/identities` 与 `GET /me/enterprises/:id` 返回 `permissions`/`myPermissions`；`POST /demands` 与 `POST /spaces/reservations` 支持 `asEnterpriseId` 代企业主体（校验对应成员权限）；响应需求/文章投稿的代企业主体字段待后续批次 |
| 2026-09-15 | **v33~v37 Mock 超界端点登记**：新增 §8.1 汇总客户端已实现、后端待补的需求撮合与项目协作、审核撤回/重提、商城履约、信任治理、收藏/提醒/埋点端点（缺口 m2-client-plan §7.1-19~22） |
| 2026-09-15 | **实名认证入口**：新增 `GET/PUT /me/realname`（实名状态 + 提交姓名/身份证号；实时状态脱敏展示；mock 即时通过，真实后端需三要素核验）；「编辑资料」页新增实名认证 Cell（note 已认证/未认证）；缺口 m2-client-plan §7.1-18 |
