# 聚屿社区 · M2-R 接入期实施规划（/api/app/** 对齐）

> 状态：**已立项（2026-09-16）**，规划稿 v1，未开始实施。
> 依据：`docs/api-app-design.md`（契约基线）、`docs/m2-client-plan.md` §7 缺口登记与 §7.7 交底表、`docs/wiki-backend.md` §4/§8、客户端 v43 Mock 现状（2026-09-16 代码调研）。
> 本文是 M2-R 的**进度事实来源**：完成后端/API 与 admin 两张对齐表即完成 M2-R。`m2-client-plan.md` §7 仍是缺口登记总表，销号时两边同步勾选。

## 0. 已确认决策（2026-09-16，用户拍板）

| # | 决策 | 内容 |
|---|---|---|
| D-1 | **全量对齐，分批实施** | 覆盖 §7.1 全部 23 条缺口 + §7.7 A/D/E 全表（约 110+ 端点、20+ 模型迁移、约 18 项 admin 增强），按 R0→R4 五批交付；本文档全量列出，进度分批勾选 |
| D-2 | **第三方依赖服务端降级** | 短信验证码→复用图形验证码体系（留短信接口位）；实名三要素→18 位规则校验即时通过 + admin 人工复核入口；电子票→服务端 HMAC 确定性核销码。真实第三方接入登记为 M2-R 后续替换项，不阻塞 |
| D-3 | **admin 必做全做，可选后置** | P0/P1 必做项全做（§3.1）；标「可选」的运营视图列入 §3.2 不排期，随 API 落地后再评估 |
| D-4 | **文档落点** | 本文档承载 M2-R 规划与进度；`m2-client-plan.md` §7 不改结构仅加交叉引用；`full-spec-check.md` 头部同步决策变更 |

### 0.1 批次总览与进度看板

| 批次 | 内容 | 依赖 | 状态 |
|---|---|---|---|
| R0 | 契约冻结与迁移设计（文档/决策/迁移方案，零端点） | — | [ ] 未开始 |
| R1 | 鉴权底座与个人中心 + 站内信 | R0 | [ ] 未开始 |
| R2 | 核心业务闭环（需求/项目/活动/商城/空间/内容/申请/首页/搜索） | R1 | [ ] 未开始 |
| R3 | 信任治理（实名/举报/屏蔽/邀请/转移/权限/名片/社区/协议） | R1（与 R2 可并行） | [ ] 未开始 |
| R4 | 延伸观测与切换（任务/看板/服务申请/企业工作台/实名分级/埋点 + http 切换 + 全量回归） | R2+R3 | [ ] 未开始 |
| A-* | admin 面板对齐（§3.1 A1~A18，随对应 API 批次实施） | 各批次 | [ ] 未开始 |

## 1. 各端现状基线（2026-09-16 调研）

- **client-mobile（v43）**：61 路由 / 20 域契约文件全部 mock/http 双分支（http 分支已留路径）；`api/http.ts` 封装完整（token 注入 / 401 统一 / 包络解包 / httpUpload / 超时离线）；[MOCK-ONLY] 190 处；快照键 `joinyuu_client_mock_v33`。M2-R 期间客户端原则上**只做 §7.5 遗留修复与切换适配，不改 UI**。
- **apps/api**：16 模块域 / 36 controller / 193 端点全部 `/api/admin/**`（app 端点 0）；`AdminJwtPayload` 无 `scope` 字段；`DomainScopeGuard` 只解析 admin 路径；`User.passwordHash/realName/citizenId/points` 已存在；积分引擎/上传管线/包络/异常/发号器/审计均可复用。
- **admin**：16 视图目录 / 28 api 域文件。已有：手动补签、活动取消/恢复、公告面板（无有效期）、订单发货（无运单号）。缺失见 §3.1。
- **关键模型差距**（详表见 §2.6）：`DemandRespondent` 无 userId 关联；`Milestone` 无提交/验收/退回状态；`EventEnrollment` 无候补；`CommunityEvent` 无签到地理字段；`Enterprise` 无名片丰富字段；`MallGoods.category`（履约语义 physical/virtual/voucher）与客户端 `fulfillment` + `category`（GC 字典）语义冲突。

## 2. 后端 API 对齐规划

### 2.0 统一实施步骤（每个工作项均适用）

1. DTO + 契约：按 `api-app-design.md` 定义请求/响应形状（与客户端 `src/types/index.ts` 对齐；偏差先改契约文档再改代码）
2. Prisma 迁移：模型/字段 + seed 补充（含演示数据对齐 mock 口径）
3. Service：业务规则 + 状态机校验（409/400/404 中文文案与 wiki §4 一致）+ 事务（积分/库存/名额）
4. Controller：`@Controller('api/app/<domain>')` + `AppJwtGuard`；写操作挂审计（口径同 admin 域）
5. e2e：新增 `apps/api/test/app-<domain>.e2e-spec.ts`（复用 `reseed` helper + app 登录 helper，R1 建立）
6. 文档：勾选本文档进度 + `m2-client-plan.md` §7 对应缺口 + `entity-fields.md` / `api-app-design.md` 回写

**统一检查方法（每工作项/每批次）**：`pnpm --filter @joinyuu/api exec tsc -p tsconfig.json --noEmit` + `pnpm build:api` + `pnpm db:reset` 幂等 + 本批 e2e 套件全绿（`pnpm db:up` 前置）；行为验收 = 客户端切 `VITE_API_MODE=http` 后**无需改 UI** 即可达 Mock 同款行为。

### 2.1 R0 契约冻结与迁移设计（零端点，纯文档/方案）

| # | 工作项 | 实施要点 | 验收 |
|---|---|---|---|
| R0-1 | api-app-design.md 修订 | §8.1 全部 [MOCK-ONLY] 端点转正；补 v40~v43 新端点设计（电子票/任务中心/看板/服务申请/企业工作台/实名分级/搜索聚合/浏览历史/订单评价/候补/改期）；修订记录留痕 | 全部客户端 api 函数在文档中有对应端点定义；双方形状一致 |
| R0-2 | entity-fields.md 扩展 | 按 §2.6 迁移清单补新模型与字段说明 | 模型数与 schema.prisma 一致 |
| R0-3 | Prisma 迁移方案定稿 | 一次设计、按批次执行（R1/R2/R3 各一组 migration）；含索引与回填策略 | 迁移清单评审通过（§2.6 全项有批次归属） |
| R0-4 | 决策项落地（§5 开放问题逐条定稿） | MallGoods 分类语义拆分、订单状态 completed/finished 映射、社区政策运营来源、核销码算法、短信降级形态 | §5 表全部标「已决」 |

### 2.2 R1 鉴权底座与个人中心 + 站内信（P0）

| # | 工作项 | 实施要点（含缺口来源） | 验收 checklist |
|---|---|---|---|
| R1-1 | App 鉴权体系（§7.1-4/11） | `AppJwtPayload{sub,scope:'app',identities[],jti,exp}`；`AppJwtGuard` 全局注册并按路径前缀分流（admin guard 对 `/api/app/**` 短路，`DomainScopeGuard`/`@RequirePermission` 不命中 app 路径）；登出黑名单复用 `auth:blacklist:{jti}`；app 图形验证码 `GET /api/app/auth/captcha`（复用 admin 验证码管线） | admin 全部 191 端点行为回归不变；app token 不能调 admin 端点（403）；admin token 不能调 app 端点（401/403） |
| R1-2 | 注册/登录/登出（§7.7 A11） | `POST /auth/register`（`registrationOpen` 开关、手机号唯一、默认授予 individual、`agreed` 必填并写 AgreementConsent 留痕）；`POST /auth/login`（验证码 + `daily_login` 积分**自然日去重**）；`POST /auth/logout` | 注册关闭 400；重复手机号 409；未勾选协议 400；daily_login 同日只发一次 |
| R1-3 | 配置与字典下发（§7.1-3/5） | `GET /config`（站点信息+功能开关+标语）、`GET /dicts/:type`（enabled 过滤+缓存复用）、`GET /dicts`（批量 4 类） | 与 admin 配置/字典页改动能联动；缓存写失效一致 |
| R1-4 | 个人中心（§7.1-7） | `GET/PUT /me`（头像走上传 url）；`GET /me/points-records`（分页含 balance，仅个人/社区个体）；`GET /me/experience-records`（`identity` 参数兼容） | 积分余额与流水一致；空态（新注册）正确 |
| R1-5 | 站内信（§7.1-1，P0） | `UserNotification` 模型 + `NotificationService.pushNotice()` 统一出口；`GET /notices`（分页/筛选）、`GET /notices/unread-count`、`POST /notices/:id/read`、`POST /notices/read-all`、归档/恢复；通知偏好 `GET/PUT /me/notices/prefs`（至少一种） | 触发点框架就绪（R2/R3 各业务接线）；偏好关闭后列表与推送均不出现该类型 |
| R1-6 | 地址簿（§7.7 A1） | `GET/POST/PUT/DELETE /me/addresses`；默认地址唯一（事务） | 默认地址切换原子；删除默认自动转移或置空（定稿于 R0-4） |
| R1-7 | 账号安全族（§7.7 A2/A3） | `POST /auth/reset-password`（图形验证码降级 + 限频）、`POST /auth/change-phone`（新号验证码降级 + 占用 409）、`POST /me/change-password`（原密码校验 + 踢其他会话）、`POST /me/deletion-request`（7 天冷静期 + 撤回）、`POST /me/data-export`（异步打包 + 站内信下载链接） | 重置后旧密码失效；改密后其他会话 401；冷静期内可撤回；导出包含全量个人数据 |
| R1-8 | app e2e 基建 | `test/helpers/app-auth.ts`（app 登录 helper）；`app-auth / app-me / app-notices` 三套件 | 三套件全绿；reseed 隔离有效 |

### 2.3 R2 核心业务闭环（P0/P1）

| # | 工作项 | 实施要点（含缺口来源） | 验收 checklist |
|---|---|---|---|
| R2-1 | 需求广场全链路（§7.1-9/15/19） | 列表/详情（`kind` 筛选、可见范围**SQL 条件过滤**+详情 404 不暴露存在性）；提交（四身份、`asEnterpriseId` 校验 `publish_demand`、kind 专属字段、联系人校验）；响应（防重/不可响应自己，支持代企业 `respond_demand`）；响应撤回；发布者响应列表 + review（接受→**事务**：需求转 `projected` + Project/双向 Undertaker/里程碑生成 + `demand_undertaken` 积分与项目经验 + 双方站内信 + 自动驳回其余）；`withdraw/resubmit/appeal`（保留编号）；`Demand` 增 `projectId/demandType` 等字段、`DemandRespondent` 增 `userId`（对齐 §2.6） | 可见范围矩阵（身份×等级×空数组）全覆盖；接受响应后项目/积分/经验/通知/驳回原子；重提保留原编号 |
| R2-2 | 需求沟通留言（E2） | `DemandMessage` 模型；`GET/POST /me/demands/:id/messages`（仅发布方与响应方可见）；未读数 | 非参与方 403；消息时间序可追溯 |
| R2-3 | 项目协作（§7.1-19 + E3） | `GET /me/projects`、`GET /me/projects/:id`（参与双方可看）；里程碑 `submit`（attachments[] 走上传）/`accept`（全部通过自动结项 + `project_completed` 经验）/`return`（退回原因，状态回可提交）；协作空间：`ProjectTask`（任务分配/状态）、`ProjectFile`（对象存储 + 鉴权下载）、讨论（复用留言或独立） | 发起方调 submit 403；验收后进度与结项联动；退回后可重新提交；文件未授权不可下载 |
| R2-4 | 活动中心（§7.1-2/9 + §7.7 A4 + D1） | 列表/详情（可见范围过滤 + 报名进度 + 我是否已报名）；`enroll`（截止/容量/范围校验，满员进**候补** `waitlistOrder`）；`enroll/cancel`（开始前 24h 时限 `cancelDeadlineHours` + 自动递补第一名 + 站内信）；`check-in`（地理围栏 `venueLat/Lng/checkinRadiusM` + 时间窗 `checkinOpenMin/CloseMin` + 防重 + `activity_checkin` 积分 + 记录方式/坐标）；反馈 `GET/POST /events/:id/feedback`（结束后 + 参与过 + 一人一条）；活动状态机补 `postponed`（改期 + `rescheduledTo` + 批量通知，取消已有） | 围栏外/时间窗外 400 中文文案；候补递补自动发积分与通知；取消过时限 409；改期后报名状态保留并通知 |
| R2-5 | 电子票（E1 + D-2） | 报名通过（approved）签发 `EventTicket`（票号 + **HMAC 确定性核销码**：HMAC(eventId+ticketId+secret) 截断展示为二维码内容）；`GET /me/enrollments/:id/ticket`；核销 `POST /api/app/events/:id/tickets/redeem`（或 admin 侧核销台调用 admin 端点，R0-4 定）；防重复核销 | 一票一码；核销幂等（重复核销 409）；候补递补后同样签发 |
| R2-6 | 商城履约（§7.1-10/20 + §7.7 A6） | 商品列表/详情（`goodsCategory` 字典筛选、restock 不展示、`mallOpen`）；下单（实物必带 `addressId` → 收货快照；事务扣积分+流水+扣库存）；履约类型 `fulfillment`（physical/voucher/service）；券码下单签发 `voucherCode` + `voucherExpiresAt`（30 天）+ 过期态；`cancel`（仅实物待发货：退积分+回库存+通知）；`use`（服务权益核销）；确认收货（`finished`，见 R0-4 映射）；订单评价（1~5 星 + 文字，每单一次）；到货提醒 `POST /mall/goods/:id/restock-subscribe`（补货触发通知，admin 联动 A8） | 下单无地址 400；取消后积分库存一致；过期券不可用；评价不可重复；补货后订阅者收到通知 |
| R2-7 | 空间预约（§7.1-13 + §7.7 A7） | 列表（`status` 维护中/`maxHours`/`advanceDays`/开放时段）；`availability`（已通过预约+已发布活动占用）；提交（规则校验 + 冲突 409 + `asIdentity` 主体快照 + `asEnterpriseId` 校验 `space_reserve`）；`POST /spaces/reservations/:id/cancel`（pending/approved） | 规则外请求全部中文 400；维护中不可约；取消释放占用 |
| R2-8 | 内容与投稿（§7.1-6 + §7.7 A10） | 文章列表/详情（published + 浏览量 +1）；栏目；投稿（SU 前缀、`asEnterpriseId` 校验 `article_submit`）；`withdraw/resubmit/appeal` + `GET /me/articles/:id/payload`（回填）；点赞 toggle（防重）；评论（2-200 字 + 屏蔽用户过滤 + 举报目标） | 投稿状态机与 admin 审核联动；点赞计数正确；被屏蔽用户评论不可见 |
| R2-9 | 申请（§7.1-14） | `GET /application-form/:type`（schema 下发：settle/cooperation/individual/identity）；`POST /applications`（schema 驱动校验 + 附件（上传）+ `identityType` 绑定 → admin 审核队列）；`withdraw/resubmit` + `payload` 回填 | schema 后台可配（联动 A10）；附件类型/大小拦截；重提补充材料生效 |
| R2-10 | 首页聚合与搜索（§7.1-3 + D2/D8） | `GET /home`（精选活动/最新需求/置顶文章/未读数/站点信息/公告 `announcements`（有效期+置顶排序）/banner 运营位）；`GET /search`（全域聚合 + 分类过滤 + 计数 + 分页 cursor）；Announcement 增有效期/链接字段 | 关停/过期公告不返回；搜索分类计数与分页一致 |
| R2-11 | 通用上传（§7.1-6） | `POST /api/app/uploads`（multipart + bizType；图片/PDF 魔数嗅探；大小限制复用系统配置；返回 `{key,name,size,type,url}`） | SVG 拒绝；超限 400；url 可公开访问 |
| R2-12 | e2e 扩充 | `app-demands / app-projects / app-events / app-mall / app-spaces / app-contents / app-applications / app-home` 套件 | 全绿；覆盖边界（409/404/开关关停） |

### 2.4 R3 信任治理（P1/P2，可与 R2 并行）

| # | 工作项 | 实施要点（含缺口来源） | 验收 checklist |
|---|---|---|---|
| R3-1 | 实名认证（§7.1-18 + E8 + D-2） | `GET/PUT /me/realname`（脱敏展示；18 位校验码规则校验即时通过 + 站内信；已认证 409）；实名分级权益：权益规则下发（发布/报名额度）+ 服务端校验；`User.realName/citizenId` 已存在 | 未实名限流可验证（发布/报名额度 403/400）；脱敏口径（首字/前4后4） |
| R3-2 | 举报/申诉/屏蔽（§7.1-21 + §7.7 A9/B1） | `Report` 模型（targetType：demand/article/enterprise/comment/user）；`POST /reports` + `GET /me/reports`（状态 pending/resolved/rejected 由 admin 处置回写）；需求/投稿驳回申诉（一次性）；`UserBlock` 屏蔽名单 + 列表过滤联动 | 处置后客户端状态可见；屏蔽后内容/评论不可见；申诉不可重复 |
| R3-3 | 邀请闭环（§7.1-17/21） | `EnterpriseInvitation`（EI 前缀、7 天有效期）；invite（生成记录 + 站内信；未注册 400；重复/已是成员/自己 409）；`GET /invitations/:id`（仅被邀请人与邀请方负责人）；respond（accept 写成员 + 通知负责人 / reject）；revoke；过期态 | 非本人 403；接受后成员与关联身份即时出现；过期/撤销后不可接受 |
| R3-4 | 成员权限与企业管理（§7.1-16/17） | `UserIdentity.permissions`（8 项枚举）；`GET /me/identities`（社区个体 + 全部关联企业 + roleLabel/isContact/permissions/enterpriseId/showcaseStatus）；`GET/PUT /me/enterprises/:id`（名片字段 logo/website/services 等；`edit_card` 校验）；`PUT /me/enterprises/:id/member`（职位/手机号/权限；`manage_members`/`assign_permission`）；`remove-member`（负责人先转移）；负责人转移改**请求制**：`transfer-contact` 发起 + `GET /me/transfer-requests` + respond/cancel（接受后变更 contactUserId + 权限回收）；`exit-application`（退驻 → admin 审核 A14） | 权限矩阵全覆盖（无权限 403）；代企业主体（发布/预约/响应/投稿）四端点一致校验；转移接受后原负责人转只读成员 |
| R3-5 | 个人名片与社区（§7.1-12/16） | `GET /me/cards` + `PUT /me/cards/individual`（简历式分段 education/work/projects/honors/socials/customLinks + 年龄/政治面貌公开开关；保存→公开人才库；真实后端提交审核口径见 R0-4）；`GET /community/talents/:uid`（公开名片，头像取个人资料，按隐私开关过滤）；`GET /community/policies`（政策/服务内容，运营来源 §5 已决）；`GET /community/enterprises`（企业库 = showcaseStatus published） | 隐私开关字段对外不可见；未发布名片 404；政策版本化展示 |
| R3-6 | 协议与政策（§7.7 A3/A11） | 协议版本化管理（用户协议/隐私政策版本 + AgreementConsent 留痕）；`GET /policies/:kind`（版本化下发） | 注册必须同意且留痕版本；政策更新后可获取新版本 |
| R3-7 | 收藏（§7.1-22 + D6） | `Favorite`（targetType：demand/article/event/enterprise/talent）；`GET /me/favorites`（类型筛选）+ `toggle`（幂等去重） | 跨域收藏状态一致；重复 toggle 不产生脏数据 |
| R3-8 | e2e 扩充 | `app-realname / app-reports / app-enterprises / app-community / app-favorites` 套件 | 全绿 |

### 2.5 R4 延伸观测与切换收尾

| # | 工作项 | 实施要点（含缺口来源） | 验收 checklist |
|---|---|---|---|
| R4-1 | 积分任务中心（E4） | `PointsTask`（配置化：每日/一次性/条件任务）+ `UserTaskRecord`；`GET /me/tasks`（进度）+ `POST /me/tasks/:code/claim`（**领取幂等**、每日重置）；admin 配置联动 A16 | 领取幂等（并发/重复 409）；奖励入账流水可查 |
| R4-2 | 个人看板（E5） | `GET /me/stats`（积分/经验/需求/响应/项目/活动/签到聚合口径） | 与流水/记录统计一致 |
| R4-3 | 服务在线申请（E6） | `ServiceApplication` 模型 + `POST /service-applications` + `GET /me/service-applications`；受理流转（pending→accepted→processing→done/rejected）+ 回执 + 催办；admin 队列 A15 | 状态可回执；催办限频 |
| R4-4 | 企业工作台（E7） | `GET /me/enterprise-workbench`（企业维度聚合：需求/响应/项目/成员统计）；代企业响应/投稿已在 R2-1/R2-8 支持（`asEnterpriseId`），本项做聚合视图与鉴权收口 | 权限与企业成员一致（仅成员/负责人可看） |
| R4-5 | 实名分级权益校验收口（E8） | R3-1 权益规则在需求发布/活动报名/空间预约等写端点统一拦截（未实名限额） | 各写端点限额一致；文案统一 |
| R4-6 | 埋点（§7.1-22 + B6） | `POST /analytics/events`（12 项口径：登录/注册/发布/响应/报名/签到/下单/投稿/预约/收藏/举报/搜索）；落库 `AnalyticsEvent`；admin 看板为可选项（§3.2） | 口径与客户端 12 项一致；高频写入不阻塞业务 |
| R4-7 | 浏览历史同步（D7，可选） | `GET/POST /me/history`（增量上报/拉取/清空） | 多端合并正确；清空生效 |
| R4-8 | 客户端切换前置修复 | §7.5 遗留 2 项：`fetchEvent` ended 绕过可见范围对齐服务端语义；`restoreSession`/`getCaptcha` http 分支接统一封装 | mock 模式行为不回归 |
| R4-9 | **http 切换与全量回归** | `VITE_API_MODE=http` 全量切换；mock 快照停用；全量 app-* e2e + 既有 25 套件回归 + 移动端 Playwright 走查（64 页基线复用 v42 场景） | e2e 全绿；走查零控制台错误；mock 模式仍可切回（演示保留） |

### 2.6 Prisma 迁移清单汇总（R0 定稿，按批次执行）

**新增模型（22）**

| 批次 | 模型 | 用途 |
|---|---|---|
| R1 | UserNotification / UserNotificationPreference / Address / AgreementConsent / AccountDeletionRequest | 站内信 / 偏好 / 地址簿 / 协议留痕 / 注销冷静期 |
| R2 | DemandMessage / ProjectTask / ProjectFile / EventFeedback / EventTicket / Favorite / RestockSubscribe | 留言 / 协作 / 反馈 / 电子票 / 收藏 / 到货提醒 |
| R3 | Report / Appeal / UserBlock / EnterpriseInvitation / TransferRequest / Policy | 举报 / 申诉 / 屏蔽 / 邀请 / 转移 / 社区政策内容 |
| R4 | PointsTask / UserTaskRecord / ServiceApplication / AnalyticsEvent | 任务 / 服务申请 / 埋点 |

**字段级扩展（13 模型）**

| 批次 | 模型 | 新增字段 |
|---|---|---|
| R1 | User | （无缺字段，`passwordHash/realName/citizenId` 已有） |
| R2 | CommunityEvent | venueLat/venueLng/checkinRadiusM/checkinOpenMin/checkinCloseMin、cancelDeadlineHours、rescheduledTo（postponed 状态复用既有 cancelled 枚举位） |
| R2 | EventEnrollment | waitlisted/waitlistOrder、checkinLat/checkinLng/checkinMethod |
| R2 | Demand | demandType、deliverable/budget/deliverBy、cooperationNeed/bottleneck/partnershipMode/returnOffer、contactName/contactPhone/contactEmail、projectId |
| R2 | DemandRespondent | **userId 关联**（必加，「我的响应」依赖）、status 扩展 accepted/rejected、reviewAt/rejectReason/withdrawnAt |
| R2 | Milestone | 交付状态扩展（todo/submitted/accepted/returned）、attachments、returnReason、submitAt/acceptAt |
| R2 | MallGoods | fulfillment（physical/voucher/service）、goodsCategory（挂 goods_category 字典；旧 category 语义处置见 R0-4） |
| R2 | RedemptionOrder | voucherCode/voucherExpiresAt、trackingNo、cancelledAt、rating/reviewComment |
| R2 | Space | status（维护中）、maxHours、advanceDays、openHours |
| R2 | SpaceReservation | identityType/subjectName 主体快照、asEnterpriseId |
| R2 | Announcement | expireAt、link |
| R2 | Article | likeCount/commentCount（或聚合查询，R0-4 定） |
| R3 | Enterprise | logo/website/address/services/advantages |
| R3 | UserIdentity | permissions（8 项枚举数组） |

### 2.7 测试与验证策略

- 套件组织：`apps/api/test/app-*.e2e-spec.ts`，复用 `reseed.ts` 套件级隔离 + R1 建立的 `app-auth` helper（演示账号矩阵对齐 `apps/client-mobile/src/mock/db.ts`）。
- 必测边界：可见范围矩阵（身份×等级×空数组=不限）、候补递补、围栏/时间窗、事务原子性（积分/库存/名额）、权限矩阵（8 项成员权限 × 代企业端点）、幂等（领取/toggle/核销）、开关关停（registrationOpen/mallOpen/demandOpen/reservationOpen）。
- 回归底线：既有 25 e2e 套件（169+）保持全绿；admin 191 端点行为不回归（R1-1 分流验证）。

## 3. admin 面板对齐规划

> 实施约定：每个面板项遵循「API 端点（admin 侧）→ 权限点（`src/constants/permissions.ts` 目录扩展 + RBAC）→ 视图/组件（TDesign Vue Next）→ 菜单/路由（AdminLayout + router，保持菜单组顺序）→ UI contract 测试」；术语遵循 AGENTS.md（审核/新增/归档/联系电话…）；列表页无批量操作与刷新按钮、ColumnController 纳入、软删域接归档体系。
> 统一检查方法：`pnpm --filter @joinyuu/admin exec tsc -p tsconfig.json --noEmit` + `pnpm build:admin` + `test:ui`；验收 = 与对应 API 能力联调后闭环（A 项编号 ↔ §2 批次项）。

### 3.1 必做项（A1~A18，随批次实施）

| # | 面板项 | 实施要点 | 对应 API/批次 | 验收 checklist |
|---|---|---|---|---|
| A1 | 活动签到配置（§7.2-1，P0） | `EventFormDialog` + `EventPayload` 增场地坐标（经纬度手输）、签到半径、时间窗、取消时限字段；活动详情展示 | R2-4 | 配置后客户端签到围栏/时间窗生效 |
| A2 | 签到名单标识（§7.2-2，P1） | 活动详情签到 Tab 增签到方式（自助/补签）、距离与坐标展示 | R2-4 | 名单可区分方式；距离展示与记录一致 |
| A3 | 电子票核销台（E1，P1） | 活动详情新增「票务核销」入口：输码/扫码核销、防重提示、名单导出（CSV） | R2-5 | 重复核销被拒；导出与名单一致 |
| A4 | 订单发货增强（§7.2-3 + B4/D4，P1） | 发货弹窗录入运单号（支持批量）；订单详情展示收货地址快照；发货前校验地址；发货/取消触发用户站内信 | R2-6 | 无地址不可发货；C 端可见单号；站内信送达 |
| A5 | 举报/申诉处理（B1，P1） | 新面板「举报与申诉」（系统管理组或新治理组）：举报队列（targetType 筛选/目标跳转/下架恢复/处置理由/状态回写通知举报人）+ 需求/投稿申诉复核 | R3-2 | 处置后客户端状态与内容状态一致 |
| A6 | 注销与实名治理（B2，P1） | 注销工单列表（冷静期倒计时/确认执行/驳回）+ 实名记录复核视图（降级实现下的异常复核入口） | R1-7 / R3-1 | 注销冷静期满可执行；复核动作留审计 |
| A7 | 活动候补与反馈（B5，P1） | 报名名单区分正式/候补与顺序；活动反馈汇总（评分均值/评论列表） | R2-4 | 候补顺序与递补记录一致；反馈一人一条 |
| A8 | 补货提醒联动（B3，P1） | 补货（改库存/上下架）触发订阅者站内信；订阅数展示（订阅名单视图可选 §3.2） | R2-6 | 补货后订阅者收到通知 |
| A9 | 需求类型展示（§7.2-6，P1） | 需求列表/审核/详情/发布页展示 demandType 标签与专属字段（找服务/找投资/找合作） | R2-1 | 三类专属字段完整展示；筛选支持 |
| A10 | 申请表单字段配置（§7.2-5，P1） | 新面板「申请表单配置」：各申请类型 schema 编辑（字段类型/必填/选项/顺序/上传项），下发给客户端 | R2-9 | 配置变更后客户端表单即时生效 |
| A11 | 活动改期（D1，P1） | 活动管理补「改期」操作（新时间 + 原因 + 批量通知报名者）；已有取消/恢复保持 | R2-4 | 改期后 C 端横幅/通知联动 |
| A12 | 公告有效期（D2，P1） | 公告表单增有效期与跳转链接；过期自动不下发 | R2-10 | 过期公告 C 端不返回 |
| A13 | 商品分类挂类（D3，P1） | 商品表单挂 `goods_category` 字典分类（含 MallGoods 字段调整，R0-4 方案） | R2-6 | C 端分类筛选与字典联动 |
| A14 | 企业退驻审核（§7.1-16，P2） | 企业详情/列表新增退驻/注销申请审核入口（通过→企业状态变更；驳回→通知） | R3-4 | 退驻闭环状态一致 |
| A15 | 服务申请受理（E6，P1） | 新面板「服务申请」：受理队列、派单、状态回执、催办记录 | R4-3 | 状态回执 C 端可见 |
| A16 | 积分任务配置（E4，P1） | 新面板「积分任务」：任务规则配置（类型/条件/奖励/启停）+ 发放对账（流水按任务来源过滤） | R4-1 | 领取记录与流水对得上 |
| A17 | 实名分级权益配置（E8，P2） | 权益规则配置面板（各等级/实名状态的发布与报名额度） | R3-1 / R4-5 | 调整后 C 端限额即时生效 |
| A18 | 社区政策内容管理（§0.5 决策落地，P1） | 新面板「社区服务内容」（内容管理组）：政策/指引的分类、版本化、附件、精选、发布（Policy 模型） | R3-5 | 政策增改后 C 端社区服务 Tab 联动 |

### 3.2 可选项（登记不排期，随 API 落地后评估）

站内信运营视图（按用户查询/系统群发，§7.2-4）、企业邀请/转移记录只读视图（B2 后半）、收藏数据看板（D6）、埋点漏斗看板（B6）、企业响应审核（E7 选做）、候补顺序人工调整（B5 选做）、个人维度看板（E5 选做）、订阅名单视图（B3 选做）。

## 4. 客户端切换与回归（R4 收口，前置清单）

1. R4-8 先行：§7.5 两项遗留修复（http 分支统一封装接入）。
2. 每批 API 落地后可选做局部 http 走查（按域）；全量切换仅 R4-9 一次。
3. R4-9：`VITE_API_MODE=http` → 全量 app e2e → 25+ 既有套件回归 → 移动端 Playwright 走查（复用 v42 64 页场景基线）→ 勾选 `full-spec-check.md` M2-R。
4. mock 模式保留为演示通道（不删除 `src/mock/`），文档注记双模式共存口径。

## 5. 开放问题（R0 逐条定稿）

| # | 问题 | 推荐方案（R0 评审确认） | 状态 |
|---|---|---|---|
| Q1 | MallGoods.category 语义冲突（后端=履约类型，客户端=GC 字典） | 增 `fulfillment` + `goodsCategory` 两字段；旧 `category` 数据迁移映射到 fulfillment，admin A13 跟进 | 待定 |
| Q2 | 订单终态 completed（客户端）vs finished（后端） | 后端维持 `finished`；客户端 http 层做状态映射（零迁移，UI 不动） | 待定 |
| Q3 | 社区政策/服务内容运营来源（§0.5 遗留） | 新建 `Policy` 模型 + admin A18 内容面板（政策有版本/附件/精选语义，不复用 Announcement） | 待定 |
| Q4 | 电子票核销码算法（D-2 降级） | HMAC-SHA256(eventId+ticketId+serverSecret) 截断 8 位，确定性可复现、防猜测；核销走 admin 端点（A3）+ app 自助签到互斥口径（check-in 成功即核销 or 独立，R0 定） | 待定 |
| Q5 | 短信降级形态 | 找回密码/换绑复用图形验证码；企业邀请未注册手机号维持 400（文案提示先注册），短信接口位留 `SmsService` 空实现 | 待定 |
| Q6 | 默认地址删除语义 | 删除默认地址时自动转移至最新地址（或置空并在下单强制选择，倾向前者） | 待定 |
| Q7 | 点赞/评论计数存储 | 冗余计数列（Article.likeCount/commentCount，写时事务更新）vs 聚合查询；倾向冗余列（列表页性能） | 待定 |
| Q8 | 个人名片「保存即公开」vs 审核流 | 客户端 mock 为保存即公开；真实后端建议个人名片免审核（字段可见性由隐私开关控制）、企业名片走 showcaseStatus 审核流 | 待定 |

## 6. 修订记录

| 日期 | 摘要 |
|---|---|
| 2026-09-16 | 初版：M2-R 立项规划——四项决策（全量分批/降级实现/必做全做/独立文档）；R0~R4 五批后端对齐表（22 新模型 + 13 模型字段扩展 + 约 110 端点）、admin A1~A18 必做 + 可选项登记、8 项开放问题待 R0 定稿；基于 v43 客户端 / api 43 模型 / admin 16 视图目录现状调研 |
