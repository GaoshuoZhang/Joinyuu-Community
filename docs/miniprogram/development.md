# 小程序移植契约（apps/wxminiprogram）

> 代码路径与开发命令默认相对 apps/wxminiprogram 仓；文档链接指向协作仓 docs。当前路由、模型与依赖版本以源码和锁文件为准。

> 本文是 `apps/client-mobile` → `apps/wxminiprogram` 全量移植的统一规范。
> 新增页面前**先读**本文；公共基础设施变更需评估所有页面并运行验证。

## 1. 技术栈与目录

- 原生小程序：WXML + WXSS(Less) + JS(ES Module)，业务页面使用 JavaScript 与本地组件；npm 依赖仍按 package-lock.json 安装。
- 每个页面 4 个文件：`index.js` / `index.json` / `index.wxml` / `index.less`，放在 `pages/<area>/<name>/` 下。
- **相对导入按文件真实位置计算**：目录式页面（`pages/<area>/<name>/index.js`）引用根目录模块用 `../../../utils/...`；
  扁平页面（`pages/<area>/<name>.js`）用 `../../utils/...`。层级写错会让页面整页空白（模块加载失败）。
- 样式统一 `@import '/variable.less';`，尺寸用 `rpx`（1px = 2rpx）。
- **颜色只用 CSS 变量**（`var(--brand)` / `var(--text-1)` / `var(--bg-card)` / `var(--border)` 等，
  见 `app.less` 的 `page` 兜底与 `utils/theme.js`）；禁止写死 `#fff`/`#000`/品牌蓝，否则深色主题下会破版。
- 页面必须用 `Page(withTheme({ ... }))` 包装（`utils/theme-page.js`），根节点 `<view class="app-root" style="{{themeStyle}}">`，
  主题变量才有作用域；新增页面时照抄现有页面即可。
- 图标一律用全局组件 `<ui-icon name="..." size="{{40}}" color="#00000099" />`，可用图标见 `components/ui-icon/index.js` 的 `ICONS` 键。
- 禁止：`window` / `document` / `localStorage` / `fetch` / `FormData` / `URLSearchParams` / `atob` / `Intl`。

## 2. 全局组件（app.json 已全局注册，无需在页面 json 声明）

| 组件 | 用法 | 说明 |
|---|---|---|
| `app-navbar` | `<app-navbar title="需求" back="{{false}}" />` | 自定义导航栏，自动处理状态栏与胶囊；`back` 默认 true；右上角用 `<view slot="right">`；页面内容**不需要**额外留白 |
| `ui-icon` | `<ui-icon name="search" size="{{36}}" color="#00000066" />` | 线性图标 |
| `state-tag` | `<state-tag kind="demand" value="{{item.status}}" />` | 状态标签，kind/value 见 `constants/status.js` |
| `page-state` | `<page-state loading="{{loading}}" error="{{error}}" empty="{{!list.length}}" bind:retry="load" bind:action="onAction" actionText="去逛逛">内容</page-state>` | 加载/错误/空态容器，正常态渲染默认插槽 |
| `empty-block` | `<empty-block text="暂无内容" actionText="去逛逛" bind:action="..." />` | 独立空态 |
| `section-header` | `<section-header title="我的需求" more="全部" bind:more="..." />` | 区块标题 |

需要组件内再套组件时，在页面 json 里补声明（如 `"usingComponents": {}` 可留空）。

## 3. 页面骨架（照抄这个结构）

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

## 4. 全局样式类（app.less，可直接用）

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

## 5. 请求与数据

- `services/*.js`：与 H5 端 `src/api/*.ts` 一一对应，函数签名一致，返回值已解包（直接是 `data`）。
- 错误：`catch (err) { err.message, err.code }`；401 由请求层统一处理（清登录态 + 跳登录）。
- 分页：`{ list, total }` 或 `{ items }` 视接口而定，按各 service 注释。
- 登录态：`isLogged()` / `getProfile()`（`{uid,name,avatar,identities,points,pointsDiscount}`）/ `refreshProfile()`。
- 登录门禁：`ensureLogin(currentUrl())` 返回 false 表示已跳登录，`return` 即可。
- 需要默认分页大小：`import { DEFAULT_LIST_PAGE_SIZE } from '../../config/index'`。

## 6. 常量与工具

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

## 7. 路由与跳转

- 页面间跳转用 `wx.navigateTo({ url: '/pages/xxx/index?param=' + encodeURIComponent(v) })`，Tab 页用 `wx.switchTab`（**不能带参数**）。
- 跨 Tab 传参：`getApp().globalData.tabQuery['/pages/projects/index'] = { kind: 'task' }` 后 `switchTab`，Tab 页 `onShow` 用 `consumeTabQuery('/pages/projects/index')` 取。
- 返回：导航栏自带返回；页面内主动返回用 `goBack('/pages/xxx/index')`。
- 后台下发的 H5 路径用 `openWebPath(path)`。

## 8. 富文本与图片

- 正文：`<rich-text class="rich-text" nodes="{{html}}" />`，`html` 必须先 `sanitizeHtml()`。
- 图片：`<image src="{{url}}" mode="aspectFill" lazy-load />`；无图用品牌渐变占位块，不要留白框。
- 图片地址来自后端；发布环境需要正确配置微信允许的域名，不能把开发时关闭校验当作上线配置。

## 9. 表单

- 输入：`<input class="field-input" value="{{form.title}}" data-field="title" bindinput="onInput" placeholder="请输入" />`
- `onInput(e) { this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value }) }`
- 多行：`<textarea auto-height maxlength="2000" ... />`
- 选择：`<picker mode="date" value="{{form.date}}" bindchange="onDateChange">`
- 单选组：自绘 `view` 列表 + 选中态样式，不用 radio 原生样式。
- 提交按钮固定在底部：`<view class="action-bar"><button class="btn btn-primary btn-block" bindtap="onSubmit">提交</button></view>`，内容区加 `page-actionbar`。
- 提交前 `toast()` 校验提示；提交中 `loading` 或按钮 disabled；成功后 `toast` + 返回/跳转。

## 10. 页面清单与归属

见 `app.json` 的 `pages` 数组（当前 76 个页面；数量以 app.json 与静态检查为准）。H5 路由与小程序页面的映射见 `utils/link.js`。

## 11. 完成标准（每个页面）

1. 四个文件齐全，JS 通过 `node --check`（把 `.js` 复制成 `.mjs` 后检查）。
2. WXML 只使用已注册组件与基础组件；`wx:for` 必须带 `wx:key`。
3. 所有网络请求都有 loading / error / 空态；错误文案中文、可重试。
4. 登录页/提交类动作有登录门禁与提交防重。
5. 页面不引用不存在的 service 函数；字段名以 H5 端 `src/types/index.ts` 与对应视图为准。
6. 修改共享基础设施后检查所有使用方，不能仅验证当前页面。
