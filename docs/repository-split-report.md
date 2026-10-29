# 多仓迁移记录

日期：2026-10-29。原根仓基线：`71e2b14`；小程序原基线：`7b93e69`。

## 已完成的结构变更

父目录作为协作仓；四端在原 apps/ 路径分别拥有独立 Git、锁文件、检查配置、README 和 AGENTS.md。根 pnpm workspace 已移除，子仓的 pnpm-workspace.yaml 只保留本仓安装设置，不包含兄弟仓。

| 仓库 | 本地路径 | 独立迁移提交 | 历史提交数 |
| --- | --- | --- | --- |
| api | `apps/api` | `6916ed2cb275aa6feef8a42fbf4993e75ef2e337` | 58 |
| admin | `apps/admin` | `5b70b2c73d675e83f2cde450529bf1aacf1a48a5` | 55 |
| client-mobile | `apps/client-mobile` | `a4b55e4d3c196a62cc373a24c99209f16d2b42a2` | 56 |
| wxminiprogram | `apps/wxminiprogram` | `f79d7d10afb37cd598475d69c606c471fffeafad` | 48 |

API、后台、移动 Web 保留经过目录过滤的 main 历史，并把拆分前的在途修改保存为单独基线提交。小程序保留原有历史和 LICENSE，将模板来源保留为 upstream。四个业务仓未设置自己的 origin，也未推送远程；根仓原 origin 保留。

已内置两个 Web 端的 favicon 工具；后台测试改用本仓消息渠道契约快照；API 主题测试改用入库的合成 fixture；小程序图标生成器改为解析本仓依赖。移动 Web 补充原来由后台提供的 vue-tsc，使用已有的 3.3.11 解析版本。

保留已有业务依赖版本，按依赖图裁剪锁文件；新增本仓所需工程依赖。小程序锁文件的一处腾讯镜像 URL 改为标准 npm 源，保留版本和 integrity。原模板风格检查保留为 lint:legacy，默认 lint/test 采用语法、JSON、路由和相对引用检查。

Node 验证版本：24.20.0；pnpm：12.3.4；npm：11.19.0。各仓保留当前软件版本，本次迁移未创建发布 tag。

## 验证

独立安装和测试在父目录之外的 staging/ 进行，重建了各仓 node_modules；API 安装与构建不需要父目录 .env 或 node_modules。

| 验证 | 结果 |
| --- | --- |
| API Prisma generate / typecheck / lint / build | 通过 |
| API 单元测试 | 29 套件，202 用例通过 |
| API 隔离数据库 e2e | 49 套件，406 用例通过 |
| API 新命令启动器与主题 fixture 回归 | 7 用例通过 |
| 后台 typecheck / lint / build | 通过 |
| 后台 UI 测试 | 35 用例通过 |
| 移动 Web typecheck / lint / build | 通过，排版检查无新增违规 |
| 移动 Web 测试 | 46 文件，133 用例通过 |
| 小程序 npm ci / 静态结构检查 | 通过，76 个注册页面 |
| 小程序图标工具 | 本仓依赖生成 51 个图标，无跨仓读取 |
| 工作区初始化和发布记录工具 | 2 项测试通过：非空目录与越界保护、离线恢复、身份检查、保留在途修改、发布清单拒绝脏工作树和覆盖 |

数据库验证使用新建的 `joinyuu_split_20261029_test` 和 Redis DB 13，上传与测试支付密钥位于临时测试目录；原数据库、Redis DB 0 和 Compose 的 api_* 数据卷未重置。真实微信支付、微信登录供应商调用、短信和生产发布不属于本次迁移验证。

原路径安装、构建与运行冒烟均已完成，详见下方最终核对。

## 备份与恢复

本地迁移目录：`D:\Projects\Joinyuu-Community-migration-20261029`。

- backup/：原始文件、两套 .git、本地配置与运行数据；2,281 个非 Git 工作文件已按 SHA-256 核对。可再生成的依赖、dist、临时日志和 miniprogram_npm 未纳入首次复制。
- root-history.bundle、wx-history.bundle：迁移前的两套完整 Git 引用历史。
- root-working-tree.patch：根仓迁移前的已跟踪修改；新增文件与被忽略配置由 backup/ 保存，不能只靠此 patch 恢复。
- bundles/：四个独立业务仓库的 Git 离线包。初始化命令：`node scripts/workspace.mjs init --bundles <迁移目录>/bundles`。
- retired/：切换时归档的旧依赖、旧构建和根 monorepo 配置，供本地回退核对。

备份可能含环境配置、私钥和运行数据，应保存在本机受控目录，不提交到远程。对外部署使用各仓代码和独立部署配置。

迁移核对时发现一个与拆仓无关的外部变动：原工作区 wxpay-docs/代码质量检测报告.md 已被删除。本次不恢复也不提交该删除；备份保留了原文件。

## 后续远程配置

创建自己的四个空远程仓库，分别设置各子仓 origin，并把地址同步到 repositories.json。之后按各仓 main 分支推送；小程序 Git 已重新初始化，不再关联模板仓库。

日常从父目录运行 pnpm workspace:status / install:all / dev:all；每个子仓分别提交与发布。固定组合见 releases/，Git UI 与 worktree 的边界见 AGENTS.md。

## 原路径切换后的最终核对

- 根仓已停止跟踪 apps/ 和旧共享包；没有将子仓登记为 submodule。四仓 main 工作树干净，Git 对象完整性检查通过。
- `pnpm install:all` 在原路径重新安装成功；`pnpm build` 在原路径构建三个 Node 应用成功。根锁文件仅锁定 pnpm 工具本身，不提供应用依赖。
- `pnpm workspace:init` 对既有四仓身份核对成功，不覆盖仓库；工作区工具的 2 个测试在实际根目录通过。
- API 的 db:up/db:down 与隔离测试脚本显式固定 Compose 项目名 api，避免独立克隆目录名称改变数据卷归属；只读配置检查通过。
- 四个 Git 离线包均已导出并通过实际克隆、仓库身份和干净状态检查；API 最后补充的 Compose 项目标识提交已更新到备份包。
- HTTP 冒烟 9 项通过：API health/config、两个 Web 页面与 JS 资源、两端 API 代理、移动 Web history 深链接兜底；使用隔离测试数据库和 17757/17758/17759 端口，验证完成后临时服务已停止。
- 微信开发者工具 npm 构建成功（warnings 为空）；首页 WXML 编译成功（codeLength=32400），运行时当前页为 pages/home/index；console 的 error 过滤无命中。这不代表真机支付、微信供应商调用或完整业务联调已经完成。
- 核对 190 个原有环境/运行数据文件的 SHA-256 与迁移前一致。小程序私有配置未被迁移脚本覆盖，开发者工具仍打开原目录。
- 已生成 `releases/split-baseline-20261029.json`，记录四仓固定 commit、接口契约、验证范围和携带的在途迁移。它是本地迁移基线，尚未部署或推送。

验证日志、SHA-256 清单、源历史映射与离线恢复资料保存在本地迁移目录，未纳入代码仓库。

## 小程序 Git 重新初始化（2026-10-29）

按用户要求，小程序当前工作目录已重新初始化 Git，移除全部模板历史、旧分支和 upstream。当前 main 只有一个初始提交：a5ee2e86e9edd6fc064cc6bc3b5bad6b665b7793。代码、资源和本地配置未改动；423 个非文档文件的 SHA-256 核对一致，第三方 LICENSE 保留。README、AGENTS 与 CHANGELOG 已同步当前 Git 状态。

旧 Git 元数据归档在 D:\Projects\Joinyuu-Community-migration-20261029\wx-git-before-reset-20261029；重置前离线包另存为 wxminiprogram-before-git-reset.bundle。默认 bundles/wxminiprogram.bundle 已替换为仅含当前项目初始提交的新包，后续初始化不会恢复模板历史。

本记录前面的提交表和 split-baseline-20261029.json 描述首次拆仓时的历史状态；当前工作区以 releases/mini-git-reset-20261029.json 为准。其它三个业务仓库未改动，业务远程仍未配置或推送。

重置后 npm test 通过（130 个 JS、92 个 JSON、76 个页面）。从更新后的离线包重新克隆验证通过：全部引用可达历史只有 1 个提交，与当前工作区初始提交一致。
