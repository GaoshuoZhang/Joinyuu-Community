# 聚屿社区 · 多仓协作工作区

四个业务仓库共用一个本地入口：`D:\Projects\Joinyuu-Community`。将这个父目录添加到 agent 项目即可开展本地跨仓协作，具体规则见 [AGENTS.md](AGENTS.md)。

| 仓库 | 目录 | 本地入口 |
| --- | --- | --- |
| 后端 API | [apps/api](apps/api) | http://localhost:7757/api/health |
| 管理后台 | [apps/admin](apps/admin) | http://localhost:7758 |
| 移动 Web | [apps/client-mobile](apps/client-mobile) | http://localhost:7759 |
| 微信小程序 | [apps/wxminiprogram](apps/wxminiprogram) | 微信开发者工具打开该目录 |

本仓只维护协作资料、脚本与产品发布组合；四端代码各有自己的 Git 历史、依赖和发布流程。路径与远程设置见 [repositories.json](repositories.json)。

## 安装与启动

环境：Node 24、pnpm 12.3.4、npm；后端需要 Docker 或可用的 PostgreSQL、Redis。

```sh
pnpm workspace:status
pnpm install:all
pnpm db:up
pnpm dev:api
pnpm dev:admin
pnpm dev:client-mobile
# 或在一个终端中托管三个开发进程
pnpm dev:all
```

API 配置见 `apps/api/.env.example`。小程序依赖安装后在微信开发者工具中构建 npm，再编译；真机与正式版接口域名按实际部署设置。原有三个 Windows 启动脚本继续可用。

根目录 `pnpm install` 只处理协作包，不安装业务仓依赖；应使用 `pnpm install:all`。各端也可单独克隆后在本仓安装、检查与构建。

## 验证与提交

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e:it  # 先准备 apps/api/.env.it，仅操作隔离测试库
git -C apps/api status
git -C apps/admin status
```

类型检查与 Web/API 构建覆盖三个 Node 应用；小程序使用 `npm test` 静态结构检查和开发者工具编译。每仓独立提交，根仓 Git 状态不会显示业务仓内部的改动。

### 提交和推送协作仓

根仓继续使用 `https://github.com/GaoshuoZhang/Joinyuu-Community.git`，维护 README、AGENTS、docs、scripts、releases、repositories.json、根包配置与启动脚本。四个 `apps/` 子仓已被忽略，无需添加 submodule 或恢复 pnpm workspace。

在根目录执行，按本次实际修改选择文件暂存：

```powershell
Set-Location D:\Projects\Joinyuu-Community
git status --short
git add -- .gitignore README.md repositories.json
git diff --cached
git commit -m "chore: update workspace collaboration configuration"
git push -u origin main
```

之后日常提交仍是 `git add`、`git commit`、`git push`。推送根仓会包含尚未推送的拆仓提交，使远程最新目录变为协作仓；原有历史仍保留，无需强制推送。不要使用 `git add -f apps/`。根仓推送不会上传任何子仓提交。

业务代码在对应子仓提交和推送，例如 API（将 `<实际修改的文件>` 替换为子仓内的文件路径）：

```sh
git -C apps/api status
git -C apps/api add -- <实际修改的文件>
git -C apps/api diff --cached
git -C apps/api commit -m "feat: describe the API change"
git -C apps/api push -u origin main
```

其他端替换 `apps/api` 为其目录。跨仓发布时先提交、推送涉及的子仓，再运行 `pnpm release:record <发布标识>`，将生成的 `releases/` 文件提交并推送到根仓，保证发布记录引用的提交可从远程获取。只改协作文档或忽略规则时，运行 `pnpm test:workspace` 即可验证协作脚本；业务改动按对应子仓规则检查。

## 在新电脑恢复工作区

先克隆本协作仓，进入根目录执行 `pnpm workspace:init`、`pnpm install:all`。repositories.json 已记录四仓远程地址，初始化会分别克隆业务仓；需要相应远程的访问权限，且子仓代码必须已推送。初始化会检查已有仓库身份并保留现有修改，遇到非空未知目录会停止。

也可通过迁移时的离线备份包恢复当时的基线（不包含之后的新提交）：

```sh
node scripts/workspace.mjs init --bundles D:\Projects\Joinyuu-Community-migration-20261029\bundles
```

显式指定 `--bundles` 时优先使用离线包，即使 repositories.json 已配置远程地址也不会联网克隆。恢复的仓库不保留指向本地包的 origin；需要推送时，在对应子仓设置自己的 origin，并与 repositories.json 保持一致。小程序 Git 已重新初始化，不关联模板仓库。

## 发布与资料

- 当前 Git 基线见 [mini-git-reset-20261029](releases/mini-git-reset-20261029.json)，小程序历史已重新初始化。
- [仓库拆分计划](docs/repository-split-plan.md)、[迁移记录](docs/repository-split-report.md)。
- [版本规则](docs/versioning.md)、[整体部署](docs/deploy-1panel.md)、[升级说明](docs/backend-upgrade.md)。
- 各端开发 Wiki、接口契约与服务端模型已迁至对应业务仓 `docs/`；原索引保留迁移指引。
- `pnpm release:record <发布标识>` 记录各仓版本和固定 commit，要求子仓工作树干净；生成后补充验证、数据库迁移、部署顺序和回滚说明。
- 根仓 PR/worktree 面向协作仓本身。需要单仓 PR 或 worktree 时，针对具体业务仓操作。
