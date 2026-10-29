# 聚屿社区多仓工作区

当前目录是协作仓库。四个业务目录分别拥有自己的 `.git`，不属于本仓提交内容。

## 仓库地图与必读资料

| 业务 | 路径 | 必读文档 | 检查 |
| --- | --- | --- | --- |
| 后端 API | apps/api | 本仓 AGENTS.md、README.md、docs/wiki-backend.md、docs/api-app-design.md | typecheck、lint、test:unit、build；涉及接口时跑隔离 e2e |
| 管理后台 | apps/admin | 本仓 AGENTS.md、README.md、docs/wiki-admin-web.md | typecheck、lint、test:ui、build |
| 移动 Web | apps/client-mobile | 本仓 AGENTS.md、README.md、docs/wiki-client-mobile.md | typecheck、lint、test、build |
| 微信小程序 | apps/wxminiprogram | 本仓 AGENTS.md、README.md | npm test、微信开发者工具构建与验证 |

## 工作规则

- 从此处启动任务后，主动读取涉及子仓的 AGENTS.md；不要假定它们已经自动载入。
- 开始修改前运行 `node scripts/workspace.mjs status`，保留已有修改；按影响范围跨仓检查。
- Git 使用 `git -C apps/api ...` 等显式路径。根仓提交只含协作资料，每个业务仓分别提交和发布。
- 子仓被父仓 .gitignore 忽略。搜索时进入子仓执行 rg，或用子仓 git grep；不要将默认父仓搜索结果当成全部代码。
- API schema、迁移与接口契约由 API 仓维护。消费者通过 HTTP 使用接口，禁止跨仓导入源码和依赖父目录 node_modules。
- 各仓使用自己的锁文件和工具链，禁止重新引入跨仓 pnpm workspace。Node 24；三端 pnpm 12.3.4，小程序 npm。
- 父目录保留 `.agents/skills` 本地技能。各业务仓可独立打开，其必要规则必须在本仓说明清楚。
- 各仓独立版本与 CHANGELOG，产品组合见 releases/。跨仓同一需求分别提交并关联记录，不强制版本同号。
- Local 模式适合父目录跨仓协作。根仓 worktree 不包含被忽略的业务仓；需要隔离开发时从对应业务仓创建 worktree。
- 不重置日常开发库或生产库。测试使用隔离数据库、Redis DB > 0 和独立上传/密钥目录；不提交配置、密钥和运行数据。
- 小程序 Git 已重新初始化且不关联模板仓库；远程现状用 workspace:status 核对，设置远程须确认目标是自己的仓库。
