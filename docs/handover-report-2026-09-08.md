# 聚屿社区 Joinyuu-Community — 开发进度与交接汇报

> 生成日期：2026-09-08 ｜ 基于 main 分支（工作区干净，HEAD `26604f7`）
> 用途：接手开发前的全景速览。进度唯一事实来源仍为 `docs/full-spec-check.md`，本文为快照 + 交接分析。
>
> **⚠️ 补记（同日晚些时候）**：本文快照生成后，M0-D 运营设施域已于当日完成开发并通过构建验证——四个二期占位模块（积分商城/办公位管理/公共空间/资讯内容）全部落地，空间预约与展示页发布审批已从申请审批页迁移，ComingSoonView 已删除。文中涉及「M0-D 占位」「二期」的描述均已过时，以 `docs/full-spec-check.md` 为准。M0 全部完成，下一阶段为 M1 后端服务。

---

## 1. 项目概览

**聚屿社区 — 创业社区数字化运营平台**，规划三端一体：

| 端 | 定位 | 状态 |
|---|---|---|
| 管理后台 Web（`apps/admin`） | 运营方使用，冻结实体模型/状态流/API 形状 | **当前开发重点（M0 原型）** |
| 客户端 Web | 居民/企业成员使用 | M2 规划，未开始 |
| 微信小程序 | 居民轻入口 | M3 规划，未开始 |

**开发策略（关键）**：以管理后台作为初始驱动——先在后台原型中冻结实体模型、状态流与 API 接口形状，再据此实现后端（M1）与客户端（M2/M3）。**admin 前端是整个系统的"设计图纸"，不是普通页面**。

核心业务域：
- **社区成员**：用户与多身份体系（个人用户/社区个人/社区企业/外部企业，一人多身份）、入驻与身份绑定审批、经验值与积分账本
- **业务运营**：需求广场（提交→审核→发布→立项全流程）、项目协作（多承接方占比、里程碑）、活动运营（发布/定时发布、报名审核、签到）
- **运营设施**（二期）：积分商城、办公位管理、公共空间预约、资讯内容

## 2. 技术栈与关键依赖

| 层 | 选型 | 版本 |
|---|---|---|
| 仓库 | pnpm Monorepo（`apps/*` + `packages/*`，packages/ 目前为空占位） | — |
| 管理后台 | Vue 3 + Vite + TypeScript + TDesign Vue Next + Pinia + Vue Router | Vue ^3.5.13 / Vite ^6.3.5 / TS ~5.8.0 / TDesign ^1.10.0 / Pinia ^3.0.1 / Router ^4.5.0 |
| 图标 | tdesign-icons-vue-next（唯一图标库，PascalCase 组件式引入，禁 emoji） | ^0.3.6 |
| 后端（M1 规划） | Node.js + NestJS + RESTful | 未开始 |
| 数据库（M1 规划） | PostgreSQL + Redis | 未开始 |

- 路由模式：`createWebHashHistory`（hash 路由，URL 带 `#`，静态托管零配置）
- Vite：`base: './'`（相对路径，dist 产物可直接静态托管或本地打开）；dev 端口 **7758**（strictPort，host 0.0.0.0 允许局域网访问）
- TypeScript：`strict: true`，路径别名 `@/* → src/*`
- 无 engines 约束、无 ESLint/Prettier 配置、无测试框架、无 CI

## 3. 目录结构与代码规模

```
apps/admin/src/            # 全部业务代码（约 11,700 行）
├── api/         12 个模块  # API Stub —— 未来真实接口的契约（54 处 TODO 标注 HTTP 方法+路径）
├── components/  10 个组件  # PageHeader/StatusTag/IdentityTags/StatCard/AdjustValueDialog
│                         # + DemandPublish/Review/ScheduleDialog + EventForm/ScheduleDialog + ProjectFormDialog
├── constants/   2 个文件  # status.ts 状态映射 + identity.ts 身份词汇表（均冻结）
├── layouts/     AdminLayout # 唯一 App Shell（侧栏菜单+顶栏+多标签页，420 行）
├── mock/        9 个模块  # Mock 数据单一出口（DB 对象聚合，跨页一致）
├── router/      index.ts  # 路由表（冻结，22 条路由，登录守卫）
├── stores/      auth/tabs # Pinia（Mock JWT + localStorage 持久化 / 多标签页）
├── styles/      tokens.css
├── types/       index.ts  # 全部实体类型定义（334 行，M1 建表依据）
└── views/       22 个页面 # 按领域分目录：users/individuals/enterprises/external-enterprises/
                          # approvals/demands/projects/events/dashboard/login/coming-soon
```

最大文件（复杂度热点）：DemandListView 569 行、EnterpriseDetailView 553 行、UserDetailView 529 行、EventDetailView 487 行、DemandPublishDialog 438 行。

Mock 数据 ID 前缀约定：用户 U1001+ / 企业 E2001+ / 审批 AP3001+ / 需求 D4001+ / 项目 P5001+ / 活动 EV6001+ / 外部企业 XE7001+ / 经验流水 EX8001+ / 积分流水 PT9001+。

## 4. 里程碑进度总览

| 里程碑 | 内容 | 状态 |
|---|---|---|
| **M0-A** | 基础骨架与工作台 | ✅ 已完成 |
| **M0-B** | 社区成员域 | ✅ 已完成 |
| **M0-C** | 业务运营域 | ✅ 已完成 |
| **M0-D** | 运营设施域（积分商城/办公位/公共空间/资讯） | ⏸ 二期占位（ComingSoon 页 + 路由 meta.planned 规划能力） |
| **M1** | 后端服务（NestJS + PostgreSQL + Redis） | ⬜ 未开始，接口契约已由 admin stub 冻结 |
| **M2** | 客户端 Web（居民端） | ⬜ 未开始 |
| **M3** | 微信小程序 | ⬜ 未开始 |
| 横切 | 实体字段文档沉淀 / CI/CD / 测试策略 | ⬜ 未开始 |

Git 历史：仅 2 次粗粒度提交（`feat: 初始化管理后台` + `docs: 建立文档体系`），无细粒度演进记录；工作区干净，与远程 origin/main 同步。

## 5. 已完成功能模块明细

### M0-A 基础骨架 ✅
- 设计 tokens（全盘 TDesign 默认主题，brand #0052D9）+ 页面入场动效（fill-mode backwards，防弹层裁切）
- AdminLayout App Shell：侧栏菜单（三分组 14 项，二期项带 tag）+ 顶栏面包屑/通知/头像 + 多标签页（tabs store，工作台常驻）；激活态归一化（详情路由→列表路由）
- 登录页（品牌区深海渐变 + Mock 登录 admin/admin123，token 持久化 localStorage）
- 工作台（数据卡片 + 待办审批 + 近期活动 + 快捷入口）
- 共享组件五件套 + Mock 单一数据源 + API Stub 约定

### M0-B 社区成员域 ✅
- 用户管理：列表（关键词/身份/状态筛选、冻结/解冻）+ 详情（资料/身份信息/活跃记录/经验值/积分账本 tabs）
- 社区个人列表、社区企业（列表+详情：企业信息/成员管理/展示页审核/经验值调整）
- 外部企业：聚合视图（由用户 external_enterprise 身份派生 + 档案补充，非独立实体）
- 申请审批：入驻/展示页/空间预约/身份绑定四类，通过/驳回（意见 dialog）+ 审批时间线
- 数据概览联动：详情 → 需求/项目/活动列表按 ID 自动筛选（query 携带 publisher/participant/enterprise，可关闭标签）

### M0-C 业务运营域 ✅
- **需求管理**（状态机已冻结）：待审核→(只读审核)→待发布→(立即/定时发布)→已发布/定时发布中→(到点自动)→已发布；分支草稿/已驳回/已关闭/已立项；后台直接创建、草稿再编辑完成并发布、撤回发布；创建/发布时间双列受控排序
- **项目管理**：多承接方立项（占比默认均分、合计须 100%）、里程碑节点（可多选负责承接方）、需求↔项目双向关联、草稿与直接创建复用同一表单
- **活动管理**（状态机已冻结）：待发布→(立即/定时发布)→已发布（报名中/暂停报名）→已结束/已取消；报名审核、手动签到、结束时间到自动转已结束（模拟层）

### 工程契约（已沉淀进 wiki）
表单校验 trigger=submit + 打开时 clearValidate；t-table 统一 auto/hover/resizable + 受控排序；t-dialog 自定义 footer 必须用 #footer 插槽不设 footer prop；t-timeline 必须 mode="same"；状态/身份标签强制走共享组件。

## 6. 进行中与待办

1. **M0-D 运营设施域**：当前全部为 ComingSoonView 占位（含路由 meta.planned 规划能力列表），二期开发时从零实现
2. **M1 后端**：所有 `src/api/*.ts` 中的 52 处 `TODO: 替换为 GET/POST /api/admin/xxx` 即接口清单；需实现定时任务（需求/活动定时发布、活动自动结束——当前为前端读取时惰性模拟）、状态机服务端校验、Redis 缓存、认证权限
3. **M2 客户端 / M3 小程序**：依赖 M1
4. **横切待办**（full-spec-check §7）：实体字段文档沉淀、CI/CD、测试策略均未启动

## 7. 构建、运行与部署

```bash
pnpm install        # 安装依赖（本机需 Node.js + pnpm）
pnpm dev:admin      # 启动开发服务器 → http://localhost:7758（局域网可访问）
pnpm build:admin    # 生产构建 → apps/admin/dist（base './'，可任意静态托管）
pnpm preview        #（admin 包内）本地预览构建产物
```

- 演示账号：`admin / admin123`（Mock 登录）
- Windows 便捷启动：根目录 `start-admin-web.bat`（自动装依赖+启动；**注意该文件在 .gitignore 中，未入库，仅本机存在**）
- 部署：当前为纯前端静态产物（hash 路由 + 相对 base），任意静态服务器/CDN 可托管；无 Docker/CI 配置
- **构建验证（本次交接实测）**：`pnpm build:admin` ✓ 6096 模块编译通过，15.33s 构建成功

### 测试与质量现状
- **无任何自动化测试**（无单测/组件测试/E2E），质量验证 = 编译构建 + 人工点检
- **无 lint/format 配置**，代码风格靠约定
- `build` 脚本为纯 `vite build`（esbuild 转译），**不执行 vue-tsc 类型检查**——TS 类型错误不会阻断构建

## 8. 接手必读核心文件（按优先级）

| # | 文件 | 作用 |
|---|---|---|
| 1 | `docs/full-spec-check.md` | **进度唯一事实来源**，里程碑/模块勾选表，接手先读 |
| 2 | `docs/wiki-admin-web.md` | **全部工程契约**：设计 tokens/布局骨架/组件规范/状态机/Mock 与 API 约定，改 admin 代码前必读 |
| 3 | `apps/admin/src/types/index.ts` | 全部实体类型（User/Enterprise/Demand/Project/CommunityEvent/账本/外部企业），M1 建表依据 |
| 4 | `apps/admin/src/constants/status.ts` + `identity.ts` | 冻结的状态映射与身份词汇表，所有标签文案/配色的唯一来源 |
| 5 | `apps/admin/src/router/index.ts` | 冻结路由表 + 登录守卫 + 二期占位路由 |
| 6 | `apps/admin/src/api/*.ts` | 12 个 API Stub = M1 后端接口契约（54 个 TODO 注释逐一标注 HTTP 方法/路径/入参） |
| 7 | `apps/admin/src/mock/index.ts`（及同目录 9 个模块） | Mock 单一数据源，跨页一致性靠它 |
| 8 | `apps/admin/src/layouts/AdminLayout.vue` | 唯一 App Shell，菜单/激活态/多标签页机制 |
| 9 | `apps/admin/src/views/demands/DemandListView.vue` | 最复杂业务页（569 行），需求状态机全交互样例 |

## 9. 潜在技术风险与注意事项

| 级别 | 风险 | 说明与建议 |
|---|---|---|
| 🔴 高 | **契约冻结机制** | 路由/菜单/状态映射/身份词汇表/状态机均已冻结，**禁止私自重写导航、自造状态文案或配色**。改动必须同步 wiki + full-spec-check，否则后续模块会与文档脱节 |
| 🔴 高 | **API 层替换是 M1 最大工作量** | 54 个 stub 函数直接操作内存 mock，写操作无持久化（刷新即丢）；替换真实接口时需逐个对照 TODO 注释，且 mock 层的惰性状态模拟（simulateScheduledPublish/simulateEnded）需转为服务端定时任务 |
| 🟡 中 | **主包体积 1.46 MB**（gzip 383 KB） | `main.ts` 全量引入 TDesign（`app.use(TDesign)` + 全量 CSS），构建已警告超 500 kB。建议 M1 前做按需引入或 manualChunks 分包，客户端 Web 引以为鉴 |
| 🟡 中 | **无类型检查门槛** | build 不跑 vue-tsc，strict 模式下的类型错误可静默溜进产物。建议加 `"build": "vue-tsc --noEmit && vite build"` 或至少在 CI 中补 |
| 🟡 中 | **无测试/无 CI/无 lint** | 回归全靠人工；任何重构风险高。接手后建议尽早补最小测试（状态机纯函数、API stub 契约）与 lint |
| 🟡 中 | **同文件并行编辑冲突史** | README 约定 #8 明确记录：历史上多次并行写入同一文件造成改动丢失。批量编辑时避免对同一文件并行写入，重要改动后读盘校验 + 重新构建 |
| 🟢 低 | 大文件页面 | 5 个 450+ 行的视图组件，二期/重构时可拆分；当前不阻塞 |
| 🟢 低 | packages/ 空占位 | pnpm-workspace 已声明但目录不存在，M1 创建 `apps/api` 或 `packages/*` 时注意 pnpm 需重新 install 链接 |
| 🟢 低 | 环境细节 | dev 端口 7758 strictPort（占用即报错）；start-admin-web.bat 未入库；远程仓库 github.com/GaoshuoZhang/Joinyuu-Community |

## 10. 建议的接手动作（第一天）

1. 读 `README.md` → `docs/full-spec-check.md` → `docs/wiki-admin-web.md`（约 30 分钟）
2. `pnpm install && pnpm dev:admin`，用 admin/admin123 登录，按菜单逐页过一遍（重点：需求列表各状态操作、活动定时发布、立项弹窗）
3. 对照 `src/types/index.ts` + `src/api/demands.ts` 理解"stub 即契约"模式
4. 动手前明确任务属于哪个里程碑（M0-D / M1 / M2），M0-D 起新页面需先在 wiki 页面清单补条目再写码
