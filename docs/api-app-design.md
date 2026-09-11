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
| PUT | /api/app/me | 更新昵称/性别/简介等可编辑字段 |
| GET | /api/app/me/points-records | 我的积分流水（分页，含 balance） |
| GET | /api/app/me/applications | 我提交的申请（含审核时间线） |
| POST | /api/app/applications | 提交申请：settle 企业入驻 / individual 个体入驻 / cooperation 企业合作 / identity 身份绑定 → 管理端「申请审核」 |

## 6. 需求广场

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/demands | 浏览列表：仅 `published`；按可见范围过滤（§9）；分页/类别/关键词 |
| GET | /api/app/demands/:id | 详情（不可见 → 404，不暴露存在性）；含响应数 |
| POST | /api/app/demands | 提交需求：`demandOpen` 开关校验；发布方身份快照按 wiki §8.7（选身份提交）；创建即 `pending` → 管理端审核 |
| GET | /api/app/me/demands | 我发布的需求（全状态） |
| POST | /api/app/demands/:id/respond | 响应需求：`published` 校验、不可响应自己的需求、防重复；通过后触发 `demand_responded` 积分（发放给响应成员，M2 批次） |
| GET | /api/app/me/responses | 我的需求响应记录 |

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
| GET | /api/app/me/projects | 我承接的项目（本人或其社区企业身份所在企业承接；进度/里程碑只读） |
| GET | /api/app/mall/goods | 商品列表：`on` 且有库存优先（`restock` 库存为 0 不展示）；`mallOpen` 关闭 → 400 |
| GET | /api/app/mall/goods/:id | 商品详情 |
| POST | /api/app/mall/orders | 兑换下单：积分充足 + 库存充足（事务：扣积分+写流水+扣库存+建订单 `pending_shipment`） |
| GET | /api/app/me/orders | 我的兑换订单 |
| GET | /api/app/spaces | 可预约空间列表（`needApproval`/时段/设备） |
| GET | /api/app/spaces/:id/availability?date= | 某日已占用时段（已通过预约 + 已发布活动占用，口径同 wiki §8.8） |
| POST | /api/app/spaces/reservations | 提交预约：`reservationOpen` 校验 + 提交前冲突预检（409 文案同 §8.8）→ 管理端审核 |
| GET | /api/app/me/reservations | 我的预约（可取消 pending/approved） |
| GET | /api/app/articles | 文章列表（`published`，栏目筛选/关键词；浏览量详情时 +1） |
| GET | /api/app/articles/:id | 文章详情 |
| GET | /api/app/article-columns | 栏目列表（enabled） |
| POST | /api/app/articles | 投递文章（channel=submitted，编号 SU 前缀）：提交即待审核，审核通过转待发布（状态机同 wiki §8.1，作者身份快照） |
| GET | /api/app/me/articles | 我投递的文章（含驳回原因，可再提交） |
| GET | /api/app/enterprises/:id | 企业展示页（`showcaseStatus=published` 才可见） |
| POST | /api/app/showcase-requests | 展示页发布申请提交 → 管理端审核联动企业 showcaseStatus |

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
| M2-C | 商城兑换 + 空间预约 + 文章投递 + 展示页申请 + 申请审核闭环联动 |

## 修订记录

| 日期 | 摘要 |
|---|---|
| 2026-09-10 | 初版：M1-E 产出 M2 客户端端点设计稿（覆盖注册登录/多身份、需求、活动、项目、商城、空间、内容、展示页、个人中心） |
| 2026-09-12 | 按 M1.5 现状同步：申请类型扩为 settle/individual/cooperation/identity（企业入驻/个体入驻/企业合作/身份绑定）；「外部企业」→「合作企业」、审批→审核；每日登录积分改由 PointsRule `daily_login` 控制（`SystemConfig.dailyLoginPoints` 已删）；投稿编号 SU 前缀与文章状态机口径更新；模型数 43 |
