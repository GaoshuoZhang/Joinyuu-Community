# 聚屿社区 Joinyuu Community

创业社区数字化运营平台：管理后台（运营方）+ 客户端 Web（社区个体/社区企业）+ 微信小程序（社区个体/社区企业/个人用户）。

> 本 README 面向人类协作者与 AI agent，传达项目信息与协作约定。开始任何开发工作前，请先读完本文档与 `docs/` 下的索引文档。

## 当前状态

**M1.5 后台治理增强已完成** — M0 后台原型（A~E）、M1 后端（A~E，129 个基线端点）与 M1.5 治理增强（R1~R12）全部落地：`apps/api`（NestJS 11 + Prisma 6 + PostgreSQL 17 + Redis 7.4，43 模型 / 14 个迁移）当前提供 186 条 `/api/admin/**` 路由，含 JWT + RBAC 权限守卫、验证码登录与失败锁定、在线会话、素材库（本地磁盘存储 + HTML 清洗）、系统监控、趋势聚合、登录日志、导出/打印、归档体系（13 个业务域软删除集中管理 + 按域归档设置 + 自动归档/自动删除调度）、状态机服务端校验、定时任务、积分/经验发放引擎、审计 before/after 快照、Redis 缓存（降级回源）与全量种子（23 个 IdSequence 前缀，投稿编号 SU）；admin web 28 个域文件全部接入真实接口，`src/mock/` 已删除，并完成安全加固、术语统一、ID 展示规范与列表交互收敛（无批量操作/刷新按钮，列设置覆盖 20 个列表页）。后端 e2e 25 套件 / 163 用例全绿。M2 客户端（端点设计见 [docs/api-app-design.md](./docs/api-app-design.md)）与 M3 小程序未开始，整体进度见 [docs/full-spec-check.md](./docs/full-spec-check.md)。

开发策略：**以管理后台 Web 作为初始驱动**——先在后台原型中冻结实体模型、状态流与 API 接口形状，再据此实现后端与客户端（M1/M1.5 已完成，M2 客户端未开始）。

## 技术栈

| 层 | 选型 |
|---|---|
| 仓库 | pnpm Monorepo（`apps/` + `packages/`） |
| 后端（M1/M1.5 已完成） | NestJS 11 + Prisma 6 + RESTful API（`apps/api`，端口 7757） |
| 数据库（M1/M1.5 已完成） | PostgreSQL 17 + Redis 7.4（Docker Compose 本地开发） |
| 管理后台 Web（当前） | Vue 3 + Vite + TypeScript + TDesign Vue Next + Pinia + Vue Router |
| 客户端 Web（M2，未开始） | 同上（TDesign Vue Next） |
| 微信小程序（M3，未开始） | TDesign WeChat MiniProgram |

## 仓库结构

```
apps/
  admin/            # 管理后台 Web（全量接入真实接口；mock 已删除）
    src/
      api/          # API 层 —— http.ts + 28 个域文件全部 HTTP 化
      components/   # 共享组件（PageHeader/StatusTag/IdentityTags/RichEditor/TrendChart/ColumnController/BulkArchiveDialog/...）
      constants/    # 状态映射 / 身份词汇表 / 权限目录（冻结）
      directives/   # v-permission 按钮级权限指令
      layouts/      # AdminLayout（唯一 App Shell）
      router/       # 路由表（冻结，含 RBAC 路由守卫）
      stores/       # Pinia（auth/tabs/theme）
      types/        # 实体类型定义
      views/        # 页面（按领域分目录，system/ 含归档管理 ArchivePanel 等治理页）
  api/              # 后端服务（NestJS 11 + Prisma 6 + PostgreSQL 17 + Redis 7.4）
    prisma/         # schema.prisma（43 模型）+ 14 个 migrations + seed.ts + seed-data/（种子数据单一来源）
    src/
      common/       # 底座：Prisma/Redis（缓存+黑名单，降级回源）/响应包络/异常过滤/JWT+权限 Guard/装饰器/RBAC/审计（含快照）/前缀 ID 发号器/积分引擎/存储（本地磁盘）/HTML 清洗与工具
      modules/      # 按域模块：auth/users/enterprises/applications/demands/projects/events/mall/rules/workstations/spaces/contents/assets + system 子域（admins/login-logs/monitor/roles/trash/export）
      scheduler/    # 定时任务（需求/资讯定时发布、活动自动结束、租约临期、归档自动归档/自动删除）
    test/           # e2e 套件（25 套件 163 用例，每套件重种子隔离）
packages/           # 预留（共享包）
docs/
  full-spec-check.md    # 整体项目开发规划与进度核对表（进度唯一事实来源，含 M1.5 R1~R12 路线）
  wiki-admin-web.md     # 管理后台开发 Wiki（设计契约/组件规范/状态机/API 约定）
  wiki-backend.md       # 后端开发 Wiki（数据模型/端点契约/业务规则/里程碑）
  api-app-design.md     # M2 客户端 /api/app/** 端点设计
  entity-fields.md      # 43 模型分域字段摘要（schema.prisma 为事实来源）
```

## 开发命令

```bash
pnpm install              # 安装依赖
pnpm dev:admin            # 启动管理后台开发服务器（7758，代理 /api → 7757）
pnpm build:admin          # 构建管理后台
pnpm db:up                # 启动 PostgreSQL + Redis（Docker Compose，等待健康检查）
pnpm dev:api              # 启动后端服务（NestJS，7757）
pnpm build:api            # 构建后端
pnpm db:reset             # 重建数据库（drop + migrate + 全量种子）
```

演示账号：`admin / admin123`（真实 JWT 登录，需输入图形验证码；种子另含 operator / auditor 等 RBAC 账号；需先 `pnpm db:up` + `pnpm db:reset` + `pnpm dev:api`）。

## 文档索引（AI agent 必读）

| 文档 | 用途 |
|---|---|
| [docs/full-spec-check.md](./docs/full-spec-check.md) | 整体里程碑规划与进度勾选（含 M1.5 R1~R12 前后端路线）——**接手任务前先看这里**，完成后同步勾选 |
| [docs/wiki-admin-web.md](./docs/wiki-admin-web.md) | 管理后台开发 Wiki：设计 tokens、布局骨架、组件规范、状态机、API 约定——**改 admin 代码前必读** |
| [docs/wiki-backend.md](./docs/wiki-backend.md) | 后端开发 Wiki：数据模型（43 模型）、端点契约清单、业务规则、里程碑——**改后端代码前必读** |
| [docs/api-app-design.md](./docs/api-app-design.md) | M2 客户端 `/api/app/**` 端点设计稿 |
| [docs/entity-fields.md](./docs/entity-fields.md) | 43 模型分域字段摘要（schema.prisma 为事实来源） |

## 关键工程约定（摘要，详见 wiki-admin-web.md / wiki-backend.md）

1. **契约冻结**：菜单/路由/状态映射/身份词汇表已冻结，不得私自重写导航、发明颜色字号或自造状态文案。
2. **共享组件强制**：状态标签用 `StatusTag`、身份标签用 `IdentityTags`，禁止页面自造。
3. **种子数据单一来源**：后端 `apps/api/prisma/seed-data/`（admin `src/mock/` 已删除）；种子写入 23 个 IdSequence 前缀（U/E/AP/D/P/EV/XE/EX/PT/G/RO/WS/WA/LS/S/SR/A/SU/CL/SC/AN/N/AL）与项目编号 `CODE-<year>`，其中投稿文章编号用 SU。
4. **接口契约以 wiki-backend §7 为准**：admin `src/api/` 28 个域文件已全部接入真实 HTTP（`/api/admin/**`）；写操作由后端 `@RequirePermission`（权限目录 49 码）与 `AuditService` 管控，客户端未来为 `/api/app/**`（见 api-app-design.md）。
5. **表单校验时机**：弹窗规则 `trigger: 'submit'`，打开时 `clearValidate()`，避免 DatePicker 交互提前红框。
6. **表格规范**：开启 `resizable` 的表格必须 `table-layout="fixed"` + `hover`；服务端排序用受控 `:sort` + `@sort-change`。
7. **术语统一**：联系电话 / 办公位 / 社区企业 / 合作企业 / 经验值 / 审核 / 新增 / 归档；禁止回退旧词（联系方式、工位、审批、新建、回收站等）。
8. **ID 展示规范**：实体 ID 用 `.id-tag`（同行内联）/ `.id-tag-block`（名称下方独立成行）标签；下拉与标签内名称统一为 `名称 [ID]`，同一视图内不重复展示同一 ID。
9. **归档体系**：13 个业务域软删除（`deletedAt`/`deletedBy`）后进入归档管理（恢复/彻底删除 + 按域归档设置），自动归档/自动删除由调度器按设置执行；用户历史域（申请/需求/项目/活动/租赁/投稿/预约/订单）彻底删除与开启自动删除需三连确认。
10. **列表交互收敛**：全站列表无表格批量操作、无刷新按钮；列设置（ColumnController）覆盖 20 个列表页；顶栏「全部关闭」等同于「关闭其他」（保留工作台与当前页）。
11. **文档沉淀**：每完成一个模块，同步更新 full-spec-check.md 勾选状态；后端模块完成后在 `docs/` 沉淀实体字段列表（page as documentation）。
12. **同文件编辑冲突**：批量编辑时避免对同一文件的并行写入（历史上多次造成改动丢失），重要改动后需读盘校验并 `pnpm build:admin` 验证。

## 核心业务状态机（已冻结）

- **需求**：待审核 →（只读审核通过）→ 待发布 →（立即/定时发布）→ 已发布/定时发布中 →（到点自动）→ 已发布；分支：已驳回/已关闭/立项→已立项（草稿已移除）
- **活动**：待发布 →（立即/定时发布）→ 已发布（报名中/暂停报名）→ 已结束/已取消
- **身份模型**：一人多身份——个人用户（默认，积分挂靠）/社区个体（至多一个，有等级）/社区企业（可多个，有等级）/合作企业（可多个）
- **归档**：各域终态/指定状态条目可软删除进入归档管理，支持恢复与彻底删除；自动归档/自动删除按域设置由调度器执行

## Git 协作

- 主分支 `main`，远程 `https://github.com/GaoshuoZhang/Joinyuu-Community.git`
- 提交信息格式：`<type>: <描述>`（如 `feat: 新增需求定时发布`）
