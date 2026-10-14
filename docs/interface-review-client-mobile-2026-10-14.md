# 移动端界面审查报告（better-interface）

- 日期：2026-10-14
- 范围：`apps/client-mobile` 全部 66 个视图 + 48 个组件 / composable / 指令（只读审查，未改动任何文件）
- 栈：Vue 3.5 + Vite 6 + TDesign Mobile Vue 1.16.2 + Vue Router 4 + Pinia 3；无 CSS 框架；样式走 `styles/tokens.css` 的 `--td-*` / `--app-*` token
- 规范文档（recon）：`docs/wiki-client-mobile.md` §5「UI 与组件约定 / 交互约束 / 排版规范 / 术语口径」为权威口径；`src/main.ts` 全局 a11y 修补清单作为「已覆盖」基线；未发现 CONTRIBUTING/AGENTS/CLAUDE 等其他约定文档
- 边界：配色领域（better-colors）按需求方要求排除；运行时视觉未做浏览器实测（见「验证」节）

## Scope and coverage

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | 66 视图 + 48 组件/composable；`main.ts` 修补清单；TDesign 库源码核对（switch/rate/stepper/search/progress）；tdesign MCP API 核对 | 2 HIGH、3 MEDIUM、4 LOW |
| Layout | 同上（代码级：固定高宽、滚动容器、吸底遮挡、贴边、320px 推断） | 2 MEDIUM、2 LOW |
| Writing | 全部视图文案、`utils/validators.ts`、`constants/*`、术语口径（需求≠项目） | 1 HIGH、4 LOW |
| Typography | `styles/tokens.css` 三层 token 结构 + `scripts/check-typography.mjs` 全量扫描 | Clear（0 命中） |
| Colors | — | Not reviewed（需求方明确排除配色） |
| UI | 全部 style 块 + `tokens.css` 动效/打磨约定（.pressable/.icon-swap/overscroll 等） | 1 MEDIUM、5 LOW |

## Findings

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | accessibility | `src/main.ts:225-254`（修补清单）；位置：`src/components/events/EventFeedbackForm.vue:31`、`src/views/mobile/MyOrderDetailView.vue:162`（Rate）；`src/views/mobile/MyIndividualCardView.vue:161,166,170`（Switch）；`src/views/mobile/SpaceReserveView.vue:449`（Stepper）；`src/views/mobile/PointsView.vue:101`（Search 清除键，clearable 默认 true） | `<Rate v-model="rating" :count="5" aria-label="活动评分" />`；`<Switch v-model="form.showPublic" />`；`<Stepper :value="form.attendees" … />`；`<Search v-model="keyword" placeholder="搜索来源或事由…" />` | 在 `main.ts` 的 `patchKeyboardTargets()` 增加四类选择器（项目 v51 既定模式）：`.t-rate__icon`、`.t-stepper__minus/.t-stepper__plus`、`.t-search__clear` 补 `role=button + tabindex=0 + aria-label + Enter/Space`；`.t-switch` 补 `role=switch + tabindex=0`（跳过 `.t-switch--disabled`），`aria-checked` 经既有 MutationObserver 按 `.t-switch--checked` 类同步，名称取同行可见标签文案 | 库源码确认四者均为 `div+onClick`，无 role/tabindex/键盘/aria（tdesign MCP 亦确认无相关 props）。Rate 的星星无任何键盘替代路径（评分不可键盘修改）、Switch 三个可见性开关（含隐私项「公开名片」）纯指针可点且读屏无名称无状态——命中升级触发器「交互控件无可访问名称」「指针可达但键盘不可达」（WCAG 2.1.1/4.1.2）。Stepper 与 Search 清除键有原生输入框作键盘替代，严重度较低，但同根因一并修复 |
| HIGH | writing | `src/views/mobile/GlobalSearchView.vue:112`（赋值）、`:176`（渲染） | `if (failed.length) partialError.value = \`${failed.join('、')}暂时无法加载，已展示其余结果\``；`<p v-if="partialError" class="partial-error">{{ partialError }}</p>` | 消息改为可行动文案并挂重试，如「需求、活动加载失败」+ 行内「重试」按钮（复用 `EmptyBlock` 的 action 口径，`@click` 重跑 `search()`） | 局部失败提示只说明「什么失败了」，不提供任何恢复路径（本页无下拉刷新，只能改关键词重搜）——命中升级触发器「错误无可恢复方式」。同站 `PrivacyView.vue:70` 的同类错误即带 `action-text="重试"` |
| MEDIUM | accessibility（项目约定） | `src/views/mobile/PlazaView.vue:225-230, 288-293`；`src/views/mobile/MyProjectsView.vue:48`；`src/views/mobile/MyOrdersView.vue:82-88` | `<article v-for="ev in events" class="item m-card" v-pressable @click="router.push(\`/events/${ev.id}\`)">`；`<section … v-pressable @click="router.push(\`/me/projects/${p.id}\`)">`；`<article … v-pressable @click="goDetail(order)">` | 卡片主体改用 `router-link` 承载（卡内无并列操作按钮时直接包住全部内容），参照 `MyDemandsView.vue:115`、`MyResponsesView.vue:77`、`MyArticlesView.vue:78`、`MyApplicationsView.vue:76` 的 `.demand-main` 写法；`v-pressable` 仅用于行/列表项类整卡 | 违反 wiki §5「可点整卡两条口径：跳转型卡片必须用 router-link」：`v-pressable` 只补 `role=button`，读屏把导航卡播报为「按钮」而非「链接」，且丢失 Ctrl/中键新标签打开与右键拷贝链接能力；四个姊妹列表页均已改造，唯独这三处（广场活动/资讯、我的项目、我的订单）不一致 |
| MEDIUM | layout | `src/views/mobile/EnterpriseMemberView.vue:194-207`；并列 `src/views/mobile/EnterpriseCardEditView.vue:219-222`、`src/components/forms/DemandFormView.vue:385` | `<Button v-if="canSave" class="mobile-sticky-action" …>保存</Button>` 之后紧跟 `<Button … theme="danger" …>移除成员</Button>`（及 `.tip` / `.field-help` 提示文案） | 把次要操作与提示文案前置到吸底按钮之前（滚动时保存吸附、移除随之滚入可见区），或将两按钮并入同一吸底容器；`.mobile-sticky-action` 保持为流内最后一个元素 | `tokens.css:517-521` 的吸底按钮为 `position:sticky; bottom`，滚动中段会完全盖住流内后续的「移除成员」危险按钮，误触落点是「保存」——破坏性操作滚动中不可达且有误提交风险；另两处为同根因的静态文案被遮挡（影响较轻） |
| MEDIUM | accessibility | `src/components/home/HomeBanner.vue:28-36` | `<Swiper :loop="true" :autoplay="!reduceMotion" :interval="4500">` | 增加用户可见的暂停/播放控制（`autoplay` 绑定到可由用户切换的状态，如轮播角落的暂停按钮），或在交互（触摸/聚焦）时自动暂停 | 自动轮播无限期自动更新内容但无暂停/停止控件，违反 WCAG 2.2.2（Level A）；`prefers-reduced-motion` 已正确 honored（`reduceMotion` 传自 `HomeView.vue:235-236`），故仅缺暂停控件，定 MEDIUM |
| MEDIUM | ui | `src/views/mobile/MallDetailView.vue:264-269` | `.desc p { margin:0; font: var(--app-type-body-relaxed); color: var(--td-text-color-secondary); white-space: pre-wrap; }`（作用于 `RichTextBlock` 输出的富文本 HTML，模板 `:122-124`） | 复用 `EventDetailView.vue:109-111, 420-422` 已验证口径：新增 `descIsPlainText` 判定（`!/<\/?[a-z][^>]*>/i`），仅纯文本分支挂 `pre-wrap` 类（`.desc-plain`），富文本分支不挂 | 商品说明走后端富编辑器（DOMPurify 输出 HTML），源码标签间的缩进/换行会被 `pre-wrap` 原样渲染成可见空白，破坏商品说明排版——同一根因在活动详情页已修复，此处为遗漏 |
| LOW | accessibility | `src/components/forms/DemandFormView.vue:380`；`src/views/mobile/EnterpriseCardEditView.vue:219` | `<Button … type="submit" :disabled="!form.asIdentity" :loading="submitting">提交需求</Button>`；`<Button class="mobile-sticky-action" … :disabled="!editableFields.length" …>保存企业名片</Button>` | 移除 `:disabled`，提交时走页面既有拦截逻辑并定位到身份字段（`DemandFormView.vue:213-216` 已有 `if (!form.asIdentity) { Toast('请选择发布身份'); return }`，配 `scrollToField()`；名片页复用同页 `editableFields` 提示） | 违反「Validate on submit, never by disabling submit until the form is valid」：禁用按钮不进 Tab 序列，键盘/读屏用户无法触达主操作、也无法经聚焦感知受阻原因（按钮下方已有说明文案缓解影响，故 LOW） |
| LOW | writing | `src/views/mobile/EnterpriseShowcaseView.vue:47`、`src/views/mobile/TalentCardView.vue:39`；`src/views/mobile/MyLeasesView.vue:27`；`src/views/mobile/MyIndividualCardView.vue:138` | `if (!auth.isLogged) { Toast('登录后可收藏'); return }`；`<EmptyBlock v-else-if="!leases.length" text="暂无与你相关的租约记录" />`；`<EmptyBlock v-else-if="!card" text="当前账号没有个人名片" />` | 游客收藏改为 `router.push({ path: '/login', query: { redirect: route.fullPath } })`（同 `DemandDetailView.vue:52-54` 口径）；两个空态补出口：租约补来源说明（「租约由社区或企业开通，请联系社区咨询」），无名片补 `action-text="查看关联身份" @action="router.push('/me/identities')"`（同 `ExperienceView.vue:57`） | 违反「Empty states point forward / 错误与引导要给出下一步」：游客点收藏仅得一条 Toast 即滞留当前页，与同场景的需求详情页口径不一致；两个空态无可执行出口，同页错误态均带「重试」 |
| LOW | ui | `src/components/contents/ArticleComments.vue:224-230`；`src/components/contents/ArticleContent.vue:95, 98`；`src/components/home/HomeAnnouncementSheet.vue:62-70`；`src/views/mobile/CommunityView.vue:361-371`；`src/views/mobile/MallView.vue:159-164` | `.chips { overflow-x: auto; scrollbar-width: none }`；`:deep(table)/:deep(pre) { overflow-x: auto }`；`.announce-content { overflow-y: auto }`；`.service-categories { overflow-x: auto }` | 各规则补 `overscroll-behavior: contain`（项目 idiom：`PolicyPopup.vue:49-50`、`tokens.css:338-342`）；`CommunityView`/`MallView` 的 chip 行补「左右滑动查看更多」提示（同 `PlazaView.vue:254`）或让末项探出边缘 | 自造滚动容器缺 `overscroll-behavior` 时发生 scroll chaining——横滑到边缘手势被页面接管；两处 chip 行隐藏滚动条且无任何可滚动提示，与广场资讯 chip 行已加提示的口径不一致（chips 通常 1-3 个、实际很少溢出，故 LOW 而非 HIGH） |
| LOW | layout | `src/components/home/HomeAnnouncementSheet.vue:45, 65` | `max-height: 80vh`（`.announce-sheet`）/ `max-height: 72vh`（`.announce-content`） | 改 `max-height: min(80vh, 80dvh)` / `min(72vh, 72dvh)`，或按 `tokens.css:283` 的 `@supports (height: 100dvh)` 模式兜底 | 移动端浏览器工具栏动态显隐时 `vh` 不含工具栏变化，弹层标题/底部按钮可能被裁切；项目惯例为 `100vh` + `100dvh` 双声明（`AppShell.vue:252-254`、`LoginView.vue:118-119`） |
| LOW | accessibility | `src/components/forms/DemandKindExtras.vue:69-80` | `<Cell v-pressable class="date-trigger" … @click="openDeliverBy"><template #note><Button size="small" variant="text" class="date-clear" @click.stop="clearDeliverBy">清除</Button></template></Cell>` | 「清除」移出可点 Cell——在 Cell 下方渲染独立文字按钮（保留 `.date-clear` 样式与逻辑，去掉 `@click.stop`），Cell 只承担打开 DateTimePicker | `v-pressable` 给 Cell 补了 `role=button + tabindex=0`，内嵌原生 `<button>` 形成「按钮内嵌按钮」：读屏播报语义混乱，Tab 序列出现外层容器与内层按钮两级焦点；`@click.stop` 只解决事件冒泡，未解决语义嵌套 |
| LOW | writing | `src/components/forms/ApplicationFormRenderer.vue:255, 267` | `<Picker … title="请选择" />`；`<DateTimePicker … title="选择日期" />` | 标题指名字段：`title="请选择{{ pickerField?.label }}"`、`title="选择{{ dateField?.label }}"`（两个 ref 均已持有，`:82-104` 有赋值） | 用户为「机构类型」字段打开选择器却看到通用标题，视觉与读屏用户都无法把弹层与具体字段对应，误选后需关闭重开——违反「弹窗标题命名动作与对象」 |
| LOW | ui | `src/views/mobile/DemandDetailView.vue:252` | `<Button v-if="!auth.isLogged" theme="primary" block @click="router.push(\`/login?redirect=${route.fullPath}\`)">登录后响应</Button>` | 改对象式查询：`router.push({ path: '/login', query: { redirect: route.fullPath } })`（同文件 `:53` 已是正确写法） | 裸模板插值未经 URL 编码，`route.fullPath` 一旦含 `?`/`&`/`#` 会截断 query、登录回跳失败；当前路由无 query 暂不触发，属脆弱写法且与同文件 idiom 不一致 |
| LOW | ui | `src/views/mobile/HistoryView.vue:63` | `<article v-for="item in items" class="m-card row pressable">`（卡片自身无 `@click`，注释自述「卡片本身不承载点击语义」） | `.pressable` 类移到内部 `<router-link class="main">` 上（同 `MyFavoritesView.vue:81` 口径），article 仅保留 `m-card row` | `.pressable`（`tokens.css:182-189`）含 `cursor:pointer` 与 `:active scale(0.96)`：不可点的整卡显示指针光标、按压缩放但无响应，构成虚假可点暗示与误触 |
| LOW | writing | `src/views/mobile/ArticleNewView.vue:348` | `{{ contentReady ? (revising ? '重新提交' : '提交投稿') : \`投稿内容需≥${MIN_CONTENT}字\` }}` | 未达标时保持动词开头标签「提交投稿」；字数引导已由行内错误（`:258-261`）与计数行（`:345`）承载；如确需保留状态提示写「提交投稿（需≥30 字）」 | 按钮文案未达标时是状态陈述句而非动作，读屏用户听到的不是可执行操作；且与点击后 Toast 校验提示、页内计数行三处重复 |

### 补充小额项（LOW，不计入主表）

| Location | Before | After |
| --- | --- | --- |
| `src/views/mobile/SecurityView.vue:392, 457, 458, 470` | 邮箱入口/弹窗标题/提示/提交键四处硬编码「绑定邮箱 / 确认绑定」 | 仿手机流程（`:141-145`）补 `hasEmail` computed，已绑定时切「更换邮箱 / 确认更换」；`changeEmail` 实际执行的是替换操作，现口径会误导已绑邮箱用户 |
| `src/components/level/LevelCardCarousel.vue:112-118` | `<Progress theme="line" :percentage="progressPercent" :label="false" />`（progress.mjs 无 role/aria） | 当前卡补「距下一级还差 N 经验」可见文案，或 `:label="true"` 并给容器补 `aria-label`；否则升级进度仅图形传达，读屏不可感知 |
| `src/views/mobile/SpaceReserveView.vue:366-374` | `.head-top` 内 `h2.page-title` 与费用 Tag 同行，标题无 `min-width:0`/`overflow-wrap` | 补 `min-width: 0; overflow-wrap: anywhere`（同 `MyOrderDetailView.vue:204-210`）；长不可断空间名会挤出费用 Tag，320px 窄屏不可读 |
| `src/views/mobile/PointsRulesView.vue:23, 30` | 全页首个内容标题即 `<h3 class="section-title">`（navbar h1 之后无 h2） | 两处改 `h2`，与同站二级页首个内容标题口径一致（`EventDetailView.vue:276`） |
| `src/views/mobile/LoginView.vue:217-222`；`src/views/mobile/SpacesView.vue:72-73` | `.demo { … }` / `.tip, .tip.danger { … }` 样式已无模板引用 | 直接删除（Delete 优先） |
| `src/views/mobile/MallDetailView.vue:239-246`；`src/views/mobile/PointsView.vue:215-222` | `.cost-tag { color: var(--td-warning-color); background: var(--td-warning-color-1) }`；`.delta { color: var(--td-success-color) } / .delta.neg { color: var(--td-error-color) }` | 改用 `Tag` 组件或 `tokens.css:647-651` 已抬级的 `--td-tag-*-color` 变量，收敛到 wiki §5「不要自带语义色」口径（对比度属配色领域，本次未评估） |
| `src/components/enterprise/EnterpriseMemberSection.vue:54` | 邀请列表 `:note="[inv.role, inv.phone].filter(Boolean).join(' · ')"` 手机号明文 | 与同组件 `memberNote()`（`:38`）统一：无管理权限时走 `maskPhone()`；同一区块两种隐私口径 |

## Verification

通过的检查：

- `node apps/client-mobile/scripts/check-typography.mjs` → 扫描 104 个文件，0 处待迁移声明（排版 token 体系无越界声明）
- `vue-tsc --noEmit -p apps/client-mobile/tsconfig.json` → 通过，0 错误
- `vitest run`（apps/client-mobile）→ 24 个测试文件 / 71 个用例全部通过
- tdesign MCP（mobile-vue）查询 Switch / Rate / Stepper API → 三者均无 aria / role / keyboard 相关 props（佐证「只能走全局修补或替换实现」）
- 库源码核对：`switch.mjs:131-140`（div+onClick）、`rate.mjs`（`.t-rate__icon` div+onClick）、`stepper.mjs:129,146`（minus/plus div+onClick）、`search.mjs:174-178`（`.t-search__clear` div+onClick，`clearable` 默认 true）、`progress.mjs`（无 role/aria）；`grep` 确认 `main.ts` 的 `patchKeyboardTargets()` 未覆盖 `.t-rate__icon` / `.t-switch` / `.t-stepper__*` / `.t-search__clear`
- 静态核对：`index.html` viewport 含 `viewport-fit=cover`、无 `user-scalable=no`；`html` 有 `scroll-padding-top` 顶栏补偿；`.t-popup/.t-dialog/.t-action-sheet` 已有 `overscroll-behavior: contain`

未验证（Not verified）：320px 宽度 / 200% 缩放实测、键盘走查、读屏播报、`prefers-reduced-motion` 实测、弹层焦点行为实测——本次未开浏览器（按项目惯例），相关判断均为代码级推断，已在对应条目中注明。

## Verdict

**Block**：2 条 HIGH 未修复（TDesign 库内指针-only 控件无键盘通路/无可访问名称，涉及评分、隐私开关等关键交互；全局搜索局部失败提示无可恢复行动）。修复主表 HIGH 后放行；MEDIUM / LOW 留在表内作为待办。Colors 领域按需求方要求未审查，本结论不覆盖该领域。

---

# 整改记录（2026-10-14，按优先级高→低全部修复）

修复后验证：`vue-tsc --noEmit` 0 错误；`check-typography.mjs` 104 文件 0 命中；`eslint src --max-warnings 0` 0 问题；`vitest run` 24 文件 / 71 用例全过；`vite build` 成功（构建产物抽查了关键选择器的编译结果）。以下行号为整改后位置。

## HIGH

| # | 发现 | 整改 |
| --- | --- | --- |
| 1 | 库内指针-only 控件（Rate/Stepper/Search 清除键/Switch） | `src/main.ts` `patchKeyboardTargets()` 新增四类选择器：`.t-rate__icon`（role=button + `aria-label="打 N 分"` + aria-pressed 同步；激活时派发带星星中心 `pageX` 的 click——库按 `event.pageX` 计算命中星号，不带坐标会全部命中第 1 分；pageX 为原型只读 getter，构造后 `Object.defineProperty` 补值）；`.t-switch`（role=switch + 同行可见标签作 aria-label + aria-checked 同步；**已有 role=button 祖先的行不补焦点**，避免 NotificationSettingsView 出现「按钮内嵌开关」双重 Tab 停留）；`.t-stepper__minus/__plus`（减少/增加）；`.t-search__clear` 与 `.t-search__search-action`（后者有可见文案，名称取内容）。禁用态（`-disabled` 结尾类名）同步 aria-disabled 并移出/恢复 Tab 序列（MutationObserver 扩展）。`.t-rate` 根补 role=group 让调用方 aria-label 可分组播报。wiki §5 已补 v52 条目 |
| 2 | GlobalSearchView 局部失败无可恢复行动 | `GlobalSearchView.vue` 局部错误改为 flex 行：文案 + 「重试」按钮（`@click="onSearchNow"` 重跑搜索），复用 EmptyBlock action 口径 |

## MEDIUM

| # | 发现 | 整改 |
| --- | --- | --- |
| 3 | 跳转型整卡未用 router-link | `PlazaView.vue`（活动/资讯两处）、`MyProjectsView.vue:48`、`MyOrdersView.vue` 的 article/section + v-pressable + router.push 全部改为 `<router-link class="… pressable">` 承载主体，补 `display:block; color:inherit; text-decoration:none`；MyOrdersView 删除不再使用的 `goDetail` |
| 4 | 吸底按钮遮挡流内内容 | `EnterpriseMemberView.vue`「移除成员」按钮与提示、`EnterpriseCardEditView.vue` 提示文案、`DemandFormView.vue` 身份受阻说明均**前置到吸底主按钮之前**（sticky 元素只盖其身后内容） |
| 5 | 首页轮播无暂停控件 | `HomeBanner.vue` 新增右下角 44px 暂停/播放按钮（`aria-label` 随状态切换，`:focus-visible` 环，.pressable 按压反馈）。库不监听 autoplay 属性变化，切换时以 `key` 重挂载并用 `:current` 保留当前帧；reduced-motion 或单条横幅时不显示控件 |
| 6 | MallDetailView 富文本 pre-wrap | **核查修正**：构建产物证明原 `.desc p` 编译为 `.desc p[data-v-*]`，永远匹配不到 v-html 内容（p 无 scope id）——该规则实为死规则，富文本从未被污染，但纯文本说明的换行也一直未被保留。按 EventDetailView 已验证的继承式 idiom 整改：`.desc-plain` 类挂在 RichTextBlock **根元素**（子组件根携带父级 scope id）经继承生效，仅纯文本分支挂（`descIsPlainText` 判定） |

## LOW（主表）

| # | 发现 | 整改 |
| --- | --- | --- |
| 7 | 提交按钮 :disabled 至合法 | `DemandFormView.vue` 移除 `:disabled="!form.asIdentity"`（提交拦截逻辑早已存在，补 `scrollToField('identity')` 定位，`scrollToField` 参数类型放宽）；`EnterpriseCardEditView.vue` 移除 `:disabled="!editableFields.length"`，`onSave` 开头补无权限说明的 Toast 拦截 |
| 8 | 提示/空态无下一步 | `EnterpriseShowcaseView.vue`、`TalentCardView.vue` 游客收藏由 Toast 改为跳登录（`{ path: '/login', query: { redirect: route.fullPath } }`，同 DemandDetailView 口径）；`MyLeasesView.vue` 空态补租约来源说明；`MyIndividualCardView.vue` 空态补 `action-text="查看关联身份"` |
| 9 | 滚动容器 overscroll 与提示 | `ArticleComments.vue` .chips、`ArticleContent.vue` table/pre、`HomeAnnouncementSheet.vue` .announce-content 补 `overscroll-behavior: contain`；`CommunityView.vue`、`MallView.vue` chip 行补「左右滑动查看更多 →」提示行（同 PlazaView .column-filter-head 口径） |
| 10 | 弹层限高 vh 未兜底 dvh | `HomeAnnouncementSheet.vue` 按 tokens.css 的 `@supports (height: 100dvh)` 模式补 80dvh/72dvh |
| 11 | 可点 Cell 内嵌清除按钮 | `DemandKindExtras.vue` 「清除」移出 Cell 独立成行（Cell 只承担打开 DateTimePicker），去掉 `@click.stop` |
| 12 | Picker 标题未指名字段 | `ApplicationFormRenderer.vue` 改 `:title="`请选择${pickerField?.label}`` / `` `选择${dateField?.label}` `` |
| 13 | 登录回跳裸插值 | `DemandDetailView.vue` 改对象式查询 `router.push({ path: '/login', query: { redirect: route.fullPath } })` |
| 14 | HistoryView 虚假按压反馈 | `.pressable` 从不可点的 article 移到内部 `router-link.main` 上（同 MyFavoritesView 口径） |
| 15 | ArticleNewView 按钮非动词开头 | 未达标时保持「提交投稿 / 重新提交」；字数引导由行内错误、字段帮助与计数行承载（点击未达标按钮即出行内错误，行为不变） |

## 补充小额项

| 位置 | 整改 |
| --- | --- |
| `SecurityView.vue` | 邮箱流程补 `hasEmail/emailTitle/emailSubmitText` 双口径，已绑定时入口/弹窗标题/提示/提交键切「更换」（与手机号流程一致） |
| `LevelCardCarousel.vue` | 当前卡补「距下一级还差 N 经验」可见文案（cards 增加 nextThreshold），进度含义不再仅靠图形 |
| `SpaceReserveView.vue` | `.head .page-title` 补 `min-width:0 + overflow-wrap:anywhere`，费用 Tag 加 `.head-fee { flex:none }`，长空间名不再挤出费用标签 |
| `PointsRulesView.vue` | 两处 `h3.section-title` 改 `h2`（navbar h1 之后不再跳级） |
| `LoginView.vue` / `SpacesView.vue` | 删除无模板引用的死样式 `.demo` / `.tip` / `.tip.danger` |
| `MallDetailView.vue` / `PointsView.vue` | 自造语义色收敛到已抬级 token：`.cost-tag` 文字色用 `--td-tag-warning-color`；`.delta`/`.delta.neg` 用 `--td-success-color-7` / `--td-error-color-7`（配色对比度本身未评估，超出约定范围） |
| `EnterpriseMemberSection.vue` | 邀请列表手机号按 `maskPhone()` 脱敏（无管理权限时），与成员列表 `memberNote()` 口径一致 |

**遗留说明**：`apps/admin` 工作区内的改动为同日另一场管理端审查的修复，与本次无关；本次未提交任何 commit。
