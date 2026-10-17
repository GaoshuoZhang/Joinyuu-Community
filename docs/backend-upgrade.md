# 后端升级手册 · 已上线系统如何升级版本

> **本文面向以 1Panel「网站 → 运行环境 → Node.js」（容器）部署的实例**：`joinyuu-api` / `joinyuu-admin` / `joinyuu-mobile` 三个容器共享同一份挂载目录（项目目录 `/opt/joinyuu` → 容器内 `/app`）。这类实例升级的主线只有一句话——**替换项目目录里的文件，然后按顺序重启对应容器**，构建与数据库迁移都由容器启动命令自动完成。
> 若你的实例是「宿主机构建 + systemd/pm2 + Nginx 站点目录」的旧形态，请看[附录 A](#13-附录-a宿主构建--systemd--静态网站形态的旧流程)；首次部署请看[部署手册](./deploy-1panel.md)；升级不影响许可证有效期，见[许可证管理](./license-management.md)。

---

## 目录

1. [升级到底改了几样东西](#1-升级到底改了几样东西)
2. [三条铁律](#2-三条铁律)
3. [升级总览](#3-升级总览)
4. [第 0 步：升级前备份](#4-第-0-步升级前备份)
5. [第 1 步：替换项目目录文件](#5-第-1-步替换项目目录文件)
6. [第 2 步：补齐新增的环境变量](#6-第-2-步补齐新增的环境变量)
7. [第 3 步：应用数据库迁移](#7-第-3-步应用数据库迁移)
8. [第 4 步：重启容器](#8-第-4-步重启容器)
9. [第 5 步：升级验收清单](#9-第-5-步升级验收清单)
10. [回滚手册](#10-回滚手册)
11. [只升级一部分的对照表](#11-只升级一部分的对照表)
12. [升级常见问题](#12-升级常见问题)
13. [附录 A：宿主构建 + systemd / 静态网站形态的旧流程](#13-附录-a宿主构建--systemd--静态网站形态的旧流程)
14. [附录 B：升级记录模板 + 命令速查表](#14-附录-b升级记录模板--命令速查表)
15. [相关文档](#15-相关文档)

---

## 1. 升级到底改了几样东西

一次版本升级可能包含下面 6 类改动，**要做的动作取决于改动类型**：

| 改动类型 | 例子 | 需要做的动作 |
| --- | --- | --- |
| 后端代码 | 修了一个接口的 bug | 替换项目目录文件 → 重启 `joinyuu-api`（构建由容器内的 `start:api` 自动完成） |
| 数据库迁移 | 新增字段、新增表、回填数据 | **无需手工命令**：`start:api` 内已含 `prisma migrate deploy`，重启 `joinyuu-api` 即自动应用；含**破坏性迁移**（删列/改名）的版本必须先备份数据库 |
| 前端页面 | 管理后台加了一列、移动端改了样式 | **必须同时上传** `apps/admin/dist`、`apps/client-mobile/dist`（`dist` 不在 Git 里）→ 重启 `joinyuu-admin`、`joinyuu-mobile` |
| 新增环境变量 | 新增了一个开关类配置项 | 改 `/opt/joinyuu/apps/api/.env` → 重启 `joinyuu-api`（漏改会导致启动失败） |
| 依赖变化 | 升级了某个库 | **无需手工 `pnpm install`**：`joinyuu-api` 容器的「安装 node_modules」是打开的，重启时容器内会自动 `pnpm install` 并重新生成 Prisma 客户端 |
| 版本号与更新日志 | 每次发布都会改 | 无需命令；但升级前建议先读新版本的 `CHANGELOG`（`apps/*/CHANGELOG.md`）了解改动范围与破坏性变更（规则见[版本与更新日志规范](./versioning.md)） |

**保守做法**：不管这次改了什么，把第 0–5 步全做一遍（几分钟），最稳妥。
**当前版本**：`v1.5.0`（三端锁步同版本号，版本号唯一来源是各端 `package.json`）。

---

## 2. 三条铁律

### 铁律一：升级前必须先备份数据库

数据库迁移是**单向**的：`prisma migrate deploy` 只往前推，官方**没有**「一键撤销迁移」的命令。升级后想回到旧版本，只能靠升级前的备份恢复数据库。

> ⚠️ 本形态下迁移是**重启容器时自动执行**的，所以「备份」必须在点「重启」之前做完。

### 铁律二：生产环境绝对不要执行这三条命令

| 命令 | 后果（生产环境务必避免） |
| --- | --- |
| `pnpm db:seed` | 写入**整套演示数据**（演示用户、需求、活动、商城订单、审计日志、4 个演示管理员账号），会把线上库搞乱 |
| `pnpm db:reset` | **清空整个数据库**后重建，等于删库 |
| 把 `pnpm db:init` 挂进启动命令 | `db:init` 只用于**首次部署**写入基础数据；已初始化的库会被它自动拒绝并**退出码 1**。若把它写进容器启动命令，容器会反复重启失败（这是安全设计，不是 bug） |

> 升级**只需重启 `joinyuu-api`**（它的 `start:api` 已经包含了「构建 → 迁移 → 启动」）。重复运行 `prisma migrate deploy` 是安全的（它自带「已执行过的迁移不会重复执行」的记账表）。

### 铁律三：上传目录、主题包不能删，`dist` 不在 Git 里

- 上传的图片、合同、素材：`UPLOAD_DIR` 指向的目录（部署手册里建议是 `/data/joinyuu/uploads`）或默认的 `/opt/joinyuu/apps/api/uploads`
- 已安装的移动端主题包：`/opt/joinyuu/apps/api/mobile-themes`
- **`dist/` 被 `.gitignore` 忽略，不在 Git 仓库里**：只 `git checkout` 不会带来新的前端产物，前端升级必须**额外上传** `apps/admin/dist`、`apps/client-mobile/dist`

---

## 3. 升级总览

```text
① 备份数据库 + 上传目录 + 主题包 + 记录当前版本号        （第 0 步 ⚠️ 必做，且必须在重启之前）
        ↓
② 替换项目目录文件：git fetch --tags && git checkout <版本>
   前端有改动时，同时上传 apps/admin/dist、apps/client-mobile/dist   （第 1 步）
        ↓
③ 对照 .env.example，把新增的环境变量补进 .env          （第 2 步；最容易被忽略）
        ↓
④ 重启 joinyuu-api                                    （第 3、4 步）
   容器内自动：安装依赖 → 构建后端 → prisma migrate deploy → 启动
        ↓
⑤ 重启 joinyuu-admin、joinyuu-mobile（顺序不能反）      （第 4 步）
        ↓
⑥ 验收：/api/health 版本号 + 三端「关于」页 + 关键页面点一遍  （第 5 步）
```

**命令清单（按顺序；每条都标了在哪台机器上执行）**：

```bash
# ===== 宿主机（服务器 SSH 终端 / 1Panel 终端）=====
cd /opt/joinyuu
git rev-parse HEAD                                   # 升级前：记下当前版本
# 备份数据库与目录（见第 0 步，必须先做）
git fetch --tags && git checkout <新版本tag或commit>
git log -1 --format='%h %ad %s' --date=short         # 确认已切换到位

# 上传前端产物（在你自己电脑上执行，见第 1 步的 scp 模板）
# 改 /opt/joinyuu/apps/api/.env（补新增变量，见第 2 步）

# ===== 1Panel 面板 =====
# 「网站 → 运行环境 → Node.js」依次点：joinyuu-api「重启」 → 等状态「已启动」 → joinyuu-admin「重启」 → joinyuu-mobile「重启」

# ===== 宿主机（可选自检）=====
curl http://127.0.0.1:7757/api/health

# ===== 容器内（仅排错/手动操作用；见第 3 步）=====
# 1Panel「容器 → 容器」→ 点 joinyuu-api → 抽屉「终端」→ 选 /bin/bash
cd /app && pnpm --filter @joinyuu/api db:migrate
```

> 宿主机**没有装 Node**：所有 `pnpm` 命令都必须在容器内执行（这是本形态「宿主免 Node」的特点）。

---

## 4. 第 0 步：升级前备份

### 4.1 备份数据库

**方式一：1Panel 面板（最省事）**

1. 1Panel →「数据库 → PostgreSQL」→ 点 `joinyuu` →「备份」→「立即备份」。
2. 等状态变成「成功」，记下备份文件名（后面回滚要用）。

**方式二：宿主机终端命令**

```bash
mkdir -p /data/joinyuu/backup
PGPASSWORD='你的数据库密码' pg_dump -h 127.0.0.1 -U joinyuu -d joinyuu -Fc \
  -f /data/joinyuu/backup/db-before-upgrade-$(date +%F-%H%M).dump
ls -lh /data/joinyuu/backup      # 确认文件存在且大小合理（不是 0 字节）
```

> 上面命令用的是宿主机上的 `pg_dump`。若宿主机没有 `pg_dump`，直接用面板「立即备份」，效果一样。
> ⚠️ **含破坏性迁移（删列/改名）的版本，备份不可省略**——因为重启 `joinyuu-api` 的那一刻迁移就已经执行了。

### 4.2 备份上传文件与主题包（宿主机终端）

```bash
tar -czf /data/joinyuu/backup/uploads-$(date +%F).tar.gz -C /data/joinyuu uploads
tar -czf /data/joinyuu/backup/themes-$(date +%F).tar.gz  -C /opt/joinyuu/apps/api mobile-themes 2>/dev/null || true
```

> 如果 `UPLOAD_DIR` 用的是别的目录，把 `-C /data/joinyuu uploads` 换成实际路径。

### 4.3 备份前端产物（方便回滚页面）

```bash
# 本形态的产物就在项目目录里，直接连目录一起留个底
cp -r /opt/joinyuu/apps/admin/dist          /data/joinyuu/backup/admin-dist-$(date +%F)
cp -r /opt/joinyuu/apps/client-mobile/dist  /data/joinyuu/backup/mobile-dist-$(date +%F)
```

### 4.4 记录当前版本号

```bash
cd /opt/joinyuu
git rev-parse HEAD | tee -a /data/joinyuu/backup/versions.log
git log -1 --format='%h %ad %s' --date=short | tee -a /data/joinyuu/backup/versions.log
grep '"version"' package.json          # 应显示 "version": "1.5.0"
```

**要做对这件事**：版本号一定要写进[附录 B 的《升级记录模板》](#14-附录-b升级记录模板--命令速查表)——回滚时它就是「回到哪一版」的依据。

---

## 5. 第 1 步：替换项目目录文件

### 5.1 后端与源码：拉取新版本

```bash
cd /opt/joinyuu

# 1) 查看远程有哪些新版本
git fetch --tags

# 2) 切换到目标版本（把 <版本> 换成 release tag 或 commit 号）
git checkout <版本>

# 3) 确认已切换到位（显示的应是新版本）
git log -1 --format='%h %ad %s' --date=short

# 4) 确认工作区干净（升级期间不要有本地改动）
git status --short      # 正常应无输出
```

> 如果第 4 步有输出（显示你改过 `.env` 之类）：`.env` 已被 git 忽略，一般不会出现；若确实有改动，先用 `git stash` 暂存，或先单独备份该文件。

**看到什么算成功**：`git log -1` 显示的是新版本。

### 5.2 前端产物：必须额外上传 `dist`（关键）

`dist/` **不在 Git 仓库里**，所以上一步的 `git checkout` 对前端等于没换代码。前端有改动的版本，**必须**把两份产物覆盖到服务器：

```bash
# 在你自己电脑上执行（把密钥路径、端口、服务器 IP 换成你自己的）
scp -i "<密钥>" -P 2002 -o IdentitiesOnly=yes -r "本地\apps\admin\dist"          root@<服务器IP>:/opt/joinyuu/apps/admin/
scp -i "<密钥>" -P 2002 -o IdentitiesOnly=yes -r "本地\apps\client-mobile\dist"  root@<服务器IP>:/opt/joinyuu/apps/client-mobile/
```

**不想用 scp**：1Panel →「系统 → 文件」→ 进入 `/opt/joinyuu/apps/admin` → 上传 `dist` 压缩包 → 解压覆盖；移动端同理。

**不做手工上传的替代做法**：把两个前端容器的启动命令从 `serve:admin` / `serve:mobile` 改成 `start:admin` / `start:mobile`（= 容器内先构建再服务）。代价是每次重启都要构建，吃内存、耗时更长。

```bash
# 上传后确认产物存在（宿主机终端）
ls -l /opt/joinyuu/apps/admin/dist/index.html /opt/joinyuu/apps/client-mobile/dist/index.html
```

**看到什么算成功**：两个 `index.html` 都存在，且修改时间是刚刚上传的时间。

---

## 6. 第 2 步：补齐新增的环境变量

**这一步最容易被忽略，但漏了会导致后端启动失败。**

1. 打开线上配置 `/opt/joinyuu/apps/api/.env`（用 1Panel「系统 → 文件」双击编辑更方便）。
2. 一条条对照新版本的模板 `apps/api/.env.example`：**模板里有、而你的 `.env` 里没有的条目**按说明补上；模板里注释掉的可选项（如 `MINIO_ACCESS_KEY`）按实际情况决定是否启用。
3. 特别注意两类新增项：
   - **强制项**：例如新增的密钥类变量（缺失时生产环境会直接启动失败，容器日志里会写明缺了哪个）；
   - **行为开关**：例如新增的功能开关，缺失时按默认值运行——希望立刻生效就显式设置。

**有 Git 仓库时，可以用命令直接看出模板改了哪些行**（把 `<旧版本>` 换成第 0 步记录的版本号）：

```bash
cd /opt/joinyuu
git diff <旧版本>..HEAD -- apps/api/.env.example
```

> **改完 `.env` 必须重启 `joinyuu-api` 容器才生效**（见第 4 步）。

**看到什么算成功**：`.env` 里所有新增条目都补上了，且没有残留 `CHANGE_ME` 之类的占位符。

---

## 7. 第 3 步：应用数据库迁移

### 7.1 正常情况：什么都不用做

`joinyuu-api` 容器的启动命令是 `start:api`，它等于：

```bash
pnpm build:api && pnpm --filter @joinyuu/api db:migrate && pnpm --filter @joinyuu/api start
#                                              ↑ 这里就是 prisma migrate deploy
```

也就是说，**重启 `joinyuu-api` 时容器内会自动：构建后端 → 应用数据库迁移 → 启动服务**。你不需要在宿主机上跑任何迁移命令，也不需要手工上传 `apps/api/dist`。

### 7.2 需要手动执行迁移时（仅排错）

若容器日志里迁移失败、或你想单独确认迁移状态，在**容器内**执行（宿主机没有 Node，跑了会报 `/usr/bin/env: 'node': No such file or directory`）：

1. 1Panel →「容器 → 容器」→ 点 `joinyuu-api` → 抽屉「终端」→ 选 `/bin/bash`；
2. 执行：

```bash
cd /app
pnpm --filter @joinyuu/api db:migrate          # = prisma migrate deploy
```

**看到什么算成功**：

- 有未应用的迁移时，会逐条打印迁移名，最后显示 `All migrations have been successfully applied.`；
- 没有新迁移时，显示 `No pending migrations to apply.`（同样算成功）。

### 7.3 常见异常

| 异常 | 原因 | 解决 |
| --- | --- | --- |
| `P3009 migrate found failed migrations` | 上一次迁移中途失败，留下了失败记录 | 先按 SQL 报错修数据，再在**容器内**执行 `pnpm --filter @joinyuu/api exec prisma migrate resolve --rolled-back <迁移名>`，然后重启 `joinyuu-api` |
| `P1001 can't reach database server` | 数据库没启动 / `.env` 里的主机名或密码不对 | 1Panel「应用商店 → 已安装」确认 PostgreSQL 状态；核对 `.env` 的 `DATABASE_URL`（容器内应写数据库容器名，不是 `127.0.0.1`） |
| `P1000 authentication failed` | 数据库密码错了 | 用面板验证密码后修正 `.env`，重启容器 |
| `The table public.AdminPermission does not exist` | 迁移没跑成功 | 看容器日志里 `db:migrate` 那一段的报错；修好后重启容器 |

> `权限码目录校验失败，发现未登记权限码` 属于**首次部署**才会遇到的情况（表已建但没执行 `db:init`），升级时正常不会出现。若真遇到，在 `joinyuu-api` 容器内执行一次 `pnpm --filter @joinyuu/api db:init`（会打印超管初始密码，只打印一次），然后重启容器。⚠️ **不要把 `db:init` 挂进启动命令**（见[铁律二](#2-三条铁律)）。

---

## 8. 第 4 步：重启容器

**顺序不能反：先 `joinyuu-api`**（它负责安装依赖、生成 Prisma 客户端、应用迁移），**再 `joinyuu-admin`、`joinyuu-mobile`**。

1. 1Panel →「网站 → 运行环境 → Node.js」→ 找到 `joinyuu-api` → 点「**重启**」。
2. 等状态回到「**已启动**」（这一步会跑「安装依赖 + 构建 + 迁移」，通常几十秒到一两分钟，属正常），点「日志」确认没有报错。
3. 再依次重启 `joinyuu-admin`、`joinyuu-mobile`。

**预期日志（看到这些就算对了）**：

| 容器 | 日志里应出现 |
| --- | --- |
| `joinyuu-api` | `db:migrate` 段打印迁移名与 `All migrations have been successfully applied.`（或 `No pending migrations to apply.`）；最后一行 `[api] 聚屿社区后端已启动: http://localhost:7757` |
| `joinyuu-admin` | `[admin] 静态服务已启动：http://0.0.0.0:7758（目录 /app/apps/admin/dist；/api 代理 http://joinyuu-api:7757）` |
| `joinyuu-mobile` | `[mobile] 静态服务已启动：http://0.0.0.0:7759（目录 /app/apps/client-mobile/dist；/api 代理 http://joinyuu-api:7757）` |

> 日志里出现 `Ignored build scripts: @alicloud/openapi-core` 是 pnpm 默认拦截第三方构建脚本的提示，不影响本系统运行。

**重启后立刻验证（宿主机终端）**：

```bash
curl http://127.0.0.1:7757/api/health
```

**看到什么算成功**：返回一段 JSON（形如 `{"code":0,"data":{...,"version":"1.5.0"}}`）。

**没成功的话，按这个顺序自查**：

1. 日志里是否有 `Cannot find module '/app/apps/api/dist/main.js'` → 启动命令被改成了 `start`（不构建），改回 `start:api`；
2. 日志里是否有 `JWT_SECRET 未配置` → 第 2 步新增变量没补齐；
3. 日志里是否有 `ECONNREFUSED ...:5432/6379` → `.env` 里的数据库/Redis 主机名写成了 `127.0.0.1`（容器里那指容器自己），改成容器名或 `host.docker.internal`；
4. 前端容器日志首行是否打印 `/api 代理 http://joinyuu-api:7757` → 没有则说明 `API_PROXY_TARGET` 被设成了空字符串。

---

## 9. 第 5 步：升级验收清单

| # | 检查项 | 怎么做 | 期望结果 |
| --- | --- | --- | --- |
| 1 | 后端存活且版本正确 | `curl http://127.0.0.1:7757/api/health` | 返回 JSON，`data.version` 等于本次发布的版本号 |
| 2 | **三端版本号一致** | 打开 `/api/health`、后台「系统管理 → 关于 → 版本信息」（管理后台 + 服务端）、移动端「我的 → 关于」（软件版本 + 服务端版本） | 三处版本号一致且等于本次发布的版本号（见[版本与更新日志规范](./versioning.md)） |
| 3 | 域名可达 | 浏览器打开 `https://admin.你的域名/api/health` | 返回 JSON |
| 4 | 管理后台可登录 | 打开 `https://admin.你的域名` | 正常进入工作台，无控制台报错 |
| 5 | 移动端可打开（含刷新） | 打开 `https://m.你的域名`，登录后进入「我的」按 F5 | 首页与各页面正常，刷新不 404 |
| 6 | 本次改动点已生效 | 打开这次版本更新的那个页面 | 新功能/新文案已出现 |
| 7 | 数据没丢 | 抽查几条历史数据（用户、活动、订单） | 与升级前一致 |
| 8 | 上传功能正常 | 后台素材库上传一张 5MB 图片 | 上传成功且能预览 |
| 9 | 图片能显示 | 打开任意带图的列表/详情 | 正常加载（若配了 MinIO，确认开关与密钥有效） |
| 10 | 许可证仍有效 | 系统管理 → 系统配置 → 基础设置 → 许可证管理 | 状态「有效」，可写入业务数据；未导入/过期时全站只读（维护操作仍可用），见[许可证管理](./license-management.md) |
| 11 | 定时任务在跑 | 后端日志里能看到调度输出，或做一次「定时发布」观察状态自动变化 | 任务被正常执行 |
| 12 | 失败回滚准备就绪 | 确认第 0 步的备份文件还在 | 文件存在且大小合理 |

---

## 10. 回滚手册

### 10.1 只回滚代码 / 文件（迁移只是新增表或列时）

适用：升级后页面/接口报错，但迁移本身没有删除任何数据。

```bash
# 1) 代码切回升级前的版本（用第 0 步记录的版本号）
cd /opt/joinyuu
git checkout <升级前的版本号>

# 2) 前端产物换回备份（如果本次换过）
rm -rf /opt/joinyuu/apps/admin/dist         && cp -r /data/joinyuu/backup/admin-dist-<日期>  /opt/joinyuu/apps/admin/dist
rm -rf /opt/joinyuu/apps/client-mobile/dist && cp -r /data/joinyuu/backup/mobile-dist-<日期> /opt/joinyuu/apps/client-mobile/dist

# 3) 面板上依次「重启」：先 joinyuu-api，再两个前端容器
```

> 此时数据库里已应用了新迁移：如果新迁移只是「加表/加列」，旧代码照样能跑；若新迁移改了旧代码用到的结构（少见），就必须连数据库一起回滚。

### 10.2 连数据库一起回滚（迁移不可逆时才需要）

**前提**：你已经按第 0 步做过备份。

1. **先停 `joinyuu-api` 容器**（面板上点「停止」），避免回滚期间有新写入。
2. 用备份覆盖当前数据库（把文件名换成实际文件名）：

```bash
# 方式一：命令行（⚠️ 会丢掉升级后写入的数据）
PGPASSWORD='你的数据库密码' psql -h 127.0.0.1 -U joinyuu -d postgres -c 'DROP DATABASE joinyuu;'
PGPASSWORD='你的数据库密码' psql -h 127.0.0.1 -U joinyuu -d postgres -c 'CREATE DATABASE joinyuu;'
PGPASSWORD='你的数据库密码' pg_restore -h 127.0.0.1 -U joinyuu -d joinyuu \
  --clean --if-exists /data/joinyuu/backup/db-before-upgrade-<时间>.dump

# 方式二：1Panel「数据库 → PostgreSQL → joinyuu → 备份 → 恢复」，选择对应备份文件
```

3. 把代码切回旧版本（同 10.1），再在面板上「启动」`joinyuu-api`。
4. 验证：`curl http://127.0.0.1:7757/api/health`。

> ⚠️ **迁移不可逆**：`prisma migrate deploy` 没有回退命令，回滚数据库只能靠备份。
> ⚠️ **回滚数据库会丢掉「升级后到回滚前」这段业务数据**。动手前先跟业务方确认时间窗。

### 10.3 回滚后要做的事

1. 把「哪个版本、什么现象、怎么回滚的」记录进[附录 B 的模板](#14-附录-b升级记录模板--命令速查表)。
2. 不要删掉出问题的那个版本的代码——把容器日志一起交给开发排查。
3. 排查修复后，重新按第 0–5 步升级一次（记得**这次也要先备份**）。

---

## 11. 只升级一部分的对照表

| 本次改动 | 必须做 | 可以不做 |
| --- | --- | --- |
| 只改后端逻辑 | 替换项目目录文件 → 重启 `joinyuu-api` | 上传 `dist`、重启前端容器 |
| 只改前端页面 | 上传 `apps/admin/dist`（和/或 `apps/client-mobile/dist`）→ 重启对应前端容器 | 重启 `joinyuu-api`（除非同时也改了后端）；不重启时通常强刷即生效，但换了容器仍建议重启 |
| 含数据库迁移 | 第 0 步备份 → 替换文件 → 重启 `joinyuu-api`（自动迁移） | 手工迁移命令 |
| 新增环境变量 | 改 `/opt/joinyuu/apps/api/.env` → 重启 `joinyuu-api` | 上传 `dist`（若前端没改） |
| 换主题包 | 在后台「系统配置 → 移动端主题」里上传/切换即可 | 任何命令与重启 |

> 不确定时，**按第 0–5 步全部做一遍**最省心：多做的动作除了多花几分钟，不会造成损害。

---

## 12. 升级常见问题

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| 宿主机执行 `pnpm` 脚本报 `/usr/bin/env: 'node': No such file or directory` | 宿主机没有装 Node（本形态的设计如此） | 改到**容器终端**执行：1Panel「容器 → 容器」→ 点 `joinyuu-api` → 抽屉「终端」→ 选 `/bin/bash` → `cd /app && pnpm ...` |
| 前端容器返回 503（浏览器提示「无法访问此网站」） | 本次没上传 `dist`，或容器没重启 | 上传 `dist` 后重启对应前端容器（静态服务是按请求读文件的，通常无需重启；但若改过启动命令就必须重启） |
| 后端容器报 `Cannot find module '/app/apps/api/dist/main.js'` | 启动命令被改成了 `start`（只启动、不构建） | 把 `joinyuu-api` 的启动命令改回 `start:api`，重启容器 |
| 报 `The table public.AdminPermission does not exist` | 迁移没跑成功 | 看容器日志里 `db:migrate` 那一段；修好后重启容器（必要时在容器内手动 `pnpm --filter @joinyuu/api db:migrate`） |
| 报 `权限码目录校验失败，发现未登记权限码` | 表已建但没执行 `db:init`（首次部署才会出现） | 在 `joinyuu-api` 容器内执行一次 `pnpm --filter @joinyuu/api db:init`，然后重启容器；⚠️ 不要把 `db:init` 挂进启动命令 |
| 登录报 405 | `/api` 的请求落到了前端静态服务（容器内置代理被 `API_PROXY_TARGET` 置空，或 Nginx 代理规则顺序把 `/api` 排在了 `/` 后面） | 检查前端容器日志首行是否打印 `；/api 代理 http://joinyuu-api:7757`。没有就删掉 `API_PROXY_TARGET` 变量并重启容器；有 Nginx 反代时把 `/api` 规则调到 `/` 之前 |
| 页面还是旧版 | 浏览器缓存了 `index.html`，或 `dist` 根本没更新 | 先强制刷新（`Ctrl + F5`）；仍旧说明 `dist` 没更新，重新上传并重启对应容器 |
| 迁移失败报 `P3009 failed migrations` | 上一次迁移中途失败，留下了失败记录 | 按 SQL 报错修数据后，在**容器内**执行 `pnpm --filter @joinyuu/api exec prisma migrate resolve --rolled-back <迁移名>`，再重启 `joinyuu-api` |

---

## 13. 附录 A：宿主构建 + systemd / 静态网站形态的旧流程

> ⚠️ **非当前部署形态，仅供备选参考**。以下做法适用于「后端跑在宿主机上（systemd / pm2）+ 前端由 Nginx 静态网站托管站点目录」的实例；用这类形态时宿主机**必须已安装 Node 与 pnpm**，`.env` 里的 `127.0.0.1` 照旧可用。容器形态请只看本文第 0–5 步。

### A.1 旧流程的升级总览

```text
① 备份数据库 + 上传目录 + 主题包 + 记录版本号
        ↓
② 拉取新版本代码（git fetch --tags && git checkout <版本>）
        ↓
③ 对比 .env.example，把新增的环境变量补进 .env
        ↓
④ pnpm install            （更新依赖，会顺便重新生成数据库访问代码）
        ↓
⑤ pnpm db:migrate         （应用数据库迁移）  ⚠️ 不要用 db:seed / db:reset / db:init
        ↓
⑥ pnpm build:api          （构建后端产物）
        ↓
⑦ 重启后端（systemctl restart joinyuu-api / pm2 restart joinyuu-api）
        ↓
⑧ 若含前端改动：pnpm build:admin / build:client-mobile → 替换 Nginx 指向的目录
        ↓
⑨ 验证：健康检查 + 登录 + 关键业务点一遍
```

```bash
# 均在宿主机 /opt/joinyuu 下依次执行
cd /opt/joinyuu
git rev-parse HEAD          # 升级前：记下当前版本
git fetch --tags && git checkout <新版本tag或commit>
# 改 .env（补新增变量）
pnpm install
pnpm db:migrate
pnpm build:api
systemctl restart joinyuu-api        # 或 pm2 restart joinyuu-api，或面板「重启」
curl http://127.0.0.1:7757/api/health
```

### A.2 更新依赖（旧流程）

```bash
cd /opt/joinyuu
pnpm install
```

这一步会自动做两件事：① 按新的依赖清单更新安装包；② 执行 `prisma generate`（重新生成数据库访问代码）——不能省，否则新版本改了数据库结构时后端一启动就报 `PrismaClientValidationError`。

**若内存不足被系统杀掉**：加临时交换分区后重试：

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
cd /opt/joinyuu && pnpm install
```

### A.3 重启后端（旧流程三种方式，选一种）

**方式一：systemd**

```bash
systemctl restart joinyuu-api
systemctl status joinyuu-api        # 看到 active (running)
journalctl -u joinyuu-api -n 200    # 看最近 200 行日志有没有报错
```

对应的服务文件 `/etc/systemd/system/joinyuu-api.service`：

```ini
[Unit]
Description=Joinyuu Community API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/joinyuu/apps/api
# 进程用户（建议与文件属主一致；先用 root 最简单）
User=root
Environment=NODE_ENV=production
# 后端自己会读取 apps/api/.env，无需在这里重复配置
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**方式二：pm2**

```bash
pm2 restart joinyuu-api && pm2 logs joinyuu-api --lines 100
# 首次创建：cd /opt/joinyuu/apps/api && pm2 start dist/main.js --name joinyuu-api
# 开机自启：pm2 save && pm2 startup
```

**方式三：1Panel 运行环境（容器，即当前主线形态）**

面板「网站 → 运行环境 → Node.js」→ 对应环境点「重启」→ 点「日志」查看。**注意**：容器形态下宿主机不需要 Node，`pnpm install` / `pnpm build:api` 都不应在宿主机执行。

### A.4 更新前端页面并替换 Nginx 站点目录（旧流程）

```bash
cd /opt/joinyuu

# 1) 构建（按需构建其中一个或两个）
pnpm build:admin
pnpm build:client-mobile

# 2) 替换 Nginx 正在服务的目录（先清空旧文件，避免残留旧页面）
rm -rf /data/joinyuu/sites/admin/*  && cp -r /opt/joinyuu/apps/admin/dist/.          /data/joinyuu/sites/admin/
rm -rf /data/joinyuu/sites/mobile/* && cp -r /opt/joinyuu/apps/client-mobile/dist/. /data/joinyuu/sites/mobile/

# 3) 权限保持一致
chmod -R 755 /data/joinyuu/sites
```

> Nginx 指向的目录不要包含 `dist` 这一层（应指向 `dist` **里面**的内容，即目录下直接是 `index.html` 和 `assets/`）。
> 浏览器看不到新版页面时，让用户按 `Ctrl + F5`（强制刷新）或换无痕窗口，通常不是故障。

### A.5 旧流程的缓存生效说明（可选）

系统里有几处缓存，升级后不会瞬间感知到新数据：系统配置/字典/规则/工作台汇总最长 **10 分钟**；管理员权限码最长 **5 分钟**；管理员账号画像最长 **60 秒**。若想立刻生效（把密码换成你的 Redis 密码）：

```bash
R='redis-cli -h 127.0.0.1 -p 6379 -a 你的Redis密码 --no-auth-warning'
$R DEL config:system rules:points rules:experience \
        rules:levels:community_individual rules:levels:community_enterprise dashboard:summary
$R --scan --pattern 'dicts:*'            | xargs -r -n 50 $R DEL
$R --scan --pattern 'auth:admin:perms:*' | xargs -r -n 50 $R DEL
$R --scan --pattern 'auth:admin:scopes:*'| xargs -r -n 50 $R DEL
```

> ⚠️ **不要执行 `FLUSHALL` / `FLUSHDB`**：Redis 里还存着登录会话与「强制下线黑名单」，清空会让所有登录状态失效，并让已被踢出的账号重新可用。

---

## 14. 附录 B：升级记录模板 + 命令速查表

### B.1 升级记录模板（建议每次升级都填一行）

| 日期 | 升级前版本 | 升级后版本 | 是否跑迁移 | 是否重建/上传前端 | 备份文件名 | 结果 | 操作人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-17 | `1.4.0` | `1.5.0` | 是（自动 2 个） | 管理端+移动端 | `db-before-upgrade-2026-10-17-0300.dump` | 成功 | 张三 |
|  |  |  |  |  |  |  |  |

### B.2 命令速查（**容器内** 与 **宿主机** 分开标注）

| 目的 | 命令 | 在哪执行 |
| --- | --- | --- |
| 查看当前版本 | `git rev-parse HEAD` | 宿主机（`/opt/joinyuu`） |
| 拉取并切换版本 | `git fetch --tags && git checkout <版本>` | 宿主机（`/opt/joinyuu`） |
| 看模板新增了哪些变量 | `git diff <旧版本>..HEAD -- apps/api/.env.example` | 宿主机（`/opt/joinyuu`） |
| 上传前端产物 | `scp -i "<密钥>" -P 2002 -o IdentitiesOnly=yes -r "本地\apps\admin\dist" root@<服务器IP>:/opt/joinyuu/apps/admin/` | 你自己电脑 |
| 健康检查 | `curl http://127.0.0.1:7757/api/health` | 宿主机 |
| 备份数据库 | `PGPASSWORD='密码' pg_dump -h 127.0.0.1 -U joinyuu -d joinyuu -Fc -f 文件名.dump` | 宿主机 |
| 恢复数据库 | `PGPASSWORD='密码' pg_restore -h 127.0.0.1 -U joinyuu -d joinyuu --clean --if-exists 文件名.dump` | 宿主机 |
| 看后端日志 | 面板「运行环境 → 日志」`/` `journalctl -u joinyuu-api -n 200` | 面板 / 宿主机（旧形态） |
| 应用数据库迁移 | `cd /app && pnpm --filter @joinyuu/api db:migrate` | **容器内**（`joinyuu-api` 终端） |
| 首次部署写基础数据（仅一次） | `cd /app && pnpm --filter @joinyuu/api db:init` | **容器内**（`joinyuu-api` 终端），⚠️ 不可挂进启动命令 |
| 修掉失败的迁移记录 | `cd /app && pnpm --filter @joinyuu/api exec prisma migrate resolve --rolled-back <迁移名>` | **容器内**（`joinyuu-api` 终端） |
| 重启后端 | 面板运行环境「重启」 | 1Panel 面板 |
| 重启后端（旧形态） | `systemctl restart joinyuu-api` / `pm2 restart joinyuu-api` | 宿主机 |

### B.3 一句话总结升级流程

> 备份数据库与上传目录 → 记录版本号 → 替换项目目录文件（**前端记得带 `dist`**）→ 补新增的环境变量 → 重启 `joinyuu-api`（自动构建 + 迁移）→ 重启两个前端容器 → 看一眼 `/api/health` 与三端「关于」页版本号是否一致。

---

## 15. 相关文档

- [部署手册](./deploy-1panel.md) —— 首次部署、运行环境怎么填、三个容器的关系
- [版本与更新日志规范](./versioning.md) —— 版本号规则、三端锁步、发布流程、`CHANGELOG` 写法
- [许可证管理](./license-management.md) —— 许可证导入与有效期（升级不影响有效期；未导入/过期时全站只读）
