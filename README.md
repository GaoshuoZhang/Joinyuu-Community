# 聚屿社区 · 多仓协作工作区

统一入口：`D:\Projects\Joinyuu-Community`。根仓管理文档、协作脚本和发布组合；四个业务仓在 apps 下独立维护 Git 与依赖。

| 仓库 | 目录 | 本地入口 |
| --- | --- | --- |
| 后端 API | apps/api | http://localhost:7757/api/health |
| 管理后台 | apps/admin | http://localhost:7758 |
| 移动 Web | apps/client-mobile | http://localhost:7759 |
| 微信小程序 | apps/wxminiprogram | 微信开发者工具导入该目录 |

Node 24、pnpm 12.3.4；小程序使用 npm。远程配置见 [repositories.json](repositories.json)。

```sh
pnpm workspace:init
pnpm install:all
pnpm workspace:status
# 先配置 apps/api/.env 与本地数据库，再启动
pnpm dev:all
```

从此父目录添加 agent 项目即可跨仓协作，规则见 [AGENTS.md](AGENTS.md)。根仓 push 不包含子仓改动，各仓分别提交和推送。

- [完整文档目录](docs/README.md)
- [开发、验证与 Git 协作](docs/workspace/development.md)
- [部署](docs/operations/deployment.md) / [升级与回滚](docs/operations/upgrade.md)
- [版本与发布](docs/workspace/versioning.md)

根目录 releases/*.json 是历史发布组合；当前版本与实际提交应分别读取各仓。运行配置、数据库、上传文件、密钥和客户主题须独立保存，不作为仓库内容提交。
