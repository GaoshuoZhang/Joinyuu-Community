# 聚屿社区 Joinyuu Community

创业社区数字化运营平台：管理后台（运营方）+ 客户端 Web（社区个体/社区企业）+ 微信小程序（社区个体/社区企业/个人用户）。

> 本 README 面向人类协作者与 AI agent，传达项目信息与协作约定。开始任何开发工作前，请先读完本文档与 `docs/` 下的索引文档。

## 当前进度（2026-09-20）

项目已完成 M0、M1、M1.5，以及 M2-R R0～R4 的主要实现，当前处于 M2-R 收尾后的整合与复查阶段。管理后台和移动端均已接入真实 HTTP API；移动端仍保留显式 `VITE_API_MODE=mock` 演示模式。

已完成的核心范围包括：

- 后端基础设施、Prisma 数据模型与迁移、JWT/验证码/RBAC/审计、Redis 会话与黑名单、文件存储、富文本清洗、积分/经验、定时任务和归档治理。
- 管理后台真实接口化、系统监控、日志审计、内容/公告/轮播图、申请表单配置、发布限制、成员注销治理、个人/企业名片管理等运营能力。
- 移动端注册登录、多身份、首页、需求、项目、活动报名/签到/电子票、社区/人才/企业、文章与评论、商城、空间预约、通知、积分/经验、申请、名片和账户安全等闭环。
- M2-R 收尾治理：实名认证改为规则校验即时生效；注销保留冷静期与后台工单治理；文章下架统一为“已关闭”；服务申请与展示页申请流程下线。

当前未开始或不在本阶段范围内：客户端 Web（`apps/client-web`）、微信小程序（M3）、微信登录、支付、CI/CD 和分布式部署。

当前工作区存在较大规模未提交变更，下面的状态描述以工作区代码为准，不代表这些变更已经合并到远程分支。

### 当前验证结果

最近一次本地验证：

| 验证项 | 结果 |
|---|---|
| `pnpm build:api` | 通过 |
| `pnpm build:admin` | 通过 |
| `pnpm build:client-mobile` | 通过 |
| `pnpm --filter @joinyuu/client-mobile test` | 通过，36 个测试 |
| `pnpm --filter @joinyuu/admin test:ui` | 通过，6 个测试 |
| 隔离数据库全量 e2e | 本次未执行；需要先准备 `apps/api/.env.it`、Docker PostgreSQL/Redis |

代码规模会随收尾重构变化，精确数量以当前目录和 `schema.prisma` 为准：当前约 64 个 Prisma 模型、42 个迁移、管理后台 33 个 API 文件/60 个视图、移动端 21 个域 API 文件/64 个视图。

## 技术栈

| 层 | 选型 |
|---|---|
| 仓库 | pnpm Monorepo（`apps/` + `packages/`） |
| 后端（M1/M1.5/M2-R 已完成） | NestJS 11 + Prisma 6 + RESTful API（`apps/api`，端口 7757） |
| 数据库（M1/M1.5/M2-R 已完成） | PostgreSQL 17 + Redis 7.4（Docker Compose 本地开发） |
| 管理后台 Web（当前） | Vue 3 + Vite + TypeScript + TDesign Vue Next + Pinia + Vue Router |
| 客户端移动端（M2-R 已完成） | Vue 3 + Vite + TypeScript + TDesign Mobile Vue + Pinia + Vue Router |
| 客户端 Web（M2，未开始） | Vue 3 + Vite + TypeScript + TDesign Vue Next + Pinia + Vue Router |
| 微信小程序（M3，未开始） | TDesign WeChat MiniProgram |

## 仓库结构

```
apps/
  admin/            # 管理后台 Web（全量接入真实接口；mock 已删除）
    src/
      api/          # API 层 —— 当前 33 个文件，全部 HTTP 化
      components/   # 共享组件（PageHeader/StatusTag/IdentityTags/RichEditor/TrendChart/ColumnController/BulkArchiveDialog/...）
      constants/    # 状态映射 / 身份词汇表 / 权限目录（冻结）
      directives/   # v-permission 按钮级权限指令
      layouts/      # AdminLayout（唯一 App Shell）
      router/       # 路由表（冻结，含 RBAC 路由守卫）
      stores/       # Pinia（auth/tabs/theme）
      types/        # 实体类型定义
      views/        # 页面（按领域分目录，system/ 含归档管理 ArchivePanel 等治理页）
  api/              # 后端服务（NestJS 11 + Prisma 6 + PostgreSQL 17 + Redis 7.4）
    prisma/         # schema.prisma（当前 64 个模型）+ migrations/ + seed.ts + seed-data/（种子数据单一来源）
    src/
      common/       # 底座：Prisma/Redis（缓存+黑名单，降级回源）/响应包络/异常过滤/JWT+权限 Guard/装饰器/RBAC/审计（含快照）/前缀 ID 发号器/积分引擎/存储（本地磁盘）/HTML 清洗与工具
      modules/      # 按域模块：auth/users/enterprises/applications/demands/projects/events/mall/rules/workstations/spaces/contents/assets + system 子域（admins/login-logs/monitor/roles/trash/export）
      scheduler/    # 定时任务（需求/资讯定时发布、活动自动结束、租约临期、归档自动归档/自动删除）
    test/           # e2e / unit（隔离数据库执行；journey-flows 为三端联调）
  client-mobile/    # M2 纯移动端应用（M2-R 必做范围已完成）
    src/
      api/          # mock/http 双模式；默认 http，显式 VITE_API_MODE=mock 可演示
      mock/         # [MOCK-ONLY] 内存数据与 16 个 handler
      views/mobile/ # 当前 64 个视图文件
packages/           # 预留（共享包）
docs/
  wiki-admin-web.md     # 管理后台开发 Wiki（设计契约/组件规范/状态机/API 约定）
  wiki-backend.md       # 后端开发 Wiki（数据模型/端点契约/业务规则/里程碑）
  wiki-client-mobile.md # 移动客户端开发wiki
  api-app-design.md     # M2 客户端 /api/app/** 端点设计
  entity-fields.md       # 模型分域字段摘要（schema.prisma 为事实来源）
```

## 开发命令

```bash
pnpm install              # 安装依赖
pnpm dev:admin            # 启动管理后台开发服务器（7758，代理 /api → 7757）
pnpm build:admin          # 构建管理后台
pnpm build:client-mobile  # 构建移动端
pnpm --filter @joinyuu/client-mobile test # 移动端组件/回归测试
pnpm db:up                # 启动 PostgreSQL + Redis（Docker Compose，等待健康检查）
pnpm dev:api              # 启动后端服务（NestJS，7757）
pnpm build:api            # 构建后端
pnpm db:reset             # 重建数据库（drop + migrate + 全量种子）
pnpm dev:it               # 以隔离数据库/Redis 启动三端联调环境
pnpm test:e2e:it          # 仅允许隔离数据库与非 0 Redis DB 的全量 e2e
pnpm lint                 # 全仓 ESLint 检查
pnpm --filter @joinyuu/api test:unit # 后端单元测试
pnpm --filter @joinyuu/admin test:ui # 管理后台 UI 契约测试
```

演示账号：`admin / admin123`（真实 JWT 登录，需输入图形验证码；种子另含 operator / auditor 等 RBAC 账号；需先 `pnpm db:up` + `pnpm db:reset` + `pnpm dev:api`）。

## 文档索引（AI agent 必读）

| 文档 | 用途 |
|---|---|
| [docs/wiki-admin-web.md](./docs/wiki-admin-web.md) | 管理后台开发 Wiki：设计 tokens、布局骨架、组件规范、状态机、API 约定——**改 admin 代码前必读** |
| [docs/wiki-backend.md](./docs/wiki-backend.md) | 后端开发 Wiki：数据模型、端点契约和业务规则——**改后端代码前必读** |
| [docs/wiki-client-mobile.md](./docs/wiki-client-mobile.md) | 移动客户端开发 Wiki——**改移动客户端代码前必读** |
| [docs/api-app-design.md](./docs/api-app-design.md) | 客户端 `/api/app/**` 正式契约 |
| [docs/entity-fields.md](./docs/entity-fields.md) | 模型分域字段摘要（`schema.prisma` 为事实来源） |

## 关键工程约定（摘要，详见 wiki-admin-web.md / wiki-backend.md）

1. **契约冻结**：菜单/路由/状态映射/身份词汇表已冻结，不得私自重写导航、发明颜色字号或自造状态文案。
2. **共享组件强制**：状态标签用 `StatusTag`、身份标签用 `IdentityTags`，禁止页面自造。
3. **种子数据单一来源**：后端 `apps/api/prisma/seed-data/`（admin `src/mock/` 已删除）；种子写入 23 个 IdSequence 前缀（U/E/AP/D/P/EV/XE/EX/PT/G/RO/WS/WA/LS/S/SR/A/SU/CL/SC/AN/N/AL）与项目编号 `CODE-<year>`，其中投稿文章编号用 SU。
4. **接口契约以 wiki-backend 与 api-app-design.md 为准**：admin `src/api/` 当前 33 个文件走真实 HTTP（`/api/admin/**`）；写操作由后端 `@RequirePermission` 与 `AuditService` 管控；客户端 `/api/app/**` M2-R 必做接入已完成。
5. **表单校验时机**：弹窗规则 `trigger: 'submit'`，打开时 `clearValidate()`，避免 DatePicker 交互提前红框。
6. **表格规范**：开启 `resizable` 的表格必须 `table-layout="fixed"` + `hover`；服务端排序用受控 `:sort` + `@sort-change`。
7. **术语统一**：联系电话 / 办公位 / 社区企业 / 合作企业 / 经验值 / 审核 / 新增 / 归档；禁止回退旧词（联系方式、工位、审批、新建、回收站等）。
8. **ID 展示规范**：实体 ID 用 `.id-tag`（同行内联）/ `.id-tag-block`（名称下方独立成行）标签；下拉与标签内名称统一为 `名称 [ID]`，同一视图内不重复展示同一 ID。
9. **归档体系**：13 个业务域软删除（`deletedAt`/`deletedBy`）后进入归档管理（恢复/彻底删除 + 按域归档设置），自动归档/自动删除由调度器按设置执行；用户历史域（申请/需求/项目/活动/租赁/投稿/预约/订单）彻底删除与开启自动删除需三连确认。
10. **列表交互收敛**：全站列表无表格批量操作、无刷新按钮；列设置（ColumnController）覆盖 20 个列表页；顶栏「全部关闭」等同于「关闭其他」（保留工作台与当前页）。
11. **文档沉淀**：以当前 `docs/` 中的 Wiki、API 契约和实体字段文档为准；代码与文档冲突时先确认契约，再同步回写文档，避免复制可从代码生成的逐路由清单。
12. **同文件编辑冲突**：批量编辑时避免对同一文件的并行写入（历史上多次造成改动丢失），重要改动后需读盘校验并 `pnpm build:admin` 验证。

## 核心业务状态机（已冻结）

- **需求**：待审核 →（只读审核通过）→ 待发布 →（立即/定时发布）→ 已发布/定时发布中 →（到点自动）→ 已发布；分支：已驳回/已关闭/立项→已立项
- **活动**：待发布 →（立即/定时发布）→ 已发布（报名中/暂停报名）→ 已结束/已取消
- **身份模型**：一人多身份——个人用户（默认，积分挂靠）/社区个体（至多一个，有等级）/社区企业（可多个，有等级）/合作企业（可多个）
- **归档**：各域终态/指定状态条目可软删除进入归档管理，支持恢复与彻底删除；自动归档/自动删除按域设置由调度器执行

## Git 协作

- 主分支 `main`，远程 `https://github.com/GaoshuoZhang/Joinyuu-Community.git`
- 提交信息格式：`<type>: <描述>`（如 `feat: 新增需求定时发布`）
