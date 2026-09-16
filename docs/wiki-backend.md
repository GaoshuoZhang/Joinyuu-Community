# 聚屿社区 · 后端服务 — 开发 Wiki

> 本文档沉淀 M1 后端服务（NestJS + PostgreSQL + Redis）的架构契约、数据模型、API 清单与业务规则，是所有后端模块开发的唯一依据。
> 契约来源：M0 冻结的 `apps/admin/src/types/index.ts` 实体模型 + `apps/admin/src/api/` 全部 stub 的 TODO 注释（API Stub 即接口契约）。
> **M1.5 后台治理增强（R1~R12）落地后，本文档已按当前代码（`schema.prisma` / 全部 controller / `src/common` / `prisma/seed*` / `test`）全面修订；文档与代码冲突时以代码为准并回写本文档。**
> 与 [wiki-admin-web.md](./wiki-admin-web.md) 同级：admin wiki 管前端契约，本文档管后端契约；两者冲突时以 M0 冻结代码为准并提出修订。
> 已确认的三项基础决策（2026-09-10）：**ORM = Prisma**；**M1 范围 = 后端 + admin 全量接入真实接口**（`/api/app/**` 仅设计不实现）；**主键 = 前缀字符串 ID（U1001/E2001/...）**。

## 1. 定位与范围

**M1 目标**：以 M0 冻结的实体模型与 API 形状为契约，实现 NestJS 后端服务，并将 admin web 全量从 Mock 切换到真实 HTTP 接口。

**M1.5 目标（已完成，2026-09-10~12）**：后台治理增强（R1~R12）——RBAC 权限体系、管理员账号、登录安全（验证码/登录锁定/会话管理）、文件上传与素材库、富文本与 XSS 清洗、系统监控、图表趋势、登录日志、数据导出与打印、归档/软删除体系；前后端契约以本文档与代码为准。

**范围内**：

- `apps/api`：NestJS 11 + Prisma 6 + PostgreSQL 17 + Redis 7.4 的后端应用（Monorepo 内新包）
- `/api/admin/**` 全量端点（**191 个**，见第 7 节清单；含 M1.5 新增的权限/会话/监控/素材/归档/导出/打印等），另加 `/api/health` 与 `/api/public/files/:key` 两个公开端点
- 管理端认证（图形验证码 + JWT + 登出黑名单 + Redis 登录锁定 + 会话索引/强制下线/改密踢线）、审计日志服务端化、业务事件驱动通知、定时任务（定时发布/活动结束/租约临期/自动归档/自动删除，共 6 个）
- RBAC：49 个权限码 + 4 个内置角色（super/operator/auditor/space-ops），34 个 admin controller 中 33 个挂 `@RequirePermission`，notifications 有意仅登录；health/files 为公开 controller
- 归档体系：13 个业务域软删除（`deletedAt`/`deletedBy`）+ 可归档时间戳（`archivableAt`）+ 归档管理恢复/彻底删除 + 自动归档/自动删除
- 文件上传与素材库（MinIO/本地磁盘双驱动；上传魔数嗅探禁 SVG；大小上限由系统配置，1-100MB 默认 10）
- 积分/经验发放引擎（按规则 code 触发，事务写流水）
- admin web 接入：`src/api/` 层 HTTP 化改造（函数签名不变，视图零改动），M1-E 起删除共享 mock
- 种子数据：从 M0 mock 迁移并按 M1.5 改造，保持全部编号与跨模块引用一致（见第 11 节）
- `/api/app/**` 客户端接口**仅输出设计文档**（M1-E 交付 `docs/api-app-design.md`），不实现

**范围外**：M2-R `/api/app/**` 实现（当前暂不启动）、桌面客户端、微信小程序、微信登录、支付、CI/CD、分布式部署。MinIO 双驱动已实现，但真实对象 I/O 尚缺 e2e 覆盖。

## 2. 技术栈与工程结构

| 层 | 选型（版本冻结） |
|---|---|
| 框架 | NestJS 11 + `@nestjs/schedule`（定时任务）+ `@nestjs/jwt` |
| ORM | Prisma 6（`@prisma/client` + `prisma migrate`） |
| 数据库 | PostgreSQL 17（Docker） |
| 缓存 | Redis 7.4（Docker，ioredis 客户端） |
| 校验 | class-validator + class-transformer（全局 ValidationPipe） |
| 密码 | bcryptjs（纯 JS 实现，规避 Windows 原生编译问题） |
| 富文本清洗 | sanitize-html **精确锁定 2.16.0**（2.17.x 依赖 htmlparser2@12 纯 ESM，与 Nest CJS/jest 链不兼容） |
| 文件上传 | `@nestjs/platform-express` FileInterceptor（multer 内存存储，硬上限 100MB 兜底，实际限制按系统配置） |
| 对象存储 | `StorageService` 双驱动：MinIO 或本地磁盘回退（`UPLOAD_DIR` 可配，默认 `apps/api/uploads`） |
| 验证码 | 自研 SVG dataURL（`captcha.util.ts`，4 位去易混字符，无第三方依赖） |
| 时间 | 原生 Date + `common/utils/time.ts` 统一格式化（`TZ=Asia/Shanghai`） |
| 测试 | Jest + supertest（源码静态清点：e2e 25 套件 / 170 声明；unit 4 套件 / 25 声明；最近记录 e2e 25 / 169 全量通过） |

**目录结构**（`apps/api/`）：

```
apps/api/
  prisma/
    schema.prisma        # 全量实体建模（43 模型，见第 5 节）
    migrations/          # prisma migrate 产出（17 个迁移）
    seed.ts              # M0 mock 迁移 + M1.5 治理种子（见第 11 节）
    seed-data/           # 各域种子数据（seed 唯一数据源；api tsconfig exclude）
  src/
    main.ts              # CORS 白名单 + 0.0.0.0:7757
    app.module.ts
    common/              # prisma / redis / filters / interceptors / guards / decorators / audit / rbac / storage / engine / utils
    modules/
      auth/              # 验证码/登录/登出/改密/在线会话（admin-session.service.ts）
      users/             # 用户 + 社区个体（含身份 identities）
      enterprises/       # 社区企业
      external-enterprises/  # 合作企业聚合视图 + 档案
      applications/      # 入驻/合作/身份绑定审核（四类）
      demands/           # 需求（含代报名/立项）
      projects/          # 项目（承接方/里程碑/状态机）
      events/            # 活动（发布/报名/签到/状态机）
      ledgers/           # 经验值/积分流水与手动调整
      mall/              # 商品/兑换订单/积分规则
      rules/             # 经验值规则/等级梯度/发放记录
      workstations/      # 办公位/区域/租约（含打印单）
      spaces/            # 公共空间/预约审核/使用看板
      contents/          # 资讯/投稿/栏目/展示页申请/公告
      assets/            # 素材库（上传/替换/删除 + 公开读取 files.controller）
      system/            # 配置/字典/审计查询/通知/工作台 + roles/admins/login-logs/monitor/trash/export
    scheduler/           # 6 个定时任务（发布/活动结束/租约临期/自动归档/自动删除）
```

**Monorepo 命令**（根 `package.json` 定义）：

```bash
pnpm db:up          # docker compose -f apps/api/docker-compose.dev.yml up -d --wait（等待健康检查）
pnpm db:down        # 停止并删除容器（保留数据卷）
pnpm dev:api        # 启动 NestJS dev（端口 7757）
pnpm build:api      # Nest 生产构建
pnpm db:migrate     # prisma migrate deploy（非交互应用已有迁移）
pnpm db:seed        # tsx prisma/seed.ts（幂等：清空后全量重建）
pnpm db:reset       # prisma migrate reset --force（drop + migrate + seed，一键验证）
pnpm --filter @joinyuu/api db:migrate:dev  # 开发者创建新迁移时手动执行（交互式）
pnpm --filter @joinyuu/api test:e2e        # e2e 全量（需 Docker 服务；每套件自行重种子）
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
# 素材上传目录（缺省 apps/api/uploads；生产建议指向独立数据盘或接入对象存储）
# UPLOAD_DIR="D:/data/joinyuu-uploads"
# CORS 白名单（逗号分隔；缺省仅放行 http://localhost:7758 与 http://127.0.0.1:7758）
# CORS_ORIGINS="http://192.168.31.101:7758"
```

- **配置安全**：`JWT_SECRET` 生产环境（`NODE_ENV=production`）未显式配置时模块加载即抛错，禁止使用开发默认值；`CORS_ORIGINS` 未配置时仅放行本机 admin（7758），需要局域网/多域名浏览器直连 API 时必须显式加入白名单。
- **端口约定**：admin dev **7758**、API dev **7757**；两者均监听 `0.0.0.0`，同一局域网内其他设备可通过 `http://<本机局域网IP>:7758`（admin）与 `http://<本机局域网IP>:7757`（API 直连）访问；admin 通过 Vite dev proxy 访问 API（`apps/admin/vite.config.ts` 的 `server.proxy: { '/api': 'http://127.0.0.1:7757' }`），开发期无 CORS 问题；API 侧 CORS 按白名单开启以备直连调试。
- Windows 注意：Prisma generate/migrate 在 PowerShell 下直接可用；换行符遵循仓库现状（git autocrlf）；禁止在命令行里内嵌多行 TS 模板字符串（历史上多次转义事故，见 `.workbuddy/memory`）。

## 4. 全局架构约定

### 4.1 响应包络（冻结）

- 成功：HTTP 200/201，body `{ code: 0, data: T, message?: string }`；`data` 形状与 M0 stub 返回值完全一致（列表为 `{ list, total }`，写操作为 `{ code: 0 }` 或带附加字段，如积分调整 `{ code: 0, balance }`）。
- 失败：HTTP 状态码 + body `{ code: <业务码，默认同 HTTP 状态>, message: '中文错误提示' }`。状态码矩阵：400 校验/业务规则、401 未登录、403 无权限、404 资源不存在、409 状态机冲突、429 登录失败次数过多、500 未知、503 数据库连接不可用。
- **M1.5 关键错误口径**（message 直接可展示）：
  - 权限不足：403「无权限执行该操作」（`PermissionGuard`）；
  - 登录锁定：429「登录失败次数过多，请 N 分钟后再试」（Redis 5 次失败 / 15 分钟）；
  - 数据库瞬断：Prisma `P1001`/`P1002` → 503「数据库连接暂时不可用，请稍后重试」；
  - 上传超限：FileInterceptor 的 413/`File too large` → 400「文件过大，请压缩后重试（可在「系统配置」调整上传文件大小限制）」；
  - 验证码：400「验证码错误或已过期」。
- 5xx 统一追加落盘 `.logs/api-error.log`（`.logs/` 已 gitignore），便于事后排查偶发故障。
- **`message` 必须直接可展示**——admin 视图层统一 `catch (e) → MessagePlugin.error(e.message)`，错误文案口径与 M0 mock 抛出的中文 Error 一一迁移（如"仅待发布的需求可立即发布"）。
- 时间字段统一 **String 存储**（M0 原生三种格式：`YYYY-MM-DD HH:mm` 时刻 / `YYYY-MM-DD` 日期 / `YYYY-MM` 年月，VarChar(16)）：单时区运营、字符串字典序即时间序（比较/排序/定时扫描均安全）、与 M0 契约逐字节一致、种子迁移零转换；`timestamptz` 推迟到出现真实跨时区需求时再迁移。系统内部字段（AdminUser.createdAt/updatedAt）不受此约束，仍用数据库原生 DateTime。

### 4.2 Nest 模块约定

- Controller 只做参数提取 + 调 Service + 包络返回；业务规则全部在 Service；数据访问统一经 `PrismaService`（不写裸 SQL，聚合视图可用 `$queryRaw`）。
- DTO 按端点声明，class-validator 规则与 M0 mock 内联校验一致（必填/正整数/合计 100% 等）。
- 全局注册（`app.module.ts`）：`ValidationPipe({ transform: true, whitelist: true })`、`JwtAuthGuard` + `PermissionGuard`（RBAC）、`EnvelopeInterceptor`（成功包络）、`AuditInterceptor`（`@Audit` 装饰器骨架，当前审计均由各 Service 直写，见第 9 节）、`HttpExceptionFilter`（统一错误包络）。
- 跨域复用逻辑沉淀到共享 Service：`PointsEngineService`（积分/经验发放）、`AuditService`（审计写入）、`IdGeneratorService`（前缀 ID）、`StorageService`（对象存储抽象，本地磁盘驱动）、`AdminPermissionService`（权限装载与缓存）、`RedisService`（缓存/黑名单/会话）。
- 富文本字段（文章/公告/需求/活动/项目/商品描述）写入前统一经 `sanitizeHtml`（白名单标签/属性，剥离 script/style/iframe 与事件属性、危险协议）。
- 跨域选项端点（`users/options`、`enterprises/options`、`publisher-options`、`renter-options`）单独挂 Controller，仅返回 id/name 等最小字段。

### 4.3 分页与筛选约定

- 列表端点统一 query：`page`（1 起）、`pageSize`、`keyword`（模糊，匹配字段以第 7 节表为准）、领域筛选项、排序 `sortBy`/`sortOrder`（`ascend | descend`，descend=最新在前为默认）。
- 返回 `{ list, total }`；服务端排序口径与 M0 mock 排序函数逐条一致（含 `publishedAt` 空值排最后等细节）。
- **全量集合端点例外**：非分页集合（`GET /workstations`、`GET /workstation-leases`、`GET /spaces`、`GET /assets`、`GET /notifications`、`GET /roles`、`GET /permissions/catalog`、`GET /monitor/cron-logs`、打印单端点）按第 7 节各端点说明直接返回数组（平面图/卡片网格消费），不包 `{ list, total }`。
- **归档可见性**：各业务域列表/详情默认过滤 `deletedAt: null`（已归档对象仅归档管理页与用户记录聚合可见）；`GET /trash` 反向只返回 `deletedAt` 非空的已归档对象，按 `deletedAt` 倒序，支持 `domain` 标签页筛选与 `keyword`（标题/编号）过滤。
- **导出**：`GET /api/admin/export/:domain` 返回 CSV 附件流（UTF-8 BOM，`Content-Disposition` 带 `filename*`），支持 `keyword`/`status`/`startDate`/`endDate`，域清单见 §7.15。

## 5. 数据模型（Prisma Schema 建模规则）

### 5.1 建模总则

- **主键 = 前缀字符串**（`@id String @db.VarChar(16)`；M1-B 已从 CHAR 改 VarChar，避免 PostgreSQL CHAR 尾部填充破坏 ID 契约），由 `IdGeneratorService` 发号：`id_sequences` 表（`entityType` PK + `nextNumber`）事务内 `INSERT ... ON CONFLICT DO UPDATE` 原子自增（发号器按需建行）；**禁止 MAX(id) 取号**（mock 写法，并发不安全）。编号前缀共 23 个（U/E/AP/D/P/EV/XE/EX/PT/G/RO/WS/WA/LS/S/SR/A/SU/CL/SC/AN/N/AL），另有按年独立的项目编号 `CODE-<year>`（JY-YYYY-NN）与运行时前缀 `AST`（素材）/`LL`（登录日志）/`SL`（调度日志）。
- **快照字段保留为列，不外键化**（M0 冻结口径）：`demand.publisherName`、`project.undertakers[].name`、`reservation.spaceName`、`order.goodsName`、`article.columnName`、`lease.renterName` 等展示快照不随源数据改名而变；但关联导航字段（`publisherId`、`columnId`、`goodsId`、`creatorId`）同时落列，可关联查询。
- **内嵌数组拆表**：`User.identities` → `identities` 表；`Demand.respondents`、`Project.undertakers/milestones`、`Event.enrollments` → 独立子表；`Lease.workstationIds` → `lease_workstations` 关联表（保留终止后的历史归属）。
- **JSONB 承载半结构数据**：`Application.details/records`、`Reservation.records`、`ShowcaseRequest.records`（ApprovalRecord 时间线）、`Demand.publisherIdentity` / `Article.authorIdentity`（身份快照）、`User.activities`（活跃记录，纯展示追加）、`AuditLog.before/after`（变更快照）、`ArchiveSetting.archiveStatuses`（按状态开关）、`Space.equipment` / 各实体 `tags`（`String[]`）。
- **软删除（归档）列**：企业/合作企业/申请/需求/项目/活动/商品/兑换订单/租约/空间/空间预约/文章/公告均含 `deletedAt String?` + `deletedBy String?`（归档端点写入；空间当前仅预留列）；列表现默认过滤 `deletedAt: null`，归档管理页集中恢复/彻底删除（见 §8.10）。
- **可归档时间戳 `archivableAt String?`**：对象进入"可归档状态"时写入（驳回/关闭/立项/结项/结束/取消/下架/完成/终止/审核完成等），自动归档任务以 `archivableAt + 延时` 判定；恢复在线态（如商品重新上架、活动恢复）时清除。注意与 `deletedAt` 语义区分：前者是"可以归档的计时起点"，后者是"已归档标记"。
- **派生值不落列**（M0 明确口径）：用户实名状态（realName+citizenId 均填）、用户 stats（详情接口实时 COUNT）、租约 expiring/expired（读取派生）、"个人用户"筛选（仅持 individual 身份）、工作台趋势（按日聚合）。
- 金额/积分为整数（分或元按 M0 现状：租金/预算为元字符串或整数、积分为整数）；枚举一律 String + 应用层枚举校验（保持与前端字符串契约一致，不用 PG enum，降低迁移摩擦）。

### 5.2 表清单（43 模型）

| 分组 | Prisma 模型 | 主键前缀 | 要点 |
|---|---|---|---|
| 认证 | AdminUser | 自增 | username 唯一、passwordHash（bcryptjs）、name（展示名）、status(active/disabled)、lastLoginAt?；种子 4 账号 admin/operator/auditor/space-ops（初始密码 admin123） |
| 认证 | AdminRole | R1~R4 | code 唯一、name/description/sort/createdAt；内置 super/operator/auditor/space-ops 四角色 |
| 认证 | AdminPermission | code（PK） | RBAC 权限点目录（49 码）：菜单路径或 `perm:xxx` 按钮码 + name/module/authType(menu/button)/sort |
| 认证 | AdminUserRole | 自增 | 管理员-角色关联，唯一 (adminUserId, roleId) |
| 认证 | AdminRolePermission | 自增 | 角色-权限点关联，唯一 (roleId, permissionCode)；角色变更即时失效权限缓存 |
| 认证 | LoginLog | LL | loginAt/username/ip/device/status(success/fail/locked)/failReason?；登录成功/失败/锁定均写 |
| 认证 | SchedulerLog | SL | jobName/startedAt/finishedAt/durationMs/status(ok/error)/detail?/rowsAffected；监控页与手动触发数据源 |
| 认证 | MallAsset | AST | 素材库：fileName/mime/size/url/storeKey/bizType?/sourceType?(article/submission)/sourceId?(文章 ID)/createdBy/createdAt；上传魔数嗅探、替换为同键覆盖 |
| 认证 | IdSequence | entityType（PK） | 前缀 ID 发号器（见 5.1） |
| 成员 | User | U | uid 昵称 nickname、phone/email/gender/status(active/frozen)、realName?/citizenId?（实名派生）、wechatOpenid?/wechatUnionid?/wechatVerified?（M3 预留）、frozenUntil?/frozenReason?（解冻清空）、points（挂靠个人身份）、registeredAt/lastActiveAt、bio、activities Json |
| 成员 | UserIdentity | 自增 | userId FK + type(individual/community_individual/community_enterprise/external_enterprise) + enterpriseId?/enterpriseName?/role?/title/level?/experience?；唯一约束 (userId, type, enterpriseId)；社区个体每人至多一条（应用层保证） |
| 成员 | Enterprise | E | industry/size/foundedAt/settledAt/leaseType/status(active/pending/exited/disabled)/showcaseStatus(none/pending/published/rejected)/showcaseComment?/experience?/**contactUserId?（关联个人用户，社区企业必须关联）**/contactTitle/contact*/description/tags/**deletedAt?/deletedBy?**；M1.5 删除=软删归档（存在进行中租约时 409），可在归档管理恢复/彻底删除；不支持自动归档 |
| 成员 | ExternalEnterpriseProfile | XE | 合作企业档案（name/industry/status(active/disabled)/size/foundedAt/description/cooperationCount/firstCooperationAt/**deletedAt?/deletedBy?**）；**ExternalEnterprise 聚合视图 = 档案 + identities(type=external_enterprise 且 enterpriseName 匹配) 派生成员，不建独立表**；删除=软删归档；不支持自动归档 |
| 审核 | Application | AP | type(**settle/individual/cooperation/identity 四类**)/applicantName/applicantPhone/targetName/submittedAt/status/summary/details Json/records Json/**deletedAt?/deletedBy?/archivableAt?**；通过时授予身份（见 8.6） |
| 需求 | Demand | D | 状态机字段 + publisherId/publisherName/publisherIdentity(Json)/contactName?/contactPhone?/contactEmail?/budget/period/deadline/scheduledAt?/publishedAt?/visibilityIdentities[]/visibilityLevels[]/enrollmentIdentities[]/enrollmentLevels[]/respondPoints?/rejectedReason?/projectId?/tags[]/**creatorName?/creatorId?（创建人展示名 / 用户 ID，用户记录聚合按 creatorId∪publisherId）**/**deletedAt?/deletedBy?/archivableAt?** |
| 需求 | DemandRespondent | 自增 | demandId FK + name/enterprise/phone?/email?/quote?/message/at/status(pending/contacted/closed) |
| 项目 | Project | P | code（JY-YYYY-NN）/status(running/paused/closed/finished)/progress/startDate/endDate/initiatedAt/description/memberCount/sourceDemandId?/expReward?/closeReason?/**deletedAt?/deletedBy?/archivableAt?** |
| 项目 | ProjectUndertaker | 自增 | projectId FK + type(enterprise/individual/custom)/refId(企业或用户 ID)/name(展示快照)/share/contactName?/phone?；合计=100 应用层校验 |
| 项目 | Milestone | 自增 | projectId FK + name/status(done/active/todo)/date/owners String[]（承接方展示名） |
| 活动 | CommunityEvent | EV | 状态机字段 + createdAt/startTime/endTime/location/capacity/speaker/host/enrollmentOpen/visibility*/enrollment*/requireReview/enrollmentDeadline?/scheduledAt?/enrollPoints?/checkinPoints?/tags[]/**deletedAt?/deletedBy?/archivableAt?**（自动结束任务写 ended+archivableAt） |
| 活动 | EventEnrollment | 自增 | 复合唯一 (eventId, userId)；userId/name/enterprise/phone/appliedAt/status(pending/approved/rejected)/checkedIn/checkInAt? |
| 账本 | ExperienceRecord | EX | targetType(enterprise/individual)/targetId/delta/balance/reason/at/operator/source(rule/manual) |
| 账本 | PointsRecord | PT | userId FK/delta/balance/reason/at/operator/source(rule/manual/redemption) |
| 商城 | MallGoods | G | name/category(physical/virtual/voucher；字典 goods_category)/points/stock/**status(on/off/restock 三态，库存为 0 记 restock)**/description/redeemedCount/createdAt/**shippingMethods[]/pickupAddress?/shippingFee?（实物发货）**/**visibilityIdentities[]/visibilityLevels[]/orderIdentities[]/orderLevels[]（可见/可下单范围）**/**deletedAt?/deletedBy?/archivableAt?** |
| 商城 | RedemptionOrder | RO | userId/userName(快照)/goodsId/goodsName(快照)/points/status(pending_shipment/shipped/finished/cancelled)/createdAt/shippedAt?/finishedAt?/recipientName?/recipientPhone?/address?/note?/cancelReason?/**deletedAt?/deletedBy?/archivableAt?** |
| 规则 | PointsRule | code（PK） | 9 条固定触发项（见 8.4）；name/scene/description 写死；points 可编辑；status |
| 规则 | ExperienceRule | code（PK） | 6 条固定触发项；同上 |
| 规则 | LevelTier | level（PK） | label/threshold；整组保存、逐级递增校验、1-10 级（种子默认 5 级） |
| 空间 | WorkstationArea | WA | name 唯一/type(open/office/semi)/description/createdAt |
| 空间 | Workstation | WS | seatNo 全岛唯一/**areaId FK**（区域改名无需级联）/type/capacity/status(idle/assigned/maintenance)/enterpriseId?/enterpriseName?/leaseId?（assigned 时）/defaultMonthlyRent?/areaSqm?（office 类型）/note? |
| 空间 | Lease | LS | renterId(enterprise=企业 ID/individual=用户 ID/custom 空)/renterName 快照/renterType/startDate/endDate(longTerm=true 时空串)/longTerm/status(active/terminated)/monthlyRent/rentPeriod(day/week/month/year，缺省 month)/contactName/contactPhone/terminatedAt?/**deletedAt?/deletedBy?/archivableAt?** |
| 空间 | LeaseWorkstation | 复合 (leaseId, workstationId) | 关联表保留历史；办公位当前占用由 Workstation.leaseId 表达 |
| 空间 | Space | S | name/type(meeting/roadshow/meeting_room/multi/study)/capacity/location/openTime/closeTime/allDay?/needReservation?/needApproval?/equipment String[]/status(available/maintenance/disabled)/description/**deletedAt?/deletedBy?** |
| 空间 | SpaceReservation | SR | userId/userName 快照/phone/spaceId/spaceName 快照/date/startTime/endTime/purpose/attendees/status(pending/approved/rejected/cancelled)/submittedAt/records Json/rejectReason?/**deletedAt?/deletedBy?/archivableAt?** |
| 内容 | Article | A / SU | title/**channel(official 社区发布 / submitted 用户投稿；官方 A 前缀，投稿 SU 前缀)**/columnId/columnName 快照/authorId?/authorName/authorIdentity Json/status(**pending/pending_release/scheduled/published/rejected**)/content（富文本，写入 sanitize）/scheduledAt?/publishedAt?/views/summary/tags/createdAt/rejectedReason?/**archivableAt?/deletedAt?/deletedBy?** |
| 内容 | ArticleColumn | CL | name/description/sort/**submissionOpen（开放投稿开关）**/**system（系统保留栏目「未指定」COL_NONE，不可编辑/停用/删除、成员端不可见）**/status(enabled/disabled)/createdAt |
| 内容 | ShowcaseRequest | SC | targetType(enterprise/individual)/targetId?/targetName/contentSummary/submitterName/submitterPhone/submittedAt/status(pending/approved/rejected/cancelled)/records Json/rejectReason? |
| 内容 | Announcement | AN | title/content（富文本 sanitize）/pinned/status(published/withdrawn)/publishedAt/createdAt/updatedAt?/**archivableAt?/deletedAt?/deletedBy?**（删除仅允许已下架，软删） |
| 系统 | AdminNotification | N | type(approval/demand_review/reservation/showcase/article/lease/schedule)/title/content/at/read/link? |
| 系统 | AuditLog | AL | operator/module/action/target/detail?/at/ip?/before Json?/after Json?；查询返回 M0 形状（不含 ip/before/after） |
| 系统 | SystemConfig | 单例(id=1) | siteName/siteSlogan/registrationOpen/mallOpen/demandOpen/reservationOpen/leaseExpireRemindDays(1-90)/**uploadMaxSizeMb(1-100，默认 10；上传与富文本图片共用，dailyLoginPoints 已删除)**/updatedAt/updatedBy |
| 系统 | DictEntry | 复合 (type, code) | type(**demand_category/industry/event_type/goods_category**)/code(DC/IN/ET/GC 前缀自增)/label 全类型唯一/sort/status(enabled/disabled) |
| 系统 | ArchiveSetting | domain（PK） | 归档设置（13 域）：autoArchive/archiveDelayDays(0-365)/autoPurge/purgeDelayDays(1-3650)/archiveStatuses Json?（按状态开关）；企业/合作企业不支持自动归档 |

## 6. 认证与权限

### 6.1 登录与会话（M1.5 R3）

- **图形验证码**：`GET /api/admin/auth/captcha`（`@Public`）→ `{ captchaId, image }`，image 为 `data:image/svg+xml;utf8,...`（4 位、去除 0/O/1/I）；答案存 Redis `captcha:<id>` 5 分钟、**一次性消费**（错误也消费）。
- **登录**：`POST /api/admin/auth/login`（`@Public`）body `{ username, password, captchaId, captchaCode }`——验证码服务端强制校验。账号/密码错误执行**恒时 bcrypt 比较**（用户不存在时用 dummy hash，防枚举）；同一 `ip:username` 连续失败 **5 次锁定 15 分钟**（Redis `auth:login:fail:*` / `auth:login:lock:*`，锁定期返回 429 与剩余分钟数）；停用账号返回 401「账号已停用，请联系超级管理员」。成功返回 `{ token, name, permissions }`（permissions 为当前账号权限码集合，超管为 `['*']`），并更新 `lastLoginAt`、写会话索引与登录日志。
- **JWT**：payload `{ sub: username, name, jti: uuid }`，有效期 2h；密钥取 `JWT_SECRET`（生产缺失启动即抛错，开发默认 `dev-only-change-me`）。
- **登出**：`POST /api/admin/auth/logout` → jti 写 Redis 黑名单 `auth:blacklist:<jti>`（TTL=剩余有效期）+ 移出会话索引 → `{ code: 0 }`。
- **登录日志**：`LoginLog` 三态 `success/fail/locked` + 失败原因；查询 `GET /api/admin/login-logs`（权限 `/logs/login`，支持状态/关键词/时间范围，返回 name=账号展示名、region 由 IP 派生）。
- **在线会话**：Redis `auth:admin:sessions` 单键维护全部在线会话（含 jti/username/name/ip/device/loginAt/exp，TTL 2h 且每次写入刷新）；`GET /api/admin/auth/sessions` 与会话列表权限 `/system/sessions` 可见；`POST /api/admin/auth/sessions/:jti/kick` 强制下线（黑名单 + 移出索引，**目标不存在返回 404**）；`POST /api/admin/auth/sessions/kick-all` 一键强制下线其余全部会话（当前操作者会话保留，返回 `{ code, kicked }` 实际下线数，2026-09-12 新增）。
- **修改密码**：`POST /api/admin/auth/change-password`（原密码校验；新密码 ≥8 位且含字母与数字，不得与原密码相同）→ 失效权限缓存 + **踢出该账号全部会话** + 审计「认证 · 修改密码」。
- **管理员账号联动**：新增管理员未传密码时随机生成 12 位初始密码并一次性返回；编辑角色/停用/重置密码后失效权限缓存并强制下线；系统保留至少一名启用状态的超级管理员，超管角色必须保留 `['*']`，非超管不可分配超出自身权限的权限码。
- **前端约定**：localStorage key `joinyuu_admin_token` 存 JWT，请求头 `Authorization: Bearer <token>`；401 统一跳登录页。
- 审计 operator、审核记录 operator、手动调整流水的 operator 一律取 JWT `name`（M0 固定"社区管理员"的服务端替代）。

### 6.2 RBAC 权限模型（M1.5 R1/R2）

- **权限码 = 菜单路径或 `perm:xxx` 按钮码**，共 **49 码**（种子 `permissionCatalog` 为唯一目录），`*` 为超级管理员全量标记；`@RequirePermission(code | code[])` 支持 any-of 语义；`PermissionGuard` 叠加在 `JwtAuthGuard` 之后，权限集合命中任一所需码或含 `*` 放行，否则 403「无权限执行该操作」；未声明 `@RequirePermission` 的端点仅需登录。
- **覆盖范围**：36 个 controller 中，34 个属于 admin；其中 33 个挂 `@RequirePermission`，`notifications` 有意仅登录。`health` 与 `files`（公开文件读取）为公开 controller。无声明 controller 内的个别端点（如 `GET /enterprises/options`、`GET /users/options`）仅需登录。
- **权限目录（按模块）**：工作台 `/dashboard`；社区成员 `/users`、`/individuals`、`/enterprises`、`/external-enterprises`、`/approvals` + 企业按钮码 `perm:enterprise:create|update|disable|enable|delete`、`perm:external-enterprise:create|update|disable|enable|delete`；业务运营 `/demands`、`/demands/review`、`/projects`、`/events`；空间管理 `/workstations`、`/workstations/offices`、`/workstations/leases`、`/spaces`、`/spaces/reservations`；内容管理 `/contents/publish`、`/contents/submissions`、`/contents/columns`、`/contents/stats`、`/contents/showcase`、`/contents/announcements`；积分商城 `/mall/goods`、`/mall/orders`；规则管理 `/rules/points`、`/rules/experience`、`/rules/levels`、`/rules/ledger`、`/rules/experience-records`；系统管理 `/system/dicts`、`/system/config`、`/logs/audit`、`/system/roles`、`/system/admins`、`/system/sessions`、`/system/assets`、`/system/monitor`、`/logs/login`、`/system/trash`、`/system/export`。
- **内置角色**（`AdminRole` + `AdminRolePermission`）：`super`（`*` 全量）、`operator`（业务运营+内容+商城）、`auditor`（审核类）、`space-ops`（空间域）；角色权限保存即时失效关联管理员的权限缓存（`auth:admin:perms:<username>`，TTL 2h）。
- **权限点目录接口**：`GET /api/admin/permissions/catalog` 按模块分组返回，供角色勾选矩阵渲染。
- 数据范围已按 7 个业务域实现：`AdminRole.dataScope` + `DomainScopeGuard` 对 URL 域做允许/拒绝；当前仍无行级、组织级、所有者级或租户级过滤。

### 6.3 安全加固基线（M1.5）

- **CORS 白名单**：`main.ts` 仅放行 `CORS_ORIGINS`（逗号分隔）或默认 `http://localhost:7758`、`http://127.0.0.1:7758`。
- **上传安全**：magic-byte 嗅探真实 MIME（不信任客户端声明），仅允许 png/jpeg/gif/webp/pdf，**SVG 拒绝**；公开文件响应带 `X-Content-Type-Options: nosniff` 与 `Content-Disposition: inline; filename*=UTF-8''...`；大小限制读 `SystemConfig.uploadMaxSizeMb`（1-100，默认 10）。
- **富文本 XSS**：`sanitize-html` 白名单清洗（见 §4.2），`script/style/iframe/object/embed` 等危险块连内容剔除。
- **导出安全**：CSV 公式注入转义（`= + - @` 开头文本前置单引号），`filename*` 兼容中文。
- **监控降级**：数据库不可用时监控概览仍可打开（DB 状态展示 down，`lastResult` 三态含 `unknown`）；Redis 全部调用 fail-open 回源 DB。

## 7. REST API 清单（冻结契约）

> 以下端点 = `apps/admin/src/api/` 调用面 + M0 冻结状态机 + M1.5 治理端点的汇总，路径/入参/返回形状**不可自行变更**；新增端点须先修订本文档。
> 通用：列表分页/排序约定见 4.3；写操作成功均按第 9 节写审计；所有"仅 XX 状态可操作"为服务端 409 校验。表中仅在需要强调处标注权限码，完整权限矩阵见 §6.2 与代码 `@RequirePermission`。

### 7.1 认证 auth（6）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/auth/captcha | `@Public`：`{ captchaId, image }`（SVG dataURL，Redis 5 分钟一次性） |
| POST | /api/admin/auth/login | `@Public`：`{ username, password, captchaId, captchaCode }` → `{ token, name, permissions }`；验证码错误 400、锁定 429、账号/密码错误 401 |
| POST | /api/admin/auth/logout | 登出（Redis 黑名单 + 移出会话索引）→ `{ code: 0 }` |
| POST | /api/admin/auth/change-password | `{ oldPassword, newPassword }`；新密码 ≥8 位含字母数字；成功后踢出全部会话并审计 |
| GET | /api/admin/auth/sessions | 在线会话列表（权限 `/system/sessions`） |
| POST | /api/admin/auth/sessions/:jti/kick | 强制下线（权限 `/system/sessions`；jti 不存在 404） |
| POST | /api/admin/auth/sessions/kick-all | 一键强制下线其余全部会话，当前操作者会话保留；返回 `{ code: 0, kicked }`（权限 `/system/sessions`；2026-09-12 新增） |

### 7.2 用户与社区个体 users / individuals（10）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/users | query：page/pageSize/keyword(昵称/uid/phone)/status/category(individual=仅基础身份、community_individual、community_enterprise、external_enterprise)/realStatus(verified/unverified) |
| POST | /api/admin/users | 新增用户；body `{ nickname, phone, email, gender, realName?, citizenId?, bio? }`；联系电话不可重复；服务端生成 U 编号、正常状态、0 积分及默认个人用户身份；返回 `{ id }`；审计「社区成员 · 新增用户」 |
| POST | /api/admin/users/:id/reset-password | 管理员强制重置登录密码；body `{ password }`（≥8 位且含字母数字）；直接覆盖 `passwordHash` 并写 `passwordUpdatedAt`；审计「社区成员 · 重置密码」 |
| GET | /api/admin/users/:id | 详情；stats 由 demands/projects/events 实时 COUNT（projects=个人承接或其社区企业承接） |
| GET | /api/admin/users/:id/records | 记录聚合（详情页记录标签）：applications/demands/projects/events/leases/submissions/reservations 七域按用户维度返回；含已归档条目（`deletedAt` 非空） |
| PUT | /api/admin/users/:id | 编辑资料（昵称/联系电话/邮箱/性别/真实姓名/证件号/简介；空串对必填类字段忽略、实名/证件号/简介允许清空）；审计「社区成员 · 编辑用户信息」 |
| PATCH | /api/admin/users/:id/status | `{ status }`；仅解冻路径（status=active 时清空 frozenUntil/frozenReason）；冻结必须走 freeze |
| POST | /api/admin/users/:id/freeze | `{ until?, permanent, reason }`；permanent=false 需 until；reason 必填；已 frozen 报错 |
| GET | /api/admin/users/options | 仅登录：`[{ label: "昵称（uid）", value }]`（跨域表单候选） |
| GET | /api/admin/individuals | 社区个体=持 community_individual 身份的用户；query：page/pageSize/keyword/status |

### 7.3 社区企业 enterprises（10）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/enterprises | query：page/pageSize/keyword(名称/ID)/industry/status（active/pending/exited/disabled）；默认过滤已归档 |
| GET | /api/admin/enterprises/options | 仅登录：`[{ label: "名称（ID）", value }]` |
| POST | /api/admin/enterprises | 权限 `perm:enterprise:create`：body name/industry/size/leaseType/**contactUserId（必填）** + contactTitle?/foundedAt?/settledAt?/description?/tags?；联系人姓名/电话/邮箱由 contactUserId 解析；联系人同时写入 community_enterprise 身份；返回 `{ id }`（E 前缀、创建即正常态） |
| GET | /api/admin/enterprises/:id | 详情含成员列表（identities type=community_enterprise 派生，含 stats） |
| GET | /api/admin/enterprises/:id/stats | 数据概览：需求发布量（publisherIdentity.enterpriseId 匹配）/项目承接量（undertaker 匹配） |
| PUT | /api/admin/enterprises/:id | 权限 `perm:enterprise:update`：可改 name/industry/size/leaseType/contactUserId/contactTitle/foundedAt/description/tags；改名同步成员身份企业名；联系人职位同步成员身份 |
| POST | /api/admin/enterprises/:id/disable | 权限 `perm:enterprise:disable`：status → disabled；停用后不可创建新租约 |
| POST | /api/admin/enterprises/:id/enable | 权限 `perm:enterprise:enable`：status → active |
| DELETE | /api/admin/enterprises/:id | 权限 `perm:enterprise:delete`：**归档（软删）**；存在进行中租约时 409「该企业存在关联租约，请先终止租约」；可在归档管理恢复/彻底删除 |
| PATCH | /api/admin/enterprises/:id/showcase-status | 权限 `perm:enterprise:update`：`{ status: pending/published/rejected, comment? }`（rejected 必填 comment） |

### 7.4 合作企业 external-enterprises（10）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/external-enterprises | 聚合视图（档案 + 派生成员）；query：page/pageSize/keyword/industry/status(active/disabled)/sortBy(cooperationCount/firstCooperationAt)；默认过滤已归档 |
| POST | /api/admin/external-enterprises | 权限 `perm:external-enterprise:create`：body name/industry 必填 + size?/foundedAt?/description?；返回 `{ id }`（XE 前缀、合作 0、首次合作为当月） |
| GET | /api/admin/external-enterprises/:id | 详情含关联成员（external_enterprise 身份 enterpriseName 匹配档案名） |
| GET | /api/admin/external-enterprises/:id/stats | 需求（publisherIdentity.enterpriseName 匹配）/项目（成员以个人身份承接） |
| PUT | /api/admin/external-enterprises/:id | 权限 `perm:external-enterprise:update`：name/industry/size/foundedAt/description；改名时成员身份 enterpriseName 同步迁移 |
| POST | /api/admin/external-enterprises/:id/disable | 权限 `perm:external-enterprise:disable` |
| POST | /api/admin/external-enterprises/:id/enable | 权限 `perm:external-enterprise:enable` |
| DELETE | /api/admin/external-enterprises/:id | 权限 `perm:external-enterprise:delete`：**归档（软删）** |
| POST | /api/admin/external-enterprises/:id/members | 权限 `perm:external-enterprise:update`：body `{ userId, title? }`；重复绑定 409 |
| DELETE | /api/admin/external-enterprises/:id/members/:userId | 权限 `perm:external-enterprise:update`：移除关联成员 |

### 7.5 申请审核 applications（5）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/applications | **四类**：settle/individual/cooperation/identity；query：page/pageSize/type/status；默认过滤已归档；附带 applicantId（按联系电话匹配用户，未匹配 null） |
| GET | /api/admin/applications/:id/print | 审核单打印数据（标题/生成时间/申请详情 + applicantId） |
| POST | /api/admin/applications/:id/approve | `{ comment? }`；通过 → 按类型授予申请人身份（见 8.6）+ 企业/合作企业联动 + 首绑积分与经验值（仅真正新增身份时） |
| POST | /api/admin/applications/:id/reject | `{ comment? }` |
| POST | /api/admin/applications/:id/archive | 仅 approved/rejected 可归档（软删） |

### 7.6 需求 demands（16，含跨域选项端点）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/demands | query：page/pageSize/keyword(标题/ID)/category/status/publisherId/enterprise(社区企业按 enterpriseId、合作企业按档案名)/sortBy(createdAt 默认、publishedAt 空值排最后、id)/sortOrder；默认过滤已归档 |
| GET | /api/admin/demands/:id | 详情含 respondents |
| POST | /api/admin/demands | DemandCreatePayload（publisherType: individual/enterprise/custom + publisherId + 表单字段）；**创建即 pending_release**，creatorName=登录管理员；publisherIdentity 快照按 8.7 解析；预算未填自动"面议" |
| PUT | /api/admin/demands/:id | 编辑（pending_release/published 可用，不改状态） |
| POST | /api/admin/demands/:id/approve | pending → pending_release |
| POST | /api/admin/demands/:id/reject | `{ reason }` 必填 → rejected + archivableAt |
| POST | /api/admin/demands/:id/publish-now | pending_release → published（写 publishedAt） |
| POST | /api/admin/demands/:id/schedule | `{ scheduledAt }`：pending_release → scheduled |
| POST | /api/admin/demands/:id/cancel-schedule | scheduled → pending_release |
| POST | /api/admin/demands/:id/retract | published → pending_release（清 publishedAt/scheduledAt） |
| PATCH | /api/admin/demands/:id/status | `{ status: "closed" }`（pending_release/published 可关闭；写 archivableAt） |
| POST | /api/admin/demands/:id/archive | 仅 rejected/closed/projected 可归档（软删） |
| POST | /api/admin/demands/:id/proxy-respond | `{ userName, enterprise, phone, email?, quote?, message? }`（仅 published/projected；message 空记"管理员代报名"；联系电话必填） |
| POST | /api/admin/demands/:id/initiate-project | ProjectInitPayload；创建项目 + 双向关联（demand.projectId ↔ project.sourceDemandId）→ projected + archivableAt |
| GET | /api/admin/demands/undertaker-options | 承接方候选（社区企业/合作企业/社区个体/个人用户，value=`enterprise:E*`/`enterprise:XE*`/`individual:U*`） |
| GET | /api/admin/publisher-options | 独立 controller：`{ users: [...], enterprises: [...] }` 含联系电话（自动填充用）；权限（`/demands`、`/enterprises`、`/contents/publish` 任一） |

### 7.7 项目 projects（8）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/projects | query：page/pageSize/keyword(名称/code)/status/participant(个人承接或其社区企业承接)/enterprise(社区企业按承接方 ID；合作企业按成员个人承接)/sortBy(initiatedAt 默认、id)/sortOrder；默认过滤已归档 |
| GET | /api/admin/projects/:id | 详情含 undertakers/milestones |
| POST | /api/admin/projects | ProjectInitPayload（承接方≥1、share 合计 100、custom 需 name/contactName/phone）；创建即 running、progress=0、code=`JY-YYYY-NN` 按年原子递增 |
| PUT | /api/admin/projects/:id | 编辑（finished 强制 409；其余状态可编辑；不改状态/编号/进度；承接方与里程碑整体重建，里程碑重置为 todo） |
| POST | /api/admin/projects/:id/pause | running → paused |
| POST | /api/admin/projects/:id/resume | paused → running |
| POST | /api/admin/projects/:id/close | `{ reason }` 必填；paused → closed + archivableAt |
| POST | /api/admin/projects/:id/archive | 仅 finished/closed 可归档（软删） |

> 注：pause/resume/close 在 M0 stub 中无 TODO 注释但为冻结状态机契约（wiki-admin-web.md §项目状态机）；结项 finished 由里程碑全部达成驱动（M1 实现：全部 milestone=done 时置 finished 并按 8.5 分配经验值）。

### 7.8 活动 events（13）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/events | query：page/pageSize/keyword(标题/ID)/type/status/participant(报名记录含该用户)/sortBy(id 默认倒序、startTime、createdAt)/sortOrder；默认过滤已归档 |
| GET | /api/admin/events/:id | 详情含 enrollments（到点状态流转先行派生） |
| POST | /api/admin/events | 创建即 pending_release、enrollmentOpen=false；表单无定时发布选项 |
| PUT | /api/admin/events/:id | 编辑（pending_release/published 可编辑，published 不动状态/已有报名；scheduled/ended/cancelled 不可） |
| POST | /api/admin/events/:id/publish-now | pending_release → published + enrollmentOpen=true |
| POST | /api/admin/events/:id/schedule | `{ scheduledAt }`：pending_release → scheduled |
| POST | /api/admin/events/:id/cancel-schedule | scheduled → pending_release |
| PATCH | /api/admin/events/:id/enrollment | published 状态切换 enrollmentOpen（报名中/暂停报名） |
| POST | /api/admin/events/:id/cancel | pending_release/published → cancelled + archivableAt |
| POST | /api/admin/events/:id/restore | cancelled → pending_release |
| POST | /api/admin/events/:id/archive | 仅 ended/cancelled 可归档（软删） |
| POST | /api/admin/events/:id/enrollments/:userId/review | `{ status: approved/rejected }`；approved 触发积分 activity_enroll_approved（报名积分 = enrollPoints ?? 规则值） |
| POST | /api/admin/events/:id/checkin | `{ userId }`；签到触发积分 activity_checkin + 经验值 activity_checkin（签到积分 = checkinPoints ?? 规则值） |

### 7.9 账本 ledgers（4）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/experience-records | query：targetType(enterprise/individual)/targetId；最新在前；权限 `/rules/experience-records` |
| POST | /api/admin/experience-records | body `{ targetType, targetId, delta, reason }`：非零整数；扣减不致负；写流水（source=manual、operator=登录管理员）；返回 `{ code: 0, balance }` |
| GET | /api/admin/points-records | query：userId；最新在前；权限 `/rules/ledger` |
| POST | /api/admin/points-records | body `{ userId, delta, reason }`：同上；积分挂靠用户（个人身份）；返回 `{ code: 0, balance }` |

### 7.10 商城 mall（14）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/mall/goods | query：page/pageSize/keyword(名称/ID)/category/status/sortBy(id 默认倒序、points、createdAt)/sortOrder；默认过滤已归档；权限 `/mall/goods` |
| POST | /api/admin/mall/goods | 创建（stock=0 即 restock，否则 off）；商品含发货方式/自提地址/运费/可见与可下单范围；描述 sanitize |
| PUT | /api/admin/mall/goods/:id | 编辑（不影响已有订单）；库存归零 → restock，补货后由 restock 回落为 off |
| POST | /api/admin/mall/goods/:id/toggle-status | 上架↔下架（下架写 archivableAt，重新上架清除） |
| POST | /api/admin/mall/goods/:id/archive | 仅已下架（off）可归档（软删） |
| GET | /api/admin/mall/redemption-orders | query：page/pageSize/keyword(用户名/商品名/ID)/status/sortBy(id 默认、createdAt)/sortOrder；默认过滤已归档；权限 `/mall/orders` |
| POST | /api/admin/mall/redemption-orders/:id/ship | pending_shipment → shipped |
| POST | /api/admin/mall/redemption-orders/:id/finish | shipped → finished + archivableAt |
| POST | /api/admin/mall/redemption-orders/:id/archive | 仅 finished 可归档（软删） |
| POST | /api/admin/mall/redemption-orders/:id/cancel | 仅 pending_shipment；**事务**：退回积分（写 source=redemption 流水）+ 库存回补 + redeemedCount-1 + 记 cancelReason（固定文案） |
| GET | /api/admin/mall/points-rules | 9 条固定项按 code 排序；权限 `/rules/points` |
| PUT | /api/admin/mall/points-rules/:code | `{ points }` 正整数；name/scene/description 不可改 |
| POST | /api/admin/mall/points-rules/:code/toggle-status | 启用↔停用 |
| GET | /api/admin/mall/points-issuance | 仅 source=rule 的积分流水（发放记录页）；权限 `/rules/ledger` |

### 7.11 规则 rules（6）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/rules/experience | 6 条固定项按 code 排序；权限 `/rules/experience` |
| PUT | /api/admin/rules/experience/:code | `{ exp }` 正整数 |
| POST | /api/admin/rules/experience/:code/toggle-status | 启用↔停用 |
| GET | /api/admin/rules/experience-issuance | 仅 source=rule 的经验流水；权限 `/rules/experience-records` |
| GET | /api/admin/rules/levels | 等级梯度 level 升序；权限 `/rules/levels` |
| PUT | /api/admin/rules/levels | 整组保存 body `{ tiers: [{ level, label, threshold }] }`（前端函数签名收数组、请求时包一层）；1-10 级、门槛逐级递增；梯度变更仅影响后续结算 |

### 7.12 办公位与租约 workstations（17，含选项与打印）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/workstations | 全量办公位（含 areaId→area 名，平面图分组）；权限 `/workstations` |
| POST | /api/admin/workstations | `{ area, seatNo, type, capacity, note?, defaultMonthlyRent?, areaSqm? }`——**area 为区域名称字符串**（服务端按名解析 areaId，不存在报"所属区域不存在"）；seatNo 全岛唯一；创建即 idle；areaSqm 仅 office 类型保存 |
| PUT | /api/admin/workstations/:id | 资料编辑（不改分配/维护状态；body 同 POST，area 为区域名） |
| DELETE | /api/admin/workstations/:id | assigned 不可删；删除后 LeaseWorkstation 关联由级联清理 |
| POST | /api/admin/workstations/:id/status | `{ status: idle/maintenance }`；assigned 不可直接标记 |
| GET | /api/admin/workstation-areas | 区域列表；权限 `/workstations/offices` |
| POST | /api/admin/workstation-areas | `{ name, type, description }`；name 唯一 |
| PUT | /api/admin/workstation-areas/:id | 编辑；改名无需级联（外键化） |
| DELETE | /api/admin/workstation-areas/:id | 仅区域下无办公位时可删 |
| GET | /api/admin/workstation-leases | 全量租约最新在前（默认过滤已归档）；expiring/expired 读取派生（15 天窗口，longTerm 不参与）；权限 `/workstations/leases` |
| GET | /api/admin/workstation-leases/:id | 租约详情（不过滤已归档，供用户记录等入口查看历史） |
| POST | /api/admin/workstation-leases | LeasePayload；**事务**：校验办公位 idle → 建租约 → 办公位置 assigned + enterprise/lease 回填；renterType=enterprise/individual 校验 ID 存在（企业停用时 400） |
| PUT | /api/admin/workstation-leases/:id | 续期/租金/联系人；terminated 不可编辑；换办公位不支持（终止重建） |
| POST | /api/admin/workstation-leases/:id/terminate | **事务**：租约 terminated + terminatedAt/archivableAt + 释放全部关联办公位 |
| POST | /api/admin/workstation-leases/:id/archive | 仅 terminated 可归档（软删） |
| GET | /api/admin/renter-options | `{ users: [...], enterprises: [...] }` 含联系电话（自动填充） |
| GET | /api/admin/leases/:id/print | 租约打印单（标题/生成时间/租约详情/条款），复用租约数据无新表 |

### 7.13 公共空间 spaces（10）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/spaces | 全量按 ID 升序；权限 `/spaces` |
| GET | /api/admin/spaces/usage-board | query：date；当日已通过预约 + 同名空间已发布活动合并占用（source 区分） |
| GET | /api/admin/spaces/:id | 详情含预约列表（空间详情页日历/明细用） |
| POST | /api/admin/spaces | 创建即 available；allDay 时存 00:00/23:59；needApproval 联动 needReservation |
| PUT | /api/admin/spaces/:id | 编辑基础信息（状态走独立接口） |
| POST | /api/admin/spaces/:id/status | `{ status: available/maintenance/disabled }` |
| GET | /api/admin/space-reservations | query：page/pageSize/keyword(用户/空间/ID)/spaceId/status/date；默认过滤已归档；权限 `/spaces/reservations` |
| POST | /api/admin/space-reservations/:id/review | `{ status, comment? }`；approved 前冲突校验（见 8.8）；重复审核报错；写审核时间线；rejected 写 archivableAt |
| POST | /api/admin/space-reservations/:id/cancel | pending/approved 可取消 + archivableAt |
| POST | /api/admin/space-reservations/:id/archive | 仅已结束（approved 且日期时段已过）/rejected/cancelled 可归档（软删） |

### 7.14 内容 contents / announcements（24）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/contents/articles | query：page/pageSize/keyword(标题/作者/ID)/columnId/channel(official/submitted)/status/sortBy(id 默认、views、createdAt)/sortOrder；默认过滤已归档；权限（`/contents/publish`、`/contents/submissions` 任一） |
| POST | /api/admin/contents/articles | 权限 `/contents/publish`：ArticlePayload（title/columnIds（单选取首个）/authorId?/summary/content/tags）；**official 创建即 pending_release、submitted 创建即 pending**；投稿 ID 走 `SU` 前缀、官方走 `A`；authorIdentity 取社区个体优先否则 individual；正文 sanitize 并反查绑定素材来源 |
| PUT | /api/admin/contents/articles/:id | 权限 `/contents/publish`：仅 pending_release/scheduled/rejected 可编辑；rejected 修改后回 pending（重新入投稿审核队列） |
| POST | /api/admin/contents/articles/:id/review | 权限 `/contents/submissions`：`{ status: approved/rejected, comment? }`；仅 pending 可审核；approved → pending_release，rejected 必填原因；均写 archivableAt |
| POST | /api/admin/contents/articles/:id/publish | 权限 `/contents/publish`：pending_release/scheduled → published + publishedAt |
| POST | /api/admin/contents/articles/:id/schedule | 权限 `/contents/publish`：`{ scheduledAt }`；仅 pending_release → scheduled（须晚于当前时间） |
| POST | /api/admin/contents/articles/:id/cancel-schedule | 权限 `/contents/publish`：scheduled → pending_release |
| POST | /api/admin/contents/articles/:id/withdraw | 权限 `/contents/publish`：published → pending_release（清 publishedAt/scheduledAt） |
| DELETE | /api/admin/contents/articles/:id | 权限 `/contents/publish`：仅 pending/rejected/pending_release **软删归档** |
| GET | /api/admin/contents/columns | 按 sort 升序，含文章数聚合；权限 `/contents/columns` |
| POST | /api/admin/contents/columns | 创建即启用；body 含 submissionOpen（开放投稿） |
| PUT | /api/admin/contents/columns/:id | 编辑；改名同步刷新文章 columnName 快照；系统保留栏目不可编辑 |
| POST | /api/admin/contents/columns/:id/toggle-status | 启用↔停用（停用后新文章不可选；系统保留栏目不可停用） |
| POST | /api/admin/contents/columns/:id/toggle-submission | 开放↔关闭投稿开关 |
| DELETE | /api/admin/contents/columns/:id | 删除栏目；其文章自动转移至系统保留栏目「未指定」（COL_NONE）；系统保留栏目不可删除 |
| GET | /api/admin/contents/showcase-requests | query：page/pageSize/targetType/status；权限 `/contents/showcase` |
| POST | /api/admin/contents/showcase-requests/:id/review | `{ status, comment? }`；**联动 Enterprise.showcaseStatus**（published/rejected）+ 审核时间线 |
| GET | /api/admin/announcements | 置顶优先，其余发布时间倒序；默认过滤已归档；权限 `/contents/announcements` |
| POST | /api/admin/announcements | 创建即发布（写 publishedAt，正文 sanitize） |
| PUT | /api/admin/announcements/:id | 编辑（不改状态/发布时间） |
| POST | /api/admin/announcements/:id/withdraw | published → withdrawn + archivableAt |
| POST | /api/admin/announcements/:id/publish | 重新发布（withdrawn → published，更新 publishedAt） |
| POST | /api/admin/announcements/:id/toggle-pin | 置顶↔取消 |
| DELETE | /api/admin/announcements/:id | 仅已下架公告可归档（软删） |

### 7.15 系统管理 system（32，另含 1 个公开文件读取，不计入）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/notifications | 最新在前；仅登录（有意不挂权限码） |
| POST | /api/admin/notifications/:id/read | 单条已读（幂等） |
| POST | /api/admin/notifications/read-all | 全部已读 |
| GET | /api/admin/audit-logs | query：page/pageSize/keyword(target/action/detail/operator)/module 精确筛选；权限 `/logs/audit` |
| GET | /api/admin/system/config | 单例配置（走 `config:system` 缓存 10min）；权限 `/system/config` |
| PUT | /api/admin/system/config | 保存即生效；leaseExpireRemindDays 1-90、uploadMaxSizeMb 1-100；记 updatedBy/updatedAt + before/after 审计 |
| GET | /api/admin/dicts/:type | 按 sort 升序（管理页返回全量含 disabled）；type 四类 demand_category/industry/event_type/goods_category；权限 `/system/dicts` |
| POST | /api/admin/dicts/:type | `{ label }`；label 全类型唯一；创建即启用（code 按类型前缀 DC/IN/ET/GC 自增） |
| POST | /api/admin/dicts/:type/:code/toggle-status | 启用↔停用 |
| DELETE | /api/admin/dicts/:type/:code | 删除并重排同类型 sort；历史引用值不受影响 |
| GET | /api/admin/roles | 角色列表（含权限码集合）；权限 `/system/roles` |
| POST | /api/admin/roles | 新增自定义角色 `{ code, name, description? }`（2026-09-12 新增）；code 小写字母开头仅含小写字母/数字/下划线（2-32）且唯一（409）、不可用内置 `super`（400）、名称唯一（409）；ID 走 R 前缀发号、sort 追加、初始无权限点；审计「RBAC · 新增角色」 |
| PUT | /api/admin/roles/:id/permissions | `{ permCodes }`；超管角色仅超管可改且必须保留 `['*']`；非超管不可越权分配；变更即时失效关联管理员权限缓存 |
| GET | /api/admin/permissions/catalog | 权限点目录（按模块分组）；权限 `/system/roles` |
| GET | /api/admin/admins | query keyword(username/name)；权限 `/system/admins` |
| POST | /api/admin/admins | `{ username, name, roleCodes, password? }` → `{ id, initialPassword? }`（未传密码随机生成 12 位） |
| PUT | /api/admin/admins/:id | `{ name, roleCodes }`；保留至少一名启用超管；编辑后权限缓存失效 + 强制下线 |
| PATCH | /api/admin/admins/:id/status | `{ status: active/disabled }`；停用强制下线 |
| POST | /api/admin/admins/:id/reset-password | `{ password }`（≥8 位含字母数字）；重置后强制下线 |
| GET | /api/admin/login-logs | query：page/pageSize/status(success/failed/locked)/keyword/startDate/endDate；权限 `/logs/login` |
| GET | /api/admin/monitor/overview | 服务/DB/Redis 健康指标 + 定时任务最近执行状态；权限 `/system/monitor` |
| GET | /api/admin/monitor/cron-logs | 定时任务执行日志（jobName 可选，最新 100 条） |
| POST | /api/admin/monitor/jobs/:name/run | 手动触发任务执行（写 SchedulerLog，失败透出 500「任务执行失败：...」） |
| GET | /api/admin/trash | 已归档列表（跨域聚合）：query page/pageSize/domain(标签页)/keyword(标题/编号)；按 deletedAt 倒序；权限 `/system/trash` |
| GET | /api/admin/trash/settings | 13 个标签页的归档设置（含 autoArchiveSupported 与可归档状态列表） |
| PUT | /api/admin/trash/settings/:domain | `{ autoArchive?, archiveDelayDays?, autoPurge?, purgeDelayDays?, archiveStatuses? }`；企业/合作企业开启自动归档报 400 |
| POST | /api/admin/trash/:domain/:id/restore | 恢复对象（限定 deletedAt 非空；清空软删标记） |
| POST | /api/admin/trash/:domain/:id/purge | 彻底删除（物理删 + 审计；外键冲突 409「存在关联数据，无法彻底删除」） |
| GET | /api/admin/export/:domain | CSV 附件流：域 users/demands/projects/events/orders/audit-logs；query keyword/status/startDate/endDate；UTF-8 BOM + 公式注入转义；权限 `/system/export` |
| GET | /api/admin/assets | query bizType；最新在前；权限 `/system/assets` |
| POST | /api/admin/assets | multipart（字段 file，bizType?）；魔数嗅探 + 系统配置大小上限；落库失败补偿删对象；审计「素材库 · 上传素材」 |
| POST | /api/admin/assets/:id/replace | 替换素材（同存储键覆盖，引用方 URL 不变、内容即时生效；文件类型须与原文件一致） |
| DELETE | /api/admin/assets/:id | 删除素材（删库 + 删存储对象，存储删除失败仅告警） |
| GET | /api/public/files/:key | `@Public`：按存储键读取素材（`nosniff` + `Content-Disposition` + `no-cache` 协商，替换后即时生效） |

### 7.16 工作台 dashboard（3）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/dashboard | `{ stats: { pendingApplications, totalUsers, activeEnterprises, runningProjects, upcomingEvents }, todos, pendingApplications(前5), upcomingEvents(前4，未结束已发布按开始时间升序) }`；聚合缓存 60s；权限 `/dashboard` |
| GET | /api/admin/todos | 六域待办聚合：入驻/合作/身份审核、需求审核、空间预约审核、展示页发布、文章审核、临期租约（窗口取 SystemConfig.leaseExpireRemindDays），`[{ key, title, description, count, route }]` |
| GET | /api/admin/dashboard/trend | query `days`（默认 30，范围 3-90）；按日聚合 `{ date(M-DD), members, demands, events, points }`（含补零） |

**端点总计：191**（`/api/admin/**`；另有 `GET /api/health`、`GET /api/public/files/:key` 两个 `@Public` 端点，未计入）。

## 8. 业务规则服务端化

### 8.1 状态机校验矩阵（服务端 409 强制）

- **需求**：`pending →(approve)→ pending_release →(publish-now | schedule)→ published | scheduled →(到点)→ published`；`pending →(reject)→ rejected`；`pending_release/published →(close)→ closed`；`published →(retract)→ pending_release`、`published →(initiate-project)→ projected`；`scheduled →(cancel-schedule)→ pending_release`。编辑约束：仅 pending_release/published 可编辑且不改状态。归档：仅 rejected/closed/projected。
- **活动**：`pending_release →(publish-now | schedule)→ published | scheduled →(到点)→ published`；`published →(endTime 过)→ ended`（定时任务，写 archivableAt）；`pending_release/published →(cancel)→ cancelled`（写 archivableAt）；`cancelled →(restore)→ pending_release`；published 内 enrollmentOpen 开关。编辑约束：scheduled/ended/cancelled 不可编辑。归档：仅 ended/cancelled。
- **项目**：`running ↔ paused`；`paused →(close)→ closed`（写 archivableAt）；closed 只读（可"重新创建"=复制预填，生成新 P 编号）；里程碑全 done → finished（结项，见 8.5，写 archivableAt）；finished 不可编辑。归档：仅 finished/closed。
- **文章**：`pending(投稿待审核) →(review approved)→ pending_release | (rejected)→ rejected`；`pending_release →(publish | schedule)→ published | scheduled`；`scheduled →(cancel-schedule)→ pending_release`；`rejected →(编辑保存)→ pending`（重新入审核队列）；`published →(withdraw)→ pending_release`。官方文章创建即 pending_release、投稿创建即 pending。归档：仅 pending/rejected/pending_release 可删除（软删）。
- **申请/预约/展示页**：`pending → approved | rejected`；预约另有 `pending/approved → cancelled`。归档：申请仅 approved/rejected；预约为已结束/rejected/cancelled。
- **商品/订单**：`on ↔ off`（下架写 archivableAt、上架清除；stock=0 置 restock，补货后回落 off）；`pending_shipment → shipped → finished`；`pending_shipment → cancelled`（事务退款）；归档：商品仅 off、订单仅 finished。
- **办公位/租约**：办公位 idle ↔ maintenance（直接切换）；assigned 仅经租约创建/终止进入/退出；租约 active → terminated（事务释放办公位）；归档：仅 terminated。
- **实现方式**：每域 Service 内显式状态/前置校验，非法流转抛 409（文案="仅 XX 的 XX 可 XX"，与 M0 一致）；每个归档端点同样校验可归档状态，不做通用状态机框架。

### 8.2 定时任务（@nestjs/schedule，单实例，共 6 个）

| 任务名 | 频率 | 逻辑 |
|---|---|---|
| demands-events-scheduled-publish | 每 30 秒 | `demands/events` 中 status=scheduled 且 scheduledAt≤now 且未归档 → published（活动同时 open 报名）+ 写 schedule 通知，事务内完成 |
| articles-scheduled-publish | 每 30 秒 | `articles` 中 status=scheduled 且 scheduledAt≤now 且未归档 → published + publishedAt + 写 schedule 通知 |
| events-auto-end | 每 5 分钟 | status=published 且 endTime≤now 且未归档 → ended + archivableAt |
| lease-expiring-notify | 每日 09:00 | status=active 且非长期租约 endDate 落在临期窗口（SystemConfig.leaseExpireRemindDays，默认 15）→ 写 lease 通知（同一租约同日去重） |
| archive-auto-archive | 每 5 分钟 | 按 ArchiveSetting：autoArchive 开启且对应状态开启、`archivableAt + archiveDelayDays` 已过 → 写 deletedAt/deletedBy（操作人「系统自动归档」） |
| archive-auto-purge | 每 5 分钟 | 按 ArchiveSetting：autoPurge 开启且 `deletedAt + purgeDelayDays` 已过 → 物理删除（外键冲突跳过，等待人工处理） |

- 每次执行写 `SchedulerLog`（jobName/startedAt/finishedAt/durationMs/status/detail/rowsAffected），监控页读取；`POST /api/admin/monitor/jobs/:name/run` 可手动触发（执行失败透出 500）。
- 单实例部署无需分布式锁；读取派生（expiring/expired）与定时通知并存：派生保证展示实时性，任务只负责通知。

### 8.3 事务边界（必须 `prisma.$transaction`）

1. 租约创建（校验+建租约+锁定办公位）/ 租约终止（终止+释放办公位）
2. 兑换订单取消（退积分流水+回补库存+订单状态）
3. 手动积分/经验调整（余额更新+流水写入）
4. 积分/经验规则发放（引擎内统一）
5. 需求立项（建项目+承接方/里程碑子表+需求关联，与项目创建共用宿主事务）
6. 审核通过授予身份（申请状态+身份写入+企业/合作企业创建激活）
7. 项目结项经验分配（状态+经验值+等级+流水）
8. 栏目删除（文章转移至「未指定」+ 删除栏目）；词典删除（删除+sort 重排）

### 8.4 积分发放引擎（PointsEngineService）

- **9 条固定规则**（code 写死，仅 points 值与启停可编辑）：`activity_checkin`(+10)、`activity_enroll_approved`(+5)、`article_accepted`(+30，投稿采纳)、`demand_published`(+15)、`demand_responded`(+20，发放给响应成员)、`demand_undertaken`(+200)、`project_milestone`(+100)、`identity_first_bind`(+50)、`daily_login`(+1，默认停用，M2 生效)。
- **当前已接线触发点（服务端）**：活动报名审核通过（`activity_enroll_approved`，enrollPoints ?? 规则值）、活动签到（`activity_checkin`，checkinPoints ?? 规则值）、审核通过授予身份（`identity_first_bind`，仅真正新增身份时）。**其余规则随 M2 客户端行为落地**（需求发布、响应需求、承接立项、里程碑；管理员代报名为运营代操作不发放）。
- 活动自定义积分值（enrollPoints/checkinPoints 非空）走服务内直写事务（复刻引擎事务模式，source=rule）；缺省走引擎规则值。
- **发放流程**：读规则（Redis 缓存，与规则管理页共用键）→ status=enabled → 事务内：余额 += points → 写流水（source=rule、operator="系统"、balance=新余额）。
- 等级结算：经验值变动后按 LevelTier 门槛重算 level（仅社区个体/社区企业身份持有 level 字段）。

### 8.5 经验值规则与项目结项分配

- **6 条固定规则**：`activity_checkin`(+5)、`activity_enroll_approved`(+2)、`article_accepted`(+20，投稿采纳)、`project_undertaken`(+30)、`project_completed`(+100)、`identity_first_bind`(+10)。
- **当前已接线**：签到（引擎 individual 身份）、首绑（引擎 enterprise/individual）、项目结项（`finishProject` 直写事务）。
- **项目结项**（里程碑全 done → finished）：总经验值 = expReward ?? 规则值（规则停用则 0）；按承接占比分配给 **type=enterprise（社区企业）与 type=individual 且结项时持社区个体身份的承接方**；合作企业/无社区个体身份个人/custom 不参与，**份额丢弃不转移**；除不尽向下取整，余数给首个参与方。
- 归属：企业 → Enterprise.experience（并同步该企业成员身份 level）；社区个体 → UserIdentity.experience（该身份行）。
- 等级梯度种子默认 5 级（青铜 0 / 白银 100 / 黄金 300 / 铂金 600 / 钻石 1000），整组保存最多 10 级。

### 8.6 审核通过授予身份（grantIdentity 服务端化，四类）

- 按申请人 phone 匹配 User（未注册申请者不授予，仅改申请状态）。
- `settle`：企业不存在则**自动创建**（industry="综合"、status=active、contactUserId=申请人、leaseType 由「申请空间」推算、settledAt=当天）→ 存在则 active + 补 settledAt → 申请人追加 community_enterprise 身份（role=member、level=1、experience=0，去重）。
- `individual`：申请人追加 community_individual 身份（title 取 targetName 头衔或「社区个体」，去重）。
- `cooperation`：按 targetName 企业名**复用或新增合作企业档案**（industry/规模/成立时间取自申请表单）→ 申请人追加 external_enterprise 身份（去重）。
- `identity`：targetName 按"企业名 · 头衔"解析 → 目标在社区企业名单则追加 community_enterprise 身份；否则追加 external_enterprise 身份（档案缺失自动新增）。
- 首次授予任意非 individual 身份（即真正新增身份行）→ 触发 `identity_first_bind` 积分 + 经验值（启用时）；企业类同时给企业发首绑经验值。

### 8.7 需求发布方身份快照（resolvePublisherIdentity 服务端化）

- enterprise 提交 → 社区企业（E 前缀）写完整社区企业身份快照，合作企业（XE 前缀）写 `external_enterprise` 快照；individual 提交 → 持社区个体身份则标社区个体，否则一律"个人用户"（**不因同时持有企业身份而自动归入**）；custom → 表单传入快照或 null。
- 创建需求的 `creatorName` 取登录管理员名，种子数据中 `creatorName` 取联系人/发布人、`creatorId` 取发布用户 UID 或按联系人联系电话回查；用户记录聚合按 `creatorId ∪ publisherId` 匹配。

### 8.8 空间预约冲突校验（审核通过前）

- 同空间同日**已通过预约**时段重叠（`start < other.end && other.start < end`，排除已归档）→ 409"该时段已有已通过的预约，无法重复占用"。
- 同名空间当日**已发布社区活动**（location=空间名、日期=预约日）时段重叠 → 409"该时段被社区活动占用，无法通过"。
- 重复审核（非 pending）报 409「该预约已处理，请勿重复审核」。

### 8.9 快照与联动的既有口径（服务端保持）

- 栏目改名 → 刷新文章 columnName；栏目删除 → 文章转移至保留栏目「未指定」；办公位区域改名 → 无需级联（外键化）；企业展示页审核 → Enterprise.showcaseStatus + comment；解冻 → 清冻结字段；撤回发布 → 清 publishedAt/scheduledAt；终止租约 → 释放办公位并清 enterprise/lease 冗余。

### 8.10 归档体系（M1.5 R12，归档管理）

- **软删除语义**：归档 = 对 `deletedAt/deletedBy` 赋值（各域归档端点与自动归档任务写入），记录从业务列表消失但保留在归档管理页；`deletedAt` 为"已归档标记"，`archivableAt` 为"可归档计时起点"（见 §5.1）。
- **13 个标签页**（与 `TrashService` DOMAIN_DEFS、Seed 13 条 ArchiveSetting、前端归档管理一致）：社区企业 / 合作企业 / 资讯发布 / 投稿内容 / 公告栏 / 需求 / 项目 / 活动 / 租赁 / 空间预约 / 商品 / 商城订单 / 申请审核。共享 Article 模型的资讯与投稿按 `channel` 拆分两个标签页。
- **可归档状态**：资讯=待发布；投稿=待发布/已驳回；公告=已下架；需求=已驳回/已关闭/已立项；项目=已结项/已关闭；活动=已结束/已取消；租赁=已终止；空间预约=已结束/已驳回/已取消；商品=已下架；商城订单=已完成；申请=已通过/已驳回。企业/合作企业为直接归档（删除入口），**不支持自动归档**。
- **归档管理端点**：`GET /trash`（跨域列表，domain 标签页 + keyword）、`GET/PUT /trash/settings(/:domain)`（每标签页独立配置）、`POST /trash/:domain/:id/restore`（恢复，限定 deletedAt 非空）、`POST /trash/:domain/:id/purge`（物理删除 + 审计；外键冲突 409）。
- **自动归档/自动删除**：设置项 `autoArchive` + `archiveDelayDays`（0-365）、`autoPurge` + `purgeDelayDays`（1-3650）、`archiveStatuses`（按状态开关）；由调度任务每 5 分钟执行；purge 外键冲突时跳过等待人工处理。
- **用户历史域彻底删除三重确认**：前端对用户历史域（企业/合作企业/申请/需求/项目/活动/租赁/空间预约/商品/商城订单等用户历史相关标签页）的彻底删除或开启自动删除需三重确认（两次确认 + 输入「永久删除」）；后端 `purge` 仍以 409/404 兜底。
- 归档操作留痕：module=「归档管理」，action=恢复对象/彻底删除对象/更新归档设置。

### 8.11 素材上传与公开读取（M1.5 R4）

- `POST /assets`：multipart file + bizType；`StorageService.put` 写本地磁盘（键 `<uuid>.<ext>`）→ 落库 `MallAsset`（AST 前缀）；落库失败补偿删除存储对象；审计「素材库 · 上传素材」。
- 校验：文件非空 → 大小 ≤ SystemConfig.uploadMaxSizeMb（1-100，默认 10）→ magic-byte 嗅探真实 MIME ∈ {png,jpeg,gif,webp,pdf}（客户端 mimetype 不信任、SVG 拒绝）。
- `POST /assets/:id/replace`：同存储键覆盖（URL 不变），替换文件类型须与原文件一致；引用该素材的文章/页面即时生效。
- `DELETE /assets/:id`：删库 + 删存储对象（对象删除失败仅告警）。
- 公开读取 `GET /api/public/files/:key`：按 storeKey 反查素材后返回二进制，带 `nosniff` / `Content-Disposition` / `no-cache`。
- 文章保存时按正文 URL 反查素材并绑定 `sourceType`(article/submission) + `sourceId`（文章 ID）。

## 9. 审计与通知

### 9.1 审计（AuditService 直写 + AuditInterceptor 骨架）

- **实现**：各域写操作在 Service 内成功路径调用 `AuditService.record`（M1.5 起不再使用 `@Audit` 装饰器端点；`AuditInterceptor` 仍作为全局骨架保留）。字段：operator（JWT name；系统触发为「系统」/「系统自动归档」）、module/action/target/detail、ip（拦截器场景）、before/after（变更前后快照，JSONB）。
- **模块覆盖（15 类）**：认证（修改密码）、RBAC（管理员增改启停/重置密码/角色权限分配）、社区成员（新增用户/编辑用户信息/重置密码/冻结账号）、社区企业（新增/编辑/停用/启用/归档企业）、合作企业（新增/编辑/停用/启用/归档/关联成员增删）、审核中心（审核通过/驳回/归档申请）、需求管理（新增/审核通过/驳回/发布/定时/取消定时/撤回/关闭/立项/归档）、项目管理（新增/暂停/恢复/关闭/归档）、活动管理（发布/定时/取消定时/报名开关/取消/恢复/归档）、空间管理（预约审核/取消/归档、租约归档）、内容管理（文章审核/发布/定时/下架/删除、公告发布/编辑/下架/重新发布/置顶/删除）、积分商城（积分调整/商品上架下架/归档/订单发货/归档）、系统管理（保存配置/字典增删启停）、素材库（上传/替换/删除）、归档管理（恢复对象/彻底删除对象/更新归档设置）。
- **写入失败不影响主流程**（异步/捕获告警）；`id` 走 AL 前缀；`ip`/`before`/`after` 为扩展列。
- 查询口径同 M0：module 精确筛选 + keyword 跨 target/action/detail/operator 模糊，最新在前；响应只含 M0 形状字段（不含 ip/before/after）。

### 9.2 通知（AdminNotification，业务事件驱动）

| type | 触发事件 | link |
|---|---|---|
| approval | 入驻/合作/身份绑定申请提交（M2 客户端写入；种子数据存在） | /approvals |
| demand_review | 需求提交待审核（M2 客户端） | /demands/review |
| reservation | 空间预约提交（M2 客户端） | /spaces/reservations |
| showcase | 展示页发布申请提交（M2 客户端） | /contents/showcase |
| article | 文章提交审核（M2 客户端） | /contents/submissions |
| lease | 租约临期（每日任务，同日去重） | /workstations/leases |
| schedule | 定时发布到点完成（需求/活动/文章 30s 扫描任务） | /demands、/events、/contents/publish |

- 已读：单条/全部接口（幂等）；通知为管理员维度（单管理员即全局，多账号预留 recipientId 列）。

## 10. Redis 缓存策略

| 键 | 内容 | TTL | 失效 |
|---|---|---|---|
| `config:system` | SystemConfig 单例 JSON | 10min | PUT config 时删除 |
| `dicts:{type}` | 字典项全量列表（4 类） | 10min | 字典写操作删除 |
| `rules:points` / `rules:experience` / `rules:levels` | 规则与梯度（与积分引擎共用键、同查询口径） | 10min | 规则写操作删除 |
| `dashboard:summary` | 工作台聚合（stats+todos） | 60s | 短 TTL 自然过期（待办实时性优先）；审核通过/驳回主动删除 |
| `auth:blacklist:{jti}` | 登出/强踢令牌 | =JWT 剩余有效期 | 自动过期 |
| `captcha:{captchaId}` | 验证码答案 | 5min | 一次性消费（校验即删，错误也删） |
| `auth:login:fail:{ip}:{username}` | 连续登录失败计数 | 15min | 登录成功或锁定后删除 |
| `auth:login:lock:{ip}:{username}` | 登录锁定（until 时间戳） | 15min | 自动过期；登录成功删除 |
| `auth:admin:sessions` | 在线会话索引（数组） | 2h（每次写入刷新） | 登出/强踢/改密时改写 |
| `auth:admin:perms:{username}` | 管理员权限码集合（`*`=超管） | 2h | 账号/角色变更后主动失效 |

- 原则：只缓存**读多写少且可重建**的数据；列表查询不缓存（分页组合爆炸）；Redis 不可用时全部调用点 fail-open 回源 DB（日志告警，不中断），黑名单查询失败放行、缓存读返回 null。
- `db:seed` 重种子后清理 `APP_CACHE_KEYS`（配置/规则/工作台/字典）与动态鉴权键（`auth:admin:perms:*`、`captcha:*`、`auth:admin:sessions`），避免跨套件读到旧数据；Redis 不可用时静默跳过。
- 监控页读取 Redis INFO（版本/内存/键数/命中率/连接数）与 `PING` 延迟；Redis 不可用时返回降级值（延迟 -1、INFO 空串）。

## 11. 种子数据（prisma/seed.ts + prisma/seed-data/）

- **来源**：M0 `apps/admin/src/mock/` 全量数据逐条迁移并按 M1.5 改造（`prisma/seed-data/` 为唯一数据源）。当前计数（`Seed` 日志口径）：
  - 社区成员：users 15 / UserIdentity（随 users）/ enterprises 9 / externalEnterpriseProfiles 3 / applications 13（四类）/ demands 13（含 respondents）/ projects 8 / events 9（含 enrollments）
  - 账本与商城：experienceRecords 39 / pointsRecords 21 / goods 9 / redemptionOrders 6 / pointsRules 9 / experienceRules 6 / levelTiers 5
  - 空间：workstationAreas 3 / workstations 20 / leases 8 / spaces 6 / reservations 12
  - 内容：columns 6（含系统保留「未指定」COL_NONE）/ articles 10（官方 A×2 + 投稿 SU×8）/ showcaseRequests 5 / announcements 6
  - 系统：dicts 25（demand_category 6 / industry 11 / event_type 5 / goods_category 3）/ notifications 10（N9001+）/ auditLogs 25（AL1001+）/ systemConfig 1
  - M1.5 治理：AdminPermission **49** / AdminRole **4**（super/operator/auditor/space-ops）/ AdminUser **4**（admin/operator/auditor/space-ops，初始密码 admin123，space-ops 为 disabled 示例）/ ArchiveSetting **13**（各标签页默认关闭自动归档/自动删除）
- **ID 序列**：`IdSequence` 初始化 24 个前缀（U/E/AP/D/P/EV/XE/EX/PT/G/RO/R/WS/WA/LS/S/SR/A/SU/CL/SC/AN/N/AL）为各前缀当前最大值（R = 角色，内置 R1~R4，运行时新增角色自 R5 续号）；项目编号另按 `CODE-<year>` 初始化（JY-YYYY-NN 按年独立发号）；素材 AST 不预置（运行时发号）。**投稿文章使用 SU 前缀**（官方文章 A 前缀）。
- **要求**：编号前缀与源数据一致；跨模块引用一致（末笔流水 balance=实体当前值、办公位↔租约↔企业、预约/活动场地等）；`db:seed` 幂等（按 FK 逆序清空后重建）；种子运行后清理 Redis 应用缓存与动态鉴权键（§10）。
- 种子数据中已知历史 mock 瑕疵若仍存在则保持原样迁移，不做"顺手修正"（M1.5 内容/申请改造已同步调整相关数据，如旧 XE7004 档案已移除）。

## 12. admin 接入计划（Mock → HTTP）

- **改造规则**（`apps/admin/src/api/`）：
  1. 新增 `src/api/http.ts`：fetch 封装（baseURL `/api/admin`、Bearer token、包络解包 `body.data`、错误 `throw new Error(body.message)`、401 清 token 跳登录）——**函数签名与返回类型全部不变，视图层零改动**。
  2. 每域逐文件替换：函数体 mock 读写 → `http.get/post/...`；Query 接口语义不变（参数名即 query 参数）。
  3. mock 引用清零的域删除对应 mock import；全部域完成后删除 `src/mock/`（保留一个 release 分支节点）。
- **切换顺序**（与里程碑绑定，每步验证 = `tsc --noEmit` + `pnpm build:admin` + 浏览器冒烟登录后走查该域页面）：auth →（M1-A ✅）→ 成员/审核/账本（M1-B ✅）→ 需求/项目/活动（M1-C ✅）→ 商城/规则/办公位/空间/内容/公告（M1-D ✅）→ 通知/审计/配置/字典/工作台（M1-E ✅）→ M1.5 治理域（RBAC/账号/会话/登录日志/监控/素材/归档/导出，✅）。
- **进度（M1.5 完成后）**：`apps/admin/src/api/` 共 29 个文件（`http.ts` + 28 域文件）全部走真实 HTTP；`apps/admin/src/mock/` 已删除，种子数据内化至 `apps/api/prisma/seed-data/`（seed 唯一数据源，api tsconfig 已 exclude）。M1.5 新增 `admins/assets/login-logs/monitor/roles/trash` 六文件；`dashboard.ts` 增趋势接口；导出 CSV 走浏览器直接请求。
- 字典消费点（商品类型/需求类别/行业/活动类型表单与列表）全部走真实 `/api/admin/dicts/*`。
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
- [x] grantIdentity 联动（企业创建/激活、身份授予、首绑积分与经验值）
- [x] 手动积分/经验调整（事务+流水）+ 用户/企业 stats 派生
- [x] admin 接入：用户/社区个体/社区企业/合作企业/申请审核五组页面 + 详情账本
- **验证**：e2e 33/33；审核通过→身份落库→列表可见；调整积分→流水 balance 连续

### M1-C 业务运营域 — ✅ 完成（2026-09-10，提交 489cc11）

- [x] demands / projects / events 全端点（34 个）+ 状态机校验矩阵
- [x] 定时任务（定时发布/活动结束）+ schedule 通知
- [x] 积分/经验引擎接入触发点（报名审核通过/签到/首绑）
- [x] 立项双向关联 + 承接方校验（share=100）+ 代报名
- [x] admin 接入：需求/需求审核/项目/活动四组页面
- **验证**：e2e 48/48 两轮幂等；状态机非法流转 409 文案比对 M0；定时发布到点自动 published 实测

### M1-D 运营设施域 — ✅ 完成（2026-09-10，提交 c4e97fe）

- [x] mall（商品/订单/积分规则）/ rules（经验值规则/等级梯度/发放记录）全端点
- [x] workstations（区域/办公位/租约）+ 租约事务与派生 + 临期通知任务
- [x] spaces（空间/预约审核/冲突校验/使用看板）
- [x] contents（文章/栏目/展示页申请联动企业）+ announcements
- [x] 订单取消退款事务；等级结算
- [x] admin 接入：积分商城/规则管理/空间管理/内容管理四组页面
- **验证**：e2e 15 套件 72/72 两轮幂等；预约冲突 409；订单取消→积分流水/库存一致；栏目改名→columnName 刷新

### M1-E 系统管理域与收尾 — ✅ 完成（2026-09-10）

- [x] notifications / audit-logs 查询 / system config / dicts / dashboard / todos 全端点（12 个，`modules/system`）
- [x] 审计 before/after 快照补全（12 处埋点：状态流转含前后状态、配置/公告含字段级快照、积分调整含余额、审核含授予结果）；Redis 缓存全量接入（第 10 节五键：`config:system` / `dicts:{type}` / `rules:points|experience|levels`（与积分引擎共用同键、同查询口径）/ `dashboard:summary` 60s；写操作主动失效；seed 重种子后清理应用缓存键防跨套件污染）。降级 = 全部 Redis 调用点 try-catch fail-open 回源 DB（沿用 JWT 黑名单先例）；Redis 停机实测因环境限制未执行，降级保障为代码级兜底
- [x] admin 接入：通知中心/审计日志/系统配置/数据字典/工作台（6 文件切换，函数签名不变、视图层零改动；前端 recordAudit 移除）；删除 `src/mock/`
- [x] `/api/app/**` 设计文档（`docs/api-app-design.md`：M2 客户端端点清单——注册登录/多身份、需求浏览提交响应、活动报名、商城兑换下单、空间预约提交、文章投递、展示页申请、个人中心）
- [x] 实体字段文档沉淀（`docs/entity-fields.md`：35 模型分域字段清单）
- [x] 回归与文档：admin/api `tsc --noEmit` + `build:api` + `build:admin`（mock 全删后）+ e2e 16 套件 78 用例两轮全绿；127 个管理端端点经 e2e 主干覆盖（系统域 12 端点新增 system 套件）；**29 页面浏览器走查已完成**（2026-09-10 以 agent-browser + 本地 Chrome 有头模式实测：23 张截图存档、控制台零错误零警告、全域核心交互链路逐项验证、发现 0 缺陷）；full-spec-check 勾选 + 本 wiki 修订记录
- **验证**：mock 全删后 build:admin 通过 ✓；e2e 78/78（system 套件 6 用例：通知已读流转 / 审计筛选 / 字典唯一性与 sort 重排 / 配置校验文案逐字比对 / 工作台聚合与各域列表口径交叉校验）

### M1.5 后台治理增强（R1~R12） — ✅ 完成（2026-09-10~12）

- [x] R1 RBAC：AdminRole/AdminPermission/关系表迁移；49 权限码目录；`@RequirePermission`（any-of）覆盖 33/35 controller；角色/账号管理 + 权限目录接口；登录响应带 permissions；前端角色矩阵/403/v-permission
- [x] R2 管理员账号：增改启停/重置密码/角色分配 + 审计 + 缓存失效与强制下线；未传密码随机 12 位；最后超管保护
- [x] R3 登录安全：服务端强制验证码（SVG dataURL）、Redis 5 次/15 分钟锁定、dummy bcrypt 恒时比较、JWT `{sub,name,jti}`、改密踢全部会话、在线会话索引 + 强制下线（未知 jti 404）
- [x] R4 上传与素材：`MallAsset` + 本地磁盘 `StorageService`（`UPLOAD_DIR`）；魔数嗅探禁 SVG；上传上限系统配置（1-100MB 默认 10）；替换素材同 URL 生效；公开文件 `nosniff`/`Content-Disposition`
- [x] R5 富文本：sanitize-html 精确 2.16.0，文章/公告/需求/活动/项目/商品描述统一清洗
- [x] R6 监控：服务/DB/Redis 健康 + SchedulerLog + 任务手动触发；DB 故障降级（lastResult 三态含 unknown）
- [x] R7 图表：`GET /api/admin/dashboard/trend`（3-90 天，按日补零：成员/需求/活动/积分）
- [x] R8 登录日志：LoginLog 三态 + 查询（状态/关键词/时间范围 + IP 归属派生）
- [x] R9 导出打印：`GET /api/admin/export/:domain` CSV（BOM + 公式注入转义 + `filename*`）；申请审核单与租约打印单
- [x] R10 暗色模式：纯前端 token（无后端）
- [x] R11 列配置：纯前端 localStorage（无后端）
- [x] R12 归档：13 域软删除 + 可归档时间戳 + 归档管理（列表/设置/恢复/彻底删除）+ 自动归档/自动删除调度 + 用户历史域三重确认
- **验证口径**：当前源码静态清点为 e2e **25 套件 / 170 个用例声明**、unit **4 套件 / 25 个用例声明**；最近一次有记录的 e2e 全量通过为 **25 套件 / 169 用例**。历史 `api/admin tsc --noEmit`、build 与 `pnpm db:reset` 已通过；新增声明必须重跑后才能并入“全绿”口径。

## 14. 工程约定

- **验证底线**：每模块 PR 级改动跑 `pnpm --filter @joinyuu/admin exec tsc -p tsconfig.json --noEmit`（admin 侧）、`pnpm --filter @joinyuu/api exec tsc -p tsconfig.json --noEmit` + `pnpm build:api` + `pnpm --filter @joinyuu/api test:e2e`（api 侧，需 Docker 服务运行）；不虚报测试结论（无测试即说明仅构建验证）。
- **测试策略**：单测覆盖纯逻辑（状态机矩阵/冲突算法/经验分配/ID 发号）；e2e 每域至少覆盖"列表-详情-一次状态流转"主干；不追求覆盖率数字，主干链路优先。
- **契约变更流程**：任何端点/字段/状态机变更 = 先改本文档（标注日期）→ 再改代码 → 同步 full-spec-check；禁止只改代码。
- **提交规范**：沿用 `<type>: <描述>`；后端模块建议 `feat(api): xxx` 前缀区分 admin 改动。
- **Windows 协作**：脚本改动避免 heredoc/内联模板串；批量脚本走临时 .mjs 文件 + fs 写入；改完必须读盘校验（历史教训见 `.workbuddy/memory`）。
- **文档同步**：每完成后端模块，在 `docs/` 沉淀实体字段列表（page as documentation）；wiki-backend.md 文末维护修订记录。

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
| 2026-09-11 | **M1.5 安全加固（高危 H1~H8 + 中危 M1~M16 + 低危清理，复测全绿）**：RBAC 全量覆盖——35 个 controller 中 33 个挂 `@RequirePermission`（health/files 为 @Public，notifications 有意仅登录），装饰器支持 `string | string[]`（any-of），权限目录两端扩至 49 码（新增 `/system/export`）；验证码服务端强制（DTO 必填 + 无条件校验），登录失败锁定改 Redis（5 次 / 15 分钟，键 `auth:login:fail:*` / `auth:login:lock:*`），用户不存在时以 dummy bcrypt hash 恒时比较防枚举；`sanitize-html` 精确锁定 2.16.0（2.17.7 依赖 htmlparser2@12 纯 ESM，与 jest CJS 链不兼容），项目 description 接入清洗；公开文件端点加 `nosniff` + `Content-Disposition`，上传改魔数嗅探（禁 SVG、不信任客户端 MIME）；回收站收窄至 article/announcement 并强制 `deletedAt` 限定；管理员未传密码时随机生成 12 位初始密码（强度校验 ≥8 位含字母数字），最后超管保护 + 超管角色必须保留 `['*']` + 非超管不可分配超出自身权限的码；roles/admins 审计补 operator；监控 DB 故障降级（`lastResult` 三态含 unknown）、runJob 异常透出 500；调度 updateMany 补 `deletedAt` 过滤；导出 CSV 公式注入转义 + `filename*` 中文兼容；登录日志三态（success/failed/locked）贯通；CORS 白名单（`CORS_ORIGINS`）+ `JWT_SECRET` 生产缺失抛错；上传/删除失败补偿与审计 operator；存储为本地磁盘驱动（`UPLOAD_DIR` 可配，MinIO 待接入）；admin 前端权限兜底移除、v-permission 响应式（display）、RolePanel 勾选矩阵修复 + 后端目录拉取 + 超管 `*` 保留、素材库菜单路由对齐；e2e **25 套件 150 用例**全绿 |
| 2026-09-12 | **M1.5 治理增强（归档/导出/监控/趋势/术语统一）代码同步修订**：以当前代码为唯一事实来源全量校准文档——模型数订正 **35 → 43**（新增 AdminRole/AdminPermission/AdminUserRole/AdminRolePermission/LoginLog/SchedulerLog/MallAsset/ArchiveSetting 等 8 个，`Enterprise.stage` 与 `SystemConfig.dailyLoginPoints` 已删除）；管理端端点总计订正 **129 → 186**（新增归档/恢复/彻底删除、`/trash/settings`、素材上传/替换/公开读取、用户记录与编辑、租约详情/打印、审核单打印、角色/账号/会话/登录日志/监控/导出、文章定时发布与删除、栏目投稿开关与删除、`dashboard/trend` 等）；定时任务订正 **3 → 6**（新增文章定时发布、自动归档、自动删除，`@Cron` 全部经 `runJob` 写 SchedulerLog 且异常透出）；§4 补 403/429/503 错误矩阵与 5xx 落盘；§5 补软删除 `deletedAt/deletedBy` 与可归档时间戳 `archivableAt` 语义、商品三态 restock、发货/可见/可下单字段、文章 channel 与状态机、字典 goods_category、系统配置 uploadMaxSizeMb；§7 各域计数与端点逐条重写；§8.2/§8.10/§8.11 新增归档体系与素材上传规则；§9 审计改为 Service 直写口径（15 模块）；§10 补验证码/锁定/会话/权限缓存键；§11 种子计数按 Seed 实际（users 15 / applications 13 等）与 RBAC 49 码 / 4 角色 / 4 账号 / ArchiveSetting 13 重写 |
| 2026-09-12 | **M1.5 归档与治理能力落地口径**：归档管理 **13 个标签页**（社区企业/合作企业/资讯发布/投稿内容/公告栏/需求/项目/活动/租赁/空间预约/商品/商城订单/申请审核；企业与合作企业不支持自动归档），`archivableAt` 写入时机覆盖驳回/关闭/立项/结项/结束/取消/下架/完成/终止/审核完成，自动归档与自动删除由 `archive-auto-archive` / `archive-auto-purge` 每 5 分钟按 ArchiveSetting 执行，用户历史域彻底删除与开启自动删除三重确认；术语统一为 **联系电话 / 办公位 / 社区企业 / 合作企业 / 经验值 / 审核 / 新增**（代码中已无「工位/入驻企业/外部企业/联系方式/经验/审批/新建」旧词），投稿编号前缀 **SU**（官方文章 A）；e2e 口径更新为 **25 套件 / 163 用例**（含 trash/assets/sanitize/monitor/system-rbac/auth-security/admins/export/dashboard-trend 套件与验证码登录助手 `test/helpers/login.ts`） |
