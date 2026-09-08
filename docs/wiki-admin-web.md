# 聚屿社区 · 管理后台 Web — 开发 Wiki

> 本文档沉淀管理后台（admin web）开发的细致描述与全部工程契约，是所有页面/子代理的唯一视觉与结构依据。
> 冻结后不得私自发明颜色、字号、圆角、间距；不得重写导航。
> 技术栈由用户指定：Vue 3 + Vite + TypeScript + TDesign Vue Next + Pinia + Vue Router（build 型交付，Mock 数据）。

## 1. Style Tier & Aesthetic Direction

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
├── .side-col           侧栏列（Logo 区 + t-menu + 折叠按钮）
└── .main-col           flex column，height: 100vh，overflow hidden
    ├── .top-bar        高 48px：左面包屑 / 右侧通知铃铛(t-badge) + 管理员头像 t-dropdown(退出登录)
    ├── .tab-bar        高 40px：多标签页（tabs store 驱动，点击切换、可关闭，"工作台"常驻不可关）
    └── .page-scroll    flex:1，overflow-y:auto，padding 16px 20px，底色 --td-bg-color-page
                          └── <router-view />（页面只写这里面的内容）
```

- 菜单：**唯一 `src/layouts/AdminLayout.vue`** 渲染；路由全部挂在其 children 下；页面组件**禁止**再写任何导航/侧栏/顶栏
- 激活态唯一机制：`t-menu :value` 绑定"当前路由归一化路径"（详情路由归一到列表路由，如 `/users/U1001 → /users`）
- 侧栏菜单（冻结，顺序不可变）：

| 分组 | 菜单项 | 路由 | 图标（已验证存在） |
|---|---|---|---|
| — | 工作台 | /dashboard | `DashboardIcon` |
| 社区成员 | 用户管理 | /users | `UserListIcon` |
| 社区成员 | 社区个人 | /individuals | `UserIcon` |
| 社区成员 | 社区企业 | /enterprises | `BuildingIcon` |
| 社区成员 | 外部企业 | /external-enterprises | `Building1Icon` |
| 社区成员 | 申请审批 | /approvals | `CheckCircleIcon` |
| 业务运营 | 需求管理 | /demands | `ViewListIcon` |
| 业务运营 | 需求审核 | /demands/review | `CheckCircleIcon` |
| 业务运营 | 项目管理 | /projects | `AppIcon` |
| 业务运营 | 活动管理 | /events | `CalendarIcon` |
| 积分管理 | 商品管理 | /mall/goods | `CartIcon` |
| 积分管理 | 订单管理 | /mall/orders | `ViewListIcon` |
| 积分管理 | 积分规则 | /mall/rules | `Edit2Icon` |
| 积分管理 | 积分账单 | /mall/ledger | `AppIcon` |
| 空间管理 | 办公位管理 | /workstations | `ViewModuleIcon` |
| 空间管理 | 办公室管理 | /workstations/offices | `BuildingIcon` |
| 空间管理 | 租赁管理 | /workstations/leases | `ViewListIcon` |
| 空间管理 | 公共空间管理 | /spaces | `MapIcon` |
| 空间管理 | 公共空间预约 | /spaces/reservations | `CalendarIcon` |
| 运营设施 | 资讯内容 | /contents | `Edit2Icon` |

- 运营设施四模块已全部落地（M0-D，2026-09-08）：原 ComingSoonView 占位已删除，「二期」菜单标签已移除
- 积分管理为一级菜单（2026-09-08 由"积分商城"Tab 壳拆分）：/mall 重定向至 /mall/goods，四个二级页面直接以面板组件作为路由页面（各含 PageHeader）
- 空间管理为一级菜单（2026-09-08 由"办公位管理/公共空间"Tab 壳拆分）：办公位管理=开放/半开放工位平面图（独立办公室移出）、办公室管理=独立办公室卡片视图（占用企业+租期+租金）、租赁管理=原租约面板；公共空间管理=原空间管理面板，公共空间预约=预约审批+当日使用看板板块；运营设施仅余资讯内容

## 4. 组件规范（统一词汇表 — 所有页面仅从此取用）

- 页面骨架：`PageHeader`（共享组件：title + description + #actions 插槽）→ 筛选区（`t-form layout="inline"`；下拉筛选项用 t-select 原生 `label` prop 标识用途：身份/状态/行业等，非 placeholder）→ 内容卡片（t-card 或裸表格区）
- 表格：`t-table`（row-key="id"，loading，pagination 分页）；自定义列一律用 column 的 `cell: 'slotName'` + `<template #slotName="{ row }">`
- 表单：`t-form / t-form-item / t-input / t-select / t-date-picker / t-textarea / t-radio-group`
- 反馈：`t-dialog`（确认/审批意见）、`t-drawer`（右侧详情抽屉，size="560px"）、`t-popconfirm`（轻量危险确认）、`MessagePlugin.success/error`（操作结果）
- 展示：`t-tag`（variant="light"）、`t-descriptions`(:column="2")、`t-tabs + t-tab-panel`、`t-timeline`（审批记录）、`t-steps`（进度节点）、`t-progress`（进度条）、`t-avatar`、`t-empty`（空态）、`t-skeleton`（加载）、`t-statistic`（统计数值——共享 `StatCard` 组件内部基于 t-statistic 封装，props 保持 label/value/icon）、`t-list + t-list-item`（弹窗内简易列表，如区域规划）
- 加载状态（组件标准化约定，2026-09-08）：表格用 `:loading` prop；卡片网格等非表格区域一律用 `<t-loading :loading="...">` 组件包裹——**禁止使用 `v-loading` 指令**（TDesign 无此指令，Element Plus 风格，运行时静默失效不报编译错）；StatCard 等自定义组件优先以 TDesign 组件为内核实现
- 状态标签：**必须**用共享 `StatusTag` 组件 + `constants/status.ts` 的状态映射，禁止页面自造状态文案/配色
- 身份标签：**必须**用共享 `IdentityTags` 组件 + `constants/identity.ts` 的身份词汇表（`identityTypeMap` / `roleLabelMap` / `userCategoryOptions`），禁止页面自造身份文案
- 用户模型与微信登录预备（冻结，2026-09-09）：**UserStatus 仅剩 active/frozen**（待激活 pending 移除，mock 样例已转 active）；字段改名 **`id`→`uid`、`name`→`nickname`**（昵称语义，微信登录预备；全站 User 引用同步：fetchUserOptions/fetchPublisherOptions/fetchRenterOptions 返回结构、 undertaker 立项候选、用户详情路由传参等；**业务快照字段名不改**——demand.publisherName、spaceReservation.userName、project.undertakers[].name、external 成员 name 等仍是展示快照，仅取值源改 nickname）；新增 `realName?`/`citizenId?`（实名信息）、`wechatOpenid?`/`wechatUnionid?`/`wechatVerified?`（微信登录预留，默认未认证）、`frozenUntil?`/`frozenReason?`（冻结信息，解冻时清除）；**实名状态 = 派生值**（realName 与 citizenId 均填写=已实名，否则未实名），列表列/筛选/详情均按此规则，不落独立字段；**社区个人（community_individual）身份要求已实名**——不存在未实名的社区个人，mock 数据保证（未实名用户仅持有 individual 基础身份）

- 用户身份模型（冻结）：`identities: UserIdentity[]`，一人多身份——`individual` 个人用户（注册默认身份，人手一份，关联其他身份时保留，积分挂靠此身份）、`community_individual` 社区个人（至多一个，持有经验等级）、`community_enterprise` 社区企业（可多个，关联入驻企业，持有经验等级）、`external_enterprise` 外部企业（可多个，自由填写）；身份标签配色：社区身份=品牌蓝 light、个人用户/外部企业=灰；「个人用户」快捷筛选 = 仅持有基础个人身份的用户
- 经验与积分（冻结）：经验等级 1-5 级，仅社区个人/社区企业身份拥有，通过参加活动、承接项目累积升级；积分仅挂靠个人用户身份（人人可有），获取途径同前，可在积分商城兑换礼品/权益
- 需求提交与审核（冻结）：任何注册并填写手机号的用户均可提交需求；多身份用户提交时选择所用身份（`publisherIdentity` 快照）；需求状态流 = **待审核 →（审核通过）→ 待发布 →（立即发布 / 定时发布）→ 已发布 / 定时发布中 →（到点自动）→ 已发布**，另有 已驳回（审核驳回必填原因）/ 已关闭 / 已发布→立项→已立项（承接）分支（**草稿状态已移除**，2026-09-09：创建表单无存草稿，历史草稿编辑/完成并发布流程一并移除）；**审核为只读**（不允许编辑任何项，对话框底部按钮从左到右=取消/驳回/通过，取消=关闭不做动作，通过=转待发布，驳回=必填原因）；**待发布**可操作=编辑（任意项，按钮「保存」，不改状态）/立即发布/定时发布（对话框设置时间，按钮=取消/定时发布）/关闭；**定时发布中**仅可操作=取消定时发布（转回待发布），状态标签直接显示定时发布时间；**已发布**可操作=**立项**（多选承接方与占比/里程碑，立项后转已立项）/ **撤回发布**（转回待发布，清空发布时间）/ **关闭**，列表操作列不再提供「详情」按钮（行点击进详情）；需求记录 **发布时间 `publishedAt`**（实际发布/到点自动发布时写入，列表「发布时间」列可按正倒序排序）；后台可直接创建需求：**提交人选择器 = t-select `filterable + creatable`**（2026-09-09，选项=全部个人用户+全部企业，`U:ID`/`E:ID` 前缀值，未注册可直接输入自建条目；选中已注册自动填充联系电话/邮箱——用户取 phone/email，企业取 contactPhone/contactEmail），提交身份快照仅注册个人用户可选（企业/自建为 null）；表单含**联系电话（必填）/联系邮箱（选填）**并随需求记录（Demand 新增 `contactPhone?`/`contactEmail?`，历史数据可能缺省）；创建即立即上架不经过审核（**创建表单不提供定时发布与存草稿选项**，定时发布仅在待发布「定时发布」可用）；已匹配状态已移除（已匹配=已发布）；立项可——**多选**承接社区企业/社区个人，各填承接占比（整数百分比，默认均分、除不尽时首个承接方取余数，如 3 方=34/33/33，可调整，合计须为 100%），可选里程碑节点且每个节点可多选负责承接方；生成项目并双向关联（demand.projectId ↔ project.sourceDemandId）
- 项目模型（冻结）：`undertakers: ProjectUndertaker[]`（type/id/name/share 承接占比）；里程碑含 `owners`（负责承接方展示名，可多选）；后台可直接创建项目（无来源需求，复用同一表单弹窗）；项目无后台报名审核（报名概念移至客户端），后台展示承接方占比、进度节点与来源需求（来源需求可点击跳转需求详情）
- 活动模型（冻结）：活动状态流 = **待发布 →（立即发布 / 定时发布）→ 已发布（报名中/暂停报名）↔→ 已结束 / 已取消**，另有 已取消分支；**新创建活动一律进入「待发布」**（创建表单无定时发布选项），可操作=编辑/立即发布（开放报名）/定时发布（对话框设置时间，按钮=取消/定时发布）/取消活动；**定时发布中**仅可操作=**取消定时发布**（转回待发布），状态标签直接显示定时发布时间；**已发布**可操作=**暂停报名 / 开放报名**（`enrollmentOpen` 开关，状态标签显示"已发布（报名中）/已发布（暂停报名）"）与**取消活动**；**结束时间过后自动转为「已结束」**（服务端定时任务/模拟层按 endTime 判定）；已结束/已取消无操作；已移除 草稿 / 进行中 状态（活动草稿功能与存草稿按钮一并移除）；其余字段与报名管理（审核、签到）不变
- 范围选项（冻结）：可见/可报名范围的身份选项中「个人用户」「外部企业」均标注**不受等级约束**（两者皆无经验等级）；等级筛选仅对社区个人/社区企业身份生效
- 身份展示规则（冻结）：个人用户为注册默认身份——用户列表「关联身份」列、社区个人列表「其他关联身份」列、用户详情「身份信息」页签均不展示（仅持有个人身份时显示 —/空态）；需求/活动的提交身份快照保留显示
- 成员/用户名展示规则（2026-09-09）：涉及具体人的展示列优先 `realName`、为空回退 `nickname`（如社区企业详情成员管理列 `row.realName || row.nickname`）；业务快照字段名不改——demand.publisherName、spaceReservation.userName、project.undertakers[].name、external 成员 name 等仍是展示快照，仅取值源改 nickname
- 身份卡跳转（2026-09-09）：社区企业身份卡 → 入驻企业详情（enterpriseId）；外部企业身份卡 → 外部企业详情（external_enterprise 身份无 enterpriseId 字段，按"档案名 + 成员 userId"反查档案 ID，UserDetailView 加载外部企业档案列表反查，可解析才显示可点击）
- 数据概览联动（冻结）：用户详情数据概览（需求发布/参与项目/活动报名）由需求/项目/活动数据实时汇总，卡片有数据时可点击跳转对应列表并按该用户自动筛选——query **仅携带用户 ID**（`publisher`/`participant`），按 ID 过滤避免同名歧义；社区企业/外部企业详情也有数据概览选项卡（需求发布=以该企业身份发布的需求量、参与项目=该企业承接的项目量），跳转 query 携带 `enterprise`——**一律传企业 ID**：社区企业 E2001（按 publisherIdentity.enterpriseId / 承接方 t.id 匹配）、外部企业 XE7001（按 ID 解析档案名后以 enterpriseName / 成员个人承接匹配）；列表以可关闭标签展示该筛选，名称解析：社区企业经 fetchEnterprise、外部企业经 fetchExternalEnterprise 由 ID 解析（均失败回退显示原值），重置时一并清除
- 经验值与积分账本（冻结）：`mock/ledgers.ts` 双流水（ExperienceRecord 前缀 EX8001+ / PointsRecord 前缀 PT9001+），每笔含 delta/balance（变动后余额）/reason/at/operator，末笔 balance 与实体当前值一致；经验值归属=社区企业（Enterprise.experience）或社区个人身份（UserIdentity.experience），积分归属=用户（User.points，挂靠个人用户身份人人可有）；账本选项卡——企业详情「经验值」（可增减）、用户详情「经验值」（**仅持有社区个人身份的用户显示**，可增减）、用户详情「积分」（所有用户，可增减）；调整经共享 `AdjustValueDialog`（方向+数量+必填事由，扣减不超余额、余额不可为负），API：`GET/POST /api/admin/experience-records`（入参 targetType+targetId）、`GET/POST /api/admin/points-records`
- 组件标准化审计结论（2026-09-08，全库扫描）：依赖仅 vue 全家桶 + tdesign-vue-next/icons + pinia，无任何第三方 UI 库；非 TDesign 指令 0（v-loading 已清理）；17 个共享组件**全部**为 t-* 内核封装（PageHeader 已改为 t-typography-title/paragraph 内核，字号间距仍由 tokens.css 的 .page-header .page-title/.page-desc 控制，选择器已提升权重防 TDesign 默认值覆盖）；视图层自绘 DOM 已收敛：工位/办公室卡片改为 **t-card（size="small" + hover-shadow）内核**，边框/圆角/阴影来自 TDesign，状态底色经类覆盖容器背景，内容排布用 :deep(.t-card__body) 控制；剩余自绘 DOM（图例色点、board 卡片、.page-card 容器）为装饰/布局元素，保留现状
- 开发环境约定（2026-09-09，冻结）：**admin-web dev 端口统一 7758**（package.json dev 脚本已固化 `vite --port 7758`），浏览器访问 `http://localhost:7758`；调试须知：路由守卫要求登录态，localStorage `joinyuu_admin_token` 设任意非空值即可进入（mock 登录）；不要使用其他端口（如 5199）起 dev server

- 表格布局约定（2026-09-09）：凡开启 `resizable` 的 t-table 必须用 **`table-layout="fixed"`**（TDesign 警告 auto+resizable 组合；控制台刷屏）；列宽全部显式声明 width/minWidth，fixed 下按声明生效；无 resizable 的表格可保留 auto（如空间详情预约明细）

- clearable 约定（2026-09-09，全量开启）：需求/项目/活动/商城/办公位/空间六域的**所有** t-input / t-select / t-date-picker / t-time-picker / t-tree-select 一律开启 `clearable`（筛选与表单皆含），方便用户快速清除；t-textarea / t-input-number / t-radio-group / t-switch 无 clearable 能力不适用；批量替换用 sed 行级守卫（`/clearable/!s/...`）防止重复属性
- 空间模型补充（2026-09-09）：Space 新增 `allDay?`（全天开放开关，默认关闭）——开启后表单隐藏开放/关闭时间设置项，持久化 openTime='00:00'/closeTime='23:59'，列表与看板时段列显示"全天开放"；Space 新增 `needReservation?`（需预约，默认关）与 `needApproval?`（需审批，仅需预约开启时显示，关闭需预约自动联动关闭）——两者由 SpaceFormDialog 开关维护，详情页"预约方式"行展示（需预约·需审批 / 需预约·免审批 / 免预约）；**api/spaces createSpace/updateSpace 需同步拷贝新增字段**（此前 allDay 无效的根因即漏拷贝）
- 空间详情页（2026-09-09，路由 /spaces/:id）：公共空间管理列表**行点击跳转详情页**（操作列已阻断冒泡），页面含空间信息 descriptions + **预约日历（2/3 宽）+ 当月预约明细（1/3 宽）双栏**（t-calendar cellAppend 插槽按 formattedDate 追加当日预约摘要，最多 3 条 + 状态着色 + 图例；明细随日历展示月份联动——监听 controller-change 取 filterDate 更新 displayedDate，按 YYYY-MM 前缀过滤；controllerConfig.mode.visible=false 禁用月/年视图切换，保留年份/月份下拉与今天按钮；窄屏 ≤1100px 单列堆叠）；t-calendar cellAppend 的 CalendarCell 提供 formattedDate/belongTo（belongTo=0 才是本月日期，跨月溢出格不渲染追加内容）
- **Calendar cellAppend 插槽签名（易错，2026-09-09，两次返工后定案）**：插槽作用域 = **CalendarCell 本体** `#cellAppend="cell"`（作用域整体即 CalendarCell）**；解构写法 "{ cell }" 与 "{ params }" 都会让解构结果为 undefined → 每单元格一次渲染错误，**tbody 整体渲染失败 → 只剩控制器和星期表头、日期全无**（曾把 "{ params }" 误判为正确写法，实测 105 次渲染错误复现后修正）；勿改回解构写法；日期取值统一走组件内 `reservationsOn(date)` 辅助函数（永不返回 undefined），模板不做非空断言
- 圆角约定（冻结，2026-09-08）：全站 border-radius **一律使用 TDesign radius token**——`--td-radius-small`(2px)/`--td-radius-default`(3px)/`--td-radius-medium`(6px)/`--td-radius-large`(9px)，圆形用 50%；**禁止硬编码 px**（历史上 2/3/4/6/8/9px 混用导致与 TDesign 组件观感不一致，已全量 token 化）；新增样式时按控件语义取值：输入/按钮等控件=medium，卡片/弹窗类容器=large，小徽标/点缀=default；使用 t-card/t-dialog 等容器组件时圆角与边框直接继承，不再手写
- 租赁方模型（冻结，2026-09-08）：Lease 新增 `renterType?: LeaseRenterType`（enterprise=注册企业/individual=注册个人用户/custom=未注册自建条目；旧数据按 enterpriseId 前缀推断：E 开头=企业）；创建租约的"租赁方"选择器 = t-select `filterable + creatable`，选项 = 全部企业 + 全部个人用户（`E:ID`/`U:ID` 前缀值），**选中已注册租赁方自动填充联系人/电话**（企业取 contactName/contactPhone，个人用户取 name/phone），custom 不填充改为手动输入；createLease 服务端校验 enterprise/individual 类型对应 ID 存在；工作台惯例：可选 props 的合法性以 TDesign MCP 查证为准（select 无 hint prop，提示用内置 `tips` prop 或 t-form-item）
- 工位与租约计费模型（冻结，2026-09-08）：Workstation 新增 `defaultMonthlyRent?`（默认月租，元）与 `areaSqm?`（面积㎡，仅独立办公室表单出现）；Lease 新增 `rentPeriod?: RentPeriod`（day/week/month/year，**缺省按月租处理**）与 `longTerm?`（**长期租约：无结束日期 endDate 为空串，不参与临期/到期派生**，列表/办公室卡片显示"startDate ~ 长期"）；创建/编辑租约表单含"付款周期"**按钮形态单选**（t-radio-group `theme="button"` + `variant="primary-filled"`，日付/周付/月付/年付，默认月付），租金标签动态为"租金（元）/ 日|周|月|年"；**租金联动**：周期≠月租时清空租金输入框（必填规则兜底），周期=月租且所选工位存在默认月租时自动累加填入（仅创建模式、求和>0 才覆盖）；**选择工位用 t-tree-select**（multiple+filterable+clearable+minCollapsedNum=3，一级=已有区域、二级=区域下空闲工位编号）；租赁管理列表"租金（元）"列显示"金额 / 单位"，办公室卡片租约行同格式；表单日期标签为"租赁开始日期/租赁结束日期"，结束日期旁带"长期"开关（开启禁用日期选择，非长期必填结束日期）
- 空间表单（2026-09-08）：配备设备栏改用 **t-tag-input（clearable）**，值即 equipment string[]（回车添加标签、可整体清空），替代原"逗号分隔文本 + parseEquipment"方案；设备名多词直接建一个标签（如"智能投屏"）
- 表单弹窗校验时机（冻结）：规则 trigger 一律 `submit`——change/blur 自动校验会提前红框（值变化触发 change、DatePicker 面板交互引发失焦触发 blur）；`submit` 不匹配任何自动触发，确认时 `formRef.validate()`（trigger='all'）命中全部规则才红框提示；弹窗打开时 `nextTick` 调 `formRef.clearValidate()` 清除上次残留（仅清状态不动值）；带草稿按钮的弹窗用自定义 footer——**直接用 #footer 插槽且不设 footer prop**（TDesign 源码 `!!props.footer && renderFooter()`：`footer=false` 会连插槽一起禁用，导致按钮全部消失）；也不设 confirm-btn/cancel-btn props（避免与插槽重复渲染）
- 表格规范（冻结）：所有列表页 t-table 统一 `table-layout="auto"` + `hover` + `resizable`（列宽可手动拖拽调整，数据列加 `resizable: true`）；服务端排序列 `sorter: true, sortType: 'all'` + 受控 `:sort` 绑定 + `@sort-change`（远程排序：更新 sortBy/sortOrder 后重新加载，切排序回第 1 页）——活动列表（默认 ID 倒序，活动开始时间/创建时间列；编号列已移除，编号置于标题下方）、需求列表（默认创建时间倒序，创建时间/发布时间列）、项目列表（默认立项日期倒序，立项日期列）、外部企业列表（默认累计合作倒序，累计合作/首次合作列）；本地排序与服务端结果一致（定长 ID/时间格式），受控 sort 保证表头指示器正确
- 草稿与定时发布（冻结）：**项目**（创建/立项复用弹窗）有「存草稿」按钮（不校验必填，状态=草稿）；**需求的草稿状态已移除**（2026-09-09）——创建表单移除「存草稿」，DemandPublishDialog 仅剩 create/edit 双模式（publish 模式删除），需求草稿关联的编辑/完成并发布/定时发布流程一并移除；**活动已移除草稿状态**——创建表单同步移除存草稿与定时发布选项，新活动统一进入待发布；**需求/活动定时发布中均不可编辑**，仅可「取消定时发布」转回待发布（两者 schedule 编辑模式均已移除）；scheduled 状态的列表/详情状态标签**直接显示定时发布时间**（hover 提示"到点自动发布"），不显示"定时发布中"文案
- 详情页范围展示（冻结）：可见范围与可报名范围标签同行展示（`scope-row` 容器，两组之间竖线分隔，窄屏自动换行）
- 时间线组件约束（冻结）：`t-timeline` 必须显式 `mode="same"`——TDesign 默认 mode=alternate 且 label 类恒生效（hasLabelItem 硬编码为 1），alternate+left 布局会给圆点列加 margin-left:100px，导致内容整体缩进居中；时间不放 label 属性（绝对定位会与内容重叠），放内容块内独立一行
- 全局动效约束（冻结）：页面入场动画 fill-mode 一律 `backwards`，禁止 `both`/`forwards` —— 动画残留 transform 会使页面根成为 Dialog/Drawer 固定定位弹层的包含块，弹层高度被页面内容高度裁切（短页面尤为明显）
- 状态映射（冻结）：
  - 用户 user：active=正常/success，frozen=已冻结/danger（hover 显示冻结期限与原因；**待激活 pending 状态已移除**，2026-09-09）
  - 企业 enterprise：active=已入驻/success，pending=入驻审核中/warning，exited=已退出/default
  - 企业展示页 showcase：published=已发布/success，pending=待审核/warning，rejected=已驳回/danger，none=未提交/default
  - 申请 application：pending=待审批/warning，approved=已通过/success，rejected=已驳回/danger
  - 需求 demand：pending=待审核/warning，pending_release=待发布/primary，scheduled=定时发布中/primary（直接显示时间），published=已发布/success，rejected=已驳回/danger，projected=已立项/success，closed=已关闭/default（已匹配状态已移除；草稿状态已移除）
  - 项目 project：recruiting=招募中/primary，running=进行中/success，paused=已暂停/warning，finished=已结项/default
  - 活动 event：pending_release=待发布/warning，scheduled=定时发布中/primary（直接显示时间），published=已发布/success（已发布（报名中）/已发布（暂停报名）拼接），ended=已结束/default，cancelled=已取消/danger（已移除 草稿/进行中）
  - 商品 goods：on=已上架/success，off=已下架/default
  - 兑换订单 redemption：pending_shipment=待发货/warning，shipped=已发货/primary，finished=已完成/success，cancelled=已取消/default
  - 积分规则 rule：enabled=已启用/success，disabled=已停用/default
  - 工位 workstation：idle=空闲/success，assigned=已分配/primary，maintenance=维护中/warning
  - 租约 lease：active=生效中/success，expiring=即将到期/warning（15 天内派生），expired=已到期/danger（过期派生），terminated=已终止/default
  - 空间 space：available=可用/success，maintenance=维护中/warning，disabled=已停用/default
  - 空间预约/展示页申请 reservation：pending=待审批/warning，approved=已通过/success，rejected=已驳回/danger，cancelled=已取消/default
  - 文章 article：draft=草稿/default，pending=待审核/warning，published=已发布/success，withdrawn=已下架/default，rejected=已驳回/danger
  - 栏目 column：enabled=启用/success，disabled=停用/default
- 选项词汇表（M0-D，`constants/status.ts`）：goodsCategoryMap（physical 实物商品/virtual 虚拟服务/voucher 权益券）、workstationTypeMap（open 开放工位/office 独立办公室/semi 半开放工位）、spaceTypeMap（meeting 会议室/roadshow 路演厅/meeting_room 洽谈室/multi 多功能厅/study 自习室）、spaceStatusOptions、showcaseTargetTypeMap（enterprise 企业展示页/individual 个人主页）
- 共享表单/功能弹窗（M0-D）：GoodsFormDialog / LeaseFormDialog / SpaceFormDialog / ArticleFormDialog / WorkstationFormDialog（工位创建+资料编辑）/ AreaPlanDialog（区域规划），均遵循表单弹窗契约

## 5. 页面清单（第一轮：骨架+核心链路）

| 页面 | 路由 | 职责 | 关键交互 |
|---|---|---|---|
| 登录 | /login | 品牌区 + Mock 登录 | 演示账号 admin/admin123，校验/加载/错误反馈 |
| 工作台 | /dashboard | 数据卡片 + 待办审批 + 近期活动 + 快捷入口 | 点击待办跳审批页、活动跳活动详情 |
| 用户列表 | /users | 筛选（关键词/身份/状态）+ 表格 + 分页 | 冻结/解冻 popconfirm，行点击进详情 |
| 用户详情 | /users/:id | 资料 / 身份信息 / 活跃记录（tabs） | 社区企业身份卡点击跳转企业详情 |
| 社区个人 | /individuals | 社区个人身份成员列表（关键词/状态筛选） | 行点击进用户详情 |
| 企业列表 | /enterprises | 社区企业筛选（关键词/行业/状态）+ 表格 | 行点击进详情 |
| 企业详情 | /enterprises/:id | 企业信息 / 成员管理 / 展示页审核（tabs） | 成员行点击进用户详情；展示页通过/驳回（意见 dialog）；头部企业名下方展示企业ID标签 |
| 外部企业 | /external-enterprises | 外部企业聚合列表（行业筛选 + 累计合作/首次合作排序 + 关联成员，无展示页） | 行点击进详情 |
| 外部企业详情 | /external-enterprises/:id | 企业信息（企业ID标签/行业/合作/简介）/ 关联成员（tabs） | 成员行点击进用户详情 |
| 申请审批 | /approvals | 入驻申请与身份绑定审批（空间预约已迁至公共空间、展示页发布已迁至资讯内容，M0-D 完成迁移） | 通过/驳回（意见 dialog）、审批时间线 |
| 需求列表 | /demands | 筛选（关键词/分类/状态，含待发布）+ 表格（创建时间/发布时间可排序） | 创建需求（选提交人+身份，创建即发布）；待审核→只读审核（通过=转待发布）；待发布→编辑/立即发布/定时发布/关闭；定时发布中→取消定时发布；已发布→立项/撤回发布/关闭；已立项→查看关联项目（列表无「详情」按钮，行点击进详情） |
| 需求审核 | /demands/review | 固定「待审核」状态的需求集中审核（关键词/分类筛选+创建时间排序） | 审核（只读对话框：取消/驳回/通过，通过=转待发布）；行点击进详情 |
| 需求详情 | /demands/:id | 详情（含定时/发布时间、报名截止时间）/ 响应记录（tabs） | 同列表操作（头部操作区）；已立项→跳转关联项目 |
| 项目列表 | /projects | 筛选 + 表格（承接方占比列 / 进度列） | 创建项目（多承接方+占比+里程碑）；行点击进详情 |
| 项目详情 | /projects/:id | 项目信息（承接方占比/说明/来源需求）/ 进度节点（含负责承接方）（tabs） | 来源需求跳转需求详情 |
| 活动列表 | /events | 筛选（类型/状态：待发布/定时发布中/已发布/已结束/已取消）+ 表格（活动开始时间/创建时间可排序，编号在标题下方） | 创建活动（无定时发布选项，创建即待发布）；待发布→编辑/立即发布/定时发布/取消活动；定时发布中→取消定时发布；已发布→暂停报名/开放报名、取消活动（列表无「详情」按钮，行点击进详情） |
| 活动详情 | /events/:id | 信息（双范围/报名审核/报名截止/定时发布）/ 报名管理 / 签到管理（tabs） | 编辑活动、报名审核、手动签到（更新 mock） |
| 商品管理 | /mall/goods | 积分商品列表（关键词/类型/状态筛选） | 上架商品（创建即上架）/编辑/上下架 |
| 订单管理 | /mall/orders | 兑换订单列表（关键词/状态筛选）+ 详情抽屉（收件信息） | 发货→标记完成；取消订单退积分+回补库存（联动 adjustPoints） |
| 积分规则 | /mall/rules | 行为积分规则列表（说明/文章数聚合） | 创建/编辑（创建即启用）、启用/停用 |
| 积分账单 | /mall/ledger | 全量积分流水 + 发放/消耗/笔数汇总卡片 | 与用户详情积分流水同源 |
| 办公位管理 | /workstations | 开放工位/半开放工位平面图（按区域分组网格+状态图例+状态底色卡片+汇总卡片；独立办公室移至办公室管理页） | 筛选栏：区域下拉（仅开放/半开放区域，含全部）+ 状态下拉，与**状态卡片点击筛选**联动（点「办公位总数」取消；可叠加；汇总卡片始终统计全量）；区域规划弹窗（区域增改删，改名级联工位冗余列；保存后页面静默刷新不闪遮罩）；创建办公位；点击卡片编辑工位信息（含"维护中"开关、删除工位——已分配时均禁用；备注选填） |
| 办公室管理 | /workstations/offices | 独立办公室卡片视图（容纳人数/占用企业/租约号+租期+月租金，状态底色卡片+图例） | 筛选栏：区域下拉（仅独立办公室区域，含全部）+ 状态下拉，与**状态卡片点击筛选**联动；区域规划；创建办公位（默认独立办公室类型）；点击卡片编辑工位信息（含"维护中"开关、删除工位；备注选填）；工位区域选项每次打开弹窗均重新拉取 |
| 租赁管理 | /workstations/leases | 租约列表（生效中/即将到期/已到期/已终止汇总卡片） | 创建租约=分配工位（锁定空闲工位）：**租赁方可选已注册企业/个人用户（自动填充联系人/电话），也可直接输入未注册租赁方创建条目**（t-select creatable+filterable+tips）；编辑续期（租赁方/换工位需终止重建）；终止释放工位；expiring/expired 读取时派生 |
| 公共空间管理 | /spaces | 空间列表（类型/容量/开放时段/设备/状态） | 新增/编辑空间、维护登记/停用/恢复 |
| 公共空间预约 | /spaces/reservations | 预约审批（状态 Tab+空间/日期筛选+时间线抽屉）+ 当日使用看板板块 | 通过/驳回（意见对话框，通过前校验时段冲突）、取消；看板=当日已通过预约+同名空间已发布活动合并占用 |
| 资讯内容 | /contents | Tab 壳：文章管理 / 栏目管理 / 展示页发布 / 阅读统计（4 面板） | 文章草稿→提交审核→通过发布/驳回（原因）→下架→可再提交；栏目增改/启停（改名同步文章冗余列）；展示页审批（企业目标联动企业展示页状态）；阅读量排行+汇总卡片 |

## 6. Mock 数据模式（单一数据源 `src/mock/`，跨页一致）

- 实体：users(15) / enterprises(9) / applications(10，仅入驻+身份绑定) / demands(13，含待发布/定时发布样例) / projects(8，立项可动态新增) / events(9，含待发布/定时发布/暂停报名样例) / externalEnterpriseProfiles(4) / goods(9) / redemptionOrders(6) / pointsRules(8) / workstationAreas(3) / workstations(20，A/B/C 三区) / leases(8) / spaces(6) / reservations(12) / columns(5) / articles(10) / showcaseRequests(5)
- 跨页一致性：用户的 `identities[].enterpriseId`（社区企业身份）↔ 企业详情成员列表（由身份派生计算）；审批单申请人 ↔ 用户表；需求发布方 ↔ 用户+企业；项目承接方 ↔ 企业/用户表（share 合计 100）；活动报名/签到记录引用同一批人名；工位分配 ↔ 企业入驻记录与租约（虚拟入驻企业无工位）；兑换订单 ↔ 积分流水 ↔ 用户余额（末笔 balance 一致）；空间预约/活动场地 ↔ 空间名称；工位.area ↔ 工位区域名称（区域改名由 API 层级联刷新）
- 命名前缀：用户 U1001+ / 企业 E2001+ / 审批 AP3001+ / 需求 D4001+ / 项目 P5001+ / 活动 EV6001+ / 外部企业 XE7001+ / 经验流水 EX8001+ / 积分流水 PT9001+ / 商品 G1001+ / 兑换订单 RO2001+ / 积分规则 R01+ / 工位 WS1001+ / 工位区域 WA1001+ / 租约 LS2001+ / 空间 S1001+ / 空间预约 SR2001+ / 文章 A1001+ / 栏目 CL2001+ / 展示页申请 SC1001+
- 列表数据量 8~20 条，覆盖长/短文本、各状态、空态可演示；空间预约迁移自 applications（SR2001←AP3003、SR2002←AP3007、SR2003←AP3010），展示页申请迁移（SC1001←AP3002、SC1002←AP3005、SC1003←AP3011）

## 7. API Stub 约定（`src/api/`，未来真实接口的形状）

- 全部 async + `delay(语义 300~500ms)` 模拟延迟，让 loading 状态可见；**delay() 内置全局系数 SPEED_FACTOR=0.4（api/utils.ts），实际等待 120~200ms**，调快慢只改该系数；loading 圈尺寸统一 `size="small"`（表格 :loading 与 t-loading 包裹一致），禁止各页面自定尺寸
- 每个函数头部注释 `// TODO: 替换为 GET /api/admin/xxx`，标注 HTTP 方法+路径+入参+返回形状
- 写操作直接修改内存 mock（会话内状态保持），返回 `{ code: 0 }` 形状
- 前缀统一 `/api/admin/**`（客户端接口未来为 `/api/app/**`，共享实体）

## 8. 动效与细节

- 页面载入：卡片 120ms 交错淡入上移（`.page-fade-in` 动画，dashboard 卡片 stagger）
- hover/过渡走 TDesign 组件默认；自定义过渡 ≤200ms
- 空态用 t-empty + 业务化文案（如"暂无待审批申请"），不用 lorem/示例文案
- 演示数据全部为创业社区业务语境的中文文案
