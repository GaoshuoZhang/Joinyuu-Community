# 聚屿社区 · 后端服务 — 开发 Wiki

> 系统配置新增全局 `mobileUrl`（默认 `localhost:7759`，迁移 `20261015133000_global_mobile_url`），供主题预览及后续入口链接复用。主题新增 DELETE 管理接口，事务锁保护当前启用主题，删除时撤销预览并清理资源。
>
> 新增 MobileThemeModule、MobileThemePackage / MobileThemeState / MobileThemePreview 三表与增量迁移。主题 ZIP 受控解析，资源沿用 StorageService，管理接口沿用系统配置权限，公开接口仅下发当前主题或临时授权的预览主题。详见 [移动端主题开发规范](./wiki-mobile-theme.md)。

> 离线许可证：新增 `DeploymentLicense` 与全局 `LicenseGuard`，未授权/到期时业务只读。接口、维护例外、签发和部署要求见 [许可证管理](./license-management.md)。`GET /api/admin/system/license` 查询；`POST /request` 生成申请；`POST /import` 导入（后二者均以该路径为前缀），沿用 `/system/config` 权限。供应商公钥已内置；迁移并启动后导入许可证即可业务写入，无需公钥环境配置。

> 本文档沉淀 M1 后端服务（NestJS + PostgreSQL + Redis）的架构契约、数据模型、API 清单与业务规则，是所有后端模块开发的唯一依据。
> 契约来源：M0 冻结的 `apps/admin/src/types/index.ts` 实体模型 + `apps/admin/src/api/` 全部 stub 的 TODO 注释（API Stub 即接口契约）。
> **M1.5 后台治理增强（R1~R12）落地后，本文档已按当前代码（`schema.prisma` / 全部 controller / `src/common` / `prisma/seed*` / `test`）全面修订；文档与代码冲突时以代码为准并回写本文档。**
> 与 [wiki-admin-web.md](./wiki-admin-web.md) 同级：admin wiki 管前端契约，本文档管后端契约；两者冲突时以 M0 冻结代码为准并提出修订。
> 当前事实：ORM = Prisma；admin 与 mobile 均已接入真实接口；主键使用前缀字符串 ID（U1001/E2001/...）。

## 1. 定位与范围

**目标**：以冻结的实体模型与 API 形状为契约，实现 NestJS 后端服务；管理端与移动端均接入真实 HTTP 接口，后端治理能力（RBAC、登录安全、审计、归档、积分/经验、定时任务等）服务端化。

**范围内**：

- `apps/api`：NestJS 11 + Prisma 6 + PostgreSQL 17 + Redis 7.4 的后端应用
- `/api/admin/**`、`/api/app/**` 与 `/api/health`、`/api/public/files/:key` 公开路由，源码共 385 个 HTTP 路由装饰器
- 管理端认证（图形验证码 + JWT + 登出黑名单 + Redis 登录锁定 + 会话索引/强制下线/改密踢线）、审计日志服务端化、业务事件驱动通知、定时任务（定时发布/活动结束/租约临期/自动归档/自动删除）
- RBAC：权限码目录 + 内置角色（super/operator/auditor/space-ops），admin controller 除 notifications（有意仅登录）外均挂 `@RequirePermission`；health/files 为公开 controller
- 归档体系：13 个业务域软删除（`deletedAt`/`deletedBy`）+ 可归档时间戳（`archivableAt`）+ 归档管理恢复/彻底删除 + 自动归档/自动删除
- 文件上传与素材库（MinIO/本地磁盘双驱动；上传魔数嗅探禁 SVG；大小上限由系统配置，1-100MB 默认 10）
- 积分/经验发放引擎（按规则 code 触发，事务写流水）
- 种子数据：`prisma/seed-data/` 为唯一来源，保持全部编号与跨模块引用一致（见第 11 节）
- 客户端接口按 `docs/api-app-design.md` 实现

**规模**：68 模型 / 59 迁移 / 385 HTTP 路由装饰器；后端测试文件 46 个（e2e + unit），验证命令与环境准备见 [README](../README.md)。桌面客户端、微信小程序、微信登录、支付、CI/CD、分布式部署不在范围内。

**收口端点**：`/api/admin/member-governance/deletions` 分页列表及 `/:id/review`（POST `{action:'approve'|'reject',note}`），权限 `/member-governance`。注销冷静期届满后人工执行，User 置 deleted、密码与基础实名资料清除、会话失效、保留业务历史；驳回有通知。实名认证通过规则校验后立即生效并记录 `verifiedAt`，不设后台人工复核。`/api/admin/cards/individual/:uid`、`/api/admin/cards/enterprise/:id` GET/PUT 分别按 `/users`、`/enterprises` 鉴权，`/api/admin/cards/:type` 列表任一命中即可；字段白名单 `/schema/:type` GET/PUT 改挂 `/system/config`（原 `/card-management` 权限码与「名片管理」页已下线，名片编辑入口并入个体/企业详情页的名片标签页）。对应 app `GET /card-schema/:type` 下发可编辑字段，空白名单合法；名片 PUT 省略保留、空串清空，禁用字段 403。注销治理路径归属 members 数据范围。

**数据一致性约束**：注销提交、撤回、后台执行共用 User 行锁；`AccountDeletionRequest_one_cooling_per_user` 为 SQL 部分唯一索引（Prisma schema 无法表达），每人最多一份 cooling 申请。个人名片 visibility 为嵌套布尔对象，省略键保留当前值，前后台共用事务合并；展示姓名参与人才库、全域人才搜索和后台名片搜索；`isPublic` 为公开名片开关（false 时人才库过滤、公开名片 404，缺省公开）。举报恢复只允许原 `action=hide`、未恢复且目标 `moderationVersion` 与处置快照相同的记录；状态/归档及用户冻结字段写入由 PostgreSQL 触发器递增版本。迁移中的部分索引与触发器必须随库部署，不可只执行 `db push`。

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
| 测试 | Jest + supertest（最新完整记录：e2e 41 套件 / 282 用例；unit 5 套件 / 28 用例） |

**目录结构**（`apps/api/`）：

```
apps/api/
  prisma/
    schema.prisma        # 全量实体建模（69 模型，见 entity-fields.md）
    migrations/          # prisma migrate 产出（63 个迁移）
    seed.ts              # 演示种子（见第 11 节）
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
      applications/      # 入驻/合作/退驻审核（四类）
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
    scheduler/           # 10 个定时任务（发布/活动结束/冻结到期/租约临期/自动归档/自动删除/消息投递/券码过期退款/日志保留期清理）
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
- **`message` 必须直接可展示**——admin 视图层统一 `catch (e) → MessagePlugin.error(e.message)`，错误文案口径沿用既有 M0 契约（如"仅待发布的需求可立即发布"）。
- 时间字段统一 **String 存储**（M0 原生三种格式：`YYYY-MM-DD HH:mm` 时刻 / `YYYY-MM-DD` 日期 / `YYYY-MM` 年月，VarChar(16)）：单时区运营、字符串字典序即时间序（比较/排序/定时扫描均安全）、与 M0 契约逐字节一致、种子迁移零转换；`timestamptz` 推迟到出现真实跨时区需求时再迁移。系统内部字段（AdminUser.createdAt/updatedAt）不受此约束，仍用数据库原生 DateTime。

### 4.2 Nest 模块约定

- Controller 只做参数提取 + 调 Service + 包络返回；业务规则全部在 Service；数据访问统一经 `PrismaService`（不写裸 SQL，聚合视图可用 `$queryRaw`）。
- DTO 按端点声明，class-validator 规则与既有 M0 校验口径一致（必填/正整数/合计 100% 等）。
- 全局注册（`app.module.ts`）：`ValidationPipe({ transform: true, whitelist: true })`、`JwtAuthGuard` + `PermissionGuard`（RBAC）、`EnvelopeInterceptor`（成功包络）、`AuditInterceptor`（`@Audit` 装饰器骨架，当前审计均由各 Service 直写，见第 9 节）、`HttpExceptionFilter`（统一错误包络）。
- 跨域复用逻辑沉淀到共享 Service：`PointsEngineService`（积分/经验发放）、`AuditService`（审计写入）、`IdGeneratorService`（前缀 ID）、`StorageService`（对象存储抽象，本地磁盘驱动）、`AdminPermissionService`（权限装载与缓存）、`RedisService`（缓存/黑名单/会话）。
- 富文本字段（文章/公告/需求/活动/项目/商品描述）写入前统一经 `sanitizeHtml`（白名单标签/属性，剥离 script/style/iframe 与事件属性、危险协议）。
- 跨域选项端点（`users/options`、`enterprises/options`、`publisher-options`、`renter-options`）单独挂 Controller，仅返回 id/name 等最小字段。

### 4.3 分页与筛选约定

- 列表端点统一 query：`page`（1 起）、`pageSize`、`keyword`（模糊，匹配字段以第 7 节表为准）、领域筛选项、排序 `sortBy`/`sortOrder`（`ascend | descend`，descend=最新在前为默认）。
- 返回 `{ list, total }`；服务端排序口径与既有 M0 契约逐条一致（含 `publishedAt` 空值排最后等细节）。
- **全量集合端点例外**：非分页集合（`GET /workstations`、`GET /workstation-leases`、`GET /spaces`、`GET /assets`、`GET /notifications`、`GET /roles`、`GET /permissions/catalog`、`GET /monitor/cron-logs`、打印单端点）按第 7 节各端点说明直接返回数组（平面图/卡片网格消费），不包 `{ list, total }`。
- **归档可见性**：各业务域列表/详情默认过滤 `deletedAt: null`（已归档对象仅归档管理页与用户记录聚合可见）；`GET /trash` 反向只返回 `deletedAt` 非空的已归档对象，按 `deletedAt` 倒序，支持 `domain` 标签页筛选与 `keyword`（标题/编号）过滤。
- **导出**：`GET /api/admin/export/:domain` 返回 CSV 附件流（UTF-8 BOM，`Content-Disposition` 带 `filename*`），支持 `keyword`/`status`/`startDate`/`endDate`，域清单见 §7.15。

## 5. 数据模型（Prisma Schema 建模规则）

### 5.1 建模总则

- **主键 = 前缀字符串**（`@id String @db.VarChar(16)`；M1-B 已从 CHAR 改 VarChar，避免 PostgreSQL CHAR 尾部填充破坏 ID 契约），由 `IdGeneratorService` 发号：`id_sequences` 表（`entityType` PK + `nextNumber`）事务内 `INSERT ... ON CONFLICT DO UPDATE` 原子自增（发号器按需建行）；**禁止 MAX(id) 取号**（并发不安全）。编号前缀共 23 个（U/E/AP/D/P/EV/XE/EX/PT/G/RO/WS/WA/LS/S/SR/A/SU/CL/SC/AN/N/AL），另有按年独立的项目编号 `CODE-<year>`（JY-YYYY-NN）与运行时前缀 `AST`（素材）/`LL`（登录日志）/`SL`（调度日志）。
- **快照字段保留为列，不外键化**（M0 冻结口径）：`demand.publisherName`、`project.undertakers[].name`、`reservation.spaceName`、`order.goodsName`、`article.columnName`、`lease.renterName` 等展示快照不随源数据改名而变；但关联导航字段（`publisherId`、`columnId`、`goodsId`、`creatorId`）同时落列，可关联查询。
- **内嵌数组拆表**：`User.identities` → `identities` 表；`Demand.respondents`、`Project.undertakers/milestones`、`Event.enrollments` → 独立子表；`Lease.workstationIds` → `lease_workstations` 关联表（保留终止后的历史归属）。
- **JSONB 承载半结构数据**：`Application.details/records`、`Reservation.records`、`Demand.publisherIdentity` / `Article.authorIdentity`（身份快照）、`User.activities`（活跃记录，纯展示追加）、`AuditLog.before/after`（变更快照）、`ArchiveSetting.archiveStatuses`（按状态开关）、`Space.equipment` / 各实体 `tags`（`String[]`）。
- **软删除（归档）列**：企业/合作企业/申请/需求/项目/活动/商品/兑换订单/租约/空间/空间预约/文章/公告均含 `deletedAt String?` + `deletedBy String?`（归档端点写入；空间当前仅预留列）；列表现默认过滤 `deletedAt: null`，归档管理页集中恢复/彻底删除（见 §8.10）。
- **可归档时间戳 `archivableAt String?`**：对象进入"可归档状态"时写入（驳回/关闭/立项/结项/结束/取消/下架/完成/终止/审核完成等），自动归档任务以 `archivableAt + 延时` 判定；恢复在线态（如商品重新上架、活动恢复）时清除。注意与 `deletedAt` 语义区分：前者是"可以归档的计时起点"，后者是"已归档标记"。
- **派生值不落列**（M0 明确口径）：用户实名状态（realName+citizenId 均填）、用户 stats（详情接口实时 COUNT）、租约 expiring/expired（读取派生）、"个人用户"筛选（仅持 individual 身份）、工作台趋势（按日聚合）。
- 金额/积分为整数（分或元按 M0 现状：租金/预算为元字符串或整数、积分为整数）；枚举一律 String + 应用层枚举校验（保持与前端字符串契约一致，不用 PG enum，降低迁移摩擦）。

### 5.2 核心表摘要（完整 69 模型见 `entity-fields.md`）

| 分组 | Prisma 模型 | 主键前缀 | 要点 |
|---|---|---|---|
| 认证 | AdminUser | 自增 | username 唯一、passwordHash（bcryptjs）、name（展示名）、status(active/disabled)、lastLoginAt?；种子 4 账号 admin/operator/auditor/space-ops（初始密码 admin123） |
| 认证 | AdminRole | R1~R4 | code 唯一、name/description/sort/createdAt；内置 super/operator/auditor/space-ops 四角色 |
| 认证 | AdminPermission | code（PK） | RBAC 权限点目录（当前 56 码）：菜单路径或 `perm:xxx` 按钮码 + name/module/authType(menu/button)/sort |
| 认证 | AdminUserRole | 自增 | 管理员-角色关联，唯一 (adminUserId, roleId) |
| 认证 | AdminRolePermission | 自增 | 角色-权限点关联，唯一 (roleId, permissionCode)；角色变更即时失效权限缓存 |
| 认证 | LoginLog | LL | loginAt/username/ip/device/status(success/fail/locked)/failReason?；登录成功/失败/锁定均写 |
| 认证 | SchedulerLog | SL | jobName/startedAt/finishedAt/durationMs/status(ok/error)/detail?/rowsAffected；监控页与手动触发数据源 |
| 认证 | MallAsset | AST | 素材库：fileName/mime/size/url/storeKey/bizType?/sourceType?(article/submission/lease)/sourceId?(文章 ID 或租约号)/createdBy/createdAt；上传魔数嗅探、替换为同键覆盖 |
| 认证 | IdSequence | entityType（PK） | 前缀 ID 发号器（见 5.1） |
| 成员 | User | U | uid 昵称 nickname、phone 唯一、email/gender/avatar?/status(active/frozen)、realName?/citizenId?（实名派生）、verifiedAt?（认证时间）、wechatOpenid?/wechatUnionid?/wechatVerified?（M3 预留）、frozenUntil?/frozenReason?（解冻清空）、points（挂靠个人身份）、registeredAt/lastActiveAt、bio、activities Json、**activationDismissed Bool 默认 false（新手任务永久隐藏，按账号持久化）**、**usernameChangedAt?（用户名每 90 天限改一次；GET /me 下发 usernameChangeableAt 锁定到期时间）** |
| 成员 | UserIdentity | 自增 | userId FK + type(individual/community_individual/community_enterprise/external_enterprise) + enterpriseId?/enterpriseName?/role?/title/level?/experience?；唯一约束 (userId, type, enterpriseId)；社区个体每人至多一条（应用层保证） |
| 成员 | Enterprise | E | industry/size/foundedAt/settledAt/leaseType/status(active/pending/exited/disabled)/experience?/**contactUserId?（关联个人用户，社区企业必须关联）**/contactTitle/contact*/description/tags/**deletedAt?/deletedBy?**；M1.5 删除=软删归档（存在进行中租约时 409），可在归档管理恢复/彻底删除；不支持自动归档 |
| 成员 | ExternalEnterpriseProfile | XE | 合作企业档案（name/industry/status(active/disabled)/size/foundedAt/description/registeredAt（登记日期）/**deletedAt?/deletedBy?**）；**ExternalEnterprise 聚合视图 = 档案 + identities(type=external_enterprise 且 enterpriseName 匹配) 派生成员，不建独立表**；删除=软删归档；不支持自动归档 |
| 审核 | Application | AP | type(**settle/individual/cooperation/exit 四类**)/applicantName/applicantPhone/targetName/submittedAt/status/summary/details Json/records Json/**deletedAt?/deletedBy?/archivableAt?**；通过时授予身份（见 8.6） |
| 需求 | Demand | D | 状态机字段 + publisherId/publisherName/publisherIdentity(Json)/contactName?/contactPhone?/contactEmail?/budget/period/deadline/scheduledAt?/publishedAt?/visibilityIdentities[]/visibilityLevels[]/enrollmentIdentities[]/enrollmentLevels[]/respondPoints?/**respondNeedReview Bool 默认 true（响应需审核）**/rejectedReason?/projectId?/tags[]/**deletedAt?/deletedBy?/archivableAt?** |
| 需求 | DemandRespondent | 自增 | demandId FK + name/enterprise/phone?/email?/quote?/timeline?/cases?/message/at/status(pending_review/pending/contacted/closed + accepted/rejected)/reviewAt?/rejectReason?/withdrawnAt? |
| 项目 | Project | P | code（JY-YYYY-NN）/status(running/paused/closed/finished)/progress/startDate/endDate/initiatedAt/description/memberCount/sourceDemandId?/expReward?/closeReason?/**demanderId?/demanderName?/demanderIdentity Json?（需求方主体/名称/身份快照）/creatorName?/creatorId?（创建人）/contactName?/contactPhone?/contactEmail?（联系方式）/contractPrice?（合同价格）**/**deletedAt?/deletedBy?/archivableAt?** |
| 项目 | ProjectUndertaker | 自增 | projectId FK + type(enterprise/individual/custom)/refId(企业或用户 ID)/name(展示快照)/share/contactName?/phone?；合计=100 应用层校验 |
| 项目 | Milestone | 自增 | projectId FK + name/status(done/active/todo)/date/owners String[]（承接方展示名） |
| 活动 | CommunityEvent | EV | 状态机字段 + createdAt/startTime/endTime/location/capacity/speaker/host/enrollmentOpen/visibility*/enrollment*/requireReview/enrollmentDeadline?/scheduledAt?/enrollPoints?/checkinPoints?/tags[]/**deletedAt?/deletedBy?/archivableAt?**（自动结束任务写 ended+archivableAt） |
| 活动 | EventEnrollment | 自增 | 复合唯一 (eventId, userId)；userId/name/enterprise/phone/appliedAt/status(pending/approved/rejected)/checkedIn/checkInAt? |
| 账本 | ExperienceRecord | EX | targetType(enterprise/individual)/targetId/delta/balance/reason/at/operator/source(rule/manual) |
| 账本 | PointsRecord | PT | userId FK/delta/balance/reason/at/operator/source(rule/manual/redemption/space)/dedupeKey? 唯一（积分发放幂等） |
| 商城 | MallGoods | G | name/category(GC001 实物商品 / GC003 权益券；字典 goods_category)/points/stock/**status(on/off/restock 三态，库存为 0 记 restock)**/description/redeemedCount/validDays?（券码有效期天，空按 30 天兜底）/createdAt/**visibilityIdentities[]/visibilityLevels[]/orderIdentities[]/orderLevels[]（可见/可下单范围）**/**deletedAt?/deletedBy?/archivableAt?** |
| 商城 | RedemptionOrder | RO | userId/userName(快照)/goodsId/goodsName(快照)/points/status(pending_use/finished/cancelled 三态，统一券码)/createdAt/finishedAt?/note?/cancelReason?/**voucherCode(下单即签发)/voucherExpiresAt(按商品 validDays 计算，过期自动退款)/usedAt?**/**deletedAt?/deletedBy?/archivableAt?** |
| 规则 | PointsRule | code（PK） | 9 条固定触发项（见 8.4）；name/scene/description 写死；points 可编辑；status |
| 规则 | ExperienceRule | code（PK） | 6 条固定触发项；同上 |
| 规则 | LevelTier | identityType+level | 社区个体、社区企业分别维护 label/threshold；整组保存、逐级递增校验、1-10 级 |
| 规则 | PublishingLimitRule | identityType+level+action | 按实名身份或社区动态等级配置需求发布、文章投稿、活动报名、空间预约每日限制 |
| 规则 | PublishingLimitUsage | subjectType+subjectId+action+date | 当日已用次数；企业身份按企业 ID 共享，业务事务失败不计入 |
| 空间 | WorkstationArea | WA | name 唯一/type(open/office/semi)/description/createdAt |
| 空间 | Workstation | WS | seatNo 全岛唯一/**areaId FK**（区域改名无需级联）/type/capacity/status(idle/assigned/maintenance)/enterpriseId?/enterpriseName?/leaseId?（assigned 时）/defaultMonthlyRent?/areaSqm?（office 类型）/note? |
| 空间 | Lease | LS | renterId(enterprise=企业 ID/individual=用户 ID/custom 空)/renterName 快照/renterType/startDate/endDate(longTerm=true 时空串)/longTerm/status(active/terminated)/monthlyRent/rentPeriod(day/week/month/year，缺省 month)/contactName/contactPhone/terminatedAt?/**deletedAt?/deletedBy?/archivableAt?** |
| 空间 | LeaseWorkstation | 复合 (leaseId, workstationId) | 关联表保留历史；办公位当前占用由 Workstation.leaseId 表达 |
| 空间 | Space | S | name/type(meeting/roadshow/meeting_room/multi/study)/capacity/location/openTime/closeTime/allDay?/needReservation?/needApproval?/equipment String[]/status(available/maintenance/disabled)/description/**deletedAt?/deletedBy?** |
| 空间 | SpaceReservation | SR | userId/userName 快照/phone/spaceId/spaceName 快照/date/startTime/endTime/purpose/attendees/status(pending/approved/rejected/cancelled)/submittedAt/records Json/rejectReason?/**deletedAt?/deletedBy?/archivableAt?** |
| 内容 | Article | A / SU | title/**channel(official 社区发布 / submitted 用户投稿；官方 A 前缀，投稿 SU 前缀)**/columnId/columnName 快照/authorId?/authorName/authorIdentity Json/status(**pending/pending_release/scheduled/published/rejected/closed** 已关闭；成员主动撤回仍用 withdrawn)/**commentsEnabled Bool 默认 true（关闭后 app 评论读写 409）**/content（富文本，写入 sanitize）/scheduledAt?/publishedAt?/views/summary/tags/createdAt/rejectedReason?/**archivableAt?/deletedAt?/deletedBy?** |
| 内容 | ArticleTakedown | 自增 | articleId FK 级联/source(manual 后台主动 / governance 举报处置)/reportId?/reason?/takenDownAt/takenDownBy/restoredAt?/restoredBy?；文章详情按时间倒序返回 |
| 内容 | HomeBanner | BN | title/subtitle/imageUrl?/link?/sort(升序)/enabled/createdAt/updatedAt；受 SystemConfig.homeCarouselOpen 总开关控制 |
| 内容 | ArticleColumn | CL | name/description/sort/**submissionOpen（开放投稿开关）**/**system（系统保留栏目「未指定」COL_NONE，不可编辑/停用/删除、成员端不可见）**/status(enabled/disabled)/createdAt |
| 内容 | Announcement | AN | title/content（富文本 sanitize）/pinned/status(published/withdrawn)/publishedAt/createdAt/updatedAt?/**archivableAt?/deletedAt?/deletedBy?**（删除仅允许已下架，软删） |
| 系统 | AdminNotification | N | type(approval/demand_review/reservation/showcase/article/lease/schedule)/title/content/at/read/link? |
| 系统 | AuditLog | AL | operator/module/action/target/detail?/at/ip?/before Json?/after Json?；查询返回 M0 形状（不含 ip/before/after） |
| 系统 | SystemConfig | 单例(id=1) | siteName/siteSlogan/registrationOpen/mallOpen/demandOpen/reservationOpen/realnameRequired/**homeCarouselOpen(首页轮播总开关)**/leaseExpireRemindDays(1-90)/**uploadMaxSizeMb(1-100，默认 10；上传与富文本图片共用，dailyLoginPoints 已删除)**/**passwordExpireEnabled(密码过期强制改密，默认 false=密码永不过期，仅后台账号)**/passwordExpireDays(1-3650，默认 90，仅开关开启时生效)/MinIO 配置/updatedAt/updatedBy |
| 系统 | DictEntry | 复合 (type, code) | type(**demand_category/industry/event_type/goods_category**)/code(DC/IN/ET/GC 前缀自增)/label 全类型唯一/sort/status(enabled/disabled)；**goods_category 另有类别级 visibilityIdentities/visibilityLevels/orderIdentities/orderLevels**（空数组 = 不限，其余类型恒为空） |
| 系统 | ArchiveSetting | domain（PK） | 归档设置（13 域）：autoArchive/archiveDelayDays(0-365)/autoPurge/purgeDelayDays(1-3650)/archiveStatuses Json?（按状态开关）；企业/合作企业不支持自动归档 |
| App | UserNotification | UN | userId FK 级联；type/title/content/at/link?/read；站内信为单一列表（无归档、无分类偏好；`archived`/`UserNotificationPreference` 已移除） |
| App | Address | AD | userId FK 级联；name/phone/region/detail/isDefault/createdAt/updatedAt；每用户最多一个默认地址（部分唯一索引） |
| App | AgreementConsent | 自增 | userId FK 级联；agreementType/version/consentedAt；(userId, agreementType, version) 联合唯一 |
| App | AccountDeletionRequest | 自增 | userId FK 级联；reason?/status/requestedAt/effectiveAt?/cancelledAt?；7 天注销冷静期 |

## 6. 认证与权限

### 6.1 登录与会话（M1.5 R3）

- **图形验证码**：`GET /api/admin/auth/captcha`（`@Public`）→ `{ captchaId, image }`，image 为 `data:image/svg+xml;utf8,...`（4 位、去除 0/O/1/I）；答案存 Redis `captcha:<id>` 5 分钟、**一次性消费**（错误也消费）。
- **登录**：`POST /api/admin/auth/login`（`@Public`）body `{ username, password, captchaId, captchaCode }`——验证码服务端强制校验。账号/密码错误执行**恒时 bcrypt 比较**（用户不存在时用 dummy hash，防枚举）；同一 `ip:username` 连续失败 **5 次锁定 15 分钟**（Redis `auth:login:fail:*` / `auth:login:lock:*`，锁定期返回 429 与剩余分钟数）；停用账号返回 401「账号已停用，请联系超级管理员」。成功返回 `{ token, name, permissions }`（permissions 为当前账号权限码集合，超管为 `['*']`），并更新 `lastLoginAt`、写会话索引与登录日志。
- **JWT**：payload `{ sub: username, name, jti: uuid }`，有效期 2h；密钥取 `JWT_SECRET`（生产缺失启动即抛错，开发默认 `dev-only-change-me`）。
- **登出**：`POST /api/admin/auth/logout` → jti 写 Redis 黑名单 `auth:blacklist:<jti>`（TTL=剩余有效期）+ 移出会话索引 → `{ code: 0 }`。
- **登录日志**：`LoginLog` 三态 `success/fail/locked` + 失败原因；查询 `GET /api/admin/login-logs`（权限 `/logs/login`，支持状态/关键词/时间范围，返回 name=账号展示名、region 由 IP 派生）。
- **在线会话**：Redis `auth:admin:sessions` 单键维护全部在线会话（含 jti/username/name/ip/device/loginAt/exp，TTL 2h 且每次写入刷新）；`GET /api/admin/auth/sessions` 与会话列表权限 `/system/sessions` 可见；`POST /api/admin/auth/sessions/:jti/kick` 强制下线（黑名单 + 移出索引，**目标不存在返回 404**）；`POST /api/admin/auth/sessions/kick-all` 一键强制下线其余全部会话（当前操作者会话保留，返回 `{ code, kicked }` 实际下线数）。
- **修改密码**：`POST /api/admin/auth/change-password`（原密码校验；新密码 ≥8 位且含字母与数字，不得与原密码相同）→ 失效权限缓存 + **踢出该账号全部会话** + 审计「认证 · 修改密码」。
- **密码过期强制改密（仅后台账号，与客户端无关）**：`SystemConfig.passwordExpireEnabled` 默认 false（密码永不过期）；开启后超过 `passwordExpireDays`（1-3650，默认 90）未改密的管理员登录仍成功，但响应 `passwordExpired=true` 并写 Redis 标记 `auth:admin:pwd-expired:<username>`（TTL 2h），JwtAuthGuard 对非白名单接口抛 403「密码已过期，请先修改密码」（白名单：改密/登出/验证码/登录/health）；改密或关闭开关保存配置即清理标记（保存时 `delByPrefix` 清残留）。
- **管理员账号联动**：新增管理员未传密码时随机生成 12 位初始密码并一次性返回；编辑角色/停用/重置密码后失效权限缓存并强制下线；系统保留至少一名启用状态的超级管理员，超管角色必须保留 `['*']`，非超管不可分配超出自身权限的权限码。
- **前端约定**：localStorage key `joinyuu_admin_token` 存 JWT，请求头 `Authorization: Bearer <token>`；401 统一跳登录页。
- 审计 operator、审核记录 operator、手动调整流水的 operator 一律取 JWT `name`（M0 固定"社区管理员"的服务端替代）。

### 6.2 RBAC 权限模型（M1.5 R1/R2）

- **权限码 = 菜单路径或 `perm:xxx` 按钮码**，当前共 **56 码**（种子 `permissionCatalog` 为唯一目录），`*` 为超级管理员全量标记；`@RequirePermission(code | code[])` 支持 any-of 语义；`PermissionGuard` 叠加在 `JwtAuthGuard` 之后，权限集合命中任一所需码或含 `*` 放行，否则 403「无权限执行该操作」；未声明 `@RequirePermission` 的端点仅需登录。
- **覆盖范围**：36 个 controller 中，34 个属于 admin；其中 33 个挂 `@RequirePermission`，`notifications` 有意仅登录。`health` 与 `files`（公开文件读取）为公开 controller。无声明 controller 内的个别端点（如 `GET /enterprises/options`、`GET /users/options`）仅需登录。
- **权限目录（按模块）**：工作台 `/dashboard`、`/user-messages`；社区成员 `/users`、`/individuals`、`/enterprises`、`/external-enterprises`、`/approvals` + 企业按钮码 `perm:enterprise:create|update|disable|enable|delete`、`perm:external-enterprise:create|update|disable|enable|delete`；业务运营 `/demands`、`/demands/review`、`/demands/responses`、`/projects`、`/events`；空间管理 `/workstations`、`/workstations/offices`、`/workstations/leases`、`/spaces`、`/spaces/reservations`；内容管理 `/contents/publish`、`/contents/submissions`、`/contents/columns`、`/contents/stats`、`/contents/policies`、`/contents/banners`、`/contents/announcements`；积分商城 `/mall/goods`、`/mall/orders`；规则管理 `/rules/points`、`/rules/experience`、`/rules/levels`、`/rules/publishing-limits`、`/rules/ledger`、`/rules/experience-records`；系统管理 `/system/dicts`、`/system/config`、`/system/policies`、`/logs/audit`、`/system/roles`、`/system/admins`、`/system/sessions`、`/system/assets`、`/system/monitor`、`/logs/login`、`/system/trash`、`/system/export`、`/governance`、`/member-governance`（服务申请 `/engagement/services`、名片管理 `/card-management` 已随功能下线移除）。
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
| POST | /api/admin/auth/sessions/kick-all | 一键强制下线其余全部会话，当前操作者会话保留；返回 `{ code: 0, kicked }`（权限 `/system/sessions`） |

### 7.2 用户与社区个体 users / individuals（10）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/users | query：page/pageSize/keyword(昵称/uid/phone)/status/category(individual=仅基础身份、community_individual、community_enterprise、external_enterprise)/realStatus(verified/unverified) |
| POST | /api/admin/users | 新增用户；body `{ nickname, phone, email, gender, realName?, citizenId?, bio? }`；联系电话不可重复；服务端生成 U 编号、正常状态、0 积分及默认个人用户身份；返回 `{ id }`；审计「社区成员 · 新增用户」 |
| POST | /api/admin/users/:id/reset-password | 管理员强制重置登录密码；body `{ password }`（≥8 位且含字母数字）；直接覆盖 `passwordHash` 并写 `passwordUpdatedAt`；审计「社区成员 · 重置密码」 |
| GET | /api/admin/users/:id | 详情；stats 由 demands/projects/events 实时 COUNT（projects=个人承接或其社区企业承接） |
| GET | /api/admin/users/:id/records | 记录聚合（详情页记录标签）：applications/demands/projects/events/leases/submissions/reservations 七域按用户维度返回；含已归档条目（`deletedAt` 非空） |
| PUT | /api/admin/users/:id | 编辑资料（昵称/联系电话/邮箱/性别/真实姓名/证件号/简介/**头像**；空串对必填类字段忽略、实名/证件号/简介允许清空，**头像空串 = 清除**且仅接受站内相对路径或 http(s) 地址，由后台素材上传回填）；审计「社区成员 · 编辑用户信息」 |
| PATCH | /api/admin/users/:id/status | `{ status }`；仅解冻路径（status=active 时清空 frozenUntil/frozenReason）；冻结必须走 freeze |
| POST | /api/admin/users/:id/freeze | `{ until?, permanent, reason }`；permanent=false 需 until；reason 必填；已 frozen 报错 |
| GET | /api/admin/users/options | 仅登录：`[{ label: "昵称（uid）", value }]`（跨域表单候选） |
| GET | /api/admin/individuals | 社区个体=持 community_individual 身份的用户；query：page/pageSize/keyword/status |

### 7.3 社区企业 enterprises（10）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/enterprises | query：page/pageSize/keyword(名称/ID)/industry/status（active/pending/exited/disabled；**支持重复参数多值取并集，单值兼容，空串视为未过滤**）；默认过滤已归档；列表行附 `level/levelName`（社区企业等级梯度按经验值推导） |
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
| GET | /api/admin/external-enterprises | 聚合视图（档案 + 派生成员）；query：page/pageSize/keyword/industry/status(active/disabled)/sortBy(registeredAt)；默认过滤已归档 |
| POST | /api/admin/external-enterprises | 权限 `perm:external-enterprise:create`：body name/industry 必填 + size?/foundedAt?/description?；返回 `{ id }`（XE 前缀、登记日期为当天） |
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
| GET | /api/admin/demands | query：page/pageSize/keyword(标题/ID)/category/**status（支持重复参数多值，取并集；单值兼容；空串视为未过滤）**/publisherId/enterprise(社区企业按 enterpriseId、合作企业按档案名)/sortBy(createdAt 默认、publishedAt 空值排最后、id)/sortOrder；默认过滤已归档 |
| GET | /api/admin/demands/:id | 详情含 respondents（**只含「有效响应」：已撤回/审核驳回失效记录不下发，与列表「N 人响应」口径一致**）与 `projectStatus`（关联项目状态；已归档项目记为 `archived`，供「重新立项」入口显隐判断） |
| POST | /api/admin/demands | DemandCreatePayload（表单字段，含 `contactPublic` 公开联系人开关、`respondNeedReview` 响应需审核开关默认 true）；**创建即 pending_release**；**提交人由服务端取当前登录工作人员（publisherId=账号名、publisherName=姓名、publisherIdentity=`{type:'official',title:角色名}`），不接受前端传入**；预算未填自动"面议" |
| PUT | /api/admin/demands/:id | 编辑（pending_release/published 可用，不改状态）；可改 `contactPublic`、`respondNeedReview` |
| POST | /api/admin/demands/:id/approve | pending → pending_release |
| POST | /api/admin/demands/:id/reject | `{ reason }` 必填 → rejected + archivableAt |
| POST | /api/admin/demands/:id/respondents/:respondentId/review | 需求响应审核：body `{ status: 'approved'\|'rejected', reason?, hiddenFields? }`（驳回必填理由，≤200 字；`hiddenFields` 为通过时「对需求方隐藏」的响应字段键，可选，取值为 message/quote/timeline/cases/phone/email 子集，非法键 400）；条件抢占（仅 status=`pending_review` 且未撤回可审核，重复/并发 409）：通过 → 响应回 `pending`（发布者此后可选定承接方）、写入 `hiddenFields`、发放 `demand_responded` 响应积分并通知发布者；驳回 → 转 `rejected` 并置 `withdrawnAt` 失效、写 `rejectReason`，通知响应者（含理由）且不发积分；均写审计日志（通过时 `after` 含 `hiddenFields`）。权限 `/demands`、`/demands/review`、`/demands/responses` 任一（响应审核页复用同一端点） |
| PUT | /api/admin/demands/:id/respondents/:respondentId | 编辑响应内容：body `{ message（必填，≤500）, quote?, timeline?, cases?, phone?, email? }`（手机号/邮箱传空串表示清空，格式非法 400，说明为空 400）；**仅 `pending_review` 且未撤回的响应可编辑，否则 409**；响应方基本信息（name/enterprise/responderIdentity）不可改；写审计（action=编辑响应，含 before/after）；权限同上 |
| POST | /api/admin/demands/:id/publish-now | pending_release → published（写 publishedAt） |
| POST | /api/admin/demands/:id/schedule | `{ scheduledAt }`：pending_release → scheduled |
| POST | /api/admin/demands/:id/cancel-schedule | scheduled → pending_release |
| POST | /api/admin/demands/:id/retract | published → pending_release（清 publishedAt/scheduledAt）；可选 `takedownReason`（≤255 字），非空才通知内容所属用户；不要求存在举报 |
| PATCH | /api/admin/demands/:id/status | `{ status: "closed" }`（pending_release/published 可关闭；写 archivableAt） |
| POST | /api/admin/demands/:id/archive | 仅 rejected/closed/projected 可归档（软删） |
| POST | /api/admin/demands/:id/proxy-respond | `{ userName, enterprise, phone, email?, quote?, message? }`（仅 published/projected；message 空记"管理员代报名"；联系电话必填） |
| POST | /api/admin/demands/:id/initiate-project | ProjectInitPayload（可选举填 `respondentIds?: number[]`）；**published/selected 可立项**；**已立项（projected）且关联项目为 `closed` 或已归档时可「重新立项」**（新建项目并把 `demand.projectId` 切到新项目，原项目保留为历史；关联项目仍在进行时 409「关联项目仍在进行，暂不可重新立项」）；创建项目 + 双向关联（demand.projectId ↔ project.sourceDemandId）→ projected + archivableAt；**项目需求方/创建人/联系方式/合同价格由服务端照搬需求快照（客户端传值不生效）**；**社区自建需求（`publisherIdentity.type='official'`）在客户端无对应账号，项目需求方/创建人统一标记为「社区官方」（`demanderId`/`creatorId` 清空，`demanderIdentity` 取 official 快照）**。响应收敛（同事务）：`respondentIds` 勾选项先条件落 `accepted`（有冲突 409 整体回滚）→ 与立项承接方**同主体**的响应置 `undertaken`（已承接，响应终态）→ **其余全部有效响应**（已选定 / 本次勾选 / 未入选的待选定）置 `closed`（已结束）+ 站内信；未响应的承接方**不创建**响应记录。**立项前校验：承接方对应响应仍为 `pending_review` 时拒绝立项（409「承接方「X」的响应仍在「待审核」…」），避免绕过响应审核导致该响应永不被审核、积分与通知也不发**。发布者与被选中承接方补发 `demand_undertaken` 积分、承接方按身份补发 `project_undertaken` 经验并通知双方（发布者为后台代发的企业 ID 时站内信落到企业联系人） |
| GET | /api/admin/demands/undertaker-options | 承接方候选（社区企业/合作企业/社区个体/个人用户，value=`enterprise:E*`/`enterprise:XE*`/`individual:U*`）；用户项 label 统一口径 `真实姓名（身份 · 昵称 · 用户ID）`（如 `顾北辰（社区个体 · 顾北辰 · U1005）`），真实姓名为空回落昵称，用于区分同名/同昵称用户 |
| GET | /api/admin/demands/:id/selected-respondents | 需求立项承接方预填：缺省取发布者已选定的承接方（`DemandRespondent.status=accepted` 且未撤回，可多个）；传 `?respondentIds=1,2` 时改为按指定响应记录（「立项前置选定承接方」勾选项，未撤回）取选项。均可转承接方选项（同 undertaker-options 形状与 label 口径；社区企业按 `responderIdentity.enterpriseId`、合作企业按组织名回查企业档案、个人/社区个体按 `userId`；合作企业无档案时回落 `custom:<组织名>`）；无对应响应返回 `[]`，需求不存在 404；权限（`/demands`、`/projects` 任一） |
| GET | /api/admin/demand-responses | 独立 controller：跨需求查询**待审核响应**（`status=pending_review` 且 `withdrawnAt=null`），query page/pageSize/keyword（响应者/企业/留言/需求编号，均 insensitive 模糊）/`demandId`（精确匹配，供需求详情「响应记录」跳转筛选）+ `at` 倒序；返回 `{ list, total }`，每行含需求快照（id/title/status/publisherName）、响应内容（identity/quote/timeline/cases/message/phone/email/hiddenFields）与响应者账号口径（`userId`/`realName`/`nickname`，供「响应者」列展示统一口径） |
| GET | /api/admin/publisher-options | 独立 controller：`{ users: [...], enterprises: [...] }` 含联系电话（自动填充用）；权限（`/demands`、`/enterprises`、`/contents/publish` 任一） |

**主体展示口径（全站统一，服务端只补字段、不拼字符串）**：用户类主体 `真实姓名（身份 · 昵称 · 用户ID）`（真实姓名为空回落昵称）；企业类主体 `企业名（身份 · 企业ID）`；自定义主体 `名称（自定义）`。据此，需求详情 `respondents[]`（`RespondentDto`）与响应审核 `PendingRespondentDto` 均下发 `userId?`/`realName?`/`nickname?`（来自 `include: { user: { select: { uid, nickname, realName } } }`）与 `responderIdentity?`（身份快照，缺省时前端省略身份段）；`renter-options`（承租方）、企业成员（`/api/app/me/enterprises/:id`）、`member-governance` 注销列表、文章评论治理列表同步补 `realName`。**客户端一律不展示用户 ID**（仅「我的」页面展示本人 UID），客户端口径为 `真实姓名（身份 · 昵称）`。

**响应状态机**：`pending_review`（待审核）→`pending`（待选定）→`accepted`（已选定）→**`undertaken`（已承接，立项后被选为承接方，终态）**；`rejected`/`closed`（已结束）为失效终态。立项收敛后，项目可见性与里程碑积分/结项经验按「响应已承接」判定（`respondentUids` 取 `accepted` + `undertaken`）。立项后该需求下**不再存在悬挂的「待选定 / 已选定」**响应（全部收敛为 `undertaken` 或 `closed`）。

**结项经验分配口径（I）**：经验值仅按承接占比分配给**社区企业（E 前缀）与结项时持社区个体身份的用户**；合作企业（XE 前缀）/ 仅个人用户身份 / 自定义承接方不参与，其份额丢弃。立项/编辑项目表单在承接方选择下方明确提示「以下承接方不参与项目结项经验值分配」，避免静默丢弃造成预期差。

### 7.7 项目 projects（11）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/projects | query：page/pageSize/keyword(名称/code)/status（**支持重复参数多值取并集；单值兼容；空串视为未过滤**）/participant(个人承接或其社区企业承接)/enterprise(社区企业按承接方 ID；合作企业按成员个人承接)/sortBy(initiatedAt 默认、id)/sortOrder；默认过滤已归档 |
| GET | /api/admin/projects/:id | 详情含 undertakers/milestones |
| POST | /api/admin/projects | ProjectInitPayload（承接方≥1、share 合计 100、custom 需 name/contactName/phone）；创建即 running、progress=0、code=`JY-YYYY-NN` 按年原子递增；可选需求方/创建人/联系方式/合同价格（社区自建录入，`creatorName` 缺省取当前操作人） |
| PUT | /api/admin/projects/:id | 编辑（finished 强制 409；其余状态可编辑；不改状态/编号/进度；承接方与里程碑整体重建，里程碑重置为 todo；需求方/创建人/联系方式/合同价格仅在显式传入时更新） |
| POST | /api/admin/projects/:id/pause | running → paused |
| POST | /api/admin/projects/:id/resume | paused → running |
| POST | /api/admin/projects/:id/close | `{ reason }` 必填；paused → closed + archivableAt |
| POST | /api/admin/projects/:id/archive | 仅 finished/closed 可归档（软删） |
| POST | /api/admin/projects/:id/milestones/:milestoneId/accept | 「进度节点」通过验收：仅**进行中/已暂停**项目且节点为 `submitted` 可操作（否则 409；已归档项目 404）；状态迁移 + 进度重算 + 全节点通过自动结项（写 finishedAt/archivableAt）+ 里程碑积分/结项经验，由 `ProjectMilestoneReviewService` 与客户端共用同一套口径；条件更新做并发幂等守卫（重复/并发 409「里程碑状态已变更，请刷新后重试」）；写审计（action=里程碑验收通过） |
| POST | /api/admin/projects/:id/milestones/:milestoneId/return | 「进度节点」驳回：`{ reason }` 必填（空白串 400，≤255 字）；`submitted → returned` + `returnReason`/`returnedAt` + 通知承接方重新提交；写审计（action=里程碑驳回，detail=原因） |
| GET | /api/admin/projects/:id/contracts | 线下签约合同照片/PDF 扫描件列表（素材库 `sourceType=project` + `sourceId=项目编号`，最新在前；已归档项目仍可查看） |
| POST | /api/admin/projects/:id/contracts | 上传合同（multipart `file`）：图片 PNG/JPEG/GIF/WebP 或 PDF，魔数嗅探 + 系统配置 `uploadMaxSizeMb` 限制；已归档项目 404；落 `MallAsset` 并写审计（来源：project 项目编号） |
| DELETE | /api/admin/projects/:id/contracts/:assetId | 删除合同（校验归属本项目，跨项目 404；已归档项目 404；存储对象同步删除） |

> 注：pause/resume/close 在 M0 stub 中无 TODO 注释但为冻结状态机契约（wiki-admin-web.md §项目状态机）；结项 finished 由**里程碑全部验收通过**驱动（`ProjectMilestoneReviewService.acceptMilestone` 在末节点通过时于同一事务内置 finished 并按 8.5 分配经验值；项目状态的条件更新保证并发下经验只发一次）。`GET /api/admin/projects/:id` 下发的 `milestones[]` 含 `id`（前端按 id 定位节点做验收/驳回）；`PUT` 编辑会整体重建里程碑，id 随之变化，操作前应重新拉取详情。

### 7.8 活动 events（13）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/events | query：page/pageSize/keyword(标题/ID)/type/**status（支持重复参数多值，取并集；单值兼容；空串视为未过滤）**/participant(报名记录含该用户)/sortBy(id 默认倒序、startTime、createdAt)/sortOrder；默认过滤已归档 |
| GET | /api/admin/events/enrollments | 活动报名审核列表（跨活动）：query page/pageSize/keyword(报名人/企业/电话/活动标题与编号)/status(pending/approved/rejected/waitlisted/cancelled)/eventId；按报名时间倒序 |
| GET | /api/admin/events/:id | 详情含 enrollments（到点状态流转先行派生） |
| POST | /api/admin/events | 创建即 pending_release、enrollmentOpen=false；表单无定时发布选项；**签到配置**：可选 `checkinLocationRequired`（默认 false，客户端签到地理围栏开关）、`checkinCodeRequired`（默认 true）与 `checkinCode`（6 位数字；required=true 且留空时服务端自动生成随机 6 位；required=false 时置空不再要求输码；非 6 位数字 400） |
| PUT | /api/admin/events/:id | 编辑（pending_release/published 可编辑，published 不动状态/已有报名；scheduled/ended/cancelled 不可）；签到配置口径同创建（清空签到码 = 轮换新码） |
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
| GET | /api/admin/mall/goods | query：page/pageSize/keyword(名称/ID)/category/status（**支持重复参数多值取并集，单值兼容，空串视为未过滤**）/sortBy(id 默认倒序、points、createdAt)/sortOrder；默认过滤已归档；权限 `/mall/goods` |
| POST | /api/admin/mall/goods | 创建（stock=0 即 restock，否则 off）；统一券码兑换，商品含积分/库存/券码有效期（validDays 天）/可见与可下单范围；描述 sanitize |
| PUT | /api/admin/mall/goods/:id | 编辑（不影响已有订单）；库存归零 → restock，补货后由 restock 回落为 off |
| POST | /api/admin/mall/goods/:id/toggle-status | 上架↔下架（下架写 archivableAt，重新上架清除） |
| POST | /api/admin/mall/goods/:id/archive | 仅已下架（off）可归档（软删） |
| GET | /api/admin/mall/redemption-orders | query：page/pageSize/keyword(用户名/商品名/订单ID/券码)/status（**支持重复参数多值取并集，单值兼容，空串视为未过滤**）/sortBy(id 默认、createdAt)/sortOrder；默认过滤已归档；权限 `/mall/orders` |
| POST | /api/admin/mall/redemption-orders/:id/verify | 券码核销：pending_use → finished + archivableAt（现场兑换由工作人员执行，写审计+站内信） |
| POST | /api/admin/mall/redemption-orders/:id/archive | 仅 finished/cancelled 可归档（软删） |
| POST | /api/admin/mall/redemption-orders/:id/cancel | 仅 pending_use；**事务**：退回积分（写 source=redemption 流水）+ 库存回补 + redeemedCount-1 + 记 cancelReason（固定文案） |
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
| GET | /api/admin/rules/levels | 等级梯度 level 升序 + 该等级每日需求发布/文章投稿额度 + 积分消费折扣；等级行取共用缓存 `rules:levels`，额度实时合并；权限 `/rules/levels` |
| PUT | /api/admin/rules/levels | 整组保存 body `{ identityType, tiers: [{ level, label, threshold, pointsDiscount?, demandPublishLimit?, articleSubmitLimit? }] }`（前端函数签名收数组、请求时包一层）；1-10 级、门槛逐级递增、折扣 1-10、额度 -1/0..10000；事务内同时写 LevelTier 与 PublishingLimitRule（未提交的动作保留既有额度）；梯度变更仅影响后续结算 |
| GET | /api/admin/rules/publishing-limits | query：`identityType?`（单身份组）/ `scope=personal`（仅个人用户未实名、已实名两行）；按身份组+等级聚合四类每日额度（-1 不限 / 0 禁止）；权限 `/rules/publishing-limits` |
| PUT | /api/admin/rules/publishing-limits | body `{ rules: [{ scope, level?, demandPublishLimit, articleSubmitLimit, eventEnrollLimit, spaceReserveLimit }] }`；逐行 upsert（个人身份组 level=0；社区身份需等级已存在）；等级相关额度亦可在等级规则页随梯度保存 |

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
| PUT | /api/admin/workstation-leases/:id | 编辑（改租期/租金/联系人）；terminated 不可编辑；换办公位不支持（终止重建） |
| POST | /api/admin/workstation-leases/:id/renew | **续期**：新到期日须晚于原到期日（400）、长期租约无到期日（409）、terminated/已归档（409/404）；更新 endDate + monthlyRent（默认沿用）+ 追加 `renewRecords` 并审计「续期租约」；不改存储状态（续期后已到期条目自动回到生效中/即将到期派生态） |
| GET | /api/admin/workstation-leases/:id/contracts | 线下纸质合同扫描件列表（素材库 `sourceType=lease` + `sourceId=租约号`，最新在前；已归档租约仍可查看） |
| POST | /api/admin/workstation-leases/:id/contracts | 上传合同（multipart `file`）：图片 PNG/JPEG/GIF/WebP 或 PDF，魔数嗅探 + 系统配置 `uploadMaxSizeMb` 限制；落 `MallAsset` 并写审计（来源：lease 租约号） |
| DELETE | /api/admin/workstation-leases/:id/contracts/:assetId | 删除合同（校验归属本租约，跨租约 404；存储对象同步删除） |
| POST | /api/admin/workstation-leases/:id/terminate | **事务**：租约 terminated + terminatedAt/archivableAt + 释放全部关联办公位（已到期租约同样适用，过期不自动释放） |
| POST | /api/admin/workstation-leases/:id/archive | 仅 terminated 可归档（软删） |
| GET | /api/admin/renter-options | `{ users: [...], enterprises: [...] }` 含联系电话（自动填充） |
| GET | /api/admin/leases/:id/print | 租约打印单（标题/生成时间/租约详情/条款），复用租约数据无新表 |

### 7.13 公共空间 spaces（10）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/spaces | 全量按 ID 升序；权限 `/spaces` |
| GET | /api/admin/spaces/usage-board | query：date；当日占用 = 已通过预约 + 命中该空间的已发布活动（source 区分；命中与按天裁剪口径见 §8.8） |
| GET | /api/admin/spaces/:id/event-occupancy | 空间的活动占用明细：已发布活动按日展开（跨天按天裁剪），返回 `{ eventId, date, startTime, endTime, title, host }`；空间详情页日历与占用明细用 |
| GET | /api/admin/spaces/:id | 详情含预约列表（空间详情页日历/明细用） |
| POST | /api/admin/spaces | 创建即 available；allDay 时存 00:00/23:59；needApproval 联动 needReservation；feePerHour 缺省 0（0=免费） |
| PUT | /api/admin/spaces/:id | 编辑基础信息（状态走独立接口；含 feePerHour） |
| POST | /api/admin/spaces/:id/status | `{ status: available/maintenance/disabled }` |
| GET | /api/admin/space-reservations | query：page/pageSize/keyword(用户/空间/ID)/spaceId/status/date；默认过滤已归档；权限 `/spaces/reservations` |
| POST | /api/admin/space-reservations/:id/review | `{ status, comment? }`；approved 前冲突校验（见 8.8）；重复审核报错；写审核时间线；rejected 写 archivableAt 并全额退回已扣积分（见 8.8） |
| POST | /api/admin/space-reservations/:id/cancel | pending/approved 可取消 + archivableAt + 全额退回已扣积分 |
| POST | /api/admin/space-reservations/:id/archive | 仅已结束（approved 且日期时段已过）/rejected/cancelled 可归档（软删） |

### 7.14 内容 contents / announcements（24）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/contents/articles | query：page/pageSize/keyword(标题/作者/ID)/columnId/channel(official/submitted)/status（**支持重复参数多值取并集，单值兼容，空串视为未过滤**）/sortBy(id 默认、views、createdAt)/sortOrder；默认过滤已归档；权限（`/contents/publish`、`/contents/submissions` 任一） |
| POST | /api/admin/contents/articles | 权限 `/contents/publish`：ArticlePayload（title/columnIds（单选取首个）/authorId?/summary/content/tags）；**official 创建即 pending_release、submitted 创建即 pending**；投稿 ID 走 `SU` 前缀、官方走 `A`；authorIdentity 取社区个体优先否则 individual；正文 sanitize 并反查绑定素材来源 |
| PUT | /api/admin/contents/articles/:id | 权限 `/contents/publish`：仅 pending_release/scheduled/rejected 可编辑；rejected 修改后回 pending（重新入投稿审核队列） |
| POST | /api/admin/contents/articles/:id/review | 权限 `/contents/submissions`：`{ status: approved/rejected, comment? }`；仅 pending 可审核；approved → pending_release，rejected 必填原因；均写 archivableAt |
| POST | /api/admin/contents/articles/:id/publish | 权限 `/contents/publish`：pending_release/scheduled → published + publishedAt |
| POST | /api/admin/contents/articles/:id/schedule | 权限 `/contents/publish`：`{ scheduledAt }`；仅 pending_release → scheduled（须晚于当前时间） |
| POST | /api/admin/contents/articles/:id/cancel-schedule | 权限 `/contents/publish`：scheduled → pending_release |
| POST | /api/admin/contents/articles/:id/withdraw | 权限 `/contents/publish`：published → pending_release（清 publishedAt/scheduledAt）；可选 `takedownReason`（≤255 字），非空才通知内容所属用户；不要求存在举报 |
| DELETE | /api/admin/contents/articles/:id | 权限 `/contents/publish`：仅 pending/rejected/pending_release **软删归档** |
| GET | /api/admin/contents/columns | 按 sort 升序，含文章数聚合；权限 `/contents/columns` |
| POST | /api/admin/contents/columns | 创建即启用；body 含 submissionOpen（开放投稿） |
| PUT | /api/admin/contents/columns/:id | 编辑；改名同步刷新文章 columnName 快照；系统保留栏目不可编辑 |
| POST | /api/admin/contents/columns/:id/toggle-status | 启用↔停用（停用后新文章不可选；系统保留栏目不可停用） |
| POST | /api/admin/contents/columns/:id/toggle-submission | 开放↔关闭投稿开关 |
| DELETE | /api/admin/contents/columns/:id | 删除栏目；其文章自动转移至系统保留栏目「未指定」（COL_NONE）；系统保留栏目不可删除 |
| GET/POST/PUT | /api/admin/contents/policies(/:id) | 权限 `/contents/policies`；仅管理 `kind=community`，支持分类、版本、附件、精选与发布状态 |
| GET | /api/admin/contents/banners | 权限 `/contents/banners`；轮播图列表，`sort` 升序 |
| GET/PUT | /api/admin/contents/banners/settings | 首页轮播图总开关（`{ carouselOpen }`），写操作清 `config:system` 缓存并审计 |
| POST | /api/admin/contents/banners | 新增轮播图（BN 前缀；title/subtitle/imageUrl?/link?/sort/enabled），审计「新增轮播图」 |
| PUT | /api/admin/contents/banners/:id | 编辑轮播图（审计 before/after） |
| POST | /api/admin/contents/banners/:id/toggle-enabled | 单条启用/停用 |
| DELETE | /api/admin/contents/banners/:id | 删除轮播图 |
| GET | /api/admin/announcements | 置顶优先，其余发布时间倒序；query 含 status（published/withdrawn；**支持重复参数多值取并集，单值兼容，空串视为未过滤**）；默认过滤已归档；权限 `/contents/announcements` |
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
| GET | /api/admin/audit-logs/retention | 日志保留期：返回 `{ auditLogRetentionDays, loginLogRetentionDays }`（默认 180，0 = 永久保存）；权限 `/logs/audit` 或 `/logs/login`（方法级 any-of） |
| PUT | /api/admin/audit-logs/retention | `{ auditLogRetentionDays, loginLogRetentionDays }`，各须为 0-3650 的整数（越界/非整数 400）；保存即生效 + before/after 审计（module=系统管理、action=保存日志设置）+ 失效 `config:system` 缓存；权限 `/logs/audit` 或 `/logs/login` |
| GET | /api/admin/branding | 后台壳品牌：返回 `{ siteName, siteSlogan, siteLogo }`（走 `config:system` 缓存）；**仅需登录，不挂权限码**——所有后台角色都需要在左上角与浏览器标签页看到正确的站点品牌；客户端不读取该端点（客户端品牌跟随定制主题） |
| GET | /api/admin/system/config | 单例配置（走 `config:system` 缓存 10min）；权限 `/system/config`；MinIO SecretKey 不回传原文，仅 `minioSecretKeyConfigured` + `minioSecretKeyMasked`（`********`）+ `minioCredentialSource`（env 优先、其次 database）；实名核验只回 `realnameVerifyCredentialMasked`（inline 模式）与派生 `realnameMode` |
| PUT | /api/admin/system/config | 保存即生效；leaseExpireRemindDays 1-90、uploadMaxSizeMb 1-100、passwordExpireDays 1-3650；记 updatedBy/updatedAt + before/after 审计；**密码过期强制改密**：`passwordExpireEnabled`（缺省 false=密码永不过期，仅后台账号）+ 周期 `passwordExpireDays`（默认 90），关闭开关保存时按前缀清理 `auth:admin:pwd-expired:*` 残留标记；`minioSecretKey` 为只写字段（留空=保持原值，非空=更新/轮换），审计快照含 `minioSecretKeyChanged` 但不含密钥原文。**实名核验**：`realnameVerifyEnabled` + `realnameVerifyProvider`（启用时必须单选）、`realnameVerifyConfig`、`realnameVerifyCredentialMode`（inline 直接填写：留空=保持原值/只写；env 登记变量名）、`realnameVerifyCredentialEnv`；启用/供应商/来源/参数/凭据任一变化会把 `realnameVerifyTestOk` 重置为 false（须重新测试联通），审计含 `realnameVerifyChanged` 且 inline 凭据不入快照。**日志保留期** `auditLogRetentionDays` / `loginLogRetentionDays` 为可选字段（0-3650，0 = 永久保存），缺省保持原值（旧前端表单不传该字段时不得被重置为 180；日常维护走 `PUT /api/admin/audit-logs/retention`）。**站点 logo** `siteLogo`（素材 URL，≤512，可选，缺省保持原值，空串 = 清除并回退内置字标）：用于后台左上角图标与浏览器标签页图标，客户端不读取 |
| GET | /api/admin/system/config/realname/catalog | 实名核验供应商目录（配置字段 + 凭据变量名，供表单渲染）；权限 `/system/config` |
| POST | /api/admin/system/config/realname/test | 测试联通：用格式合法的固定样例调用所选供应商，**接口可返回业务结果即算联通**（不要求核验一致）；成功写 `realnameVerifyTestOk=true` + `realnameVerifyTestedAt` 并清 `config:system` 缓存；失败写 false 并返回带阿里云 `Recommend` 的诊断信息 |
| GET | /api/admin/dicts/:type | 按 sort 升序（管理页返回全量含 disabled）；type 四类 demand_category/industry/event_type/goods_category；权限 `/system/dicts` |
| POST | /api/admin/dicts/:type | `{ label, visibilityIdentities?, visibilityLevels?, orderIdentities?, orderLevels? }`；label 全类型唯一；创建即启用（code 按类型前缀 DC/IN/ET/GC 自增）；后四项仅 goods_category 使用（类别级可见/可下单范围，空数组 = 不限） |
| PUT | /api/admin/dicts/:type/:code | `{ label?, visibilityIdentities?, visibilityLevels?, orderIdentities?, orderLevels? }`；未提交字段保持原值（前端编辑弹窗整表单提交）；label 改名同样走全类型唯一校验；权限 `/system/dicts` |
| POST | /api/admin/dicts/:type/:code/toggle-status | 启用↔停用 |
| DELETE | /api/admin/dicts/:type/:code | 删除并重排同类型 sort；历史引用值不受影响 |
| — | 字典维护入口（前端） | 后台**无独立字典页**：按类型分置各业务页页头弹窗——需求管理「需求类别」/ 活动列表「活动类型」/ 社区企业「行业管理」/ 商品管理「商品类别」；上述接口与权限码 `/system/dicts` 不变，仅入口位置迁移 |
| GET | /api/admin/roles | 角色列表（含权限码集合）；权限 `/system/roles` |
| POST | /api/admin/roles | 新增自定义角色 `{ code, name, description? }`；code 小写字母开头仅含小写字母/数字/下划线（2-32）且唯一（409）、不可用内置 `super`（400）、名称唯一（409）；ID 走 R 前缀发号、sort 追加、初始无权限点；审计「RBAC · 新增角色」 |
| PUT | /api/admin/roles/:id/permissions | `{ permCodes }`；超管角色仅超管可改且必须保留 `['*']`；非超管不可越权分配；变更即时失效关联管理员权限缓存 |
| GET | /api/admin/permissions/catalog | 权限点目录（按模块分组）；权限 `/system/roles` |
| GET | /api/admin/admins | query keyword(username/name)；权限 `/system/admins` |
| POST | /api/admin/admins | `{ username, name, roleCodes, password? }` → `{ id, initialPassword? }`（未传密码随机生成 12 位） |
| PUT | /api/admin/admins/:id | `{ name, roleCodes }`；保留至少一名启用超管；编辑后权限缓存失效 + 强制下线 |
| PATCH | /api/admin/admins/:id/status | `{ status: active/disabled }`；停用强制下线 |
| POST | /api/admin/admins/:id/reset-password | `{ password }`（≥8 位含字母数字）；重置后强制下线 |
| GET | /api/admin/login-logs | query：page/pageSize/status(success/failed/locked；**支持重复参数多值取并集，单值兼容，空串视为未过滤**)/keyword/startDate/endDate；权限 `/logs/login` |
| GET | /api/admin/monitor/overview | 服务/DB/Redis 健康指标 + 定时任务最近执行状态；权限 `/system/monitor` |
| GET | /api/admin/monitor/cron-logs | 定时任务执行日志（jobName 可选，最新 100 条） |
| POST | /api/admin/monitor/jobs/:name/run | 手动触发任务执行（写 SchedulerLog，失败透出 500「任务执行失败：...」） |
| GET/POST/PUT | /api/admin/system/policies(/:id) | 权限 `/system/policies`；仅管理用户协议与隐私政策，注册和隐私页面读取已发布版本 |
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
| GET | /api/admin/todos | 五域待办聚合：入驻/合作/身份审核、需求审核、空间预约审核、文章审核、临期租约（窗口取 SystemConfig.leaseExpireRemindDays），`[{ key, title, description, count, route }]` |
| GET | /api/admin/dashboard/trend | query `days`（默认 30，范围 3-90）；按日聚合 `{ date(M-DD), members, demands, events, points }`（含补零） |

### 7.17 消息中心 messaging（19）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/message-channels | 渠道列表（含凭据来源与齐备状态；inline 只回掩码、env 只回变量名，不回传密钥原文）；权限 `/system/messages` |
| GET | /api/admin/message-channels/catalog | 消息类型与驱动目录（非机密配置字段 + 凭据项说明 `credentialConfigFields`，供表单渲染与校验） |
| PUT | /api/admin/message-channels | 按 kind+provider 新增或更新（幂等）；必填参数齐备 + 凭据项归属校验；`credentialMode` inline（留空=保持原值）| env（登记变量名，缺省）；审计「消息中心」不含凭据原文 |
| GET/PATCH | /api/admin/message-channels/:id/enabled | 渠道启停；权限同上 |
| POST | /api/admin/message-channels/:id/test-send | 测试发送（不写发送队列）；响应含 `warnings[]`（如 SMTP 发件人与认证用户不一致）；凭据缺失时非生产环境降级干跑 |
| GET | /api/admin/message-templates | 模板列表（含当前发布版本摘要）；权限 `/system/messages` |
| GET | /api/admin/message-templates/:id | 模板详情（含全部版本） |
| POST | /api/admin/message-templates | 创建即发布：直接生成 v1 published（无需审批）；编码唯一（409） |
| PUT | /api/admin/message-templates/:id/draft | 保存即发布：最新 published 版本原地更新（版本号与状态不变、正文立即生效），否则新建版本并置为 published |
| POST | /api/admin/message-templates/:id/submit | 兼容保留（发送即发布模式下无实际作用） |
| POST | /api/admin/message-templates/:id/review | 兼容保留（发送即发布模式下无实际作用） |
| POST | /api/admin/message-templates/:id/publish | 发布；传 `version` 即回滚（历史版本重新发布为当前版）；旧发布版本转 archived |
| POST | /api/admin/message-templates/:id/disable | 下架（发布版本转 archived，模板回 draft） |
| POST | /api/admin/message-templates/:id/test-send | 测试发送（按模板类型取已启用渠道，凭据缺失时非生产环境降级干跑） |
| POST | /api/admin/message-templates/:id/preview | 预览渲染结果（不发送） |
| GET | /api/admin/outbox | 发送记录分页 + 状态/渠道/关键字筛选 + 各状态计数；权限 `/system/messages` |
| GET | /api/admin/outbox/:id/logs | 投递日志（每次尝试一条，最新在前） |
| POST | /api/admin/outbox/:id/retry | 手动重试（failed/dead/skipped → pending） |
| POST | /api/admin/outbox/:id/discard | 手动终止（进入死信） |

**发送治理（Outbox）**：入队按 `idempotencyKey` 幂等去重（唯一键 + 冲突回读）；调度任务 `message-outbox-dispatch`（每 30 秒）扫描 `pending|failed` 且到期的消息，乐观抢占（`updateMany` 改 sending 成功者拿锁）后投递；失败按指数退避重试（30s→60s→120s…上限 30 分钟），超 `maxAttempts` 或不可重试错误进死信（`dead`）；每次尝试写 `MessageDeliveryLog`。营销类消息受用户 `channelPrefs`、`ContactConsent` 与安静时段约束（安静时段顺延到结束时刻，退订则 `skipped`），安全类（模板 category=security）强制送达。

**管理端形态**：消息中心在后台扁平化为单一菜单 `/system/messages`（原三个子菜单合并），以「渠道配置 / 模板配置 / 发送记录」三个选项卡聚合。渠道配置按消息类型分块维护——短信（阿里云/腾讯云签名与模板映射）、邮箱（SMTP 主机/端口/授权码）、站内信（无需外部凭据）；每类渠道配置后可直接「保存并测试连通」。模板配置采用「保存即发布」：创建即生成 v1 published，编辑保存原地更新当前发布版本（正文立即生效），历史版本保留，重新发布历史版本即回滚；不设审批流程（submit/review 接口兼容保留）。

**凭据安全**：渠道凭据支持两种来源（`credentialMode`）——`inline`=后台直接填写密钥（只写：留空保持原值；GET 只回 `credentialMasked` 掩码；审计不记录；切换来源时不沿用旧值）、`env`=登记环境变量名（默认，值由部署侧注入）。管理端与审计都不含凭据原文；凭据未注入时非生产环境自动降级为干跑驱动，便于端到端联调。实名核验凭据同口径（见 §7.15）。

**邮件（SMTP）配置说明**：`from` 单字段已拆分为 `fromAddress`（发件人邮箱地址，必填）+ `fromName`（显示名，选填）；旧版 `from`（如 `聚屿社区 <no-reply@example.com>`）仍兼容读取，管理端编辑时会自动拆分。驱动发送前做「发件人 = SMTP 认证用户名」一致性预检，不一致以 `warnings[]` 回显（不阻断发送），并在 553/535/网络类错误信息中追加中文排障建议（授权码、端口放行等）。目录中 SMTP 的凭据项带 `credentialConfigFields` 说明（授权码提示）。

### 7.18 用户留言 user-messages（3）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/admin/user-messages | 分页列表 + `status`（pending 待回复/replied 已回复）+ `keyword`（主题/内容/用户 UID）+ `sortBy=createdAt`/`sortOrder=ascend\|descend` 筛选排序；**默认待回复置顶**，显式传 `sortBy=createdAt` 时改为纯按提交时间排序；自动排除已归档；回填留言人展示名（真实姓名优先，其次昵称）与手机号；权限 `/user-messages`（超管 + 运营） |
| POST | /api/admin/user-messages/:id/reply | `{ content }`（2-1000 字，纯文本 sanitize）→ `pending` 条件更新为 `replied`（幂等守卫，重复回复 409）并写入 `repliedBy`（当前登录工作人员姓名）与 `archivableAt`；成功后向留言人推送站内信（type=system，link=`/me/messages`） |
| POST | /api/admin/user-messages/:id/archive | 归档留言（仅 `replied`，否则 409）→ 写入 `deletedAt`/`deletedBy`，从列表与客户端「我的留言」消失，可在「归档管理 > 用户留言」恢复；审计「用户留言 · 归档留言」 |

**客户端侧**：`POST/GET /api/app/me/messages`（登录用户提交留言 / 查看自己的留言与后台回复，已归档不下发），见 `api-app-design.md` §8.1。

**端点总计：268**（`/api/admin/**` 路由装饰器；`/api/app/**` 126 个另计，`GET /api/health`、`GET /api/public/files/:key` 两个 `@Public` 端点未计入）。

## 8. 业务规则服务端化

### 8.1 状态机校验矩阵（服务端 409 强制）

- **需求**：`pending →(approve)→ pending_release →(publish-now | schedule)→ published | scheduled →(到点)→ published`；`pending →(reject)→ rejected`；`pending_release/published →(close)→ closed`；`published →(retract)→ pending_release`、`published →(成员 select)→ selected →(initiate-project)→ projected`、`published →(initiate-project)→ projected`；`scheduled →(cancel-schedule)→ pending_release`。编辑约束：仅 pending_release/published 可编辑且不改状态（`selected` 不可编辑/撤回/关闭/代报名）。归档：仅 rejected/closed/projected。成员端 `select` 为多选意向承接方（被选转 `accepted`，未选保持 pending，不生成项目），立项由管理员在后台完成。
- **活动**：`pending_release →(publish-now | schedule)→ published | scheduled →(到点)→ published`；`published →(endTime 过)→ ended`（定时任务，写 archivableAt）；`pending_release/published →(cancel)→ cancelled`（写 archivableAt）；`cancelled →(restore)→ pending_release`；published 内 enrollmentOpen 开关。编辑约束：scheduled/ended/cancelled 不可编辑。归档：仅 ended/cancelled。
- **项目**：`running ↔ paused`；`paused →(close)→ closed`（写 archivableAt）；closed 只读（可"重新创建"=复制预填，生成新 P 编号）；里程碑全 done → finished（结项，见 8.5，写 archivableAt）；finished 不可编辑。归档：仅 finished/closed。
- **文章**：`pending(投稿待审核) →(review approved)→ pending_release | (rejected)→ rejected`；`pending_release →(publish | schedule)→ published | scheduled`；`scheduled →(cancel-schedule)→ pending_release`；`rejected →(编辑保存)→ pending`（重新入审核队列）；`published →(staff/举报下架)→ closed`（写 `archivableAt` 并新增 `ArticleTakedown` 记录；`closed →(原举报恢复)→ published`）；成员主动撤回待审核投稿为 `pending → withdrawn`（可重提）。官方文章创建即 pending_release、投稿创建即 pending。归档：pending/rejected/pending_release/closed 可软删；`withdrawn` 为成员可重提状态，不归档。
- **申请/预约/展示页**：`pending → approved | rejected`；预约另有 `pending/approved → cancelled`。归档：申请仅 approved/rejected；预约为已结束/rejected/cancelled。
- **商品/订单**：`on ↔ off`（下架写 archivableAt、上架清除；stock=0 置 restock，补货后回落 off）；统一券码兑换订单三态 `pending_use → finished`（后台核销）/`pending_use → cancelled`（退款，事务）；过期未使用券由定时任务自动 `pending_use → cancelled` 退款；归档：商品仅 off、订单仅 finished/cancelled。
- **办公位/租约**：办公位 idle ↔ maintenance（直接切换）；assigned 仅经租约创建/终止进入/退出；租约 active → terminated（事务释放办公位）；**续期（renew）不改存储状态**，仅延长 `endDate`/调整租金并追加 `renewRecords`（已到期为读取派生，续期后自然回到生效中/即将到期）；已到期（派生）条目**不会自动终止**，需人工续期或终止释放办公位；归档：仅 terminated。
- **实现方式**：每域 Service 内显式状态/前置校验，非法流转抛 409（文案="仅 XX 的 XX 可 XX"，与 M0 一致）；每个归档端点同样校验可归档状态，不做通用状态机框架。

### 8.2 定时任务（@nestjs/schedule，单实例，共 10 个）
| 任务名 | 频率 | 逻辑 |
|---|---|---|
| demands-events-scheduled-publish | 每 30 秒 | `demands/events` 中 status=scheduled 且 scheduledAt≤now 且未归档 → published（活动同时 open 报名）+ 写 schedule 通知，事务内完成 |
| articles-scheduled-publish | 每 30 秒 | `articles` 中 status=scheduled 且 scheduledAt≤now 且未归档 → published + publishedAt + 写 schedule 通知 |
| events-auto-end | 每 5 分钟 | status=published 且 endTime≤now 且未归档 → ended + archivableAt |
| user-freeze-expire | 每 5 分钟 | status=frozen 且 frozenUntil≤now → active（临时冻结到期自动解冻，写审计） |
| lease-expiring-notify | 每日 09:00 | status=active 且非长期租约 endDate 落在临期窗口（SystemConfig.leaseExpireRemindDays，默认 15）→ 写 lease 通知（同一租约同日去重） |
| archive-auto-archive | 每 5 分钟 | 按 ArchiveSetting：autoArchive 开启且对应状态开启、`archivableAt + archiveDelayDays` 已过 → 写 deletedAt/deletedBy（操作人「系统自动归档」） |
| archive-auto-purge | 每 5 分钟 | 按 ArchiveSetting：autoPurge 开启且 `deletedAt + purgeDelayDays` 已过 → 物理删除（外键冲突跳过，等待人工处理） |
| message-outbox-dispatch | 每 30 秒 | 扫描 Outbox 到期消息投递，重试退避与死信由 OutboxService 内部处理 |
| mall-voucher-expire-refund | 每 5 分钟 | 商城券码过期自动退款：pending_use 且 voucherExpiresAt≤now → cancelled + 退积分（source=redemption 流水）+ 回补库存 + 站内信（逐单事务，条件抢占与人工核销/退款互斥） |
| log-retention-purge | 每日 03:00 | 日志保留期清理（`SystemConfig.auditLogRetentionDays` / `loginLogRetentionDays`，默认 180、0 = 永久保存）：按天 cutoff 删除超期 `AuditLog`（`at`）与 `LoginLog`（`loginAt`），保留期 0 则跳过该表；每次运行仅写 1 条汇总审计（module=系统管理、action=日志自动清理、operator=系统），避免逐行写入污染审计表 |

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
- `individual`：申请人追加 community_individual 身份（去重；社区个体不再设置头衔，title 为空）。
- `cooperation`：按 targetName 企业名**复用或新增合作企业档案**（industry/规模/成立时间取自申请表单）→ 申请人追加 external_enterprise 身份（去重）。
- `identity`：targetName 按"企业名 · 头衔"解析（绑定 community_individual 时不再设置头衔）→ 目标在社区企业名单则追加 community_enterprise 身份；否则追加 external_enterprise 身份（档案缺失自动新增）。
- 首次授予任意非 individual 身份（即真正新增身份行）→ 触发 `identity_first_bind` 积分 + 经验值（启用时）；企业类同时给企业发首绑经验值。

### 8.7 需求发布方身份快照（resolvePublisherIdentity 服务端化）

- enterprise 提交 → 社区企业（E 前缀）写完整社区企业身份快照，合作企业（XE 前缀）写 `external_enterprise` 快照；individual 提交 → 持社区个体身份则标社区个体，否则一律"个人用户"（**不因同时持有企业身份而自动归入**）；custom → 表单传入快照或 null。
- 创建需求的 `creatorName` 取登录管理员名，种子数据中 `creatorName` 取联系人/发布人、`creatorId` 取发布用户 UID 或按联系人联系电话回查；用户记录聚合按 `creatorId ∪ publisherId` 匹配。

**项目需求方快照与访问口径**

- 需求立项时由服务端把需求快照写入项目：`demanderId=demand.publisherId`、`demanderName=publisherName`、`demanderIdentity=publisherIdentity`、`creatorName/creatorId=demand.creatorName/creatorId ?? 发布方`、联系方式照搬、`contractPrice=demand.budget`；客户端提交的同名字段不生效；社区自建项目由「新增项目」表单录入，`creatorName` 缺省取当前操作人。
- 项目访问按需求方主体放行：`AppProjectsService.subjectUserId()` 将需求方主体解析为用户 uid（主体为企业 ID 时解析到企业 `contactUserId`），并与承接方匹配一起决定「需求发起方/承接方/403」；`myProjects` 同时按 `undertakers`、来源需求发布方与 `demanderId`（本人 + 关联企业）匹配。历史项目由迁移从来源需求回填需求方字段。

### 8.8 空间占用与预约费用口径（客户端可约时段 / 审核冲突校验 / 使用看板 / 空间详情统一）

唯一实现：`apps/api/src/common/spaces/event-occupancy.ts`（占用）与 `apps/api/src/common/spaces/booking-fee.ts`（费用）；客户端 `AppSpacesService.availability`/`create`/`cancel`、后台 `SpacesService.assertNoConflict`/`usageBoard`/`eventOccupancy`/`reviewReservation`/`cancelReservation` 共用，避免多处口径分叉。

- **活动命中空间**：活动 `location` 包含空间名（`loc.includes(name)`），或与空间 `location`（楼层地址）**完全相等**；地点为空不命中。schema 无 spaceId 外键，故按地点文本近似匹配——不用楼层地址做包含匹配，避免同层多个空间互相误判。
- **按日展开**：跨天活动在首日占用到 `23:59`、末日从 `00:00` 起、中间日整天占用；`eventCoversDate` 判定是否覆盖某日，`eventWindowOn` 给出该日占用时段（HH:mm），`eventBlocksWindow` 判定与该日某时窗是否重叠。
- 同空间同日**已通过预约**时段重叠（`start < other.end && other.start < end`，排除已归档）→ 审核 409"该时段已有已通过的预约，无法重复占用"。
- 命中空间的当日**已发布活动**与预约时段重叠 → 审核 409"该时段被社区活动占用，无法通过"；客户端提交预约时同口径预检 → 409"该时段已被预约，请选择其他时间"。
- 客户端 `GET /api/app/spaces/:id/availability` 返回的 `type` 标注占用来源（`reservation`/`event`），供客户端按来源展示或过滤。
- 重复审核（非 pending）报 409「该预约已处理，请勿重复审核」。

**预约费用（积分）**

- `Space.feePerHour`：预约费用（积分/小时），0 = 免费使用；后台空间表单「费用」栏维护，客户端空间列表与预约页展示。
- 计费小时 = 向上取整到整小时（不足 1 小时按 1 小时计）：全天开放空间结束时间为 23:59，故 `N 小时 59 分` 按 `N+1` 小时计费；费用 = 计费小时 × `feePerHour`。
- 扣费时机：客户端提交预约（`POST /api/app/spaces/reservations`）时，在预约事务内条件扣减积分（余额不足整体回滚 → 400「积分不足，无法预约该空间」）并写负向流水（`source=space`）；实扣金额写入 `SpaceReservation.feePoints`，响应回传 `pointsSpent`。
- 退回口径（全额）：审核驳回（`/api/admin/space-reservations/:id/review` 驳回分支）、用户取消（`POST /api/app/spaces/reservations/:id/cancel`）、后台取消（`POST /api/admin/space-reservations/:id/cancel`）均退回 `feePoints` 并写正向流水（`source=space`）；取消类接口以「状态条件更新」抢占，避免并发重复退分。用户侧取消额外拒绝「已通过且已过预约结束时间」的预约（409「预约已结束，无法取消」），该状态在 `GET /api/app/me/reservations` 中派生为 `ended`「已完成」。

**积分消费折扣（跨场景统一下沉于 `apps/api/src/common/points/points-discount.ts`）**

- 取值：1 = 1 折 … 10 = 原价（默认 10，**支持一位小数**如 8.5 = 85 折）；折后价 = `round(原价 × 折扣 ÷ 10)`（内部按「十分位整数」计算，避免浮点误差），不足 1 分四舍五入。
- 存量/缺省：等级行未配置折扣时按原价 10 处理（保存等级梯度时缺省写 10）。
- 按谁取：个人消费（商城兑换）取用户自己的「社区个体」等级折扣；代企业消费（代企业预约空间）取所代表企业的「社区企业」等级折扣；无对应身份/等级行 → 原价。
- 生效点：商城兑换（`AppMallService.createOrder`，订单 `points` 存实扣额，退款按实扣退）与空间预约费用（`AppSpacesService.create`，`feePoints` 存实扣额）；流水 `reason` 追加「N 折」标注。
- 下发：`GET /api/app/me` 与 `GET /api/app/me/identities` 各回带 `pointsDiscount`（登录/注册响应同），客户端据此展示折后价并按折后价判定余额是否充足。

### 8.9 快照与联动的既有口径（服务端保持）

- 栏目改名 → 刷新文章 columnName；栏目删除 → 文章转移至保留栏目「未指定」；办公位区域改名 → 无需级联（外键化）；企业展示页仅保留富字段展示（名片状态已移除）；解冻 → 清冻结字段；撤回发布 → 清 publishedAt/scheduledAt；终止租约 → 释放办公位并清 enterprise/lease 冗余。

### 8.10 归档体系（M1.5 R12，归档管理）

- **软删除语义**：归档 = 对 `deletedAt/deletedBy` 赋值（各域归档端点与自动归档任务写入），记录从业务列表消失但保留在归档管理页；`deletedAt` 为"已归档标记"，`archivableAt` 为"可归档计时起点"（见 §5.1）。
- **14 个标签页**（与 `TrashService` DOMAIN_DEFS、Seed 14 条 ArchiveSetting、前端归档管理一致）：社区企业 / 合作企业 / 资讯发布 / 投稿内容 / 公告栏 / 需求 / 项目 / 活动 / 租赁 / 空间预约 / 商品 / 商城订单 / 申请审核 / 用户留言。共享 Article 模型的资讯与投稿按 `channel` 拆分两个标签页。
- **可归档状态**：资讯=待发布；投稿=待发布/已驳回；公告=已下架；需求=已驳回/已关闭/已立项；项目=已结项/已关闭；活动=已结束/已取消；租赁=已终止；空间预约=已结束/已驳回/已取消；商品=已下架；商城订单=已完成；申请=已通过/已驳回；用户留言=已回复。企业/合作企业为直接归档（删除入口），**不支持自动归档**。
- **归档管理端点**：`GET /trash`（跨域列表，domain 标签页 + keyword）、`GET/PUT /trash/settings(/:domain)`（每标签页独立配置）、`POST /trash/:domain/:id/restore`（恢复，限定 deletedAt 非空）、`POST /trash/:domain/:id/purge`（物理删除 + 审计；外键冲突 409）。
- **自动归档/自动删除**：设置项 `autoArchive` + `archiveDelayDays`（0-365）、`autoPurge` + `purgeDelayDays`（1-3650）、`archiveStatuses`（按状态开关）；由调度任务每 5 分钟执行；purge 外键冲突时跳过等待人工处理。
- **用户历史域彻底删除三重确认**：前端对用户历史域（申请/需求/项目/活动/租赁/空间预约/商品/商城订单/投稿/用户留言等用户历史相关标签页）的彻底删除或开启自动删除需三重确认（两次确认 + 输入「永久删除」）；后端 `purge` 仍以 409/404 兜底。
- 归档操作留痕：module=「归档管理」，action=恢复对象/彻底删除对象/更新归档设置。

### 8.11 素材上传与公开读取（M1.5 R4）

- `POST /assets`：multipart file + bizType；`StorageService.put` 写本地磁盘（键 `<uuid>.<ext>`）→ 落库 `MallAsset`（AST 前缀）；落库失败补偿删除存储对象；审计「素材库 · 上传素材」。
- 校验：文件非空 → 大小 ≤ SystemConfig.uploadMaxSizeMb（1-100，默认 10）→ magic-byte 嗅探真实 MIME ∈ {png,jpeg,gif,webp,pdf}（客户端 mimetype 不信任、SVG 拒绝）。
- `POST /assets/:id/replace`：同存储键覆盖（URL 不变），替换文件类型须与原文件一致；引用该素材的文章/页面即时生效。
- `DELETE /assets/:id`：删库 + 删存储对象（对象删除失败仅告警）。
- 公开读取 `GET /api/public/files/:key`：按 storeKey 反查素材后返回二进制，带 `nosniff` / `Content-Disposition` / `no-cache`。
- 文章保存时按正文 URL 反查素材并绑定 `sourceType`(article/submission) + `sourceId`（文章 ID）。

### 8.12 积分商城可见/可下单范围门槛（商品 + 商品类别）

- 两级门槛：商品自身 `visibilityIdentities/visibilityLevels`（可见）与 `orderIdentities/orderLevels`（可下单）+ 所属**商品类别**（字典 `goods_category`，在「商品管理 > 商品类别」弹窗维护的同类四项）**都需通过**；两组都为空 = 不限。
- 命中口径与活动/需求一致：按「单个身份」联合判定（身份类型命中且等级命中），多身份取并集（`AppMallService.scopeMatches`）；等级仅社区个体/社区企业身份拥有。
- 生效点：列表按可见范围过滤（商品自身用 SQL 条件，类别范围不通过的类别直接剔除，分页与 total 同源）、详情不可见一律 404（不暴露存在性）、下单先判可见（404）再判可下单（403「当前身份暂不可兑换该商品」）；游客/未登录按无身份处理，仅「不限」商品可见。
- 类别维护：编码 GC 前缀自动分配，可新增/改名/启停/删除（`PUT /api/admin/dicts/goods_category/:code` 随整表单提交范围）；范围为空的类别等同不限（存量数据即为此态，行为与改造前一致）。

## 9. 审计与通知

### 9.1 审计（AuditService 直写 + AuditInterceptor 骨架）

- **实现**：各域写操作在 Service 内成功路径调用 `AuditService.record`（M1.5 起不再使用 `@Audit` 装饰器端点；`AuditInterceptor` 仍作为全局骨架保留）。字段：operator（JWT name；系统触发为「系统」/「系统自动归档」）、module/action/target/detail、ip（拦截器场景）、before/after（变更前后快照，JSONB）。
- **模块覆盖（15 类）**：认证（修改密码）、RBAC（管理员增改启停/重置密码/角色权限分配）、社区成员（新增用户/编辑用户信息/重置密码/冻结账号）、社区企业（新增/编辑/停用/启用/归档企业）、合作企业（新增/编辑/停用/启用/归档/关联成员增删）、审核中心（审核通过/驳回/归档申请）、需求管理（新增/审核通过/驳回/发布/定时/取消定时/撤回/关闭/立项/归档）、项目管理（新增/暂停/恢复/关闭/归档）、活动管理（发布/定时/取消定时/报名开关/取消/恢复/归档）、空间管理（预约审核/取消/归档、租约归档）、内容管理（文章审核/发布/定时/下架/删除、公告发布/编辑/下架/重新发布/置顶/删除）、积分商城（积分调整/商品上架下架/归档/订单发货/归档）、系统管理（保存配置/字典增删启停）、素材库（上传/替换/删除）、归档管理（恢复对象/彻底删除对象/更新归档设置）。
- **写入失败不影响主流程**（异步/捕获告警）；`id` 走 AL 前缀；`ip`/`before`/`after` 为扩展列。
- 查询口径同 M0：module 精确筛选 + keyword 跨 target/action/detail/operator 模糊，最新在前；响应只含 M0 形状字段（不含 ip/before/after）。

### 9.2 通知（AdminNotification，业务事件驱动）

| type | 触发事件 | link |
|---|---|---|
| approval | 入驻/合作/退驻申请提交（M2 客户端写入；种子数据存在） | /approvals |
| demand_review | 需求提交待审核（M2 客户端） | /demands/review |
| reservation | 空间预约提交（M2 客户端） | /spaces/reservations |
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

- **来源**：`prisma/seed-data/` 为唯一数据源（全量演示数据，编号与跨模块引用一致）。当前计数（`Seed` 日志口径）：
  - 社区成员：users 15 / UserIdentity（随 users）/ enterprises 9 / externalEnterpriseProfiles 3 / applications 13（四类）/ demands 13（含 respondents）/ projects 8 / events 9（含 enrollments）
  - 账本与商城：experienceRecords 39 / pointsRecords 21 / goods 9 / redemptionOrders 6 / pointsRules 9 / experienceRules 6 / levelTiers 5
  - 空间：workstationAreas 3 / workstations 20 / leases 8 / spaces 6 / reservations 12
  - 内容：columns 6（含系统保留「未指定」COL_NONE）/ articles 10（官方 A×2 + 投稿 SU×8）/ showcaseRequests 5 / announcements 6
  - 系统：dicts 25（demand_category 6 / industry 11 / event_type 5 / goods_category 3）/ notifications 10（N9001+）/ auditLogs 25（AL1001+）/ systemConfig 1
  - 治理：AdminPermission **55** / AdminRole **4**（super/operator/auditor/space-ops）/ AdminUser **4**（初始密码 admin123，space-ops 为 disabled 示例）/ ArchiveSetting **13**。
- **ID 序列**：`IdSequence` 初始化 24 个前缀（U/E/AP/D/P/EV/XE/EX/PT/G/RO/R/WS/WA/LS/S/SR/A/SU/CL/SC/AN/N/AL）为各前缀当前最大值（R = 角色，内置 R1~R4，运行时新增角色自 R5 续号）；项目编号另按 `CODE-<year>` 初始化（JY-YYYY-NN 按年独立发号）；素材 AST 不预置（运行时发号）。**投稿文章使用 SU 前缀**（官方文章 A 前缀）。
- **要求**：编号前缀与源数据一致；跨模块引用一致（末笔流水 balance=实体当前值、办公位↔租约↔企业、预约/活动场地等）；`db:seed` 幂等（按 FK 逆序清空后重建）；种子运行后清理 Redis 应用缓存与动态鉴权键（§10）。
- 种子数据保持既有演示取值，不做“顺手修正”（内容/申请改造已同步调整相关数据，如旧 XE7004 档案已移除）。

## 12. admin API 层

- `apps/admin/src/api/` 共 36 个文件（`http.ts` + 35 域文件）全部走真实 HTTP，统一 `baseURL /api/admin`、Bearer token、包络解包 `body.data`、401 清 token 跳登录；admin 无 mock 数据源，种子数据唯一来源为 `apps/api/prisma/seed-data/`。
- 字典消费点（商品类型/需求类别/行业/活动类型表单与列表）统一走 `/api/admin/dicts/*`（失败回退 `dictFallback` 词表）。
- vite.config 配置 `/api` 代理（见第 3 节）；生产构建由部署期网关统一转发 `/api`。

## 13. 实现状态

- 管理端 `/api/admin/**` 与客户端 `/api/app/**` 端点均已实现并接入真实接口；后端源码共 385 个 HTTP 路由装饰器。
- 关键能力：RBAC（权限码目录 + any-of + 数据范围域）、验证码/登录锁定/会话黑名单、审计（before/after 快照）、积分/经验引擎、归档体系（13 域 + 自动归档/自动删除）、导出/打印、素材上传与公开读取、富文本清洗、监控与定时任务。
- 验证命令与环境准备见 [README](../README.md)；后端测试文件 46 个（e2e + unit），隔离库 e2e 需按 README 准备 `apps/api/.env.it` 与 `_it`/`_test` 数据库后执行。

## 14. 工程约定

- **验证底线**：每模块 PR 级改动跑 `pnpm --filter @joinyuu/admin exec tsc -p tsconfig.json --noEmit`（admin 侧）、`pnpm --filter @joinyuu/api exec tsc -p tsconfig.json --noEmit` + `pnpm build:api` + `pnpm --filter @joinyuu/api test:e2e`（api 侧，需 Docker 服务运行）；不虚报测试结论（无测试即说明仅构建验证）。
- **测试策略**：单测覆盖纯逻辑（状态机矩阵/冲突算法/经验分配/ID 发号）；e2e 每域至少覆盖"列表-详情-一次状态流转"主干；不追求覆盖率数字，主干链路优先。
- **契约变更流程**：任何端点/字段/状态机变更 = 先改本文档 → 再改代码 → 同步 README 与实体字段文档；禁止只改代码。
- **提交规范**：沿用 `<type>: <描述>`；后端模块建议 `feat(api): xxx` 前缀区分 admin 改动。
- **Windows 协作**：脚本改动避免 heredoc/内联模板串；批量脚本走临时 .mjs 文件 + fs 写入；改完必须读盘校验（历史教训见 `.workbuddy/memory`）。
- **文档同步**：每完成后端模块，在 `docs/` 沉淀实体字段列表（page as documentation）。
