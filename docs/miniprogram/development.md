# 小程序移植契约（apps/wxminiprogram）

> 代码路径与开发命令默认相对 apps/wxminiprogram 仓；文档链接指向协作仓 docs。当前路由、模型与依赖版本以源码和锁文件为准。

> 本文是 `apps/client-mobile` → `apps/wxminiprogram` 全量移植的统一规范。
> 新增页面前**先读**本文；公共基础设施变更需评估所有页面并运行验证。

> **例外：企业代办**。本期「企业代办 / 企业注册」仅在移动 Web、管理后台与后端提供，
> 按用户明确要求不移植小程序；小程序端不要新增对应入口或页面。恢复移植时需重新按本文契约实现，
> 不能照搬 Vue 组件或私有附件上传链路。业务规范见 [企业代办](../features/enterprise-agency.md)。

## 1. 技术栈与目录

- **分包结构**：主包只保留 5 个 Tab 页、登录注册、全局搜索与 webview；其余页面按域拆入分包——
  `pkg-me`（我的子页）、`pkg-content`（文章 + 人才/企业名片）、`pages/trade|checkout|mall`、
  `pages/demand|application|intro`、`pages/space|event`（后五组以现有目录为分包根，页面路径不变）。
  新增页面时先判断归属域再决定放主包还是分包；主包阈值 1.5M。
- `packOptions.ignore` 已剔除未使用的 TDesign 组件目录与模板遗留 static——执行「构建 npm」会重新生成
  这些目录，上传时由 ignore 规则剔除；若某个组件首次被使用，需从 ignore 列表移除对应条目。
- 图片地址：后端下发的头像/logo/封面/正文图片均为相对路径，必须经 `utils/url.js` 的 `absoluteUrl`
  补全后再交给 `image`/`rich-text`；富文本走 `sanitizeHtml`（内部已统一处理）。


- 原生小程序：WXML + WXSS(Less) + JS(ES Module)，业务页面使用 JavaScript 与本地组件；npm 依赖仍按 package-lock.json 安装。
- 每个页面 4 个文件：`index.js` / `index.json` / `index.wxml` / `index.less`，放在 `pages/<area>/<name>/` 下。
- **相对导入按文件真实位置计算**：目录式页面（`pages/<area>/<name>/index.js`）引用根目录模块用 `../../../utils/...`；
  扁平页面（`pages/<area>/<name>.js`）用 `../../utils/...`。层级写错会让页面整页空白（模块加载失败）。
- 样式统一 `@import '/variable.less';`，尺寸用 `rpx`（1px = 2rpx）。
- **颜色只用 CSS 变量**（`var(--brand)` / `var(--text-1)` / `var(--bg-card)` / `var(--border)` 等，
  见 `app.less` 的 `page` 兜底与 `utils/theme.js`）；禁止写死 `#fff`/`#000`/品牌蓝，否则深色主题下会破版。
  明暗两套由 `buildStyle()` 生成，新增颜色变量必须同时在 `app.less` 兜底块和 `buildStyle()` 里给出浅色值与暗色值：
  - 语义色 `--success` `--warning` `--danger` 及浅底 `--success-light` `--warning-light` `--danger-light`
    （Less 常量 `@success` 等已指向这些变量，页面直接写 `@success` 即自适应明暗）；
  - 类别/状态色位 `--tone-1..5-bg` 与 `--tone-1..5-text`（浅色浅底深字，暗色压到底色上），用 `.tone-N` 类；
  - 占位 `--skeleton-base` `--skeleton-hl`（骨架屏渐变）、`--avatar-bg` `--avatar-text`（头像首字兜底）；
  - 等级配色走 `utils/level.js` 的 `levelTagStyle(level)`，主题未下发 `levelColors` 时自动回退品牌标签色。
- `theme.json` 提供窗口级明暗背景，`app.json` 的 `window` 段必须用 `@backgroundColor` / `@backgroundTextStyle` /
  `@navigationBarTextStyle` 引用；直接写字面量会导致下拉露底在暗色下仍是浅色。
- 页面必须用 `Page(withTheme({ ... }))` 包装（`utils/theme-page.js`），根节点 `<view class="app-root" style="{{themeStyle}}">`，
  主题变量才有作用域；新增页面时照抄现有页面即可。
- 图标一律用全局组件 `<ui-icon name="..." size="{{40}}" color="#00000099" />`，可用图标见 `components/ui-icon/index.js` 的 `ICONS` 键。
- 禁止：`window` / `document` / `localStorage` / `fetch` / `FormData` / `URLSearchParams` / `atob` / `Intl`。

## 2. 组件策略（TDesign 为组件底座）

**决策**：交互与展示组件统一用 `tdesign-miniprogram`（与移动 Web 的 TDesign Vue Next for Mobile 同一设计体系，但两端的包各自独立、不可互换），本仓不再新写手搓的基础组件。业务语义（状态文案、空态约定）保留为薄适配层，渲染全部交给 TDesign。

- 声明方式：在**用到它的页面/组件 json** 里按需声明，不写进 `app.json` 全局注册——全局注册会把未被引用的组件代码也打进主包（主包上限 2MB）。
  ```json
  { "usingComponents": { "t-tag": "tdesign-miniprogram/tag/tag" } }
  ```
- 主题：`app.less` 的 `.app-root` 块把 `--td-*` 变量桥接回本仓 token（`--brand` / `--bg-card` / `--success` 等）。
  新增 TDesign 组件时，按它消费的 `--td-*` 变量补映射，否则该组件会退回库内固定的浅色默认值，
  在「系统浅色 + 手动深色」时与页面其余部分不一致。
- 组件内样式无法反向作用到 TDesign 子组件（`styleIsolation`），需要微调时改 `--td-*` 变量；
  个别库内缺失的样式只在有实证时用全局 `app.less` 兜底，并注明原因。
- 组件宿主节点在 flex 行内会收缩：把 TDesign 组件放进横向 flex 时，需要给它传 `class` 并显式设 `flex`，或改用组件自带的布局槽位（如 `t-search` 的 `action`）。

> **按钮写法（实测，与官方文档有出入）**：官方用 `block` 表示整宽，但在本项目
> （tdesign-miniprogram 1.11.2 + 当前基础库）实测**`block` 不生效**——普通块级容器里也是内容宽度，
> 只有 `style="width:100%"` 能做到整宽。因此本仓按钮统一按下列写法：
>
> | 需求 | 写法 |
> |---|---|
> | 整宽 | `style="width:100%"`（不要用 `block`） |
> | 按内容宽度 | `style="width:auto"`（避免 flex 行里被拉成等分） |
> | 主色 / 浅底 / 危险 | `theme="primary"` / `theme="light"` / `theme="danger" variant="text"` |
> | 描边 | `theme="primary" variant="outline"` + `t-class="td-btn-outline"`（库内描边只有 0.5px，需要外部类补 2rpx） |
> | 危险浅底 | 追加 `t-class="td-btn-danger"` |
> | 图标 + 文字 | 插槽内没有默认间距，`app.less` 已给 `.t-button text` 补 `margin-left` |
>
> 组件会接管传入的 `class` / `style` 并作用到**内部根节点**，页面拿不到宿主节点：宿主宽度由容器布局决定，
> 组件内部节点也无法用页面样式改写，观感只能走 `t-class` 外部类（与库内规则冲突时需要 `!important`）。
> 机械替换、不补 `style` 与 `t-class` 会导致整宽失效、描边消失，务必按上表改写并截图验收。

已迁移：

| 组件 | 内部实现 | 保留原因 |
|---|---|---|
| `state-tag` | `t-tag`（tone 即 theme，light 变体） | 20 个业务状态的文案/色调映射集中在 `constants/status.js`，与 Web 端 StateTag 同源；删掉会把同一张表复制到 33 个页面 |
| `empty-block` | `t-empty` + `t-button` | 空态约定「必有出口」+ 取本仓 `ui-icon` 图标集；页面 API 不变，16 个页面零改动 |

**输入框 / 文本域**：`t-input` 与 `t-textarea` 同样只暴露外部类，根节点用 `t-class`、内部输入框用 `t-class-input`，
且都要 `!important` 才能压过库内同名规则。仓库里已有的两个通用类：

| 类名 | 用途 |
|---|---|
| `td-input-inner` | 表单行内输入框的内部样式（48rpx 行高、正文字号、主题文字色） |
| `auth-input` / `auth-input-inner` | 登录注册页的 92rpx 圆角灰底输入框 |

事件映射：`bindinput` → `bind:change`、`bindconfirm` → `bind:enter`，两者的 `e.detail.value` 与原写法一致；
`auto-height` 改为 `autosize="{{true}}"`。

页面内已改用 TDesign 的控件：

| 页面/范围 | 控件 | 说明 |
|---|---|---|
| 全站按钮（62 页） | `t-button` | 宽度用行内 `style`；描边/危险浅底用 `t-class` |
| 全站表单输入框、多行文本域 | `t-input` / `t-textarea` | 容器 `t-class`、内部输入框 `t-class-input`，均需 `!important` |
| 广场、社区、全局搜索 | `t-search` | 见上节 |
| 我的、账号与安全、通知设置、关于、我的记录、身份指引、搜索结果 | `t-cell` | 用 `title`/`description`/`note`/`arrow`，自定义右侧内容用 `note` 插槽 |
| 全站静态标签 | `t-tag` | `variant="light"`，`theme` 由原 `tag-*` 类映射 |
| 类别动态标签 | `t-tag` + `t-class` | 保留本仓类别色位：`t-class="{{tone}}"`，`.tone-N`/`.tag-*` 已提权 |
| 筛选胶囊 | `t-check-tag` | 用 `content` 属性传文字（见下方注意项） |
| 通知开关 | `t-switch` | 只做展示，整行点击由 `t-cell` 处理 |
| 分隔线 | `t-divider` | — |

**三个必须记住的坑**：

1. **WXSS 不能用自定义组件标签做选择器**。写过 `.chips > t-check-tag { flex-shrink: 0 }`，整个样式编译失败，
   小程序起不来（表现为页栈为空、自动化接口报 `getPageMetaByWebviewId` 为 null）。要影响 TDesign 组件，只能用 `t-class`。
2. **`t-check-tag` 会同时渲染默认插槽和 `content` 属性**，用插槽写文字会在末尾多出一个 `null`。
   文字一律走 `content="{{...}}"` / `content="字面量"`。
3. **组件内部可点击元素会与父级点击重复触发**。`t-switch` 放在 `t-cell` 里又绑 `bind:change` 时，
   点开关会同时触发开关事件和整行点击，开关动作被抵消；这类场景让组件只做展示，交互交给父级。
4. **`tslib` 是 TDesign 编译产物的真实依赖**。`npm run build npm`（开发者工具「构建 npm」）后部分组件会 `import "tslib"`，
   未声明该依赖时构建产物缺失、组件加载失败。`package.json` 已声明 `tslib`，重新构建 npm 前不要删。

**有意保留、不走 TDesign 的部分**（改动收益低于风险，或本身就是平台能力）：

| 内容 | 保留原因 |
|---|---|
| `wx.showModal` / `wx.showToast` | 平台标准交互，已集中在 `utils/ui.js` 封装里。`t-toast` 需要每页挂节点并经 `selectComponent` 取实例，缺节点时会变成「点了没反应」；`t-dialog` 需要每页维护 `visible` 状态并改写 20+ 处确认流程。视觉收益不抵风险，保持原生 |
| `.avatar`（12 处） | 是图片/首字兜底的外层容器，`t-avatar` 的能力没有增量 |
| `.card` / `.list` / `.page-*` | 布局容器，不属于组件库范畴 |



| 页面 | 控件 | 说明 |
|---|---|---|
| 广场（活动/资讯）、社区（政策/人才/企业）、全局搜索 | `t-search` | 取代手写 `.search` / `.search-box`；`change`/`submit`/`clear` 的事件载荷与原 `bindinput` 一致，处理函数无需改动。搜索页的「搜索」动作改用 `action` 属性 + `bind:action-click`，不再自己拼一行按钮 |

保留自建（非 TDesign 替代品）：

| 组件 | 原因 |
|---|---|
| `app-navbar` | 需要按胶囊矩形精确避让、客户品牌 Logo、断网重试条，TDesign Navbar 无对应能力 |
| `ui-icon` | 内联 SVG，零字体体积、离线可用、随主题重绘；`t-icon` 换不来收益 |
| `page-state` | 58 个页面共用的三态切换（骨架/错误重试/空态）；它组合的是 TDesign 部件，删掉等于把三态分支摊进 58 个页面 |

已移除：`section-header`（唯一用法只有一个标题，改用全局 `.section-title`）。

## 3. UI 打磨约定

- **按压反馈**：可点元素统一 `hover-class="press"`（`scale(0.96)` + `150ms ease-out`，见 `app.less` 的 `.press`）。
  禁用态用 `hover-class="none"`，不让它跟着缩放；高频交互（Tab 切换）不加动效。
- **底部弹层**：打开时自定义底栏必须让位——底栏在框架层，页面 `z-index` 压不住。
  `utils/theme-page.js` 已包住 `setData`，页面把弹层状态命名为 `xxxVisible` / `sheetOpen` 即自动同步；
  新增其他命名的弹层请把键名补进 `OVERLAY_KEYS`。
- **弹层动效**：进场 `sheet-in` 200ms `cubic-bezier(0.2, 0, 0, 1)`、遮罩 `mask-in` 150ms；退场直接移除。
  两者都在 `prefers-reduced-motion: reduce` 下关闭。
- **弹层滚动**：可滚动的浮层加 `overscroll-behavior: contain`，滚到底不再带动页面。
- **阴影**：只用 `@shadow-float`（浮起卡片/悬浮按钮）与 `@shadow-bar`（底部操作栏）；
  平面卡片靠白底与灰页面对比区分层级，不加阴影。
- **明暗切换**：切换瞬间页面根会带 `theme-switching`，冻结过渡，避免颜色过渡同时触发造成拖影。
- **图片描边**：内容图统一 `box-shadow: inset 0 0 0 2rpx var(--image-outline)`（纯黑/纯白 10%），
  logo 与插画不加。

## 4. 全局组件（app.json 已全局注册，无需在页面 json 声明）

| 组件 | 用法 | 说明 |
|---|---|---|
| `app-navbar` | `<app-navbar title="需求" back="{{false}}" />` | 自定义导航栏，自动处理状态栏与胶囊；`back` 默认 true；右上角用 `<view slot="right">`；页面内容**不需要**额外留白 |
| `ui-icon` | `<ui-icon name="search" size="{{36}}" color="#00000066" />` | 线性图标 |
| `state-tag` | `<state-tag kind="demand" value="{{item.status}}" />` | 状态标签（内部 `t-tag`），kind/value 见 `constants/status.js` |
| `page-state` | `<page-state loading="{{loading}}" error="{{error}}" empty="{{!list.length}}" bind:retry="load" bind:action="onAction" actionText="去逛逛">内容</page-state>` | 加载/错误/空态容器，正常态渲染默认插槽 |
| `empty-block` | `<empty-block text="暂无内容" actionText="去逛逛" bind:action="..." />` | 独立空态（内部 `t-empty`） |

需要组件内再套组件时，在页面 json 里补声明（如 `"usingComponents": {}` 可留空）。

## 5. 页面骨架（照抄这个结构）

```js
// pages/xxx/index.js
import { fetchXxx } from '../../services/xxx'
import { withTheme } from '../../utils/theme-page'
import { ensureLogin, getProfile } from '../../utils/session'
import { currentUrl } from '../../utils/nav'
import { toast } from '../../utils/ui'

Page(withTheme({
  data: { loading: true, error: '', list: [] },

  onLoad(options) {
    this.options = options || {}
    if (!ensureLogin(currentUrl())) return
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    this.setData({ loading: !this.data.list.length, error: '' })
    return fetchXxx()
      .then((res) => this.setData({ list: res || [], loading: false }))
      .catch((err) => this.setData({ error: (err && err.message) || '加载失败，请稍后重试', loading: false }))
  },

  onRetry() { this.load() },
}))
```

```json
{
  "navigationBarTitleText": "页面标题",
  "enablePullDownRefresh": true,
  "backgroundTextStyle": "dark",
  "usingComponents": {}
}
```

```xml
<view class="app-root page page-body" style="{{themeStyle}}">
  <app-navbar title="页面标题" />
  <page-state loading="{{loading}}" error="{{error}}" empty="{{!list.length}}" bind:retry="onRetry">
    <view wx:for="{{list}}" wx:key="id">…</view>
  </page-state>
</view>
```

```less
@import '/variable.less';

/* 只写本页特有样式；通用类见 app.less */
```

## 6. 全局样式类（app.less，可直接用）

布局：`page`（整页底色）、`page-body`（32rpx 内边距 + 24rpx 间距）、`page-tabbar`（Tab 页底部留白，**5 个 Tab 页必须加**）、`page-actionbar`（底部固定操作栏留白）、`row` `row-top` `col` `between` `center` `wrap` `flex-1` `gap-2/3/4/6/8`。

卡片：`card` `card-lg` `card-flat` `list` `list-item` `list-item-title` `list-item-desc` `press`（hover-class 专用）。

文字：`title` `card-title` `body` `body-sm` `caption` `muted` `weak` `strong` `numeric` `brand` `success` `warning` `danger` `ellipsis` `ellipsis-2` `ellipsis-3` `pre-wrap` `break` `section-title` `section-more`。

标签：`tag` + `tag-brand` `tag-success` `tag-warning` `tag-danger` `tag-default`。

按钮：`btn` + `btn-primary` `btn-outline` `btn-ghost` `btn-danger` `btn-block` `btn-sm`；`<button class="btn btn-primary" bindtap>` 自带重置。

底部操作栏：`action-bar`（fixed），内部放 `btn`。

头像：`avatar` `avatar-lg` `avatar-sm`（无头像时显示姓名首字）。

表单：`field` `field-label` `field-input` `field-error` `field-hint`。

其他：`divider` `skeleton` `rich-text`（富文本容器）。

> 交互反馈统一 `hover-class="press"`；可点区域要有但不要嵌套过深。

## 7. 请求与数据

- `services/*.js`：与 H5 端 `src/api/*.ts` 一一对应，函数签名一致，返回值已解包（直接是 `data`）。
- 错误：`catch (err) { err.message, err.code }`；401 由请求层统一处理（清登录态 + 跳登录）。
- 分页：`{ list, total }` 或 `{ items }` 视接口而定，按各 service 注释。
- 登录态：`isLogged()` / `getProfile()`（`{uid,name,avatar,identities,points,pointsDiscount}`）/ `refreshProfile()`。
- 登录门禁：`ensureLogin(currentUrl())` 返回 false 表示已跳登录，`return` 即可。
- 微信登录未绑定时，验证方式按后端 `channels` 展示，顺序为手机号、邮箱、账号密码。账号密码仅绑定已有账号；错误保留在当前页，428 后补图形验证码。验证码注册只有在验证和微信绑定均成功后才创建账号；接口契约见 [客户端 API](../backend/app-api.md)。
- 「账号与安全」可绑定或更换为当前使用的微信，通过登录页 `mode=wechat-rebind` 复用身份验证表单，仅允许验证当前社区账号。用户要改为另一微信时，需在该微信中用社区账号登录后操作；验证成功返回安全页并重新加载绑定状态。
- 未读数由 App 统一维护。登出/会话失效立即清零并通知所有底栏实例；拉取未读数时记录请求所属令牌，退出或切换账号后的旧响应不得回写角标。`npm test` 包含这些场景的回归测试。
- 需要默认分页大小：`import { DEFAULT_LIST_PAGE_SIZE } from '../../config/index'`。

## 8. 常量与工具

| 模块 | 内容 |
|---|---|
| `constants/status.js` | `stateMeta(kind, value)` → `{label, tone}`；kind 列表见文件 |
| `constants/demand.js` | `DEMAND_KINDS`、`DEMAND_KIND_LABELS`、`demandKindMeta(kind)`、`demandDateText(d)` |
| `utils/format.js` | `formatZhNumber` `formatLocalDate` `formatLocalDateTime` `formatServerDateTime` `formatServerDate` `plainTextSummary` `shortDateText` `todayText` |
| `utils/money.js` | `formatFen(fen)` → `¥1,234.50`、`formatFenPlain`、`fenToYuan` |
| `utils/points.js` | `discountedPoints(price, discount)`、`discountText`、`formatPoints`、`normalizeDiscount`、`FULL_PRICE_DISCOUNT` |
| `utils/validators.js` | `isValidPhone` `isValidEmail` `passwordProblem` `isValidIdCard` `maskPhone` `maskEmail` `maskName` `maskIdCard` |
| `utils/enrollment.js` | `canCancelEnrollment(item, now)`、`enrollmentState(event)` |
| `utils/article.js` | `sanitizeHtml(html)`（rich-text 前必须清洗）、`firstImage`、`textLength` |
| `utils/ui.js` | `toast` `success` `confirm`（Promise<boolean>）`alert` `loading` `hideLoading` `withLoading` `errorToast` `copyText` `openLink` |
| `utils/link.js` | `openWebPath(h5Path)`（后台下发的 H5 链接 → 小程序页面）、`consumeTabQuery(path)` |
| `utils/nav.js` | `navigate(url)`（自动区分 switchTab）`redirect` `goBack(fallback)` `currentUrl()` `queryString(obj)` |

## 9. 路由与跳转

- 页面间跳转用 `wx.navigateTo({ url: '/pages/xxx/index?param=' + encodeURIComponent(v) })`，Tab 页用 `wx.switchTab`（**不能带参数**）。
- 跨 Tab 传参：`getApp().globalData.tabQuery['/pages/projects/index'] = { kind: 'task' }` 后 `switchTab`，Tab 页 `onShow` 用 `consumeTabQuery('/pages/projects/index')` 取。
- 返回：导航栏自带返回；页面内主动返回用 `goBack('/pages/xxx/index')`。
- 后台下发的 H5 路径用 `openWebPath(path)`。

## 10. 富文本与图片

- 正文：`<rich-text class="rich-text" nodes="{{html}}" />`，`html` 必须先 `sanitizeHtml()`。
- 图片：`<image src="{{url}}" mode="aspectFill" lazy-load />`；无图用品牌渐变占位块，不要留白框。
- 图片地址来自后端；发布环境需要正确配置微信允许的域名，不能把开发时关闭校验当作上线配置。

## 11. 表单

- 输入：`<input class="field-input" value="{{form.title}}" data-field="title" bindinput="onInput" placeholder="请输入" />`
- `onInput(e) { this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value }) }`
- 多行：`<textarea auto-height maxlength="2000" ... />`
- 选择：`<picker mode="date" value="{{form.date}}" bindchange="onDateChange">`
- 单选组：自绘 `view` 列表 + 选中态样式，不用 radio 原生样式。
- 提交按钮固定在底部：`<view class="action-bar"><button class="btn btn-primary btn-block" bindtap="onSubmit">提交</button></view>`，内容区加 `page-actionbar`。
- 提交前 `toast()` 校验提示；提交中 `loading` 或按钮 disabled；成功后 `toast` + 返回/跳转。

## 12. 页面清单与归属

见 `app.json` 的 `pages` 数组（当前 76 个页面；数量以 app.json 与静态检查为准）。H5 路由与小程序页面的映射见 `utils/link.js`。

## 13. 完成标准（每个页面）

1. 四个文件齐全，JS 通过 `node --check`（把 `.js` 复制成 `.mjs` 后检查）。
2. WXML 只使用已注册组件与基础组件；`wx:for` 必须带 `wx:key`。
3. 所有网络请求都有 loading / error / 空态；错误文案中文、可重试。
4. 登录页/提交类动作有登录门禁与提交防重。
5. 页面不引用不存在的 service 函数；字段名以 H5 端 `src/types/index.ts` 与对应视图为准。
6. 修改共享基础设施后检查所有使用方，不能仅验证当前页面。
