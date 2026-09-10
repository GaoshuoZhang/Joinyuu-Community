# 聚屿社区 · 后端服务 — 开发 Wiki

> 本文档沉淀 M1 后端服务（NestJS + PostgreSQL + Redis）的架构契约、数据模型、API 清单与业务规则，是所有后端模块开发的唯一依据。
> 契约来源：M0 冻结的 `apps/admin/src/types/index.ts` 实体模型 + `apps/admin/src/api/` 全部 stub 的 TODO 注释（API Stub 即接口契约）。
> 与 [wiki-admin-web.md](./wiki-admin-web.md) 同级：admin wiki 管前端契约，本文档管后端契约；两者冲突时以 M0 冻结代码为准并提出修订。
> 已确认的三项基础决策（2026-09-10）：**ORM = Prisma**；**M1 范围 = 后端 + admin 全量接入真实接口**（`/api/app/**` 仅设计不实现）；**主键 = 前缀字符串 ID（U1001/E2001/...）**。

## 1. 定位与范围

**M1 目标**：以 M0 冻结的实体模型与 API 形状为契约，实现 NestJS 后端服务，并将 admin web 全量从 Mock 切换到真实 HTTP 接口。

**范围内**：

- `apps/api`：NestJS 11 + Prisma 6 + PostgreSQL 17 + Redis 7.4 的后端应用（Monorepo 内新包）
- `/api/admin/**` 全量端点（约 129 个，见第 7 节清单）——与 admin stub 函数一一对应
- 管理端认证（JWT + 登出黑名单）、审计日志服务端化、业务事件驱动通知、定时任务（定时发布/活动结束/租约临期）
- 积分/经验发放引擎（按规则 code 触发，事务写流水）
- admin web 接入：`src/api/` 层 HTTP 化改造（函数签名不变，视图零改动），分域切换后删除 mock
- 种子数据：从 M0 mock 迁移，保持全部编号与跨模块引用一致
- `/api/app/**` 客户端接口**仅输出设计文档**（M1-E 交付 `docs/api-app-design.md`），不实现

**范围外**（留给 M2/M3）：客户端 Web、微信小程序、微信登录、支付、文件上传、CI/CD、分布式部署。

## 2. 技术栈与工程结构

| 层 | 选型（版本冻结） |
|---|---|
| 框架 | NestJS 11 + `@nestjs/schedule`（定时任务）+ `@nestjs/jwt` |
| ORM | Prisma 6（`@prisma/client` + `prisma migrate`） |
| 数据库 | PostgreSQL 17（Docker） |
| 缓存 | Redis 7.4（Docker，ioredis 客户端） |
| 校验 | class-validator + class-transformer（全局 ValidationPipe） |
| 密码 | bcryptjs（纯 JS 实现，规避 Windows 原生编译问题） |
| 时间 | day.js（`Asia/Shanghai` 时区格式化） |
| 测试 | Jest（Nest 默认）+ supertest（e2e 冒烟） |

**目录结构**（`apps/api/`）：

```
apps/api/
  prisma/
    schema.prisma        # 全量实体建模（见第 5 节）
    migrations/          # prisma migrate 产出
    seed.ts              # M0 mock 迁移种子（见第 11 节）
  src/
    main.ts
    app.module.ts
    common/              # prisma.service / redis.service / filters / interceptors / decorators
    modules/
      auth/              # 登录/登出/JWT Guard
      users/             # 用户 + 社区个体（含身份 identities）
      enterprises/       # 社区企业
      external-enterprises/  # 外部企业聚合视图 + 档案
      applications/      # 入驻/身份绑定审批
      demands/           # 需求（含代报名/立项）
      projects/          # 项目（承接方/里程碑/状态机）
      events/            # 活动（发布/报名/签到/状态机）
      ledgers/           # 经验值/积分流水与手动调整
      mall/              # 商品/兑换订单/积分规则
      rules/             # 经验值规则/等级梯度/发放记录
      workstations/      # 工位/区域/租约
      spaces/            # 公共空间/预约审批/使用看板
      contents/          # 文章/栏目/展示页申请/公告
      system/            # 系统配置/数据字典/审计日志查询/通知中心
      dashboard/         # 工作台聚合 + 统一待办
    engine/              # points-engine（积分/经验发放）/ id-generator（前缀 ID 序列）
    scheduler/           # 定时任务（定时发布、活动结束、租约临期通知）
```

**Monorepo 命令**（根 `package.json` 新增）：

```bash
pnpm db:up          # docker compose -f apps/api/docker-compose.dev.yml up -d --wait（等待健康检查）
pnpm db:down        # 停止并删除容器（保留数据卷）
pnpm dev:api        # 启动 NestJS dev（端口 7757）
pnpm build:api      # Nest 生产构建
pnpm db:migrate     # prisma migrate deploy（非交互应用已有迁移）
pnpm db:migrate:dev # prisma migrate dev --name xxx（开发者创建新迁移时手动执行，交互式）
pnpm db:seed        # tsx prisma/seed.ts（幂等：清空后全量重建）
pnpm db:reset       # prisma migrate reset --force（drop + migrate + seed，一键验证）
```

## 3. 开发环境（Windows 11 + Docker Desktop）

- 本机已有：Windows 11、Docker Desktop、Node 24、pnpm 10。
- `apps/api/docker-compose.dev.yml`：

```yaml
services:
  postgres:
    image: postgres:17-alpine
    container_name: joinyuu-pg
    ports: ["5432:5432"]           # 本机 5432 被占用时改 55432:5432 并同步 .env
    environment:
      POSTGRES_USER: joinyuu
      POSTGRES_PASSWORD: joinyuu
      POSTGRES_DB: joinyuu
    volumes: [joinyuu-pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U joinyuu"]
      interval: 5s
      timeout: 3s
      retries: 10
  redis:
    image: redis:7.4-alpine
    container_name: joinyuu-redis
    ports: ["6379:6379"]           # 被占用同理改 56379:6379
    volumes: [joinyuu-redisdata:/data]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  joinyuu-pgdata:
  joinyuu-redisdata:
```

- `apps/api/.env`（不入库，提供 `.env.example`）：

```
# 注意：Windows + Docker Desktop 下 IPv6 loopback（::1）端口转发不可靠（Prisma Rust 引擎解析 localhost 优先 IPv6 会 P1001），一律用 127.0.0.1
DATABASE_URL="postgresql://joinyuu:joinyuu@127.0.0.1:5432/joinyuu?schema=public"
REDIS_URL="redis://127.0.0.1:6379"
JWT_SECRET="dev-only-change-me"
PORT=7757
TZ=Asia/Shanghai
```

- **端口约定**：admin dev **7758**、API dev **7757**；两者均监听 `0.0.0.0`，同一局域网内其他设备可通过 `http://<本机局域网IP>:7758`（admin）与 `http://<本机局域网IP>:7757`（API 直连）访问；admin 通过 Vite dev proxy 访问 API（`apps/admin/vite.config.ts` 的 `server.proxy: { '/api': 'http://127.0.0.1:7757' }`），开发期无 CORS 问题；API 侧仍开启 CORS 以备直连调试。
- Windows 注意：Prisma generate/migrate 在 PowerShell 下直接可用；换行符遵循仓库现状（git autocrlf）；禁止在命令行里内嵌多行 TS 模板字符串（历史上多次转义事故，见 `.workbuddy/memory`）。

## 4. 全局架构约定

### 4.1 响应包络（冻结）

- 成功：HTTP 200/201，body `{ code: 0, data: T, message?: string }`；`data` 形状与 M0 stub 返回值完全一致（列表为 `{ list, total }`，写操作为 `{ code: 0 }` 或带附加字段，如积分调整 `{ code: 0, balance }`）。
- 失败：HTTP 状态码（400 校验/业务规则、401 未登录、404 资源不存在、409 状态机冲突、500 未知），body `{ code: <业务码，默认同 HTTP 状态>, message: '中文错误提示' }`。
- **`message` 必须直接可展示**——admin 视图层统一 `catch (e) → MessagePlugin.error(e.message)`，错误文案口径与 M0 mock 抛出的中文 Error 一一迁移（如"仅待发布的需求可立即发布"）。
- 时间字段统一 **String 存储**（M0 原生三种格式：`YYYY-MM-DD HH:mm` 时刻 / `YYYY-MM-DD` 日期 / `YYYY-MM` 年月，VarChar(16)）：单时区运营、字符串字典序即时间序（比较/排序/定时扫描均安全）、与 M0 契约逐字节一致、种子迁移零转换；`timestamptz` 推迟到出现真实跨时区需求时再迁移。系统内部字段（AdminUser.createdAt/updatedAt）不受此约束，仍用数据库原生 DateTime。

### 4.2 Nest 模块约定

- Controller 只做参数提取 + 调 Service + 包络返回；业务规则全部在 Service；数据访问统一经 `PrismaService`（不写裸 SQL，聚合视图可用 `$queryRaw`）。
- DTO 按端点声明，class-validator 规则与 M0 mock 内联校验一致（必填/正整数/合计 100% 等）。
- 全局注册：`ValidationPipe({ transform: true, whitelist: true })`、`HttpExceptionFilter`（统一包络）、`LoggingInterceptor`（请求日志）、`AuditInterceptor`（见第 9 节）。
- 跨域复用逻辑沉淀到共享 Service：`PointsEngineService`（积分/经验发放）、`NotificationService`（通知写入）、`AuditService`（审计写入）、`IdGeneratorService`（前缀 ID）。

### 4.3 分页与筛选约定

- 列表端点统一 query：`page`（1 起）、`pageSize`、`keyword`（模糊，匹配字段以第 7 节表为准）、领域筛选项、排序 `sortBy`/`sortOrder`（`ascend | descend`，descend=最新在前为默认）。
- 返回 `{ list, total }`；服务端排序口径与 M0 mock 排序函数逐条一致（含 `publishedAt` 空值排最后等细节）。

## 5. 数据模型（Prisma Schema 建模规则）

### 5.1 建模总则

- **主键 = 前缀字符串**（`@id String @db.Char(16)`），由 `IdGeneratorService` 发号：`id_sequences` 表（`entityType` PK + `nextNumber`）事务内 `UPDATE ... RETURNING` 原子自增；**禁止 MAX(id) 取号**（mock 写法，并发不安全）。编号与 M0 前缀一一对应（U/E/AP/D/P/EV/XE/EX/PT/G/RO/WS/WA/LS/S/SR/A/CL/SC/AN/N/AL）。
- **快照字段保留为列，不外键化**（M0 冻结口径）：`demand.publisherName`、`project.undertakers[].name`、`reservation.spaceName`、`order.goodsName`、`article.columnName`、`lease.enterpriseName` 等展示快照不随源数据改名而变；但关联导航字段（`publisherId`、`columnId`、`goodsId`）同时落列，可关联查询。
- **内嵌数组拆表**：`User.identities` → `identities` 表；`Demand.respondents`、`Project.undertakers/milestones`、`Event.enrollments` → 独立子表；`Lease.workstationIds` → `lease_workstations` 关联表（保留终止后的历史归属）。
- **JSONB 承载半结构数据**：`Application.details/records`、`Reservation.records`、`ShowcaseRequest.records`（ApprovalRecord 时间线）、`Demand.publisherIdentity` / `Article.authorIdentity`（身份快照）、`User.activities`（活跃记录，纯展示追加）、`Space.equipment` / 各实体 `tags`（`String[]`）。
- **派生值不落列**（M0 明确口径）：用户实名状态（realName+citizenId 均填）、用户 stats（详情接口实时 COUNT）、租约 expiring/expired（读取派生）、"个人用户"筛选（仅持 individual 身份）。
- 金额/积分为整数（分或元按 M0 现状：租金/预算为元字符串或整数、积分为整数）；枚举一律 String + 应用层枚举校验（保持与前端字符串契约一致，不用 PG enum，降低迁移摩擦）。

### 5.2 表清单（35 模型）

| 分组 | Prisma 模型 | 主键前缀 | 要点 |
|---|---|---|---|
| 认证 | AdminUser | 自增 | username 唯一、passwordHash（bcryptjs）、name（展示名"社区管理员"）；种子 admin/admin123 |
| 成员 | User | U | uid 昵称 nickname、phone/email/gender/status(active/frozen)、realName?/citizenId?（实名派生）、wechatOpenid?/wechatUnionid?/wechatVerified?（M3 预留）、frozenUntil?/frozenReason?（解冻清空）、points（挂靠个人身份）、registeredAt/lastActiveAt、bio、activities Json |
| 成员 | UserIdentity | 自增 | userId FK + type(individual/community_individual/community_enterprise/external_enterprise) + enterpriseId?/enterpriseName?/role?/title/level?/experience?；唯一约束 (userId, type, enterpriseId)；社区个体每人至多一条（应用层保证） |
| 成员 | Enterprise | E | industry/stage/size/foundedAt/settledAt/leaseType/status(active/pending/exited)/showcaseStatus(none/pending/published/rejected)/showcaseComment?/experience?/contact*/description/tags |
| 成员 | ExternalEnterpriseProfile | XE | 外部企业档案（name/industry/description/cooperationCount/firstCooperationAt）；**ExternalEnterprise 聚合视图 = 档案 + identities(type=external_enterprise 且 enterpriseName 匹配) 派生成员，不建独立表** |
| 审批 | Application | AP | type(settle/identity)/applicantName/applicantPhone/targetName/submittedAt/status/summary/details Json/records Json；通过时授予身份（见 8.6） |
| 需求 | Demand | D | 状态机字段 + publisherId/publisherName/publisherIdentity(Json)/contactName?/contactPhone?/contactEmail?/budget/period/deadline/scheduledAt?/publishedAt?/visibilityIdentities[]/visibilityLevels[]/enrollmentIdentities[]/enrollmentLevels[]/respondPoints?/rejectedReason?/projectId?/tags[] |
| 需求 | DemandRespondent | 自增 | demandId FK + name/enterprise/phone?/email?/quote?/message/at/status(pending/contacted/closed) |
| 项目 | Project | P | code（JY-YYYY-NN）/status(running/paused/closed/finished)/progress/startDate/endDate/initiatedAt/description/memberCount/sourceDemandId?/expReward?/closeReason? |
| 项目 | ProjectUndertaker | 自增 | projectId FK + type(enterprise/individual/custom)/refId(企业或用户 ID)/name(展示快照)/share/contactName?/phone?；合计=100 应用层校验 |
| 项目 | Milestone | 自增 | projectId FK + name/status(done/active/todo)/date/owners String[]（承接方展示名） |
| 活动 | CommunityEvent | EV | 状态机字段 + createdAt/startTime/endTime/location/capacity/speaker/host/enrollmentOpen/visibility*/enrollment*/requireReview/enrollmentDeadline?/scheduledAt?/enrollPoints?/checkinPoints?/tags[] |
| 活动 | EventEnrollment | 自增 | 复合唯一 (eventId, userId)；userId/name/enterprise/phone/appliedAt/status(pending/approved/rejected)/checkedIn/checkInAt? |
| 账本 | ExperienceRecord | EX | targetType(enterprise/individual)/targetId/delta/balance/reason/at/operator/source(rule/manual) |
| 账本 | PointsRecord | PT | userId FK/delta/balance/reason/at/operator/source(rule/manual/redemption) |
| 商城 | MallGoods | G | name/category(physical/virtual/voucher)/points/stock/status(on/off)/description/redeemedCount/createdAt |
| 商城 | RedemptionOrder | RO | userId/userName(快照)/goodsId/goodsName(快照)/points/status(pending_shipment/shipped/finished/cancelled)/createdAt/shippedAt?/finishedAt?/recipientName?/recipientPhone?/address?/note?/cancelReason? |
| 规则 | PointsRule | code（PK） | 8 条固定触发项（见 8.4）；name/scene/description 写死；points 可编辑；status |
| 规则 | ExperienceRule | code（PK） | 5 条固定触发项；同上 |
| 规则 | LevelTier | level（PK） | label/threshold；整组保存、逐级递增校验、1-10 级 |
| 空间 | WorkstationArea | WA | name 唯一/type(open/office/semi)/description/createdAt |
| 空间 | Workstation | WS | seatNo 全岛唯一/**areaId FK**（M0 存名称字符串，M1 改外键——读取时 join 出 area 名，区域改名无需级联）/type/capacity/status(idle/assigned/maintenance)/enterpriseId?/enterpriseName?/leaseId?（assigned 时）/defaultMonthlyRent?/areaSqm?/note? |
| 空间 | Lease | LS | renterId(enterprise=企业 ID/individual=用户 ID/custom 空)/renterName 快照/renterType/startDate/endDate(longTerm=true 时空串)/longTerm/status(active/terminated)/monthlyRent/rentPeriod(day/week/month/year，缺省 month)/contactName/contactPhone/terminatedAt? |
| 空间 | LeaseWorkstation | 复合 (leaseId, workstationId) | 关联表保留历史；工位当前占用由 Workstation.leaseId 表达 |
| 空间 | Space | S | name/type(meeting/roadshow/meeting_room/multi/study)/capacity/location/openTime/closeTime/allDay?/needReservation?/needApproval?/equipment String[]/status(available/maintenance/disabled)/description |
| 空间 | SpaceReservation | SR | userId/userName 快照/phone/spaceId/spaceName 快照/date/startTime/endTime/purpose/attendees/status(pending/approved/rejected/cancelled)/submittedAt/records Json/rejectReason? |
| 内容 | Article | A | title/columnId/columnName 快照/authorId/authorName/authorIdentity Json/status(draft/pending/published/withdrawn/rejected)/publishedAt?/views/summary/tags/createdAt/rejectedReason? |
| 内容 | ArticleColumn | CL | name/description/sort/status(enabled/disabled)/createdAt |
| 内容 | ShowcaseRequest | SC | targetType(enterprise/individual)/targetId?/targetName/contentSummary/submitterName/submitterPhone/submittedAt/status/records Json/rejectReason? |
| 内容 | Announcement | AN | title/content/pinned/status(published/withdrawn)/publishedAt/createdAt/updatedAt? |
| 系统 | AdminNotification | N | type(approval/demand_review/reservation/showcase/article/lease/schedule)/title/content/at/read/link? |
| 系统 | AuditLog | AL | operator/module/action/target/detail?/at + **M1 新增 ip String?/before Json?/after Json?**（变更前后快照） |
| 系统 | SystemConfig | 单例(id=1) | siteName/siteSlogan/registrationOpen/mallOpen/demandOpen/reservationOpen/dailyLoginPoints/leaseExpireRemindDays(1-90)/updatedAt/updatedBy |
| 系统 | DictEntry | 复合 (type, code) | type(demand_category/industry/event_type)/code(DC/IN/ET 前缀自增)/label 全类型唯一/sort/status(enabled/disabled) |
| 系统 | IdSequence | entityType（PK） | 前缀 ID 发号器（见 5.1） |

## 6. 认证与权限

- **登录**：`POST /api/admin/auth/login`（username/password）→ 校验 AdminUser（bcryptjs compare）→ 签发 JWT（payload：sub=username、name，有效期 2h）。返回 `{ token, name }`。
- **登出**：`POST /api/admin/auth/logout` → 将当前 jti 写入 Redis 黑名单（`auth:blacklist:<jti>`，TTL=剩余有效期）→ `{ code: 0 }`。JWT payload 增加 `jti`（uuid）。
- **Guard**：全局 `JwtAuthGuard` 挂 `/api/admin/*`（`APP_GUARD`），`@Public()` 装饰器豁免 login 与 `GET /api/health`。校验签名 + 黑名单。
- **权限模型**：M1 仅单管理员角色（AdminUser 表已为多账号预留）；RBAC 留 M2。
- admin 前端沿用 localStorage key `joinyuu_admin_token` 存 JWT，请求头 `Authorization: Bearer <token>`；401 时统一跳登录页（axios 拦截器）。
- 审计 operator、审批记录 operator、手动调整流水的 operator 一律取 JWT `name`（M0 固定"社区管理员"的服务端替代）。

## 7. REST API 清单（冻结契约）

> 以下端点 = `apps/admin/src/api/` 全部 TODO 注释 + 冻结状态机的汇总，路径/入参/返回形状**不可自行变更**；新增端点须先修订本文档。
> 通用：列表分页/排序约定见 4.3；写操作成功均按第 9 节映射写审计；所有"仅 XX 状态可操作"为服务端 409 校验。

### 7.1 认证 auth（2）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/admin/auth/login | `{ username, password }` → `{ token, name }`；错误 401"账号或密码错误，请重新输入" |
| POST | /api/admin/auth/logout | 登出（Redis 黑名单）→ `{ code: 0 }` |

### 7.2 用户与社区个体 users / individuals（6）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/users | query：page/pageSize/keyword(昵称/uid/phone)/status/category(individual=仅基础身份、community_individual、community_enterprise、external_enterprise)/realStatus(verified=realName+citizenId 齐全) |
| GET | /api/admin/users/:id | 详情；stats 由 demands/projects/events 实时 COUNT（口径：projects=个人承接或其社区企业承接） |
| PATCH | /api/admin/users/:id/status | `{ status }`；active 时清空 frozenUntil/frozenReason |
| POST | /api/admin/users/:id/freeze | `{ until?, permanent, reason }`；permanent=false 需 until；reason 必填；已 frozen 报错 |
| GET | /api/admin/users/options | `[{ label: "昵称（uid）", value }]`（代提交需求候选） |
| GET | /api/admin/individuals | 社区个体=持 community_individual 身份的用户；query：page/pageSize/keyword/status |

### 7.3 社区企业 enterprises（5）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/enterprises | query：page/pageSize/keyword(名称/ID)/industry/status |
| GET | /api/admin/enterprises/options | `[{ label, value }]`（与 M0 fetchEnterpriseOptions 一致） |
| GET | /api/admin/enterprises/:id | 详情含成员列表（由 identities 派生：type=community_enterprise 且 enterpriseId 匹配，展示 realName‖nickname） |
| PATCH | /api/admin/enterprises/:id/showcase-status | `{ status: pending/published/rejected, comment? }`（展示页审核；rejected 必填 comment） |
| GET | /api/admin/enterprises/:id/stats | 数据概览：需求发布量（publisherIdentity.enterpriseId 匹配）/项目承接量（undertaker 匹配） |

### 7.4 外部企业 external-enterprises（3）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/external-enterprises | 聚合视图（档案 + 派生成员）；query：page/pageSize/keyword/industry/sortBy(cooperationCount/firstCooperationAt) |
| GET | /api/admin/external-enterprises/:id | 详情含关联成员（external_enterprise 身份 enterpriseName 匹配档案名） |
| GET | /api/admin/external-enterprises/:id/stats | 需求（publisherIdentity.enterpriseName 匹配）/项目（成员以个人身份承接） |

### 7.5 申请审批 applications（3）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/applications | 仅 settle/identity 两类；query：page/pageSize/type/status |
| POST | /api/admin/applications/:id/approve | `{ comment }`；通过 → 授予申请人身份（见 8.6）+ 企业联动创建/激活 |
| POST | /api/admin/applications/:id/reject | `{ comment }` |

### 7.6 需求 demands（15）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/demands | query：page/pageSize/keyword(标题/ID)/category/status/publisherId(用户详情跳转)/enterprise(社区企业按 enterpriseId、外部企业按档案名)/sortBy(createdAt 默认、publishedAt 空值排最后、id)/sortOrder |
| GET | /api/admin/demands/:id | 详情含 respondents |
| POST | /api/admin/demands | DemandCreatePayload（publisherType: individual/enterprise/custom + publisherId + 表单字段）；**创建即 pending_release**；publisherIdentity 快照按 8.7 解析；预算未填自动"面议" |
| PUT | /api/admin/demands/:id | 编辑（pending_release/published 可用，不改状态） |
| POST | /api/admin/demands/:id/approve | pending → pending_release |
| POST | /api/admin/demands/:id/reject | `{ reason }` 必填 → rejected |
| POST | /api/admin/demands/:id/publish-now | pending_release → published（写 publishedAt，触发积分 demand_published 发放，见 8.4） |
| POST | /api/admin/demands/:id/schedule | `{ scheduledAt }`：pending_release → scheduled |
| POST | /api/admin/demands/:id/cancel-schedule | scheduled → pending_release |
| POST | /api/admin/demands/:id/retract | published → pending_release（清 publishedAt/scheduledAt） |
| PATCH | /api/admin/demands/:id/status | `{ status: "closed" }`（仅 pending_release 可关闭，M0 修订口径） |
| POST | /api/admin/demands/:id/proxy-respond | `{ userName, enterprise, phone, email?, quote?, message }`（仅 published/projected；message 空记"管理员代报名"） |
| POST | /api/admin/demands/:id/initiate-project | ProjectInitPayload；创建项目 + 双向关联（demand.projectId ↔ project.sourceDemandId）→ projected；触发积分 demand_undertaken（见 8.4） |
| GET | /api/admin/demands/undertaker-options | 承接方候选（社区企业 + 外部企业 + 社区个体/个人用户，value=`enterprise:E*`/`enterprise:XE*`/`individual:U*`） |
| GET | /api/admin/publisher-options | `{ users: [...], enterprises: [...] }` 含联系方式（自动填充用） |

### 7.7 项目 projects（7）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/projects | query：page/pageSize/keyword(名称/code)/status/participant(个人承接或其社区企业承接)/enterprise(社区企业按承接方 ID；外部企业按成员个人承接)/sortBy(initiatedAt 默认、id)/sortOrder |
| GET | /api/admin/projects/:id | 详情含 undertakers/milestones |
| POST | /api/admin/projects | ProjectInitPayload（承接方≥1、share 合计 100、custom 需 name/contactName/phone）；创建即 running、progress=0、code=`JY-YYYY-NN` 按年递增 |
| PUT | /api/admin/projects/:id | 编辑（全部状态可编辑，finished 除外——前端禁用；不改状态/编号/已完成里程碑，里程碑整体重置为 todo） |
| POST | /api/admin/projects/:id/pause | running → paused |
| POST | /api/admin/projects/:id/resume | paused → running |
| POST | /api/admin/projects/:id/close | `{ reason }` 必填；paused → closed（M0 修订：仅 paused 可关闭） |

> 注：pause/resume/close 在 M0 stub 中无 TODO 注释但为冻结状态机契约（wiki-admin-web.md §项目状态机）；结项 finished 由里程碑全部达成驱动（M1 实现：全部 milestone=done 时置 finished 并按 8.5 分配经验值）。

### 7.8 活动 events（12）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/events | query：page/pageSize/keyword(标题/ID)/type/status/participant(报名记录含该用户)/sortBy(id 默认倒序、startTime、createdAt)/sortOrder |
| GET | /api/admin/events/:id | 详情含 enrollments（到点状态流转先行派生） |
| POST | /api/admin/events | 创建即 pending_release、enrollmentOpen=false；表单无定时发布选项 |
| PUT | /api/admin/events/:id | 编辑（pending_release 可编辑；published 可编辑但不动状态/已有报名；scheduled/ended/cancelled 不可） |
| POST | /api/admin/events/:id/publish-now | pending_release → published + enrollmentOpen=true |
| POST | /api/admin/events/:id/schedule | `{ scheduledAt }`：pending_release → scheduled |
| POST | /api/admin/events/:id/cancel-schedule | scheduled → pending_release |
| PATCH | /api/admin/events/:id/enrollment | published 状态切换 enrollmentOpen（报名中/暂停报名） |
| POST | /api/admin/events/:id/cancel | pending_release/published → cancelled |
| POST | /api/admin/events/:id/restore | cancelled → pending_release |
| POST | /api/admin/events/:id/enrollments/:userId/review | `{ status: approved/rejected }`；approved 触发积分 activity_enroll_approved（报名积分 = enrollPoints ?? 规则值） |
| POST | /api/admin/events/:id/checkin | `{ userId }`；签到触发积分 activity_checkin + 经验 activity_checkin（签到积分 = checkinPoints ?? 规则值） |

### 7.9 账本 ledgers（4）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/experience-records | query：targetType(enterprise/individual)/targetId；最新在前 |
| POST | /api/admin/experience-records | body `{ targetType, targetId, delta, reason }`：非零整数；扣减不致负；写流水（source=manual、operator=登录管理员）；返回 `{ code: 0, balance }` |
| GET | /api/admin/points-records | query：userId；最新在前 |
| POST | /api/admin/points-records | body `{ userId, delta, reason }`：同上；积分挂靠用户（个人身份）；返回 `{ code: 0, balance }` |

### 7.10 商城 mall（12）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/mall/goods | query：page/pageSize/keyword(名称/ID)/category/status/sortBy(id 默认倒序、points、createdAt)/sortOrder |
| POST | /api/admin/mall/goods | 创建即上架（on）、redeemedCount=0 |
| PUT | /api/admin/mall/goods/:id | 编辑（不影响已有订单） |
| POST | /api/admin/mall/goods/:id/toggle-status | 上架↔下架 |
| GET | /api/admin/mall/redemption-orders | query：page/pageSize/keyword(用户名/商品名/ID)/status/sortBy(id 默认、createdAt)/sortOrder |
| POST | /api/admin/mall/redemption-orders/:id/ship | pending_shipment → shipped |
| POST | /api/admin/mall/redemption-orders/:id/finish | shipped → finished |
| POST | /api/admin/mall/redemption-orders/:id/cancel | 仅 pending_shipment；**事务**：退回积分（写 source=redemption 流水）+ 库存回补 + redeemedCount-1 + 记 cancelReason |
| GET | /api/admin/mall/points-rules | 8 条固定项按 code 排序 |
| PUT | /api/admin/mall/points-rules/:code | `{ points }` 正整数；name/scene/description 不可改 |
| POST | /api/admin/mall/points-rules/:code/toggle-status | 启用↔停用 |
| GET | /api/admin/mall/points-issuance | 仅 source=rule 的积分流水（发放记录页） |

### 7.11 规则 rules（6）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/rules/experience | 5 条固定项按 code 排序 |
| PUT | /api/admin/rules/experience/:code | `{ exp }` 正整数 |
| POST | /api/admin/rules/experience/:code/toggle-status | 启用↔停用 |
| GET | /api/admin/rules/experience-issuance | 仅 source=rule 的经验流水 |
| GET | /api/admin/rules/levels | 等级梯度 level 升序 |
| PUT | /api/admin/rules/levels | 整组保存 body `{ tiers: [{ level, label, threshold }] }`（前端函数签名收数组、请求时包一层）；1-10 级、门槛逐级递增；梯度变更仅影响后续结算 |

### 7.12 工位与租约 workstations（14）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/workstations | 全量工位（含 areaId→area 名，平面图分组） |
| GET | /api/admin/workstation-areas | 区域列表 |
| POST | /api/admin/workstation-areas | `{ name, type, description }`；name 唯一 |
| PUT | /api/admin/workstation-areas/:id | 编辑；改名无需级联（M1 外键化） |
| DELETE | /api/admin/workstation-areas/:id | 仅区域下无工位时可删 |
| POST | /api/admin/workstations | `{ area, seatNo, type, capacity, note?, defaultMonthlyRent?, areaSqm? }`——**area 为区域名称字符串**（M0 WorkstationPayload 契约，服务端按名解析 areaId，不存在报"所属区域不存在"）；seatNo 全岛唯一；创建即 idle |
| PUT | /api/admin/workstations/:id | 资料编辑（不改分配/维护状态；body 同 POST，area 为区域名） |
| DELETE | /api/admin/workstations/:id | assigned 不可删；删除后同步清理 lease 关联 |
| POST | /api/admin/workstations/:id/status | `{ status: idle/maintenance }`；assigned 不可直接标记 |
| GET | /api/admin/workstation-leases | 全量租约最新在前；expiring/expired 读取派生（15 天窗口，longTerm 不参与） |
| GET | /api/admin/renter-options | `{ users: [...], enterprises: [...] }` 含联系方式 |
| POST | /api/admin/workstation-leases | LeasePayload；**事务**：校验工位 idle → 建租约 → 工位置 assigned + enterprise/lease 回填；renterType=enterprise/individual 校验 ID 存在 |
| PUT | /api/admin/workstation-leases/:id | 续期/租金/联系人；terminated 不可编辑；**换工位不支持**（终止重建） |
| POST | /api/admin/workstation-leases/:id/terminate | **事务**：租约 terminated + 释放全部关联工位 |

### 7.13 公共空间 spaces（9）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/spaces | 全量按 ID 升序 |
| GET | /api/admin/spaces/:id | 详情含预约列表（空间详情页日历/明细用） |
| POST | /api/admin/spaces | 创建即 available；allDay 时存 00:00/23:59；needApproval 联动 needReservation |
| PUT | /api/admin/spaces/:id | 编辑基础信息（状态走独立接口） |
| POST | /api/admin/spaces/:id/status | `{ status: available/maintenance/disabled }` |
| GET | /api/admin/space-reservations | query：page/pageSize/keyword(用户/空间/ID)/spaceId/status/date |
| POST | /api/admin/space-reservations/:id/review | `{ status, comment? }`；approved 前冲突校验（见 8.8）；重复审批报错；写审批时间线 |
| POST | /api/admin/space-reservations/:id/cancel | pending/approved 可取消 |
| GET | /api/admin/spaces/usage-board | query：date；当日已通过预约 + 同名空间已发布活动合并占用（source 区分） |

### 7.14 内容 contents / announcements（19）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/contents/articles | query：page/pageSize/keyword(标题/作者/ID)/columnId/status/sortBy(id 默认、views、createdAt)/sortOrder |
| POST | /api/admin/contents/articles | ArticlePayload（title/columnId/authorId/summary/tags）；创建即 draft；authorIdentity 取社区个体优先否则 individual |
| PUT | /api/admin/contents/articles/:id | 仅 draft/rejected/withdrawn 可编辑 |
| POST | /api/admin/contents/articles/:id/submit | draft/rejected/withdrawn → pending |
| POST | /api/admin/contents/articles/:id/review | `{ status: approved/rejected, comment? }`；approved → published + publishedAt；rejected 必填原因 |
| POST | /api/admin/contents/articles/:id/withdraw | published → withdrawn |
| GET | /api/admin/contents/columns | 按 sort 升序，含文章数聚合 |
| POST | /api/admin/contents/columns | 创建即启用 |
| PUT | /api/admin/contents/columns/:id | 编辑；改名同步刷新文章 columnName 快照 |
| POST | /api/admin/contents/columns/:id/toggle-status | 启用↔停用（停用后新文章不可选） |
| GET | /api/admin/contents/showcase-requests | query：page/pageSize/targetType/status |
| POST | /api/admin/contents/showcase-requests/:id/review | `{ status, comment? }`；**联动 Enterprise.showcaseStatus**（published/rejected，复用企业展示页状态逻辑） |
| GET | /api/admin/announcements | 置顶优先，其余发布时间倒序 |
| POST | /api/admin/announcements | 创建即发布（写 publishedAt） |
| PUT | /api/admin/announcements/:id | 编辑（不改状态/发布时间） |
| POST | /api/admin/announcements/:id/withdraw | 下架 |
| POST | /api/admin/announcements/:id/publish | 重新发布（更新 publishedAt） |
| POST | /api/admin/announcements/:id/toggle-pin | 置顶↔取消 |
| DELETE | /api/admin/announcements/:id | 删除 |

### 7.15 系统与聚合 system / dashboard（10）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/notifications | 最新在前 |
| POST | /api/admin/notifications/:id/read | 单条已读 |
| POST | /api/admin/notifications/read-all | 全部已读 |
| GET | /api/admin/audit-logs | query：page/pageSize/keyword(target/action/detail/operator)/module（11 个中文模块值） |
| GET | /api/admin/system/config | 单例配置 |
| PUT | /api/admin/system/config | 保存即生效；leaseExpireRemindDays 1-90；记 updatedBy/updatedAt |
| GET | /api/admin/dicts/:type | 按 sort 升序（仅 enabled 下发选项；管理页返回全量） |
| POST | /api/admin/dicts/:type | `{ label }`；label 全类型唯一；创建即启用 |
| POST | /api/admin/dicts/:type/:code/toggle-status | 启用↔停用 |
| DELETE | /api/admin/dicts/:type/:code | 删除（历史引用值不受影响） |

### 7.16 工作台 dashboard（2）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/dashboard | `{ stats: { pendingApplications, totalUsers, activeEnterprises, runningProjects, upcomingEvents }, todos, pendingApplications(前5), upcomingEvents(前4，未结束已发布按开始时间升序) }` |
| GET | /api/admin/todos | 六域待办聚合：入驻审批/需求审核/空间预约/展示页发布/文章审核/临期租约（15 天窗口派生），`[{ key, title, description, count, route }]` |

**端点总计：129**。

## 8. 业务规则服务端化

### 8.1 状态机校验矩阵（服务端 409 强制）

- **需求**：`pending →(approve)→ pending_release →(publish-now | schedule)→ published | scheduled →(到点)→ published`；`pending →(reject)→ rejected`；`pending_release →(close)→ closed`；`published →(retract)→ pending_release`、`published →(initiate-project)→ projected`；`scheduled →(cancel-schedule)→ pending_release`。scheduled/published 编辑约束：scheduled 不可编辑；published 可编辑不改状态。
- **活动**：`pending_release →(publish-now | schedule)→ published | scheduled →(到点)→ published`；`published →(endTime 过)→ ended`（定时任务）；`pending_release/published →(cancel)→ cancelled`；`cancelled →(restore)→ pending_release`；published 内 enrollmentOpen 开关。编辑约束同 7.8。
- **项目**：`running ↔ paused`；`paused →(close)→ closed`；closed 只读（可"重新创建"=复制预填，生成新 P 编号）；里程碑全 done → finished（结项，见 8.5）。
- **文章**：`draft/rejected/withdrawn →(submit)→ pending →(review)→ published | rejected`；`published →(withdraw)→ withdrawn`。
- **申请/预约/展示页**：`pending → approved | rejected`；预约另有 `pending/approved → cancelled`。
- **兑换订单**：`pending_shipment → shipped → finished`；`pending_shipment → cancelled`（事务退款）。
- **工位**：idle ↔ maintenance（直接切换）；assigned 仅经租约创建/终止进入/退出。
- **实现方式**：每域 Service 内显式 `assertTransition(from, action)`，非法流转抛 409（文案="仅 XX 的 XX 可 XX"，与 M0 一致）；不做通用状态机框架。

### 8.2 定时任务（@nestjs/schedule，单实例）

| 任务 | 频率 | 逻辑 |
|---|---|---|
| 定时发布扫描 | 每 30s | `demands/events` 中 status=scheduled 且 scheduledAt≤now → published + 写 publishedAt + 写 schedule 通知 |
| 活动自动结束 | 每 5min | status=published 且 endTime≤now → ended |
| 租约临期通知 | 每日 09:00 | status=active 且 endDate 落在临期窗口（SystemConfig.leaseExpireRemindDays，默认 15）→ 写 lease 通知（同一租约同日去重） |

> 单实例部署无需分布式锁；如未来多实例，升级为 Redis 锁或 BullMQ（M3 后评估）。读取派生（expiring/expired）与定时通知并存：派生保证展示实时性，任务只负责通知。

### 8.3 事务边界（必须 `prisma.$transaction`）

1. 租约创建（校验+建租约+锁定工位）/ 租约终止（终止+释放工位）
2. 兑换订单取消（退积分流水+回补库存+订单状态）
3. 手动积分/经验调整（余额更新+流水写入）
4. 积分/经验规则发放（同上，引擎内统一）
5. 需求立项（建项目+承接方/里程碑子表+需求关联+积分发放）
6. 审批通过授予身份（申请状态+身份写入+企业创建/激活+首绑积分）

### 8.4 积分发放引擎（PointsEngineService）

- **8 条固定规则**（code 写死，仅 points 值与启停可编辑）：`activity_checkin`(+10)、`activity_enroll_approved`(+5)、`demand_published`(+15)、`demand_responded`(+20，发放给响应成员)、`demand_undertaken`(+200)、`project_milestone`(+100)、`identity_first_bind`(+50)、`daily_login`(+1，默认停用，M2 生效)。
- **触发点**：M0 mock 中不存在任何自动发放逻辑（发放记录仅作为种子数据存在），M1 按"触发事件是否在管理端发生"分两批接入：**M1 即接入**（管理端操作即触发）——活动报名审核通过（`activity_enroll_approved`，enrollPoints ?? 规则值）、活动签到（`activity_checkin`，checkinPoints ?? 规则值）、审批通过授予身份（`identity_first_bind`）；**随 M2 客户端行为落地**——需求发布（`demand_published`）、响应需求（`demand_responded`，发放给响应成员；管理员代报名为运营代操作**不发放**）、需求承接立项（`demand_undertaken`）、项目里程碑（`project_milestone`）、每日登录（`daily_login`）。引擎一次建成，触发点渐进接入。
- **发放流程**：读规则（Redis 缓存）→ status=enabled → 事务内：余额 += points → 写流水（source=rule、operator="系统"、balance=新余额）。
- 等级结算：经验值变动后按 LevelTier 门槛重算 level（仅社区个体/社区企业身份持有 level 字段）。

### 8.5 经验值规则与项目结项分配

- **5 条固定规则**：`activity_checkin`(+5)、`activity_enroll_approved`(+2)、`project_undertaken`(+30)、`project_completed`(+100)、`identity_first_bind`(+10)。
- **项目结项**（里程碑全 done → finished）：总经验值 = expReward ?? 规则值；按承接占比分配给 **type=enterprise（社区企业）与 type=individual 且结项时持社区个体身份的承接方**；外部企业/无社区个体身份个人/custom 不参与，**份额丢弃不转移**；除不尽向下取整，余数给首个参与方。
- 归属：企业 → Enterprise.experience；社区个体 → UserIdentity.experience（该身份行）。

### 8.6 审批通过授予身份（grantIdentity 服务端化）

- 按申请人 phone 匹配 User（未注册申请者不授予，仅改申请状态）。
- `settle`：企业不存在则**自动创建**（industry="综合"、status=active、其余默认值）→ 存在则置 active + 补 settledAt → 申请人追加 community_enterprise 身份（role=member、level=1、experience=0，去重）。
- `identity`：targetName 按"企业名 · 头衔"解析 → 申请人追加 external_enterprise 身份（去重）。
- 首次授予任意非 individual 身份 → 触发 `identity_first_bind` 积分+经验（启用时）。

### 8.7 需求发布方身份快照（resolvePublisherIdentity 服务端化）

- enterprise 提交 → 社区企业（E 前缀）/外部企业（XE 前缀）身份快照；individual 提交 → 持社区个体身份则标社区个体，否则一律"个人用户"（**不因同时持有企业身份而自动归入**）；custom → 表单传入快照或 null。

### 8.8 空间预约冲突校验（审批通过前）

- 同空间同日**已通过预约**时段重叠（`start < other.end && other.start < end`）→ 409"该时段已有已通过的预约，无法重复占用"。
- 同名空间当日**已发布社区活动**（location=空间名、日期=预约日）时段重叠 → 409"该时段被社区活动占用，无法通过"。
- 批量通过逐条校验，失败明细随响应返回（M0 批量操作契约）。

### 8.9 快照与联动的既有口径（服务端保持）

- 栏目改名 → 刷新文章 columnName；工位区域改名 → 无需级联（外键化）；企业展示页审核 → Enterprise.showcaseStatus + comment；解冻 → 清冻结字段；撤回发布 → 清 publishedAt/scheduledAt；终止租约 → 释放工位并清 enterprise/lease 冗余。

## 9. 审计与通知

### 9.1 审计（AuditInterceptor + AuditService）

- **实现**：全局 Interceptor 拦截 `/api/admin/**` 非 GET 请求；Controller 方法上 `@Audit(module, action)` 装饰器声明元数据，Interceptor 在成功响应后异步写入（operator=JWT name、ip=请求 IP、target/detail 由装饰器参数或返回体提取、before/after=服务层可选注入快照）。
- **M0 17 处埋点 → 服务端映射**（module/action 口径不变）：

| 模块 | 动作 |
|---|---|
| 审批中心 | 审批通过 / 审批驳回 |
| 需求管理 | 创建需求 / 需求审核通过 / 需求发布 / 需求驳回 / 需求关闭 / 需求立项 |
| 项目管理 | 创建项目 / 项目关闭 |
| 活动管理 | 活动发布 / 活动取消 |
| 社区成员 | 冻结账号 |
| 积分商城 | 积分调整 / 商品上架 / 商品下架 / 订单发货 |
| 空间管理 | 预约审批通过 / 预约审批驳回 |
| 内容管理 | 文章审核 / 公告发布等公告写操作 |

- 查询口径同 M0：module 精确筛选 + keyword 跨 target/action/detail/operator 模糊，最新在前。

### 9.2 通知（NotificationService，业务事件驱动）

| type | 触发事件 | link |
|---|---|---|
| approval | 入驻/身份绑定申请提交（M2 客户端；M1 仅种子数据） | /approvals |
| demand_review | 需求提交待审核（M2 客户端） | /demands/review |
| reservation | 空间预约提交（M2 客户端） | /spaces/reservations |
| showcase | 展示页发布申请提交（M2 客户端） | /contents/showcase |
| article | 文章提交审核（M2 客户端） | /contents |
| lease | 租约临期（每日任务） | /workstations/leases |
| schedule | 定时发布到点完成（30s 扫描任务） | /demands 或 /events |

- 已读：单条/全部接口同 M0；通知为管理员维度（单管理员即全局，多账号预留 recipientId 列）。

## 10. Redis 缓存策略

| 键 | 内容 | TTL | 失效 |
|---|---|---|---|
| `config:system` | SystemConfig 单例 JSON | 10min | PUT config 时删除 |
| `dicts:{type}` | 启用字典项列表 | 10min | 字典写操作删除 |
| `rules:points` / `rules:experience` / `rules:levels` | 规则与梯度 | 10min | 规则写操作删除 |
| `auth:blacklist:{jti}` | 登出令牌 | =JWT 剩余有效期 | 自动过期 |
| `dashboard:summary` | 工作台聚合（stats+todos） | 60s | 短 TTL 自然过期（待办实时性优先） |

- 原则：只缓存**读多写少且可重建**的数据；列表查询不缓存（分页组合爆炸）；缓存穿透用空值占位（60s）；Redis 不可用时降级直查 DB（日志告警，不中断）。

## 11. 种子数据（prisma/seed.ts）

- **来源**：M0 `apps/admin/src/mock/` 全量数据逐条迁移（users 15 / enterprises 9 / applications 10 / demands 13 / projects 8 / events 9 / externalEnterpriseProfiles 4 / goods 9 / redemptionOrders 6 / pointsRules 8 / workstationAreas 3 / workstations 20 / leases 8 / spaces 6 / reservations 12 / columns 5 / articles 10 / showcaseRequests 5 / notifications N9001+ / auditLogs AL1001+ / announcements / dicts / ledgers / systemConfig / AdminUser）。
- **要求**：编号前缀与 mock 完全一致（含 IdSequence 初始化为各前缀当前最大值）；跨模块引用一致（末笔流水 balance=实体当前值、工位↔租约↔企业、预约/活动场地等——mock 一致性清单见 wiki-admin-web.md §6）；`db:seed` 幂等（TRUNCATE 全表后重建）。
- 种子数据中已知 mock 瑕疵保持原样迁移（XE7004 与 E2003 重名、users.realName 错位——M0 已向用户报备），不做"顺手修正"。

## 12. admin 接入计划（Mock → HTTP）

- **改造规则**（`apps/admin/src/api/`）：
  1. 新增 `src/api/http.ts`：fetch 封装（baseURL `/api/admin`、Bearer token、包络解包 `body.data`、错误 `throw new Error(body.message)`、401 清 token 跳登录）——**函数签名与返回类型全部不变，视图层零改动**。
  2. 每域逐文件替换：函数体 mock 读写 → `http.get/post/...`；Query 接口语义不变（参数名即 query 参数）。
  3. mock 引用清零的域删除对应 mock import；全部域完成后删除 `src/mock/`（保留一个 release 分支节点）。
- **切换顺序**（与里程碑绑定，每步验证 = `tsc --noEmit` + `pnpm build:admin` + 浏览器冒烟登录后走查该域页面）：auth →（M1-A ✅）→ 成员/审批/账本（M1-B ✅）→ 需求/项目/活动（M1-C ✅）→ 商城/规则/工位/空间/内容/公告（M1-D ✅）→ 通知/审计/配置/字典/工作台（M1-E，待做）。
- **进度（2026-09-10，M1-E 完成）**：22/22 个 api 文件已 HTTP 化（函数签名不变，视图层零改动）；`apps/admin/src/mock/` 已删除，种子数据内化至 `apps/api/prisma/seed-data/`（seed 唯一数据源，api tsconfig 已 exclude）。
- 字典消费点（七处表单/列表）在 M1-E 前仍走 mock/fallback，M1-E 切真实 `/api/admin/dicts/*`。
- vite.config 增 proxy（见第 3 节）；生产构建由部署期网关统一转发 `/api`。

## 13. 里程碑拆分与验证

> 每阶段完成即更新 [full-spec-check.md](./full-spec-check.md) §4 勾选，并按约定在 `docs/` 沉淀对应实体字段文档（page as documentation）。

### M1-A 基础设施与骨架 — ✅ 完成（2026-09-10，提交 a31df09）

- [x] `apps/api` NestJS 11 工程搭建 + 根命令（dev:api/build:api/db:*）
- [x] docker-compose.dev.yml（postgres/redis + healthcheck）+ .env.example
- [x] Prisma 全量 schema（35 模型，第 5 节）+ 首版 migration
- [x] IdGeneratorService（id_sequences 发号）
- [x] 全局底座：包络/异常过滤器/ValidationPipe/JWT Guard/AuditInterceptor 骨架/健康检查 `GET /api/health`
- [x] auth 模块（login/logout）+ AdminUser 种子（admin/admin123）
- [x] seed.ts 骨架（AdminUser + SystemConfig + 字典）
- [x] e2e 冒烟：login → 携带 token 访问 health；登出后 401
- **验证**：`pnpm db:reset` 一键跑通；e2e 5/5

### M1-B 社区成员域 — ✅ 完成（2026-09-10，提交 b8d7470）

- [x] users / individuals / enterprises / external-enterprises / applications / ledgers 全端点（21 个）
- [x] grantIdentity 联动（企业创建/激活、身份授予、首绑积分经验）
- [x] 手动积分/经验调整（事务+流水）+ 用户/企业 stats 派生
- [x] admin 接入：用户/社区个体/社区企业/外部企业/申请审批五组页面 + 详情账本
- **验证**：e2e 33/33；审批通过→身份落库→列表可见；调整积分→流水 balance 连续

### M1-C 业务运营域 — ✅ 完成（2026-09-10，提交 489cc11）

- [x] demands / projects / events 全端点（34 个）+ 状态机校验矩阵
- [x] 定时任务（定时发布/活动结束）+ schedule 通知
- [x] 积分/经验引擎接入触发点（报名审核通过/签到/首绑）
- [x] 立项双向关联 + 承接方校验（share=100）+ 代报名
- [x] admin 接入：需求/需求审核/项目/活动四组页面
- **验证**：e2e 48/48 两轮幂等；状态机非法流转 409 文案比对 M0；定时发布到点自动 published 实测

### M1-D 运营设施域 — ✅ 完成（2026-09-10，提交 c4e97fe）

- [x] mall（商品/订单/积分规则）/ rules（经验值规则/等级梯度/发放记录）全端点
- [x] workstations（区域/工位/租约）+ 租约事务与派生 + 临期通知任务
- [x] spaces（空间/预约审批/冲突校验/使用看板）
- [x] contents（文章/栏目/展示页申请联动企业）+ announcements
- [x] 订单取消退款事务；等级结算
- [x] admin 接入：积分商城/规则管理/空间管理/内容管理四组页面
- **验证**：e2e 15 套件 72/72 两轮幂等；预约冲突 409；订单取消→积分流水/库存一致；栏目改名→columnName 刷新

### M1-E 系统管理域与收尾 — ✅ 完成（2026-09-10）

- [x] notifications / audit-logs 查询 / system config / dicts / dashboard / todos 全端点（12 个，`modules/system`）
- [x] 审计 before/after 快照补全（12 处埋点：状态流转含前后状态、配置/公告含字段级快照、积分调整含余额、审批含授予结果）；Redis 缓存全量接入（第 10 节五键：`config:system` / `dicts:{type}` / `rules:points|experience|levels`（与积分引擎共用同键、同查询口径）/ `dashboard:summary` 60s；写操作主动失效；seed 重种子后清理应用缓存键防跨套件污染）。降级 = 全部 Redis 调用点 try-catch fail-open 回源 DB（沿用 JWT 黑名单先例）；Redis 停机实测因环境限制未执行，降级保障为代码级兜底
- [x] admin 接入：通知中心/审计日志/系统配置/数据字典/工作台（6 文件切换，函数签名不变、视图层零改动；前端 recordAudit 移除）；删除 `src/mock/`
- [x] `/api/app/**` 设计文档（`docs/api-app-design.md`：M2 客户端端点清单——注册登录/多身份、需求浏览提交响应、活动报名、商城兑换下单、空间预约提交、文章投递、展示页申请、个人中心）
- [x] 实体字段文档沉淀（`docs/entity-fields.md`：35 模型分域字段清单）
- [x] 回归与文档：admin/api `tsc --noEmit` + `build:api` + `build:admin`（mock 全删后）+ e2e 16 套件 78 用例两轮全绿；127 个管理端端点经 e2e 主干覆盖（系统域 12 端点新增 system 套件）；**29 页面浏览器走查已完成**（2026-09-10 以 agent-browser + 本地 Chrome 有头模式实测：23 张截图存档、控制台零错误零警告、全域核心交互链路逐项验证、发现 0 缺陷）；full-spec-check 勾选 + 本 wiki 修订记录
- **验证**：mock 全删后 build:admin 通过 ✓；e2e 78/78（system 套件 6 用例：通知已读流转 / 审计筛选 / 字典唯一性与 sort 重排 / 配置校验文案逐字比对 / 工作台聚合与各域列表口径交叉校验）

## 14. 工程约定

- **验证底线**：每模块 PR 级改动跑 `pnpm --filter @joinyuu/admin exec tsc -p tsconfig.json --noEmit`（admin 侧）、`pnpm --filter @joinyuu/api exec tsc -p tsconfig.json --noEmit` + `pnpm build:api` + `pnpm --filter @joinyuu/api test:e2e`（api 侧，需 Docker 服务运行）；不虚报测试结论（无测试即说明仅构建验证）。
- **测试策略**：单测覆盖纯逻辑（状态机矩阵/冲突算法/经验分配/ID 发号）；e2e 每域至少覆盖"列表-详情-一次状态流转"主干；不追求覆盖率数字，主干链路优先。
- **契约变更流程**：任何端点/字段/状态机变更 = 先改本文档（标注日期）→ 再改代码 → 同步 full-spec-check；禁止只改代码。
- **提交规范**：沿用 `<type>: <描述>`；后端模块建议 `feat(api): xxx` 前缀区分 admin 改动。
- **Windows 协作**：脚本改动避免 heredoc/内联模板串；批量脚本走临时 .mjs 文件 + fs 写入；改完必须读盘校验（历史教训见 `.workbuddy/memory`）。
- **文档同步**：每完成后端模块，在 `docs/` 沉淀实体字段列表（page as documentation）；wiki-backend.md 顶部维护修订记录。

## 修订记录

| 日期 | 摘要 |
|---|---|
| 2026-09-10 | 初版：M1 全量契约冻结（Prisma/范围/主键三项决策经用户确认） |
| 2026-09-10 | M1-A 实施修订：时间字段统一 String 存储（废弃 timestamptz 方案，理由见 §4.1）；`db:migrate` 改为非交互 `prisma migrate deploy` 并新增 `db:migrate:dev`（交互式创建迁移）；连接地址统一 127.0.0.1（Docker Desktop IPv6 loopback 不可靠）；模型数订正为 35 |
| 2026-09-10 | M1-B 实施修订：全部 `@db.Char` 主键/外键列改 `VarChar`（PostgreSQL CHAR(n) 读取保留尾部填充，破坏 ID 契约）——迁移 `20260910140000_char_to_varchar`；§7.9 账本 POST body 补全完整形状（`{targetType,targetId,delta,reason}` / `{userId,delta,reason}`）；§7.3 企业 options 形状订正为 `[{label,value}]`；admin 路由守卫改读 localStorage（401 清 token 后守卫需立即感知，读 Pinia 快照会把 /login 误重定向回 /dashboard） |
| 2026-09-10 | M1-C 实施修订：`@nestjs/schedule` 锁定 ^6（v12 为纯 ESM 包，jest/nest CJS 链不兼容）；e2e 套件隔离机制（`test/helpers/reseed.ts`，每套件 beforeAll 全量重种子——状态机套件的跨运行污染根治）；demands 新增 4 条状态机守卫 409（reject/close/update/initiate-project，M0 无防重入守卫，按 §8.1 服务端强制原则补齐）；§8.4 积分默认值为示意（实际以种子规则数据为准，如报名通过 mock 实际值）；活动自定义积分（enrollPoints/checkinPoints）走服务内直写事务（引擎仅支持规则值发放） |
| 2026-09-10 | M1-D 实施修订：§7.12 工位 POST/PUT body 的 `areaId` 订正为 `area`（区域名称字符串，M0 WorkstationPayload 契约，服务端按名解析）；§7.11 levels PUT body 明确 `{tiers: [...]}` 包裹；§7.10 goods 列表补 sortBy(id/points/createdAt)；订单取消退款流水 source='redemption'（M0 mock 复用手动调整为 manual，按 wiki 语义修正）；e2e 套件执行顺序非字母序（jest 默认排序），轮末 DB 为最后执行套件的测试后状态属预期，冒烟前需重种子 |
| 2026-09-10 | M1-A~D 全部完成（提交 a31df09 / b8d7470 / 489cc11 / c4e97fe）：115 个管理端端点、e2e 15 套件 72 用例两轮幂等、admin 16/22 文件接入真实接口；§12/§13 同步勾选 |
| 2026-09-10 | 开发端口统一：后端 API 7759 → **7757**（`.env`/`.env.example`/main.ts 默认值/vite proxy/http.ts 注释/文档全量替换）；确认后端 `0.0.0.0` 绑定 + vite `host: 0.0.0.0`，支持局域网设备访问（admin 7758 / api 7757） |
| 2026-09-10 | **M1-E 实施修订（M1 收官）**：系统管理域 12 端点落地（`modules/system`，e2e 新增 system 套件 6 用例，总计 16 套件 78 用例）；审计 before/after 快照全量补全（12 处埋点）；Redis 缓存全量接入——`rules:points/experience/levels` 与积分引擎共用同键且查询口径一致（orderBy 对齐，避免两处缓存内容漂移），`dashboard:summary` 60s 短 TTL，seed 重种子后清理应用缓存键（Redis 不可用时静默跳过，防挂起参数已配）；admin 22/22 文件接入 + 删除 `src/mock/`，种子数据内化至 `prisma/seed-data/`（api tsconfig exclude，seed 为唯一数据源）；事件 DTO 映射抽取为 `modules/events/event-dto.ts` 共享（工作台 upcomingEvents 与活动域形状不漂移）；工作台临期租约窗口改取 `SystemConfig.leaseExpireRemindDays`（默认 15，与租约临期通知任务同源，保存即生效）；字典管理页返回全量（含 disabled），下拉由消费方按 enabled 过滤（M0 口径，§7.15 表述据此澄清） |
| 2026-09-10 | **M1-E 浏览器全站走查（M1 收官验证）**：以 agent-browser + 本地 Chrome 有头模式对 29 页面/全部域核心交互实测（23 张截图存档），控制台零错误零警告，发现 0 缺陷。实测链路：登录→工作台聚合→通知已读与跳转→审批（通过/驳回/批量）→需求（审核通过/驳回必填拦截/立即发布，定时发布因其 DatePicker 组件对程序化输入不响应而转由 e2e 保障）→立项对话框表单→项目详情（占比/来源需求）→活动（报名开关切换/手动签到并触发发放）→商品上下架→订单发货→积分规则编辑（缓存失效）→空间（平面图/租约/预约审批通过）→内容（文章审核通过/已驳回重提/公告发布/栏目）→系统配置保存（含留痕）→数据字典新增与唯一性拦截→删除→审计日志（本次全部操作按时间倒序留痕，operator 取 JWT）→关键词搜索→导出 CSV。遗留说明：TDesign DatePicker 无法被 agent-browser 程序化赋值（fill/键盘/面板点选均不写入组件状态），涉日期选择流程（定时发布/租约定时/里程碑日期）由 e2e 覆盖 |
