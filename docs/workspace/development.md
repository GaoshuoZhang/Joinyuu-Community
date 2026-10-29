# 开发与仓库协作

工作区为 `D:\Projects\Joinyuu-Community`，根仓是协作仓；`apps/api`、`apps/admin`、`apps/client-mobile`、`apps/wxminiprogram` 各有独立 Git。它们不是 submodule，根仓忽略子仓代码。远程地址与默认分支由根目录 `repositories.json` 记录。

## 环境与初始化

Node 24；API、后台、移动 Web 使用 pnpm 12.3.4，小程序使用 npm。各仓拥有独立锁文件；子仓 pnpm-workspace.yaml 是安装设置，不是跨仓依赖声明。

```sh
# 根目录
pnpm workspace:init
pnpm install:all
pnpm workspace:status
```

初始化只克隆缺失仓库；已有仓库核对身份标记后保留，非空未知目录拒绝覆盖。离线恢复使用 `node scripts/workspace.mjs init --bundles <目录>`，显式参数优先于远程配置，恢复后需自行设置 origin。离线包只包含制作时的 Git 提交，不含本地配置与运行数据。

## 启动与验证

API 从 `apps/api/.env.example` 准备本地 .env，使用开发数据库与 Redis。根目录 `pnpm db:up` 使用固定 Compose 项目名 api；勿删除既有数据卷。

| 根目录命令 | 用途 |
| --- | --- |
| pnpm dev:api / dev:admin / dev:client-mobile | 分别启动 7757 / 7758 / 7759 服务 |
| pnpm dev:all | 托管三个开发进程 |
| pnpm check | 三端类型、lint、测试、构建；小程序静态检查 |
| pnpm test:workspace | 协作脚本测试 |
| pnpm test:e2e:it | 隔离数据库后端测试 |

小程序由微信开发者工具导入其仓库目录，安装 npm 依赖后构建 npm、编译。根目录安装不替代各业务仓安装。各仓也可单独克隆和运行；文档通过协作仓获取，不作为构建依赖。

## 提交与推送

根仓只提交 docs、协作脚本、配置与发布组合。各仓分别检查、暂存实际修改文件、提交和推送，不要强制把 apps 加进根仓。

```sh
git status
git add -- docs README.md AGENTS.md
git diff --cached
git commit -m "docs: update project documentation"
git push
git -C apps/api status
# 对 API 的实际修改文件执行 git -C apps/api add，再 commit / push
```

根仓 worktree 不包含被忽略的子仓；需要业务隔离开发时在对应子仓创建 worktree。接口以 HTTP 契约协作，禁止跨仓导入源码或依赖父目录 node_modules。

## 文件与数据边界

保留 .env、.env.it、project.private.config.json、私钥、uploads、数据库卷、客户主题、依赖与开发者工具所需产物。dist、日志、截图、临时测试上传是可重新生成的文件，但运行服务使用中的产物不应直接删除。缓存不提交；许可证与第三方版权声明不能当作模板垃圾删除。
