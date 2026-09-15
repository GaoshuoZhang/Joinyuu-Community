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
- 超出当前后端边界的功能（站内信 / 签到 / 首页聚合等）以 `// [MOCK-ONLY]` 标记，并在 `m2-client-plan.md` §7 缺口表与 §0.3/0.4 看板登记；接入期（M2-R）逐条销号。

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
- **社区** `/community`：3 个二级 Tab（社区服务=政策/指引列表 + 详情，人才库=社区个体（带头像，点入 `/talents/:uid` 简历式公开名片），企业库=社区企业），每个 Tab 带搜索；企业点入 `/enterprises/:id`（精致企业名片）。
- **广场** `/plaza`：2 个二级 Tab（活动=活动列表，资讯=按栏目分组的文章）。
- **我的** `/me`：个人中心族（资料/积分/等级/我的项目/申请/订单/预约/投稿/需求/响应/报名/站内信）；社区个体另有「个人名片」；有关联身份时显示「关联身份」→ `/me/identities`（卡片列出社区个体与全部关联社区企业/合作企业：社区个体 → 个人名片；企业 → `/me/enterprises/:id` 按角色操作，负责人可编辑/邀请/转移/退驻，成员只读）。
- 入驻说明 `/intros/:kind`：企业入驻/人才登记政策说明 + 引导登录，跳 `/applications/new?type=settle|individual`。

路由注册集中在 `src/router/index.ts`；未实现路径由 catchAll 兜底重定向首页。移动端数据域 api：`api/home.ts`（首页聚合）、`api/community.ts`（政策/人才/企业）、其余域沿用。

## 7. 验证策略

- 每批次：`tsc --noEmit` + `pnpm build:client-mobile` + `pnpm lint` + playwright-cli 有头浏览器走查（移动 375 断点为主）。
- 接入期（M2-R）：新增 `apps/api/test/app-*.e2e-spec.ts` 套件 + `VITE_API_MODE=http` 全量回归。

## 8. 修订记录

| 日期 | 摘要 |
|---|---|
| 2026-09-12 | 初版：独立服务边界 / Mock-First 架构 / 双端适配 / 鉴权与多身份 / 视图与验证约定（M2-M1 骨架 + 登录注册首页已落地） |
| 2026-09-12 | M2-M2~M6 全量交付：42 页双端视图（需求/活动+签到/商城/空间/内容/展示页/项目/个人中心族/站内信）、9 域 mock handlers（含可见范围过滤、签到围栏+时间窗、事务下单、冲突 409、grantPoints 积分、pushNotice 站内信触发点）、首页聚合升级（hero+未读入口+全域聚合卡）、双端壳导航点亮；验证 tsc/build/lint 全绿 |
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
| 2026-09-13 | **全页面与流程细化（Mock，v6）**：①工程——401 改 `joinyuu:unauthorized` 事件 + history 跳登录（`main.ts` 清会话、带 redirect）、`EnterpriseRecord` 移入 `types/`、删 `stores/breakpoint.ts` 与 `vendor-tdesktop` 死分块；②签到——DevTools 增位置注入四场景（场地内/场地外 500m/关闭定位/清除）+「签到时间窗对齐当前」、失败文案按 `checkinOpenMin` 动态提示、活动日期相对「今天」生成（报名/签到场景不再随日期失效）；③订单——下单确认弹层（余额预览 + 积分不足前置）、`confirmOrder` 确认收货（缺口 §7.1-10，契约 `POST /mall/orders/:id/confirm`）、DevTools「待发货 → 已发货」模拟；④我的预约取消（Dialog 二次确认）；⑤展示页申请入口（社区·企业库卡片，成员可见）+ 投稿图片上传占位 + 驳回稿「重新投稿」；⑥资料编辑全字段落库（性别/简介）并同步昵称、积分流水防抖搜索；⑦首页消费 `hotEvents`/未读角标/`siteName`+`siteSlogan`（AppShell 品牌读 config.siteName，铃铛冷启动兜底刷新）；⑧mock 数据一致性（人才库 uid/姓名、政策 `PL` 前缀、字典补 industry/goods_category、首页活动卡由活动列表派生）；tsc/lint/build 全绿 |
| 2026-09-13 | **Pixel 10 仿真 e2e 走查（v7，chrome-devtools MCP 412×924@2.625）**：全流程通过（登录边界/浏览搜索/需求/签到四态/商城收发货/预约取消/投稿/站内信/展示页/身份与开关/守卫与 401）。**修复**：①需求截止日期 Picker 缺 `format`/`start`（默认 2016 年）→ `format="YYYY-MM-DD"` + `:start=今天`；②站内信单条已读角标不减（store 与 mock 共享引用）→ 读前快照 `wasUnread`；③DevTools 开关未同步 mock `appConfig`（写端点不拦截）→ `onToggle` 同步；④`AppShell` 的 `<router-view>` 过渡改官方 slot 写法（消除 Vue Router 弃用告警）；⑤mock 时间戳统一 `nowStamp()`（`YYYY-MM-DD HH:mm`，覆盖下单/发货/完成/投稿/预约/申请/注册/通知/积分流水） |
| 2026-09-13 | **点击式 e2e 二轮（v8，导航元素专项）**：全程仅用界面模拟点击（进入/返回均不走 URL）。修复 `AppShell`：①`isTab` 改精确匹配 Tab 路径——此前 `/me/**` 12 个子页被误判为 Tab 页（无返回箭头、无标题）；②`onTabChange` 改 `route.path` 精确比较——此前在 `/me/orders` 等子页点所属 Tab 无响应，现在点击即回 Tab 根。观察项：登录/注册页无「返回首页」入口；展示页申请提交后从展示页返回会回到申请页（history 语义） |
| 2026-09-13 | **企业合作 / 人才登记流程重构（v9）**：①首页双入口「企业合作 / 人才登记」；②`/intros/enterprise` 企业合作 hub（企业入驻/合作伙伴两方式对比 + 选择态 + CTA「成为社区企业/成为合作伙伴」）；③独立介绍页 `/intros/settle|cooperation|talent`（流程步骤/适合人群/所需材料 + CTA）；④独立 schema 驱动表单页 `/applications/settle|cooperation|individual`（`components/forms/ApplicationFormRenderer.vue`：text/textarea/select(Picker)/number/date(DateTimePicker)/upload(Upload + 自定义 requestMethod)，必填校验与提交）；⑤上传契约 `api/uploads.ts`（mock 转 data URL；仅图片/PDF ≤10MB；http 分支 `POST /api/app/uploads`）；⑥身份绑定申请保留 `/applications/new`；⑦`IntroView` 改为按路径解析 kind（修复静态路由下 talent/cooperation 均渲染 settle 的缺陷）；缺口登记见 m2-client-plan §7.1-14/6、§7.2-5 |
| 2026-09-13 | **发布需求细化（v10）**：①发布需求类型 hub（`DemandPublishHubView`：「找人干活 / 找投资 · 合作」两卡片对比 + 单选 + CTA 联动，未选禁用）；②两类独立表单（`/demands/new/task|invest` 薄壳 + `components/forms/DemandFormView` 按 `kind` 渲染；task：期望交付/预算，investment：所属行业/希望获得/可提供回报；DateTimePicker `format="YYYY-MM-DD"` + `start=今天`）；③`Demand` 增 `kind` 与专属字段、`DemandCreatePayload` 增 `kind/categoryDict`，mock 校验与种子数据同步；项目列表/详情/我的需求展示类型标签与专属字段；④`constants/demand.ts` 统一类型文案；⑤修复 `ProjectsView` 搜索回调 `v` 未定义（输入即 ReferenceError）；缺口见 m2-client-plan §7.1-15 / §7.2-6 |
| 2026-09-13 | **发布需求三类细化（v11）**：①hub 扩为三类（找人干活 / 找投资 / 找合作），每类含 tagline + 推进流程步骤（找人干活：发布需求→平台审核→响应接单→立项协作→结项交付；找投资：…→公开展示→投资洽谈→立项协作→结项交付；找合作：…→公开展示→建立联系→达成合作）+ 4 条适用情形，CTA 按选中类型联动；②新增 `/demands/new/cooperation` 表单页（`DemandCoopFormView` 薄壳，字段：合作需求标题/业务现状与瓶颈/合作领域（字典 chips）/业务瓶颈与合作诉求/期望合作方式（选填）/可提供资源与回报（选填）/截止日期/发布身份）；③`DemandFormView` 按 kind 渲染三类字段并在表单顶部展示「审核与推进流程」流程卡；④需求详情增合作专属字段块（合作诉求/期望合作方式/可提供资源）；⑤种子：D4012 改合作类（含 bottleneck/partnershipMode/returnOffer）、新增已发布「找合作」D4013；⑥`AppShell` 标题「找投资」「找合作」与路由同步；缺口 §7.1-15 与 api-app-design §6 更新为三值 |
| 2026-09-13 | **发布需求流程标签调整 + 控制台降噪（v12）**：①hub 与表单的流程 chips 移除「平台审核/公开展示」（自用户视角只保留推进节点），圆角改 `--td-radius-default`（圆角矩形）；②修复控制台大量 Vue warn：首页 `GridItem :icon="true"`（prop 类型应为函数）改为 `#image` 插槽承载图标；③`main.ts` 增加 a11y 修补（MutationObserver 为 TDesign 内层 input/textarea 补 id/name、label 关联 for），控制台 warn/issue 清零 |
| 2026-09-13 | **我的展示页自助编辑（v13）**：「我的」当前身份下方新增「编辑展示页」（仅社区个体/社区企业可见，note 显示「个人/企业」）；新增 `/me/showcase`（`MyShowcaseView`，双目标切换 + 个人/企业表单）；契约 `GET/PUT /api/app/me/showcase`（`api/enterprises.ts` fetchMyShowcase/updateMyShowcase）；mock 保存即发布——企业回写展示页并置 `showcaseStatus='published'`，个人写个人展示页并联动社区人才库（talentMembers）；缺口 §7.1-16/§7.2-7/§7.4-9 与 api-app-design §5 已登记；tsc/lint/build 全绿 + 点击式走查（陈屿人才库联动、苏明远双目标与企业校验、周慕深不显示） |
| 2026-09-13 | **展示页更名「名片」+ 企业名片/企业管理（v14）**：①全局 UI 展示页→名片（企业名片/个人名片/申请企业名片）；②「我的」按**当前身份**显示——社区个体→「个人名片」（查看/编辑）、社区企业→「企业名片」（联系人可编辑、非联系人只读并提示负责人）、企业联系人额外显示「企业管理」；③新增 `/me/cards/individual`（`MyIndividualCardView` 预览+编辑）、`/me/cards/enterprise`（`MyEnterpriseCardView` 预览+联系人可编辑）、`/me/enterprise`（`EnterpriseManageView`：基本信息 / 转移负责人（后台「联系人」）/ 邀请成员 / 申请退驻·注销），删除 `MyShowcaseView`；④契约 `api/enterprises.ts` 8 函数：fetchMyCards / updateIndividualCard / updateEnterpriseCard / fetchMyEnterprise / updateMyEnterprise / transferEnterpriseContact / inviteEnterpriseMember / applyEnterpriseExit；⑤mock `EnterpriseRecord.members` 改成员对象（uid/name/role/phone）并新增 `contactUid/contactName`，新增 `enterpriseExitApplications` 存储；转移后原联系人即时失去企业管理与名片编辑权限；tsc/lint/build 全绿 + 点击式走查（陈屿个人名片、苏明远企业名片/邀请成员/退驻申请、林晚转移给周予安后权限回收与只读、周慕深无入口、控制台零告警） |
| 2026-09-14 | **项目页需求分类选项卡 + 滑动修复（v15）**：①项目页改用 TDesign `Tabs` 三类需求（找服务 / 找投资 / 找合作），搜索/分类/分页按当前类型筛选，切换类型重置筛选（找投资用行业字典）；`GET /api/app/demands` 增可选 `kind` 筛选参数（api-app-design §6）；②`task` 用户可见文案统一由「找人干活」改「找服务」（发布 hub / 表单 / 标题映射 / 项目列表；类型值与路由仍为 `task`）；③**滑动体验对齐社区页**——沿用 TDesign 原生手感（滑动中越过 40px 即切换），但每次手势至多切换一项：修复 1.16.2 在每个 `touchmove` 连续切换导致的 1↔3 跳项；首尾不循环，纵向滚动/多指/取消手势不切换，分类标签横滚不触发；④登录页新增「暂不登录」访客入口（`replace` 回首页，不执行登录逻辑）；⑤滑动区覆盖 `.t-tabs__content` 撑满的整个内容区（含卡片下方空白，与社区/广场一致）；移除项目页「已加载全部 N 条」尾提示；tsc/lint/build 全绿 + 浏览器验证（滑动逐项切换、点击切 Tab、多指与取消手势、控制台零告警） |
| 2026-09-14 | **选项卡圆角 + 头像去描边 + 身份资产隔离（v16）**：①项目/社区/广场选项卡白条**四角**统一 9px 圆角（`tokens.css`：`.top-tabs` 根 `background: transparent` + `overflow: hidden`，白底由 `.t-tabs__wrapper` 承担并 `border-radius: var(--td-radius-large)`，避免圆角缺口露白）；②「我的」资料卡头像移除双层描边环（删除 `.avatar` box-shadow）；③**积分/经验按当前身份隔离**——社区个体：我的积分 + 我的等级；社区企业：仅企业等级（企业经验）、无积分；个人用户：仅我的积分、无等级；合作企业：均无。Me 页统计位（社区企业显示 Lv.x 企业等级）与「我的资产」入口、经验页标题（社区个体→我的等级 / 社区企业→企业等级）与取数、积分页空态均按 `auth.activeIdentity`；mock 新增 `enterpriseExperienceByEid`（E2001 芯启 Lv.3 同行先锋 / E2004 木白 Lv.2 启航伙伴），`fetchExperience(identityType)` 按身份返回（契约 `GET /me/experience-records?identity=`，缺口 §7.1-7 与 api-app-design §5 已更新）；点击式走查四身份矩阵（苏明远 社区个体↔社区企业、林晚 个人用户↔社区企业、周慕深 个人用户↔合作企业）与控制台零告警；tsc/lint/build 全绿 |
| 2026-09-14 | **「我的」菜单按身份严格隔离 + 签到命名（v17）**：①菜单隔离矩阵——社区个体：个人名片/我的积分/我的等级/我的项目 + 个人记录（需求·响应·报名·订单·预约·投稿·申请）；个人用户：我的积分/我的项目 + 个人记录（无名片、无等级）；社区企业：企业名片/企业管理（联系人）/企业等级/我的项目 + 记录（我的需求）；合作企业：无资产组（隐藏积分/等级/订单）+ 记录（我的需求·我的申请）；编辑资料/站内信/退出对所有身份保留；②修复「幽灵身份」——`stores/auth.ts` 的 `activeIdentity` 与 `apply()` 改按 `switchableIdentities` 判定（被社区个体覆盖的个人用户不再滞留为当前身份）；③UI 文案「位置签到」→「签到」（活动详情按钮、签到页成功提示），`AppShell` 标题前缀改为 `/check-in`（修复此前永不命中、签到页标题落到「活动计划」的缺陷）；tsc/lint/build 全绿 + 点击式走查（苏明远 社区个体↔社区企业、周慕深 个人用户↔合作企业 菜单矩阵；陈屿 签到页标题「签到」；控制台零告警） |
| 2026-09-14 | **合作企业业务能力对齐 + 主体快照（v18）**：①合作企业可发布全部类型需求——发布表单「以哪个身份发布」默认当前身份（与预约表单口径一致）；②空间预约新增「以哪个身份预约」主体快照（`SpaceReservation.identityType/subjectName`，`ReservationCreatePayload.asIdentity`）：社区企业/合作企业均可预约会议室等空间，「我的预约」卡片展示身份标签与主体名；③Me 菜单补「我的预约」（社区企业：需求·预约；合作企业：需求·预约·申请）；④mock：需求 `publisherName` 按身份取企业名/组织名（个人取昵称），企业预约种子 SR5101 标注社区企业·芯启半导体；契约 api-app-design §6/§8 同步；tsc/lint/build 全绿 + 点击式走查（周慕深 合作企业发布找服务需求、以合作企业预约共享会议室 A 并显示 [合作企业] 云径数据；苏明远 企业预约显示 [社区企业] 芯启半导体） |
| 2026-09-14 | **身份模型收敛：弱化企业与个人隔离（v19）**：①**移除全局「当前身份」**——`stores/auth.ts` 删除 `currentIdentity`/`switchIdentity`/`activeIdentity*`/`switchableIdentities` 与 `joinyuu_client_identity` 持久化，顶栏只显示昵称；②身份仅作为**发布/提交归属**在表单内单选（需求/预约表单 chips：「个人用户 · 陈屿 / 社区个体 · 陈屿 / 社区企业 · 芯启半导体」，统一 `identityOptionLabel`；发布后列表展示的主体即发布方）；③「我的」页统一菜单（不再按身份隔离）：个人名片（社区个体）/ 我的积分 / 我的等级（社区个体）/ 我的项目 / 全部记录 / 编辑资料 / 站内信；④**企业管理**收敛：仅当用户是某企业负责人时显示入口，列表卡片展示所有关联企业（负责人/成员 tag + 名片发布状态），详情页（负责人可编辑信息、转移负责人、邀请成员、申请退驻；成员只读——表单禁用 + 提示负责人）；⑤路由与契约收敛：新增 `/me/enterprises`、`/me/enterprises/:id`，移除 `/me/enterprise` 与 `/me/cards/enterprise`（删除 `EnterpriseManageView`/`MyEnterpriseCardView`，新增 `EnterpriseListView`/`EnterpriseDetailView`）；`api/enterprises.ts` 改为 id 维度（fetchMyEnterprises / fetchEnterpriseDetail / updateMyEnterprise / transfer / invite / exit），移除 updateEnterpriseCard；⑥经验页按个人维度取数（社区个体→我的等级，否则空态），`identity` 参数保留兼容；tsc/lint/build 全绿 + 点击式走查（苏明远：无当前身份/企业管理 1 家/列表 → 详情编辑保存 → 转移江晚晴后变只读；需求与预约表单身份 chips；我的等级 Lv.3 岛屿开拓者；控制台零告警） |
| 2026-09-14 | **「企业管理」升级为「关联身份」（v20）**：①「我的」页入口更名「关联身份」（note=身份个数，无关联身份时隐藏）；②新增 `/me/identities`（`IdentityListView`）以卡片列出**全部身份**——社区个体（副标题 Lv.x 等级，点击进个人名片）+ 各关联社区企业/合作企业（角色 负责人/成员 + 名片发布状态，点击进企业详情），支持同类型多个；③契约：列表端点 `GET /me/enterprises` → `GET /me/identities`（`MyIdentitySummary`），企业详情与操作（`GET/PUT /me/enterprises/:id`、transfer/invite/exit）不变；④mock 由账号身份 + 企业成员关联合并生成（社区个体卡 + 企业卡；无企业记录的合作企业组织为无入口信息卡）；删除 `EnterpriseListView`；⑤a11y 修补：`main.ts` 字段 id 改用全局递增序号（修复按索引命名撞号），需求/预约/投稿/资料/申请等表单的装饰性分组 `label` 改 `span.field-label`（控制台 form-field issue 清零）；tsc/lint/build 全绿 + 点击式走查（苏明远 2 个身份：社区个体→个人名片、芯启半导体→详情；周慕深 1 个：合作企业·云径数据；陈屿 1 个：社区个体；新居民无关联身份不显示入口；控制台零告警） |
| 2026-09-14 | **需求表单调整（v21）**：①移除「截止日期」（`deadline` 不再收集；日期文案 `demandDateText` 优先「预期交付」、回退旧「截止」，项目列表/详情/首页同步）；②「找服务」新增「预期交付日期」（`deliverBy`，必填；Picker 下限今天）；③三类需求新增「联系人 / 联系电话 / 联系邮箱」（前两项必填：电话校验 11 位；邮箱选填、校验格式；需求详情新增联系人信息块）；④发布身份选项：持社区个体身份时不再单列「个人用户」（`auth.hasCommunityIndividual` 过滤）；⑤「以哪个身份发布」更名「发布身份」；⑥输入框圆角修复（`tokens.css` 全局 `.t-input`/`.t-textarea` 9px，与搜索框同规格）；种子 D4001/D4003/D4004/D4005 补 `deliverBy` 与联系人，首页卡与详情同步；契约 §7.1-15 与 api-app-design §6 同步；tsc/lint/build 全绿 + 点击式走查（task 表单字段/电话与邮箱校验 Toast/提交成功、投资表单无日期项、项目列表与首页「预期交付」、D4001 详情联系人、控制台零 issue） |
| 2026-09-14 | **头像 / 企业 Logo / 成员职位（v22）**：①「我的」移除「个人名片」入口（功能并入 关联身份 → 社区个体 → 个人名片）；②顶栏右侧仅显示头像（移除昵称文字，`nav-me` 仅 Avatar）；③**头像更换**——`ProfileEditView` 增头像上传（TDesign Upload → `POST /uploads`，mock data URL；`PUT /me` 增 `avatar`），`AuthResult`/`UserProfile`/auth store 增 `avatar`，保存后顶栏与「我的」同步显示图片；④**企业 Logo**——企业详情「企业基本信息」增 Logo 上传（负责人可上传、成员只读），`EnterpriseRecord.logo` + 企业详情/展示页返回，展示页 banner 显示 Logo；⑤**成员职位**——邀请成员需指定职位（`InviteMemberPayload.role` 必填），负责人点击成员条目修改职位（新增 `PUT /me/enterprises/:id/member-role`，`UpdateMemberRolePayload`）；tsc/lint/build 全绿 + 点击式走查（头像上传保存后顶栏/我的显示；Logo 上传保存后社区展示页 banner 显示；江晚晴职位改「技术负责人」；邀请「顾青·市场专员」入列；控制台零 issue） |
| 2026-09-14 | **个人/企业名片简历化 + 头像同步与直传（v23）**：①**个人名片简历化**——`MyIndividualCard` 扩为分段字段（年龄/政治面貌/行业经验 + `education/work/projects/honors/socials/customLinks` 条目数组），`MyIndividualCardView` 编辑器支持每段添加/删除；保存后公开到人才库；新增 `/talents/:uid`（`TalentCardView` 简历式精致排版：头像/等级/简介/技能/行业经验/教育·工作·项目经历/荣誉/链接），人才库列表卡片带头像并可点入；②**头像同步**——个人名片预览与公开人才名片展示个人资料头像；③**企业名片丰富**——`EnterpriseRecord` 增 `foundedAt/website/address/services/advantages`（企业详情负责人可编辑、成员只读），`EnterpriseShowcaseView` 精致排版（Logo 横幅 + 成立于 + 主营业务 + 核心优势 + 企业信息办公地点/官网 + 成员）；④**头像/Logo 直传**——新增共享组件 `AvatarUploader`（点头像/Logo 直接选图上传替换，隐藏 file input，圆形/方形共用），资料编辑与企业 Logo 移除边上上传框；⑤负责人可修改**自己**的成员职位（成员条目全部可点）；契约 api-app-design §5/§8 与 §7.1-12/16 更新；tsc/lint/build 全绿 + 点击式走查（头像直传保存后同步顶栏/个人名片；陈屿人才名片全部分段渲染（教育/工作/项目/荣誉/链接）；企业字段编辑与展示页渲染；负责人改自己职位为「首席执行官」；控制台零 issue） |
| 2026-09-14 | **企业名片细化 + 底栏归属 + 积分入口（v24）**：①「企业展示」标题更名「企业名片」（AppShell），成员 chips 由 `--td-radius-circle` 椭圆改 `--td-radius-small` 圆角矩形；②**底栏高亮修复**——`/enterprises/**`、`/talents/**` 归属「社区」Tab（AppShell `TAB_ALIASES`）；③**移除企业成员**——成员管理弹层新增「移除成员」（Dialog 二次确认），仅负责人可操作且负责人本人提示「需先转移负责人」；新增契约 `POST /me/enterprises/:id/remove-member`；④「我的积分」余额卡下新增「去积分商城兑换」按钮 → `/mall`；⑤**企业详情改管理视图**——头部（Logo/名称/行业·规模·成立时间/角色）+「编辑企业名片」入口 + 企业负责人 / 企业成员 / 退驻注销；企业基本信息编辑独立为 `/me/enterprises/:id/edit`（`EnterpriseCardEditView`：Logo 直传 + 名称只读 + 行业/规模/成立时间/官网/办公地点/简介/主营业务/核心优势；仅负责人可进，保存后返回详情）；tsc/lint/build 全绿 + 点击式走查（企业名片标题与成员 3px 圆角、两页底栏「社区」高亮、移除江晚晴后成员 1 人、负责人本人弹层提示、积分页按钮跳商城、编辑企业名片保存并返回详情、Logo 直传生效；控制台零告警） |
| 2026-09-14 | **全量 e2e 覆盖 + 两处缺陷修复（v25）**：登录边界（验证码/冻结/不存在/成功/「暂不登录」/守卫 redirect 与 401 事件回跳）、首页/广场/社区（检索、政策弹层、人才库公开名片、企业库名片状态）、项目三选项卡与需求响应、发布需求全校验链与提交、活动报名/取消与**签到四态**（定位失败/围栏外/关闭定位/成功+10 与去重）、商城下单-发货-收货、空间预约与取消、投稿与重新投稿、名片（关联身份/个人名片编辑并公开/企业详情/编辑企业名片/成员职位/退驻）、站内信（筛选/跳转/全部已读）、DevTools 开关关停态。**修复**：①`stores/auth.ts` 新增 `refreshProfile()`（GET /me 同步昵称/头像/积分），Me/我的积分/商城列表/商品详情进入时刷新（积分变动后余额不再滞留旧值）；②`SpaceReserveView` 预约身份选项按 `hasCommunityIndividual` 过滤「个人用户」（与需求表单一致） |
| 2026-09-14 | **「我的」资料卡去重（v26）**：移除资料卡右侧积分统计块（与「我的资产 → 我的积分」重复），`.stats` 样式清理；tsc/lint 全绿 |
| 2026-09-14 | **企业成员邀请闭环 + 成员手机号维护（v27）**：①成员管理弹层新增手机号修改（`PUT /me/enterprises/:id/member`，职位 + 手机号，11 位校验/冲突 409）；②邀请成员改为生成邀请记录 + 站内信（未注册 400、已是成员/重复邀请/邀请自己 409）；③新增邀请详情页 `/me/invitations/:id`（`InvitationView`，企业概要 + 邀请信息 + 确认加入/拒绝；接受写入成员并通知负责人，拒绝仅记状态；仅被邀请人可处理）；④企业详情展示待接受邀请（仅负责人）；站内信触发点：邀请发送/接受/拒绝/成员资料更新；缺口 §7.1-17 / §7.4-10 / 后台 §7.2-7 增补，api-app-design §5 同步 |
| 2026-09-14 | **企业成员权限分配 + 企业库列表去成员（v28）**：成员管理弹层新增 8 项权限勾选（发布需求/响应需求/空间预约/文章投稿/管理成员/邀请成员/分配权限/编辑企业名片；负责人默认全部并显示说明）；`permissions` 经 `PUT /me/enterprises/:id/member` 保存（需 assign_permission；职位/手机号需 manage_members），mock 对 invite/remove-member/企业信息编辑分别校验 invite_member/manage_members/edit_card；企业详情按 `myPermissions` 显隐入口与操作；被授权成员在需求发布/空间预约表单自动出现「社区企业 · <企业>」身份选项（`asEnterpriseId` 代企业主体，校验 publish_demand/space_reserve，撤销权限后选项消失）；**企业库列表移除成员行**；tsc/lint/build 全绿 + 浏览器走查 |
| 2026-09-14 | **成员管理改为独立页（v29）**：原底部弹窗内容（职位/手机号 + 8 项权限）超出视口无法上下滚动 → 新增 `/me/enterprises/:id/members/:memberKey`（`EnterpriseMemberView`：成员头部 + 成员信息 + 权限勾选 + 保存/移除；负责人显示默认全权提示与退出提示；保存/移除后返回企业详情）；企业详情成员行改路由跳转（memberKey = uid 或姓名）；AppShell 标题「成员管理」；邀请成员仍为弹窗 |
| 2026-09-15 | **实名认证入口（v30）**：「编辑资料」页新增「实名认证」Cell（note 已认证/未认证）→ `/me/realname`（`RealNameView`：未认证表单 = 真实姓名 + 18 位身份证号（含校验码校验）；已认证 = 脱敏展示 姓名首字 + 证件号前 4 后 4 + 认证时间，提示修改需联系运营）；契约 `GET/PUT /me/realname`（缺口 §7.1-18，真实后端需三要素核验）；mock `accounts` 增 `realName/citizenId`（苏明远、林晚已认证种子），提交即通过并发站内信；浏览器验证 新居民 未认证→非法证件号拦截→通过后脱敏展示 |
