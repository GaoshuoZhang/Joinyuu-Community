# 聚屿社区 · 实体字段清单（M1 数据模型，35 模型）

> 事实来源：`apps/api/prisma/schema.prisma`。本文档为分域人读版沉淀（wiki-backend §5 建模规则的展开），
> 模型/字段变更时先改 schema 与 wiki-backend §7 契约，再同步本文档。
> 通用约定：主键为前缀字符串 ID（IdSequence 原子发号）；时间统一 String（`YYYY-MM-DD HH:mm` / `YYYY-MM-DD` / `YYYY-MM`）；枚举用 String + 应用层校验；展示快照保留为列不外键化。

## 1. 认证与基础设施（2）

**AdminUser** — 管理端账号（种子 admin/admin123）
- id Int 自增 ｜ username VarChar(64) 唯一 ｜ passwordHash（bcrypt）｜ name VarChar(64)（审计 operator 来源）｜ createdAt/updatedAt DateTime

**IdSequence** — 前缀 ID 发号器
- entityType VarChar(32) PK（'U'/'E'/'D'/'AL'…）｜ nextNumber Int（UPDATE..RETURNING 原子自增）

## 2. 社区成员域（7）

**User** — 用户（uid 主键；展示名用 nickname）
- uid PK ｜ nickname ｜ phone（索引）｜ email ｜ gender ｜ status（active/frozen，索引）｜ realName?/citizenId?（实名）｜ wechatOpenid?/wechatUnionid?/wechatVerified（M3 预留）｜ frozenUntil?/frozenReason? ｜ points Int（积分余额）｜ registeredAt/lastActiveAt ｜ bio Text ｜ activities Json（活跃记录）｜ 关联 identities/pointsRecords/enrollments/reservations/orders/articles

**UserIdentity** — 一人多身份（级联删除）
- id Int PK ｜ userId→User ｜ type（individual/community_individual/community_enterprise/external_enterprise）｜ enterpriseId?（社区企业关联）｜ enterpriseName?（外部企业快照）｜ role? ｜ title ｜ level?/experience?（仅社区个体/社区企业持有）｜ 唯一 (userId,type,enterpriseId)

**Enterprise** — 社区企业（入驻企业）
- id PK（E）｜ name ｜ industry（索引）｜ stage ｜ size ｜ foundedAt（YYYY-MM）｜ settledAt? ｜ leaseType ｜ status（pending/active…，索引）｜ showcaseStatus（none/pending/published/rejected）｜ showcaseComment? ｜ experience Int（企业经验余额）｜ contactName/contactPhone/contactEmail? ｜ description Text ｜ tags String[]

**ExternalEnterpriseProfile** — 外部企业档案（聚合视图=档案+external_enterprise 身份派生成员）
- id PK（XE）｜ name（索引）｜ industry ｜ description Text ｜ cooperationCount ｜ firstCooperationAt

**Application** — 入驻/身份绑定申请（仅 settle/identity 两类）
- id PK（AP）｜ type（settle/identity）｜ applicantName/applicantPhone ｜ targetName（企业名或「企业名 · 头衔」）｜ submittedAt（索引 status+type）｜ status（pending/approved/rejected）｜ summary ｜ details Json（表单明细）｜ records Json（审批时间线）

**ExperienceRecord** — 经验流水
- id PK（EX）｜ targetType（enterprise/individual）｜ targetId（联合索引）｜ delta ｜ balance（变动后余额）｜ reason ｜ at ｜ operator ｜ source（rule/manual）

**PointsRecord** — 积分流水
- id PK（PT）｜ userId→User（索引）｜ delta ｜ balance ｜ reason ｜ at ｜ operator ｜ source（rule/manual/redemption，索引）

## 3. 业务运营域（7）

**Demand** — 需求
- id PK（D）｜ title ｜ category（字典值）｜ publisherId/publisherName/publisherIdentity Json?（发布方快照，§8.7）｜ contactName?/contactPhone?/contactEmail? ｜ budget ｜ period ｜ deadline ｜ scheduledAt?（定时发布）｜ visibilityIdentities/visibilityLevels/enrollmentIdentities/enrollmentLevels String[]（范围）｜ status（pending/pending_release/scheduled/published/rejected/closed/projected，索引）｜ createdAt/publishedAt? ｜ description Text ｜ tags ｜ rejectedReason? ｜ matchedRespondent? ｜ projectId?（立项关联）｜ respondPoints?（自定义响应积分）｜ 关联 respondents

**DemandRespondent** — 需求响应（级联删除）
- id Int PK ｜ demandId→Demand ｜ name ｜ enterprise ｜ phone?/email? ｜ quote? ｜ message Text ｜ at ｜ status（pending/accepted/rejected）

**Project** — 项目
- id PK（P）｜ name ｜ code（唯一，PRJ-xxxx）｜ status（running/paused/closed/finished，索引）｜ progress ｜ startDate/endDate ｜ initiatedAt ｜ description Text ｜ memberCount ｜ sourceDemandId? ｜ expReward?（结项总经验）｜ closeReason? ｜ 关联 undertakers/milestones

**ProjectUndertaker** — 承接方（占比，级联删除）
- id Int PK ｜ projectId→Project ｜ type（enterprise/individual/custom）｜ refId ｜ name ｜ share Int（合计须 100）｜ contactName?/phone?

**Milestone** — 里程碑（级联删除）
- id Int PK ｜ projectId→Project ｜ name ｜ status（todo/active/done）｜ date ｜ owners String[]（负责承接方）

**CommunityEvent** — 活动
- id PK（EV）｜ createdAt ｜ title ｜ type（字典值）｜ startTime/endTime（索引 startTime）｜ location ｜ capacity ｜ speaker ｜ host ｜ status（pending_release/scheduled/published/ended/cancelled，索引）｜ enrollmentOpen ｜ visibilityIdentities/visibilityLevels/enrollmentIdentities/enrollmentLevels String[] ｜ requireReview ｜ enrollmentDeadline? ｜ scheduledAt? ｜ enrollPoints?/checkinPoints?（自定义积分）｜ description Text ｜ tags ｜ 关联 enrollments

**EventEnrollment** — 活动报名（唯一 eventId+userId）
- id Int PK ｜ eventId→Event ｜ userId→User（索引）｜ name/enterprise/phone（报名快照）｜ appliedAt ｜ status（pending/approved/rejected/cancelled）｜ checkedIn ｜ checkInAt?

## 4. 积分商城与规则（5）

**MallGoods** — 商品
- id PK（G）｜ name ｜ category（physical/virtual/voucher）｜ points ｜ stock ｜ status（on/off，索引）｜ description Text ｜ redeemedCount ｜ createdAt

**RedemptionOrder** — 兑换订单
- id PK（RO）｜ userId→User（索引）｜ userName ｜ goodsId/goodsName ｜ points ｜ status（pending_shipment/shipped/finished/cancelled，索引）｜ createdAt/shippedAt?/finishedAt? ｜ recipientName?/recipientPhone?/address?（收件信息）｜ note? ｜ cancelReason?（取消退款 source=redemption）

**PointsRule** — 积分规则（8 条固定项，code 为 PK）
- code PK ｜ name ｜ scene ｜ points ｜ status（enabled/disabled）｜ description? ｜ updatedAt

**ExperienceRule** — 经验值规则（5 条固定项）
- code PK ｜ name ｜ scene ｜ exp ｜ status ｜ description? ｜ updatedAt

**LevelTier** — 等级梯度
- level Int PK（1-10）｜ label ｜ threshold（逐级递增）

## 5. 空间管理（6）

**WorkstationArea** — 工位区域
- id PK（WA）｜ name（唯一）｜ type（open/office/semi）｜ description ｜ createdAt ｜ 关联 workstations

**Workstation** — 工位
- id PK（WS）｜ seatNo（唯一）｜ areaId→WorkstationArea（外键化，改名无需级联）｜ type ｜ capacity ｜ status（idle/assigned/maintenance；assigned 仅经租约进入/退出）｜ enterpriseId?/enterpriseName?/leaseId?（当前占用冗余）｜ defaultMonthlyRent? ｜ areaSqm? ｜ note?

**Lease** — 租约
- id PK（LS）｜ renterId ｜ renterName ｜ renterType（enterprise/individual/custom）｜ startDate/endDate（长期租约为空串）｜ longTerm ｜ status（active/terminated；expiring/expired 读取派生，索引 status）｜ monthlyRent ｜ rentPeriod（day/week/month/year）｜ contactName/contactPhone ｜ terminatedAt? ｜ 关联 workstations

**LeaseWorkstation** — 租约-工位关联（保留终止后历史归属；联合主键）
- leaseId+workstationId PK（双向级联删除）

**Space** — 公共空间
- id PK（S）｜ name ｜ type（meeting/roadshow/meeting_room/multi/study）｜ capacity ｜ location ｜ openTime/closeTime ｜ allDay ｜ needReservation ｜ needApproval ｜ equipment String[] ｜ status（available/maintenance/disabled）｜ description Text

**SpaceReservation** — 空间预约
- id PK（SR）｜ userId→User（索引）｜ userName/phone ｜ spaceId/spaceName ｜ date（联合索引 spaceId+date+status）｜ startTime/endTime ｜ purpose ｜ attendees ｜ status（pending/approved/rejected/cancelled）｜ submittedAt ｜ records Json（审批时间线）｜ rejectReason?

## 6. 内容管理（4）

**Article** — 资讯文章
- id PK（A）｜ title ｜ columnId/columnName（栏目冗余，改名联动刷新）｜ authorId→User/authorName/authorIdentity Json?（作者身份快照）｜ status（draft/pending/published/withdrawn/rejected，索引）｜ publishedAt? ｜ views ｜ summary ｜ tags ｜ createdAt ｜ rejectedReason?（索引 status+columnId）

**ArticleColumn** — 栏目
- id PK（CL）｜ name ｜ description ｜ sort ｜ status（enabled/disabled）｜ createdAt

**ShowcaseRequest** — 展示页发布申请
- id PK（SC）｜ targetType（enterprise/individual）｜ targetId? ｜ targetName ｜ contentSummary ｜ submitterName/submitterPhone ｜ submittedAt ｜ status（pending/approved/rejected/cancelled）｜ records Json ｜ rejectReason?（通过/驳回联动 Enterprise.showcaseStatus）

**Announcement** — 公告
- id PK（AN）｜ title ｜ content Text ｜ pinned ｜ status（published/withdrawn）｜ publishedAt/createdAt/updatedAt?

## 7. 系统管理域（4）

**AdminNotification** — 管理端通知（管理员维度，业务事件驱动写入）
- id PK（N）｜ type（approval/demand_review/reservation/showcase/article/lease/schedule）｜ title ｜ content ｜ at（索引 read）｜ read ｜ link?（跳转路由）

**AuditLog** — 审计日志
- id PK（AL）｜ operator（JWT name 或「系统」）｜ module（10 个中文模块值，索引）｜ action ｜ target（编号 · 名称）｜ detail? ｜ at（索引）｜ ip? ｜ before/after Json?（M1-E 补全：变更前后快照）

**SystemConfig** — 系统配置（单例 id=1）
- id Int PK=1 ｜ siteName ｜ siteSlogan ｜ registrationOpen/mallOpen/demandOpen/reservationOpen（功能开关）｜ dailyLoginPoints（联动 daily_login 规则）｜ leaseExpireRemindDays（租约临期窗口 1-90）｜ updatedAt/updatedBy

**DictEntry** — 数据字典
- type+code 联合 PK（demand_category/industry/event_type × DC/IN/ET）｜ label（全类型唯一）｜ sort ｜ status（enabled/disabled）｜ 索引 (type,sort)

## 修订记录

| 日期 | 摘要 |
|---|---|
| 2026-09-10 | 初版：按 M1 落地的 35 模型分域沉淀字段清单（M1-E 收尾任务） |
