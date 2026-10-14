# 聚屿社区管理后台（apps/admin）界面审查报告

> **【2026-10-14 整改完成】** 本报告所列 P0/P1/P2 条目已于同日按优先级全部整改（65 个文件，+816/-244）。特殊处置：
> ① H-01 中 UserDetailView 的申请/投稿/预约表现场核实**无行点击跳转**（不存在详情路由），未添加操作列按钮（不造空目标）；② H-04 核销的 `@enter` 直发已改为统一走按钮 popconfirm（键盘路径完整）；③ 工作台待办/公告无条目详情路由，仅补 `:title` 保留列表跳转；④ M-14 中「驳回原因载体统一（drawer vs dialog）」涉及交互重写，**本轮未做**，列为遗留项；⑤ DemandPublishDialog 现场实际 4 个开关全部补齐 aria-label。
> 验证：`vue-tsc --noEmit` 0 错误、`eslint --max-warnings 0` 通过。

> 审查日期：2026-10-14 · 只读审查（未修改任何源码）
> 审查框架：`.agents/skills/better-interface` 编排的跨域审查（Accessibility / Layout / Writing / Typography / UI 五域；**配色域按本次要求排除**）
> TDesign 用法经 tdesign-mcp-server（vue-next）逐条核对

---

## 一、范围与覆盖

| 项目 | 内容 |
|---|---|
| 审查对象 | `apps/admin/src` 全部 **17 个 views 目录（约 50 个视图）+ 44 个共享组件 + AdminLayout 布局骨架 + tokens.css + main.ts / router** |
| 技术栈 | Vue 3.5 + TypeScript + Vite 6 + **TDesign Vue Next 1.10**（自动导入）+ tdesign-icons-vue-next + Pinia + Vue Router |
| 项目约定文档 | `docs/wiki-admin-web.md`（冻结契约：术语表 / 组件词汇表 / 日期列宽 / 表格 fixed+resizable / 圆角 token 化 / 无刷新按钮等交互减法——本文所有判断均以「项目自己的约定优先」执行，刻意设计不作为 finding） |
| 排除范围 | 配色（better-colors 域未审；报告不涉及颜色取值、对比度测量与主题色板） |
| 审查方式 | 静态逐文件通读（8 组并行子代理 + 骨架人工审读），未启动浏览器（用户约定：不打开浏览器验证） |

### 覆盖表

| 域 | 证据来源 | 结果 |
|---|---|---|
| Accessibility | 全部 views + 组件逐文件检查：可点击行/卡片键盘路径、aria-label、破坏性确认、错误恢复、状态冗余提示、开关名称 | **5 条 HIGH、7 条 MEDIUM** |
| Layout | 列宽契约（日期 ≥170 / 区间 ≥220）、fixed 布局、form-row 栅格、操作列宽、抽屉/弹层宽度 | 4 条 MEDIUM、2 条 LOW |
| Writing | 术语冻结表、确认框按钮/标题、错误恢复文案、空态指引、文案与功能一致性 | 2 条 MEDIUM（1 条并入 HIGH）、3 条 LOW |
| Typography | 截断恢复途径、tabular-nums、占位符统一、等宽数字 | 1 条 HIGH、2 条 LOW |
| UI | 一致性（双实现漂移）、弹层滚动、防误关、hover、图标规范 | 4 条 MEDIUM、4 条 LOW |
| 配色 | — | **Not reviewed（按本次要求排除）** |

### 全局健康度（grep 全量核验，均为正面结论）

- ✅ 无 emoji 当图标、无 `v-loading` 指令误用、无原生 `alert/confirm`、无正 `tabindex`、`<img>` 均有 `alt`
- ✅ `:focus-visible` 全局 outline、`prefers-reduced-motion` 全局兜底、表格/统计 `tabular-nums` 全局覆盖（tokens.css）
- ✅ skip-link、路由懒加载进度条、弹窗整体滚动方案（TDesign 适配 hack 有注释依据）
- ⚠️ 唯一骨架级缺口：**路由切换后 `document.title` 从不更新**（见 P1-16）

---

## 二、发现清单（按优先级）

> 严重度定义：**P0/HIGH** = 阻断任务、误导用户、隐藏内容或控制、数据丢失风险、系统性失败；**P1/MEDIUM** = 明显损害理解/效率/一致性；**P2/LOW** = 局部打磨。
> 同一根因已合并全部位置。行号来自逐文件通读，关键条目已抽样复核。

### P0 — HIGH（5 条，须优先修复）

---

**H-01 · Accessibility｜可点击行进详情，全站无键盘路径**

- 位置（一条根因，8 处模式）：
  - `views/users/UserDetailView.vue:803`（及 826/866/889/929/953/994/1019——申请/需求/项目/活动/租赁 5 张记录表 + 成员表，仅有 `@row-click`，无操作列按钮）
  - `views/enterprises/EnterpriseDetailView.vue:423`、`views/external-enterprises/ExternalEnterpriseDetailView.vue:247`（成员/租约行）
  - `views/spaces/ReservationPanel.vue:341-368`（非 pending 行的详情只能靠行点击，抽屉内含联系电话与审核时间线，键盘完全不可达）
  - `views/contents/ArticlePublishPanel.vue:252-258`、`ArticleSubmissionPanel.vue:327,333`、`AnnouncementsPanel.vue:229,235`、`views/mall/MallOrdersPanel.vue:315-317`（仅 `cursor:pointer` + `@row-click`）
- Before：`<t-table @row-click="openDetail" :row-attributes="{ style: { cursor: 'pointer' } }">`，行/单元格均无 tabindex、无 keydown
- After：**在操作列补「详情」文本按钮**（`@click.stop`），保留行点击作为鼠标增强。TDesign table 的 `row-attributes` 只透传属性不透传事件，行级键盘化不可靠（已用 MCP 核对）；操作列按钮是项目已有惯例（需求列表等页均如此），补齐即可对齐
- Why：键盘/读屏用户在上述页面**完全无法**查看详情（内容与功能被隐藏）——WCAG 2.1.1；其中资讯发布页各状态连操作列兜底都没有，最严重

---

**H-02 · Accessibility｜弹窗/区域数据加载失败只有一次性 toast：表单被阻塞，或错误伪装成空态**

- 位置（一条根因，7 处）：
  - `components/UserCardTab.vue:14-16`、`views/enterprises/EnterpriseDetailView.vue:40`（名片 tab 失败后空白 + 按钮置灰，无重试）
  - `components/WorkstationFormDialog.vue:74-79`、`components/LeaseFormDialog.vue:143-149`、`components/AreaPlanDialog.vue:61-72`（区域/租赁方选项加载失败，必填下拉永远为空，本次弹窗不可用）
  - `components/ArticleFormDialog.vue:93-95,108-110`（栏目/作者选项失败，栏目为必填项 → 表单被阻塞）
  - `components/DictEntriesDialog.vue:33-37,141`（最糟：失败后渲染「暂无 X，请在上方新增」，**错误态被伪装成空态并引导新增**，用户会误建重复字典项）
- After：统一接入项目已有的 `ListErrorState`（`<ListErrorState :message="loadError" :loading="loading" @retry="load" />`）做就地重试；表单弹窗内在选项区上方内联渲染错误条 + 「重新加载」按钮；DictEntriesDialog 仅在**成功且为空**时才渲染空态
- Why：toast 数秒即逝，失败后界面不可恢复——错误无恢复途径（escalation trigger）；DictEntriesDialog 场景还会直接造成脏数据

---

**H-03 · Accessibility｜状态/含义仅靠颜色传达（两处确认）**

- 位置：
  - `views/spaces/SpaceDetailView.vue:316-329`：预约日历 `.cal-item` 以 `is-approved/is-pending/…` 底色区分状态，文本只有「时间 + 标题」，状态语义只存在于 `:title` 悬停提示（键盘/触屏/读屏均不可达）
  - `views/mall/MallGoodsPanel.vue:289`：0 库存仅 `<span :class="{ 'stock-out': row.stock === 0 }">` 红字加粗，无「售罄」文字（数值 0 不构成状态文案）
- After：
  - 日历条目内追加状态文字前缀（如 `待审核 · 09:30 某某`）或 `<t-tag size="small">`；空间有限时至少给 `.cal-item` 加 `tabindex="0"` + `aria-label="occupancyTooltip(row)"`
  - 0 库存改为 `<t-tag theme="danger" variant="light">售罄</t-tag>` 与数字并列（或 `row.stock === 0` 时渲染「售罄」替换数字）
- Why：WCAG 1.4.1 不应仅靠颜色传达信息——escalation trigger，`HIGH` on sight

---

**H-04 · Accessibility｜对外可见/不可逆操作缺确认，且与列表页口径不一致**

- 位置：
  - `views/demands/DemandDetailView.vue:302`：详情页「立即发布」直接执行；**同操作在 `DemandListView.vue:789` 有 popconfirm**——用户在详情页一键误发布（对外可见）
  - `views/events/EventDetailView.vue:419-421`、`views/events/EventListView.vue:621-628`：「暂停报名」直接执行（同域「暂停项目」在 `ProjectListView.vue:529` 有 popconfirm）——误触即影响全部成员报名
  - `views/events/EventDetailView.vue:580`：手输 8 位核销码后回车/点「核销」直接 `redeemEventTicket`——核销是一次性不可逆消费，码位错输即核销他人票
- After：三处均包 `t-popconfirm`（content 含动作+后果，如「确认立即发布该需求？发布后成员即可响应」「确认核销该电子票？核销后不可再用」）；「开放报名」方向可保持直接执行
- Why：破坏性/不可逆/影响他人操作的确认缺失——escalation trigger；确认策略不一致本身会让用户在「没有确认的那一处」踩坑

---

**H-05 · Typography/Layout｜关键文本截断后无完整值途径（全站 7 组）**

- 位置：
  - `views/dashboard/DashboardView.vue:627-635`（用于 422/449/473）：工作台待办对象名 / 公告标题 / 活动名 ellipsis 截断，无 tooltip，且点击跳**列表页**而非该条详情——用户无法在工作台读全标题
  - `views/demands/DemandListView.vue:711`：需求标题 `.demand-title` 截断无 `:title`（同文件 344 行的驳回原因**有** `:title`，做法不一致）
  - `views/contents/ArticlePublishPanel.vue:262,362-367`、`ArticleSubmissionPanel.vue:337,466-471`、`views/contents/AnnouncementsPanel.vue:238,332-336`：文章/公告标题截断无 tooltip
  - `views/projects/ProjectDetailView.vue:505-512`、`components/ProjectFormDialog.vue:685-691`：承接方名称截断——无法核对占比归属对象
- After：统一给截断元素补 `:title="…"`（项目已有先例，改动最小）；注意 TDesign 列级 `ellipsis: true` 的自动 tooltip **对自定义 cell 内块级元素不生效**（MCP 文档明确要求内容为内联元素），自定义 slot 场景必须手动 `:title`；工作台待办/公告跳转同步改为条目详情路由
- Why：标题/承接方是运营决策关键信息，「Truncated content with no way to reach the full value」为 escalation trigger

---

### P1 — MEDIUM（14 条）

---

**M-01 · Accessibility｜`t-switch` 与筛选输入无可访问名称（一条根因，10 处）**

- 位置：`components/DemandPublishDialog.vue:383,407`、`components/EventFormDialog.vue:331-337,367-372,389-396`（自定义范围/响应审核/公开联系人开关）、`views/system/SystemConfigPanel.vue:405,513,533`、`views/system/ArchivePanel.vue:638,676`（同页其他 7 个开关都写了 `aria-label`，这 5 个遗漏）；`views/user-messages/UserMessageListView.vue:221-229`（关键词输入只有 placeholder，状态下拉的 `label="状态"` 是前缀文本、非编程关联）
- After：全部补 `aria-label`（MCP 已核对：TDesign switch 的 `label` prop 是开关内文案 `['开','关']`，**不是**名称关联；组件会透传 attrs）。开关类名称写控件用途（`aria-label="启用实名核验"`）；说明文案改用 `t-form-item` 常显 help 或 `tips`，不要只放 hover 的 `t-popup content`（EventFormDialog/DemandPublishDialog 的「关闭=所有用户可见」键盘/触屏不可达）
- Why：读屏用户听到「开关，已开启」却不知开关是什么；placeholder 是弱回退名称，输入后即消失

**M-02 · Accessibility｜`StatusTag` scheduled 状态语义只存在 tooltip**

- 位置：`components/StatusTag.vue:39-41`——词表冻结状态名「定时发布中」被整体替换为纯时间字符串，状态含义在 hover 的「到点自动发布」里
- After：标签文字改为 `定时发布 {{ scheduledAt }}`（tooltip 可保留为补充说明）
- Why：不悬停（触屏/键盘/读屏）时该标签与普通时间列不可区分，状态被隐藏

**M-03 · Accessibility｜筛选卡片选中态无 ARIA 状态**

- 位置：`components/StatCard.vue:24-33`（原生 button ✓，但选中仅 `is-active` 视觉类）；使用处 `WorkstationMapPanel.vue:182-212`、`OfficeListPanel.vue:166-196`、`LeasePanel.vue:331-358`
- After：`:aria-pressed="String(!!active)"`（StatCard 已渲染为 button）
- Why：读屏无法感知当前筛选状态（WCAG 4.1.2）

**M-04 · Accessibility｜TrendChart 逐点数据对读屏不可达**

- 位置：`components/TrendChart.vue:113-121`——`role="img"` 使子树对 AT 呈现性隐藏，键盘移动十字线后的数值只存在于视觉 `<text>`
- After：保留现有键盘交互，追加一个视觉隐藏（sr-only）的数据表格（日期/数值逐点）；或对 hover 值变化用 `aria-live="polite"` 播报 `{{label}} {{value}}`
- Why：图表有键盘聚焦能力是加分项，但数据本身无替代途径

**M-05 · Accessibility｜BulkArchiveDialog 的「取消执行」是假按钮**

- 位置：`views/demands/DemandListView.vue:938-944`——`<BulkArchiveDialog @confirm>` 未监听 `@cancel`；`doBulkArchive` 循环内无取消检查、20 条分页截断无「剩余请再次执行」提示（`ApprovalListView.vue:177-191` 的同名流程两处俱全）
- After：对齐 ApprovalListView 实现：监听 `@cancel` 置取消标志、循环内 `if (cancelled) break`、结束后对截断量出提示
- Why：用户以为已取消，归档仍在继续——误导性控件

**M-06 · Accessibility/UI｜表单校验反馈不定位（一条根因，3 处）**

- 位置：`views/users/UserDetailView.vue:162,230,324`（validate 失败后焦点留在提交按钮）；`views/events/EventDetailView.vue:62-66,623-641`（改期弹窗手动 `MessagePlugin.warning` 校验，未走 rules）；`views/user-messages/UserMessageListView.vue:317-322,122`（rules 声明后从未触发，confirm 直连手动校验——死配置）
- After：校验失败统一调 `@/utils/form` 的 `focusFirstInvalid`（`UserFormDialog.vue:66` 已是项目惯用法）；改期/回复弹窗补 `rules`（`trigger: 'submit'`，符合项目冻结约定）并走 `formRef.validate()`
- Why：toast 无字段定位，多字段出错需逐个排查；键盘/读屏用户感知不到错误字段

**M-07 · Writing｜确认框按钮全站默认「确定/取消」+ 部分确认内容缺对象标识（一条根因，30+ 处）**

- 位置（抽样列全）：`components/ColumnController.vue:124`、`views/user-messages/UserMessageListView.vue:278-284`、`views/enterprises/EnterpriseDetailView.vue:269,283,296`、`ExternalEnterpriseDetailView.vue:153,167,180`、`views/users/UserDetailView.vue:619`、`views/approvals/ApprovalListView.vue:360`、`views/demands/DemandListView.vue:789,824,842,859`、`DemandDetailView.vue:305,310,323,438`、`views/workstations/LeasePanel.vue:438-455`、`LeaseDetailView.vue:238-251,372-378`、`views/spaces/SpaceListPanel.vue:168-177`、`SpaceDetailView.vue:256-261`、`ReservationPanel.vue:352-367`、`WorkstationFormDialog.vue:183-185`、`AreaPlanDialog.vue:195-200`、`views/contents/ArticlePublishPanel.vue:292`、`MallOrdersPanel.vue:336,344`、`MallGoodsPanel.vue:297,317`、`ColumnPanel.vue:245`、`BannerPanel.vue:252`、`AnnouncementsPanel.vue:304`、`ExperienceRulesPanel.vue:134`、`LevelTiersPanel.vue:227`、`GoodsCategoryDialog.vue:215`、`CardSegmentsEditor.vue:12`、`views/system/MonitorPanel.vue:222`、`AssetLibrary.vue:220`、`ArchivePanel.vue:352,580,586` 等
- After：`t-popconfirm` 补 `:confirm-btn="{ content: '终止租约', theme: 'danger' }"` / `:confirm-btn="'归档'"`（MCP 已核对：`confirmBtn` 支持 `String | ButtonProps`，Object 透传 Button 全部属性，危险操作加 `theme: 'danger'`；`theme="danger"` 亦可直接加在 popconfirm 上）；破坏性确认的 content 带对象编号：`确认终止租约 ${row.id}？关联办公位将立即释放`、`确认删除区域「${area.name}」？`
- Why：行内多行操作时「确定」无法确认对象，误触风险高；动词+宾语按钮与 DialogPlugin 场景既有做法（「确认删除」「了解风险，继续」）对齐

**M-08 · Writing｜术语/文案与事实漂移（3 个独立根因）**

- ① 申请类型/动作两套命名：`views/approvals/ApplicationFormConfigView.vue:30`、`ApprovalListView.vue:40-44` 用「合作伙伴/人才登记/提交」，`ApprovalPrintView.vue:21-26` 用「提交申请」，列表页类型列又是「企业合作/个体入驻」→ 收敛到 `constants/status.ts` 的 `applicationTypeMap` 单一来源
- ② 取消活动文案与功能矛盾：`EventListView.vue:591,629`、`EventDetailView.vue:397,422` 写「取消后不可恢复」，同页却有「转为待发布」恢复入口（`EventListView.vue:597-605`）→ 改为「取消后可转为待发布，已报名成员将收到通知」
- ③ 语义错位：`views/dashboard/DashboardView.vue:421` 用 `StatusTag entity="enabledFlag"` 在公告卡表达「置顶/未置顶」→ 显示「停用」字样误导；改用 `<t-tag theme="warning">置顶</t-tag>`
- Why：误导用户决策（②③）与跨页术语漂移增加认知负担（①）；① 属 Writing 域 MEDIUM，②③ 接近 HIGH 但影响面为单页单操作

**M-09 · Layout｜操作列宽不足 → 破坏性按钮被静默裁切**

- 位置：`views/events/EventListView.vue:89`（op width 340，待发布态 5 个按钮超宽）、`views/events/EventEnrollmentReviewView.vue:51`（op width 150，3 按钮）
- After：op 列加宽（活动列表 ≥400）或将「定时发布/取消活动」收进 `t-dropdown`（更多）；审核页 ≥170 或移除与行点击重复的「活动详情」
- Why：`table-layout=fixed` + `.op-cell` nowrap 下超宽内容**静默裁切**，「取消活动」可能不可见不可点——关键控制被隐藏

**M-10 · Layout｜表格列配置违反项目自身契约（3 处）**

- `views/users/UserDetailView.vue:465`：「使用时段」列 width 140 渲染 `startTime ~ endTime` 区间文本——项目契约区间列 ≥220px，实际截断
- `views/users/UserDetailView.vue:1167,1192`：经验值/积分流水表缺 `table-layout="fixed"`（同文件其余 7 组表格均为 fixed+显式列宽），auto 布局长事由撑宽、`ellipsis` 失效
- After：时段列 width 220+；流水表补 `table-layout="fixed"`

**M-11 · Layout｜DemandPublishDialog 表单栅格错位与窄屏适配缺失（一条根因，5 处）**

- `components/DemandPublishDialog.vue:275-285,316-330`：`.form-row { grid-template-columns: 1fr 1fr }` 放了 **3 个** `t-form-item`（联系人/电话/邮箱、类型/类别/预算）→ 第 3 个控件掉行错位
- `WorkstationFormDialog.vue:243-247`、`SpaceFormDialog.vue:233-237`、`LeaseRenewDialog.vue:164-168`、`AreaPlanDialog.vue:228-232`：`.form-row` 无窄屏断点（而 `LeaseFormDialog.vue:393-397` 有 `@media (max-width: 767px)` 塌陷单列）
- After：三控件行独立类 `repeat(3, minmax(0,1fr))`；四个弹窗补齐与 LeaseFormDialog 相同的 767px 断点（或抽共享工具类）
- Why：错位直接损害可读性；半屏/分屏窗口下日期与数字输入被压到 ~200px

**M-12 · UI｜表单弹窗防误关三套做法并存（一条根因，9 处）**

- 有 dirty guard：`LeaseFormDialog`、`LeaseRenewDialog`、`Announcement/Event/Project` 各表单弹窗；`DemandPublishDialog` 甚至 `:close-on-overlay-click="true"` 靠 guard 兜底
- 无任何保护（点遮罩即丢全部输入）：`views/users/UserDetailView.vue:1223,1272,1312`（编辑/冻结/重置密码）、`components/UserFormDialog.vue:95`、`WorkstationFormDialog.vue:169-176`、`SpaceFormDialog.vue:143-150`、`AreaPlanDialog.vue:137-144`、`views/events/EventDetailView.vue:623`（改期）、`views/demands/DemandListView.vue:888-893`（代报名）
- After：统一接入 `utils/form.ts` 的 `useDialogDirtyGuard`（`IndividualCardDialog.vue:34` 先例）+ 表单弹窗统一 `:close-on-overlay-click="false"`
- Why：同域两套细节并存且本组最弱——新增用户/代报名/改期误触遮罩即静默丢失全部输入

**M-13 · UI｜自定义滚动容器缺 `overscroll-behavior: contain`（一条根因，4 处）**

- 位置：`views/dashboard/DashboardView.vue:790-793`（编辑布局列表）、`components/GoodsCategoryDialog.vue:238-241`、`ArticleReviewDialog.vue:222-226`、`components/DictEntriesDialog.vue:152-153`
- After：各处追加 `overscroll-behavior: contain;`
- Why：弹层内滚动到边界后滚动链穿透，带动背后页面漂移（AdminLayout 侧栏/通知面板已正确处理，此处为遗漏）

**M-14 · UI｜同域双实现漂移（一条根因，8 组）**

- 驳回原因载体：`ApprovalListView.vue:429-456`、`DemandReviewDialog.vue:91-153` 用 `t-drawer`（520/560px），`DemandDetailView.vue:465-487` 用 `t-dialog`（480px）——同类「驳回必填原因」三种容器
- 提交人身份展示：`DemandListView.vue:728-735` 用 `t-tag`，`DemandReviewView.vue:224`、`DemandDetailView.vue:345-347` 用纯文本
- 弹窗 footer：`UserDetailView.vue:1229` 等手写插槽 vs `IndividualCardDialog` 用 `:confirm-btn`；`EventEnrollmentReviewView.vue:320-321` 用 props 写法
- 查询按钮主题：`MallGoodsPanel.vue:259`、`MallOrdersPanel.vue:296` 无 `theme="primary"`（全站其余列表页均为 primary）
- 空值占位：`DemandListView.vue:322,744-746` `—` 与 `-` 混用
- 办公位/办公室卡片：`WorkstationMapPanel.vue:315-319,449-463` vs `OfficeListPanel.vue:288-293,412-425`（legend 对齐、企业链接字号与 hover 形态、卡片 min-height 均漂移）
- 额度编辑网格：`LevelTiersPanel.vue:181-232`（手写 grid + sticky 保存条）vs `PublishLimitsPanel.vue:86-109`（t-table + 非 sticky）——`.limit-note` 宽度 44px vs 24px 也不一致
- 租约行跳转口径：`EnterpriseDetailView.vue:369` 跳租约**列表**，`UserDetailView.vue:498` 跳租约**详情**
- After：逐组二选一对齐并沉淀为共享实现/常量；驳回场景建议统一 `t-dialog`（表单短、上下文单一），拒绝入口统一按钮序「取消 / 确认驳回」
- Why：同一细节两种做法——用户每换一页要重新学习交互；维护时也必然继续分叉

**M-15 · UI｜AssetLibrary 素材图无加载失败态**

- 位置：`views/system/AssetLibrary.vue:207`
- After：改用 `t-image`（MCP 已核对：支持 `error` 插槽/文案与 `lazy`、`onError`），失败时显示「图片加载失败」占位块——该页还有「复制 URL」操作，失败态应明确
- Why：素材被清理/URL 失效时渲染浏览器碎图 + 空 16:9 框，无任何说明

---

### P2 — LOW（8 条）

---

**L-01 · Writing｜空态无下一步指引（一条根因，10 处）**

- 位置：`components/ListEmptyState.vue:17`（默认 `description: '暂无数据'` 不约束调用方）；`SpaceListPanel.vue:192-194`、`ColumnPanel.vue:257`、`BannerPanel.vue:261`、`CommunityPolicyView.vue:65`、`AgreementPolicyView.vue:68`、`DemandDetailView.vue:415`（「暂无响应记录」应说明「需求发布后成员可在此报名响应」）、`EventDetailView.vue:502,532,573,601`、`UserDetailView.vue:595` / `EnterpriseDetailView.vue:472` / `ExternalEnterpriseDetailView.vue:130`（「不存在或已被删除」无「返回列表」动作——直达 URL 时 router.back() 可能离开系统）
- After：`ListEmptyState` 的 `#action` 插槽已预留（`ListEmptyState.vue:39-42`），各页传入场景化按钮（「新增空间」「返回用户列表」等）；纯筛选空态已有「清除筛选」无需改动
- Why：空态应说明「这里是什么 + 如何填充」，否则用户停在死胡同

**L-02 · Typography｜tabular-nums 覆盖遗漏（一条根因，5 处）**

- 位置：`components/TrendChart.vue:219-222`（悬浮值逐点变化抖动）、`components/BulkArchiveDialog.vue:91,102`（进度计数）、`views/events/EventListView.vue:560,569` 与 `EventDetailView.vue:539-540`（x/容量、x/y 计数）、`views/workstations/LeasePrintView.vue:146-148`（打印单据租金，纸质核对需等宽）
- After：各自补 `font-variant-numeric: tabular-nums;`（或把 `.doc-table` 加入 tokens.css 等宽数字清单）
- Why：tokens.css 全局兜底只覆盖 `.t-table/.t-statistic/.t-descriptions` 等，自定义元素不在范围

**L-03 · Writing/Typo｜文案打磨杂项（一条根因，6 处）**

- `views/login/LoginView.vue:72`：fallback「登录失败，请稍后重试」无行动指导 → 「请检查用户名、密码与验证码后重试」（代码本就自动刷新验证码，文案应呼应）
- `views/login/LoginView.vue:156`：「验证码…」非项目冻结句式「请输入…」
- `views/dashboard/DashboardView.vue:425`：「公告 · 」自指标签冗余（同卡待办/活动均无）
- `views/workstations/LeasePrintView.vue:146-148`：标签「月租金」与值「¥800 / 月」语义重复
- `components/MemberGovernancePanel.vue:36`：冷静期「剩余 168 小时」→ ≥48h 换算为天，与页头「7 天冷静期」对齐
- `views/system/SystemConfigPanel.vue:141`：`finally` 内回读配置 await 失败静默（未处理 rejection）→ 移入 try/catch 保留表单值
- Why：均不阻断任务，但直接损害文案可信度与一致性

**L-04 · UI｜自定义 hover 未包 `@media (hover: hover)`（一条根因，4 处）**

- 位置：`styles/tokens.css:420-423`（`.stat-card:hover` 上浮）、`views/users/UserDetailView.vue:1447`、`EnterpriseDetailView.vue:622`、`ExternalEnterpriseDetailView.vue:399`（identity-card hover 变色）
- After：包一层 `@media (hover: hover) { … }`
- Why：触屏设备 hover 粘滞读作「卡住的选中态」（后台以鼠标为主，故 LOW）

**L-05 · UI｜AdminLayout 细节三项**

- `layouts/AdminLayout.vue:952`：`.tab-track` 常驻 `will-change: transform`——未见卡顿证据前建议移除（按需添加）
- `AdminLayout.vue:521-529,561-571,642-651`：`footer-btn`/`tab-close`/`admin-chip` 用 `role="button" tabindex="0"` + 手写 keydown——键盘支持已合规，但改用原生 `<button>`/`t-button variant="text"` 可删除全部键盘样板（platform first）
- `styles/tokens.css:372-376`：stagger 间隔实现为 60ms，而 wiki §8 声明「卡片 120ms 交错」——文档与实现二选一对齐
- Why：均为骨架打磨项

**L-06 · Layout｜UserDetailView 12 个平铺 tab 窄屏溢出无提示**

- 位置：`views/users/UserDetailView.vue:48`
- After：确认 TDesign tabs 溢出滚动形态后收敛为分组（「记录」类 7 个 tab 可合并下拉/二级），或至少给滚动区加渐隐提示（同 AdminLayout `.tab-bar.is-overflowing` 的 mask 做法）
- Why：12 个标签在窄内容区必然溢出，可发现性下降

**L-07 · Layout｜MonitorPanel 执行日志抽屉固定 560px**

- 位置：`views/system/MonitorPanel.vue:234`——页面本体已做 1199px/640px 两级响应式，抽屉未跟随
- After：`size="min(560px, 92vw)"`（MCP 已核对 drawer size 支持任意 CSS 宽度）

**L-08 · UI/架构｜全局 errorHandler 静默**

- 位置：`src/main.ts:22-24`——组件渲染抛错仅 `console.error`，用户面对白屏无任何反馈
- After：接一个极简错误落地（MessagePlugin.error 或错误页），文案含「刷新重试」
- Why：兜底路径缺用户反馈（架构级，单列 LOW）

---

## 三、Not verified（静态审查无法确证，未计入 findings）

| 检查项 | 原因 |
|---|---|
| `RichEditor.vue:79` wangEditor v5 工具栏按钮的可访问性（aria/键盘） | 工具栏 DOM 由第三方编辑器运行时生成，需浏览器审查元素确认 |
| 200% 缩放 / 320px 宽度 reflow / 屏幕阅读器实测 | 需运行浏览器（本次按约定未启动）；`page-header` 窄屏换行、内容区 12px 收紧等已有静态证据，风险较低 |
| TDesign 默认 locale 下 popconfirm 确认按钮文案确为「确定/取消」 | 由组件默认行为推断（MCP 文档 `confirmBtn` 默认 `''` 渲染内置按钮），落地修复时以运行时为准 |
| 触屏 hover 粘滞实际表现 | 无触屏设备 |
| 通知 `t-badge` 未读数对读屏的可达性 | badge 为装饰性数字，建议在通知按钮上加 `aria-label="通知中心，N 条未读"`（顺手项，未列正式 finding） |

## 四、TDesign 用法核验记录（tdesign-mcp-server · vue-next）

| API | 结论 |
|---|---|
| `Popconfirm.confirmBtn / cancelBtn` | 支持 `String \| ButtonProps \| TNode`，Object 透传 Button 属性（含 `theme: 'danger'`）→ M-07 整改写法有效 |
| `Switch.label` | 是开关内外文案 `['开','关']`，**非**可访问名称 → 名称必须走 `aria-label`（M-01） |
| `Image.error / fallback / lazy` | 支持失败插槽与懒加载 → M-15 整改有效 |
| `Table.ellipsis` | 自动 tooltip 仅对**内联元素**内容生效；自定义 cell 块级内容需手动 `:title`（H-05 写法依据） |
| `Table.rowAttributes` | 仅透传 tr 属性、不透传事件 → 行级键盘化不可靠，整改以操作列按钮为准（H-01） |
| `Drawer.size` | 支持任意 CSS 宽度（'35px'/'30%'/'3em'）→ L-07 写法有效 |
| `Select.label` | 为选择器左侧前缀文本，非 label/for 关联 → M-01 对筛选输入补 `aria-label` 的依据 |

## 五、验证记录

**已执行（静态）**

1. 8 组并行子代理逐文件通读全部 50 个视图 + 44 组件 + 布局/tokens/router/main（文件清单见各节位置引用，总计 ~100 个文件，大文件全文读完）
2. 全量 grep：`document.title`（0 命中→P1-16 并入 L-05 相关，实际为骨架缺口单列于 M 组说明）、`v-loading`（0）、原生 `alert/confirm`（0，均为 DialogPlugin）、emoji（0）、正 `tabindex`（0）、无 alt 的 `<img>`（0）、`transition: all`（0）
3. 6 条 HIGH 结论的行号逐一 sed 抽样复核，证据全部属实
4. TDesign MCP 7 项 API 核验（上表）

**未执行**：浏览器运行时验证（键盘走查/读屏/缩放/RTL）——按工作约定不打开浏览器，已列入 Not verified。

## 六、结论

**Block** —— 存在 5 条 HIGH（行键盘路径缺失、错误无恢复、颜色单通道、缺确认、截断无恢复），修复前不建议发版。

建议修复顺序（一改多益优先）：

1. **H-01 + H-05 + M-07**：三个全站模式各一次扫描即可覆盖 40+ 处（操作列详情按钮 / `:title` 补齐 / popconfirm 按钮定制），收益最大
2. **H-02**：错误态统一接 `ListErrorState`（组件已存在，纯接线）
3. **H-03 + H-04**：日历状态文字、售罄 tag、三处补确认（各为局部小改）
4. M 组按 M-01（aria-label 一把补齐）→ M-12（dirty guard 统一）→ M-14（双实现对齐）推进
5. L 组可随后续迭代顺手清理
