# 聚屿社区 · 实体字段清单

> 事实来源：`apps/api/prisma/schema.prisma`（唯一事实），本文档为人读索引。模型变更时改 schema 并向 wiki-backend §7 与本文档同步。
> 通用约定：主键为前缀字符串 ID（IdSequence 原子发号）；时间绝大多数为 String（AdminUser 的 createdAt/updatedAt 为 DateTime）；枚举用 String + 应用层校验；展示快照冗余为列不外键化。
> `schema.prisma` 为当前事实来源。项目协作任务、共享文件与讨论功能已移除；项目及里程碑履约保留。

## 1. 认证、治理与基础设施（9）

- **AdminUser** — 管理端账号（id 自增；username 唯一；passwordHash bcrypt；name 展示名；status active/disabled；lastLoginAt?；createdAt/updatedAt DateTime；种子 admin/admin123）
- **AdminRole** — RBAC 角色（id R1+；code 唯一；name/description/sort/createdAt；内置 super/operator/auditor/space-ops）
- **AdminPermission** — 权限点目录（code PK：菜单路径或 perm:xxx 按钮码；name/module；authType menu|button；sort；当前共 56 码）
- **AdminUserRole** — 管理员-角色关联（adminUserId+roleId 联合唯一）
- **AdminRolePermission** — 角色-权限点关联（roleId+permissionCode 联合唯一）
- **LoginLog** — 登录日志（id LL；loginAt 秒级；username/ip/device；status success/fail/locked；failReason?；索引 loginAt/status）
- **SchedulerLog** — 定时任务执行日志（id SL；jobName/startedAt/finishedAt/durationMs；status ok/error；detail?；rowsAffected）
- **MallAsset** — 素材库（id AST；fileName/mime/size/url/storeKey；bizType? 业务分类；sourceType? article=资讯发布/submission=投稿内容；sourceId? 来源编号如 A1010/SU1006；createdBy/createdAt）
- **IdSequence** — 前缀 ID 发号器（entityType PK；nextNumber 原子自增）

## 2. 社区成员域（7）

- **User** — 用户（uid PK U；**username 登录标识/全站唯一**；nickname 展示昵称/全站唯一；**phone?/email? 可空且非空时全站唯一**；**phoneVerifiedAt?/emailVerifiedAt? 可信通知渠道标记**（非空=该渠道已验证，可用于找回密码与接收通知）；gender；avatar?；status active/frozen；realName?/citizenId?/verifiedAt?；微信字段 M3 预留；frozenUntil?/frozenReason?；points 积分余额；registeredAt/lastActiveAt；bio；activities Json；**activationDismissed Bool 默认 false（永久隐藏新手任务，按账号持久化，跨浏览器一致）**；**usernameChangedAt?（最近一次用户名修改时间，每 90 天仅可修改一次）**）
- **UserIdentity** — 一人多身份（userId 级联；type individual/community_individual/community_enterprise/external_enterprise；enterpriseId?/enterpriseName?/role?/title；level?/experience? 仅社区两类持有；唯一 userId+type+enterpriseId）
- **Enterprise** — 社区企业（id E；name/industry/size/foundedAt/settledAt?/leaseType；status pending 默认/active/exited/disabled；experience 企业经验；contactUserId? 关联个人用户 + contactTitle 职位 + contactName/contactPhone/contactEmail?；description/tags；deletedAt?/deletedBy?；**stage 已删**）
- **ExternalEnterpriseProfile** — 合作企业档案（id XE；name/industry；status active/disabled；size/foundedAt；description；registeredAt（登记日期=填表通过审核当天）；deletedAt?/deletedBy?；聚合视图 = 档案 + external_enterprise 身份派生成员，不建独立实体表）
- **Application** — 申请审核（id AP；type settle 企业入驻/individual 个体入驻/cooperation 企业合作/exit 企业退驻；applicantName/applicantPhone/**userId? 申请人 uid（「我的申请」按 uid 归属，历史数据回退按手机号匹配）**；targetName；submittedAt；status pending/approved/rejected；summary；details Json 表单明细；records Json 审核时间线；deletedAt?/deletedBy?/archivableAt?）
- **ExperienceRecord** — 经验流水（id EX；targetType enterprise/individual；targetId；delta/balance/reason/at/operator；source rule/manual）
- **PointsRecord** — 积分流水（id PT；userId；delta/balance/reason/at/operator；source rule/manual/redemption/space；dedupeKey? 唯一，用于积分发放幂等）

## 3. 业务运营域（7）

- **Demand** — 需求（id D；状态机 pending→pending_release→published|scheduled→selected→projected/closed/rejected；publisherId/publisherName/publisherIdentity Json?（提交人主体/名称/身份快照）；contactName?/contactPhone?/contactEmail?；**contactPublic Bool 默认 false（公开联系人开关：开启后客户端含未登录游客可见联系人信息，关闭时客户端一律不可见、后台始终可见）**；budget/period/deadline；scheduledAt?/publishedAt?；可见/可报名范围四数组；description/tags；rejectedReason?/matchedRespondent?/projectId?/respondPoints?；deletedAt?/deletedBy?/archivableAt?）
- **DemandRespondent** — 需求响应（demandId 级联；name/enterprise/phone?/email?/quote?/message/at；status pending/accepted/rejected/closed（contacted 为历史值））
- **Project** — 项目（id P；code JY-YYYY-NN 唯一；status running/paused/closed/finished；progress；startDate/endDate/initiatedAt；description/memberCount；sourceDemandId?/expReward?/closeReason?；**demanderId?/demanderName?/demanderIdentity Json?（需求方主体/名称/身份快照，需求立项照搬需求、自建由表单录入）**；**creatorName?/creatorId?（创建人）**；**contactName?/contactPhone?/contactEmail?（联系方式）**；**contractPrice?（合同价格）**；deletedAt?/deletedBy?/archivableAt?）
- **ProjectUndertaker** — 承接方（type enterprise/individual/custom；refId/name；share 合计须 100；contactName?/phone?）
- **Milestone** — 里程碑（status todo/active/done；date；owners[] 负责承接方）
- **CommunityEvent** — 活动（id EV；状态机 pending_release→published|scheduled→ended/cancelled；startTime/endTime/location/capacity/speaker/host；enrollmentOpen/requireReview/enrollmentDeadline?/scheduledAt?；报名范围四数组；enrollPoints?/checkinPoints?；description/tags；deletedAt?/deletedBy?/archivableAt?）
- **EventEnrollment** — 活动报名（唯一 eventId+userId；报名快照 name/enterprise/phone；appliedAt；status pending/approved/rejected；checkedIn/checkInAt?）

## 4. 积分商城与规则（5）

- **MallGoods** — 商品（id G；category GC001 实物商品 / GC003 权益券；points/stock；status on/off/restock（库存为 0）；description/redeemedCount/validDays?（券码有效期天，空按 30 天兜底）/createdAt；visibilityIdentities/visibilityLevels 可见范围、orderIdentities/orderLevels 可下单范围；deletedAt?/deletedBy?/archivableAt?）
- **RedemptionOrder** — 兑换订单（id RO；统一券码兑换，状态机 pending_use→finished（后台核销）/cancelled（退款，含过期自动退款）；userId/userName + goodsId/goodsName/points；createdAt/finishedAt?/note?；voucherCode/voucherExpiresAt/usedAt?；cancelReason?/cancelledAt?；deletedAt?/deletedBy?/archivableAt?）
- **PointsRule** — 积分规则（code PK 固定 9 项：activity_checkin/activity_enroll_approved/article_accepted/demand_published/demand_responded/demand_undertaken/project_milestone/identity_first_bind/daily_login（默认停用）；name/scene/description 写死；points 可编辑；status）
- **ExperienceRule** — 经验值规则（code PK 固定 6 项：activity_checkin/activity_enroll_approved/article_accepted/project_undertaken/project_completed/identity_first_bind；exp/status 可编辑）
- **LevelTier** — 等级梯度（identityType+level 联合 PK；社区个体与社区企业分别维护 1-10 级标签和门槛；pointsDiscount 积分消费折扣：1 = 1 折 … 10 = 原价，支持一位小数（默认 10））
- **PublishingLimitRule** — 发布限制（identityType+level+action 联合 PK；四类 action：需求发布、文章投稿、活动报名、空间预约；`-1` 不限、`0` 禁止）
- **PublishingLimitUsage** — 每日发布限制用量（subjectType+subjectId+action+date 联合 PK；社区企业按企业主体共享）

## 5. 空间管理（6）

- **WorkstationArea** — 工位区域（id WA；name 唯一；type open/office/semi；description/createdAt）
- **Workstation** — 工位（id WS；seatNo 唯一；areaId 外键；type/capacity；status idle/assigned/maintenance；占用冗余 enterpriseId?/enterpriseName?/leaseId?（assigned 仅经租约）；defaultMonthlyRent?/areaSqm?/note?）
- **Lease** — 租约（id LS；renterId/renterName/renterType enterprise/individual/custom；startDate/endDate（长期为空串）/longTerm；status active/terminated，expiring/expired 读取派生；monthlyRent/rentPeriod day|week|month|year；contactName/contactPhone；terminatedAt?；deletedAt?/deletedBy?/archivableAt?）
- **LeaseWorkstation** — 租约-工位关联（leaseId+workstationId 联合 PK；保留终止后历史归属）
- **Space** — 公共空间（id S；name/type meeting/roadshow/meeting_room/multi/study；capacity/location/openTime/closeTime/allDay；needReservation/needApproval；feePerHour（预约费用：积分/小时，0=免费）；equipment[]；status；description；deletedAt?/deletedBy?）
- **SpaceReservation** — 空间预约（id SR；userId/userName/phone；spaceId/spaceName；date/startTime/endTime/purpose/attendees；feePoints（本单实际消耗积分，驳回/取消按此退回）；status pending→approved/rejected/cancelled；submittedAt；records Json 审核时间线；rejectReason?；deletedAt?/deletedBy?/archivableAt?）

## 6. 内容管理（6）

- **Article** — 文章（id 官方 A / 投稿 SU；channel official|submitted；title/columnId/columnName；authorId?（官方可空、投稿为 UID、合作企业为 XE*）/authorName/authorIdentity Json?；status pending 待审核→pending_release 待发布→scheduled 定时发布中→published，分支 rejected 已驳回；**后台/举报下架 → closed 已关闭（可归档、可经原举报恢复）；成员主动撤回待审核投稿 → withdrawn（可重提）**；content 富文本 HTML（写入 sanitize）；commentsEnabled Bool 默认 true（关闭后客户端隐藏评论区且读写 409）；scheduledAt?/publishedAt?；views/summary/tags/createdAt；rejectedReason?；archivableAt?/deletedAt?/deletedBy?）
- **ArticleTakedown** — 文章下架记录（自增 id；articleId 外键级联；source manual 后台主动 / governance 举报处置；reportId?；reason?；takenDownAt/takenDownBy；restoredAt?/restoredBy?；详情抽屉按下架时间倒序展示）
- **HomeBanner** — 首页轮播图（id BN；title/subtitle；imageUrl?；link? 站内路径；sort 升序；enabled 单条开关；受 `SystemConfig.homeCarouselOpen` 总开关控制）
- **ArticleColumn** — 栏目（id CL；name/description/sort；submissionOpen 开放投稿；system 系统保留「未指定」不可编辑；status）
- **Announcement** — 公告（id AN；title/content；pinned；status published/withdrawn；publishedAt/createdAt/updatedAt?；archivableAt?/deletedAt?/deletedBy?）

## 7. 系统管理域（5）

- **AdminNotification** — 管理端通知（id N；type approval/demand_review/reservation/showcase/article/lease/schedule 共 7 类；title/content/at/read/link?）
- **AuditLog** — 审计日志（id AL；operator/module/action/target/detail?/at/ip?；before/after Json? 变更前后快照）
- **SystemConfig** — 系统配置（单例 id=1；siteName/siteSlogan；registrationOpen/mallOpen/demandOpen/reservationOpen；realnameRequired；homeCarouselOpen 首页轮播总开关；leaseExpireRemindDays；uploadMaxSizeMb 上传上限 MB 1-100 默认 10（素材库/富文本共用）；minioEnabled/minioEndpoint/minioPort/minioUseSsl/minioAccessKey/minioSecretKey/minioBucket；**P1 实名核验** realnameVerifyEnabled/realnameVerifyProvider(''|aliyun|tencent)/realnameVerifyConfig/realnameVerifyCredentialEnv/realnameVerifyCredentialMode(inline|env)/realnameVerifyTestOk/realnameVerifyTestedAt；updatedAt/updatedBy；**dailyLoginPoints 已删**）
  - 密钥安全（P0）：`minioSecretKey` 只写不读——管理端 GET 只回 `minioSecretKeyConfigured`/`minioSecretKeyMasked`/`minioCredentialSource`，审计快照不含密钥原文；凭据可经 `MINIO_SECRET_KEY`/`MINIO_ACCESS_KEY` 环境变量优先注入。
  - 实名核验（P1）：`realnameVerifyCredentialMode=inline` 时凭据为**后台直接填写的密钥**（只写、GET 只回掩码 `realnameVerifyCredentialMasked`、审计快照凭据字段恒为空）；`env` 时仅登记环境变量名。启用 + `realnameVerifyTestOk=true` 时客户端 `realnameMode=verified`（「实名认证」），否则 `registration`（「身份信息登记」）；任一核验配置变更会把 `realnameVerifyTestOk` 重置为 false 并要求重新测试联通。
- **DictEntry** — 数据字典（type+code 联合 PK；type demand_category/industry/event_type/goods_category；label 全类型唯一；sort/status；**商品类别另有类别级 visibilityIdentities/visibilityLevels/orderIdentities/orderLevels**，空数组 = 不限，其余类型恒为空）
- **ArchiveSetting** — 归档设置（domain PK；autoArchive/archiveDelayDays 自动归档延时；autoPurge/purgeDelayDays 自动删除延时；archiveStatuses Json? 按状态开关）

## 7.1 P0 消息中心

- **MessageChannel** — 消息渠道（id MC；kind sms/email/inapp；provider aliyun_sms/tencent_sms/smtp/inapp/dry_run；name/enabled（kind+provider 唯一）；config Json? 非机密参数（signName/host/port/secure/fromAddress 发件人邮箱/fromName 显示名/from 旧版兼容/templateMapping 等）；**credentialMode inline|env**（默认 env；inline=后台直接填写密钥，只写/GET 只回掩码/审计不记录；env=登记变量名）；credentialEnv Json?；dailyLimit 0=不限；remark?/createdAt/updatedAt/updatedBy）
- **MessageTemplate** — 消息模板（id MT；code 唯一；name/kind/category security|marketing；variables Json? 变量白名单；status draft|published（**保存即发布**：创建即 v1 published，编辑「保存」原地更新当前发布版本并以 published 生效；下架回 draft）；currentVersion；updatedAt/updatedBy）
- **MessageTemplateVersion** — 模板版本（id MV；templateId→MessageTemplate 级联；version（templateId+version 唯一）；subject?/body；status draft|pending|approved|rejected|published|archived（发布模式下新建即 published，审批态枚举保留兼容）；reviewedBy?/reviewedAt?/reviewNote?/createdBy/createdAt）
- **OutboxMessage** — 发送队列（id OB；idempotencyKey 唯一；channelKind/templateCode/recipient/userId?；payload Json? 模板变量；status pending|sending|sent|failed|dead|skipped；priority/attempts/maxAttempts/nextAttemptAt?/lastError?/providerMessageId?/security；createdAt/updatedAt/sentAt?）
- **MessageDeliveryLog** — 投递日志（id ML；outboxId/channelKind/provider/recipient/attempt/status sent|failed|skipped/providerMessageId?/error?/costMs/at）
- **ContactConsent** — 渠道合规同意/营销退订（id 自增；userId+channelKind+purpose 唯一；consented；at）
- **UserNotificationPreference**（扩展）— 新增 quietHoursStart?/quietHoursEnd?（HH:mm，两者都填才生效）与 channelPrefs Json?（按渠道的营销接收偏好）；security 类通知不受两者约束

## 8. 新增模型与字段扩展

> M2-R 迁移已经完成。字段口径以 `schema.prisma` 为事实源，并与客户端类型及 `api-app-design.md` 保持同步。

### 8.1 新增模型（26）

| 批次 | 模型 | 说明（前缀/关键字段） |
|---|---|---|
| R1 | UserNotification | 站内信（id UN；userId；type audit_result/enroll_result/order/points/system/invite/transfer/report/article/demand/project/mall/service + link?；title/content/at；read Bool）。单一列表、无归档、无分类偏好（`archived` 与 `UserNotificationPreference` 已移除）（§7.1-1） |
| R1 | AgreementConsent | 协议同意留痕（userId+agreementType+version 联合唯一；consentedAt；注册同时记录用户协议与隐私政策）（§7.7 A3/A11） |
| R1 | AccountDeletionRequest | 注销申请（id；userId；status pending/cooling(7 天)/approved/cancelled；requestedAt/effectiveAt?；复核工单） |
| R2 | DemandMessage | 需求沟通留言（demandId；senderId;content；at；仅发布方与响应方可见）（E2） |
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
| R2 | ArticleComment | 文章评论（articleId/userId/content/at），支持删除和举报 |
| R2 | ApplicationFormConfig | 申请表单配置（type/title/subtitle/submitLabel/tips/fields） |
| R3 | IndividualCard | 个人名片（userId 唯一、data Json、published、updatedAt） |
| R4 | AnalyticsEvent | 埋点（eventType 12 项：login/register/demand_publish/demand_respond/event_enroll/checkin/mall_order/article_submit/space_reserve/favorite/report/search；userId?；at；payload Json?）（§7.1-22） |
| R4 | UserMessage | 用户留言（id UM；userId；title/content 纯文本 sanitize；status pending 待回复/replied 已回复；createdAt；replyContent?/repliedAt?/repliedBy? 回复人姓名；archivableAt? 回复时写入/deletedAt?/deletedBy? 归档字段，可在「归档管理 > 用户留言」恢复；后台「用户留言」页回复并推送站内信，客户端在「我的 > 我的留言」查看）（R4） |
| 扩展 | HomeBanner / ArticleTakedown | 首页轮播图与文章下架记录（见 §6；ServiceApplication 社区服务申请已下线，社区政策与通用申请审核保留） |
| 规则重构 | PublishingLimitRule / PublishingLimitUsage | 按身份和动态等级设置四类每日发布限制；业务写入同事务占用，失败回滚、取消不返还 |

### 8.2 既有模型字段扩展（17）

| 批次 | 模型 | 新增字段 |
|---|---|---|
| R1 | User | avatar?；phone 唯一约束；activationDismissed Bool 默认 false（新手任务永久隐藏，按账号持久化）；usernameChangedAt?（用户名每 90 天限改一次） |
| R1 | PointsRecord | dedupeKey? 唯一，用于积分发放幂等 |
| R2 | CommunityEvent | venueLat/venueLng/checkinRadiusM/checkinOpenMin/checkinCloseMin（签到几何与时间窗）；cancelDeadlineHours（取消时限，默认 24）；rescheduledTo?（postponed 改期目标；状态机增 postponed） |
| R2 | EventEnrollment | waitlisted Bool + waitlistOrder Int?（候补与递补顺序）；checkinLat/checkinLng/checkinMethod（自助/补签） |
| R2 | Demand | demandType task/investment/cooperation；task 专属 deliverable?/budget?/deliverBy?（预期交付日期）；investment 专属 cooperationNeed?/returnOffer?；cooperation 专属 bottleneck?/partnershipMode?；三类型通用 contactName/contactPhone/contactEmail？；projectId?（立项回填）；deadline 停用保留展示 |
| R2 | DemandRespondent | **userId 关联（必加）**；status 扩展 pending/contacted/closed → +accepted/rejected；reviewAt?/rejectReason?/withdrawnAt? |
| R2 | Milestone | 交付状态扩展 todo → +submitted/returned（accept 沿用 done）；attachments[]（证据上传）；returnReason?；submitAt?/acceptAt?/returnedAt? |
| R2 | MallGoods | **category 语义改造（Q1 决）**：category → goods_category 字典分类（GC code）。**统一券码兑换改造**：移除 fulfillment/shippingMethods/pickupAddress/shippingFee，validDays 承载券码有效期（空按 30 天兜底） |
| R2 | RedemptionOrder | **统一券码兑换改造**：状态收敛 pending_use/finished/cancelled 三态；voucherCode/voucherExpiresAt 非空（下单即签发，过期自动退款）；usedAt?（后台核销时间）；cancelledAt?；rating?/reviewComment?（每单一次评价）；移除 fulfillment/shippingMethod/pickupAddress/shippedAt/recipientName/recipientPhone/address/addressId/trackingNo |
| R2 | Space | status 增 maintenance（维护中）；maxHours?/advanceDays?/openHours?（预约规则） |
| R2 | SpaceReservation | identityType/subjectName（主体快照）；asEnterpriseId?（代企业，校验 space_reserve） |
| R2 | Announcement | expireAt?/link?（有效期与跳转，D2） |
| R2 | Article | likeCount/commentCount（冗余列，事务更新，Q7 决） |
| R3 | Enterprise | logo?/website?/address?/services[]?/advantages[]?（精致名片字段，负责人可编辑） |
| R3 | UserIdentity | permissions[]（8 项枚举 publish_demand/respond_demand/space_reserve/article_submit/manage_members/invite_member/assign_permission/edit_card；负责人全部、成员由负责人分配） |
| 扩展 | Project | demanderId?/demanderName?/demanderIdentity Json?（需求方主体/名称/身份快照；需求立项照搬需求、自建由表单录入）；creatorName?/creatorId?（创建人）；contactName?/contactPhone?/contactEmail?（联系方式）；contractPrice?（合同价格） |
| 扩展 | IndividualCard | `data.visibility` 增 `isPublic`（公开名片开关；false 时退出社区人才库、公开名片页 404；缺省视为公开） |
| 扩展 | Demand | contactPublic Bool 默认 false（公开联系人开关：开启后客户端含未登录游客可见 contactName/contactPhone/contactEmail，关闭时客户端一律不可见、后台始终可见）；creatorName/creatorId 已删（提交人取 publisherName/publisherId） |
| 扩展 | Space | feePerHour Int 默认 0（预约费用：积分/小时，0=免费；后台空间表单维护，客户端空间列表与预约页展示） |
| 扩展 | SpaceReservation | feePoints Int 默认 0（该单实际消耗积分；审核驳回与用户/后台取消均全额退回，写 source=space 流水） |
| 扩展 | LevelTier | pointsDiscount Float 默认 10（积分消费折扣：1 = 1 折 … 10 = 原价，支持一位小数如 8.5 = 85 折；商城兑换与空间预约按等级折扣扣分，折扣口径见 wiki-backend §8.8） |

**卡片字段配置**：个人名片（`User`/UserIdentity 派生字段）与社区企业名片（`Enterprise` 字段）均**免审核保存即公开**；admin 后台可**查看/编辑**个人与企业名片，并可配置用户可编辑字段白名单，由 `GET /api/app/card-schema/:type` 下发。个人名片 `visibility.isPublic=false` 时从人才库隐藏（§8.2）。
