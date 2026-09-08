# 聚屿社区 Joinyuu Community

创业社区数字化运营平台：管理后台（运营方）+ 客户端 Web（居民/企业成员）+ 微信小程序（居民轻入口）。

> 本 README 面向人类协作者与 AI agent，传达项目信息与协作约定。开始任何开发工作前，请先读完本文档与 `docs/` 下的索引文档。

## 当前状态（2026-09-08）

**M0 后台原型已完成** — M0-A（基础骨架）/ M0-B（社区成员域）/ M0-C（业务运营域）/ M0-D（运营设施域，含空间预约与展示页发布审批迁移；后续两次菜单拆分：原"积分商城"拆为"积分管理"一级菜单——商品管理、订单管理、积分规则、积分账单；原"办公位管理/公共空间"拆为"空间管理"一级菜单——办公位管理、办公室管理、租赁管理、公共空间管理、公共空间预约）全部完成并通过构建验证。下一阶段为 M1 后端服务（NestJS + PostgreSQL + Redis），依据 `apps/admin/src/types/index.ts` 实体模型与 `apps/admin/src/api/` stub 接口形状实现。详细进度见 [docs/full-spec-check.md](./docs/full-spec-check.md)。

开发策略：**以管理后台 Web 作为初始驱动**——先在后台原型中冻结实体模型、状态流与 API 接口形状，再据此实现后端与客户端。

## 技术栈

| 层 | 选型 |
|---|---|
| 仓库 | pnpm Monorepo（`apps/` + `packages/`） |
| 后端（M1 规划） | Node.js + NestJS + RESTful API |
| 数据库（M1 规划） | PostgreSQL + Redis |
| 管理后台 Web（当前） | Vue 3 + Vite + TypeScript + TDesign Vue Next + Pinia + Vue Router |
| 客户端 Web（M2 规划） | 同上（TDesign Vue Next） |
| 微信小程序（M3 规划） | TDesign WeChat MiniProgram |

## 仓库结构

```
apps/
  admin/            # 管理后台 Web（M0 原型，当前开发重点）
    src/
      api/          # API Stub —— 未来真实接口的形状（含 TODO 注释）
      components/   # 共享组件（PageHeader/StatusTag/IdentityTags/...）
      constants/    # 状态映射与身份词汇表（冻结）
      layouts/      # AdminLayout（唯一 App Shell）
      mock/         # Mock 数据单一出口（跨页一致）
      router/       # 路由表（冻结）
      stores/       # Pinia（auth/tabs）
      types/        # 实体类型定义（M1 建表依据）
      views/        # 页面（按领域分目录）
packages/           # 预留（后端/共享包）
docs/
  full-spec-check.md    # 整体项目开发规划与进度核对表（进度唯一事实来源）
  wiki-admin-web.md     # 管理后台开发 Wiki（设计契约/组件规范/状态机/API 约定）
```

## 开发命令

```bash
pnpm install              # 安装依赖
pnpm dev:admin            # 启动管理后台开发服务器
pnpm build:admin          # 构建管理后台（当前通过 6096 模块编译验证）
```

演示账号：`admin / admin123`（Mock 登录）。

## 文档索引（AI agent 必读）

| 文档 | 用途 |
|---|---|
| [docs/full-spec-check.md](./docs/full-spec-check.md) | 整体里程碑规划与模块进度勾选——**接手任务前先看这里**，完成后同步勾选 |
| [docs/wiki-admin-web.md](./docs/wiki-admin-web.md) | 管理后台开发 Wiki：设计 tokens、布局骨架、组件规范、状态机、Mock 与 API Stub 约定——**改 admin 代码前必读** |

## 关键工程约定（摘要，详见 wiki-admin-web.md）

1. **契约冻结**：菜单/路由/状态映射/身份词汇表已冻结，不得私自重写导航、发明颜色字号或自造状态文案。
2. **共享组件强制**：状态标签用 `StatusTag`、身份标签用 `IdentityTags`，禁止页面自造。
3. **Mock 单一数据源**：所有页面从 `src/mock/` 取数；ID 命名前缀：用户 U1001+ / 企业 E2001+ / 审批 AP3001+ / 需求 D4001+ / 项目 P5001+ / 活动 EV6001+ / 外部企业 XE7001+。
4. **API Stub 即接口契约**：`src/api/` 中每个函数的 `TODO: 替换为 GET/POST /api/admin/xxx` 注释即 M1 后端的接口形状，管理端前缀 `/api/admin/**`，客户端未来为 `/api/app/**`。
5. **表单校验时机**：弹窗规则 `trigger: 'submit'`，打开时 `clearValidate()`，避免 DatePicker 交互提前红框。
6. **表格规范**：`table-layout="auto"` + `hover` + `resizable`；服务端排序用受控 `:sort` + `@sort-change`。
7. **文档沉淀**：每完成一个模块，同步更新 full-spec-check.md 勾选状态；后端模块完成后在 `docs/` 沉淀实体字段列表（page as documentation）。
8. **同文件编辑冲突**：批量编辑时避免对同一文件的并行写入（历史上多次造成改动丢失），重要改动后需读盘校验并 `pnpm build:admin` 验证。

## 核心业务状态机（已冻结）

- **需求**：待审核 →（只读审核通过）→ 待发布 →（立即/定时发布）→ 已发布/定时发布中 →（到点自动）→ 已发布；分支：草稿/已驳回/已关闭/立项→已立项
- **活动**：待发布 →（立即/定时发布）→ 已发布（报名中/暂停报名）→ 已结束/已取消
- **身份模型**：一人多身份——个人用户（默认，积分挂靠）/社区个人（至多一个，有等级）/社区企业（可多个，有等级）/外部企业（可多个）

## Git 协作

- 主分支 `main`，远程 `https://github.com/GaoshuoZhang/Joinyuu-Community.git`
- 提交信息格式：`<type>: <描述>`（如 `feat: 新增需求定时发布`）
