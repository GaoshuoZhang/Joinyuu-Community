# 移动端主题开发规范（协议 v1）

本文是 Joinyuu Community 移动端主题包的开发、交付和升级契约。主题源文件可在独立私有仓库 `Joinyuu-Mobile-Theme` 中按客户维护；客户服务器只需部署公版程序、执行数据库迁移，再从「系统管理 → 移动端主题」上传该客户 ZIP，无需重新编译客户端。

## 1. 能力与边界

- 可定制：浅色/深色品牌配色、页面与卡片背景、主要/次要文字色、圆角、品牌名称与标语、登录页 Logo、品牌首页背景、首页模块顺序。
- 内置模板：`default` 保持公版首页；`brand` 在首页搜索框上方增加品牌展示区。两者均复用同一套业务组件和接口。
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
    "logo": "assets/logo.png",
    "homeBackground": "assets/home-background.webp"
  },
  "tokens": {
    "light": {
      "primary": "#0052d9",
      "background": "#f3f5f8",
      "surface": "#ffffff",
      "text": "#181818",
      "secondaryText": "#555555"
    },
    "dark": {
      "primary": "#6b9eff",
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
| brand.logo / homeBackground | 可选，引用 ZIP 内 `assets/` 下图片；Logo 用于登录页和品牌首页；背景仅用于品牌首页 |
| tokens.light / dark | 可选，各颜色必须是 `#RRGGBB`，未填写的字段保留公版变量 |
| tokens.radius | 可选，`small` / `medium` / `large`，分别映射 4 / 8 / 16px 的主要卡片圆角 |
| layout.template | 可选，`default` / `brand`，缺省 `default` |
| layout.homeModules | 可选，已知模块的不重复数组，定义优先排列顺序，不用于禁用功能 |

未知字段会拒绝上传，避免拼写错误造成静默不生效。浅色和深色独立配置；未指定 dark 时，主题 light 配色也用于深色模式，因此建议每个主题提供完整的 light 和 dark 配色。

主色会生成 TDesign 品牌色阶及按压、焦点、禁用等变量，深色模式使用深色的低阶底色。主按钮会按主色亮度选择黑字或白字，品牌渐变会压暗以适配反色文字。业务状态色、字号体系、权限和路由不由主题改变。主色与按钮文字、正文与卡片背景均应检查对比度，不能只验证首页效果。

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
