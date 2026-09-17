# 三端接口对齐审计（2026-09-17）

> **审计口径**：后端事实源 = `apps/api/src/**/*.controller.ts` 的路由装饰器（共 368 个）；
> 后台事实源 = `apps/admin/src/api/*.ts`（34 个文件）中的 HTTP 调用点；
> 移动端事实源 = `apps/client-mobile/src/api/*.ts`（21 个域文件）中的 HTTP 调用点。
> 归一规则：`:id` 与 `${id}` 视为同一占位符；`${qs}`、`?${toQuery(x)}`、`${x ? ... : ''}` 等查询串整段忽略；
> 绝对路径调用（`httpDownload('/api/app/...')`）不重复加前缀。
> 用途列取自 `wiki-backend.md` §7 与 `api-app-design.md` §5~§8.1；标注“文档未收录”者为新增路由，用途以服务实现为准。

## 1. 总览

- 后端路由 365 个：`/api/admin/**` **225**、`/api/app/**` **138**、公开 2（`/api/health`、`/api/public/files/:key`）。
  （与 AGENTS 的 244/122 口径不同：这里按**路径前缀**统计，7 条 `/api/admin/cards/**` 挂在 mobile enterprises controller 里，会被模块口径计成 app。）
- 后台 HTTP 调用 223 处：命中 221，未命中 2（均为动态首段误报），覆盖 220/225 条后端口路由。
- 移动端 HTTP 调用 136 处：命中 136，未命中 0（嵌套模板/绝对下载地址误报），覆盖 134/138 条 app 路由。
- 审计结论：**两端不存在“调用不存在的接口”**（无 404 风险）；后端有 9 条路由未被“字面调用”脚本命中，其中 4 条为统计误报、2 条为间接使用、3 条为有意保留的运维/契约端点（§4），**无重复注册**。

---

## 2. 后台（/api/admin）接口明细与调用对照


### api/admin/admins

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/admins` | query keyword(username/name)；权限 `/system/admins` | `admins:fetchAdmins` |
| POST | `/api/admin/admins` | `{ username, name, roleCodes, password? }` → `{ id, initialPassword? }`（未传密码随机生成 12 位） | `admins:saveAdmin` |
| PUT | `/api/admin/admins/:id` | `{ name, roleCodes }`；保留至少一名启用超管；编辑后权限缓存失效 + 强制下线 | `admins:saveAdmin` |
| POST | `/api/admin/admins/:id/reset-password` | `{ password }`（≥8 位含字母数字）；重置后强制下线 | `admins:resetAdminPassword` |
| PATCH | `/api/admin/admins/:id/status` | `{ status: active/disabled }`；停用强制下线 | `admins:updateAdminStatus` |

### api/admin/announcements

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/announcements` | 置顶优先，其余发布时间倒序；默认过滤已归档；权限 `/contents/announcements` | `announcements:fetchAnnouncements` |
| POST | `/api/admin/announcements` | 创建即发布（写 publishedAt，正文 sanitize） | `announcements:createAnnouncement` |
| DELETE | `/api/admin/announcements/:id` | 仅已下架公告可归档（软删） | `announcements:deleteAnnouncement` |
| PUT | `/api/admin/announcements/:id` | 编辑（不改状态/发布时间） | `announcements:updateAnnouncement` |
| POST | `/api/admin/announcements/:id/publish` | 重新发布（withdrawn → published，更新 publishedAt） | `announcements:publishAnnouncement` |
| POST | `/api/admin/announcements/:id/toggle-pin` | 置顶↔取消 | `announcements:toggleAnnouncementPin` |
| POST | `/api/admin/announcements/:id/withdraw` | published → withdrawn + archivableAt | `announcements:withdrawAnnouncement` |

### api/admin/applications

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/applications` | **四类**：settle/individual/cooperation/identity；query：page/pageSize/type/status；默认过滤已归档；附带 applicantId（按联系电话匹配用… | `applications:fetchApplications` |
| POST | `/api/admin/applications/:id/approve` | `{ comment? }`；通过 → 按类型授予申请人身份（见 8.6）+ 企业/合作企业联动 + 首绑积分与经验值（仅真正新增身份时） | `applications:approveApplication` |
| POST | `/api/admin/applications/:id/archive` | 仅 approved/rejected 可归档（软删） | `applications:archiveApplication` |
| GET | `/api/admin/applications/:id/print` | 审核单打印数据（标题/生成时间/申请详情 + applicantId） | `applications:fetchApplicationPrint` |
| POST | `/api/admin/applications/:id/reject` | `{ comment? }` | `applications:rejectApplication` |
| POST | `/api/admin/applications/form-configs/:type` | 保存指定申请类型的可视化表单配置（服务端嵌套校验 schema） | `applications:saveApplicationFormConfig` |
| GET | `/api/admin/applications/form-configs/all` | 读取全部申请类型的表单配置（设计器回填） | `applications:fetchApplicationFormConfigs` |

### api/admin/assets

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/assets` | query bizType；最新在前；权限 `/system/assets` | `assets:fetchAssets` |
| POST | `/api/admin/assets` | multipart（字段 file，bizType?）；魔数嗅探 + 系统配置大小上限；落库失败补偿删对象；审计「素材库 · 上传素材」 | `assets:uploadAsset` |
| DELETE | `/api/admin/assets/:id` | 删除素材（删库 + 删存储对象，存储删除失败仅告警） | `assets:deleteAsset` |
| POST | `/api/admin/assets/:id/replace` | 替换素材（同存储键覆盖，引用方 URL 不变、内容即时生效；文件类型须与原文件一致） | `assets:replaceAsset` |

### api/admin/audit-logs

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/audit-logs` | query：page/pageSize/keyword(target/action/detail/operator)/module 精确筛选；权限 `/logs/audit` | `auditLogs:fetchAuditLogs` |

### api/admin/auth

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/auth/captcha` | `@Public`：`{ captchaId, image }`（SVG dataURL，Redis 5 分钟一次性） | `auth:fetchCaptcha` |
| POST | `/api/admin/auth/change-password` | `{ oldPassword, newPassword }`；新密码 ≥8 位含字母数字；成功后踢出全部会话并审计 | `auth:changePassword` |
| POST | `/api/admin/auth/login` | `@Public`：`{ username, password, captchaId, captchaCode }` → `{ token, name, permissions }`；验证码错误 400、锁定 429、… | `auth:login` |
| POST | `/api/admin/auth/logout` | 登出（Redis 黑名单 + 移出会话索引）→ `{ code: 0 }` | `auth:logout` |
| GET | `/api/admin/auth/sessions` | 在线会话列表（权限 `/system/sessions`） | `auth:fetchSessions` |
| POST | `/api/admin/auth/sessions/:jti/kick` | 强制下线（权限 `/system/sessions`；jti 不存在 404） | `auth:kickSession` |
| POST | `/api/admin/auth/sessions/kick-all` | 一键强制下线其余全部会话，当前操作者会话保留；返回 `{ code: 0, kicked }`（权限 `/system/sessions`；2026-09-12 新增） | `auth:kickAllSessions` |

### api/admin/cards

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/cards/:type` | 名片列表（type=individual/enterprise，关键词/分页） | `cards:fetchCards` |
| GET | `/api/admin/cards/enterprise/:id` | 社区企业名片详情 | —（未调用） |
| PUT | `/api/admin/cards/enterprise/:id` | 更新社区企业名片（logo/行业/规模/官网/地址/业务/优势） | —（未调用） |
| GET | `/api/admin/cards/individual/:uid` | 个人名片详情（简历式分段字段） | —（未调用） |
| PUT | `/api/admin/cards/individual/:uid` | 更新个人名片（后台可编辑，免审核） | —（未调用） |
| GET | `/api/admin/cards/schema/:type` | 读取名片可编辑字段白名单（card-schema 配置） | `cards:fetchCardSchema` |
| PUT | `/api/admin/cards/schema/:type` | 保存名片可编辑字段白名单 | `cards:saveCardSchema` |

### api/admin/contents

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/contents/articles` | query：page/pageSize/keyword(标题/作者/ID)/columnId/channel(official/submitted)/status/sortBy(id 默认、views、createdA… | `contents:fetchArticles` |
| POST | `/api/admin/contents/articles` | 权限 `/contents/publish`：ArticlePayload（title/columnIds（单选取首个）/authorId?/summary/content/tags）；**official 创建即 p… | `contents:createArticle` |
| DELETE | `/api/admin/contents/articles/:id` | 权限 `/contents/publish`：仅 pending/rejected/pending_release **软删归档** | `contents:deleteArticle` |
| GET | `/api/admin/contents/articles/:id` | 文章详情（含栏目/状态/下架记录） | `contents:fetchArticleDetail` |
| PUT | `/api/admin/contents/articles/:id` | 权限 `/contents/publish`：仅 pending_release/scheduled/rejected 可编辑；rejected 修改后回 pending（重新入投稿审核队列） | `contents:updateArticle` |
| POST | `/api/admin/contents/articles/:id/cancel-schedule` | 权限 `/contents/publish`：scheduled → pending_release | `contents:cancelArticleSchedule` |
| POST | `/api/admin/contents/articles/:id/publish` | 权限 `/contents/publish`：pending_release/scheduled → published + publishedAt | `contents:publishArticleNow` |
| POST | `/api/admin/contents/articles/:id/restore` | 已下架（closed）文章恢复为已发布 | `contents:restoreArticle` |
| POST | `/api/admin/contents/articles/:id/review` | 权限 `/contents/submissions`：`{ status: approved/rejected, comment? }`；仅 pending 可审核；approved → pending_release… | `contents:reviewArticle` |
| POST | `/api/admin/contents/articles/:id/schedule` | 权限 `/contents/publish`：`{ scheduledAt }`；仅 pending_release → scheduled（须晚于当前时间） | `contents:scheduleArticle` |
| POST | `/api/admin/contents/articles/:id/withdraw` | 权限 `/contents/publish`：published → pending_release（清 publishedAt/scheduledAt）；可选 `takedownReason`（≤255 字），非空才… | `contents:withdrawArticle` |
| GET | `/api/admin/contents/banners` | 权限 `/contents/banners`；轮播图列表，`sort` 升序 | `banners:fetchBanners` |
| POST | `/api/admin/contents/banners` | 新增轮播图（BN 前缀；title/subtitle/imageUrl?/link?/sort/enabled），审计「新增轮播图」 | `banners:createBanner` |
| DELETE | `/api/admin/contents/banners/:id` | 删除轮播图 | `banners:deleteBanner` |
| PUT | `/api/admin/contents/banners/:id` | 编辑轮播图（审计 before/after） | `banners:updateBanner` |
| POST | `/api/admin/contents/banners/:id/toggle-enabled` | 单条启用/停用 | `banners:toggleBanner` |
| GET | `/api/admin/contents/banners/settings` | 读取首页轮播总开关（homeCarouselOpen） | `banners:fetchBannerSettings` |
| PUT | `/api/admin/contents/banners/settings` | 保存首页轮播总开关 | `banners:saveBannerSettings` |
| GET | `/api/admin/contents/columns` | 按 sort 升序，含文章数聚合；权限 `/contents/columns` | `contents:fetchArticleColumns`、`contents:fetchColumns` |
| POST | `/api/admin/contents/columns` | 创建即启用；body 含 submissionOpen（开放投稿） | `contents:createColumn` |
| DELETE | `/api/admin/contents/columns/:id` | 删除栏目；其文章自动转移至系统保留栏目「未指定」（COL_NONE）；系统保留栏目不可删除 | `contents:deleteColumn` |
| PUT | `/api/admin/contents/columns/:id` | 编辑；改名同步刷新文章 columnName 快照；系统保留栏目不可编辑 | `contents:updateColumn` |
| POST | `/api/admin/contents/columns/:id/toggle-status` | 启用↔停用（停用后新文章不可选；系统保留栏目不可停用） | `contents:toggleColumnStatus` |
| POST | `/api/admin/contents/columns/:id/toggle-submission` | 开放↔关闭投稿开关 | `contents:toggleColumnSubmission` |
| GET | `/api/admin/contents/policies` | 社区政策列表（内容管理域） | `policies:fetchCommunityPolicies` |
| POST | `/api/admin/contents/policies` | 新增社区政策 | `policies:createCommunityPolicy` |
| PUT | `/api/admin/contents/policies/:id` | 编辑社区政策 | `policies:updateCommunityPolicy` |

### api/admin/dashboard

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/dashboard` | `{ stats: { pendingApplications, totalUsers, activeEnterprises, runningProjects, upcomingEvents }, todos, pen… | `dashboard:fetchDashboard` |
| GET | `/api/admin/dashboard/trend` | query `days`（默认 30，范围 3-90）；按日聚合 `{ date(M-DD), members, demands, events, points }`（含补零） | `dashboard:fetchTrend` |

### api/admin/demands

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/demands` | query：page/pageSize/keyword(标题/ID)/category/status/publisherId/enterprise(社区企业按 enterpriseId、合作企业按档案名)/sortBy… | `demands:fetchDemands` |
| POST | `/api/admin/demands` | DemandCreatePayload（publisherType: individual/enterprise/custom + publisherId + 表单字段）；**创建即 pending_release**… | `demands:createDemand` |
| GET | `/api/admin/demands/:id` | 详情含 respondents | `demands:fetchDemand` |
| PUT | `/api/admin/demands/:id` | 编辑（pending_release/published 可用，不改状态） | `demands:updateDemand` |
| POST | `/api/admin/demands/:id/approve` | pending → pending_release | `demands:approveDemand` |
| POST | `/api/admin/demands/:id/archive` | 仅 rejected/closed/projected 可归档（软删） | `demands:archiveDemand` |
| POST | `/api/admin/demands/:id/cancel-schedule` | scheduled → pending_release | `demands:cancelDemandSchedule` |
| POST | `/api/admin/demands/:id/initiate-project` | ProjectInitPayload；published/selected 可立项；创建项目 + 双向关联（demand.projectId ↔ project.sourceDemandId）→ projected +… | `demands:initiateProject` |
| POST | `/api/admin/demands/:id/proxy-respond` | `{ userName, enterprise, phone, email?, quote?, message? }`（仅 published/projected；message 空记"管理员代报名"；联系电话必填） | `demands:proxyRespondDemand` |
| POST | `/api/admin/demands/:id/publish-now` | pending_release → published（写 publishedAt） | `demands:publishDemandNow` |
| POST | `/api/admin/demands/:id/reject` | `{ reason }` 必填 → rejected + archivableAt | `demands:rejectDemand` |
| POST | `/api/admin/demands/:id/retract` | published → pending_release（清 publishedAt/scheduledAt）；可选 `takedownReason`（≤255 字），非空才通知内容所属用户；不要求存在举报 | `demands:retractDemand` |
| POST | `/api/admin/demands/:id/schedule` | `{ scheduledAt }`：pending_release → scheduled | `demands:scheduleDemand` |
| PATCH | `/api/admin/demands/:id/status` | `{ status: "closed" }`（pending_release/published 可关闭；写 archivableAt） | `demands:closeDemand` |
| GET | `/api/admin/demands/undertaker-options` | 承接方候选（社区企业/合作企业/社区个体/个人用户，value=`enterprise:E*`/`enterprise:XE*`/`individual:U*`） | `demands:fetchUndertakerOptions` |

### api/admin/dicts

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/dicts/:type` | 按 sort 升序（管理页返回全量含 disabled）；type 四类 demand_category/industry/event_type/goods_category；权限 `/system/dicts` | `dicts:fetchDictEntries` |
| POST | `/api/admin/dicts/:type` | `{ label }`；label 全类型唯一；创建即启用（code 按类型前缀 DC/IN/ET/GC 自增） | `dicts:createDictEntry` |
| DELETE | `/api/admin/dicts/:type/:code` | 删除并重排同类型 sort；历史引用值不受影响 | `dicts:deleteDictEntry` |
| POST | `/api/admin/dicts/:type/:code/toggle-status` | 启用↔停用 | `dicts:toggleDictEntry` |

### api/admin/enterprises

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/enterprises` | query：page/pageSize/keyword(名称/ID)/industry/status（active/pending/exited/disabled）；默认过滤已归档；列表行附 `level/levelN… | `enterprises:fetchEnterprises` |
| POST | `/api/admin/enterprises` | 权限 `perm:enterprise:create`：body name/industry/size/leaseType/**contactUserId（必填）** + contactTitle?/foundedAt… | `enterprises:createEnterprise` |
| DELETE | `/api/admin/enterprises/:id` | 权限 `perm:enterprise:delete`：**归档（软删）**；存在进行中租约时 409「该企业存在关联租约，请先终止租约」；可在归档管理恢复/彻底删除 | `enterprises:deleteEnterprise` |
| GET | `/api/admin/enterprises/:id` | 详情含成员列表（identities type=community_enterprise 派生，含 stats） | `enterprises:fetchEnterprise` |
| PUT | `/api/admin/enterprises/:id` | 权限 `perm:enterprise:update`：可改 name/industry/size/leaseType/contactUserId/contactTitle/foundedAt/description/… | `enterprises:updateEnterprise` |
| POST | `/api/admin/enterprises/:id/disable` | 权限 `perm:enterprise:disable`：status → disabled；停用后不可创建新租约 | `enterprises:disableEnterprise` |
| POST | `/api/admin/enterprises/:id/enable` | 权限 `perm:enterprise:enable`：status → active | `enterprises:enableEnterprise` |
| GET | `/api/admin/enterprises/:id/stats` | 数据概览：需求发布量（publisherIdentity.enterpriseId 匹配）/项目承接量（undertaker 匹配） | `enterprises:fetchEnterpriseStats` |
| GET | `/api/admin/enterprises/options` | 仅登录：`[{ label: "名称（ID）", value }]` | `enterprises:fetchEnterpriseOptions` |

### api/admin/events

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/events` | query：page/pageSize/keyword(标题/ID)/type/status/participant(报名记录含该用户)/sortBy(id 默认倒序、startTime、createdAt)/sort… | `events:fetchEvents` |
| POST | `/api/admin/events` | 创建即 pending_release、enrollmentOpen=false；表单无定时发布选项 | `events:createEvent` |
| GET | `/api/admin/events/:id` | 详情含 enrollments（到点状态流转先行派生） | `events:fetchEvent` |
| PUT | `/api/admin/events/:id` | 编辑（pending_release/published 可编辑，published 不动状态/已有报名；scheduled/ended/cancelled 不可） | `events:updateEvent` |
| POST | `/api/admin/events/:id/archive` | 仅 ended/cancelled 可归档（软删） | `events:archiveEvent` |
| POST | `/api/admin/events/:id/cancel` | pending_release/published → cancelled + archivableAt | `events:cancelEvent` |
| POST | `/api/admin/events/:id/cancel-schedule` | scheduled → pending_release | `events:cancelEventSchedule` |
| POST | `/api/admin/events/:id/checkin` | `{ userId }`；签到触发积分 activity_checkin + 经验值 activity_checkin（签到积分 = checkinPoints ?? 规则值） | `events:checkInEvent` |
| PATCH | `/api/admin/events/:id/enrollment` | published 状态切换 enrollmentOpen（报名中/暂停报名） | `events:toggleEventEnrollment` |
| POST | `/api/admin/events/:id/enrollments/:userId/review` | `{ status: approved/rejected }`；approved 触发积分 activity_enroll_approved（报名积分 = enrollPoints ?? 规则值） | `events:reviewEventEnrollment` |
| POST | `/api/admin/events/:id/publish-now` | pending_release → published + enrollmentOpen=true | `events:publishEventNow` |
| POST | `/api/admin/events/:id/reschedule` | 活动改期（写 rescheduledTo 并通知已报名者） | `events:rescheduleEvent` |
| POST | `/api/admin/events/:id/restore` | cancelled → pending_release | `events:restoreCancelledEvent` |
| POST | `/api/admin/events/:id/schedule` | `{ scheduledAt }`：pending_release → scheduled | `events:scheduleEvent` |
| GET | `/api/admin/events/:id/tickets` | 活动电子票列表（已报名/已签到） | `events:fetchEventTickets` |
| POST | `/api/admin/events/:id/tickets/redeem` | 后台核销活动电子票（签到即核销） | `events:redeemEventTicket` |

### api/admin/experience-records

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/experience-records` | query：targetType(enterprise/individual)/targetId；最新在前；权限 `/rules/experience-records` | `ledgers:fetchExperienceRecords` |
| POST | `/api/admin/experience-records` | body `{ targetType, targetId, delta, reason }`：非零整数；扣减不致负；写流水（source=manual、operator=登录管理员）；返回 `{ code: 0, ba… | `ledgers:adjustExperience` |

### api/admin/export

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/export/:domain` | CSV 附件流：域 users/demands/projects/events/orders/audit-logs；query keyword/status/startDate/endDate；UTF-8 BOM + … | —（未调用） |

### api/admin/external-enterprises

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/external-enterprises` | 聚合视图（档案 + 派生成员）；query：page/pageSize/keyword/industry/status(active/disabled)/sortBy(cooperationCount/firstCoo… | `external-enterprises:fetchExternalEnterprises` |
| POST | `/api/admin/external-enterprises` | 权限 `perm:external-enterprise:create`：body name/industry 必填 + size?/foundedAt?/description?；返回 `{ id }`（XE 前缀、… | `external-enterprises:createExternalEnterprise` |
| DELETE | `/api/admin/external-enterprises/:id` | 权限 `perm:external-enterprise:delete`：**归档（软删）** | `external-enterprises:deleteExternalEnterprise` |
| GET | `/api/admin/external-enterprises/:id` | 详情含关联成员（external_enterprise 身份 enterpriseName 匹配档案名） | `external-enterprises:fetchExternalEnterprise` |
| PUT | `/api/admin/external-enterprises/:id` | 权限 `perm:external-enterprise:update`：name/industry/size/foundedAt/description；改名时成员身份 enterpriseName 同步迁移 | `external-enterprises:updateExternalEnterprise` |
| POST | `/api/admin/external-enterprises/:id/disable` | 权限 `perm:external-enterprise:disable` | `external-enterprises:disableExternalEnterprise` |
| POST | `/api/admin/external-enterprises/:id/enable` | 权限 `perm:external-enterprise:enable` | `external-enterprises:enableExternalEnterprise` |
| POST | `/api/admin/external-enterprises/:id/members` | 权限 `perm:external-enterprise:update`：body `{ userId, title? }`；重复绑定 409 | `external-enterprises:addExternalMember` |
| DELETE | `/api/admin/external-enterprises/:id/members/:userId` | 权限 `perm:external-enterprise:update`：移除关联成员 | `external-enterprises:removeExternalMember` |
| GET | `/api/admin/external-enterprises/:id/stats` | 需求（publisherIdentity.enterpriseName 匹配）/项目（成员以个人身份承接） | `external-enterprises:fetchExternalEnterpriseStats` |

### api/admin/governance

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/governance/appeals` | 申诉列表（需求/文章驳回申诉，待复核） | `governance:fetchGovernanceAppeals` |
| POST | `/api/admin/governance/appeals/:id/review` | 申诉复核（通过回退至待发布/驳回维持） | `governance:reviewGovernanceAppeal` |
| GET | `/api/admin/governance/reports` | 举报列表（需求/文章/企业/评论/用户） | `governance:fetchGovernanceReports` |
| POST | `/api/admin/governance/reports/:id/review` | 举报处置（下架/恢复/保留 + 处置说明 + 通知） | `governance:reviewGovernanceReport` |

### api/admin/individuals

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/individuals` | 社区个体=持 community_individual 身份的用户；query：page/pageSize/keyword/status | `individuals:fetchIndividuals` |

### api/admin/leases

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/leases/:id/print` | 租约打印单（标题/生成时间/租约详情/条款），复用租约数据无新表 | `workstations:fetchLeasePrint` |

### api/admin/login-logs

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/login-logs` | query：page/pageSize/status(success/failed/locked)/keyword/startDate/endDate；权限 `/logs/login` | `login-logs:fetchLoginLogs` |

### api/admin/mall

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/mall/goods` | query：page/pageSize/keyword(名称/ID)/category/status/sortBy(id 默认倒序、points、createdAt)/sortOrder；默认过滤已归档；权限 `/ma… | `mall:fetchGoods` |
| POST | `/api/admin/mall/goods` | 创建（stock=0 即 restock，否则 off）；商品含发货方式/自提地址/运费/可见与可下单范围；描述 sanitize | `mall:createGoods` |
| PUT | `/api/admin/mall/goods/:id` | 编辑（不影响已有订单）；库存归零 → restock，补货后由 restock 回落为 off | `mall:updateGoods` |
| POST | `/api/admin/mall/goods/:id/archive` | 仅已下架（off）可归档（软删） | `mall:archiveGoods` |
| POST | `/api/admin/mall/goods/:id/toggle-status` | 上架↔下架（下架写 archivableAt，重新上架清除） | `mall:toggleGoodsStatus` |
| GET | `/api/admin/mall/points-issuance` | 仅 source=rule 的积分流水（发放记录页）；权限 `/rules/ledger` | `mall:fetchPointsIssuanceRecords` |
| GET | `/api/admin/mall/points-rules` | 9 条固定项按 code 排序；权限 `/rules/points` | `mall:fetchPointsRules` |
| PUT | `/api/admin/mall/points-rules/:code` | `{ points }` 正整数；name/scene/description 不可改 | `mall:updatePointsRule` |
| POST | `/api/admin/mall/points-rules/:code/toggle-status` | 启用↔停用 | `mall:togglePointsRuleStatus` |
| GET | `/api/admin/mall/redemption-orders` | query：page/pageSize/keyword(用户名/商品名/ID)/status/sortBy(id 默认、createdAt)/sortOrder；默认过滤已归档；权限 `/mall/orders` | `mall:fetchRedemptionOrders` |
| POST | `/api/admin/mall/redemption-orders/:id/archive` | 仅 finished 可归档（软删） | `mall:archiveOrder` |
| POST | `/api/admin/mall/redemption-orders/:id/cancel` | 仅 pending_shipment；**事务**：退回积分（写 source=redemption 流水）+ 库存回补 + redeemedCount-1 + 记 cancelReason（固定文案） | `mall:cancelRedemptionOrder` |
| POST | `/api/admin/mall/redemption-orders/:id/finish` | shipped → finished + archivableAt | `mall:finishRedemptionOrder` |
| POST | `/api/admin/mall/redemption-orders/:id/ship` | pending_shipment → shipped | `mall:shipRedemptionOrder` |

### api/admin/member-governance

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/member-governance/deletions` | 注销申请列表（含冷静期/生效时间） | `memberGovernance:fetchDeletions` |
| POST | `/api/admin/member-governance/deletions/:requestId/review` | 注销复核（approve 执行不可逆注销 / reject） | `memberGovernance:reviewDeletion` |
| GET | `/api/admin/member-governance/realnames` | 实名复核列表（提交时间/状态） | `memberGovernance:fetchRealnameReviews` |
| POST | `/api/admin/member-governance/realnames/:uid/review` | 实名复核（approve 回写实名 / reject 附原因） | `memberGovernance:reviewRealname` |

### api/admin/monitor

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/monitor/cron-logs` | 定时任务执行日志（jobName 可选，最新 100 条） | `monitor:fetchCronLogs` |
| POST | `/api/admin/monitor/jobs/:name/run` | 手动触发任务执行（写 SchedulerLog，失败透出 500「任务执行失败：...」） | `monitor:runCronJob` |
| GET | `/api/admin/monitor/overview` | 服务/DB/Redis 健康指标 + 定时任务最近执行状态；权限 `/system/monitor` | `monitor:fetchMonitorOverview` |

### api/admin/notifications

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/notifications` | 最新在前；仅登录（有意不挂权限码） | `notifications:fetchNotifications` |
| POST | `/api/admin/notifications/:id/read` | 单条已读（幂等） | `notifications:markNotificationRead` |
| POST | `/api/admin/notifications/read-all` | 全部已读 | `notifications:markAllNotificationsRead` |

### api/admin/permissions

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/permissions/catalog` | 权限点目录（按模块分组）；权限 `/system/roles` | `roles:fetchPermissionCatalog` |

### api/admin/points-records

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/points-records` | query：userId；最新在前；权限 `/rules/ledger` | `ledgers:fetchPointsRecords` |
| POST | `/api/admin/points-records` | body `{ userId, delta, reason }`：同上；积分挂靠用户（个人身份）；返回 `{ code: 0, balance }` | `ledgers:adjustPoints` |

### api/admin/projects

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/projects` | query：page/pageSize/keyword(名称/code)/status/participant(个人承接或其社区企业承接)/enterprise(社区企业按承接方 ID；合作企业按成员个人承接)/sor… | `projects:fetchProjects` |
| POST | `/api/admin/projects` | ProjectInitPayload（承接方≥1、share 合计 100、custom 需 name/contactName/phone）；创建即 running、progress=0、code=`JY-YYYY-N… | `projects:createProject` |
| GET | `/api/admin/projects/:id` | 详情含 undertakers/milestones | `projects:fetchProject` |
| PUT | `/api/admin/projects/:id` | 编辑（finished 强制 409；其余状态可编辑；不改状态/编号/进度；承接方与里程碑整体重建，里程碑重置为 todo） | `projects:updateProject` |
| POST | `/api/admin/projects/:id/archive` | 仅 finished/closed 可归档（软删） | `projects:archiveProject` |
| POST | `/api/admin/projects/:id/close` | `{ reason }` 必填；paused → closed + archivableAt | `projects:closeProject` |
| POST | `/api/admin/projects/:id/pause` | running → paused | `projects:pauseProject` |
| POST | `/api/admin/projects/:id/resume` | paused → running | `projects:resumeProject` |

### api/admin/publisher-options

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/publisher-options` | 独立 controller：`{ users: [...], enterprises: [...] }` 含联系电话（自动填充用）；权限（`/demands`、`/enterprises`、`/contents/pub… | `demands:fetchPublisherOptions` |

### api/admin/renter-options

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/renter-options` | `{ users: [...], enterprises: [...] }` 含联系电话（自动填充） | `workstations:fetchRenterOptions` |

### api/admin/roles

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/roles` | 角色列表（含权限码集合）；权限 `/system/roles` | `roles:fetchRoles` |
| POST | `/api/admin/roles` | 新增自定义角色 `{ code, name, description? }`（2026-09-12 新增）；code 小写字母开头仅含小写字母/数字/下划线（2-32）且唯一（409）、不可用内置 `super`（40… | `roles:createRole` |
| PUT | `/api/admin/roles/:id/permissions` | `{ permCodes }`；超管角色仅超管可改且必须保留 `['*']`；非超管不可越权分配；变更即时失效关联管理员权限缓存 | `roles:saveRolePermissions` |
| PUT | `/api/admin/roles/:id/scope` | 保存角色数据范围（domain scope）配置 | `roles:saveRoleScope` |

### api/admin/rules

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/rules/experience` | 6 条固定项按 code 排序；权限 `/rules/experience` | `rules:fetchExperienceRules` |
| GET | `/api/admin/rules/experience-issuance` | 仅 source=rule 的经验流水；权限 `/rules/experience-records` | `rules:fetchExperienceIssuanceRecords` |
| PUT | `/api/admin/rules/experience/:code` | `{ exp }` 正整数 | `rules:updateExperienceRule` |
| POST | `/api/admin/rules/experience/:code/toggle-status` | 启用↔停用 | `rules:toggleExperienceRuleStatus` |
| GET | `/api/admin/rules/levels` | 等级梯度 level 升序；权限 `/rules/levels` | `rules:fetchLevelTiers` |
| PUT | `/api/admin/rules/levels` | 整组保存 body `{ tiers: [{ level, label, threshold }] }`（前端函数签名收数组、请求时包一层）；1-10 级、门槛逐级递增；梯度变更仅影响后续结算 | `rules:saveLevelTiers` |
| GET | `/api/admin/rules/publishing-limits` | 发布限制配置读取（按身份/等级的每日额度） | `rules:fetchPublishLimits` |
| PUT | `/api/admin/rules/publishing-limits` | 发布限制配置保存（默认 -1 不限） | `rules:savePublishLimits` |

### api/admin/space-reservations

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/space-reservations` | query：page/pageSize/keyword(用户/空间/ID)/spaceId/status/date；默认过滤已归档；权限 `/spaces/reservations` | `spaces:fetchReservations` |
| POST | `/api/admin/space-reservations/:id/archive` | 仅已结束（approved 且日期时段已过）/rejected/cancelled 可归档（软删） | `spaces:archiveReservation` |
| POST | `/api/admin/space-reservations/:id/cancel` | pending/approved 可取消 + archivableAt | `spaces:cancelReservation` |
| POST | `/api/admin/space-reservations/:id/review` | `{ status, comment? }`；approved 前冲突校验（见 8.8）；重复审核报错；写审核时间线；rejected 写 archivableAt | `spaces:reviewReservation` |

### api/admin/spaces

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/spaces` | 全量按 ID 升序；权限 `/spaces` | `spaces:fetchSpaces` |
| POST | `/api/admin/spaces` | 创建即 available；allDay 时存 00:00/23:59；needApproval 联动 needReservation | `spaces:createSpace` |
| GET | `/api/admin/spaces/:id` | 详情含预约列表（空间详情页日历/明细用） | `spaces:fetchSpace` |
| PUT | `/api/admin/spaces/:id` | 编辑基础信息（状态走独立接口） | `spaces:updateSpace` |
| POST | `/api/admin/spaces/:id/status` | `{ status: available/maintenance/disabled }` | `spaces:setSpaceStatus` |
| GET | `/api/admin/spaces/usage-board` | query：date；当日已通过预约 + 同名空间已发布活动合并占用（source 区分） | `spaces:fetchSpaceUsageBoard` |

### api/admin/system

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/system/config` | 单例配置（走 `config:system` 缓存 10min）；权限 `/system/config` | `systemConfig:fetchSystemConfig` |
| PUT | `/api/admin/system/config` | 保存即生效；leaseExpireRemindDays 1-90、uploadMaxSizeMb 1-100；记 updatedBy/updatedAt + before/after 审计 | `systemConfig:saveSystemConfig` |
| GET | `/api/admin/system/policies` | 用户协议/隐私政策列表（系统管理域） | `policies:fetchAgreementPolicies` |
| POST | `/api/admin/system/policies` | 新增协议/政策 | `policies:createAgreementPolicy` |
| PUT | `/api/admin/system/policies/:id` | 编辑协议/政策 | `policies:updateAgreementPolicy` |

### api/admin/todos

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/todos` | 五域待办聚合：入驻/合作/身份审核、需求审核、空间预约审核、文章审核、临期租约（窗口取 SystemConfig.leaseExpireRemindDays），`[{ key, title, description, … | `todos:fetchTodos` |

### api/admin/trash

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/trash` | 已归档列表（跨域聚合）：query page/pageSize/domain(标签页)/keyword(标题/编号)；按 deletedAt 倒序；权限 `/system/trash` | `trash:fetchArchiveList` |
| POST | `/api/admin/trash/:domain/:id/purge` | 彻底删除（物理删 + 审计；外键冲突 409「存在关联数据，无法彻底删除」） | `trash:purgeArchived` |
| POST | `/api/admin/trash/:domain/:id/restore` | 恢复对象（限定 deletedAt 非空；清空软删标记） | `trash:restoreArchived` |
| GET | `/api/admin/trash/settings` | 13 个标签页的归档设置（含 autoArchiveSupported 与可归档状态列表） | `trash:fetchArchiveSettings` |
| PUT | `/api/admin/trash/settings/:domain` | `{ autoArchive?, archiveDelayDays?, autoPurge?, purgeDelayDays?, archiveStatuses? }`；企业/合作企业开启自动归档报 400 | `trash:updateArchiveSettings` |

### api/admin/users

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/users` | query：page/pageSize/keyword(昵称/uid/phone)/status/category(individual=仅基础身份、community_individual、community_ent… | `users:fetchUsers` |
| POST | `/api/admin/users` | 新增用户；body `{ nickname, phone, email, gender, realName?, citizenId?, bio? }`；联系电话不可重复；服务端生成 U 编号、正常状态、0 积分及默认个… | `users:createUser` |
| GET | `/api/admin/users/:id` | 详情；stats 由 demands/projects/events 实时 COUNT（projects=个人承接或其社区企业承接） | `users:fetchUser` |
| PUT | `/api/admin/users/:id` | 编辑资料（昵称/联系电话/邮箱/性别/真实姓名/证件号/简介；空串对必填类字段忽略、实名/证件号/简介允许清空）；审计「社区成员 · 编辑用户信息」 | `users:updateUser` |
| POST | `/api/admin/users/:id/freeze` | `{ until?, permanent, reason }`；permanent=false 需 until；reason 必填；已 frozen 报错 | `users:freezeUser` |
| GET | `/api/admin/users/:id/records` | 记录聚合（详情页记录标签）：applications/demands/projects/events/leases/submissions/reservations 七域按用户维度返回；含已归档条目（`deletedA… | `users:fetchUserRecords` |
| POST | `/api/admin/users/:id/reset-password` | 管理员强制重置登录密码；body `{ password }`（≥8 位且含字母数字）；直接覆盖 `passwordHash` 并写 `passwordUpdatedAt`；审计「社区成员 · 重置密码」 | `users:resetUserPassword` |
| PATCH | `/api/admin/users/:id/status` | `{ status }`；仅解冻路径（status=active 时清空 frozenUntil/frozenReason）；冻结必须走 freeze | `users:updateUserStatus` |
| GET | `/api/admin/users/options` | 仅登录：`[{ label: "昵称（uid）", value }]`（跨域表单候选） | `users:fetchUserOptions` |

### api/admin/workstation-areas

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/workstation-areas` | 区域列表；权限 `/workstations/offices` | `workstations:fetchWorkstationAreas` |
| POST | `/api/admin/workstation-areas` | `{ name, type, description }`；name 唯一 | `workstations:createWorkstationArea` |
| DELETE | `/api/admin/workstation-areas/:id` | 仅区域下无办公位时可删 | `workstations:deleteWorkstationArea` |
| PUT | `/api/admin/workstation-areas/:id` | 编辑；改名无需级联（外键化） | `workstations:updateWorkstationArea` |

### api/admin/workstation-leases

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/workstation-leases` | 全量租约最新在前（默认过滤已归档）；expiring/expired 读取派生（15 天窗口，longTerm 不参与）；权限 `/workstations/leases` | `workstations:fetchLeases` |
| POST | `/api/admin/workstation-leases` | LeasePayload；**事务**：校验办公位 idle → 建租约 → 办公位置 assigned + enterprise/lease 回填；renterType=enterprise/individual 校… | `workstations:createLease` |
| GET | `/api/admin/workstation-leases/:id` | 租约详情（不过滤已归档，供用户记录等入口查看历史） | `workstations:fetchLease` |
| PUT | `/api/admin/workstation-leases/:id` | 续期/租金/联系人；terminated 不可编辑；换办公位不支持（终止重建） | `workstations:updateLease` |
| POST | `/api/admin/workstation-leases/:id/archive` | 仅 terminated 可归档（软删） | `workstations:archiveLease` |
| POST | `/api/admin/workstation-leases/:id/terminate` | **事务**：租约 terminated + terminatedAt/archivableAt + 释放全部关联办公位 | `workstations:terminateLease` |

### api/admin/workstations

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/admin/workstations` | 全量办公位（含 areaId→area 名，平面图分组）；权限 `/workstations` | `workstations:fetchWorkstations` |
| POST | `/api/admin/workstations` | `{ area, seatNo, type, capacity, note?, defaultMonthlyRent?, areaSqm? }`——**area 为区域名称字符串**（服务端按名解析 areaId，不存… | `workstations:createWorkstation` |
| DELETE | `/api/admin/workstations/:id` | assigned 不可删；删除后 LeaseWorkstation 关联由级联清理 | `workstations:deleteWorkstation` |
| PUT | `/api/admin/workstations/:id` | 资料编辑（不改分配/维护状态；body 同 POST，area 为区域名） | `workstations:updateWorkstation` |
| POST | `/api/admin/workstations/:id/status` | `{ status: idle/maintenance }`；assigned 不可直接标记 | `workstations:setWorkstationStatus` |

---

## 3. 移动端（/api/app）接口明细与调用对照


### api/app/analytics

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| POST | `/api/app/analytics/events` | Mock 埋点漏斗（登录/注册/发布/响应/报名/签到/下单/投稿/预约/收藏/举报/搜索）；真实接入为数据平台上报 | `analytics:trackEvent` |

### api/app/application-form

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/application-form/:type` | 申请表单 schema：`type` = settle 企业入驻 / cooperation 合作伙伴 / individual 人才登记；返回字段定义（text/textarea/select/number/date… | `applications:fetchApplicationFormSchema` |

### api/app/applications

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| POST | `/api/app/applications` | 提交申请：schema 驱动字段（`fields`: key → string \ | `applications:createApplication` |

### api/app/article-columns

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/article-columns` | 栏目列表（enabled） | `contents:fetchColumns` |

### api/app/articles

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/articles` | 文章列表（`published`，栏目筛选/关键词；浏览量详情时 +1） | `contents:fetchArticles` |
| POST | `/api/app/articles` | 投递文章（channel=submitted，编号 SU 前缀）：提交即待审核，审核通过转待发布（状态机同 wiki §8.1，作者身份快照） | `contents:createArticle` |
| GET | `/api/app/articles/:id` | 文章详情 | `contents:fetchArticle` |
| GET | `/api/app/articles/:id/comments` | 文章评论列表（commentsEnabled=false 时 409） | `contents:fetchArticleComments` |
| POST | `/api/app/articles/:id/comments` | 发表文章评论 | `contents:createArticleComment` |
| POST | `/api/app/articles/:id/likes/toggle` | 文章点赞/取消点赞（冗余计数事务更新） | `contents:toggleArticleLike` |

### api/app/auth

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/auth/captcha` | 图形验证码（登录/注册前置） | `auth:getCaptcha` |
| POST | `/api/app/auth/change-phone` | 换绑手机号（验证码校验） | `auth:changePhone` |
| POST | `/api/app/auth/login` | 手机号+密码+验证码登录，返回 app JWT | `auth:login` |
| POST | `/api/app/auth/logout` | 退出登录（token 加入黑名单） | `auth:logout` |
| POST | `/api/app/auth/register` | v38 注册须同意用户协议与隐私政策并留痕 | `auth:register` |
| POST | `/api/app/auth/reset-password` | v38 找回密码（短信码+限频）/ 换绑手机号（新号验证码+占用 409）/ 登录态改密（原密码校验，成功后其他会话失效） | `auth:resetPassword` |

### api/app/card-schema

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/card-schema/:type` | 名片可编辑字段 schema 下发（`type=individual\ | `enterprises:fetchCardSchema` |

### api/app/community

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/community/enterprises` | 社区企业库列表（关键词/行业筛选） | `community:fetchEnterpriseList` |
| GET | `/api/app/community/policies` | 社区服务/政策内容（Policy 模型：PL 前缀、`category/version/effectiveAt/publisher/attachments/featured/status`；运营来源 admin A18… | `community:fetchPolicies` |
| GET | `/api/app/community/talents` | 人才库列表（社区个体公开名片） | `community:fetchTalents` |
| GET | `/api/app/community/talents/:uid` | 人才名片详情（按可见性设置过滤） | `community:fetchTalentCard` |

### api/app/config

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/config` | 站点信息 + 功能开关 + 站点标语（登录页/首页用；不含 updatedBy 等管理字段） | `config:fetchAppConfig` |

### api/app/demands

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/demands` | 浏览列表：仅 `published`；按可见范围过滤（§9）；分页/类别/关键词；可选 `kind=task\ | `demands:fetchDemands` |
| POST | `/api/app/demands` | 提交需求：`demandOpen` 开关校验；`kind` 必填（task/investment/cooperation）；`categoryDict` 指定类目字典（task/cooperation→demand_c… | `demands:createDemand` |
| GET | `/api/app/demands/:id` | 详情（不可见 → 404，不暴露存在性；发布者可查看本人任意状态需求，其余人仅 `published` 且可见范围命中）；含响应数、`kind` 与类型专属字段（task: deliverable/budget/del… | `demands:fetchDemand` |
| GET | `/api/app/demands/:id/messages` | 需求沟通留言列表（发布方与响应者可见） | `demands:fetchDemandMessages` |
| POST | `/api/app/demands/:id/messages` | 发送需求沟通留言（1~500 字） | `demands:sendDemandMessage` |
| POST | `/api/app/demands/:id/respond` | 响应需求：`published` 校验、不可响应自己的需求、防重复；通过后触发 `demand_responded` 积分（发放给响应成员，M2 批次） | `demands:respondDemand` |

### api/app/dicts

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/dicts` | 全量字典打包（按 type 分组一次下发） | —（未调用） |
| GET | `/api/app/dicts/:type` | 仅 `status=enabled` 字典项（复用 `dicts:{type}` 缓存，管理页缓存键一致） | `config:fetchDict` |

### api/app/enterprises

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/enterprises/:id` | 企业展示页（`showcaseStatus=published` 才可见；含 `logo`/`foundedAt`/`website`/`address`/`services`/`advantages` 精致名片字段） | `enterprises:fetchEnterpriseShowcase` |

### api/app/events

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/events` | 浏览列表：`published` 且未结束；按可见范围过滤（§9）；分页/类型/关键词 | `events:fetchEvents` |
| GET | `/api/app/events/:id` | 详情：报名进度（已通过/容量）、我是否已报名 | `events:fetchEvent` |
| POST | `/api/app/events/:id/check-in` | 活动自助签到（电子票核销 + 围栏/时间窗校验） | `events:checkInEvent` |
| POST | `/api/app/events/:id/enroll` | 报名：`enrollmentOpen` + 报名截止 + 容量 + 可报名范围（§9）校验；`requireReview` 时进入 pending | `events:enrollEvent` |
| POST | `/api/app/events/:id/enroll/cancel` | 取消报名：pending/approved 可取消，approved 释放名额 | `events:cancelEnrollment` |
| GET | `/api/app/events/:id/feedback` | 读取我的会后反馈 | `events:fetchMyEventFeedback` |
| POST | `/api/app/events/:id/feedback` | 提交会后反馈（仅已结束活动） | `events:submitEventFeedback` |
| GET | `/api/app/events/:id/ticket` | 活动电子票（演示二维码/候补位次/取消失效） | `events:fetchEventTicket` |

### api/app/home

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/home` | 首页聚合：siteInfo + 功能开关 + 公告 `announcements`（有效期内、置顶优先取 2，Announcement 增 `expireAt/link`）+ 轮播 `carouselEnabled` … | `home:fetchHomeFeed` |

### api/app/invitations

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/invitations/:id` | 企业成员邀请详情（被邀请人本人或邀请方负责人可看，否则 403）：企业概要（`enterpriseLogo/enterpriseIndustry/enterpriseSize`）+ 邀请人/受邀成员/职位/状态（pen… | `enterprises:fetchInvitation` |
| POST | `/api/app/invitations/:id/respond` | 被邀请人处理邀请（body `action=accept\ | `enterprises:respondInvitation` |

### api/app/mall

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/mall/goods` | 商品列表：`on` 且有库存优先（`restock` 库存为 0 不展示）；`mallOpen` 关闭 → 400 | `mall:fetchGoods` |
| GET | `/api/app/mall/goods/:id` | 商品详情 | `mall:fetchGoodsDetail` |
| POST | `/api/app/mall/goods/:id/restock-subscribe` | 缺货商品到货提醒订阅（补货通知依赖后台补货动作） | `mall:subscribeRestock` |
| POST | `/api/app/mall/orders` | 兑换下单：积分充足 + 库存充足（事务：扣积分+写流水+扣库存+建订单 `pending_shipment`） | `mall:createOrder` |
| POST | `/api/app/mall/orders/:id/cancel` | v38 用户取消实物待发货订单（退积分 + 回补库存）；券码订单签发 `voucherExpiresAt`（30 天） | `mall:cancelOrder` |
| POST | `/api/app/mall/orders/:id/confirm` | 确认收货（shipped → finished） | `mall:confirmOrder` |
| POST | `/api/app/mall/orders/:id/review` | 订单评价：1~5 星 + 文字（每单一次；需订单 finished） | `mall:reviewOrder` |
| POST | `/api/app/mall/orders/:id/use` | 服务权益核销（`pending_use → completed`）；`Goods` 增 `fulfillment=physical\ | `mall:useOrder` |

### api/app/me

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/me` | 资料 + 身份列表（含各身份经验/等级）+ 积分余额 | `auth:restoreSession`、`me:fetchMe` |
| PUT | `/api/app/me` | 更新昵称/头像/性别/简介等可编辑字段（头像为 `POST /uploads` 返回的 url） | `me:updateMe` |
| GET | `/api/app/me/account-requests` | 账号申请记录（注销请求 + 最近数据导出） | `me:fetchAccountRequests` |
| GET | `/api/app/me/addresses` | 收货地址列表 | `addresses:listAddresses` |
| POST | `/api/app/me/addresses` | 新增收货地址（首条自动设为默认） | `addresses:saveAddress` |
| DELETE | `/api/app/me/addresses/:id` | 删除收货地址 | `addresses:removeAddress` |
| PUT | `/api/app/me/addresses/:id` | 编辑收货地址（含 isDefault 切换） | `addresses:saveAddress` |
| POST | `/api/app/me/addresses/:id/default` | 设为默认收货地址（唯一默认，事务互斥） | `addresses:setDefaultAddress` |
| GET | `/api/app/me/applications` | 我提交的申请（含审核时间线） | `applications:fetchMyApplications` |
| GET | `/api/app/me/applications/:id/payload` | 申请重提前回填原始载荷（附件需重新上传） | `applications:fetchMyApplicationPayload` |
| POST | `/api/app/me/applications/:id/resubmit` | 已驳回/撤回申请修改重提（保留编号） | `applications:resubmitApplication` |
| POST | `/api/app/me/applications/:id/withdraw` | 申请撤回 / 修改重提（可补充材料；附件需重新上传） | `applications:withdrawApplication` |
| GET | `/api/app/me/articles` | 我投递的文章（含驳回原因，可再提交） | `contents:fetchMyArticles` |
| POST | `/api/app/me/articles/:id/appeal` | 投稿驳回后一次性申诉 | `contents:appealArticle` |
| GET | `/api/app/me/articles/:id/payload` | 投稿重提前回填原始内容 | `contents:fetchMyArticlePayload` |
| POST | `/api/app/me/articles/:id/resubmit` | 已驳回/撤回投稿修改重提（保留编号） | `contents:resubmitArticle` |
| POST | `/api/app/me/articles/:id/withdraw` | 投稿撤回 / 重提（回填原始内容）/ 申诉 | `contents:withdrawArticle` |
| GET | `/api/app/me/blocklist` | 我的屏蔽名单 | `me:listBlockedUsers` |
| POST | `/api/app/me/blocklist` | 屏蔽用户（需求广场/互动过滤） | `me:blockUser` |
| POST | `/api/app/me/blocklist/:uid/remove` | 解除屏蔽 | `me:unblockUser` |
| GET | `/api/app/me/cards` | 我的个人名片（社区个体；简历式分段字段；缺口 m2-client-plan §7.1-16） | `enterprises:fetchMyCards` |
| PUT | `/api/app/me/cards/individual` | 保存个人名片：`displayName/age/politicalStatus/intro/industryExperience/skills` + 可增删分段 `education/work/projects/hon… | `enterprises:updateIndividualCard` |
| POST | `/api/app/me/change-password` | 修改登录密码（旧密码校验） | `me:changePassword` |
| POST | `/api/app/me/data-export` | 申请个人数据导出（生成 JSON 文件并站内信通知） | `me:requestDataExport` |
| GET | `/api/app/me/data-exports/:key` | 下载个人数据导出文件（本人鉴权，绝对链接下发） | —（未调用） |
| POST | `/api/app/me/deletion-request` | 提交账号注销申请（7 天冷静期，运营复核后执行） | `me:requestAccountDeletion` |
| POST | `/api/app/me/deletion-request/cancel` | 撤回注销申请（7 天冷静期内） | `me:cancelAccountDeletion` |
| GET | `/api/app/me/demands` | 我发布的需求（全状态，含 `kind`） | `demands:fetchMyDemands` |
| POST | `/api/app/me/demands/:id/appeal` | 需求驳回后一次性申诉 | `demands:appealDemand` |
| GET | `/api/app/me/demands/:id/payload` | 需求重提前回填原始载荷 | `demands:fetchMyDemandPayload` |
| GET | `/api/app/me/demands/:id/responses` | [MOCK-ONLY·缺口 §7.1-19] 需求发布者查看响应列表（响应方快照 + `status=pending/accepted/rejected` + 审核时间/驳回原因）；非发布者 403 | `demands:fetchDemandResponses` |
| POST | `/api/app/me/demands/:id/resubmit` | 已驳回/撤回需求修改重提（保留编号） | `demands:resubmitDemand` |
| POST | `/api/app/me/demands/:id/select` | 发布者选择意向承接方（`responseIds[]` 多选，去重且非空，全部须为本人需求下未撤回的待处理响应）；需求转 `selected`（`matchedRespondent` 记录被选人），被选响应转 `acce… | `demands:selectDemandResponders` |
| POST | `/api/app/me/demands/:id/withdraw` | 需求撤回（pending→withdrawn）、驳回/撤回后重提（保留编号）、驳回后一次性申诉 | `demands:withdrawDemand` |
| GET | `/api/app/me/enrollments` | 我的报名（含活动信息与状态） | `events:fetchMyEnrollments` |
| GET | `/api/app/me/enterprise-workbench` | 企业工作台：企业维度聚合（需求/响应/项目/成员统计），仅成员/负责人可看（E7） | `enterprises:fetchEnterpriseWorkbench` |
| GET | `/api/app/me/enterprises/:id` | 企业详情：关联人可查看；含企业信息（`logo` 企业 Logo、`foundedAt` 成立时间、`website` 官网、`address` 办公地点、`services` 主营业务、`advantages` 核心… | `enterprises:fetchEnterpriseDetail` |
| PUT | `/api/app/me/enterprises/:id` | 修改企业基本信息（需 `edit_card` 权限；负责人默认拥有；行业/规模/简介/`logo`/成立时间/官网/办公地点/主营业务/核心优势；真实后端应提交审核，企业走 `showcaseStatus`） | `enterprises:updateMyEnterprise` |
| POST | `/api/app/me/enterprises/:id/exit-application` | 申请企业退驻/注销（可选 `reason`）→ 管理端审核；mock 记录 pending 状态 | `enterprises:applyEnterpriseExit` |
| POST | `/api/app/me/enterprises/:id/invite` | 邀请企业成员（需 `invite_member` 权限；姓名 + 手机号 + **职位 `role` 必填**）：生成邀请记录并给被邀请人发站内信（`/me/invitations/:id`）；手机号需已注册，已是成员… | `enterprises:inviteEnterpriseMember` |
| PUT | `/api/app/me/enterprises/:id/member` | 修改企业成员信息：`memberUid?`/`memberName` + `role`/`phone`（需 `manage_members`；phone 为空串表示清空，冲突 409）+ `permissions`（需… | `enterprises:updateEnterpriseMember` |
| POST | `/api/app/me/enterprises/:id/remove-member` | 移除企业成员（需 `manage_members` 权限；`memberUid?`/`memberName`；负责人本人需先转移负责人，否则 409） | `enterprises:removeEnterpriseMember` |
| POST | `/api/app/me/enterprises/:id/transfer-contact` | 转移企业负责人（后台字段「联系人」= `contactUserId`，**仅负责人本人**）：`memberUid?` / `memberName`；转移后原负责人转为只读成员 | `enterprises:transferEnterpriseContact` |
| POST | `/api/app/me/enterprises/invitations/:invitationId/revoke` | 撤销待接受的企业成员邀请（邀请 7 天有效期） | `enterprises:revokeEnterpriseInvitation` |
| GET | `/api/app/me/experience-records` | 我的经验与等级（按**当前身份**取数：社区个体 → 个人经验/我的等级；社区企业 → 企业经验/企业等级；个人用户/合作企业 → 空）；可选 `identity` 查询参数指定身份；响应 `{ identityLab… | `experience:fetchExperience` |
| GET | `/api/app/me/favorites` | 收藏需求 / 文章 / 活动与切换 | `favorites:listFavorites` |
| POST | `/api/app/me/favorites/toggle` | 收藏/取消收藏（需求/文章/活动/企业/人才） | `favorites:toggleFavorite` |
| GET | `/api/app/me/identities` | 我的关联身份列表：社区个体 + 我关联的社区企业/合作企业（可多个）；企业项含 `roleLabel`（负责人/成员）、`isContact`、`permissions`（成员权限；负责人为全部）、`showcaseS… | `enterprises:fetchMyIdentities` |
| GET | `/api/app/me/orders` | 我的兑换订单 | `mall:fetchMyOrders` |
| GET | `/api/app/me/points-records` | 我的积分流水（分页，含 balance）；积分按身份隔离：仅社区个体/个人用户可查看 | `me:fetchPointsRecords` |
| GET | `/api/app/me/projects` | 我承接的项目（需求发起方 / 本人或其社区企业身份所在企业承接；进度与里程碑状态） | `projects:fetchMyProjects` |
| GET | `/api/app/me/projects/:id` | 项目详情（参与双方可看）：参与人、来源需求、进度与里程碑交付验收状态——[MOCK-ONLY·缺口 §7.1-19] | `projects:fetchMyProject` |
| GET | `/api/app/me/projects/:id/attachments/:storeKey/download` | 下载里程碑交付证据（发起方/承接方鉴权） | —（未调用） |
| GET | `/api/app/me/projects/:id/discussions` | 项目讨论区留言列表 | `projects:fetchProjectCollab` |
| POST | `/api/app/me/projects/:id/discussions` | 发送项目讨论留言 | `projects:sendProjectMessage` |
| GET | `/api/app/me/projects/:id/files` | 项目协作文件链接列表 | `projects:fetchProjectCollab` |
| POST | `/api/app/me/projects/:id/files` | 添加协作文件链接 | `projects:addProjectFile` |
| GET | `/api/app/me/projects/:id/files/:fileId/download` | 下载协作文件（参与方鉴权） | `projects:downloadProjectFile` |
| POST | `/api/app/me/projects/:id/milestones/:milestoneId/accept` | [MOCK-ONLY·缺口 §7.1-19] 发起方验收里程碑；全部验收通过自动结项并按 wiki-backend §8.6 发放 `project_completed` 经验 | `projects:acceptMilestone` |
| POST | `/api/app/me/projects/:id/milestones/:milestoneId/return` | v38 发起方退回里程碑（记录原因，承接方可重新提交；提交支持 `attachments[]`） | `projects:returnMilestone` |
| POST | `/api/app/me/projects/:id/milestones/:milestoneId/submit` | [MOCK-ONLY·缺口 §7.1-19] 承接方提交里程碑完成（可附说明）→ 待发起方验收；发起方调用 403 | `projects:submitMilestone` |
| GET | `/api/app/me/projects/:id/tasks` | 项目协作任务清单 | `projects:fetchProjectCollab`、`projects:toggleProjectTask` |
| POST | `/api/app/me/projects/:id/tasks` | 新增协作任务 | `projects:addProjectTask` |
| PUT | `/api/app/me/projects/:id/tasks/:taskId` | 更新协作任务（完成/待办） | `projects:toggleProjectTask` |
| GET | `/api/app/me/realname` | 实名认证状态：`{ verified, realName? 脱敏（首字）, citizenIdMasked? 前 4 后 4, verifiedAt? }`；「编辑资料」页实名认证入口 note（已认证/未认证）；缺口… | `me:fetchRealName` |
| PUT | `/api/app/me/realname` | 提交实名认证：`realName` + `citizenId`（18 位，含校验码）；已认证 409；真实后端需三要素/公安库核验后回写（mock 即时通过并发站内信） | `me:submitRealName` |
| GET | `/api/app/me/realname-rights` | 当前发布限制展示：个人实名状态、社区个体/社区企业等级对应的需求发布、文章投稿、活动报名与空间预约额度；企业额度按企业主体共享 | `me:fetchRealnameRights` |
| GET | `/api/app/me/reports` | v38 我的举报（状态 pending/resolved/rejected 由 admin 处置回写） | `me:listMyReports` |
| GET | `/api/app/me/reservations` | 我的预约（可取消 pending/approved）；返回 `identityType`/`subjectName` 主体快照 | `spaces:fetchMyReservations` |
| GET | `/api/app/me/responses` | 我的需求响应记录 | `demands:fetchMyResponses` |
| POST | `/api/app/me/responses/:id/withdraw` | [MOCK-ONLY·缺口 §7.1-19] 响应者撤回待处理响应（撤回后可重新响应）；已处理 409 | `demands:withdrawDemandResponse` |
| GET | `/api/app/me/stats` | 个人数据看板：积分/经验/需求/响应/项目/活动/签到聚合口径（E5） | `me:fetchMyStats` |
| GET | `/api/app/me/transfer-requests` | 负责人转移请求列表 / 目标成员接受或拒绝 / 发起方撤销（接受后变更负责人） | `enterprises:fetchMyTransferRequests` |
| POST | `/api/app/me/transfer-requests/:requestId/cancel` | 发起方撤销负责人转移请求 | `enterprises:cancelEnterpriseTransfer` |
| POST | `/api/app/me/transfer-requests/:requestId/respond` | 负责人转移请求接受/拒绝（接受即变更负责人） | `enterprises:respondEnterpriseTransfer` |

### api/app/notices

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/notices` | 站内信列表：分页（按时间倒序，可按类型查询但前端不分类）；返回未读数 | `notices:fetchNotices` |
| POST | `/api/app/notices/:id/read` | 标记已读（幂等） | `notices:markNoticeRead` |
| POST | `/api/app/notices/read-all` | 全部已读 | `notices:markAllNoticesRead` |
| GET | `/api/app/notices/unread-count` | 未读数（首页/顶栏角标） | `notices:fetchUnreadCount` |

### api/app/policies

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/policies/:kind` | 读取已发布的用户协议/隐私政策（注册、政策页） | `community:fetchAgreementPolicy` |

### api/app/reports

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| POST | `/api/app/reports` | 举报（需求 / 文章 / 企业名片；管理端举报处理与内容处置为后台缺口） | `reports:submitReport` |

### api/app/search

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/search` | 全域聚合搜索：`keyword` + 可选类型过滤（demand/event/article/enterprise/space/talent/community）+ 分类计数 + 分页 cursor；结果与首页/各列表… | —（未调用） |

### api/app/spaces

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| GET | `/api/app/spaces` | 可预约空间列表（`needApproval`/时段/设备） | `spaces:fetchSpaces` |
| GET | `/api/app/spaces/:id` | 公共空间详情（设备/时段/预约规则） | `spaces:fetchSpaceDetail` |
| GET | `/api/app/spaces/:id/availability` | 某日已占用时段（已通过预约 + 已发布活动占用，口径同 wiki §8.8） | `spaces:fetchAvailability` |
| POST | `/api/app/spaces/reservations` | 提交预约：`reservationOpen` 校验 + 提交前冲突预检（409 文案同 §8.8）→ 管理端审核；payload 增 `asIdentity`（预约主体：个人用户/社区个体/社区企业/合作企业，均可预约… | `spaces:createReservation` |
| POST | `/api/app/spaces/reservations/:id/cancel` | 取消空间预约（pending/approved 可取消） | `spaces:cancelReservation` |

### api/app/uploads

| 方法 | 路径 | 用途 | 调用方 |
|---|---|---|---|
| POST | `/api/app/uploads` | 申请资料 / 配图上传：multipart（`file` + `bizType`），仅图片与 PDF（魔数嗅探），大小限制同系统配置；返回 `{ key, name, size, type, url }` | `uploads:uploadFile` |

---

## 4. 审计发现

### 4.1 缺失（前端调用但后端无路由）

**无。** 两端全部调用均可命中后端路由（后台未命中 2 处为动态首段统计误差，移动端 0 处，见 §4.5 说明）。

### 4.2 重复定义（同方法 + 同路径注册两次）

**无（本轮已修复）。** 修复记录（2026-09-17）：
- 删除 `GET /api/app/enterprises/:id/workbench` 的重复注册（`engagement.controller` 与 `enterprises.controller` 各一条）；工作台统一为 `GET /api/app/me/enterprise-workbench?enterpriseId=`。
- 删除 `GET /api/app/me/enrollments/:id/ticket`；电子票统一为 `GET /api/app/events/:id/ticket`（移动端原有入口，响应含 `ticketCode/status/checkedIn/waitlistOrder`）。

修复后后端路由 368 → 365（`/api/app/**` 141 → 138），e2e 用例同步更新并通过。

### 4.3 同功能多入口（语义重复）

本轮已收敛为单入口：

| 能力 | 保留入口 | 已移除入口 |
|---|---|---|
| 企业工作台 | `GET /api/app/me/enterprise-workbench?enterpriseId=` | `GET /api/app/enterprises/:id/workbench`（重复注册 ×2，已删除） |
| 活动电子票 | `GET /api/app/events/:id/ticket` | `GET /api/app/me/enrollments/:id/ticket`（已删除） |

有意保留的成对入口（非重复，契约与测试覆盖）：`GET /api/app/dicts/:type` 与 `GET /api/app/dicts`（全量打包，供全局筛选一次下发；`app-auth.e2e-spec` 覆盖，移动端暂按类型读取）。

### 4.4 多余/未接入（后端提供、当前前端未直接调用）

**后台（1 条真实 + 4 条统计误报）**

| 路由 | 说明 |
|---|---|
| `GET /api/admin/export/:domain` | 列表导出由前端 `utils/exportCsv.ts` 本地生成 CSV；服务端导出为运维/开放接口（`export.e2e-spec` 覆盖），前端暂不接入 |

> `/api/admin/leases/:id/print` 已接入租约打印页、`POST /api/admin/monitor/jobs/:name/run` 已接入监控「手动执行」（本轮修复，见 §4.7）。
> 另有 4 条 `/api/admin/cards/individual/:uid`、`/api/admin/cards/enterprise/:id`（GET/PUT）因前端使用动态首段 `/cards/${type}/${id}` 而未被脚本匹配，实际已被名片管理页调用（见 §4.5）。

**移动端（2 条契约保留 + 2 条间接使用）**

| 路由 | 状态 | 说明 |
|---|---|---|
| `GET /api/app/dicts` | 契约保留 | 全量字典打包；`app-auth.e2e-spec` 覆盖，移动端全局筛选接入前按类型读取 |
| `GET /api/app/search` | 契约保留 | 全域聚合搜索；移动端暂用各域聚合（m2-client-plan D8 后续接入） |
| `GET /api/app/me/data-exports/:key` | 间接使用 | 站内信/账号安全以绝对链接交给 `downloadPersonalData()` 下载，非 api 层调用 |
| `GET /api/app/me/projects/:id/attachments/:storeKey/download` | 间接使用 | 里程碑附件 URL 由后端下发，前端 `httpDownload(attachment.url)` 动态调用 |

本轮已接入的移动端端点：`GET /api/app/policies/:kind`（协议版本）、`GET /api/app/me/realname-rights`（实名分级权益）、`POST /api/app/me/addresses/:id/default`（默认地址）、`GET /api/app/spaces/:id`（空间详情）。

### 4.5 统计误差说明（非真实缺口）

- 后台 `GET|PUT /api/admin/cards/${type}/${id}`：`${type}` 为动态首段，实际命中 `cards/individual/:uid` 与 `cards/enterprise/:id`；
- 移动端 `httpDownload('/api/app/...')` 与 `httpDownload(attachment.url)`：绝对地址/变量，端点真实存在且被使用。

### 4.6 客户端 Mock-only 残留（有 Mock 分支、无后端端点）

全量扫描 `apps/client-mobile/src/api/*.ts`：**仅 1 个函数**为有 Mock 分支且无 HTTP 实现——`mall.ts:mockAdvanceOrder`（DevTools 演示「待发货 → 已发货」的调试助手，非业务功能）。其余全部调用均有 `http` 分支，Mock 仅为 `VITE_API_MODE=mock` 的演示通道。

`GET /api/app/search`（移动端暂用各域聚合）与 `GET /api/app/dicts`（移动端按类型读取）为契约已实现、**有意保留**的端点，均有 e2e 覆盖。

### 4.7 结论

- 功能 ↔ 接口整体对齐，且本轮修复后：**无重复定义、无同功能多入口（除有意保留的字典打包）、无前端孤立调用**；剩余 2 处后端未直接调用均为有意保留（运维导出、字典打包）与间接使用，无真实缺口。
- 本轮修复动作：后端删除 3 条重复/冗余路由并同步 e2e 与契约文档；后台接入监控手动执行与租约打印数据；移动端接入协议版本、实名权益、默认地址与空间详情；三端 TypeScript/构建/lint 与全量 e2e（40 套件 / 270 用例）通过。