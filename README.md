# 聚屿社区 Joinyuu Community

创业社区数字化运营平台：管理后台（运营方）+ 客户端 Web（社区个体/社区企业）+ 微信小程序（社区个体/社区企业/个人用户）。

> 本 README 面向人类协作者与 AI agent，传达项目信息与协作约定。开始任何开发工作前，请先读完本文档与 `docs/` 下的索引文档。

## 当前状态（2026-09-10）

**M1 后端服务已完成** — M0 后台原型（M0-A~E）与 M1（M1-A~E）全部落地：`apps/api`（NestJS 11 + Prisma 6 + PostgreSQL 17 + Redis 7.4）实现 129 个端点（认证 2 / 管理端 127，含系统管理域 12），含 JWT 认证、状态机服务端校验、定时任务、积分/经验发放引擎、审计 before/after 快照、Redis 缓存（降级回源）与全量种子迁移（`prisma/seed-data/`）；admin web 22/22 个 API 文件已接入真实接口，`src/mock/` 已删除（e2e 16 套件 78 用例全绿）。下一步 M2 客户端 Web：端点设计见 [docs/api-app-design.md](./docs/api-app-design.md)，整体进度见 [docs/full-spec-check.md](./docs/full-spec-check.md)。

开发策略：**以管理后台 Web 作为初始驱动**——先在后台原型中冻结实体模型、状态流与 API 接口形状，再据此实现后端与客户端（当前已进入后端实施与前端接入阶段）。

## 技术栈

| 层 | 选型 |
|---|---|
| 仓库 | pnpm Monorepo（`apps/` + `packages/`） |
| 后端（M1 实施中） | NestJS 11 + Prisma 6 + RESTful API（`apps/api`，端口 7757） |
| 数据库（M1 实施中） | PostgreSQL 17 + Redis 7.4（Docker Compose 本地开发） |
| 管理后台 Web（当前） | Vue 3 + Vite + TypeScript + TDesign Vue Next + Pinia + Vue Router |
| 客户端 Web（M2 规划） | 同上（TDesign Vue Next） |
| 微信小程序（M3 规划） | TDesign WeChat MiniProgram |

## 仓库结构

```
apps/
  admin/            # 管理后台 Web（M1 全量接入真实接口；mock 已删除）
    src/
      api/          # API 层 —— http.ts 封装 + 22 个域文件全部 HTTP 化
      components/   # 共享组件（PageHeader/StatusTag/IdentityTags/...）
      constants/    # 状态映射与身份词汇表（冻结）
      layouts/      # AdminLayout（唯一 App Shell）
      router/       # 路由表（冻结）
      stores/       # Pinia（auth/tabs）
      types/        # 实体类型定义（M1 建表依据）
      views/        # 页面（按领域分目录）
  api/              # 后端服务（NestJS 11 + Prisma 6 + PostgreSQL 17 + Redis 7.4）
    prisma/         # schema.prisma（35 模型）+ migrations + seed.ts + seed-data/（种子数据单一来源）
    src/
      common/       # 底座：Prisma/Redis（缓存+黑名单，降级回源）/响应包络/异常过滤/JWT Guard/审计（含快照）/前缀 ID 发号器/积分引擎
      modules/      # 按域模块：auth/users/enterprises/applications/demands/projects/events/mall/rules/workstations/spaces/contents/system
      scheduler/    # 定时任务（定时发布/活动结束/租约临期）
    test/           # e2e 套件（16 套件 78 用例，每套件重种子隔离）
    docker-compose.dev.yml
packages/           # 预留（共享包）
docs/
  full-spec-check.md    # 整体项目开发规划与进度核对表（进度唯一事实来源）
  wiki-admin-web.md     # 管理后台开发 Wiki（设计契约/组件规范/状态机/API 约定）
  wiki-backend.md       # 后端开发 Wiki（数据模型/端点契约/业务规则/里程碑）
  api-app-design.md     # M2 客户端 /api/app/** 端点设计（M1-E 产出）
  entity-fields.md      # 35 模型分域字段清单（M1-E 沉淀）
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

演示账号：`admin / admin123`（真实 JWT 登录；需先 `pnpm db:up` + `pnpm db:reset` + `pnpm dev:api`）。

## 文档索引（AI agent 必读）

| 文档 | 用途 |
|---|---|
| [docs/full-spec-check.md](./docs/full-spec-check.md) | 整体里程碑规划与模块进度勾选——**接手任务前先看这里**，完成后同步勾选 |
| [docs/wiki-admin-web.md](./docs/wiki-admin-web.md) | 管理后台开发 Wiki：设计 tokens、布局骨架、组件规范、状态机、API 约定——**改 admin 代码前必读** |
| [docs/wiki-backend.md](./docs/wiki-backend.md) | 后端开发 Wiki：数据模型（35 模型）、端点契约清单、业务规则、里程碑——**改后端代码前必读** |

## 关键工程约定（摘要，详见 wiki-admin-web.md / wiki-backend.md）

1. **契约冻结**：菜单/路由/状态映射/身份词汇表已冻结，不得私自重写导航、发明颜色字号或自造状态文案。
2. **共享组件强制**：状态标签用 `StatusTag`、身份标签用 `IdentityTags`，禁止页面自造。
3. **Mock 单一数据源**：所有页面从 `src/mock/` 取数（HTTP 化域除外）；ID 命名前缀：用户 U1001+ / 企业 E2001+ / 审批 AP3001+ / 需求 D4001+ / 项目 P5001+ / 活动 EV6001+ / 外部企业 XE7001+。
4. **API 契约以 M0 stub 为准**：`src/api/` 的 TODO 注释即接口形状（管理端 `/api/admin/**`，客户端未来为 `/api/app/**`）；M1-B~D 已把 16 个域文件切换为真实 HTTP（函数签名不变），剩余系统域 6 文件在 M1-E 切换。
5. **表单校验时机**：弹窗规则 `trigger: 'submit'`，打开时 `clearValidate()`，避免 DatePicker 交互提前红框。
6. **表格规范**：`table-layout="auto"` + `hover` + `resizable`；服务端排序用受控 `:sort` + `@sort-change`。
7. **文档沉淀**：每完成一个模块，同步更新 full-spec-check.md 勾选状态；后端模块完成后在 `docs/` 沉淀实体字段列表（page as documentation）。
8. **同文件编辑冲突**：批量编辑时避免对同一文件的并行写入（历史上多次造成改动丢失），重要改动后需读盘校验并 `pnpm build:admin` 验证。

## 核心业务状态机（已冻结）

- **需求**：待审核 →（只读审核通过）→ 待发布 →（立即/定时发布）→ 已发布/定时发布中 →（到点自动）→ 已发布；分支：草稿/已驳回/已关闭/立项→已立项
- **活动**：待发布 →（立即/定时发布）→ 已发布（报名中/暂停报名）→ 已结束/已取消
- **身份模型**：一人多身份——个人用户（默认，积分挂靠）/社区个体（至多一个，有等级）/社区企业（可多个，有等级）/外部企业（可多个）

## Git 协作

- 主分支 `main`，远程 `https://github.com/GaoshuoZhang/Joinyuu-Community.git`
- 提交信息格式：`<type>: <描述>`（如 `feat: 新增需求定时发布`）
