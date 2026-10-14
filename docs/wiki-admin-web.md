# 聚屿社区 · 管理后台 Web — 开发 Wiki

> 系统配置新增独立「许可证管理」栏目，查看三态授权、生成申请、导入/续期，操作独立于「保存配置」。未授权/到期时系统配置表单禁用，许可证栏目保留。状态通过 `StatusTag entity="license"` 渲染。完整流程见 [许可证管理](./license-management.md)。

> 本文档沉淀管理后台（admin web）开发的细致描述与全部工程契约，是所有页面/子代理的唯一视觉与结构依据。
> 冻结后不得私自发明颜色、字号、圆角、间距；不得重写导航。
> 技术栈由用户指定：Vue 3 + Vite + TypeScript + TDesign Vue Next + Pinia + Vue Router。`src/api/` 全部文件接入真实 HTTP，无本地 mock 数据源；后台治理增强、举报与申诉、社区政策、轮播图管理、协议与政策及发布限制面板均纳入 RBAC、持久错误态和列表查询状态约定。

> 治理要点：举报列表按服务端 `canRestore` 显示恢复入口；待处理举报不提供恢复选项。恢复只针对该举报自己的下架/冻结且未被后续处置覆盖，一次生效；独立处置及缺少来源的历史记录通过原业务管理入口人工复核。个人名片列表支持展示姓名检索，部分隐私开关保存保留未提交项。实名认证取消后台人工复核，保留注销工单治理；文章后台/举报下架统一进入「已关闭」（`closed`，可归档、可从原举报恢复），成员主动撤回投稿仍为 `withdrawn`；文章详情抽屉展示每次下架记录与原因；文章编辑含「评论功能」开关（默认开启）；申请表单配置、注销工单归入系统管理；积分/经验发放记录入口位于对应规则页右上角。

## 1. Style Tier & Aesthetic Direction

> 社区成员组保留 `/member-governance` 注销治理，使用独立权限码和 members 数据范围。名片不再有独立页面（`/card-management` 已下线）：个人/企业名片的查看与编辑分别并入**用户详情**与**企业详情**的「名片」标签页（「编辑名片」→ `IndividualCardDialog` / `EnterpriseCardDialog`）；**企业名片的「企业 Logo」为直传图片**（ImageUploadField → 素材库 `bizType=enterprise-logo`，回填 URL 后保存，不再手填地址）；用户可编辑字段白名单迁至**系统配置 > 名片可编辑字段**（随该页「保存配置」一并提交）；注销冷静期内禁用确认执行，复核弹窗必填说明。

- style: **business-international**（管理后台 / SaaS / 高信息密度 / 整齐网格）
- aesthetic: **industrial-utilitarian，冷静克制**——贴近 TDesign 默认规范，靠间距/层级/状态色取胜，不做花哨装饰
- tone keywords: 高效、克制、信息密度高、商务可信
- 品牌意象：**"聚屿"= 群岛聚合**。登录页左侧品牌区使用深海渐变 + 群岛剪影圆弧（纯 CSS），后台内部保持中性专业，仅在 Logo 与工作台点缀青蓝品牌色

## 2. Design Tokens

- TDesign 提供长期维护的 MCP 工具：tdesign-mcp-server，TDesign MCP 目前内置了四个 tools，分别是 get-component-docs、get-component-list、get-component-changelog 和 get-component-dom，用于辅助解决使用 TDesign 过程中的各种实际需求，包括但不限于辅助代码生成、解决 API 使用问题、升级组件库版本和辅助代码迁移等场景。
- 色彩：**全盘采用 TDesign 默认主题**（brand `#0052D9`），不自造色板。语义色走 TDesign token：
  - 成功/正常 `--td-success-color`、警示/待处理 `--td-warning-color`、危险/冻结/驳回 `--td-error-color`
  - 文本 `--td-text-color-primary / secondary`；边框 `--td-component-border`；页面底 `--td-bg-color-page`、容器底 `--td-bg-color-container`
- 字体：TDesign 默认系统栈（PingFang SC / Microsoft YaHei / system-ui）。标题层级靠字重与 14/16/20px 尺寸对比，不引入外部字体
- 尺寸：正文 14px（`--td-font-size-body-medium`），小字 12px，页头标题 20px（`--td-font-size-title-large`）
- 圆角：TDesign 组件默认（`--td-radius-medium 6px`）；卡片用 t-card 默认
- 间距：4px 基数（8/12/16/20/24），页面内容区统一 `padding: 16px 20px`
- 阴影：仅用 TDesign 卡片默认阴影，不自造
- 图标：**单一图标库 `tdesign-icons-vue-next`**，PascalCase 组件式引入（如 `CheckCircleIcon`），尺寸跟随组件默认，颜色 `currentColor`，**禁止 emoji 当图标**

## 3. 布局骨架（App Shell — 全项目唯一，禁止重写）

```
.admin-shell            grid: [auto 1fr]，height: 100vh
├── .side-col           侧栏列（Logo 区 + t-menu + 底部操作区：全部展开/折叠 + 收起菜单）
└── .main-col           flex column，height: 100vh，overflow hidden
    ├── .top-bar        高 48px：左侧「全部关闭」按钮 + 多标签页横向滚动区（tabs store 驱动，
    │                   点击切换、可关闭，"工作台"常驻不可关）；右侧 主题切换 / 通知铃铛(t-badge) /
    │                   管理员头像 t-dropdown（修改密码 · 退出登录）
    └── .page-scroll    flex:1，overflow-y:auto，padding 16px 20px，底色 --td-bg-color-page
                          └── <router-view />（页面只写这里面的内容）
```

- **无独立面包屑**：顶栏不再渲染面包屑，标签页即导航；详情页统一提供「返回」按钮（`router.back()`）
- **「全部关闭」= 关闭其他（tabs store `closeOthers`）**：保留工作台与当前页标签；仅一个标签时按钮禁用；点击后停留在当前页，不跳转
- **标签栏滚轮**：标签溢出时，鼠标滚轮转换为水平滚动；未溢出时保留页面纵向滚动；标签栏滚动条视觉隐藏
- **暗色模式（R10）**：顶栏月亮/太阳按钮切换 `light/dark`，`stores/theme.ts` 持久化到 localStorage（`joinyuu_theme`），切换即设置/移除 `<html theme-mode="dark">`；启动时 `main.ts` 立即应用持久化主题；tokens.css 同步覆盖 wangEditor 暗色变量

- 菜单：**唯一 `src/layouts/AdminLayout.vue`** 渲染；路由全部挂在其 children 下；页面组件**禁止**再写任何导航/侧栏/顶栏
- 激活态唯一机制：`t-menu :value` 绑定"当前路由归一化路径"（详情路由归一到列表路由，如 `/users/U1001 → /users`、`/workstations/leases/LS2001 → /workstations/leases`、`/assets/library → /assets/library`；`/demands/review`、`/spaces/reservations` 等列表子页平级保留）
- 侧栏菜单（冻结，顺序不可变）：

| 分组 | 菜单项 | 路由 | 图标（已验证存在） |
|---|---|---|---|
| — | 工作台 | /dashboard | `DashboardIcon` |
| — | 用户留言 | /user-messages | `ChatIcon` |
| 社区成员 | 用户管理 | /users | `UserListIcon` |
| 社区成员 | 社区个体 | /individuals | `UserIcon` |
| 社区成员 | 社区企业 | /enterprises | `BuildingIcon` |
| 社区成员 | 合作企业 | /external-enterprises | `Building1Icon` |
| 社区成员 | 申请审核 | /approvals | `CheckCircleIcon` |
| 业务运营 | 需求管理 | /demands | `ViewListIcon` |
| 业务运营 | 需求审核 | /demands/review | `CheckCircleIcon` |
| 业务运营 | 项目管理 | /projects | `AppIcon` |
| 业务运营 | 活动管理 | /events | `CalendarIcon` |
| 业务运营 | 活动报名 | /events/enrollments | `CheckCircleIcon` |
| 空间管理 | 办公位管理 | /workstations | `ViewModuleIcon` |
| 空间管理 | 办公室管理 | /workstations/offices | `BuildingIcon` |
| 空间管理 | 租赁管理 | /workstations/leases | `ViewListIcon` |
| 空间管理 | 公共空间管理 | /spaces | `MapIcon` |
| 空间管理 | 公共空间预约 | /spaces/reservations | `CalendarIcon` |
| 内容管理 | 资讯发布 | /contents/publish | `Edit2Icon` |
| 内容管理 | 投稿内容 | /contents/submissions | `ViewListIcon` |
| 内容管理 | 栏目管理 | /contents/columns | `ViewModuleIcon` |
| 内容管理 | 阅读统计 | /contents/stats | `AppIcon` |
| 内容管理 | 社区政策 | /contents/policies | `ViewListIcon` |
| 内容管理 | 轮播图管理 | /contents/banners | `ViewModuleIcon` |
| 内容管理 | 公告栏 | /contents/announcements | `NotificationIcon` |
| 积分商城 | 商品管理 | /mall/goods | `CartIcon` |
| 积分商城 | 订单管理 | /mall/orders | `ViewListIcon` |
| 规则管理 | 积分规则 | /rules/points | `Edit2Icon` |
| 规则管理 | 经验值规则 | /rules/experience | `ViewListIcon` |
| 规则管理 | 等级规则 | /rules/levels | `ViewModuleIcon` |
| 规则管理 | 个人用户规则 | /rules/publishing-limits | `SettingIcon` |
| 系统管理 | 申请表单配置 | /system/application-form-config | `CheckCircleIcon` |
| 系统管理 | 注销工单 | /system/deletion-requests | `CheckCircleIcon` |
| 系统管理 | 系统配置 | /system/config | `SettingIcon` |
| 系统管理 | 日志与审计 | /system/logs | `ViewListIcon` |
| 系统管理 | 角色与账号 | /system/account | `UserListIcon` |
| 系统管理 | 素材库 | /assets/library | `ViewModuleIcon` |
| 系统管理 | 系统监控 | /system/monitor | `DashboardIcon` |
| 系统管理 | 归档管理 | /system/trash | `Edit2Icon` |

- **菜单渲染受 RBAC 约束（R1）**：除工作台外的每个菜单项挂 `v-permission="'<code>'"`，分组以 `canSee(codes)` 判定「至少一个可见菜单项才渲染」；菜单 code 即路由路径（如 `/users`），按钮级权限用 `perm:<域>:<动作>`（企业/合作企业的 create/update/disable/enable/delete 共 10 个）；`v-permission`/`meta.perm`/`hasPerm` 均支持 `string | string[]`（any-of，聚合页按多权限码渲染）
- 菜单顺序（内容管理二级扩为 6 项）：工作台 → 社区成员 → 业务运营 → 空间管理 → 内容管理 → 积分商城 → 规则管理 → 系统管理；**默认折叠**积分商城/规则管理/系统管理三组（expandedMenus 受控初始值，"全部展开/全部折叠"按钮切换）；**跳转自动展开**：路由 meta.group 变化时（含刷新直达/通知跳转/标签切换）自动展开页面所属分组，仅追加不收起其他组（GROUP_KEY_BY_META 映射，immediate，注意 group-points 的 meta 值为「积分管理」而菜单标题为「积分商城」）
- 内容管理为一级菜单：资讯发布（/contents/publish，官方文章）+ 投稿内容（/contents/submissions，用户投稿审核）+ 栏目管理（/contents/columns）+ 阅读统计（/contents/stats）+ 社区政策（/contents/policies）+ 轮播图管理（/contents/banners）+ 公告栏（/contents/announcements）；社区政策独立维护服务内容、附件、精选与发布状态，轮播图管理维护客户端首页轮播并含总开关。
- 系统管理为一级菜单：系统配置 + 日志与审计 + 角色与账号 + 素材库 + 系统监控 + 归档管理（菜单聚合：原「审计日志/登录日志/角色权限/管理员账号/在线会话」5 项合并为 2 个选项卡聚合页，子页不再独立路由）；「日志与审计」= 操作日志（原「审计日志」更名）+ 登录日志，「角色与账号」= 管理员账号 + 角色权限 + 在线会话，tab 与 `?tab=` 双向同步且旧路径（/logs/audit、/logs/login、/system/roles、/system/admins、/system/sessions）重定向对应 tab；原「回收站」升级为「归档管理」；通知中心为顶栏铃铛（NotificationIcon + t-badge 未读数，点击跳转关联页面）；六域待办卡片并入工作台顶部
- 规则管理为一级菜单：积分规则（右上角进入积分发放记录）+ 经验值规则（右上角进入经验值发放记录）+ 等级规则 + 发布限制；两个记录页保留路由，但不占侧栏菜单入口。
- 积分商城为一级菜单：/mall 重定向至 /mall/goods，商品/订单两个二级页面直接以面板组件作为路由页面（各含 PageHeader）
- 空间管理为一级菜单：办公位管理=开放/半开放办公位平面图（独立办公室移出）、办公室管理=独立办公室卡片视图（占用企业+租期+租金）、租赁管理=租约列表+详情页；公共空间管理=空间列表+详情页（预约日历），公共空间预约=预约审核面板

## 4. 组件规范（统一词汇表 — 所有页面仅从此取用）

- 页面骨架：`PageHeader`（共享组件：title + description + #actions 插槽）→ 筛选区（`.page-filter-bar` 包裹，`t-form layout="inline"` 或直接内联控件；下拉筛选项用 t-select 原生 `label` prop 标识用途：身份/状态/行业等，非 placeholder）→ 内容卡片（t-card 或裸表格区）
  - **窄屏行为**：`.page-header` 允许换行（`flex-wrap: wrap`），标题块 `.page-header-main` 有 `min-width: 260px`，操作区 `.page-header-actions` 换行后仍贴右（`margin-left: auto`）。窗口收窄或内容区被侧栏挤窄时，操作按钮整行落到标题下方，**不会把标题压成逐字竖排**；宽屏保持标题左 / 操作右同行。
  - **日期列宽度**：表格单元格左右内距各 16px，故可用文字宽度 = 声明宽度 − 32px。实测 14px 下单个时间戳 `YYYY-MM-DD HH:mm` 渲染宽 118px、日期区间 `A ~ B` 为 174px，因此**日期列不得低于 170px、区间列不得低于 220px**（150px 会折行或被裁掉末位）。
- 表格：`t-table`（row-key="id"，loading，pagination 分页）；自定义列一律用 column 的 `cell: 'slotName'` + `<template #slotName="{ row }">`
- 表单：`t-form / t-form-item / t-input / t-select / t-date-picker / t-textarea / t-radio-group`
- 反馈：`t-dialog`（确认/审核意见）、`t-drawer`（右侧详情抽屉，size="480px~560px"）、`t-popconfirm`（轻量危险确认）、`MessagePlugin.success/error`（操作结果）
- 展示：`t-tag`（variant="light"）、`t-descriptions`(:column="2")、`t-tabs + t-tab-panel`、`t-timeline`（审核记录）、`t-steps`（进度节点）、`t-progress`（进度条）、`t-avatar`、`t-empty`（空态）、`t-skeleton`（加载）、`t-statistic`（统计数值——共享 `StatCard` 组件内部基于 t-statistic 封装，props 保持 label/value/icon）、`t-list + t-list-item`（弹窗内简易列表，如区域规划）
- 加载状态（组件标准化约定；存量清理完成）：表格用 `:loading` prop；卡片网格等非表格区域一律用 `<t-loading :loading="...">` 组件包裹——**禁止使用 TDesign Loading 指令（directive）的运行时不生效用法**（TDesign `app.use(TDesign)` 会跳过 loading 指令注册，Element Plus 风格写法运行时静默失效不报编译错；原 DashboardView/AssetLibrary/MonitorPanel/两处打印页共 5 处存量已统一改为 `<t-loading>` 包裹）；StatCard 等自定义组件优先以 TDesign 组件为内核实现
- 状态标签：**必须**用共享 `StatusTag` 组件 + `constants/status.ts` 的状态映射，禁止页面自造状态文案/配色；`StatusTag` 支持 `scheduledAt`（scheduled 状态直接显示定时发布时间 + hover「到点自动发布」，不再显示"定时发布中"文案）与 `enrollmentOpen`（event=published 时拼接 报名中/暂停报名）
- 身份标签：**必须**用共享 `IdentityTags` 组件 + `constants/identity.ts` 的身份词汇表（`identityTypeMap` / `roleLabelMap` / `userCategoryOptions`），禁止页面自造身份文案
- **共享组件**：`RichEditor`（wangEditor v5 富文本，v-model=HTML，图片走 `uploadAsset`，对外 API 同旧 textarea 封装）、`TrendChart`（零依赖纯 SVG 折线/渐变面积/悬浮十字线，供工作台 30 日趋势）、`ColumnController`（列显隐+顺序调整，localStorage `joinyuu_cols_<storageKey>` 持久化，ESC 关闭）、`BulkArchiveDialog`（一键归档：复选框列出可归档状态，默认全选后二次确认）、`ArticleReviewDialog`（待审核投稿通过/驳回必填原因，readonly 复用于详情）、`ArticleScheduleDialog`（文章定时发布）、`EnterpriseFormDialog`（社区企业新增/编辑，关联用户必填并自动填充联系人）、`ExternalEnterpriseFormDialog`（合作企业新增/编辑）
- **新增用户组件**：`UserFormDialog` 使用统一 880px 表单对话框；新增用户后服务端生成 UID、0 积分和默认个人用户身份，列表自动按新 UID 筛选
- **按钮级权限（R1）**：`v-permission="'<code>'"` 指令（`src/directives/permission.ts`）采用 **display 方案**——无权限时 `el.style.display = 'none'`（不删 DOM），`mounted` + `updated` 双钩子判定，权限集合变化可恢复；路由守卫按 `meta.perm` 优先、否则逐级回退推导（`/users/U1001 → /users`）校验，失败落地 `/403`（ForbiddenView）
- **菜单组显隐必须用目录真实权限码（修复）**：AdminLayout 各分组的 `canSee([...codes], group)` 曾在系统管理组误用聚合路由路径 `/system/logs`、`/system/account`（权限目录中不存在，目录码为 `/logs/audit`、`/logs/login`、`/system/roles`、`/system/admins`、`/system/sessions`），导致仅持有聚合前旧码的角色（如 auditor）整组菜单不可见；已改为目录真实码全集。新增聚合菜单时组级 canSee、子项 v-permission、路由 meta.perm 三处必须同源对齐
- **ID 展示规范（全站统一）**：用户/企业等实体 ID 一律用 `t-tag` 标签展示——列表名称下方独立成行用 `.id-tag-block`（tokens.css 全局类），名称/字段同行内联用 `.id-tag`；名称已包含在标签内时用 `名称 [ID]` 格式（如 `IdentityTags` 社区企业标签、打印页、导出 CSV：`张三 [U1001]`/`聚屿科技 [E2001]`）；同一视图不重复展示同一 ID（如用户详情头部已有「用户ID」行时，IdentityTags 传 `:show-id="false"`）
- **全站交互减法**：列表页**不设刷新按钮**（路由切换/操作成功后自动 `load()`）与**表格批量选择操作**（`row-select` 已全站移除）；批量场景统一改用「一键归档」+ `BulkArchiveDialog`；表格 `table-layout="fixed"`（resizable 必须 fixed，列宽显式声明）
- **列表 URL 状态与错误恢复**：`src/utils/listQuery.ts` 统一服务端列表的 URL 查询状态（25 页接入；聚合页用 `audit.*` / `login.*` / `admins.*` 命名空间隔离并保留父级 `tab`；需求 `publisher` 深链别名兼容）——查询/重置/翻页/排序实际加载时同步 URL（输入关键词不触发）、computed 前端筛选列表用 live 模式实时同步、setup 恢复不重复首载、前进后退与外部 query 变化可恢复、分页正整数校验（pageSize 上限 100，非法回退默认）；只读列表（积分发放/阅读统计）保持固定 URL，不造无业务意义的参数。`src/components/ListErrorState.vue` 统一持久错误恢复（TDesign Alert + 错误原因 + 重试按钮 + 加载中禁用），36 个加载入口（含通知列表与监控执行日志）全部接入；契约由 `apps/admin/test/listQuery.test.mjs` 与 `uiContracts.test.mjs` 固化（Node test 运行）
- **术语统一**：联系电话 / 办公位 / 社区企业 / 合作企业 / 经验值 / 审核 / 新增 / 归档；禁止再出现 联系方式 / 工位 / 外部企业 / 审批 / 新建 / 回收站 等旧词
- 用户模型与微信登录预备（冻结；实名调整）：**UserStatus 仅剩 active/frozen**（待激活 pending 移除，种子样例已转 active）；字段改名 **`id`→`uid`、`name`→`nickname`**（昵称语义，微信登录预备；全站 User 引用同步：fetchUserOptions/fetchPublisherOptions/fetchRenterOptions 返回结构、 undertaker 立项候选、用户详情路由传参等；**业务快照字段名不改**——demand.publisherName、spaceReservation.userName、project.undertakers[].name、external 成员 name 等仍是展示快照，仅取值源改 nickname）；实名信息使用 `realName?`/`citizenId?`/`verifiedAt?`，`wechatOpenid?`/`wechatUnionid?`/`wechatVerified?` 为微信登录预留，另有 `frozenUntil?`/`frozenReason?`（解冻时清除）；**实名状态 = 派生值**（realName 与 citizenId 均填写=已实名，否则未实名），`verifiedAt` 仅记录通过规则校验的时间，不设审核状态列；**社区个体（community_individual）身份要求已实名**——不存在未实名的社区个体，种子数据保证（未实名用户仅持有 individual 基础身份）

- 用户身份模型（冻结）：`identities: UserIdentity[]`，一人多身份——`individual` 个人用户（注册默认身份，人手一份，关联其他身份时保留，积分挂靠此身份）、`community_individual` 社区个体（至多一个，持有经验等级）、`community_enterprise` 社区企业（可多个，关联入驻企业，持有经验等级）、`external_enterprise` 合作企业（可多个，自由填写）；身份标签配色：社区身份=品牌蓝 light、个人用户/合作企业=灰（合作企业 outline）；「个人用户」快捷筛选 = 仅持有基础个人身份的用户
- 经验与积分（冻结）：经验等级 1-5 级，仅社区个体/社区企业身份拥有，通过参加活动、承接项目累积升级；积分仅挂靠个人用户身份（人人可有），获取途径同前，可在积分商城兑换礼品/权益
- 需求提交与审核（冻结）：任何注册并填写手机号的用户均可提交需求；多身份用户提交时选择所用身份（`publisherIdentity` 快照）；需求状态流 = **待审核 →（审核通过）→ 待发布 →（立即发布 / 定时发布）→ 已发布 / 定时发布中 →（到点自动）→ 已发布**，另有 已驳回（审核驳回必填原因）/ 已关闭 / 已发布→立项→已立项（承接）分支（**草稿状态已移除**：创建表单无存草稿，历史草稿编辑/完成并发布流程一并移除）；**审核为只读（占位）**（不允许编辑任何项，对话框底部按钮从左到右=取消/驳回/通过，取消=关闭不做动作，通过=转待发布，驳回=必填原因）；**待发布**可操作=编辑（任意项，按钮「保存」，不改状态）/立即发布/定时发布（对话框设置时间，按钮=取消/定时发布）/关闭；**定时发布中**仅可操作=取消定时发布（转回待发布），状态标签直接显示定时发布时间；**已发布**可操作=**立项**（多选承接方与占比/里程碑，立项后转已立项）/ **撤回发布**（转回待发布，清空发布时间）/ **代报名**（列表已发布无「关闭」入口；**需求详情头部已发布仍保留「关闭」**以代码为准回写），列表操作列不再提供「详情」按钮（行点击进详情）；需求记录 **发布时间 `publishedAt`**（实际发布/到点自动发布时写入，列表「发布时间」列可按正倒序排序）；后台可直接创建需求：**提交人选择器 = t-select `filterable + creatable`**（选项=全部个人用户+全部企业，`U:ID`/`E:ID` 前缀值，未注册可直接输入自建条目；选中已注册自动填充联系电话/邮箱——用户取 phone/email，企业取 contactPhone/contactEmail），提交身份快照仅注册个人用户可选（企业/自建为 null）；表单含**联系电话（必填）/联系邮箱（选填）**并随需求记录（Demand 新增 `contactPhone?`/`contactEmail?`，历史数据可能缺省）；**创建即保存为「待发布」**（原为创建即立即上架；不经过审核，创建表单不提供定时发布与存草稿选项，定时发布/立即发布由待发布状态操作触发；预算未填保存时自动填「面议」）；已匹配状态已移除（已匹配=已发布）；立项可——**多选**承接社区企业/社区个体，各填承接占比（整数百分比，默认均分、除不尽时首个承接方取余数，如 3 方=34/33/33，可调整，合计须为 100%），可选里程碑节点且每个节点可多选负责承接方；生成项目并双向关联（demand.projectId ↔ project.sourceDemandId）
- 项目经验值与承接方扩展（冻结）：创建/编辑项目表单「承接占比」上方加**「自定义项目经验值」开关**（默认关=按经验值规则 project_completed 项目结项奖励；开启后输入框预填规则值，Project 加 `expReward?`），**项目结项时按承接占比分配：仅社区企业（E 前缀）与结项时持社区个体身份的用户参与；合作企业（XE 前缀）/个人用户（无社区个体身份）/自定义承接方不参与，份额丢弃**；承接方选择项扩为**所有用户（U）+ 社区企业（E）+ 合作企业（XE）+ 自定义添加**（select creatable，自建项需补联系人与联系电话——ProjectUndertaker.type 加 `custom` + `contactName?/phone?`，UndertakerInput 同步；自定义承接方不参与经验分配）；
- 项目状态机（冻结）：**四态 running 进行中 / paused 已暂停 / closed 已关闭 / finished 已结项**（原 recruiting 招募中移除，创建/立项即进行中）；流转：running ↔ paused（暂停/恢复）、**paused → closed（关闭，弹窗填关闭原因必填——running 无关闭入口）**、closed → **重新创建**（以原项目为模板预填表单，保存为新项目编号）；编辑仅 finished（已结项）不可用；Project 加 `closeReason?`（列表已关闭行状态 tag hover 展示）；
- 项目表单与编辑（冻结）：创建即正式项目（无存草稿）；项目管理列表 op 加「编辑」（所有状态可编辑，ProjectFormDialog 加 mode/create|edit + project props，edit 回填承接方 value=type:id 与占比/里程碑），**api updateProject（PUT /projects/:id）**——仅改名称/承接方(重算 memberCount)/起止日期/描述/需求方信息/里程碑（todo 态重置），不改状态/编号/已完成里程碑；
- 项目模型（冻结）：`undertakers: ProjectUndertaker[]`（type/id/name/share 承接占比）；里程碑含 `owners`（负责承接方展示名，可多选）；后台可直接创建项目（无来源需求，复用同一表单弹窗）；项目无后台报名审核（报名概念移至客户端），后台展示承接方占比、进度节点与来源需求（来源需求可点击跳转需求详情）
- 活动模型（冻结）：活动状态流 = **待发布 →（立即发布 / 定时发布）→ 已发布（报名中/暂停报名）↔→ 已结束 / 已取消**，另有 已取消分支；**新创建活动一律进入「待发布」**（创建表单无定时发布选项），可操作=编辑/立即发布（开放报名）/定时发布（对话框设置时间，按钮=取消/定时发布）/取消活动；**定时发布中**仅可操作=**取消定时发布**（转回待发布），状态标签直接显示定时发布时间；**已发布**可操作=**暂停报名 / 开放报名**（`enrollmentOpen` 开关，状态标签显示"已发布（报名中）/已发布（暂停报名）"）与**取消活动**；**结束时间过后自动转为「已结束」**（服务端定时任务按 endTime 判定）；**已结束/已取消可归档**（列表 op，归档后可在归档管理恢复），**已取消另有「转为待发布」**（restoreCancelledEvent → pending_release）；已移除 草稿 / 进行中 状态（活动草稿功能与存草稿按钮一并移除）；其余字段与报名管理（审核、签到）不变
- 范围选项（冻结）：可见/可报名范围的身份选项中「个人用户」「合作企业」均标注**不受等级约束**（两者皆无经验等级）；等级筛选仅对社区个体/社区企业身份生效
- 身份展示规则（冻结）：个人用户为注册默认身份——用户列表「关联身份」列、社区个体列表「其他关联身份」列、用户详情「身份信息」页签均不展示（仅持有个人身份时显示 —/空态）；需求/活动的提交身份快照保留显示
- 成员/用户名展示规则：涉及具体人的展示列优先 `realName`、为空回退 `nickname`（如社区企业详情成员管理列 `row.realName || row.nickname`）；业务快照字段名不改——demand.publisherName、spaceReservation.userName、project.undertakers[].name、external 成员 name 等仍是展示快照，仅取值源改 nickname
- 身份卡跳转：社区企业身份卡 → 社区企业详情（enterpriseId）；合作企业身份卡 → 合作企业详情（external_enterprise 身份无 enterpriseId 字段，按"档案名 + 成员 userId"反查档案 ID，UserDetailView 加载合作企业档案列表反查，可解析才显示可点击）
- 数据概览联动（冻结）：**用户详情已取消独立数据概览卡片**，改由 7 个记录标签页（申请/需求/项目/活动/租赁/投稿/预约）直接展示；社区企业/合作企业详情保留「数据概览」选项卡（需求发布=以该企业身份发布的需求量、参与项目=该企业承接的项目量），卡片有数据时可点击跳转对应列表——跳转 query 携带 `enterprise`：**一律传企业 ID**——社区企业 E2001（按 publisherIdentity.enterpriseId / 承接方 t.id 匹配）、合作企业 XE7001（按 ID 解析档案名后以 enterpriseName / 成员个人承接匹配）；用户侧跳转 query 仅携带用户 ID（需求列表 `publisher`、项目列表 `participant`），按 ID 过滤避免同名歧义；列表以可关闭标签展示该筛选，名称解析：用户经 fetchUser、社区企业经 fetchEnterprise、合作企业经 fetchExternalEnterprise 由 ID 解析（均失败回退显示原值），重置时一并清除
- 经验值与积分账本（冻结；真实接口）：`api/ledgers.ts` 双流水（ExperienceRecord 前缀 EX8001+ / PointsRecord 前缀 PT9001+），每笔含 delta/balance（变动后余额）/reason/at/operator/source，末笔 balance 与实体当前值一致；经验值归属=社区企业（Enterprise.experience）或社区个体身份（UserIdentity.experience），积分归属=用户（User.points，挂靠个人用户身份人人可有）；账本选项卡——企业详情「经验值」（可增减）、用户详情「经验值」（**仅持有社区个体身份的用户显示**，可增减）、用户详情「积分」（所有用户，可增减）；调整经共享 `AdjustValueDialog`（方向+数量+必填事由，扣减不超余额、余额不可为负），API：`GET/POST /api/admin/experience-records`（入参 targetType+targetId）、`GET/POST /api/admin/points-records`
- 组件标准化审计结论：依赖 = vue 全家桶 + tdesign-vue-next/icons + pinia + `@wangeditor/editor`（含 for-vue，富文本），无其他第三方 UI 库；共享组件 26 个（RichEditor/TrendChart/ColumnController/BulkArchiveDialog/ArticleReviewDialog/ArticleScheduleDialog/EnterpriseFormDialog/ExternalEnterpriseFormDialog）；视图层自绘 DOM 已收敛：办公位/办公室卡片为 **t-card（size="small" + hover-shadow）内核**，边框/圆角/阴影来自 TDesign，状态底色经类覆盖容器背景；剩余自绘 DOM（图例色点、board 卡片、.page-card 容器）为装饰/布局元素，保留现状；**加载指令存量清理已完成**：DashboardView 趋势区 / AssetLibrary 网格 / MonitorPanel 外层 / LeasePrintView / ApprovalPrintView 共 5 处已统一改为 `<t-loading>` 包裹
- 开发环境约定（冻结）：**admin-web dev 端口统一 7758**（package.json dev 脚本已固化 `vite --port 7758`），浏览器访问 `http://localhost:7758`；**登录态为真实 JWT**——localStorage `joinyuu_admin_token` 必须来自 `POST /api/admin/auth/login`（admin/admin123），**登录必须携带图形验证码**（`GET /auth/captcha` 取 `captchaId`+SVG dataURL，点击图片或刷新按钮换一张；服务端强制校验，失败/锁定都写登录日志），任意无效/过期 token 会触发 401 清 token+名称+权限缓存跳登录；dev 需同时运行后端（7757，vite 已配 `/api` proxy）；不要使用其他端口（如 5199）起 dev server；验证码接口同 IP 限流 30 次/分钟（超出 429）

- 表格布局约定：凡开启 `resizable` 的 t-table 必须用 **`table-layout="fixed"`**（TDesign 警告 auto+resizable 组合；控制台刷屏）；列宽全部显式声明 width/minWidth，fixed 下按声明生效；无 resizable 的表格可保留 auto（如空间详情预约明细）

- clearable 约定（全量开启）：需求/项目/活动/商城/办公位/空间六域的**所有** t-input / t-select / t-date-picker / t-time-picker / t-tree-select 一律开启 `clearable`（筛选与表单皆含），方便用户快速清除；t-textarea / t-input-number / t-radio-group / t-switch 无 clearable 能力不适用；批量替换用 sed 行级守卫（`/clearable/!s/...`）防止重复属性
- 空间模型补充：Space 新增 `allDay?`（全天开放开关，默认关闭）——开启后表单隐藏开放/关闭时间设置项，持久化 openTime='00:00'/closeTime='23:59'，列表时段列显示"全天开放"；Space 新增 `needReservation?`（需预约，默认关）与 `needApproval?`（需审核，仅需预约开启时显示，关闭需预约自动联动关闭）——两者由 SpaceFormDialog 开关维护，列表与详情页"预约方式"行展示（需预约·需审核 / 需预约·免审核 / 免预约）；**api/spaces createSpace/updateSpace 需同步拷贝新增字段**（此前 allDay 无效的根因即漏拷贝）
- 空间详情页（路由 /spaces/:id）：公共空间管理列表**行点击跳转详情页**（操作列已阻断冒泡），页面含空间信息 descriptions + **预约日历（2/3 宽）+ 当月预约明细（1/3 宽）双栏**（t-calendar cellAppend 插槽按 formattedDate 追加当日预约摘要，最多 3 条 + 状态着色 + 图例；明细随日历展示月份联动——监听 controller-change 取 filterDate 更新 displayedDate，按 YYYY-MM 前缀过滤；controllerConfig.mode.visible=false 禁用月/年视图切换，保留年份/月份下拉与今天按钮；窄屏 ≤1100px 单列堆叠）；t-calendar cellAppend 的 CalendarCell 提供 formattedDate/belongTo（belongTo=0 才是本月日期，跨月溢出格不渲染追加内容）
- **Calendar cellAppend 插槽签名（易错，两次返工后定案）**：插槽作用域 = **CalendarCell 本体** `#cellAppend="cell"`（作用域整体即 CalendarCell）**；解构写法 "{ cell }" 与 "{ params }" 都会让解构结果为 undefined → 每单元格一次渲染错误，**tbody 整体渲染失败 → 只剩控制器和星期表头、日期全无**（曾把 "{ params }" 误判为正确写法，实测 105 次渲染错误复现后修正）；勿改回解构写法；日期取值统一走组件内 `reservationsOn(date)` 辅助函数（永不返回 undefined），模板不做非空断言
- 圆角约定（冻结）：全站 border-radius **一律使用 TDesign radius token**——`--td-radius-small`(2px)/`--td-radius-default`(3px)/`--td-radius-medium`(6px)/`--td-radius-large`(9px)，圆形用 50%；**禁止硬编码 px**（历史上 2/3/4/6/8/9px 混用导致与 TDesign 组件观感不一致，已全量 token 化）；新增样式时按控件语义取值：输入/按钮等控件=medium，卡片/弹窗类容器=large，小徽标/点缀=default；使用 t-card/t-dialog 等容器组件时圆角与边框直接继承，不再手写
- 租赁方模型（冻结）：Lease 新增 `renterType?: LeaseRenterType`（enterprise=注册企业/individual=注册个人用户/custom=未注册自建条目；旧数据按 enterpriseId 前缀推断：E 开头=企业）；创建租约的"租赁方"选择器 = t-select `filterable + creatable`，选项 = 全部企业 + 全部个人用户（`E:ID`/`U:ID` 前缀值），**选中已注册租赁方自动填充联系人/电话**（企业取 contactName/contactPhone，个人用户取 name/phone），custom 不填充改为手动输入；createLease 服务端校验 enterprise/individual 类型对应 ID 存在；工作台惯例：可选 props 的合法性以 TDesign MCP 查证为准（select 无 hint prop，提示用内置 `tips` prop 或 t-form-item）
- 办公位与租约计费模型（冻结）：Workstation 新增 `defaultMonthlyRent?`（默认月租，元）与 `areaSqm?`（面积㎡，仅独立办公室表单出现）；Lease 新增 `rentPeriod?: RentPeriod`（day/week/month/year，**缺省按月租处理**）与 `longTerm?`（**长期租约：无结束日期 endDate 为空串，不参与临期/到期派生**，列表/办公室卡片显示"startDate ~ 长期"）；创建/编辑租约表单含"付款周期"**按钮形态单选**（t-radio-group `theme="button"` + `variant="primary-filled"`，日付/周付/月付/年付，默认月付），租金标签动态为"租金（元）/ 日|周|月|年"；**租金联动**：周期≠月租时清空租金输入框（必填规则兜底），周期=月租且所选办公位存在默认月租时自动累加填入（仅创建模式、求和>0 才覆盖）；**选择办公位用 t-tree-select**（multiple+filterable+clearable+minCollapsedNum=3，一级=已有区域、二级=区域下空闲办公位编号）；租赁管理列表"租金（元）"列显示"金额 / 单位"，办公室卡片租约行同格式；表单日期标签为"租赁开始日期/租赁结束日期"，结束日期旁带"长期"开关（开启禁用日期选择，非长期必填结束日期）
- 空间表单：配备设备栏改用 **t-tag-input（clearable）**，值即 equipment string[]（回车添加标签、可整体清空），替代原"逗号分隔文本 + parseEquipment"方案；设备名多词直接建一个标签（如"智能投屏"）
- 表单弹窗校验时机（冻结）：规则 trigger 一律 `submit`——change/blur 自动校验会提前红框（值变化触发 change、DatePicker 面板交互引发失焦触发 blur）；`submit` 不匹配任何自动触发，确认时 `formRef.validate()`（trigger='all'）命中全部规则才红框提示；弹窗打开时 `nextTick` 调 `formRef.clearValidate()` 清除上次残留（仅清状态不动值）；带草稿按钮的弹窗用自定义 footer——**直接用 #footer 插槽且不设 footer prop**（TDesign 源码 `!!props.footer && renderFooter()`：`footer=false` 会连插槽一起禁用，导致按钮全部消失）；也不设 confirm-btn/cancel-btn props（避免与插槽重复渲染）
- 表格规范（冻结；为 fixed）：所有列表页 t-table 统一 `table-layout="fixed"` + `hover` + `resizable`（列宽可手动拖拽调整，数据列加 `resizable: true` 且显式声明 width；少数无 resizable 的详情内嵌明细表可保留 auto，如空间详情预约明细）；服务端排序列 `sorter: true, sortType: 'all'` + 受控 `:sort` 绑定 + `@sort-change`（远程排序：更新 sortBy/sortOrder 后重新加载，切排序回第 1 页）——活动列表（默认 ID 倒序，活动开始时间/创建时间列；编号列已移除，编号置于标题下方）、需求列表（默认创建时间倒序，创建时间/发布时间列）、项目列表（默认立项日期倒序，立项日期列）、合作企业列表（默认登记日期倒序，登记日期列）、需求审核列表（默认创建时间倒序）；本地排序与服务端结果一致（定长 ID/时间格式），受控 sort 保证表头指示器正确
- 草稿与定时发布（冻结）：**全站已无草稿状态**——项目「存草稿」按钮与 saveProjectDraft 已移除（创建即正式项目），需求草稿、活动草稿均不可再创建；DemandPublishDialog 仅 create/edit 双模式（publish 模式已删除）；**需求/活动/文章定时发布中均不可编辑**，仅可「取消定时发布」转回对应待发布状态；scheduled 状态的列表/详情状态标签**直接显示定时发布时间**（hover 提示"到点自动发布"），不显示"定时发布中"文案
- 详情页范围展示（冻结）：可见范围与可报名范围标签同行展示（`scope-row` 容器，两组之间竖线分隔，窄屏自动换行）
- 时间线组件约束（冻结）：`t-timeline` 必须显式 `mode="same"`——TDesign 默认 mode=alternate 且 label 类恒生效（hasLabelItem 硬编码为 1），alternate+left 布局会给圆点列加 margin-left:100px，导致内容整体缩进居中；时间不放 label 属性（绝对定位会与内容重叠），放内容块内独立一行
- 全局动效约束（冻结）：页面入场动画 fill-mode 一律 `backwards`，禁止 `both`/`forwards` —— 动画残留 transform 会使页面根成为 Dialog/Drawer 固定定位弹层的包含块，弹层高度被页面内容高度裁切（短页面尤为明显）
- 状态映射（冻结；与 `constants/status.ts` 全量核对）：
  - 用户 user：active=正常/success，frozen=已冻结/danger（hover 显示冻结期限与原因；**待激活 pending 状态已移除**）
  - 企业 enterprise：active=正常/success，exited=已退出/default，disabled=已停用/default（新增/启停/归档由后台维护）
  - 企业展示页 showcase：published=已发布/success，pending=待审核/warning，rejected=已驳回/danger，none=未提交/default
  - 申请 application：pending=待审核/warning，approved=已通过/success，rejected=已驳回/danger；申请类型 applicationTypeMap：settle=企业入驻 / individual=个体入驻 / cooperation=企业合作 / exit=企业退驻
  - 需求 demand：pending=待审核/warning，pending_release=待发布/primary，scheduled=定时发布中/primary（直接显示时间），published=已发布/success，selected=已选定/primary（发布者已选意向承接方，等待管理员立项），rejected=已驳回/danger，projected=已立项/success，closed=已关闭/default（草稿状态已移除）
  - 需求响应 demandRespondent：pending_review=待审核/warning（响应需审核开启时成员提交后进入，待管理员审核），pending=待选定/warning（审核通过、等待发布者选定承接方，与「已选定」成对），contacted=已对接/success，accepted=已接受/success，rejected=已拒绝/default，closed=已结束/default
  - 项目 project：running=进行中/success，paused=已暂停/warning，closed=已关闭/danger，finished=已结项/default（已移除 recruiting 招募中）
  - 活动 event：pending_release=待发布/warning，scheduled=定时发布中/primary（直接显示时间），published=已发布/success（已发布（报名中）/已发布（暂停报名）拼接），ended=已结束/default，cancelled=已取消/danger（已移除 草稿/进行中）
  - 报名 enrollment：pending=待审核/warning，approved=已通过/success，rejected=已驳回/danger
  - 商品 goods：on=已上架/success，off=已下架/default，restock=待补货/warning（新增，库存为 0 场景）
  - 兑换订单 redemption：pending_use=待使用/primary，finished=已完成/success，cancelled=已取消/default（统一券码兑换三态）
  - 积分/经验规则 rule：enabled=已启用/success，disabled=已停用/default
  - 空间预约/展示页申请 reservation：pending=待审核/warning，approved=待使用/success，using=使用中/primary，ended=已结束/default，rejected=已驳回/danger，cancelled=已取消/default（六态，approved/using/ended 由 `utils/reservation.ts` 按日期时段派生，存储仅 pending/approved/rejected/cancelled）
  - 文章 article：pending=待审核/warning，rejected=已驳回/danger，pending_release=待发布/primary，scheduled=定时发布中/primary（直接显示时间），published=已发布/success（原 draft 草稿/withdrawn 状态已移除，下架=转待发布）
  - 公告 announcement：published=已发布/success，withdrawn=已下架/default
- 规则管理菜单（冻结）：一级菜单"规则管理"（group-rules）= 积分规则 + 经验值规则 + 等级规则 + 积分发放记录 + 经验值发放记录五页（/rules/ledger、/rules/experience-records）；"积分管理"一级菜单更名为"积分商城"（仅商品/订单）；ExperienceRule 结构与 PointsRule 同（points 字段名为 exp），api 集中在 api/rules.ts（经验值/等级），积分规则 api 仍在 api/mall.ts；
- 规则标签与代报名（冻结）：① 活动「报名/签到」列与需求「响应」列积分 tag 双色——**绿色=按积分规则值**（未自定义）、黄色=活动/需求自定义值，tag 与数字行居中对齐；② 活动表单「可见范围/可报名范围」同样升级为自定义开关（与需求表单同模式）；③ **需求代报名**：published/projected 需求 op 的**「关闭」按钮之后**加「代报名」按钮 → 弹窗字段 = 报名方（creatable 下拉：注册个人用户/企业 + 未注册自建，选中自动填充联系方式）+ 联系电话（必填）+ 联系邮箱（选填）+ 报价（选填）+ 响应留言（可选）→ proxyRespondDemand 追加 respondents（**DemandRespondent 扩展 phone?/email?/quote?**，message 留空记「管理员代报名」）；④ 活动 op：**已发布加「编辑」**、**已取消加「转为待发布」**（restoreCancelledEvent → pending_release）；⑤ 创建需求表单「提交身份」仅在选中注册个人用户且身份列表非空时显示；
- 活动奖励自定义（冻结）：创建/编辑活动表单新增「积分奖励」块——自定义报名奖励积分、自定义签到奖励积分两开关（默认关=按积分规则 activity_enroll_approved / activity_checkin 发放）；开启后出现数字输入框，默认值预填积分规则设定值，可按活动调整；CommunityEvent 加 `enrollPoints?`/`checkinPoints?`（缺省=按规则）；活动列表「报名」列（x/容量）与「签到」列（x/y）下方各展示积分 tag（活动自定义值 ?? 规则默认值）；
- 需求响应奖励与范围开关（冻结）：创建/编辑需求表单（DemandPublishDialog 双模式共用）① 新增「自定义响应需求奖励积分」开关（默认关=按 demand_responded 规则；开启后输入框预填规则值，Demand 加 `respondPoints?`），需求列表「总响应/待审核」列下方展示积分 tag；② 「可见范围」「可报名范围」升级为**自定义开关**（默认关=不限身份等级，开启后显示原身份/等级选择框），编辑回填按历史数据有无值自动置开关状态，提交时空数组=不限；③ 新增「响应需审核」开关（`t-switch`，默认开；Demand 加 `respondNeedReview` 默认 true，编辑回填 `!== false`，标题带悬浮说明；**与「公开联系人」开关并排展示，紧跟其后**）：开启后成员提交的响应先落 `pending_review` 待管理员审核，通过后才对发布者可见并发放响应积分，关闭则提交即待处理（与现状一致）；
- 积分规则制度（冻结；9 项与 seed 一致）：**发放积分自动、扣除积分手动**——规则仅含发放类触发项，写死共 9 项：activity_checkin 活动签到(+10)、activity_enroll_approved 活动报名通过(+5)、article_accepted 投稿采纳(+30)、demand_published 需求发布(+15)、demand_responded 响应需求(+20，发放给响应成员)、demand_undertaken 需求承接立项(+200)、project_milestone 项目里程碑达成(+100)、identity_first_bind 首次入驻/绑定身份(+50)、daily_login 每日登录(+1，默认停用)；**系统无法自动判定违规，不设自动扣分规则，扣除积分由管理员手动调整**（adjustPoints 支持负值）；**PointsRule 字段：code/name/scene/points(正数，唯一可编辑)/status(启停)/description(写死)**；UI 无新增/删除入口，编辑弹窗只读展示触发项+仅分值可改；后端实现按 code 关联发放逻辑
- **奖励输入框**：活动报名/签到奖励与需求响应奖励始终展示数字输入框，标题标注当前规则值并提供悬浮说明；默认填规则值，可按单个活动/需求直接调整并保存。
  - 办公位 workstation：idle=空闲/success，assigned=已分配/primary，maintenance=维护中/warning
  - 租约 lease：active=生效中/success，expiring=即将到期/warning（15 天内派生，`EXPIRING_WINDOW_DAYS=15`），expired=已到期/danger（过期派生），terminated=已终止/default
  - 空间 space：available=可用/success，maintenance=维护中/warning，disabled=已停用/default
  - 栏目 column：enabled=启用/success，disabled=停用/default
- 选项词汇表（`constants/status.ts`）：goodsCategoryMap（实物商品/权益券，商品类型已字典化，历史值 physical/voucher 经 `isPhysicalCategory` 兼容）、workstationTypeMap（open 开放办公位/office 独立办公室/semi 半开放办公位）、spaceTypeMap（meeting 会议室/roadshow 路演厅/meeting_room 洽谈室/multi 多功能厅/study 自习室）、spaceStatusOptions、showcaseTargetTypeMap（enterprise 企业展示页/individual 个人主页）
- 共享表单/功能弹窗：GoodsFormDialog / LeaseFormDialog / SpaceFormDialog / ArticleFormDialog / WorkstationFormDialog（办公位创建+资料编辑）/ AreaPlanDialog（区域规划）/ EnterpriseFormDialog / ExternalEnterpriseFormDialog / AnnouncementFormDialog / AdjustValueDialog / ArticleReviewDialog / ArticleScheduleDialog / BulkArchiveDialog，均遵循表单弹窗契约

## 5. 页面清单

> 路由以 `src/router/index.ts` 为准：当前共 57 条路由记录，其中 50 条 component-backed（49 个视图路由 + AdminLayout 壳），其余 7 条为 `/mall`、5 条旧系统路径和 catch-all 重定向；系统管理 5 个子页作为 2 个聚合页的 tab 子组件，不再独立路由。

| 页面 | 路由 | 职责 | 关键交互 |
|---|---|---|---|
| 登录 | /login | 品牌区 + 真实 JWT 登录（M1 起）；图形验证码为必填项 | 验证码图片点击/刷新按钮换一张，登录失败自动清空验证码并刷新；加载/错误反馈；**页面不再展示演示账号提示**（种子账号见 README）；**登录成功统一进入「工作台」（不回跳登录前被拦截的页面，避免历史 URL 如 /system/change-password 带偏登录落点）**；密码过期（系统配置有效期）时仍先引导到修改密码页 |
| 工作台 | /dashboard | 六域待办卡片（有待办高亮）+ 平台数据 6 卡 + 系统公告 + 待办审核 + 近期活动 + 运营趋势 + 快捷入口 | 待办/平台数据/公告/审核/活动点击直达；趋势支持 新增成员/新增需求/新增活动/发放积分 四指标 × 3/7/15/30 天，顶部显示**区间累计值**；「编辑布局」popup 控制 7 个区块显隐（localStorage 持久化），与 ColumnController 一样支持 ESC 关闭；视觉修复：待办 StatCard（`t-link` 渲染）补内边距与左对齐（TDesign `.t-link` 基础样式 `padding:0`/`justify-content:center` 会覆盖自定义卡片样式，组件内需以 `.stat-card.t-link` 提升特异性回写）、系统公告条目 `.dash-item` 补 `align-items: flex-start`（column 布局下 `t-link` 的 `align-items:center` 会使文字水平居中） |
| 用户留言 | /user-messages | 一级菜单（紧随工作台）：客户端留言列表（关键词搜索主题/内容/UID + 状态筛选 + 提交时间排序）+ 列设置 + 一键归档 + 回复对话框 | 默认待回复置顶；表头「提交时间」支持正/倒序（服务端排序，显式排序后不再置顶待回复）；待回复→「回复」（2-1000 字纯文本），发送后留言人收到站内信（link `/me/messages`）；已回复→「查看」+「归档」（popconfirm 二次确认，可在归档管理中恢复）；重复回复服务端 409；权限 `/user-messages`（超管 + 运营） |
| 用户列表 | /users | 筛选（关键词/身份/状态/实名状态）+ 列设置 + 导出 + 新增用户 | 新增时填写昵称/联系电话/邮箱/性别及可选实名资料，服务端生成 UID 与默认个人身份；行点击/详情按钮进用户详情；冻结/解冻在详情页执行 |
| 用户详情 | /users/:id | 资料头（头像/昵称/用户ID/身份标签/状态）+ 编辑/冻结/恢复 + tabs | 「编辑用户资料」弹窗**头像可直传替换或删除**（ImageUploadField → 素材库 `bizType=avatar`，空值 = 回退昵称首字占位）；tabs：身份信息 / 申请·需求·项目·活动·租赁·投稿·预约 7 个记录页（各分「进行中/历史记录」，已归档条目标「已归档」）/ 经验值（仅社区个体）/ 积分 / 活跃记录；需求/项目/活动/租赁记录行可点击跳详情；社区企业/合作企业身份卡跳企业详情 |
| 社区个体 | /individuals | 社区个体身份成员列表（关键词/状态筛选）+ 列设置 + 导出；等级列名为「个体等级」 | 行点击进用户详情 |
| 企业列表 | /enterprises | 社区企业筛选（关键词/行业/状态）+ 列设置 + **行业管理**（页头按钮）+ 导出 + 新增企业；列含「企业等级」（Lv.n 等级名，由企业经验值按社区企业等级梯度推导） | 新增需权限 `perm:enterprise:create`；行点击进详情；「行业管理」弹窗=原「数据字典 > 行业」入口迁移（新增即启用/仅支持启停与删除，label 即存储值不可改名），保存后刷新行业筛选下拉 |
| 企业详情 | /enterprises/:id | 头部企业名 + **企业ID 标签** + 状态；tabs：企业信息 / 关联租赁 / 数据概览 / 成员管理 / 经验值 | 编辑/停用/启用；**归档仅「已停用」态出现**；数据概览卡片按企业 ID 跳需求/项目列表；成员行跳用户详情；关联租赁行跳租约列表按企业筛选 |
| 合作企业 | /external-enterprises | 合作企业聚合列表（关键词/行业/状态 + 登记日期排序）+ 列设置 + 导出 + 新增合作企业 | 行点击进详情 |
| 合作企业详情 | /external-enterprises/:id | 头部企业名 + **企业ID 标签**；tabs：企业信息 / 数据概览 / 关联成员 | 编辑/停用/启用；**归档仅「已停用」态出现**；数据概览按 ID 跳需求/项目列表；成员行跳用户详情 |
| 申请审核 | /approvals | 四类申请（企业入驻/个体入驻/企业合作/企业退驻）状态 Tab + 类型筛选 + 列设置 + 一键归档 | 行点击/按钮进详情抽屉（审核时间线）；**待审核=「审核」，已通过/已驳回=「详情」+「归档」**；通过/驳回（意见 dialog）；抽屉内「打印」开打印视图 |
| 需求列表 | /demands | 筛选（关键词/类别/状态）+ **需求类别**（页头按钮）+ **「创建 / 发布时间」合并列**（首行创建时间、次行发布时间，未发布显示「—」；表头按创建时间正/倒序）+ 列设置 + 一键归档/导出/导出全部/新增需求 | 行点击进详情；待审核→审核；待发布→编辑/立即发布/定时发布/关闭；定时发布中→取消定时发布；已发布→立项/撤回发布/代报名；已选定→立项（发布者已选意向承接方，待管理员确认）；已立项→查看关联项目/代报名/归档；已驳回/已关闭→归档；「响应」列表头为「总响应/待审核」双计数（`responseCount` / `pendingResponseCount`，未撤回口径，待审核=`pending_review`，待审核>0 时以警示色展示；**未开启响应审核（`respondNeedReview=false`）的需求待审核位显示「-」**，导出同口径），其下积分标签按「（需求自定义 respondPoints ?? 规则默认 demand_responded）」与规则默认值比较配色（相等绿 / 低于红 / 高于橙）；query `publisher`/`enterprise` 以可关闭标签展示筛选；「需求类别」弹窗=原「数据字典 > 需求类别」入口迁移（新增即启用/仅支持启停与删除），保存后刷新类别筛选下拉 |
| 需求审核 | /demands/review | 固定「待审核」需求集中审核（关键词/类别筛选 + 创建时间排序）+ 列设置 | 表格「**提交人**」列=名称 + ID + 身份纯文本；行点击进详情；审核（只读对话框：取消/驳回/通过，通过=转待发布，驳回必填原因） |
| 需求详情 | /demands/:id | 头部（状态/已归档/类别 + 可见与可报名范围同行）+ descriptions（编号/提交人/提交人身份/联系电话/预算/时间等）+ tabs 需求详情/响应记录 | 头部按状态操作（已发布另有「关闭」；已选定仅「立项」）；**提交人显示姓名 + ID 并可点击跳转**（注册用户/企业），提交人身份为纯文本；「响应记录」tab 对 `pending_review` 响应支持**通过/驳回**（通过=回待处理、发放响应积分并通知发布者；驳回必填理由，条件抢占防重复审核）；留言列在留言下方以次要小字附带展示报价/可投入时间/案例/手机（供审核参考，空值不展示），状态标签按 `demandRespondent` 映射（待审核/待选定/已接受/已拒绝/已结束）；已归档显示「已归档」标签并隐藏全部写操作 |
| 项目列表 | /projects | 筛选 + 承接方占比/进度列 + 立项日期排序 + 列设置 + 一键归档/导出/新增项目；列表不展示成员数 | 行点击进详情；running→暂停/编辑；paused→恢复/关闭（必填原因）/编辑；closed→重新新增/归档；finished→归档；query `participant`/`enterprise` 标签筛选 |
| 项目详情 | /projects/:id | 头部 descriptions（立项/开始/结束日期、成员数、进度、来源需求、需求方、需求方身份、创建人、合同价格、联系人、联系电话、联系邮箱）+ 项目信息（承接方占比/说明）+ 进度节点（含负责承接方）（tabs） | 来源需求跳转需求详情；已归档显示「已归档」并隐藏写操作；「新增/编辑项目」表单含需求方信息区块（需求方下拉：企业/用户/自定义 + 自动识别身份与填充联系方式；创建人默认当前操作人；合同价格），需求立项时该区块只读提示并由服务端照搬需求快照 |
| 活动列表 | /events | 筛选（类型/状态）+ **活动类型**（页头按钮）+ 活动开始/创建时间排序 + 列设置 + 一键归档/导出/新增活动 | 行点击进详情；待发布→编辑/立即发布/定时发布/取消活动；定时发布中→取消定时；已发布→暂停/开放报名、编辑、取消；已取消→转为待发布；已结束/已取消→归档；报名/签到列下方积分 tag（仅示数值「N积分」，绿色 = 沿用积分规则值、黄色 = 活动自定义值）；**新增/编辑表单「地点」为可选空间的下拉**（`filterable` + `creatable`：可任选空间，也可自行输入空间列表外的地点；选中空间名/地址后该空间可约时段自动避开本活动，口径见 wiki-backend §8.8）；「活动类型」弹窗=原「数据字典 > 活动类型」入口迁移（新增即启用/仅支持启停与删除），保存后刷新类型筛选下拉 |
| 活动详情 | /events/:id | 信息（双范围/报名审核/报名截止/定时发布）/ 报名管理 / 签到管理（tabs） | 编辑活动、报名审核、手动签到；已归档显示「已归档」并隐藏写操作 |
| 活动报名 | /events/enrollments | 状态 tabs（待审核/已通过/已驳回/候补中/已取消/全部）+ 关键词（报名人/企业/电话/活动）+ 列设置 + 导出 | 通过/驳回待审核报名；行点击进活动详情「报名管理」 |
| 商品管理 | /mall/goods | 商品列表（关键词/类型/状态筛选）+ 列设置 + 导出 + **商品类别**（页头按钮，弹窗维护类型字典项 + 类别级可见/可下单范围）+ 新增商品 | **新增商品默认「已下架」**；编辑（类型/积分/库存/券码有效期（天）/自定义可见与可下单范围/富文本说明）；上架/下架；**归档仅「已下架」**；0 库存红字；「商品类别」为原「数据字典 > 商品类型」入口迁移（编码 GC 前缀自动分配，可新增/改名/启停/删除，类别范围为空 = 不限） |
| 订单管理 | /mall/orders | 兑换订单列表（关键词（含券码精确锁定）/状态筛选）+ 券码列 + 列设置 + 一键归档 + 导出 + 详情抽屉 | 统一券码三态：待使用→核销/退款（退积分+回补库存）；已完成/已取消→归档；行点击开详情抽屉（券码信息） |
| 积分规则 | /rules/points | **积分发放制度**：9 条固定发放触发项（code 写死）+ 积分值 + 状态，扣除积分走手动调整不设规则 | **仅可编辑积分值（正整数）或启停规则，不可新增/删除** |
| 经验值规则 | /rules/experience | **经验值发放制度（新增投稿采纳）**：6 条固定发放触发项（activity_checkin +5 / activity_enroll_approved +2 / article_accepted 投稿采纳 +20 / project_undertaken +30 / project_completed 项目结项 +100 / identity_first_bind +10，code 写死；**project_milestone 项目里程碑达成已移除**）+ 经验值 + 状态；经验仅社区个体/社区企业身份累积 | **仅可编辑经验值（正整数）或启停规则，不可新增/删除**；api/rules.ts |
| 等级规则 | /rules/levels | 社区个体、社区企业两个选项卡分别维护动态等级梯度（最低 1 级、最多 10 级）+ **按等级的需求发布 / 日、文章投稿 / 日额度** + **积分消费折扣**（1 = 1 折 … 10 = 原价，默认 10，**支持一位小数**如 8.5 = 85 折）；保存后重算对应身份的当前等级 | 添加/删除等级行、编辑标签/门槛/额度/折扣，保存当前身份配置（梯度 + 额度 + 折扣同事务）；额度 `-1` 不限、`0` 禁止（就地标注「不限/禁止」），折扣就地标注「N 折 / 原价」；api/rules.ts |
| 个人用户规则 | /rules/publishing-limits | **仅个人用户（未实名 / 已实名）两行**的每日额度（需求发布 / 文章投稿 / 活动报名 / 空间预约）；社区个体与社区企业的额度按等级在「等级规则」页维护 | 默认均为 `-1` 不限；`0` 禁止；保存仅更新这两行 |
| 积分发放记录 | /rules/ledger | **仅展示系统按积分规则自动发放的积分记录**（source=rule；手动调整/兑换扣减不在此列），顶部汇总累计发放/笔数/覆盖用户数 | 无编辑操作（只读） |
| 经验值发放记录 | /rules/experience-records | **仅展示系统按经验值规则自动发放的经验值记录**（source=rule），归属区分企业/个人 tag + 名称解析 | 无编辑操作（只读）；api/rules.ts fetchExperienceIssuanceRecords |
| 办公位管理 | /workstations | 开放办公位/半开放办公位平面图（按区域分组网格+状态图例+状态底色卡片+汇总卡片；独立办公室移至办公室管理页） | 筛选栏：区域下拉（仅开放/半开放区域，含全部）+ 状态下拉，与**状态卡片点击筛选**联动；区域规划弹窗（保存后静默刷新）；创建办公位；卡片操作：编辑（含"维护中"开关、删除——已分配禁用）、**查看租赁**（跳租约详情）、**关联租赁**（跳租赁管理并预选该办公位） |
| 办公室管理 | /workstations/offices | 独立办公室卡片视图（容纳人数/占用企业/租约号+租期+月租金，状态底色卡片+图例） | 同办公位管理；卡片「查看租赁」跳租约详情、「关联租赁」跳租赁管理预选；区域选项每次打开弹窗重新拉取 |
| 租赁管理 | /workstations/leases | 租约列表（生效中/即将到期/已到期/已终止汇总卡片可点击筛选）+ 关键词搜索（租约编号/办公位编号/租赁方/联系人/联系电话）+ 状态筛选 + 列设置 + 一键归档/导出/新增租约 | **行点击/详情进租赁详情页**；打印；生效中/即将到期→编辑；生效中/即将到期/已到期→**续期**（LeaseRenewDialog：新到期日默认按租金周期顺延一期、须晚于原到期日，租金默认沿用可调整，续期说明必填；长期租约无到期日不提供）/终止（释放办公位）；已终止→归档；query `renterId`+`renterType`（企业/用户详情跳转）自动筛选，`create=1&workstationId=` 打开新增并预选；expiring/expired 读取时派生（过期不自动释放办公位，需人工续期或终止） |
| 租赁详情 | /workstations/leases/:id | 租约全量信息（租赁方类型/租期/租金/联系人/办公位/终止时间）+ 已归档标签；下方选项卡 **编辑记录 / 续期记录 / 合同**（续期记录=续期动作留痕：到期日与租金变化+说明+操作人时间；合同=线下纸质合同扫描件，图片缩略图/PDF 图标、点击新窗口查看） | 返回列表/打印租约；生效中/即将到期/已到期→**续期**（同列表续期弹窗）、终止；生效中/即将到期→编辑；已终止→归档；**已归档隐藏写操作（合同只读可查看）**；合同 tab 支持上传（图片/PDF，多选）/查看/删除（二次确认）；租赁方链接跳企业/用户详情 |
| 公共空间管理 | /spaces | 空间列表（类型/容量/位置/预约方式/**费用**/开放时段/设备/状态）+ 列设置 | 新增/编辑空间（含「费用」栏：积分/小时，0=免费）、维护登记/停用/恢复；费用列显示「N 积分/小时」或「免费」；行点击进空间详情（预约日历 + 当月明细） |
| 空间详情 | /spaces/:id | 空间信息（类型/容量/状态/开放时段/预约方式/费用/设备/说明）+ 预约日历（2/3 宽，cellAppend 当日占用摘要：预约 + 活动占用）+ 当月占用明细（1/3 宽） | 已归档显示「已归档」并隐藏写操作；日历与明细联动按月切换；活动占用取自 `GET /spaces/:id/event-occupancy`（按日展开），日历用 error 色条目 + 图例「活动占用」，明细行状态列显示「活动占用」标签、时段下补活动名，预约行仍走六态 StatusTag |
| 公共空间预约 | /spaces/reservations | 六态 Tab（待审核/待使用/使用中/已结束/已驳回/已取消）+ 空间/日期筛选 + 列设置 + 一键归档 | 行点击/详情开抽屉（时间线）；待审核→通过/驳回；待审核/已通过→取消；已结束/已驳回/已取消→归档；通过前服务端校验时段冲突（已通过预约与活动占用）；**驳回与取消均自动全额退回该预约已扣积分**（见 wiki-backend §8.8） |
| 资讯发布 | /contents/publish | 官方文章（channel=official）：待发布/定时发布中/已发布/**已关闭** + 列设置 + 发布资讯 | 任意状态「详情」只读；待发布→编辑/定时发布/立即发布/归档；定时发布中→取消定时/立即发布；已发布→下架（转**已关闭**）；**已关闭→归档**；编辑弹窗含「评论功能」开关（默认开启），详情抽屉展示下架记录与原因 |
| 投稿内容 | /contents/submissions | 用户投稿（channel=submitted）：待审核/已驳回/待发布/定时发布中/已发布/**已关闭** + 列设置 + 一键归档 | 待审核→详情即审核（通过/驳回必填原因）；已驳回→详情/归档；待发布→编辑/定时/立即/归档；定时发布中→详情/取消/立即；已发布→下架（转**已关闭**）；**已关闭→详情（含下架记录）/归档**；成员主动撤回的投稿仍为 withdrawn 且可重提 |
| 栏目管理 | /contents/columns | 栏目增改/排序权重/开放投稿开关/启停/删除 + 列设置 | 系统保留栏目「未指定」不可编辑/停用/删除；删除栏目文章自动转移至「未指定」；文章数从文章列表聚合 |
| 阅读统计 | /contents/stats | 阅读量汇总卡（总阅读/已发布文章/篇均/单篇最高）+ 排行榜 + 列设置 | 只读；标题 ID 置于标题下方 |
| 社区政策 | /contents/policies | 社区服务政策、办事指引、附件与精选状态列表 | 新增/编辑；仅维护 `community` 类型并同步移动端社区服务页 |
| 轮播图管理 | /contents/banners | 首页轮播图列表（排序/标题/副标题/图片/跳转/展示）+ **首页轮播图总开关** | 新增/编辑/删除；排序值升序展示；单条启停；关闭总开关后客户端首页不展示轮播区域 |
| 协议与政策 | /system/policies | 用户协议与隐私政策的独立版本列表 | 新增/编辑；仅维护用户协议和隐私政策，注册及隐私设置按已发布版本读取 |
| 公告栏 | /contents/announcements | 站点公告管理：新增即发布，置顶优先排序（AN1001+）+ 列设置 | 发布/编辑/下架/重新发布/置顶/归档（归档后可恢复）；AnnouncementFormDialog 双模式 |
| 数据字典（无独立页面） | — | 四类字典项（需求类别/行业/活动类型/商品类别）维护入口已全部迁移到对应业务页页头按钮：需求管理「需求类别」/ 活动列表「活动类型」/ 社区企业「行业管理」/ 商品管理「商品类别」（后两者含类别级范围能力差异） | 字典项 label 即业务存储值，仅商品类别支持改名；写入仍走 `/system/dicts` 权限码；各业务下拉统一从字典拉取（失败回退 dictFallback 词表） |
| 系统配置 | /system/config | 站点信息 + 功能开关（注册/积分商城/需求广场/空间预约/实名认证要求/**首页轮播图**/**密码过期强制改密**——默认关闭=后台账号密码永不过期，开启后才展示「密码过期周期（天）」，默认 90，仅作用于后台账号不影响客户端用户）+ 运营参数（临期提醒窗口 1-90 天、**上传文件大小限制 1-100MB**）+ **MinIO 对象存储**分区（启用开关 + endpoint/端口/SSL/AccessKey/SecretKey/Bucket） | 保存即生效（MinIO 配置保存后即时切换存储驱动；关闭「密码过期强制改密」时同步清理已标记的密码过期账号），记录更新时间与操作人 |
| 日志与审计 | /system/logs | 选项卡聚合页：操作日志 + 登录日志（按权限过滤 tab；tab 与 `?tab=` 同步；子页标题隐藏） | 由「日志与审计」菜单进入；旧路径 /logs/audit、/logs/login 重定向对应 tab |
| 操作日志（日志与审计 Tab，原「审计日志」） | /system/logs?tab=audit | 服务端写操作留痕（操作时间/操作人/模块/动作/对象/详情，含 before/after 快照） | 模块筛选 + 关键词搜索；只读 |
| 登录日志（日志与审计 Tab） | /system/logs?tab=login | 管理员登录成功/失败/锁定三态记录（账号/姓名/IP/归属地/设备/失败原因） | 关键词 + 状态 + 日期区间筛选；只读 |
| 角色与账号 | /system/account | 选项卡聚合页：管理员账号 + 角色权限 + 在线会话（按权限过滤 tab；tab 与 `?tab=` 同步；子页标题隐藏） | 由「角色与账号」菜单进入；旧路径 /system/roles、/system/admins、/system/sessions 重定向对应 tab |
| 角色权限（角色与账号 Tab） | /system/account?tab=roles | 角色列表 + 权限点分配矩阵（按权限目录分组渲染，后端目录失败回退内置 56 码目录）+ **数据范围**列 + **筛选栏（关键词筛选行内）+ 新增角色** | 超管角色强制全量 `*` 且不可限制数据范围；分组全选/全不选；保存角色权限集合；数据范围弹窗 7 域多选（members/biz/space/contents/mall/rules/system，空=全部）；新增角色弹窗（编码小写字母开头唯一/名称必填唯一/说明选填，创建后初始无权限点，走「权限配置」分配；错误提示以后端 400/409 为准） |
| 管理员账号（角色与账号 Tab） | /system/account?tab=admins | 管理员列表（账号/姓名/角色/状态/最后登录/创建时间）+ 筛选栏（搜索/查询/重置 + 右端**新增管理员**从独立按钮行移入筛选栏） | 新增/编辑（账号、姓名、角色）；启停；重置密码（≥8 位）；新增未传密码时后端返回随机初始密码一次性提示 |
| 修改密码 | /system/change-password | 原密码 + 新密码（≥8 位含字母与数字）+ 确认 | 改密成功即登出跳登录页（后端黑名单当前账号全部会话）；**开启系统配置「密码过期强制改密」后，密码超期的管理员登录会被引导到本页**（其它接口 403「密码已过期，请先修改密码」，改密即解除；开关默认关闭则密码永不过期） |
| 在线会话（角色与账号 Tab） | /system/account?tab=sessions | 当前在线管理员会话（账号/姓名/IP/设备/登录时间）+ 筛选栏（关键词筛选行内）+ **一键强制下线**（右端危险色，popconfirm 确认） | 单会话强制下线与一键下线均走 Redis 黑名单即时生效；一键下线**保留当前操作者会话**，成功提示实际下线数（0 时提示无其他会话）；接口 `POST /auth/sessions/kick-all` |
| 素材库 | /assets/library | 图片素材网格：来源筛选（全部/资讯发布/投稿内容/**租赁合同**/未关联）+ 文件名搜索 + 数量/总大小统计 | 上传（受系统配置限制）；复制 URL；**替换**（同 URL 覆盖，引用方即时生效）；删除；来源标签 `资讯发布-A1010`/`投稿内容-SU1006`/`租赁合同-LS1001`/`未关联`（租赁合同由「租赁详情 > 合同」上传，删除同样受该页约束） |
| 系统监控 | /system/monitor | 服务健康/运行时长/接口平均延迟/DB·Redis 延迟 + Redis 概览（内存/命中率/键数/版本）+ 定时任务表 | 执行日志抽屉；**手动执行**（popconfirm 确认，`POST /monitor/jobs/:name/run`，执行后刷新概览并重载该任务日志）；lastResult 三态 success/failed/unknown |
| 归档管理 | /system/trash | 14 域 Tab（社区企业/合作企业/资讯发布/投稿内容/公告栏/需求/项目/活动/租赁/空间预约/商品/商城订单/申请审核/用户留言）+ 关键词搜索 + 每页独立「归档设置」 | 恢复；彻底删除（普通域 popconfirm；**用户历史域三连确认**：两次确认 + 输入「永久删除」）；归档设置：自动归档开关/延时/可归档状态、自动删除开关/延时（用户历史域开启自动删除需三连确认） |
| 403 无权限 | /403 | RBAC 无权限落地页 | 返回工作台 |
| 租约打印 | /prints/lease/:id | 独立于 AdminLayout 的裸页（window.print 干净纸张）；单据数据取 `GET /admin/leases/:id/print`（标题 + 租约 + 条款，不再拉取整表） | 打印/返回；从租赁列表或详情进入 |
| 审核单打印 | /prints/approval/:id | 独立裸页；专用打印接口直取详情（不受列表分页限制） | 打印/返回；从申请抽屉进入 |

## 6. 种子数据模式（唯一来源 `apps/api/prisma/seed-data/`）

- 演示数据唯一来源 = 后端 Prisma 种子（`prisma/seed.ts` + `prisma/seed-data/`，`pnpm db:reset` 幂等重建）；实体覆盖 users / enterprises / externalEnterpriseProfiles / applications / demands / projects / events / goods / redemptionOrders / pointsRules(9) / experienceRules(6) / levelTiers / workstationAreas / workstations / leases / spaces / reservations / columns / articles / banners / announcements / adminUsers / adminRoles 等
- 跨页一致性由服务端保证：用户的 `identities[].enterpriseId`（社区企业身份）↔ 企业详情成员列表（由身份派生计算）；申请申请人 ↔ 用户表；需求发布方 ↔ 用户+企业；项目承接方 ↔ 企业/用户表（share 合计 100）；活动报名/签到记录引用同一批人名；办公位分配 ↔ 入驻记录与租约；兑换订单 ↔ 积分流水 ↔ 用户余额（末笔 balance 一致）；空间预约/活动场地 ↔ 空间名称；办公位.area ↔ 区域名称
- 积分/经验流水 source 字段：PointsRecord/ExperienceRecord 均含 `source: rule | manual | redemption | space`（经验无 redemption/space）——rule=规则自动发放（operator=系统）、manual=管理员手动调整（adjustPoints/adjustExperience 产生）、redemption=商城兑换扣减（仅积分）、space=空间预约扣分与驳回/取消退回（仅积分）；"发放记录"页只取 rule；详情流水仍全量展示
- 命名前缀（seed 预置 23 个 IdSequence，素材在运行期发号）：用户 U1001+ / 企业 E2001+ / 申请 AP3001+（审批单编号沿用）/ 需求 D4001+ / 项目 P5001+ / 活动 EV6001+ / 合作企业 XE7001+ / 经验流水 EX8001+ / 积分流水 PT9001+ / 商品 G1001+ / 兑换订单 RO2001+ / 办公位 WS1001+ / 办公位区域 WA1001+ / 租约 LS2001+ / 空间 S1001+ / 空间预约 SR2001+ / 文章 A1001+ / 投稿 SU1001+ / 栏目 CL2001+ / 展示页申请 SC1001+ / 公告 AN1001+ / 通知 N9001+ / 审计 AL；素材 AST（运行期发号）；积分/经验规则 = 触发项语义 code（写死，无独立编号）；项目另有 per-year `CODE-<year>` 项目代号
- 列表数据量 8~20 条，覆盖长/短文本、各状态、空态可演示；空间预约与展示页申请由早期 approvals 迁移而来（编号连续性保留）

## 7. API 层约定（`src/api/`：全量真实 HTTP）

> **接入状态**：`src/api/` 共 36 个文件（`http.ts` + 35 域文件）**全部**经 `api/http.ts` 接入真实 HTTP，无任何本地 mock 数据源；视图层只调用 API 层。

- `http.ts` 统一封装：fetch + `Authorization: Bearer <joinyuu_admin_token>`；包络解包直接返回 `body.data`；非 0 业务码或 HTTP 错误 `throw new Error(body.message)`，页面统一 `MessagePlugin.error(e.message)`；**401 清空 token/名称/权限三类 localStorage 缓存并跳 `#/login`**（避免残留旧权限集合）；30s 超时 Abort 抛「请求超时，请稍后重试」；`httpUpload` 走 multipart（不设 Content-Type，浏览器补 boundary）
- 全部 async 函数，无 `delay` 模拟；loading 圈尺寸统一 `size="small"`（表格 `:loading` 与 `t-loading` 包裹一致），禁止各页面自定尺寸
- 错误文案以后端为准（400/404/409 + 固定中文消息，见 wiki-backend §4）；写操作由服务端统一下发审计与通知，前端不再自行记审计
- 前缀统一 `/api/admin/**`（客户端接口未来为 `/api/app/**`，共享实体）；dev 经 vite proxy 转发到 `http://127.0.0.1:7757`

## 8. 动效与细节

- 页面载入：卡片 120ms 交错淡入上移（`.page-fade-in` 动画，dashboard 卡片 stagger）
- hover/过渡走 TDesign 组件默认；自定义过渡 ≤200ms
- 空态用 t-empty + 业务化文案（如"暂无待审核申请"），不用 lorem/示例文案
- 演示数据全部为创业社区业务语境的中文文案

## 9. 治理增强约定

- **通知中心**：顶栏铃铛（t-popup + t-badge 未读数），API `api/notifications.ts`（真实接口 `/notifications`、`/:id/read`、`/read-all`，N9001+ 种子数据）；点击未读项标记已读并跳转 link 路由，全部已读一键操作；由后端业务事件与定时任务写入
- **操作日志**：写操作由后端 `AuditInterceptor + AuditService` 统一留痕（含 IP 与 before/after 快照），前端只读消费 `api/auditLogs.ts`；不再有前端 `recordAudit`；与登录日志同挂「日志与审计」聚合页
- **数据字典**：`api/dicts.ts` 四类（demand_category / industry / event_type / **goods_category**）；**无独立页面**，维护入口按类型分置各业务页页头弹窗（需求管理「需求类别」/ 活动列表「活动类型」/ 社区企业「行业管理」/ 商品管理「商品类别」，共用 `DictEntriesDialog`，商品类别用 `GoodsCategoryDialog` 以携带类别级范围），写入仍走 `/system/dicts` 权限码；消费端模式 = ref 初始值用 `dictFallback` 词表 + onMounted 拉字典按 `status=enabled` 覆盖（需求两页/需求与活动表单/社区企业与合作企业列表/商品列表与商品表单等）
- **列表导出（R9）**：`utils/exportCsv.ts` 的 `exportCsv(filename, headers, rows)` 前端直出 CSV（带 BOM 防乱码）+ `statusLabel(entity, value)` 状态转文案 + `exportAllRows`（按现有筛选逐页拉取后导出，返回行数）；导出按钮统一放 PageHeader #actions（DownloadIcon），导出后 toast 提示条数；已接入 10 页（用户/社区个体/社区企业/合作企业/需求/项目/活动/商品/订单/租约），其中需求列表另有「导出全部」；导出 CSV 中人员/企业列同样使用 `名称 [ID]` 格式
- **一键归档（替代原表格批量操作）**：`BulkArchiveDialog`（复选框列出可归档状态，默认全选 + 二次确认）接入 8 页——申请审核、需求、项目、活动、租赁、空间预约、投稿内容、订单；单条归档按钮在对应行的终态出现；归档对象进入「归档管理」可恢复/彻底删除
- **归档管理（R12）**：13 域 Tab + 关键词搜索；恢复（popconfirm）与彻底删除（普通域 popconfirm；8 个用户历史域 `application/demand/project/event/lease/submission/reservation/order` 为三连确认：弹窗确认 ×2 + 强确认输入「永久删除」）；每域独立「归档设置」（自动归档开关/延时/可归档状态多开关、自动删除开关/延时；用户历史域开启自动删除时同样要求三连确认）；用户历史域的「彻底删除」按钮不走 popconfirm 而直接弹出三连确认流程
- **RBAC（R1）**：权限码沿用菜单路径（如 `/users`）+ 按钮级 `perm:<域>:<动作>`，前端目录 `constants/permissions.ts`（当前 55 码）与后端 `/permissions/catalog` 对齐（目录加载失败回退内置副本）；`v-permission` 为 display 方案（mounted + updated 双钩子，支持 `string | string[]` any-of）；路由守卫按 `meta.perm`（支持数组）优先、逐级回退推导权限码，无权限落地 `/403`；登录响应携带 `permissions`（无角色=空集合，前端不再兜底全量），权限缓存 `joinyuu_admin_perm_codes` 随 401 清理
- **数据范围（域维度）**：`AdminRole.dataScope`（7 域 members/biz/space/contents/mall/rules/system，空数组=全部）；登录响应携带 `dataScope` → localStorage `joinyuu_admin_scope_codes`（401 清理）；`constants/scopes.ts` 提供域标签与 `GROUP_DOMAIN`/`scopeAllowsGroup` 共享映射；菜单 `canSee` 合并范围判断、路由按 `meta.group` 域校验 → `/403`；RolePanel 提供「数据范围」列 + 7 域多选弹窗（超管不可限制）；后端 `DomainScopeGuard` 按 URL 首段域拦截（域外 403「无权限访问该数据范围」）
- **管理员与角色（R1/R2）**：角色权限页（角色列表 + 权限点分配矩阵，超管角色强制 `*`）；管理员账号页新增/编辑/启停/重置密码，新增未传密码时后端随机生成 12 位初始密码并一次性展示
- **登录安全（R3/R8）**：登录图形验证码必填（`GET /auth/captcha`，SVG dataURL，点击图片/刷新按钮换一张，失败自动刷新）；修改密码页（原密码 + 新密码 ≥8 位含字母数字，改密后当前账号全部会话强制下线并回登录页）；在线会话页（强制下线即时生效）；登录日志三态 success/failed/locked + 失败原因，支持关键词/状态/日期区间筛选；**密码周期**：系统配置「功能开关 > 密码过期强制改密」（默认关闭，后台账号密码永不过期；仅作用于后台账号，不影响客户端用户），开启后按「密码过期周期」（1-3650 天，默认 90）判定，超期登录响应 `passwordExpired=true` 并强制改密（其它接口 403「密码已过期，请先修改密码」，改密即解除；关闭开关保存配置即清理已标记账号的过期态）；验证码接口同 IP 限流 30 次/分钟
- **文件上传与素材库（R4）**：`api/assets.ts` 上传/列表/删除/**替换**（同 URL 覆盖存储内容，引用方即时生效）；素材库页来源筛选（全部/资讯发布/投稿内容/租赁合同/未关联）、来源标签 `资讯发布-A1010` / `投稿内容-SU1006` / `租赁合同-LS1001` / `未关联`、复制 URL；**业务附件复用**：租约合同走 `AssetsService.upload(..., source)`（`sourceType=lease` + `sourceId=租约号`，租约详情「合同」tab 上传/删除）；上传走后端 `StorageService`（本地磁盘 `UPLOAD_DIR`，`/api/public/files/:key`），魔数嗅探（拒绝 SVG、不信任客户端 MIME）；单文件大小上限取系统配置 `uploadMaxSizeMb`（1-100MB）；**MinIO 双驱动**：系统配置四要素（启用/endpoint/AccessKey/SecretKey）齐全时走 MinIO（bucket 自动创建），否则本地磁盘回退，保存配置即时切换（判定缓存失效）；公开读取路径不变（`/api/public/files/:key`）
- **富文本（R5）**：`RichEditor`（wangEditor v5）替换文章/公告/商品说明等 textarea，v-model=HTML；图片经 `uploadAsset` 插入；服务端白名单清洗后落库；暗色模式下由 tokens.css 的 `--w-e-*` 变量覆盖
- **系统监控（R6）**：服务健康（healthy/degraded/down）、运行时长、接口平均延迟、DB/Redis 延迟、Redis 概览（内存/命中率/键数/版本/连接数）、定时任务表（cron/上次执行/耗时/结果三态）；执行日志抽屉
- **趋势图表（R7）**：工作台「运营趋势」= 四指标（新增成员/新增需求/新增活动/发放积分）× 3/7/15/30 天，数据 `GET /dashboard/trend?days=`；`TrendChart` 纯 SVG（渐变面积 + 悬浮提示），顶部统计为**区间累计值**（非最后一日值）；「平台数据」6 卡片可点击跳对应列表（全部用户/社区个体/社区企业/合作企业/进行中的项目/资讯内容）
- **暗色模式（R10）**：顶栏切换 + `joinyuu_theme` localStorage 持久化（详见 §3）
- **列显示配置（R11）**：`ColumnController` 接入 20 个列表页（用户/社区个体/社区企业/合作企业/申请审核/需求/需求审核/项目/活动/租赁/公共空间/公共空间预约/资讯发布/投稿内容/栏目/阅读统计/展示页/公告/商品/订单），显隐+顺序本地持久化 `joinyuu_cols_<storageKey>`，支持 ESC 关闭；工作台「编辑布局」popup 同交互
- **待办卡片（并入工作台）**：`fetchDashboard().todos` 聚合六域待办数（入驻审核/需求审核/空间预约/展示页发布/文章审核/临期租约 `deriveLeaseStatus`）；工作台顶部以 StatCard 渲染（`stat-clickable` 可点击直达 + `is-active` 有待办高亮），stat-grid 6 列；文章审核待办路由映射 `/contents/submissions`
- **打印视图（R9）**：`/prints/lease/:id`（租约确认单，列表/详情进入）与 `/prints/approval/:id`（申请审核单，专用接口直取详情，申请抽屉进入）为独立裸页，`window.print` 输出干净纸张
- **系统配置**：`api/systemConfig.ts` fetch/save（真实接口）；`leaseExpireRemindDays` 校验 1-90、`uploadMaxSizeMb` 校验 1-100、`passwordExpireEnabled` 开关（默认关闭；仅后台账号）与 `passwordExpireDays` 校验 1-3650、MinIO 7 字段校验（端口 1-65535、Bucket 名称正则）；保存即生效并由后端留痕（页面展示最近保存时间/操作人），MinIO 配置保存后即时切换存储驱动；另含「名片可编辑字段」两组白名单（`api/cards.ts` fetch/saveCardSchema，控制客户端用户可自编辑的个人/企业名片字段），与系统配置共用同一次「保存配置」与未保存保护
- **交互减法与可访问性**：无面包屑（详情页提供返回）、无列表刷新按钮、无表格批量选择（详见 §4）

## 10. 后端接入状态

- 后端 `apps/api`（NestJS 11，端口 7757）：源码共 385 个 HTTP 路由装饰器（含 `/api/admin/**`、`/api/app/**` 与 health/public）；admin dev（7758）经 vite proxy 转发 `/api` → `http://127.0.0.1:7757`
- 本地启动顺序：`pnpm db:up` → `pnpm db:reset` → `pnpm dev:api` → `pnpm dev:admin`；登录为真实 JWT（admin/admin123）+ 必填图形验证码；无效/过期 token 会触发 401 → 清 token/名称/权限缓存跳登录
- 管理端全部域已 HTTP 化（含 roles / admins / assets / login-logs / monitor / trash）；种子数据唯一来源为 `apps/api/prisma/seed-data/`
- 契约细节（端点清单/入参/返回形状/状态机/错误文案）见 [wiki-backend.md](./wiki-backend.md) §6~§9。

