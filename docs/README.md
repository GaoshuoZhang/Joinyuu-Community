# 聚屿社区文档

本目录是五仓项目说明、开发规范、运维和版本记录的统一入口。各业务仓只保留 README、AGENTS 与第三方许可证；运行所需配置、测试 fixture 和生成数据仍随代码维护。

| 分类 | 阅读入口 |
| --- | --- |
| 工作区 | [开发与仓库协作](workspace/development.md)、[版本与发布](workspace/versioning.md)、[浏览器联调](workspace/browser-testing.md) |
| 后端 | [开发规范](backend/development.md)、[客户端 API 约定](backend/app-api.md)、[HTTP 路由索引](backend/routes.md)、[数据模型](backend/entity-fields.md) |
| 管理后台 | [开发规范](admin/development.md) |
| 移动 Web | [开发规范](mobile/development.md) |
| 微信小程序 | [开发规范](miniprogram/development.md)、[运行与验证](miniprogram/runtime.md) |
| 功能规范 | [交易与支付](features/commerce.md)、[客户主题](features/mobile-theme.md)、[主题 Schema](features/mobile-theme.schema.json)、[许可证](features/license.md) |
| 运维 | [部署](operations/deployment.md)、[升级与回滚](operations/upgrade.md) |
| 版本记录 | [API](releases/api.md)、[后台](releases/admin.md)、[移动 Web](releases/client-mobile.md)、[小程序](releases/wxminiprogram.md) |
| 文档维护 | [本次核对与清理记录](workspace/documentation-audit.md) |

业务源码与接口修改由对应仓负责，同时更新这里的规范。文档中的路径默认相对工作区；代码块另有工作目录说明时按该说明执行。版本日志和 releases 清单是历史记录，不等同于当前能力或生产验收。

修改后从根目录执行 `node scripts/check-docs.mjs`。后端路由或数据模型变化后执行 `node scripts/generate-reference.mjs`，再执行 `node scripts/generate-reference.mjs --check`；生成命令需要先安装 API 仓依赖。
