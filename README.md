# 聚屿社区 Joinyuu Community

> 社区数字化运营平台：管理后台（运营方）+ 客户端移动端（社区个体/社区企业/个人用户）双端闭环，覆盖需求发布、项目协作、活动报名、商城积分与空间预约全业务流程。

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/GaoshuoZhang/Joinyuu-Community)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![pnpm](https://img.shields.io/badge/pnpm-monorepo-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

> 本 README 面向人类协作者与 AI agent，传达项目信息与协作约定。开始任何开发工作前，请先读完本文档与 `docs/` 下的索引文档。

## ✨ 项目亮点

- **双端真实闭环**：管理后台 63 个视图 + 移动端 65 个视图全部接入真实 HTTP API，无本地 mock 数据源，开发经 Vite 代理、生产由网关同源转发 `/api`。
- **完整业务生命周期**：需求发布 → 审核 → 响应撮合 → 立项 → 项目协作（里程碑/验收/结项）→ 归档治理，背后是 68 个 Prisma 模型与 74 个迁移。
- **多身份模型**：一人多身份——个人用户 / 社区个体 / 社区企业 / 合作企业，RBAC 权限贯穿路由守卫与按钮级指令。
- **基础设施自建**：JWT + 图形验证码 + Redis 会话黑名单、审计日志、富文本清洗、积分/经验引擎、定时任务（定时发布/自动结束/临期提醒/自动归档）与软删除归档体系。
- **工程化质量**：移动端 71 个组件测试、管理后台 10 个 UI 契约测试、后端单测 + 三端联调 e2e，全仓 typecheck / lint / build 均可一键执行。

## 🎯 适用场景

- **创业社区 / 孵化器运营方**：需要统一管理社区企业与个体、撮合需求、运营活动与空间预约。
- **全栈开发者**：想了解 Vue 3 + NestJS + Prisma 的 pnpm monorepo 工程组织方式。
- **需要社区运营闭环参考实现的团队**：需求-项目-活动-商城-积分-名片的多域联动设计。

## 📦 环境要求与安装

前置条件：Node.js、pnpm、Docker（用于 PostgreSQL / Redis / MinIO）。

```bash
git clone https://github.com/GaoshuoZhang/Joinyuu-Community.git
cd Joinyuu-Community
pnpm install
```

## 🚀 快速开始

> 授权：系统已启用离线许可证校验。供应商公钥已内置，无需配置公钥文件；在「系统管理 → 系统配置 → 许可证管理」生成申请、导入许可证。未授权或到期时仅保留查询、导出及维护操作，业务不可写入。供应商使用独立工具双击签发，输入天数即可。签发、续期和部署步骤见 [许可证管理](./docs/license-management.md)。现有部署升级先运行 `pnpm db:migrate`。

```bash
pnpm db:up                # 启动 PostgreSQL 17 + Redis 7.4 + MinIO（Docker Compose）
pnpm db:reset             # 重建数据库：迁移 + 全量种子数据
pnpm dev:api              # 后端服务（NestJS watch 模式，端口 7757）
pnpm dev:admin            # 管理后台（端口 7758，代理 /api → 7757）
pnpm dev:client-mobile    # 客户端移动端（端口 7759，代理 /api → 7757）
```

Windows 本地环境可在仓库根目录双击 `start-backend.bat` / `start-admin-web.bat` / `start-client-mobile.bat` 快速启动对应服务（脚本未纳入版本库，仅本地存在）。

访问入口与演示账号：

| 入口 | 地址 | 账号 |
|---|---|---|
| 管理后台 | http://localhost:7758 | `admin / admin123`（真实 JWT 登录，需输入图形验证码；种子另含 operator / auditor 等 RBAC 账号） |
| 移动端 | http://localhost:7759 | 种子成员如 `13801210001 / user123` |
| 后端健康检查 | http://localhost:7757/api/health | — |

## 📁 仓库结构

```
apps/
  admin/            # 管理后台 Web（全量接入真实接口）
    src/
      api/          # API 层 —— 当前 37 个文件，全部 HTTP 化
      components/   # 共享组件（PageHeader/StatusTag/IdentityTags/RichEditor/TrendChart/ColumnController/BulkArchiveDialog/ExportButton/ListEmptyState/...）
      constants/    # 状态映射 / 身份词汇表 / 权限目录（冻结）
      directives/   # v-permission 按钮级权限指令
      layouts/      # AdminLayout（唯一 App Shell）
      router/       # 路由表（冻结，含 RBAC 路由守卫；规范首页 = 工作台 /dashboard）
      stores/       # Pinia（auth/tabs/theme）
      types/        # 实体类型定义
      views/        # 63 个页面文件（按领域分目录，system/ 含归档管理 ArchivePanel 等治理页）
  api/              # 后端服务（NestJS 11 + Prisma 6 + PostgreSQL 17 + Redis 7.4）
    prisma/         # schema.prisma（当前 68 个模型）+ migrations/（74）+ seed.ts + seed-data/（种子数据单一来源）
    src/
      common/       # 底座：Prisma/Redis（缓存+黑名单，降级回源）/响应包络/异常过滤/JWT+权限 Guard/装饰器/RBAC/审计（含快照/上下文中间件）/前缀 ID 发号器/积分引擎/存储（本地磁盘）/HTML 清洗与工具
      modules/      # 按域模块：auth/users/enterprises/applications/demands/projects/events/mall/rules/workstations/spaces/contents/assets + system 子域（admins/login-logs/monitor/roles/trash/export）
      scheduler/    # 定时任务（需求/资讯定时发布、活动自动结束、租约临期、归档自动归档/自动删除）
    test/           # e2e / unit（隔离数据库执行；journey-flows 为三端联调）
  client-mobile/    # M2 纯移动端应用（M2-R 必做范围已完成）
    src/
      api/          # HTTP 封装与域 API（统一请求 /api/app/**，21 个域 API 文件）
      views/mobile/ # 当前 65 个视图文件
      composables/  # 复用的页面逻辑（列表分页、路由同步、下拉刷新去顶判断等）
docs/
  wiki-admin-web.md     # 管理后台开发 Wiki（设计契约/组件规范/状态机/API 约定）
  wiki-backend.md       # 后端开发 Wiki（数据模型/端点契约/业务规则）
  wiki-client-mobile.md # 移动客户端开发 Wiki
  api-app-design.md     # 客户端 /api/app/** 端点设计
  entity-fields.md      # 模型分域字段摘要（schema.prisma 为事实来源）
```

## 🛠️ 开发命令

日常开发：

```bash
pnpm install              # 安装依赖
pnpm dev:admin            # 启动管理后台开发服务器（7758，代理 /api → 7757）
pnpm dev:client-mobile    # 启动移动端开发服务器（7759，代理 /api → 7757）
pnpm dev:api              # 启动后端服务（NestJS，7757）
pnpm dev:it               # 以隔离数据库/Redis 启动三端联调环境
```

数据库：

```bash
pnpm db:up                # 启动 PostgreSQL + Redis（Docker Compose，等待健康检查）
pnpm db:migrate           # 应用迁移（prisma migrate deploy）
pnpm db:seed              # 写入种子数据
pnpm db:reset             # 重建数据库（drop + migrate + 全量种子）
```

构建与验证：

```bash
pnpm build:api            # 构建后端
pnpm build:admin          # 构建管理后台
pnpm build:client-mobile  # 构建移动端
pnpm typecheck            # 全仓工作区类型检查（api + admin）
pnpm lint                 # 全仓 ESLint 检查
pnpm --filter @joinyuu/client-mobile test   # 移动端组件/回归测试（71 个用例）
pnpm --filter @joinyuu/admin test:ui        # 管理后台 UI 契约测试（10 个用例）
pnpm --filter @joinyuu/api test:unit        # 后端单元测试
pnpm test:e2e:it          # 仅允许隔离数据库与非 0 Redis DB 的全量 e2e
```

## 📚 文档索引（AI agent 必读）

移动端客户主题包开发、上传、预览、启用和回退见 [移动端主题开发规范](./docs/wiki-mobile-theme.md)。示例位于 `examples/mobile-theme`，打包工具为 `scripts/pack-mobile-theme.ps1`。升级部署前运行 `pnpm db:migrate`。

| 文档 | 用途 |
|---|---|
| [docs/wiki-admin-web.md](./docs/wiki-admin-web.md) | 管理后台开发 Wiki：设计 tokens、布局骨架、组件规范、状态机、API 约定——**改 admin 代码前必读** |
| [docs/wiki-backend.md](./docs/wiki-backend.md) | 后端开发 Wiki：数据模型、端点契约和业务规则——**改后端代码前必读** |
| [docs/wiki-client-mobile.md](./docs/wiki-client-mobile.md) | 移动客户端开发 Wiki——**改移动客户端代码前必读** |
| [docs/api-app-design.md](./docs/api-app-design.md) | 客户端 `/api/app/**` 正式契约 |
| [docs/entity-fields.md](./docs/entity-fields.md) | 模型分域字段摘要（`schema.prisma` 为事实来源） |

## 🔧 关键工程约定（摘要，详见各 Wiki）

1. **契约冻结**：菜单/路由/状态映射/身份词汇表已冻结，不得私自重写导航、发明颜色字号或自造状态文案。
2. **共享组件强制**：状态标签用 `StatusTag`（移动端 `StateTag`）、身份标签用 `IdentityTags`（移动端 `IdentityTag`），禁止页面自造。
3. **术语统一**：管理端 联系电话 / 办公位 / 社区企业 / 合作企业 / 经验值 / 审核 / 新增 / 归档；**移动端「需求」指立项前的需求（发布/响应/收藏），「项目」仅指立项后的协作项目**；禁止回退旧词（联系方式、工位、审批、新建、回收站等）。
4. **种子数据单一来源**：后端 `apps/api/prisma/seed-data/`（admin `src/mock/` 已删除）；种子写入 23 个 IdSequence 前缀（U/E/AP/D/P/EV/XE/EX/PT/G/RO/WS/WA/LS/S/SR/A/SU/CL/SC/AN/N/AL）与项目编号 `CODE-<year>`，其中投稿文章编号用 SU。
5. **接口契约以 wiki-backend 与 api-app-design.md 为准**：admin `src/api/` 走真实 HTTP（`/api/admin/**`）；写操作由后端 `@RequirePermission` 与 `AuditService` 管控；客户端 `/api/app/**` 接入已完成，三端均无本地 mock 数据源。
6. **项目需求方口径**：需求立项生成的项目，需求方/创建人/联系方式/合同价格一律照搬需求快照（客户端传值不生效）；项目访问按需求方主体放行，企业主体解析到企业联系人。
7. **表单校验时机**：弹窗规则 `trigger: 'submit'`，打开时 `clearValidate()`，避免 DatePicker 交互提前红框。
8. **表格规范**：开启 `resizable` 的表格必须 `table-layout="fixed"` + `hover`；服务端排序用受控 `:sort` + `@sort-change`。
9. **ID 展示规范**：实体 ID 用 `.id-tag`（同行内联）/ `.id-tag-block`（名称下方独立成行）标签；下拉与标签内名称统一为 `名称 [ID]`，同一视图内不重复展示同一 ID。
10. **归档体系**：13 个业务域软删除（`deletedAt`/`deletedBy`）后进入归档管理（恢复/彻底删除 + 按域归档设置），自动归档/自动删除由调度器按设置执行；用户历史域（申请/需求/项目/活动/租赁/投稿/预约/订单）彻底删除与开启自动删除需三连确认。
11. **列表交互收敛**：全站列表无表格批量操作、无刷新按钮；列设置（ColumnController）覆盖 20 个列表页；顶栏「全部关闭」等同于「关闭其他」（保留工作台与当前页）。
12. **文档沉淀**：以当前 `docs/` 中的 Wiki、API 契约和实体字段文档为准；代码与文档冲突时先确认契约，再同步回写文档，避免复制可从代码生成的逐路由清单。
13. **同文件编辑冲突**：批量编辑时避免对同一文件的并行写入（历史上多次造成改动丢失），重要改动后需读盘校验并 `pnpm build:admin` 验证。

## 🔄 核心业务状态机（已冻结）

- **需求**：待审核 →（只读审核通过）→ 待发布 →（立即/定时发布）→ 已发布/定时发布中 →（到点自动）→ 已发布；分支：已驳回/已关闭/立项→已立项
- **项目**：进行中 ⇄ 已暂停 → 已关闭 / 结项（全部里程碑验收通过自动结项）→ 归档；结项按承接占比发放项目经验值
- **活动**：待发布 →（立即/定时发布）→ 已发布（报名中/暂停报名）→ 已结束/已取消
- **身份模型**：一人多身份——个人用户（默认，积分挂靠）/社区个体（至多一个，有等级）/社区企业（可多个，有等级）/合作企业（可多个）
- **归档**：各域终态/指定状态条目可软删除进入归档管理，支持恢复与彻底删除；自动归档/自动删除按域设置由调度器执行

## 📊 当前进度

已完成的核心范围包括：

- 后端基础设施、Prisma 数据模型与迁移、JWT/验证码/RBAC/审计、Redis 会话与黑名单、文件存储、富文本清洗、积分/经验、定时任务和归档治理。
- 管理后台真实接口化、系统监控、日志审计、内容/公告/轮播图、申请表单配置、发布限制、成员注销治理、个人/企业名片管理等运营能力。
- 移动端注册登录、多身份、首页、需求、项目协作、活动报名/签到/电子票、社区/人才/企业、文章与评论、商城、空间预约、通知、积分/经验、申请、名片和账户安全等闭环。
- 项目协作：项目含需求方/需求方身份/创建人/联系人/联系电话/联系邮箱/合同价格；需求立项由服务端照搬需求快照，社区自建由「新增项目」表单录入；需求方（含企业联系人）与承接方均可访问项目。
- 名片与引导：个人名片「公开名片」开关（关闭后退出社区人才库、公开名片页 404）；首页新手任务默认折叠并紧随「发布需求」入口，「永久隐藏」按账号服务端持久化。
- 术语与体验：移动端以「需求」指代立项前的需求（列表/搜索/收藏/文案），「项目」仅指立项后的协作项目；首页入口按已关联身份个性化；「我的需求」分为「进行中/历史记录」；下拉刷新、选项卡圆角、悬浮按钮位置等交互约束见移动端 Wiki。


### 验证结果

| 验证项 | 结果 |
|---|---|
| `pnpm typecheck`（api + admin） | 通过 |
| `pnpm build:api` | 通过 |
| `pnpm build:admin` | 通过 |
| `pnpm build:client-mobile` | 通过 |
| `pnpm --filter @joinyuu/client-mobile test` | 通过，71 个测试 |
| `pnpm --filter @joinyuu/admin test:ui` | 通过，10 个测试 |
| `pnpm lint`（全仓） | 通过 |
| 隔离数据库全量 e2e | 需先准备 `apps/api/.env.it`（示例见 `apps/api/env.it.example`）、Docker PostgreSQL/Redis，并使用 `_it`/`_test` 结尾的隔离库 |

## 🤝 贡献

- 主分支 `main`，远程 `https://github.com/GaoshuoZhang/Joinyuu-Community.git`。
- 提交信息格式：`<type>(<scope>): <描述>`（如 `feat(api,admin,client-mobile): 项目需求方快照、权限修复与三端交互治理`）。
- 提交前至少执行与改动范围对应的检查：`pnpm typecheck`、`pnpm lint`、对应工作区测试/构建；后端涉及迁移时先 `pnpm --filter @joinyuu/api exec prisma generate` 与 `pnpm db:migrate`。
- 改任一端的代码前，先读对应的 `docs/wiki-*.md`（见上方文档索引）；界面相关改动建议遵循仓库内的 better-interface 审查结论。
- 欢迎 Issue 与 PR：需求与缺陷请附复现步骤、期望行为与实际行为。

## 📝 License

本项目暂未声明开源 License（仓库当前为私有项目）。如需开源，请先补充 `LICENSE` 文件并同步本节。
