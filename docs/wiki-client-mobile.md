# 聚屿社区 · 客户端移动端（M2 · `client-mobile`）开发 Wiki

> **应用拆分（已进入实施）**：客户端拆为两个独立应用/入口，**先移动端后桌面端**：
> - `apps/client-mobile`（`@joinyuu/client-mobile`）——本文档对象，**纯移动端**（2026-09-13 已移除全部桌面端代码），dev **7759**；
> - `apps/client-web`（`@joinyuu/client-web`）——桌面端，**尚未创建**，将承接原桌面视图与 `tdesign-vue-next`。
>
> 本文是该应用的实现契约与工程约定，随 M2 批次持续补充；与代码冲突时以代码为准并回写本文。
> 关联文档：[wiki-backend.md](./wiki-backend.md)（后端契约）、[api-app-design.md](./api-app-design.md)（/api/app/** 端点设计，M2 契约基线）、[m2-client-plan.md](./m2-client-plan.md)（规划与完成度看板）、[entity-fields.md](./entity-fields.md)（实体字段）；桌面端契约 `wiki-client-web.md` 待 `client-web` 创建时新建。
> 技术栈：Vue 3.5 + Vite 6 + Pinia 3 + vue-router 4（**history 模式**）+ TypeScript；UI 库 `tdesign-mobile-vue@^1.16`（无桌面库）；dev 端口 **7759**（代理 /api → 7757）。

## 1. 独立服务边界（冻结）

- `apps/client-mobile` 为独立 workspace 包（`@joinyuu/client-mobile`），**禁止 import `@joinyuu/admin`、`@joinyuu/api` 源码**；与管理端零粘连。
- 实体与 API 类型在 `src/types/` 独立声明，字段口径对齐 `docs/api-app-design.md` 与 `entity-fields.md`；`[MOCK-ONLY]` 成员标注缺口编号。
- 根脚本：`pnpm dev:client-mobile` / `pnpm build:client-mobile`。

## 2. Mock-First 架构（冻结）

- `VITE_API_MODE=mock|http`（默认 mock）：`src/api/*.ts` 函数为唯一契约层，mock 模式内部分流到 `src/mock/handlers/*`；http 模式走 `http.ts` 真实请求。**视图层禁止绕过 api 层直接访问 mock**。
- Mock 响应与真实后端同形态：包络 `{ code: 0, data }`、错误 `{ code, message }`、分页 `{ list, total }`、时间 `YYYY-MM-DD HH:mm`；错误文案与 wiki 中文口径一致。
- Mock 数据从 `apps/api/prisma/seed-data/` 派生（同 ID 体系 U/E/AP/D/P/EV/XE/EX/PT/G/RO/R/WS/WA/LS/S/SR/A/SU/CL/SC/AN/N/AL）；可变状态内存演进，刷新重置。
- 超出当前后端边界的功能（站内信 / 位置签到 / 首页聚合等）以 `// [MOCK-ONLY]` 标记，并在 `m2-client-plan.md` §7 缺口表与 §0.3/0.4 看板登记；接入期（M2-R）逐条销号。

## 3. 移动端架构（2026-09-13 起为纯移动端）

- **桌面端已移除**：`views/desktop/**` 与 `src/router/dualView.ts`、`tdesign-vue-next` 依赖已全部删除（桌面端代码将随 `apps/client-web` 重建，见顶部拆分说明）。
- 路由单套（history 模式），`src/router/index.ts` 直连 `views/mobile/*`；`src/views/mobile/` 为全部页面。
- **底部 5 Tab 壳**（`AppShell.vue`）：首页 / 项目 / 社区 / 广场 / 我的；`Tabs` 组件用于页内二级 Tab（社区 3 Tab、广场 2 Tab）。
- 组件库 CSS 只在移动壳 `AppShell.vue` 与壳外访客页（登录/注册）引入一次。
- 历史教训保留：全局挂载组件（`devtools/DevTools.vue`、`components/shared/*`）零组件库依赖；移动端按钮描边覆盖 `.t-button.t-button::after{border-style:none}`。
- 登录/注册为壳外独立页（`meta.guestOnly`）。

## 4. 鉴权与多身份

- Mock 会话：假 JWT（`{ sub, scope:'app', identities, jti, exp }`，TTL 2h）存 `joinyuu_client_token`；真实签发为后端缺口（plan §7.1-4）。
- 守卫：`guestOnly`（已登录回首页）、`requiresAuth`（未登录跳 `/login?redirect=`，M2-M2 起挂 /me/**）；401 统一清态回登录。
- 演示账号矩阵见 `src/mock/db.ts`（单/双/三身份、企业成员、新注册空态、冻结号）；验证码固定 `8888`（[MOCK-ONLY]）。
- 功能开关：`GET /api/app/config` 下发，`config` store 承载；入口隐藏 + 写端点 400 双保险。

## 5. 视图层与 UI 约定（冻结）

### 5.1 分层

- 业务逻辑全部收口 `src/composables/` 与 `src/api/`，**视图层只做展示与交互**；表单校验函数共享 `src/utils/validators.ts`（文案与后端口径一致）。

### 5.2 样式契约（对齐管理后台 `apps/admin/src/styles/tokens.css`）

- **色彩/圆角/阴影/边框一律使用 TDesign 默认令牌 `--td-*`**；禁止自定义色板、禁止写死色值（仅品牌区装饰性半透明叠加如 `rgba(255,255,255,.2)` 例外）。
- `styles/tokens.css` 只补充：布局骨架尺寸、页面通用类、动效、客户端专属（`--client-brand-gradient`、移动安全区）。
- 页面通用类（全局，禁止重复造等价 scoped 样式）：`.page-header / .page-title / .page-desc / .page-header-actions`、`.page-card`、`.page-filter-bar`、`.field-help`、`.page-fade-in`、`.stagger`、`.id-tag / .id-tag-block`、`.m-card`、`.login-page / .login-brand / .login-form-side / .login-form-card`。
- 卡片一律用 `.page-card`（桌面）/ `.m-card`（移动）；页面根元素加 `.page-fade-in`；列表容器用 `.stagger`。
- 常用映射：容器 `--td-bg-color-container`、页面底 `--td-bg-color-page`、边框 `--td-component-border`、主/次/占位文字 `--td-text-color-primary|secondary|placeholder`、品牌 `--td-brand-color / -hover / -light / -1`、成功/警告/错误 `--td-success-color --td-warning-color --td-error-color`、圆角 `--td-radius-default|medium|large`、阴影 `--td-shadow-1|2|3`。

### 5.3 组件契约（全局使用 TDesign 组件）

- **禁止原生表单控件与原生按钮**：`<input>`→`Input`、`<textarea>`→`Textarea`、`<select>`→`Select`、`<button>`→`Button`；二次确认用 `Dialog`/`DialogPlugin`（禁止 `window.confirm`）。
- 桌面：组件从 `tdesign-vue-next` 显式按名 import（PascalCase），模板用 PascalCase 标签；反馈 `MessagePlugin`；空态 `EmptyBlock`、加载 `Loading`、错误 `Alert`。
- 移动：组件从 `tdesign-mobile-vue` 显式按名 import（PascalCase）；反馈 `Toast`、确认 `Dialog`；列表行优先 `Cell/CellGroup`。
- 组件库 CSS 只在**每端入口**引入一次：桌面 `views/desktop/AppShell.vue`、移动 `views/mobile/AppShell.vue`，以及壳外访客页（登录/注册）各自引入本端 CSS。**视图内不得再 import 组件库 CSS**。
- `components/shared/*`（IdentityTag / StateTag / EmptyBlock）**保持零组件库依赖**，仅用 `--td-*` 令牌表达 TDesign 视觉：一旦引入任一 TDesign 包，会把该包代码带进另一端的 chunk，破坏双端分包隔离（§3）。
- **全局挂载组件零依赖**：`App.vue` 中全局挂载的 `[MOCK-ONLY] devtools/DevTools.vue` 与 `components/shared/*` 一样保持零组件库依赖（原生元素 + `--td-*` 令牌），这是 §3 双端隔离的硬性要求（该组件曾因桶导入 `tdesign-mobile-vue` 导致桌面按钮出现黑色描边）。
- **移动端按钮描边层**：`tdesign-mobile-vue` 用 `.t-button::after`（200% 尺寸 + `scale(.5)`）画 1px 描边，其骨架规则自带 `border-style: solid`；`styles/tokens.css` 用 `.t-button.t-button::after { border-style: none }`（双类名提高特异性）统一去掉该描边层。
- 状态文案/配色与 admin wiki 口径一致：状态用 `StateTag`（kind/value），身份用 `IdentityTag`，禁止自造文案与配色。
- **可选/筛选 chip**：统一用 `Tag`（`:theme="选中 ? 'primary' : 'default'"` + `variant="light"`）。**禁止用 `Button` 的 `:theme/:variant` 切换冒充 chip**（会渲染成一排描边胶囊）。
- **按钮选型**：顶栏/工具条图标按钮一律 `variant="text" shape="square"`（对齐 `AdminLayout`）；主操作 `theme="primary"`；`variant="outline"` 仅留给「重置/驳回」这类与 admin 一致的次要动作；禁止 `variant="outline"` + `ghost` 组合滥用。

### 5.4 改造只读约束

- 调整视图时**不得改动** script 业务逻辑、API 调用、路由、props/emits 语义；只调整模板结构与样式。

## 6. 页面清单与路由

底部 5 Tab（`AppShell.vue`）+ 二级页（详情/提交/我的族/站内信/入驻说明）：

- **首页** `/`：搜索框 → Swiper 轮播（banner）→ 需求发布（独占行）→ 双入口（企业入驻/人才登记）→ 四宫格（文章投稿/积分商城/空间预约/活动计划）→ 最新项目 → 精选文章。
- **项目** `/projects`：搜索 + 分类 Tag + 需求（项目）列表，排版沿用原需求页；发布入口「需求发布」→ `/demands/new`，详情 `/demands/:id`。
- **社区** `/community`：3 个二级 Tab（社区服务=政策/指引列表 + 详情，人才库=社区个体，企业库=社区企业），每个 Tab 带搜索；企业点入 `/enterprises/:id`。
- **广场** `/plaza`：2 个二级 Tab（活动=活动列表，资讯=按栏目分组的文章）。
- **我的** `/me`：个人中心族（资料/积分/经验/我的项目/申请/订单/预约/投稿/需求/响应/报名/站内信）。
- 入驻说明 `/intros/:kind`：企业入驻/人才登记政策说明 + 引导登录，跳 `/applications/new?type=settle|individual`。

路由注册集中在 `src/router/index.ts`；未实现路径由 catchAll 兜底重定向首页。移动端数据域 api：`api/home.ts`（首页聚合）、`api/community.ts`（政策/人才/企业）、其余域沿用。

## 7. 验证策略

- 每批次：`tsc --noEmit` + `pnpm build:client-mobile` + `pnpm lint` + playwright-cli 有头浏览器走查（移动 375 断点为主）。
- 接入期（M2-R）：新增 `apps/api/test/app-*.e2e-spec.ts` 套件 + `VITE_API_MODE=http` 全量回归。

## 8. 修订记录

| 日期 | 摘要 |
|---|---|
| 2026-09-12 | 初版：独立服务边界 / Mock-First 架构 / 双端适配 / 鉴权与多身份 / 视图与验证约定（M2-M1 骨架 + 登录注册首页已落地） |
| 2026-09-12 | M2-M2~M6 全量交付：42 页双端视图（需求/活动+位置签到/商城/空间/内容/展示页/项目/个人中心族/站内信）、9 域 mock handlers（含可见范围过滤、签到围栏+时间窗、事务下单、冲突 409、grantPoints 积分、pushNotice 站内信触发点）、首页聚合升级（hero+未读入口+全域聚合卡）、双端壳导航点亮；验证 tsc/build/lint 全绿 |
| 2026-09-12 | **UI 全量统一（对齐后台 Design Contract）**：`--jc-*` 自定义色板 → TDesign `--td-*` 默认令牌（70 文件 / 951 处，零残留）；62 个视图原生控件（button/input/textarea/select/window.confirm）→ TDesign 组件（桌面 `tdesign-vue-next`、移动 `tdesign-mobile-vue`，PascalCase 显式导入）；双端壳改 `HeadMenu` / `Navbar + TabBar`；登录/注册对齐后台品牌区样式（`.login-brand` 等共享类）并补齐壳外组件库 CSS 入口；共享组件令牌化对齐 `t-tag` 视觉；新增 §5 UI 契约（样式/组件/CSS 入口/只读约束） |
| 2026-09-12 | **按钮/chip 选型纠正**：分类筛选由「Button + `:theme/:variant` 切换」改为选择类组件——桌面 `CheckTag`（light 变体，8 处）、移动 `Tag variant="light"`；顶栏「退出」由 `outline` 改 `variant="text"`（对齐 `AdminLayout`）；首页 hero「注册」去掉 `outline + ghost`、「未读提示」去掉 `outline + ghost`；§5.3 补充 chip/按钮选型规则 |
| 2026-09-12 | **修复「桌面按钮黑色描边」（真根因）**：全局挂载的 `DevTools` 桶导入 `tdesign-mobile-vue`，把移动端整包 CSS 带进全局样式图；移动端 `.t-button::after{border-style:solid}` 因此误命中桌面 `.t-button`（补 `width/color` 的 `.t-button--default::after` 不匹配桌面的 `--theme-*` 类）→ 桌面按钮 `::after` 取初始值 `medium(≈3px)`+`currentColor`。修法：①`DevTools` 改为零组件库依赖（原生元素 + 令牌），移动端样式回归 `vendor-tmobile` 分包；②`tokens.css` 覆盖 `.t-button.t-button::after{border-style:none}`。实测：桌面页移动端样式表请求 0、`.t-button…::after` 规则由 53 条降为 1 条（仅覆盖条）、按钮 `::after` 边框 `none`；tsc/lint/build 全绿 |
| 2026-09-13 | **信息架构重构（社区管理者视角）**：`client-mobile` 收敛为**纯移动端**——移除 `views/desktop/**`、`dualView.ts`、`tdesign-vue-next` 依赖（构建产物不再含 `vendor-tdesktop`）；底部 5 Tab 改「首页/项目/社区/广场/我的」；新增 `HomeView`（搜索+轮播+需求发布+双入口+四宫格+最新项目+精选文章）、`ProjectsView`（复用需求排版与数据）、`CommunityView`（社区服务/人才库/企业库 3 Tab，各带搜索）、`PlazaView`（活动/资讯 2 Tab）、`IntroView`（企业入驻/人才登记政策说明+引导登录）；新增 `api/community.ts` 与社区运营 mock（policies/talents）、首页 banner；`ApplicationNewView` 支持 `?type=` 预设；§3 改为纯移动端架构；tsc/lint/build 全绿 |
| 2026-09-13 | **一致性细化**（信息架构/元素/语词/视觉）：①纳入 git（commit 0dab926）；②`AppShell` Navbar 统一「返回箭头 + 页面标题映射」——5 Tab 无箭头、二级页箭头返回并显示标题，移除各页手写「返回/‹ 返回」控件（双返回）；③加载态统一为 `Loading` 组件（替换 12 处手写「加载中…」占位）；④删除死代码 `DemandsView.vue`；⑤语词统一（EventsView 空态补宾语、DemandNewView「需求广场」语境改「项目」「发布功能」）；⑥`border-radius` 硬编码 4px/12px/999px → `--td-radius-small/large/circle`（16 处） |
| 2026-09-13 | **四维一致性归一化**（宽度/边距/字号/圆角）：①**令牌有效性审计**——差异比对 src 全部 26 个 `--td-*` 使用 vs mobile 库 215 个定义，揪出 2 个 desktop 惯性失效令牌：`--td-radius-medium`（16 处，mobile 无此令牌→圆角全失效为 0px）、`--td-bg-color-container-hover`（2 处）→ 分别改 `--td-radius-large`(9px) 与 `--td-bg-color-secondarycontainer`；②间距对齐 4px 节奏——`gap:14px→12px`（19 处）、`padding:14px→16px`（m-card）、Home 根容器 `12px 16px 8px→16px`；③字号对齐 TDesign 字体体系——`font-size:11px→12px`（55 处，11 不在 10/12/14/16/18 体系内）；④实测确认：卡片 radius 9px/padding 16px、根容器 padding 16/gap 12、列表 gap 10；tsc/lint/build 全绿 |
| 2026-09-13 | **顶栏与交互修正（用户实测反馈）**：①Navbar 左侧=社区名（Tab 页）/返回箭头（二级页），右侧=头像+当前身份→铃铛；②社区/广场二级 Tabs 去 `--td-tab-nav-background` 白底（融入页面灰底，内容卡片保留白底）；③搜索全面实时化——统一 TDesign `Search` 组件（shape=round 胶囊、自带清除），Home 聚焦即跳项目页，Projects/Community×3/Events/Articles 输入防抖 300ms 自动检索，移除全部「搜索/查询/重置」按钮；④**当前身份切换**——auth store 新增 `currentIdentity`（持久化 `joinyuu_client_identity`）/`switchableIdentities`（社区个体时不再单列个人用户）/`profileIdentities`（资料卡隐藏个人用户标签）/`activeIdentityLabel`，Me 页新增「当前身份」Cell → ActionSheet 弹出全部可切换身份（当前身份高亮标记），切换后顶栏与 Cell 实时更新；⑤**全局组件化**——首页发布条/双入口/四宫格改 `Button`/`Grid`+`GridItem`，shared 三件套（IdentityTag/StateTag→Tag、EmptyBlock→Empty）与 DevTools 全部回归 TDesign 组件，自绘控件清零；实测：三身份账号切换后顶栏/Cell/持久化全部同步 |
| 2026-09-13 | **二轮交互修正（用户实测反馈）**：①全局 `.t-search` 白底 + `--td-radius-large`（页面灰底上呈现白色圆角搜索条）；②广场页活动/资讯两 Tab 各加实时 Search（防抖 300ms）；③选项卡滑动区修复——`.top-tabs` 设 `min-height: calc(100dvh - 顶栏 - TabBar - 32px)`，内容不足一屏时卡片下方空白也在手势区内，左右滑动切换可用；④**我的页卡片宽度统一**——根因 `.t-cell-group--card` 自带 `margin: 0 16px` 与页面容器 padding 叠加（313 vs 345），置零 margin 并补 `--td-component-border` 边框，实测 5 卡全部 345px；⑤身份切换弹窗关闭修复——显式 `popupProps.closeOnOverlayClick` + `@close`/`@cancel` 置 visible=false，空白处（遮罩）点击与取消按钮均可关闭 |
| 2026-09-13 | **三轮视觉与身份修正（用户实测反馈）**：①顶栏右侧改两行——大字=当前身份主名称（auth store 新增 `activeIdentityName`：社区企业→企业名/合作企业→主体名/其余→昵称）、小字=身份标签；②切换身份选项格式化——「个人用户」某某某/「社区企业」某某某有限公司 - 总经理，`UserIdentity` 新增 `enterpriseRole`（mock：芯启半导体-创始人/木白设计-总经理），ActionSheet 回调用 index 反查身份；③搜索框规格重定——移除 `.t-search` 容器背景，改调组件自身 `--td-search-bg-color`(白) + `--td-search-square-radius`(9px)，全部 8 处 Search 去 `shape="round"`（胶囊→与卡片同圆角）；④配色回退默认——删除 `--jc-accent*` 三变量，发布条回 `theme="primary"`、企业入驻卡去橙色 accent，logo/头像去品牌渐变回 Avatar 默认底色（消除"蓝色滤镜"感）；⑤**GridItem 图标渲染修复**——库源码 `renderTNodeJSX("icon")` 仅在 icon prop 真值时执行：GridItem 需 `:icon="true"` 才渲染 `#icon` 插槽，且默认插槽不渲染（文字必须走 `#text`）；⑥**网格边缘对齐**——Grid 根元素内联 `padding: {gutter}px` 导致首尾 item 内缩 8px，`padding: 0 !important` 覆盖（grid-gap 保留），实测首页全部元素边缘 [16,361] 对齐；⑦`.t-grid-item__image` 默认灰底透明化（`--td-grid-item-image-bg-color`）；实测：苏明远账号切换身份后顶栏两行/Cell/持久化同步，tsc/lint 全绿 |
| 2026-09-13 | **选项卡滑动区真根因修复 + 标题条可视（用户实测反馈）**：①滑动失效真因——Tabs 的 touchstart/move/end 手势监听绑定在 `.t-tabs__content` 上（`swipeable` 默认即为 true），此前 min-height 误设在 `.t-tabs` 根元素，content 下方空白不在监听区；改为 `.top-tabs .t-tabs__content { min-height: calc(100dvh - 顶栏 - TabBar - 80px) }`，实测 content 底部 676 ≥ TabBar 顶 667，卡片下方空白全入手势区；②标题条白底——`--td-tab-nav-background` 改回 `var(--td-bg-color-container)`（作用于 `.t-tabs` 根与 `__wrapper`，标题条恢复"按钮"可视性），内容区回填 `--td-bg-color-page` 灰底保持「灰底+白卡片」层次；③标题条与搜索框加 12px 间距（`.tab-search margin-top`，社区/广场两页）；实测几何+截图确认，tsc/lint/build 全绿 |
