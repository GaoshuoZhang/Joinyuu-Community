# 聚屿社区 · 微信小程序

> 代码路径与开发命令默认相对 apps/wxminiprogram 仓；文档链接指向协作仓 docs。当前路由、模型与依赖版本以源码和锁文件为准。

由 `apps/client-mobile`（Vue 3 + TDesign Mobile Vue 的移动 Web 客户端）全量移植而来的**原生微信小程序**。
沿用同一套后端接口（`/api/app`），页面与业务口径与 H5 端一一对应。

## 快速开始

1. 在本仓执行 `npm ci`，然后在微信开发者工具执行「工具 → 构建 npm」。后端独立启动（默认 `http://127.0.0.1:7757`）；如使用父协作工作区，也可从父目录执行 `pnpm dev:api`。
2. 微信开发者工具 → 导入项目 → 选择本目录（`apps/wxminiprogram`）。
   - AppID 已在 `project.config.json` 配置；测试号亦可。
   - 「详情 → 本地设置」勾选 **不校验合法域名**（`project.config.json` 中 `urlCheck` 已设为 false）。
3. 编译即可运行，首页为 `pages/home/index`。

## 客户主题与深色模式

主题由后台「系统配置 → 移动端主题」上传主题包并启用（`MobileThemePackage`），公开接口
`GET /api/app/mobile-theme` 下发品牌与明暗两套颜色 token。小程序侧：

- `services/theme.js` 拉取主题；`utils/theme.js` 把 token 折算成 CSS 变量（品牌色/按钮色/卡片/文字/边框/
  导航/TabBar/入口卡片色/等级色/品牌渐变），并按系统明暗选择 light/dark。
- `utils/theme-page.js` 的 `withTheme()` 包装每个页面，把变量挂到页面根节点 `.app-root`，
  主题到达或系统明暗切换时自动回写（Page 的 behaviors 只有 data/methods 合并，不执行生命周期，
  所以不能只用 behavior）。
- `app.json` 已开启 `"darkmode": true` + `theme.json`，跟随系统深浅色。
- **后台未配置主题 / 恢复默认主题**时使用内置默认主题（TDesign 明/暗两套：浅色 #f3f3f3 + #0052d9，
  深色 #181818 + #4584f7）；主题拉取失败沿用上次缓存（`joinyuu_mini_theme_cache`），60 秒内不重复请求。
- 首页模块顺序读 `layout.homeModules`（与 H5 同口径，白名单 8 项）。
- 品牌 Logo/名称通过 `getBrand()` 读取（Tab 页导航栏、登录页已使用）。

## 图标

`components/ui-icon` 内置 **TDesign 图标路径**（从 `tdesign-icons-vue-next` 抽取，与 H5 同一套图形），
以 data URI 内联渲染，不依赖图标字体与 CDN；语义色名（`brand` / `text-2` / `entry-*-icon` 等）
由 `utils/theme` 按当前主题解析，主题切换自动重绘。未收录名称退回内置描边图标。
重新生成：`node scripts/gen-filled-icons.mjs`（生成后由脚本内联进组件，无需额外文件）。

## 「我的」页数据看板

积分与等级已合并进「我的数据」卡片（标题 + 看板入口 → 积分/等级大数字 → 累计获得/消耗 → 8 项参与度指标），
H5 与小程序两侧同一结构与同一套数据（`GET /api/app/me/stats`）。

## 微信一键登录

**配置在后台**：系统配置 → 功能开关 → 「微信小程序一键登录」（独立开关 + 小程序 AppID + AppSecret；与移动 Web 的网站应用扫码登录配置互不影响）。
服务端读取该配置（环境变量 `WXMINI_APPID/WXMINI_APP_SECRET` 仅作未配置时的回退），
小程序登录页按 `/api/app/config` 的 `wxLoginOpen`（仅小程序渠道开关）决定是否显示入口。

登录流程（两次请求）：

1. `POST /api/app/auth/wechat-mini/login` `{ code }`：`wx.login` 的 code → `jscode2session`。
   - 该 openid 已绑定 → 直接登录；
   - 同一 unionid 已用公众号授权过 → 绑定到原账号后登录；
   - 未绑定 → 返回 `{ needBind: true, ticket, channels }`（票据 10 分钟、单次消费）。
2. `POST /api/app/auth/wechat-mini/bind` `{ ticket, channel, identifier, code, agreed }`：
   校验手机号/邮箱验证码（复用短信/邮箱登录验证码通道）后——
   - 标识已注册 → **把微信 openid 绑到原账号**并登录（不新建用户）；
   - 标识未注册 → 按后台注册渠道开关校验后建号，再绑定并登录；
   - 两个渠道都关闭 → 返回「注册暂未开放」。

绑定接口会同时处理 openid 冲突（同一 openid 曾绑到别的账号时以本次为准）。

## 小程序支付（JSAPI）

小程序支付与 JSAPI 共用下单接口，差别只有两处：`appid` 必须是**小程序 AppID**，`payer.openid` 必须是用户在该
AppID 下的 openid；调起支付签名的 `appId` 必须与下单一致（微信会校验）。小程序调起支付不校验 JSAPI 授权目录。

- 凭证：复用「系统配置 → 功能开关 → 微信小程序一键登录」里的小程序 AppID / AppSecret；商户参数仍在「系统配置 → 收款配置」。
- 前置（微信侧，后台只做提示）：商户平台已开通 JSAPI/小程序支付权限，并完成「小程序 AppID 授权绑定商户号」。
- 绑定：收银台发起支付时，若当前账号还没绑定小程序 openid，后端返回 `requiresMiniBind`，小程序 `wx.login`
  取 code 调 `POST /api/app/commerce/wechat/mini/bind` 绑定后自动重试一次。
- 识别端：小程序请求统一带 `X-Client-Platform: miniprogram`，后端也兼容 UA 中的 `miniProgram`。
- 结果：前端 `wx.requestPayment` 回调不作为收款凭证，仍以 `POST /commerce/payments/:id/sync`（查单）与支付通知为准。

## 接口地址

`config/index.js`：

- `API_BASE_DEV`：开发/体验版，默认 `http://127.0.0.1:7757/api/app`
- `API_BASE_PROD`：正式版，**发布前必须替换为你自己的 HTTPS 源站**，并在
  「小程序后台 → 开发管理 → 开发设置 → 服务器域名」把它加入 `request 合法域名`。

## 目录结构

```
app.js / app.json / app.less     启动逻辑、路由与全局样式（设计令牌见 variable.less）
config/index.js                  接口地址、本地存储键、分页默认值
services/*.js                    23 个接口模块，与 H5 端 src/api/*.ts 一一对应
utils/                           request / token / session / nav / link / format / money /
                                 points / status / validators / enrollment / ui 等
constants/                       状态字典（与 H5 的 StateTag 同口径）、需求类型
components/                      app-navbar / ui-icon / state-tag / page-state /
                                 empty-block / section-header
custom-tab-bar/                  底部 5 Tab（首页/需求/社区/广场/我的）
pages/                           业务页面（75 个，见 app.json）
styles/auth.less                 认证页共用样式
scripts/data/pages.generated.json   路由脚本使用的生成数据（规范集中于协作仓）
```

## 与 H5 端的对应关系

| H5 路由 | 小程序页面 |
|---|---|
| `/` | `pages/home/index` |
| `/projects`、`/demands/:id` | `pages/projects/index`、`pages/demand/detail` |
| `/community`、`/talents/:uid`、`/enterprises/:id` | `pages/community/index`、`talent-card`、`enterprise-showcase` |
| `/plaza`、`/events/:id`、`/articles/:id` | `pages/plaza/index`、`event/detail`、`article/detail` |
| `/mall`、`/mall/:id` | `pages/mall/index`、`mall/detail` |
| `/spaces`、`/spaces/:id/reserve` | `pages/space/index`、`space/reserve` |
| `/me/**` | `pages/me/**`、`pages/trade/**` |

后台配置的 H5 跳转链接（轮播图、公告、站内信）由 `utils/link.js` 统一转换为小程序页面；
Tab 页无法携带查询参数，转换时写入 `globalData.tabQuery`，由 Tab 页 `onShow` 通过
`consumeTabQuery()` 消费。

## 实现约定

- 原生小程序：WXML + WXSS(Less) + JS(ES Module)，页面主要使用本地组件；工程仍声明 TDesign 等 npm 依赖，安装以 package-lock.json 为准。
- 自定义导航栏（全局 `navigationStyle: custom`）统一用 `app-navbar`，自动处理状态栏与胶囊区。
- 请求统一走 `utils/request.js`：包络解包（`{code,data}`）、`Bearer` 令牌、15s 超时、401 清会话并跳登录。
- 列表页统一 loading / error / 空态（`page-state`）与下拉刷新。
- 状态文案只允许来自 `constants/status.js`（与 H5 `StateTag` 同一张表）。

## 已知差异与待办

- **微信一键登录已可用，但需配置小程序 AppSecret**（见上节）。
- **微信支付代码链路已接入**：后端存在小程序 openid 绑定和小程序 AppID 下单适配，客户端存在 wx.requestPayment 与结果查询；真实商户和真机支付未在本次文档整理中验证。
- 主题：已接入后台主题包（含深色模式）；README 上方「客户主题与深色模式」有实现说明。
- 无障碍：保留 `aria-role` / `aria-label` 等基础标注，未复刻 H5 的读屏焦点管理。
- `rich-text` 只能渲染白名单标签，H5 的复杂正文样式（表格内边距等）会做简化。

## 验证

在小程序仓执行 npm test（JS/JSON/路由与相对引用静态检查）。修改路由时执行 node scripts/generate-routes.mjs；路由数据写入 scripts/data/pages.generated.json。微信开发者工具另做构建 npm、编译与模拟器检查；真机支付、定位、上传和分享需单独验证。静态检查不等于运行时或真机验收。

## 页面布局与新增页面

- 页面文件既有 **扁平**（`pages/me/profile.js`）也有 **目录式**（`pages/me/notices/index.js`），
  `app.json` 的 `pages` 与 `utils/link.js` 按**真实文件路径**登记；新增页面后跑一次
  `node scripts/generate-routes.mjs` 即可同步路由表。
- 相对导入的层级必须按文件真实位置计算：目录式页面位于 `pages/<area>/<name>/`，
  引用根目录模块要用 `../../../utils/...`（扁平页面是 `../../utils/...`）。
  这是并行移植时最容易出错的地方，改动后请用 `scripts/fix-imports.mjs --dry` 自检。

## 独立仓库协作

Git 历史已从聚屿代码重新初始化，第三方 LICENSE 保留。当前远程地址见协作仓 repositories.json。版本规则见 [版本与发布](../workspace/versioning.md)。
