# 聚屿社区 · 移动端开发 Wiki

> 企业代办枢纽使用服务目录与聚合游标接口，三类扩展表单/详情均已实现。目录关闭时不接收新单，旧单仍可查看和合法补件；进行中入口使用activeByService，不依赖第一页记录。补件上传带申请上下文，重提回填原申请联系人及附件，不能用账号资料覆盖。与小程序同步，规范见 [企业代办](../features/enterprise-agency.md)。

> 代码路径与开发命令默认相对 apps/client-mobile 仓；文档链接指向协作仓 docs。当前路由、模型与依赖版本以源码和锁文件为准。

> 客户主题由独立 customer-theme store 加载，支持主题变量、品牌首页模板及模块实际 DOM 排序；公版无主题时沿用原样式。主题不携带脚本，不改变业务权限和路由。开发约束与兼容要求见 [移动端主题开发规范](../features/mobile-theme.md)。

> 首页从搜索框开始，主题色用于卡片、文字、按钮等现有元素，不添加品牌宣传区。支持主按钮、搜索栏、底部导航、分区标题、链接和六类功能入口独立配色，入口通过稳定语义标识绑定主题。登录页使用 CustomerBrandLogo 展示明暗横版 Logo 和品牌口号，口号按 JSON `\n` 保留换行。入口最小高度按 88–104px 限幅，壳内内容和固定导航最大宽度 640px。已安装主题配置不进入客户端源码或 Git。

> `apps/client-mobile` 是纯移动端应用，dev 端口 7759（`/api` 代理到 7757）；桌面端 `apps/client-web` 尚未创建。
> 关联文档：[README](../README.md)、[后端契约](../backend/development.md)、[App API 契约](../backend/app-api.md)、[实体字段](../backend/entity-fields.md)。

## 1. 服务边界

- workspace 包名为 `@joinyuu/client-mobile`，禁止导入 admin 或 api 源码。
- 技术栈：Vue 3、Vite 6、Pinia 3、Vue Router 4 history 模式、TypeScript、TDesign Mobile Vue。
- `src/types/` 独立声明客户端类型，字段与 API 契约保持一致。
- 根命令：`pnpm dev`、`pnpm build`。

## 2. API 接入

- `src/api/*.ts` 是视图唯一数据入口；页面不得直接访问 `fetch` 或本地业务数据。
- 统一请求 `/api/app/**`：开发经 vite proxy 转发到 7757，生产由网关同源转发。
- 统一返回形状：成功 `{ code: 0, data }`、错误 `{ code, message }`、分页 `{ list, total }`。
- 客户端无本地 mock 数据源；开发/联调/演示一律使用真实后端与种子数据（使用专用开发/隔离数据，禁止重置日常或生产数据库）。
- 时间以设备当前时间为准，页面通过 `useBusinessNow()` 统一获取并在可见/定时刷新，不得使用固定演示时间。
- 401 由公共请求层清除会话并跳转登录；下载与上传分别走统一鉴权下载和 multipart 封装。

## 3. 应用架构

- 路由集中在 `src/router/index.ts`，全部页面位于 `src/views/mobile/`。
- `AppShell.vue` 提供首页、需求、社区、广场、我的 5 个底部 Tab（「需求」路由为 `/projects`，对应需求列表/详情/发布）。
- 登录、注册、找回密码等访客页位于壳外。
- 业务逻辑收口到 `src/composables/` 和 `src/api/`；视图只负责展示与交互。
- `components/shared/*` 保持组件库无关；全局挂载的 DevTools 也不得引入 TDesign 桶依赖。
- **站点品牌（浏览器标签页）**：图标取「系统配置 → 站点信息」的站点 logo（`GET /api/app/config` 的 `siteLogo`，空则回退内置 `/favicon.svg`），标题沿用 `documentTitleFor(route, siteName)` 的「页面 · 站点名称」。运行时实现见 `src/utils/siteBranding.ts`（图标逻辑与后台共用 `src/utils/favicon.ts`）+ `src/stores/config.ts` 的 `ensureLoaded()`：**必须接管唯一一个 `link[rel=icon]` 而不是新增**——多个候选图标时浏览器会优先选内置 SVG，上传的位图会被忽略。客户主题包的 brand logo 仍用于页面内品牌位，不参与标签页图标。

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
- **库内可交互元素的键盘通路（v51）**：TDesign 内部有若干“可点但无语义”的节点，由 `main.ts` 的 `patchKeyboardTargets()` 统一补 `role=button` + `tabindex=0` + `aria-label` + Enter/Space 激活（派发 click 冒泡到库自身处理）：
  - `CheckTag`（`.t-tag--checkable`）：全站筛选/选择 chip，补键盘通路，并把选中态同步到 `aria-pressed`（库只改 class）；
  - Navbar 左侧返回区（`.t-navbar__left`，仅存在返回箭头时）：`aria-label="返回"`；
  - Popup / Dialog 关闭键（`.t-popup__close` / `.t-dialog__close-btn`）：`aria-label="关闭"`（Dialog 的关闭处理挂在内部 SVG 上，故激活时派发到 SVG）。
  关闭键可聚焦后不参与弹层首次聚焦（`focusDialog` 会跳过关闭键）。升级 TDesign 时须复核上述内部类名。
- **库内可交互元素的键盘通路（v52，界面审查 HIGH-1 补齐）**：以下库内控件同为 `div+onClick`、无 role/tabindex/aria（tdesign MCP 与库源码确认无相关 props），已并入同一 `patchKeyboardTargets()`：
  - `Rate` 星星（`.t-rate__icon`）：`role=button` + `aria-label="打 N 分"` + `aria-pressed` 同步；激活时派发带 `pageX`（星星中心）的 click——库的点击处理按 `event.pageX` 计算命中星号，合成事件不带坐标会全部命中第 1 分；根节点 `.t-rate` 补 `role=group` 让调用方 `aria-label`（如“活动评分”）可被分组播报；
  - `Switch`（`.t-switch`）：`role=switch` + `aria-label`（取同行可见标签文案）+ `aria-checked` 同步；**已有 `role=button` 祖先的行不再补焦点**（如 NotificationSettingsView 行级 `v-pressable` 已承载交互），避免“按钮内嵌开关”双重 Tab 停留；
  - `Stepper` 加减（`.t-stepper__minus` / `.t-stepper__plus`）：`aria-label="减少/增加"`；`Search` 清除键与操作键（`.t-search__clear` / `.t-search__search-action`）：`aria-label`（操作键有可见文案时取内容）。这两类有原生输入框作键盘替代，补齐后控件本身可达；
  - 禁用态（类名以 `-disabled` 结尾）同步 `aria-disabled` 并移出 Tab 序列，恢复可用时重新入列（ MutationObserver 监听 class 变化）。升级 TDesign 时须复核上述内部类名。
- **可点整卡的两条口径**：跳转型卡片用 `router-link` 承载主体内容（真链接，支持 Ctrl/中键新标签打开），操作按钮留在链接之外避免嵌套可交互元素（参照 `MyResponsesView`/`MyDemandsView`）；行/列表项类整卡（如 `Cell`、身份卡）用 `v-pressable` 补 role/tabindex/Enter·Space。仅当元素确实不可点时传 `v-pressable="false"`。
- **标签对比度（v51）**：TDesign 标签 light 变体默认用 -5 档文字压 -1 档同色浅底（success 2.86:1 / warning 2.82:1 / danger 3.90:1，12px 下均不达 AA）；`tokens.css` 已把 `--td-tag-{success,warning,danger}-color` 抬到 -7/-7/-8 档（浅色 5.88/6.08/8.38:1，暗色 5.45/5.21/5.53:1）。`theme="default" variant="light"` 的浅色文字同样不可见，已单独改为 `--td-text-color-secondary`。新增状态标签一律走 `StateTag`，不要自带语义色。
- **主题切换冻结过渡（v51）**：`applyTheme()` 切换前给 `html` 加 `.theme-switching`、强制一次样式刷新、下一帧移除（`tokens.css` 内该类禁止全部过渡）。不冻结时全站颜色过渡会在同一帧一起起跑，主题切换出现拖影。给页面新增颜色过渡时无需额外处理。
- **内容图描边（v51）**：封面、正文配图、附件、商品图等**内容图**加 `.content-img`（`outline: 1px solid var(--image-outline)` + `outline-offset: -1px`，随圆角内收且不改变尺寸）。描边色必须用纯黑/纯白透明度（`--image-outline`，暗色自动切纯白），不得用品色近黑或品牌色。透明装饰图（企业 Logo、图形验证码）与「在已裁剪圆角容器内满铺」的图（首页轮播底图）不加。
- **图标尺寸与状态（v51）**：行内随文图标尺寸按相邻字号取 1em–1.25em（12px 正文配 12–14px 图标、14px 正文配 14px、16px 正文配 16px），因此**同一含义的图标在不同字号行里尺寸不同是正确的**，不要机械统一。图标唯一档位异常：`.meta` 元信息行统一 12px 正文 + 14px 图标。收藏/点赞这类**低频状态切换**用 `.icon-swap`（两个字形同留 DOM、叠在同一网格单元内交叉淡入 300ms `cubic-bezier(0.2, 0, 0, 1)`）；页签/选择类指示仍即时切换。
- **按压反馈（v51）**：可点整卡用 `.pressable`（`scale(0.96)` + `150ms ease-out`，按下即生效）。行/列表项用 TDesign `hover` 属性时，库通过 `pointerdown` 后 50ms 才加高亮类、`pointerup` 后 70ms 才移除，快速轻点视觉上无按下态；需要「即时」反馈的行请改用 CSS `:active`（可复用 `.pressable`），不要依赖库的定时器式高亮。
- **圆角共心（v51）**：嵌套的可见表面（外层带底色/描边且内距均匀）满足 `外圆角 = 内圆角 + 内距 + 描边宽度`；内距超 24px 或刻意不对称时按两个独立表面各用各的 token。参照 `ArticleNewView` 的 `.editor-block`（`calc(var(--td-radius-large) + var(--app-space-5) + 1px)`）。

### 排版规范（Token First）

- **唯一入口**：组件内字号/字重/行高/字体栈必须整体引用 L2 角色档 —— `font: var(--app-type-*)`（`page-title` / `section` / `card-title` / `body` / `body-relaxed` / `body-sm` / `emphasis` / `emphasis-sm` / `caption` / `numeric-lg` / `numeric` / `display`）；禁止单独声明 `font-size` / `font-weight` / `line-height` / `font-family`，禁止任何字面量。复合简写没有单独挑字号/字重的位置，杜绝「看起来差不多就选一个」。`display` 专供头像首字/企业字标/徽标这类单个字的装饰性大字，不得与 `page-title`/`section` 混用（否则改标题档会连带改变头像字号）。
- **三层结构**（`styles/tokens.css`）：L1 原始档（`--app-fs-*` / `--app-fw-*` / `--app-leading-*`，字面量唯一允许出现处，组件不得直接引用）→ L2 角色档（复合 `font:` 简写，一次锁定字号+行高+字重+字体栈）→ L3 TDesign 映射（库内 `--td-font-size-*` 原始档与 `--td-font-family` / `--td-form-label-font-size` 指向 L1；必须 `:root:root` 提特异性，库样式在路由组件里懒加载、晚于 tokens.css 注入）。headline/display 档未映射（仅 typography 文档组件使用，未接入本 App）。
- **12px 档**：`--app-type-caption` 用于标签/角标/元信息（时间、计数、提示、表单 field-help）。TDesign 小标签、TabBar 标签、角标计数已由 L3 从 10px 抬到 12px（行高沿用库值，盒子高度不变）。
- **强制校验**：`scripts/check-typography.mjs`（挂在 `npm run lint`）。2026-09-25 完成全量迁移（87 个文件 / 610 处声明，基线清空，`typography-allowlist.txt` 已删除）；此后任何非角色档声明都会直接拦截。确需破例在声明行（或紧邻上一行）写 `/* typography-token-exempt: 原因 */`，原因里写明升级复核点。
- **例外**：`font-variant-numeric: tabular-nums`（数值等宽，须写在 `font:` 之后）与 TDesign 通过 props（`size` / `theme`）表达的尺寸，不算重写。
- **迁移期的两处有意外观变化（已确认）**：18px 卡片条目标题统一收到 16px；14px 元信息统一收到 12px。22px 的头像首字/字标归入 `display` 档（18px）。

## 6. 主要页面

- 我的数据卡片：所有用户展示可用积分；仅社区个体展示个人等级及经验值，并显式按 `community_individual` 请求等级。参与区只展示数量大于 0 的项目、需求、响应、报名、投稿与兑换记录，数量为历史累计，不代表待办；没有参与记录时收起该区。卡片不展示累计积分收支或独立签到数；完整统计保留在数据看板。加载与失败须可区分，下拉刷新同时更新卡片数据。

- 首页：搜索入口、轮播、身份个性化功能入口、发布需求、公告、近期活动、最新需求/资讯（轮播为搜索栏下方首个运营位；新手任务引导已于 2026-10-16 移除）。
- 需求（`/projects`）：类型选项卡 + 搜索 + 发布入口（悬浮 FAB）、需求详情、响应与发布者选定承接方。响应需审核（`demand.respondNeedReview=true`）时，成员提交后先落 `pending_review`（待审核：发布者暂不可见、不计入「N 人响应」、不发积分、不通知发布者），管理员审核通过后才对发布者可见并由其选定承接方；驳回则记录失效、响应者可重新响应。审核结果在「我的响应」查看，响应积分审核通过后才到账；需求关闭该开关时提交即「待选定」（等待发布者选定承接方）。详情页「响应需求」默认仅展示一行提示与「响应需求」按钮，点击后在卡片内展开表单（标题右侧出现「收起」文字按钮，收起即重置为按钮态）；响应表单在「响应说明 + 响应身份」基础上新增报价/预算、可投入时间/预计工期、相关经验与案例、联系手机、联系邮箱（均选填，手机/邮箱留空时服务端沿用账号手机号/邮箱；邮箱也可在响应表单中覆盖提交），发布者在响应列表可查看这些次要信息（响应人展示统一口径 **`真实姓名（身份 · 昵称）`**，账号字段由服务端下发 `responderRealName/responderNickname`，**客户端一律不展示用户 ID**，避免同名/同昵称响应者混淆）；管理员在「响应审核」通过时可勾选「向需求方显示」的字段，未勾选的字段对发布者不可见（响应者本人「我的响应」不受影响）。**发布者已选定承接方（`selected`）时，除「等待社区管理员确认立项」提示（与上方响应卡片保持 12px 间距，`DemandOwnerResponses.vue` 的 `.notice` `margin-top: var(--app-space-5)`）外，还提供纠正路径：可重新选定承接方（多选预勾选上一次的已选条目，保存即覆盖）或「撤销选定」（回到「已发布」，已选定响应回退「待选定」，均二次确认）。需求已立项（`projected`）时发布者看到「协作项目已生成」/「协作项目已结项，该需求已完成」（按服务端下发的 `projectStatus` 派生，`DemandDetailView.vue` 的 `.notice.done` 与上方响应卡片保持 12px 间距，同 `--app-space-5` 档）并提供「查看协作项目」入口。**
- 社区：政策、人才库、企业库、公开名片。
- 广场：活动与文章。
- 我的：分组布局（资料卡 + 积分/等级资产卡固定在前，其后按用途分区）——① 身份与名片（关联身份、我的名片〔个人名片含「公开名片」开关〕、交易订单、工位租约；无社区个体身份时显示「人才登记」）；② 项目与需求（我的项目、我的需求〔进行中/历史记录选项卡〕、我的响应〔待选定/待审核 `pending_review`/已选定/**已承接 `undertaken`**/已结束 `closed`/已驳回等状态标签：待选定与待审核**且需求仍为「已发布」时**可撤回（需求已进入立项流程时服务端拒绝撤回，客户端同口径隐藏入口，避免点击必然失败），已驳回展示驳回原因且可重新响应；**已承接条目提供「查看我的项目」入口**（服务端随响应下发 `projectId`，未立项时省略）；**需求已进入终态（关闭/驳回/撤回）时，其下仍为「待选定/已对接」的响应按「已结束」派生展示**（服务端下发 `demandStatus`，避免需求已结束却提示仍在推进）〕）；③ 申请与预约（申请记录、企业代办、活动报名、空间预约〔随 `reservationOpen` 隐藏〕）；④ 内容与足迹（提交留言 `/me/messages`：提交留言 + 查看社区回复、投稿记录、收藏内容、浏览历史）；页尾为设置菜单（账号与安全、通知设置、数据看板、深色模式、关于、退出登录）。资料页用户名 90 天限改一次（冷却期展示可修改日期并禁用输入）；站内信由「我的」页头铃铛承载（含未读角标）不再占用宫格；原「我的记录」收纳页入口已移除（内容由上述分区覆盖，页面保留兼容深链）；原独立「设置」页（`/me/settings`）已移除，菜单迁入「我的」页尾（「编辑资料」由顶部资料卡承载）；积分页在「积分规则」旁提供「交易订单」入口。**交易订单（`/me/trade-orders`）合并原「我的订单」「现金交易」两个入口**：顶层页签「现金交易 / 兑换订单」分别承载原两页（子视图懒挂载、`v-show` 保留状态），页签同步 URL `?tab=cash|orders`；`/me/orders`、`/me/transactions` 重定向到对应页签，订单/交易详情与退款等深链不变。**`/me` 本身游客可访问（对齐小程序）**：未登录时资料卡即「登录或注册」入口（点击跳 `/login?redirect=/me`），数据卡与退出登录隐藏，页头铃铛隐藏；宫格照常展示，受保护入口点击跳登录并带回跳，公开入口（人才登记/企业合作/入驻说明/身份指引/关于）直接可进；游客态不发起任何鉴权请求（避免 401 触发全局跳登录），其余 `/me/**` 二级页仍需登录。
- 二级闭环：项目里程碑交付验收、活动签到（含电子票）/反馈、商城履约（**商品卡片无封面时不显示占位图标**，只展示类别/名称/积分）、动态申请表单、企业成员与邀请、企业合作（整卡选择）。**活动签到页（`/events/:id/check-in`）随活动开关联动**：无位置校验时按钮显示「签到」，位置校验开启才显示「获取定位并签到」；「签到校验码」启用时须输入 6 位签到码（扫描后台生成的「签到二维码」经 `?code=` 自动预填，未登录先要求登录），码错误签到失败（400），**同一用户同一活动连续输错第 4 次起必须输入图形验证码**（428，沿用登录验证码组件），验证码正确+码正确方签到成功；**签到成功页**展示活动标题、开始/结束时间、「您是第 N 位签到」（服务端按已签到总数计序）、「积分 +xx 已到账」。**「我的项目」（`/me/projects`）按「我承接的 / 我发起的」分标签页**（`Tabs` 以 `:list` 驱动导航 + 单一内容槽，标签带数量；归属由服务端下发的 `isInitiator`/`isUndertaker` 判定，同一项目可同时属于两侧；**标签页与列表/空态之间留出 16px 间距**）：「我承接的」= 我（或我负责的企业）作为承接方参与的项目；「我发起的」= 我的需求立项生成的项目，或社区自建项目里需求方选了我 / 我负责的企业。**甲方可在「我发起的」列表卡片上直接验收**——含「待验收」节点的卡片显示「去验收（N）」，底部面板（`Popup`）内逐个节点「验收通过」（二次确认）/「退回修改」（原因必填、行内报错），并附「查看项目详情与交付证据」入口；操作行置于整卡 `router-link` 之外（避免在 `<a>` 内嵌套交互元素），行级互斥 + loading 防重复提交；两个标签页空态各自给出口（发布需求 / 浏览需求）。
- 身份说明（`/me/identity-guide`）：无鉴权需求（游客可看）。入口为「我的 → 关联身份」页底部「身份说明」按钮；内容为四种身份（个人用户 / 社区个体 / 社区企业 / 合作企业）的「获取方式 / 限制 / 权益」对照——个人用户列基础权益（发布需求、公开需求响应、文章投稿、积分商城、公开空间预约、公开活动报名），其余三种身份列「在基础权益之上新增」的专属权益（等级系统、专属名片、专属需求响应、专属活动、专属空间预约、以该身份投稿；社区企业另含企业成员管理）。页尾三条口径说明（身份可叠加、等级与经验值、何谓「专属」）与三个申请入口（人才登记 `/intros/talent`、企业入驻 `/intros/settle`、合作伙伴 `/intros/enterprise`），引导用户成为社区个体 / 社区企业 / 合作企业。页面结构：主张卡（标题 + 一账号多身份说明 + 「基础 · 个人用户 → 进阶 · 社区个体 / 社区企业 / 合作企业」路径）→ 四张身份卡（头挂 `IdentityTag` + 描边口径标签「默认身份 · 注册即得」/「基础权益 + N 项新增」；获取方式、限制；分隔线后按**权益类别分组**列标签，类别名固定列宽对齐成对照表；进阶卡带申请入口 CTA）→ 口径说明卡。**权益标签按类别着色**（取 TDesign Tag light 语义主题槽，同一类别在四张卡同色，便于横向对比新增项）：需求撮合=primary、成长与积分=success、名片与团队=warning、活动与空间=danger、内容投稿=default；其中「需求撮合」在页内覆盖 `--td-tag-primary-*` 为主题主色阶（`--td-brand-color-6`/`-1`，深色模式换 `-9`）——标签品牌槽跟随主题「强调色」，强调色可能落在橙/绿/红上与语义类别撞色。
- 微信一键登录（网站应用扫码，网站应用独立开关开启且配置齐全时显示；与小程序一键登录开关互不影响）：登录页第一屏在「下一步」下方提供「微信一键登录」；点击向后端取授权页地址（appid/回调域在服务端配置）并整页跳转微信扫码；授权后回到 `/login?code=…&state=…`，登录页消费 `code` 登录（已绑定直接进站；未绑定进入微信绑定视图，按「手机号验证 / 邮箱验证 / 账号密码」三选一验证并绑定，验证码可登录或注册、密码只绑定已有账号），无论成败都先清掉 URL 上的 code/state。绑定接口与小程序一键登录共用 `/auth/wechat-mini/bind`。
- 登录 / 注册（`/login`，壳外独立页）：**统一入口两屏**——第一屏只输入手机号/邮箱/用户名 + 「下一步」（提示「未注册的手机号/邮箱，验证后将为你创建新账号；用户名仅支持密码登录」）；第二屏按标识形态给出登录方式：手机号/邮箱默认**密码登录**（省短信/邮件开销，「忘记密码？」在密码字段标签行右侧），密码框下方给「使用验证码登录」；验证码屏（协议勾选 + 60s 倒计时 + 「登录 / 注册」）校验通过后由服务端判定「登录」或「建号」（自动建号提示「注册成功，欢迎加入聚屿社区」），可切回密码登录。**用户名路径只能用密码登录**，且服务端对存在与否返回同一句「账号或密码错误」（防用户名枚举）。通道降级：单缺时隐藏对应验证码入口并提示改用另一渠道；双缺时提示改用密码登录并给「用户名注册」兜底入口；`registrationOpen=false` 时验证码屏加一条 NoticeBar（老用户仍可验证码登录）。页面标题与标签页标题统一为「登录或注册」。
- 注册（`/register`，壳外独立页，**兜底页**）：仅「用户名 + 密码 + 确认密码 + 协议勾选」，无验证码渠道——短信/邮箱通道可用时注册统一由登录页的验证码流程自动建号，本页只在**两种通道都不可用**时从登录页给出入口（页面直连仍可访问）。页内明示「用户名注册不支持验证码登录，也无法自助找回密码」（该渠道不产生可信通知渠道）。
- 账号与安全（`/me/security`）：修改/设置登录密码、绑定或更换手机号/邮箱、实名认证或身份信息登记、找回密码说明、个人数据导出、账号注销与冷静期撤回。**密码入口按 `hasPassword` 分两态**：已设置密码显示「修改登录密码」（须原密码）；「未设置密码」账号（验证码登录自动建号）显示「**设置登录密码**」，弹窗隐藏原密码字段、免验证码（服务端同口径放行），保存后与改密一致强制重新登录。

页面与精确路由以 src/router/index.ts 和 src/views/mobile 为准。

## 7. 验证

移动端改动至少执行：

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm build
```

运行时问题再使用浏览器检查（本地 dev 7759 + 后端 7757）；HTTP 业务状态机以 API e2e 为主。涉及首页/下拉刷新/选项卡等交互改动时，建议在移动视口下实测滚动与触摸行为再提交。


## 企业代办（移动 Web 专属）

本期企业代办只在移动 Web 提供，**不移植微信小程序**（用户明确要求的双向同步例外）；小程序端不要新增对应入口或页面。

- `/me/enterprise-agency`：企业代办 hub（企业注册可办，财税/工商变更/资质许可筹备中）+ 我的办理记录。
- `/me/enterprise-agency/registration`：企业注册四步表单，`?revise=<id>` 修改重提。
- `/me/enterprise-agency/registration/:id`：状态、时间线、资料与私有附件预览；待处理可撤回，待补充/驳回/撤回可重提。
- 入口：「我的」页「申请与预约」；`/intros/enterprise`；`/intros/talent`。
- 附件必须走 `/api/app/enterprise-agency/registration/uploads` 私有接口，禁止复用 `/api/app/uploads` 的公开 URL。表单回填与详情预览通过鉴权 Blob + 临时 objectURL。
- 身份证号在客户端按 GB 11643 校验，股东比例合计必须 100%；服务端为最终权威。
- 状态与字段规范见 [企业代办](../features/enterprise-agency.md)。


## 交易订单

「我的 → 交易订单」（`/me/trade-orders`）统一承载现金交易与积分兑换订单：顶层页签「现金交易 / 兑换订单」，`?tab=` 同步页签；`/me/orders`、`/me/transactions` 重定向到对应页签，订单详情（`/me/orders/:id`）、交易详情（`/me/transactions/:orderId`）、退款与待缴账单等深链不变。现金部分包含确认订单、收银台、支付结果、交易列表与退款页面；API 对接 src/api/commerce.ts。支付方式由服务端 capabilities 与环境共同决定，成功以服务端查单/通知为准。状态与上线边界见 [交易与支付](../features/commerce.md)。
