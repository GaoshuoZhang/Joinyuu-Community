# 聚屿社区 Joinyuu Community

> 社区数字化运营平台：管理后台（运营方）+ 客户端移动端（社区个体 / 社区企业 / 个人用户）双端闭环，覆盖需求发布、项目协作、活动报名、商城积分与空间预约全业务流程。

[![Version](https://img.shields.io/badge/version-1.5.0-blue)](./docs/versioning.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![pnpm](https://img.shields.io/badge/pnpm-monorepo-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

> 本 README 面向人类协作者与 AI agent，传达项目信息与协作约定。开始任何开发工作前，请先读完本文档与 [docs/](./docs/) 下的索引文档。

## ✨ 项目亮点

- **双端真实闭环**：管理后台 63 个视图 + 移动端 65 个视图全部接入真实 HTTP API，无本地 mock 数据源；开发经 Vite 代理、生产由网关同源转发 `/api`。
- **完整业务生命周期**：需求发布 → 审核 → 响应撮合 → 立项 → 项目协作（里程碑 / 验收 / 结项）→ 归档治理，背后是 68 个 Prisma 模型与 74 个迁移。
- **多身份模型**：一人多身份——个人用户 / 社区个体 / 社区企业 / 合作企业，RBAC 权限贯穿路由守卫与按钮级指令。
- **基础设施自建**：JWT + 图形验证码 + Redis 会话黑名单、审计日志、富文本清洗、积分 / 经验引擎、10 项定时任务与软删除归档体系。
- **三端锁步发布**：后端 / 管理后台 / 移动端共用同一版本号，三端都有更新日志与版本号展示位（见 [版本与更新日志](#-版本与更新日志)）。
- **工程化质量**：移动端 116 个组件 / 回归测试、管理后台 30 个 UI 契约测试、后端单测 + 48 个套件 371 个用例的隔离库 e2e，全仓 typecheck / lint / build 一键执行。

## 🧩 三端与版本

| 端 | 目录 | 版本 | 版本号展示位置 | 更新日志 |
| --- | --- | --- | --- | --- |
| 后端服务 | [apps/api](./apps/api) | v1.5.0 | `GET /api/health`、`GET /api/app/config`、系统监控概览 | [CHANGELOG](./apps/api/CHANGELOG.md) |
| 管理后台 | [apps/admin](./apps/admin) | v1.5.0 | 登录页品牌区、系统管理 → 关于 → 版本信息 | [CHANGELOG](./apps/admin/CHANGELOG.md) |
| 移动端 Web | [apps/client-mobile](./apps/client-mobile) | v1.5.0 | 我的 → 关于（软件版本 / 服务端版本 / 定制UI版本号） | [CHANGELOG](./apps/client-mobile/CHANGELOG.md) |

- **版本号唯一来源**：各端 `package.json` 的 `version`（后端运行时读取、前端构建期注入），禁止在代码里硬编码。
- **规则与发布流程**：[docs/versioning.md](./docs/versioning.md)（语义化版本 + Keep a Changelog）。
- **发布纪律**：每次版本更新必须同时「提升三端版本号 + 写入三份 CHANGELOG + 发布后核对三端版本号一致」。

## 🛠 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | NestJS 11 · Prisma 6 · PostgreSQL 17 · Redis 7.4 · JWT + 图形验证码 · MinIO（可选对象存储） |
| 管理后台 | Vue 3 · TypeScript · Vite · TDesign Vue Next · Pinia · Vue Router（hash） |
| 移动端 Web | Vue 3 · TypeScript · Vite · TDesign Mobile Vue · Pinia · Vue Router（history） |
| 工程 | pnpm monorepo · ESLint · Jest（后端）/ Vitest（前端）· 隔离数据库 e2e |
| 授权 | 离线许可证（Ed25519 内置公钥，过期转只读） |

## 📦 环境要求与安装

前置条件：Node.js 20+、pnpm 9+、Docker（用于本地 PostgreSQL / Redis / MinIO）。

```bash
git clone https://github.com/GaoshuoZhang/Joinyuu-Community.git
cd Joinyuu-Community
pnpm install
```

## 🚀 快速开始

> **授权**：系统已启用离线许可证校验。供应商公钥已内置，无需配置公钥文件；在「系统管理 → 系统配置 → 许可证管理」生成申请、导入许可证。未授权或到期时仅保留查询、导出及维护操作，业务不可写入。签发、续期与部署步骤见 [许可证管理](./docs/license-management.md)。
> **生产部署**（1Panel）见[部署手册](./docs/deploy-1panel.md)；已有部署升级见[后端升级手册](./docs/backend-upgrade.md)。

```bash
pnpm db:up                # 启动 PostgreSQL 17 + Redis 7.4 + MinIO（Docker Compose）
pnpm db:reset             # 本地开发：重建数据库（迁移 + 全量演示种子数据）
pnpm dev:api              # 后端服务（NestJS watch 模式，端口 7757）
pnpm dev:admin            # 管理后台（端口 7758，代理 /api → 7757）
pnpm dev:client-mobile    # 客户端移动端（端口 7759，代理 /api → 7757）
```

Windows 本地环境可在仓库根目录双击 `start-backend.bat` / `start-admin-web.bat` / `start-client-mobile.bat` 快速启动对应服务（脚本未纳入版本库，仅本地存在）。

访问入口与演示账号（**演示账号仅存在于 `pnpm db:reset` 的演示种子，生产用 `pnpm db:init` 不会写入**）：

| 入口 | 地址 | 账号 |
| --- | --- | --- |
| 管理后台 | http://localhost:7758 | `admin / admin123`（真实 JWT 登录，需输入图形验证码；种子另含 operator / auditor 等 RBAC 账号） |
| 移动端 | http://localhost:7759 | 种子成员如 `13801210001 / user123` |
| 后端健康检查 | http://localhost:7757/api/health | —（返回 `{ code: 0, data: { status, version } }`） |

## 📁 仓库结构

```
apps/
  admin/            # 管理后台 Web（全量接入真实接口）
    src/
      api/          # API 层（38 个文件，全部 HTTP 化）
      components/   # 共享组件（PageHeader/StatusTag/IdentityTags/LevelTag/RichEditor/TrendChart/ColumnController/BulkArchiveDialog/ExportButton/ListEmptyState/...）
      constants/    # 状态映射 / 身份词汇表 / 权限目录（冻结）
      directives/   # v-permission 按钮级权限指令
      layouts/      # AdminLayout（唯一 App Shell）
      router/       # 路由表（冻结，含 RBAC 路由守卫）
      stores/       # Pinia（auth/tabs/theme）
      views/        # 63 个页面文件（按领域分目录，system/ 含归档管理、系统升级等治理页）
  api/              # 后端服务（NestJS 11 + Prisma 6 + PostgreSQL 17 + Redis 7.4）
    prisma/         # schema.prisma（68 个模型）+ migrations/（74）+ seed.ts / init.ts + seed-data/
    src/
      common/       # 底座：Prisma / Redis / 响应包络 / 异常过滤 / JWT+权限 Guard / 装饰器 / RBAC / 审计 / 发号器 / 积分引擎 / 存储 / 许可证 / 版本号
      modules/      # 按域模块：auth/users/enterprises/applications/demands/projects/events/mall/rules/workstations/spaces/contents/assets/messaging/mobile-theme + system 子域
      scheduler/    # 10 个定时任务（发布/活动结束/租约临期/自动归档/自动删除/消息投递/券码退款/日志清理）
    test/           # e2e / unit（隔离数据库执行）
    CHANGELOG.md    # 后端更新日志
  client-mobile/    # 移动端 Web（纯移动端，5 Tab）
    src/
      api/          # HTTP 封装与域 API（统一请求 /api/app/**）
      views/mobile/ # 65 个视图文件
      composables/  # 列表分页、路由同步、下拉刷新等复用逻辑
      stores/       # Pinia（auth/config/customerTheme/...）
    CHANGELOG.md    # 移动端更新日志
docs/               # 项目文档（见下方文档索引）
```

## 🧾 常用命令

开发：

```bash
pnpm install              # 安装依赖
pnpm dev:api              # 启动后端（7757）
pnpm dev:admin            # 启动管理后台（7758）
pnpm dev:client-mobile    # 启动移动端（7759）
pnpm dev:it               # 以隔离数据库/Redis 启动三端联调环境
```

数据库：

```bash
pnpm db:up                # 启动 PostgreSQL + Redis + MinIO（Docker Compose）
pnpm db:migrate           # 应用迁移（prisma migrate deploy）
pnpm db:init              # 生产初始化：仅基础配置（字典/权限/角色/超管/渠道与模板），不含演示数据
pnpm db:seed              # 写入全量种子数据（含演示业务数据，仅本地开发与 e2e）
pnpm db:reset             # 重建数据库（drop + migrate + 全量种子）
```

构建与验证：

```bash
pnpm build:api            # 构建后端
pnpm build:admin          # 构建管理后台
pnpm build:client-mobile  # 构建移动端
pnpm typecheck            # 全仓类型检查（api + admin + client-mobile）
pnpm lint                 # 全仓 ESLint 检查
pnpm --filter @joinyuu/api test:unit        # 后端单元测试
pnpm --filter @joinyuu/client-mobile test   # 移动端组件/回归测试（116 个用例）
pnpm --filter @joinyuu/admin test:ui        # 管理后台 UI 契约测试（30 个用例）
pnpm test:e2e:it          # 隔离数据库全量 e2e（48 套件 / 371 用例）
```

## 🔐 配置与部署

| 主题 | 说明 | 文档 |
| --- | --- | --- |
| 环境变量 | 后端全部配置集中在 `apps/api/.env`，模板见 [apps/api/.env.example](./apps/api/.env.example)（含服务器首次上线步骤） | — |
| 生产部署（1Panel） | 装面板 → 建库 → 部署后端与两个前端 → 反向代理与 HTTPS → 初始化与验收 | [部署手册](./docs/deploy-1panel.md) |
| 版本升级 | 备份 → 拉代码 → 补环境变量 → 迁移 → 构建 → 重启 → 回滚 | [后端升级手册](./docs/backend-upgrade.md) |
| 授权 | 生成申请、签发、导入、到期只读边界 | [许可证管理](./docs/license-management.md) |
| 版本与更新日志 | 版本号规则、单源、展示位置、发布流程 | [版本与更新日志规范](./docs/versioning.md) |

## 🗓 版本与更新日志

当前版本：**v1.5.0**（后端 / 管理后台 / 移动端锁步发布）。

- 版本号规则：[语义化版本](https://semver.org/lang/zh-CN/)；三端同号；版本号唯一来源是各端 `package.json` 的 `version`。
- 更新日志：[后端](./apps/api/CHANGELOG.md) · [管理后台](./apps/admin/CHANGELOG.md) · [移动端](./apps/client-mobile/CHANGELOG.md)，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
- **每次版本更新必须**：① 同步提升四处 `package.json` 版本号；② 把改动从 `[Unreleased]` 整理进三份 CHANGELOG 的新版本段（含日期与分类）；③ 发布后核对 `/api/health`、后台关于页、移动端关于页版本号一致。完整检查表见 [版本与更新日志规范](./docs/versioning.md#6-发布检查表可复制使用)。

## 📚 文档索引

| 文档 | 用途 |
| --- | --- |
| [docs/wiki-admin-web.md](./docs/wiki-admin-web.md) | 管理后台开发 Wiki：设计 tokens、布局骨架、组件规范、状态机、API 约定——**改 admin 代码前必读** |
| [docs/wiki-backend.md](./docs/wiki-backend.md) | 后端开发 Wiki：数据模型、端点契约和业务规则——**改后端代码前必读** |
| [docs/wiki-client-mobile.md](./docs/wiki-client-mobile.md) | 移动客户端开发 Wiki——**改移动客户端代码前必读** |
| [docs/api-app-design.md](./docs/api-app-design.md) | 客户端 `/api/app/**` 正式契约 |
| [docs/entity-fields.md](./docs/entity-fields.md) | 模型分域字段摘要（`schema.prisma` 为事实来源） |
| [docs/versioning.md](./docs/versioning.md) | 版本号规则、单源与展示位置、CHANGELOG 规范、发布流程与检查表 |
| [docs/deploy-1panel.md](./docs/deploy-1panel.md) | 部署手册（1Panel）：装面板 → 建库 → 部署后端与两个前端 → 反向代理与 HTTPS → 初始化与验收排错 |
| [docs/backend-upgrade.md](./docs/backend-upgrade.md) | 后端升级手册：备份、迁移、构建、重启、缓存生效与回滚 |
| [docs/license-management.md](./docs/license-management.md) | 离线许可证：签发、续期、部署与只读边界 |
| [docs/wiki-mobile-theme.md](./docs/wiki-mobile-theme.md) | 移动端客户主题包开发、上传、预览、启用与回退 |

移动端客户主题包示例与打包工具：示例位于 `examples/mobile-theme`（本地目录，不入库），打包脚本为 `scripts/pack-mobile-theme.ps1`。

## 🔧 关键工程约定（摘要，详见各 Wiki）

1. **契约冻结**：菜单/路由/状态映射/身份词汇表已冻结，不得私自重写导航、发明颜色字号或自造状态文案。
2. **共享组件强制**：状态标签用 `StatusTag`（移动端 `StateTag`）、身份标签用 `IdentityTags`（移动端 `IdentityTag`）、等级标签用 `LevelTag`，禁止页面自造。
3. **术语统一**：管理端 联系电话（与邮箱） / 办公位 / 社区企业 / 合作企业 / 经验值 / 审核 / 新增 / 归档；**移动端「需求」指立项前的需求（发布/响应/收藏），「项目」仅指立项后的协作项目**；禁止回退旧词（联系方式、工位、审批、新建、回收站等）。
4. **种子数据单一来源**：后端 `apps/api/prisma/seed-data/`（含演示数据，仅供开发与 e2e）；生产初始化用 `pnpm db:init`（仅基础配置）。
5. **接口契约以 wiki-backend 与 api-app-design.md 为准**：admin `src/api/` 走真实 HTTP（`/api/admin/**`）；写操作由后端 `@RequirePermission` 与 `AuditService` 管控；客户端 `/api/app/**` 接入已完成，三端均无本地 mock。
6. **项目需求方口径**：需求立项生成的项目，需求方/创建人/联系方式/合同价格一律照搬需求快照（客户端传值不生效）；项目访问按需求方主体放行。
7. **表单校验时机**：弹窗规则 `trigger: 'submit'`，打开时 `clearValidate()`，避免 DatePicker 交互提前红框。
8. **表格规范**：开启 `resizable` 的表格必须 `table-layout="fixed"` + `hover`；服务端排序用受控 `:sort` + `@sort-change`；列表需含「共 N 条数据」与标准分页（固定行数配置表与详情页内只读子表除外）。
9. **ID 展示规范**：实体 ID 用 `.id-tag`（同行内联）/ `.id-tag-block`（名称下方独立成行）；下拉与标签内名称统一为 `名称 [ID]`，同一视图内不重复展示同一 ID。
10. **归档体系**：13 个业务域软删除后进入归档管理（恢复/彻底删除 + 按域归档设置），自动归档/自动删除由调度器按设置执行。
11. **列表交互收敛**：全站列表无表格批量操作、无刷新按钮；列设置（ColumnController）覆盖 20 个列表页；顶栏「全部关闭」等同于「关闭其他」。
12. **版本号与更新日志**：三端锁步同号，版本号只在 `package.json` 维护；每次版本更新必须更新三端 CHANGELOG（见 [版本与更新日志规范](./docs/versioning.md)）。
13. **文档沉淀**：以 `docs/` 中的 Wiki、API 契约与实体字段文档为准；代码与文档冲突时先确认契约，再同步回写文档。
14. **同文件编辑冲突**：批量编辑时避免对同一文件的并行写入（历史上多次造成改动丢失），重要改动后需读盘校验并构建验证。

## 🔄 核心业务状态机（已冻结）

- **需求**：待审核 →（只读审核通过）→ 待发布 →（立即/定时发布）→ 已发布/定时发布中 →（到点自动）→ 已发布；分支：已驳回/已关闭/立项→已立项
- **项目**：进行中 ⇄ 已暂停 → 已关闭 / 结项（全部里程碑验收通过自动结项）→ 归档；结项按承接占比发放项目经验值
- **活动**：待发布 →（立即/定时发布）→ 已发布（报名中/暂停报名）→ 已结束/已取消
- **身份模型**：一人多身份——个人用户（默认，积分挂靠）/ 社区个体（至多一个，有等级）/ 社区企业（可多个，有等级）/ 合作企业（可多个）
- **归档**：各域终态/指定状态条目可软删除进入归档管理，支持恢复与彻底删除；自动归档/自动删除按域设置由调度器执行

## ✅ 验证结果

| 验证项 | 结果 |
| --- | --- |
| `pnpm typecheck`（api + admin + client-mobile） | 通过 |
| `pnpm lint`（全仓） | 通过 |
| `pnpm build:api` / `build:admin` / `build:client-mobile` | 通过 |
| 移动端组件 / 回归测试 | 通过，116 个用例 |
| 管理后台 UI 契约测试 | 通过，30 个用例 |
| 后端单元测试 | 通过 |
| 隔离数据库全量 e2e | 通过，48 个套件 / 371 个用例（需先准备 `apps/api/.env.it`，示例见 [apps/api/env.it.example](./apps/api/env.it.example)） |

## 🤝 贡献

- 主分支 `main`，远程 `https://github.com/GaoshuoZhang/Joinyuu-Community.git`。
- 提交信息格式：`<type>(<scope>): <描述>`（如 `feat(api,admin,client-mobile): 项目需求方快照、权限修复与三端交互治理`）；`type` 用 `feat` / `fix` / `refactor` / `perf` / `docs` / `test` / `chore` / `release`。
- 提交前至少执行与改动范围对应的检查：`pnpm typecheck`、`pnpm lint`、对应工作区测试/构建；后端涉及迁移时先 `pnpm --filter @joinyuu/api exec prisma generate` 与 `pnpm db:migrate`。
- **发布前**：按 [版本与更新日志规范](./docs/versioning.md#4-发布流程每次版本更新照此执行) 提升版本号、更新三端 CHANGELOG，并核对三端版本号一致。
- 改任一端的代码前，先读对应的 `docs/wiki-*.md`；界面相关改动建议遵循仓库内的 better-interface 审查结论。
- 欢迎 Issue 与 PR：需求与缺陷请附复现步骤、期望行为与实际行为。

## 📝 License

本项目暂未声明开源 License（仓库当前为私有项目）。如需开源，请先补充 `LICENSE` 文件并同步本节。
