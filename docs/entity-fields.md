# 聚屿社区 · 实体字段清单（48 个已落地模型 + M2-R 后续规划扩展）

> 事实来源：`apps/api/prisma/schema.prisma`（唯一事实），本文档为人读索引。模型变更时改 schema 并向 wiki-backend §7 与本文档同步。
> 通用约定：主键为前缀字符串 ID（IdSequence 原子发号）；时间绝大多数为 String（AdminUser 的 createdAt/updatedAt 为 DateTime）；枚举用 String + 应用层校验；展示快照冗余为列不外键化。
> **M2-R 接入进度（2026-09-16）**：§8 为 `/api/app/**` 接入新增模型与字段；R1 已落地，R2~R4 仍按 `docs/m2-r-plan.md` §2.6 分批实施。

## 1. 认证、治理与基础设施（9）

- **AdminUser** — 管理端账号（id 自增；username 唯一；passwordHash bcrypt；name 展示名；status active/disabled；lastLoginAt?；createdAt/updatedAt DateTime；种子 admin/admin123）
- **AdminRole** — RBAC 角色（id R1+；code 唯一；name/description/sort/createdAt；内置 super/operator/auditor/space-ops）
- **AdminPermission** — 权限点目录（code PK：菜单路径或 perm:xxx 按钮码；name/module；authType menu|button；sort；共 49 码）
- **AdminUserRole** — 管理员-角色关联（adminUserId+roleId 联合唯一）
- **AdminRolePermission** — 角色-权限点关联（roleId+permissionCode 联合唯一）
- **LoginLog** — 登录日志（id LL；loginAt 秒级；username/ip/device；status success/fail/locked；failReason?；索引 loginAt/status）
- **SchedulerLog** — 定时任务执行日志（id SL；jobName/startedAt/finishedAt/durationMs；status ok/error；detail?；rowsAffected）
- **MallAsset** — 素材库（id AST；fileName/mime/size/url/storeKey；bizType? 业务分类；sourceType? article=资讯发布/submission=投稿内容；sourceId? 来源编号如 A1010/SU1006；createdBy/createdAt）
- **IdSequence** — 前缀 ID 发号器（entityType PK；nextNumber 原子自增）

## 2. 社区成员域（7）

- **User** — 用户（uid PK U；nickname 展示名；phone 唯一；email/gender；avatar?；status active/frozen；realName?/citizenId?；微信字段 M3 预留；frozenUntil?/frozenReason?；points 积分余额；registeredAt/lastActiveAt；bio；activities Json）
- **UserIdentity** — 一人多身份（userId 级联；type individual/community_individual/community_enterprise/external_enterprise；enterpriseId?/enterpriseName?/role?/title；level?/experience? 仅社区两类持有；唯一 userId+type+enterpriseId）
- **Enterprise** — 社区企业（id E；name/industry/size/foundedAt/settledAt?/leaseType；status pending 默认/active/exited/disabled；showcaseStatus none/pending/published/rejected + showcaseComment?；experience 企业经验；contactUserId? 关联个人用户 + contactTitle 职位 + contactName/contactPhone/contactEmail?；description/tags；deletedAt?/deletedBy?；**stage 已删**）
- **ExternalEnterpriseProfile** — 合作企业档案（id XE；name/industry；status active/disabled；size/foundedAt；description；cooperationCount/firstCooperationAt；deletedAt?/deletedBy?；聚合视图 = 档案 + external_enterprise 身份派生成员，不建独立实体表）
- **Application** — 申请审核（id AP；type settle 企业入驻/individual 个体入驻/cooperation 企业合作/identity 身份绑定；applicantName/applicantPhone/targetName；submittedAt；status pending/approved/rejected；summary；details Json 表单明细；records Json 审核时间线；deletedAt?/deletedBy?/archivableAt?）
- **ExperienceRecord** — 经验流水（id EX；targetType enterprise/individual；targetId；delta/balance/reason/at/operator；source rule/manual）
- **PointsRecord** — 积分流水（id PT；userId；delta/balance/reason/at/operator；source rule/manual/redemption；dedupeKey? 唯一，用于积分发放幂等）

## 3. 业务运营域（7）

- **Demand** — 需求（id D；状态机 pending→pending_release→published|scheduled→projected/closed/rejected；publisherId/publisherName/publisherIdentity Json?；contactName?/contactPhone?/contactEmail?；budget/period/deadline；scheduledAt?/publishedAt?；可见/可报名范围四数组；description/tags；rejectedReason?/matchedRespondent?/projectId?/respondPoints?；creatorName?/creatorId?；deletedAt?/deletedBy?/archivableAt?）
- **DemandRespondent** — 需求响应（demandId 级联；name/enterprise/phone?/email?/quote?/message/at；status pending/contacted/closed）
- **Project** — 项目（id P；code JY-YYYY-NN 唯一；status running/paused/closed/finished；progress；startDate/endDate/initiatedAt；description/memberCount；sourceDemandId?/expReward?/closeReason?；deletedAt?/deletedBy?/archivableAt?）
- **ProjectUndertaker** — 承接方（type enterprise/individual/custom；refId/name；share 合计须 100；contactName?/phone?）
- **Milestone** — 里程碑（status todo/active/done；date；owners[] 负责承接方）
- **CommunityEvent** — 活动（id EV；状态机 pending_release→published|scheduled→ended/cancelled；startTime/endTime/location/capacity/speaker/host；enrollmentOpen/requireReview/enrollmentDeadline?/scheduledAt?；报名范围四数组；enrollPoints?/checkinPoints?；description/tags；deletedAt?/deletedBy?/archivableAt?）
- **EventEnrollment** — 活动报名（唯一 eventId+userId；报名快照 name/enterprise/phone；appliedAt；status pending/approved/rejected；checkedIn/checkInAt?）

## 4. 积分商城与规则（5）

- **MallGoods** — 商品（id G；category physical/virtual/voucher；points/stock；status on/off/restock（库存为 0）；description/redeemedCount/createdAt；shippingMethods[] pickup|delivery + pickupAddress? + shippingFee?；visibilityIdentities/visibilityLevels 可见范围、orderIdentities/orderLevels 可下单范围；deletedAt?/deletedBy?/archivableAt?）
- **RedemptionOrder** — 兑换订单（id RO；状态机 pending_shipment→shipped→finished/cancelled；userId/userName + goodsId/goodsName/points；createdAt/shippedAt?/finishedAt?；recipientName?/recipientPhone?/address?/note?；cancelReason?；deletedAt?/deletedBy?/archivableAt?）
- **PointsRule** — 积分规则（code PK 固定 9 项：activity_checkin/activity_enroll_approved/article_accepted/demand_published/demand_responded/demand_undertaken/project_milestone/identity_first_bind/daily_login（默认停用）；name/scene/description 写死；points 可编辑；status）
- **ExperienceRule** — 经验值规则（code PK 固定 6 项：activity_checkin/activity_enroll_approved/article_accepted/project_undertaken/project_completed/identity_first_bind；exp/status 可编辑）
- **LevelTier** — 等级梯度（level PK 1-10；label/threshold 逐级递增）

## 5. 空间管理（6）

- **WorkstationArea** — 工位区域（id WA；name 唯一；type open/office/semi；description/createdAt）
- **Workstation** — 工位（id WS；seatNo 唯一；areaId 外键；type/capacity；status idle/assigned/maintenance；占用冗余 enterpriseId?/enterpriseName?/leaseId?（assigned 仅经租约）；defaultMonthlyRent?/areaSqm?/note?）
- **Lease** — 租约（id LS；renterId/renterName/renterType enterprise/individual/custom；startDate/endDate（长期为空串）/longTerm；status active/terminated，expiring/expired 读取派生；monthlyRent/rentPeriod day|week|month|year；contactName/contactPhone；terminatedAt?；deletedAt?/deletedBy?/archivableAt?）
- **LeaseWorkstation** — 租约-工位关联（leaseId+workstationId 联合 PK；保留终止后历史归属）
- **Space** — 公共空间（id S；name/type meeting/roadshow/meeting_room/multi/study；capacity/location/openTime/closeTime/allDay；needReservation/needApproval；equipment[]；status；description；deletedAt?/deletedBy?）
- **SpaceReservation** — 空间预约（id SR；userId/userName/phone；spaceId/spaceName；date/startTime/endTime/purpose/attendees；status pending→approved/rejected/cancelled；submittedAt；records Json 审核时间线；rejectReason?；deletedAt?/deletedBy?/archivableAt?）

## 6. 内容管理（4）

- **Article** — 文章（id 官方 A / 投稿 SU；channel official|submitted；title/columnId/columnName；authorId?（官方可空、投稿为 UID、合作企业为 XE*）/authorName/authorIdentity Json?；status pending 待审核→pending_release 待发布→scheduled 定时发布中→published，分支 rejected 已驳回；content 富文本 HTML（写入 sanitize）；scheduledAt?/publishedAt?；views/summary/tags/createdAt；rejectedReason?；archivableAt?/deletedAt?/deletedBy?）
- **ArticleColumn** — 栏目（id CL；name/description/sort；submissionOpen 开放投稿；system 系统保留「未指定」不可编辑；status）
- **ShowcaseRequest** — 展示页发布申请（id SC；targetType enterprise/individual；targetId?/targetName/contentSummary；submitterName/submitterPhone；submittedAt；status pending/approved/rejected/cancelled；records Json；rejectReason?；通过/驳回联动 Enterprise.showcaseStatus）
- **Announcement** — 公告（id AN；title/content；pinned；status published/withdrawn；publishedAt/createdAt/updatedAt?；archivableAt?/deletedAt?/deletedBy?）

## 7. 系统管理域（5）

- **AdminNotification** — 管理端通知（id N；type approval/demand_review/reservation/showcase/article/lease/schedule 共 7 类；title/content/at/read/link?）
- **AuditLog** — 审计日志（id AL；operator/module/action/target/detail?/at/ip?；before/after Json? 变更前后快照）
- **SystemConfig** — 系统配置（单例 id=1；siteName/siteSlogan；registrationOpen/mallOpen/demandOpen/reservationOpen；leaseExpireRemindDays；uploadMaxSizeMb 上传上限 MB 1-100 默认 10（素材库/富文本共用）；updatedAt/updatedBy；**dailyLoginPoints 已删**）
- **DictEntry** — 数据字典（type+code 联合 PK；type demand_category/industry/event_type/goods_category；label 全类型唯一；sort/status）
- **ArchiveSetting** — 归档设置（domain PK；autoArchive/archiveDelayDays 自动归档延时；autoPurge/purgeDelayDays 自动删除延时；archiveStatuses Json? 按状态开关）

## 8. M2-R 新增模型与字段扩展（2026-09-16；R1 已实施，R2~R4 规划）

> 迁移按 `docs/m2-r-plan.md` R1~R4 分批执行（每批一组迁移）。字段口径以客户端 `apps/client-mobile/src/types/index.ts` 与 `api-app-design.md` 为准，偏差先改契约文档。

### 8.1 新增模型（22）

| 批次 | 模型 | 说明（前缀/关键字段） |
|---|---|---|
| R1 | UserNotification | 站内信（id UN；userId；type audit_result/enroll_result/order/points/system/invite/transfer/report/article/demand/project/mall/service + link?；title/content/at；read/archived Bool）（§7.1-1） |
| R1 | UserNotificationPreference | 通知偏好（userId+type 联合 PK 或 Json 集合；enabled 集合至少一种）（§7.7 A5） |
| R1 | Address | 收货地址簿（id AD；userId；name/phone/region/detail；isDefault 唯一约束；createdAt/updatedAt）（§7.7 A1） |
| R1 | AgreementConsent | 协议同意留痕（userId+agreementType+version 联合唯一；consentedAt；注册同时记录用户协议与隐私政策）（§7.7 A3/A11） |
| R1 | AccountDeletionRequest | 注销申请（id；userId；status pending/cooling(7 天)/approved/cancelled；requestedAt/effectiveAt?；复核工单） |
| R2 | DemandMessage | 需求沟通留言（demandId；senderId;content；at；仅发布方与响应方可见）（E2） |
| R2 | ProjectTask | 项目协作任务（projectId；name/assignee/status/duedAt；参与双方可见）（E3） |
| R2 | ProjectFile | 项目协作文件（projectId；storeKey/name/size/uploader；对象存储 + 鉴权下载）（E3） |
| R2 | EventFeedback | 活动反馈（eventId+userId 唯一；rating 1~5；comment；结束后 + 参与过）（§7.7 A4） |
| R2 | EventTicket | 电子票（eventId+enrollmentId 唯一；ticketNo；redeemCode HMAC 确定性；redeemedAt? 签到即核销）（E1） |
| R2 | Favorite | 收藏（userId+targetType+targetId 唯一；targetType demand/article/event/enterprise/talent）（§7.1-22） |
| R2 | RestockSubscribe | 到货提醒订阅（goodsId+userId 唯一；notifiedAt? 补货触发）（B3） |
| R3 | Report | 举报（id RP；reporterId；targetType demand/article/enterprise/comment/user；targetId；reason/detail；status pending/resolved/rejected + 处置理由；admin 处置回写）（§7.1-21） |
| R3 | Appeal | 申诉（targetType demand/article；targetId；reason；status；一次性）（§7.1-21） |
| R3 | UserBlock | 屏蔽名单（userId+blockedUid 唯一；评论与内容列表过滤）（§7.1-21） |
| R3 | EnterpriseInvitation | 企业成员邀请（id EI；enterpriseId；inviterUid；inviteeUid；role 职位；status pending/accepted/rejected/expired；7 天有效期）（§7.1-17） |
| R3 | TransferRequest | 负责人转移请求（enterpriseId；fromUid/toUid；status pending/accepted/cancelled/expired；接受后变更 contactUserId）（§7.1-21） |
| R3 | Policy | 社区政策/服务内容（id PL；category；title/content Html sanitize；version/effectiveAt；publisher；attachments[]；featured 精选；status；admin A18 维护）（§7.1-12+Q3） |
| R4 | PointsTask | 积分任务（code PK；type daily/once/condition；title/description；points；enabled；每日重置）（E4） |
| R4 | UserTaskRecord | 任务领取记录（userId+taskCode+date 唯一；claimedAt；领取幂等/每日重置）（E4） |
| R4 | ServiceApplication | 社区服务申请（id SA；userId；serviceType（挂政策类别）；fields Json；status pending/accepted/processing/done/rejected + 回执/催办）（E6） |
| R4 | AnalyticsEvent | 埋点（eventType 12 项：login/register/demand_publish/demand_respond/event_enroll/checkin/mall_order/article_submit/space_reserve/favorite/report/search；userId?；at；payload Json?）（§7.1-22） |

### 8.2 既有模型字段扩展（15）

| 批次 | 模型 | 新增字段 |
|---|---|---|
| R1 | User | avatar?；phone 唯一约束 |
| R1 | PointsRecord | dedupeKey? 唯一，用于积分发放幂等 |
| R2 | CommunityEvent | venueLat/venueLng/checkinRadiusM/checkinOpenMin/checkinCloseMin（签到几何与时间窗）；cancelDeadlineHours（取消时限，默认 24）；rescheduledTo?（postponed 改期目标；状态机增 postponed） |
| R2 | EventEnrollment | waitlisted Bool + waitlistOrder Int?（候补与递补顺序）；checkinLat/checkinLng/checkinMethod（自助/补签） |
| R2 | Demand | demandType task/investment/cooperation；task 专属 deliverable?/budget?/deliverBy?（预期交付日期）；investment 专属 cooperationNeed?/returnOffer?；cooperation 专属 bottleneck?/partnershipMode?；三类型通用 contactName/contactPhone/contactEmail？；projectId?（立项回填）；deadline 停用保留展示 |
| R2 | DemandRespondent | **userId 关联（必加）**；status 扩展 pending/contacted/closed → +accepted/rejected；reviewAt?/rejectReason?/withdrawnAt? |
| R2 | Milestone | 交付状态扩展 todo → +submitted/returned（accept 沿用 done）；attachments[]（证据上传）；returnReason?；submitAt?/acceptAt?/returnedAt? |
| R2 | MallGoods | **category 语义改造（Q1 决）**：category → goods_category 字典分类（GC code）；新增 fulfillment physical/voucher/service 承载履约类型；旧 category 数据迁移到 fulfillment |
| R2 | RedemptionOrder | fulfillment 快照；voucherCode?/voucherExpiresAt?（券码 30 天）；trackingNo?（物流单号）；cancelledAt?；rating?/reviewComment?（每单一次评价）；recipientName/recipientPhone/address 已有（地址簿写入路径 A1） |
| R2 | Space | status 增 maintenance（维护中）；maxHours?/advanceDays?/openHours?（预约规则） |
| R2 | SpaceReservation | identityType/subjectName（主体快照）；asEnterpriseId?（代企业，校验 space_reserve） |
| R2 | Announcement | expireAt?/link?（有效期与跳转，D2） |
| R2 | Article | likeCount/commentCount（冗余列，事务更新，Q7 决） |
| R3 | Enterprise | logo?/website?/address?/services[]?/advantages[]?（精致名片字段，负责人可编辑） |
| R3 | UserIdentity | permissions[]（8 项枚举 publish_demand/respond_demand/space_reserve/article_submit/manage_members/invite_member/assign_permission/edit_card；负责人全部、成员由负责人分配） |

**卡片字段配置（Q8 决）**：个人名片（`User`/UserIdentity 派生字段）与社区企业名片（`Enterprise` 字段）均**免审核保存即公开**；admin 后台可**查看/编辑**个人与企业名片，并可配置「用户编辑名片时可填写的字段白名单」（`GET /api/app/card-schema/:type` 下发；管理面配置存储见 m2-r-plan §3.1 A19）。

## 修订记录

| 日期 | 摘要 |
|---|---|
| 2026-09-10 | 初版：按 M1 落地的 35 模型分域沉淀字段清单（M1-E 收尾任务） |
| 2026-09-12 | M1.5 同步：模型 35 → 43（新增 AdminRole/AdminPermission/AdminUserRole/AdminRolePermission/LoginLog/SchedulerLog/MallAsset/ArchiveSetting）；Enterprise 删 stage、增 contactUserId/contactTitle 与软删列；ExternalEnterpriseProfile 增 status/size/foundedAt 与软删列；Application 扩为 settle/individual/cooperation/identity 并增归档列；Demand 增 creatorName/creatorId、Project/CommunityEvent/Article/Announcement/Lease/SpaceReservation/MallGoods/RedemptionOrder 增 deletedAt/archivableAt；MallGoods 增发货方式/自提地址/运费/可见与可下单范围、status 增 restock；SystemConfig 删 dailyLoginPoints、增 uploadMaxSizeMb；MallAsset 增 sourceType/sourceId；DictEntry 增 goods_category；Article 重构 channel（official A / submitted SU）与状态机；PointsRule 9 项、ExperienceRule 6 项 |
| 2026-09-16 | M2-R 规划扩展：新增 §8 新增模型（22，R1~R4 分组）与既有模型字段扩展（13）；R0 决策定稿——Q1 MallGoods category 改字典分类 + 新增 fulfillment；Q3 新建 Policy；Q4 电子票 HMAC + 签到即核销；Q7 点赞/评论冗余计数列；Q8 个人/企业名片均免审核、后台可查看编辑并可配置名片可编辑字段（card-schema 下发） |
