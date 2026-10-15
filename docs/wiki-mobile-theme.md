# 移动端主题开发规范（协议 v1）

本文是 Joinyuu Community 移动端主题包的开发、交付和升级契约。主题源文件可在独立私有仓库 `Joinyuu-Mobile-Theme` 中按客户维护；客户服务器只需部署公版程序、执行数据库迁移，再从「系统管理 → 移动端主题」上传该客户 ZIP，无需重新编译客户端。

## 1. 能力与边界

- 可定制：浅色/深色品牌配色与独立强调色、浅底色、页面与卡片背景、主要/次要文字色、圆角、品牌名称、明暗 Logo、首页模块顺序。
- 内置模板：`default` 保持公版首页；`brand` 将发布需求按钮呈现为实心主操作。首页直接从搜索框开始，品牌配色用于卡片、文字、按钮等现有元素，不增加占据首屏的宣传展示区。两者均复用同一套业务组件和接口。
- 未上传、未启用或恢复公版时，不注入客户样式，保持公版。
- 主题包不包含 JavaScript、Vue、HTML、任意 CSS、字体、SVG、远程图片或业务权限配置。新组件、模板和交互应先在公版实现，再通过主题协议开放。
- 修改品牌名称只影响移动端标题、导航和品牌展示，不修改后台系统配置、法律协议及业务主体名称。
- 主题按部署实例生效；当前不是一套后台按登录账号分配多个租户主题的系统。
- 同一实例的普通用户共享当前启用主题；预览通过独立临时令牌隔离，不切换线上状态。

## 2. 包结构

```text
customer-a-1.0.0.zip
  manifest.json
  assets/
    logo.png
    home-background.webp
```

`manifest.json` 必须在 ZIP 根目录，不可再套一层客户目录。没有图片时允许只有 manifest。文件名区分大小写，使用 UTF-8 JSON（无 BOM）。配置格式见同目录 `mobile-theme.schema.json`。可直接复制 `examples/mobile-theme/manifest.json` 作为不依赖图片的起点。

## 3. 完整配置示例

```json
{
  "schemaVersion": 1,
  "id": "customer-a",
  "name": "客户 A 品牌主题",
  "version": "1.0.0",
  "description": "品牌首页、蓝色配色与圆角卡片",
  "brand": {
    "name": "客户 A 社区",
    "slogan": "在这里，连接新的可能",
    "eyebrow": "OPC Community",
    "headline": "AI创业者的伟大航路\n从这里启航",
    "highlight": "伟大航路",
    "logo": "assets/logo.png",
    "logoDark": "assets/logo-dark.png",
    "logoShape": "wordmark",
    "homeBackground": "assets/home-background.webp"
  },
  "tokens": {
    "light": {
      "primary": "#0052d9",
      "accent": "#c45112",
      "primaryLight": "#edf4f8",
      "heroStart": "#f4f8fb",
      "heroEnd": "#fff8e8",
      "background": "#f3f5f8",
      "surface": "#ffffff",
      "text": "#181818",
      "secondaryText": "#555555"
    },
    "dark": {
      "primary": "#6b9eff",
      "accent": "#ffb164",
      "primaryLight": "#203451",
      "heroStart": "#10213b",
      "heroEnd": "#172642",
      "background": "#181818",
      "surface": "#242424",
      "text": "#eeeeee",
      "secondaryText": "#bbbbbb"
    },
    "radius": "large"
  },
  "layout": {
    "template": "brand",
    "homeModules": ["entries", "banner", "publish", "activation", "announcement", "events", "demands", "articles"]
  }
}
```

| 字段 | 约束与含义 |
|---|---|
| schemaVersion | 必填，当前仅支持数字 `1`，用于协议兼容检查 |
| id | 必填，字母开头的小写字母、数字、连字符，1–64 位；建议保持客户主题 ID 稳定 |
| name | 必填，非空，最多 60 字 |
| version | 必填，`主版本.次版本.修订号`，各段 1–5 位数字，例如 `1.2.0` |
| description | 可选，非空，最多 500 字 |
| brand.name / slogan | 可选，非空，分别最多 60 / 160 字 |
| brand.logo / homeBackground | 可选，引用 ZIP 内 `assets/` 下图片；Logo 用于登录页；homeBackground 为兼容旧包保留，当前首页不显示 |
| brand.logoDark | 可选，深色模式 Logo，与 logo 一同提供。随应用实际明暗模式切换，不只判断操作系统偏好 |
| brand.logoShape | 可选，`square`（默认，64×64px）或 `wordmark`（132×44px）；横版字标请使用约 3:1 且透明留白较少的原图 |
| brand.eyebrow | 可选，最多 60 字；为兼容旧包保留，当前首页不显示 |
| brand.headline / highlight | 可选，标题最多 100 字，强调词最多 40 字且必须是标题中的子串。为兼容旧包保留，当前首页不显示 |
| tokens.light / dark | 可选，各颜色必须是 `#RRGGBB`，未填写的字段保留公版变量 |
| tokens.light.accent / dark.accent | 可选，独立强调色，不替代主操作色或业务状态色 |
| tokens.light.primaryLight / dark.primaryLight | 可选，图标气泡等品牌浅底色，覆盖自动生成的浅底，避免深主色混白后发灰 |
| tokens.light.heroStart / heroEnd（dark 同名） | 可选，为兼容旧包保留，当前首页不显示渐变品牌区 |
| tokens.radius | 可选，`small` / `medium` / `large`，分别映射 4 / 8 / 16px 的主要卡片圆角；large 的控件圆角为 12px，保持卡片和控件层级 |
| layout.template | 可选，`default` / `brand`，缺省 `default` |
| layout.homeModules | 可选，已知模块的不重复数组，定义优先排列顺序，不用于禁用功能 |

未知字段会拒绝上传，避免拼写错误造成静默不生效。浅色和深色独立配置；未指定 dark 时，主题 light 配色也用于深色模式，因此建议每个主题提供完整的 light 和 dark 配色。

2026-10-15 增加的增强字段均为可选，新公版继续兼容原 v1 主题；含新字段的主题应在部署支持这些字段的公版后上传。旧公版会按严格校验拒绝未知字段。标题不接受 HTML，不提供任意 CSS 或脚本注入能力。

首页优先展示搜索和业务入口，不添加品牌大标题、口号或装饰背景区。品牌 Logo 和口号展示在登录页；不要把品牌口号塞进社区名称。入口卡片高度限制在 88–104px，内容及固定导航最大宽度为 640px，窄屏说明文字可以自然换行。

主色会生成 TDesign 品牌色阶及按压、焦点、禁用等变量，深色模式使用深色的低阶底色。主按钮会按主色亮度选择黑字或白字，品牌渐变会压暗以适配反色文字。业务状态色、字号体系、权限和路由不由主题改变。主色与按钮文字、正文与卡片背景均应检查对比度，不能只验证首页效果。

### 3.1 独立区域配色（2026-10-15 扩展）

以下可选字段分别配置在 `tokens.light` 和 `tokens.dark`，颜色仍只接受 `#RRGGBB`。未填写时沿用主色、公版或已有颜色，不要求旧主题补齐。先更新公版后端及客户端，再上传使用扩展字段的 ZIP；旧后端会拒绝未知字段。

| 字段 | 作用范围 |
|---|---|
| border | 卡片与通用组件边框 |
| buttonBackground / buttonText | 实心主按钮底色与文字色；不改变链接、描边按钮、成功/警告/错误等业务状态色。按压和禁用底色由按钮底色生成；省略文字色时自动选择黑/白 |
| navigationBackground / navigationText / navigationActive | 底部导航底色、未选中文字与图标、选中文字与图标 |
| searchBackground / searchText / searchPlaceholder | 搜索框底色、输入文字、占位文字及搜索图标 |
| sectionTitle / link | 首页内容分区标题与“更多”等链接 |
| entryCards | 六类首页服务入口的独立颜色，见下表 |

`entryCards` 的键固定为 `enterprise`（企业合作/管理）、`talent`（人才登记/个人名片）、`articles`（文章投稿）、`mall`（积分商城）、`spaces`（空间预约）、`events`（活动计划）。颜色绑定功能，不按第几个卡片分配；功能开关隐藏入口时，其它入口保持原配色。

每个入口支持 `background`、`icon`、`iconBackground`、`text`、`secondaryText`、`border` 六个可选颜色。例如：

```json
{
  "buttonBackground": "#e2630d",
  "buttonText": "#101d3e",
  "entryCards": {
    "mall": {
      "background": "#fff7dc",
      "icon": "#795600",
      "iconBackground": "#ffe69a",
      "text": "#101d3e",
      "border": "#eedfab"
    }
  }
}
```

以上片段放入 `tokens.light`，深色模式在 `tokens.dark` 单独提供。浅色底搭配深色文字、深色底搭配浅色文字；不要将 Logo 中的亮黄、浅青直接作为白底上的正文颜色。检查正文和按钮文字至少 4.5:1、功能图标至少 3:1 的对比度。主题配置的维护位置是独立主题目录 `Joinyuu-Mobile-Theme/customers/<客户>/manifest.json`，运行时上传数据不提交到公版仓库。

## 4. 首页模块与升级规则

默认顺序为：

| 标识 | 内容 |
|---|---|
| banner | 运营轮播图 |
| entries | 业务功能入口宫格 |
| publish | 发布需求按钮 |
| activation | 新手任务 |
| announcement | 运营公告 |
| events | 近期活动 |
| demands | 最新需求 |
| articles | 最新资讯 |

配置中列出的模块优先排列，遗漏的模块按公版默认顺序补在后面。例如 `["articles", "entries"]` 会把资讯和宫格前置，其他模块仍保留。未来公版增加模块时也遵循这个补全规则，避免旧主题永久丢失新增入口。

是否展示内容仍遵守现有数据、登录身份、功能开关和服务端权限。主题不能打开后台已关闭的功能。模块按真实 DOM 顺序渲染，不通过 CSS order 制造阅读顺序差异。

新业务页面默认继承主题变量；页面重构应继续使用公版 tokens。协议 v1 的已有字段含义和模板 ID 不应破坏性修改；不兼容的协议必须增加 schemaVersion，并提供迁移方案。公版和主题版本分别发布，验收时记录两者版本。

## 5. 图片与 ZIP 限制

- ZIP 压缩文件不超过 10 MiB；最多 100 个条目（包含目录）；解压累计不超过 20 MiB。
- manifest 不超过 64 KiB；每张图片不超过 2 MiB。
- 图片仅允许 `.png`、`.jpg`、`.jpeg`、`.webp`，扩展名使用小写，服务端检查文件头与扩展名。
- assets 路径只允许英文字母、数字、`_`、`-`、`/` 和图片扩展名；例如 `assets/home/background.webp`。
- 拒绝路径穿越、绝对路径、符号链接、加密条目、重复路径以及不在白名单内的文件。
- 品牌引用的图片必须存在。不要在包里放客户隐私、凭据或未使用的资源；图片通过公开 URL 提供。
- 主题只包含静态数据，不上传业务密钥、数据库信息或授权文件。

## 6. 打包与本地协作

仓库提供 PowerShell 打包工具，只打包主题源目录中的 manifest 和 assets：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/pack-mobile-theme.ps1 -Source examples/mobile-theme -Output .tmp/demo-theme.zip
```

在独立主题仓库可使用同名脚本：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/pack-mobile-theme.ps1 -Source customers/customer-a -Output dist/customer-a-1.0.0.zip
```

脚本校验结构与 JSON 可解析性；服务端上传校验是最终准入标准。主题目录只放交付文件，设计源稿放到其他目录。脚本不会覆盖已存在的输出 ZIP。

建议主题仓库结构：

```text
Joinyuu-Mobile-Theme/
  docs/wiki-mobile-theme.md
  docs/mobile-theme.schema.json
  customers/example/manifest.json
  scripts/pack-mobile-theme.ps1
  dist/                         # 不提交版本库
```

主题修改通过短期分支审核；客户主题发布用如 `customer-a/v1.2.0` 的标签记录，并保存 ZIP 的 SHA-256。公共核心更新不需要合并整个客户仓库；兼容主题协议即可继续使用原包。

## 7. 管理员操作

1. 部署公版前后端，执行 `pnpm db:migrate`；保留数据库和上传存储的持久化。
2. 使用具备「系统配置」权限和系统管理数据范围的账号登录。主题写操作遵守系统许可证只读限制。
3. 在「系统管理 → 移动端主题」上传 ZIP；上传成功只加入列表，不自动启用。
4. 填写真实移动端访问地址（开发默认 7759；生产若移动端独立域名或子路径，需手动填写）。移动端与此后台必须连接同一后端实例。
5. 点击「预览」，再打开生成链接；链接有效 15 分钟。链接只授予主题预览，不授予管理员或业务数据权限。不要转发。
6. 预览窗口顶部会提示预览状态；令牌会从地址栏移除，并在当前标签页会话内保留，切换路由和刷新后仍可预览；过期会提示错误，可退出预览或重新生成链接。
7. 验收后点击「启用」。普通用户重新加载页面会获取新主题；页面切回前台时也会检查，检查间隔至少 60 秒。无实时广播，后台切换不会立即重绘所有已打开的客户端。
8. 「恢复公版」取消当前主题；「回退上一主题」交换当前和上一主题，上一主题也可以是公版。

正常用户不会下载其他主题包；只取得当前主题配置及页面引用的资源。预览不修改全局配置。主题请求失败时，首次访问使用公版，已有页面保留最近一次成功加载的主题，后续刷新或回到前台可重试。

## 8. 存储、缓存与接口

- `MobileThemePackage` 保存校验后的 manifest、资源映射、SHA-256 和上传信息。
- `MobileThemeState` 单例保存当前和上一主题；版本号并发保护防止管理员同时操作覆盖回退状态。
- `MobileThemePreview` 保存预览令牌的 SHA-256 和过期时间，不保存令牌原文；生成新预览时清理已过期记录。
- 资源使用既有 StorageService，支持本地上传目录或 MinIO。主题资源 URL 含不可复用的包 UUID，使用 immutable 缓存；配置响应 no-store。
- 当前无主题包删除功能，历史包和资源保留以支持回退。备份同时覆盖数据库和上传存储；更换存储驱动前须迁移资源，不能只移动数据库。
- 已加载主题的 manifest 存在数据库中，不写入客户端源码；上传目录已由 `uploads/` 忽略。额外排除根目录/API/客户端 public 下的运行时 `mobile-themes/` 和 `mobile-theme.local*.json` 本地导出文件。协议、示例及组件源码仍正常跟踪，客户主题源码在独立主题目录维护。
- 主题属于部署配置，常规业务种子数据不应清除它。

| 接口 | 权限 / 作用 |
|---|---|
| GET /api/admin/system/mobile-themes | 系统配置权限，查看当前、上一主题和已上传列表 |
| POST /api/admin/system/mobile-themes/upload | multipart 字段 file，上传 ZIP |
| POST /api/admin/system/mobile-themes/:id/preview | 创建临时预览令牌 |
| POST /api/admin/system/mobile-themes/:id/activate | 启用指定主题 |
| POST /api/admin/system/mobile-themes/reset | 恢复公版 |
| POST /api/admin/system/mobile-themes/rollback | 回退上一主题 |
| GET /api/app/mobile-theme | 公开，只返回当前主题；公版返回 null |
| GET /api/app/mobile-theme?preview=TOKEN | 公开，通过有效临时令牌读取待预览主题 |
| GET /api/public/mobile-themes/:packageId/assets/... | 公开，读取已验证图片 |

JSON 接口沿用 `{ code: 0, data }` 包络。上传、启用、回退、恢复公版均记录审计。预览 URL 参数为 `themePreview`，不是后台 Bearer token。

## 9. 交付验收

至少检查：320px 与常用手机宽度、浅色与深色、登录页、首页、二级业务页面、文字对比度、键盘访问、Logo 加载、首页模块顺序、已有功能开关、新主题启用、恢复公版和回退。主题中不得通过隐藏入口替代后端权限控制。

修改协议时同步主项目和主题仓库的本 Wiki、JSON Schema 和示例。主项目 `docs/wiki-mobile-theme.md` 为协议事实来源；独立主题目录中的副本用于客户主题开发。
