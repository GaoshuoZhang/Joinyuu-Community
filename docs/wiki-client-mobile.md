# 聚屿社区 · 移动端开发 Wiki

> `apps/client-mobile` 是纯移动端应用，dev 端口 7759（`/api` 代理到 7757）；桌面端 `apps/client-web` 尚未创建。
> 关联文档：[README](../README.md)、[后端契约](./wiki-backend.md)、[App API 契约](./api-app-design.md)、[实体字段](./entity-fields.md)。

## 1. 服务边界

- workspace 包名为 `@joinyuu/client-mobile`，禁止导入 admin 或 api 源码。
- 技术栈：Vue 3、Vite 6、Pinia 3、Vue Router 4 history 模式、TypeScript、TDesign Mobile Vue。
- `src/types/` 独立声明客户端类型，字段与 API 契约保持一致。
- 根命令：`pnpm dev:client-mobile`、`pnpm build:client-mobile`。

## 2. API 接入

- `src/api/*.ts` 是视图唯一数据入口；页面不得直接访问 `fetch` 或本地业务数据。
- 统一请求 `/api/app/**`：开发经 vite proxy 转发到 7757，生产由网关同源转发。
- 统一返回形状：成功 `{ code: 0, data }`、错误 `{ code, message }`、分页 `{ list, total }`。
- 客户端无本地 mock 数据源；开发/联调/演示一律使用真实后端与种子数据（`pnpm db:reset` 后启动 `pnpm dev:api`）。
- 时间以设备当前时间为准，页面通过 `useBusinessNow()` 统一获取并在可见/定时刷新，不得使用固定演示时间。
- 401 由公共请求层清除会话并跳转登录；下载与上传分别走统一鉴权下载和 multipart 封装。

## 3. 应用架构

- 路由集中在 `src/router/index.ts`，全部页面位于 `src/views/mobile/`。
- `AppShell.vue` 提供首页、需求、社区、广场、我的 5 个底部 Tab（「需求」路由为 `/projects`，对应需求列表/详情/发布）。
- 登录、注册、找回密码等访客页位于壳外。
- 业务逻辑收口到 `src/composables/` 和 `src/api/`；视图只负责展示与交互。
- `components/shared/*` 保持组件库无关；全局挂载的 DevTools 也不得引入 TDesign 桶依赖。

## 4. 鉴权与身份

- HTTP 会话由 `/api/app/auth/**` 签发 App JWT，`scope=app`，与 Admin JWT 隔离。
- `guestOnly` 阻止已登录用户进入访客页；`requiresAuth` 将游客重定向至 `/login?redirect=`。
- 一名成员可拥有个人用户、社区个体、多个社区企业和合作企业身份；写操作由服务端复核主体权限。
- 功能开关通过 `GET /api/app/config` 下发；入口隐藏与服务端写端点校验同时生效。
- 首页功能入口按已关联身份个性化：有企业身份（社区企业/合作企业）→「企业管理」（跳 `/me/identities?filter=enterprise`）；有社区个体身份 →「个人名片」（跳 `/me/cards/individual`），否则为「人才登记」。

## 5. UI 与组件约定

- 使用 TDesign Mobile Vue；禁止引入其他 UI 库或桌面端组件库。
- 状态统一使用 `StateTag`，身份统一使用 `IdentityTag`；禁止页面自行定义状态文案和颜色。
- 色彩、圆角、阴影和边框使用 `--td-*`；共享布局类维护在 `styles/tokens.css`。
- 卡片使用 `.m-card`，页面根节点使用 `.page-fade-in`，列表容器使用 `.stagger`。
- 状态 Chip 使用 `Tag`，可选/可点击 Chip 使用 `CheckTag`；图标按钮使用 `Button` 的文本方形形态；主操作使用 primary。
- 按钮、列表项等主交互目标至少 44px；Tag / CheckTag 仅使用 TDesign 提供的 `small`、`medium`、`large` 尺寸。表单必须有可见标签、行内错误与离开保护。
- 弹层必须管理焦点、Tab 圈闭与关闭回焦；Toast、错误和加载态提供可访问性播报。
- 调整纯视觉时不得顺带修改 API、路由、props/emits 或状态机。

### 术语口径

- **「需求」**：用户发布/响应/立项前的内容（列表、搜索、收藏、表单、我的需求）。
- **「项目」**：仅指需求立项后生成的协作项目（`/me/projects`、里程碑、结项）。
- 用户可见文案、空态、筛选标签与内部注释一律不得用「项目」指代「需求」。

### 交互约束

- **下拉刷新**：`PullDownRefresh` 内部按触摸目标的 `overflow` 祖先判断是否到顶，横向滚动容器与截断文本会被误判；页面使用 `useAtTop()` 在离顶时 `:disabled` 下拉刷新，避免上滑被拦截回弹。**指示器统一 `:loading-props="REFRESH_LOADING_PROPS"`**（`constants/refresh.ts`，`{ theme: 'spinner' }`）：TDesign Loading 默认 `circular` 用 `conic-gradient` + CSS mask 画 0.5px 发丝圈，不支持 mask 的 WebView 会退化成一块蓝色楔形，`spinner`（12 根旋转短线，无 mask）各端一致。
- **选项卡底部圆角**：`.top-tabs` 根元素须保持透明（双类名提升特异性，压过库内白底），白底与圆角由 `.t-tabs__wrapper` 承担并按需裁切，避免直角分隔线盖住底部圆角。
- **悬浮按钮**：`--app-fab-offset` 以 TabBar 真实占位（`--app-tabbar-occupied-h`，56 + 16px margin）计算，禁止直接用 `--app-mobile-tabbar-h` 造成贴底。
- **ActionSheet 关闭**：当前 TDesign 版本只发 `update:modelValue`（`cancel`/`close`/`update:visible` 均不触发），弹窗必须用 `v-model` 绑定，取消与点遮罩才能关闭。
- **表单可访问性**：`main.ts` 统一修补 TDesign 表单（补 input id/name、label for、单选/复选 aria-label）；label 无法关联控件时（空 `for=""`、分组标题、空占位）不得保留为 `<label>`：空占位移除、分组标题转 `<span>` 保留类名与样式。向上关联仅限“单控件且单 label”的最近容器，防止跨字段误挂。

### 排版规范（Token First）

- **唯一入口**：组件内字号/字重/行高/字体栈必须整体引用 L2 角色档 —— `font: var(--app-type-*)`（`page-title` / `section` / `card-title` / `body` / `body-relaxed` / `body-sm` / `emphasis` / `emphasis-sm` / `caption` / `numeric-lg` / `numeric` / `display`）；禁止单独声明 `font-size` / `font-weight` / `line-height` / `font-family`，禁止任何字面量。复合简写没有单独挑字号/字重的位置，杜绝「看起来差不多就选一个」。`display` 专供头像首字/企业字标/徽标这类单个字的装饰性大字，不得与 `page-title`/`section` 混用（否则改标题档会连带改变头像字号）。
- **三层结构**（`styles/tokens.css`）：L1 原始档（`--app-fs-*` / `--app-fw-*` / `--app-leading-*`，字面量唯一允许出现处，组件不得直接引用）→ L2 角色档（复合 `font:` 简写，一次锁定字号+行高+字重+字体栈）→ L3 TDesign 映射（库内 `--td-font-size-*` 原始档与 `--td-font-family` / `--td-form-label-font-size` 指向 L1；必须 `:root:root` 提特异性，库样式在路由组件里懒加载、晚于 tokens.css 注入）。headline/display 档未映射（仅 typography 文档组件使用，未接入本 App）。
- **12px 档**：`--app-type-caption` 用于标签/角标/元信息（时间、计数、提示、表单 field-help）。TDesign 小标签、TabBar 标签、角标计数已由 L3 从 10px 抬到 12px（行高沿用库值，盒子高度不变）。
- **强制校验**：`scripts/check-typography.mjs`（挂在 `npm run lint`）。2026-09-25 完成全量迁移（87 个文件 / 610 处声明，基线清空，`typography-allowlist.txt` 已删除）；此后任何非角色档声明都会直接拦截。确需破例在声明行（或紧邻上一行）写 `/* typography-token-exempt: 原因 */`，原因里写明升级复核点。
- **例外**：`font-variant-numeric: tabular-nums`（数值等宽，须写在 `font:` 之后）与 TDesign 通过 props（`size` / `theme`）表达的尺寸，不算重写。
- **迁移期的两处有意外观变化（已确认）**：18px 卡片条目标题统一收到 16px；14px 元信息统一收到 12px。22px 的头像首字/字标归入 `display` 档（18px）。

## 6. 主要页面

- 首页：搜索入口、轮播、身份个性化功能入口、发布需求、折叠的新手任务（可永久隐藏）、公告、近期活动、最新需求/资讯（轮播为搜索栏下方首个运营位）。
- 需求（`/projects`）：类型选项卡 + 搜索 + 发布入口（悬浮 FAB）、需求详情、响应与发布者选定承接方。响应需审核（`demand.respondNeedReview=true`）时，成员提交后先落 `pending_review`（待审核：发布者暂不可见、不计入「N 人响应」、不发积分、不通知发布者），管理员审核通过后才对发布者可见并由其选定承接方；驳回则记录失效、响应者可重新响应。审核结果在「我的响应」查看，响应积分审核通过后才到账；需求关闭该开关时提交即「待选定」（等待发布者选定承接方）。详情页「响应需求」默认仅展示一行提示与「响应需求」按钮，点击后在卡片内展开表单（标题右侧出现「收起」文字按钮，收起即重置为按钮态）；响应表单在「响应说明 + 响应身份」基础上新增报价/预算、可投入时间/预计工期、相关经验与案例、联系手机（均选填，手机留空时服务端沿用账号手机号），发布者在响应列表可查看这些次要信息。
- 社区：政策、人才库、企业库、公开名片。
- 广场：活动与文章。
- 我的：分组布局（资料卡 + 积分/等级资产卡固定在前，其后按用途分区）——① 身份与名片（关联身份、我的名片〔个人名片含「公开名片」开关〕；无社区个体身份时显示「人才登记」）；② 项目与需求（我的项目、我的需求〔进行中/历史记录选项卡〕、我的响应〔待选定/待审核 `pending_review`/已选定/已驳回等状态标签：待选定与待审核可撤回，已驳回展示驳回原因且可重新响应〕）；③ 资产与租约（我的订单、工位租约〔租约无开关，常显〕）；④ 申请与预约（申请记录、活动报名、空间预约〔随 `reservationOpen` 隐藏〕）；⑤ 内容与足迹（提交留言 `/me/messages`：提交留言 + 查看社区回复、投稿记录、收藏内容、浏览历史）；⑥ 设置（独立一栏，含通知设置与账号安全）。资料页用户名 90 天限改一次（冷却期展示可修改日期并禁用输入）；站内信由「我的」页头铃铛承载（含未读角标）不再占用宫格；原「我的记录」收纳页入口已移除（内容由上述分区覆盖，页面保留兼容深链）；积分页在「积分规则」旁提供「我的订单」入口。
- 二级闭环：项目里程碑交付验收、活动签到（含电子票）/反馈、商城履约、动态申请表单、企业成员与邀请、企业合作（整卡选择）。

当前静态规模为 66 个视图文件、22 个域 API 文件；精确路由以 `src/router/index.ts` 为准。

## 7. 验证

移动端改动至少执行：

```bash
pnpm --filter @joinyuu/client-mobile run lint
pnpm --filter @joinyuu/client-mobile run typecheck
pnpm --filter @joinyuu/client-mobile test
pnpm build:client-mobile
```

运行时问题再使用浏览器检查（本地 dev 7759 + 后端 7757）；HTTP 业务状态机以 API e2e 为主。涉及首页/下拉刷新/选项卡等交互改动时，建议在移动视口下实测滚动与触摸行为再提交。
