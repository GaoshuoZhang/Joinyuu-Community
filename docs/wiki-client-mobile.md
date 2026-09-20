# 聚屿社区 · 移动端开发 Wiki

> `apps/client-mobile` 是纯移动端应用，dev 端口 7759；桌面端 `apps/client-web` 尚未创建。
> 关联文档：[后端契约](./wiki-backend.md)、[App API 契约](./api-app-design.md)、[当前进度](./full-spec-check.md)、[实体字段](./entity-fields.md)。

## 1. 服务边界

- workspace 包名为 `@joinyuu/client-mobile`，禁止导入 admin 或 api 源码。
- 技术栈：Vue 3、Vite 6、Pinia 3、Vue Router 4 history 模式、TypeScript、TDesign Mobile Vue。
- `src/types/` 独立声明客户端类型，字段与 API 契约保持一致。
- 根命令：`pnpm dev:client-mobile`、`pnpm build:client-mobile`。

## 2. API 双模式

- `src/api/*.ts` 是视图唯一数据入口；页面不得直接读写 Mock 业务数据。
- 默认模式为 HTTP，统一请求 `/api/app/**`；仅显式 `VITE_API_MODE=mock` 时分流到 `src/mock/handlers/*`。
- HTTP 和 Mock 保持相同返回形状：成功 `{ code: 0, data }`、错误 `{ code, message }`、分页 `{ list, total }`。
- HTTP 模式不读取、写入或重置 Mock 快照；Mock 状态保存在 `joinyuu_client_mock_v33`。
- `[MOCK-ONLY]` 只标记 `src/mock/` 和 DevTools 专用能力，正式业务必须有 HTTP 分支。
- Mock 模式使用 DevTools 可控业务时钟；HTTP 模式必须使用设备当前时间，不得复用固定演示时间。
- 401 由公共请求层清除会话并跳转登录；下载与上传分别走统一鉴权下载和 multipart 封装。

## 3. 应用架构

- 路由集中在 `src/router/index.ts`，全部页面位于 `src/views/mobile/`。
- `AppShell.vue` 提供首页、项目、社区、广场、我的 5 个底部 Tab。
- 登录、注册、找回密码等访客页位于壳外。
- 业务逻辑收口到 `src/composables/` 和 `src/api/`；视图只负责展示与交互。
- `components/shared/*` 保持组件库无关；全局挂载的 DevTools 也不得引入 TDesign 桶依赖。

## 4. 鉴权与身份

- HTTP 会话由 `/api/app/auth/**` 签发 App JWT，`scope=app`，与 Admin JWT 隔离。
- `guestOnly` 阻止已登录用户进入访客页；`requiresAuth` 将游客重定向至 `/login?redirect=`。
- 一名成员可拥有个人用户、社区个体、多个社区企业和合作企业身份；写操作由服务端复核主体权限。
- 功能开关通过 `GET /api/app/config` 下发；入口隐藏与服务端写端点校验同时生效。

## 5. UI 与组件约定

- 使用 TDesign Mobile Vue；禁止引入其他 UI 库或桌面端组件库。
- 状态统一使用 `StateTag`，身份统一使用 `IdentityTag`；禁止页面自行定义状态文案和颜色。
- 色彩、圆角、阴影和边框使用 `--td-*`；共享布局类维护在 `styles/tokens.css`。
- 卡片使用 `.m-card`，页面根节点使用 `.page-fade-in`，列表容器使用 `.stagger`。
- 状态 Chip 使用 `Tag`，可选/可点击 Chip 使用 `CheckTag`；图标按钮使用 `Button` 的文本方形形态；主操作使用 primary。
- 按钮、列表项等主交互目标至少 44px；Tag / CheckTag 仅使用 TDesign 提供的 `small`、`medium`、`large` 尺寸。表单必须有可见标签、行内错误与离开保护。
- 弹层必须管理焦点、Tab 圈闭与关闭回焦；Toast、错误和加载态提供可访问性播报。
- 调整纯视觉时不得顺带修改 API、路由、props/emits 或状态机。

## 6. 主要页面

- 首页：轮播、公告、快捷入口、最新需求/活动/文章和激活清单。
- 项目：需求筛选、发布、详情、响应、发布者选定承接方。
- 社区：政策、人才库、企业库、公开名片。
- 广场：活动与文章。
- 我的：资料、身份、名片、积分/经验、申请、项目、订单、预约、投稿、需求、响应、报名、通知和安全治理。
- 二级闭环：项目里程碑交付验收、活动签到（含电子票）/反馈、商城履约、动态申请表单、企业成员与邀请。

当前静态规模为 62 个视图、21 个域 API 文件；精确路由以 `src/router/index.ts` 为准。

## 7. 验证

移动端改动至少执行：

```bash
pnpm --filter @joinyuu/client-mobile exec tsc -p tsconfig.json --noEmit
pnpm --filter @joinyuu/client-mobile run lint
pnpm --filter @joinyuu/client-mobile test
pnpm build:client-mobile
```

运行时问题再使用浏览器检查；HTTP 业务状态机以 API e2e 为主。最新验证证据和覆盖边界见 [M2-R 收口](./m2-r-closeout.md)。
