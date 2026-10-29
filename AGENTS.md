# 聚屿社区多仓工作区

当前目录是协作仓库。四个业务目录分别拥有自己的 `.git`，不属于本仓提交内容。

## 仓库地图与必读资料

| 业务 | 路径 | 必读文档 | 检查 |
| --- | --- | --- | --- |
| 后端 API | apps/api | 本仓 AGENTS.md、README.md；根仓 docs/backend/development.md、app-api.md | typecheck、lint、test:unit、build；涉及接口时跑隔离 e2e |
| 管理后台 | apps/admin | 本仓 AGENTS.md、README.md；根仓 docs/admin/development.md | typecheck、lint、test:ui、build |
| 移动 Web | apps/client-mobile | 本仓 AGENTS.md、README.md；根仓 docs/mobile/development.md | typecheck、lint、test、build |
| 微信小程序 | apps/wxminiprogram | 本仓 AGENTS.md、README.md | npm test、微信开发者工具构建与验证 |

## 组件库与 TDesign MCP

三端 UI 必须使用各自指定的 TDesign 产品；三套包的 API、标签与样式隔离机制不同，禁止互换组件包或照搬另一端的示例代码。

| 端 | 组件库 | 包名 | MCP `framework` | 官方指南 |
| --- | --- | --- | --- | --- |
| 管理后台 | TDesign Vue Next for Web | `tdesign-vue-next` | `vue-next` | [官方指南](https://tdesign.tencent.com/vue-next/overview) |
| 移动 Web | TDesign Vue Next for Mobile | `tdesign-mobile-vue` | `mobile-vue` | [官方指南](https://tdesign.tencent.com/mobile-vue/overview) |
| 微信小程序 | TDesign WeChat MiniProgram | `tdesign-miniprogram` | `miniprogram` | [官方指南](https://tdesign.tencent.com/miniprogram/overview) |

- 新增或修改界面前必须通过 TDesign MCP（`tdesign-mcp-server`）查询当前版本的组件与用法，禁止猜测组件名、props、事件、插槽、DOM 结构、CSS 变量和图标名，也不得以其他端或其他版本的记忆代替查询。
- 查询顺序：`get-component-list` 选型 → `get-component-docs` 查 API 与示例（支持批量 `names`）→ 需要改样式或结构时查 `get-component-dom` → 升级组件库时查 `get-component-changelog` → 图标名用 `search-icon`；`framework` 按上表传值。
- 会话未加载 TDesign MCP 工具时，先排查并修复 `tdesign-mcp-server` 连接再继续；确实不可用才查官方文档并在改动说明中注明依据，不得凭空生成属性。代码评审同样以 MCP 或官方文档结果为准。

## 工作规则

- 从此处启动任务后，主动读取涉及子仓的 AGENTS.md；不要假定它们已经自动载入。
- 开始修改前运行 `node scripts/workspace.mjs status`，保留已有修改；按影响范围跨仓检查。
- Git 使用 `git -C apps/api ...` 等显式路径。根仓提交只含协作资料，每个业务仓分别提交和发布。
- 子仓被父仓 .gitignore 忽略。搜索时进入子仓执行 rg，或用子仓 git grep；不要将默认父仓搜索结果当成全部代码。
- API schema、迁移与接口实现由 API 仓维护，接口文档集中在根仓 docs/backend。消费者通过 HTTP 使用接口，禁止跨仓导入源码和依赖父目录 node_modules。
- 各仓使用自己的锁文件和工具链，禁止重新引入跨仓 pnpm workspace。Node 24；三端 pnpm 12.3.4，小程序 npm。
- 父目录保留 `.agents/skills` 本地技能。各业务仓可独立打开，其必要规则必须在本仓说明清楚。
- 各仓独立版本，更新日志集中于 docs/releases，产品组合见 releases/。跨仓同一需求分别提交并关联记录，不强制版本同号。
- 客户端以移动 Web（apps/client-mobile）为基线，微信小程序由其移植而来。改动任一端时必须同步另一端（改小程序要同步移动 Web，反向亦然），仅小程序特有功能（如微信一键登录）例外；两端改动分别提交并关联记录。
- Local 模式适合父目录跨仓协作。根仓 worktree 不包含被忽略的业务仓；需要隔离开发时从对应业务仓创建 worktree。
- 不重置日常开发库或生产库。测试使用隔离数据库、Redis DB > 0 和独立上传/密钥目录；不提交配置、密钥和运行数据。
- 小程序 Git 已重新初始化且不关联模板仓库；远程现状用 workspace:status 核对，设置远程须确认目标是自己的仓库。

- 所有正式项目文档统一维护在根仓 docs，按类别组织；子仓仅保留 README、AGENTS、许可证。文档修改后运行 node scripts/check-docs.mjs；接口/模型变化后运行 node scripts/generate-reference.mjs。
