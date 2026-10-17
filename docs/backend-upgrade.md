# 后端升级手册 · 已上线系统如何升级版本

> 面向对象：已经按[部署手册](./deploy-1panel.md)上线过一次的人。**照着顺序做即可**，每一步都写清了命令、预期输出和出错怎么办。
> 本文只讲**升级**（代码更新 + 数据库迁移）；首次部署请看[部署手册](./deploy-1panel.md)；许可证本身升级不受影响，见[许可证管理](./license-management.md)。

---

## 目录

1. [升级到底改了几样东西](#1-升级到底改了几样东西)
2. [三条铁律（先读）](#2-三条铁律先读)
3. [升级总览（一张流程图 + 命令清单）](#3-升级总览一张流程图--命令清单)
4. [第 0 步：升级前的备份（必做）](#4-第-0-步升级前的备份必做)
5. [第 1 步：记录当前版本号](#5-第-1-步记录当前版本号)
6. [第 2 步：把新版本代码取到服务器](#6-第-2-步把新版本代码取到服务器)
7. [第 3 步：补齐新增的环境变量](#7-第-3-步补齐新增的环境变量)
8. [第 4 步：更新依赖](#8-第-4-步更新依赖)
9. [第 5 步：应用数据库迁移](#9-第-5-步应用数据库迁移)
10. [第 6 步：构建后端](#10-第-6-步构建后端)
11. [第 7 步：重启后端](#11-第-7-步重启后端)
12. [第 8 步：更新前端页面（若本次含前端改动）](#12-第-8-步更新前端页面若本次含前端改动)
13. [第 9 步：让新配置与新权限立刻生效](#13-第-9-步让新配置与新权限立刻生效)
14. [第 10 步：升级验收清单](#14-第-10-步升级验收清单)
15. [只升级一部分的对照表](#15-只升级一部分的对照表)
16. [回滚手册（升级失败怎么办）](#16-回滚手册升级失败怎么办)
17. [升级常见问题（症状 → 原因 → 解决）](#17-升级常见问题症状--原因--解决)
18. [附录：升级记录模板 / 命令速查](#18-附录升级记录模板--命令速查)
19. [进阶：三端都跑在 1Panel「运行环境」里的升级流程](#19-进阶三端都跑在-1panel运行环境里的升级流程)

---

## 1. 升级到底改了几样东西

一次版本升级可能包含下面 5 类改动，**要做的动作取决于改动类型**：

| 改动类型 | 例子 | 需要做的动作 |
| --- | --- | --- |
| 后端逻辑代码 | 修了一个接口的 bug | 重新构建 + 重启后端 |
| 数据库结构 / 数据迁移 | 新增字段、新增表、回填数据 | `pnpm db:migrate` |
| 前端页面代码 | 管理后台加了一列、移动端改了样式 | 重新构建两个前端 + 替换文件 |
| 新增环境变量 | 新增了一个开关类配置项 | 改 `.env`（不改会启动失败） |
| 依赖变化 | 升级了某个库 | `pnpm install` |
| 版本号与更新日志 | 每次发布都会改 | 无需命令；但**升级前建议先读新版本的 `CHANGELOG`**（`apps/*/CHANGELOG.md`）了解改动范围与破坏性变更 |

**保守做法**：不管这次改了什么，把下面 3–9 步全做一遍（几分钟到十几分钟），最稳妥。

---

## 2. 三条铁律（先读）

### 铁律一：升级前必须先备份数据库

数据库迁移是**单向**的：`pnpm db:migrate` 只往前推，官方**没有**「一键撤销迁移」的命令。升级后想回到旧版本，只能靠升级前的备份恢复数据库。

### 铁律二：生产环境绝对不要执行这三条命令

| 命令 | 后果（生产环境务必避免） |
| --- | --- |
| `pnpm db:seed` | 写入**整套演示数据**（演示用户、需求、活动、商城订单、审计日志、4 个演示管理员账号），会把线上库搞乱 |
| `pnpm db:reset` | **清空整个数据库**后重建，等于删库 |
| `pnpm db:init` | 只用于全新空库；升级时**不需要**执行（已有数据的库会被它自动拒绝，这是安全设计） |

> 升级只需要 `pnpm db:migrate`（应用增量迁移）。它自带「已执行过的迁移不会重复执行」的记账表，重复运行是安全的。

### 铁律三：上传文件与主题包不能删

下面两个目录是**线上数据**，任何清理/重装/覆盖操作都不能删：

- 上传的图片、合同、素材：`UPLOAD_DIR` 指向的目录（部署手册里建议是 `/data/joinyuu/uploads`）或默认的 `/opt/joinyuu/apps/api/uploads`
- 已安装的移动端主题包：`/opt/joinyuu/apps/api/mobile-themes`

---

## 3. 升级总览（一张流程图 + 命令清单）

```
① 备份数据库 + 上传目录 + 主题包 + 记录版本号
        ↓
② 拉取新版本代码（git fetch / checkout 版本号）
        ↓
③ 对比 .env.example，把新增的环境变量补进 .env      ← 最容易漏的一步
        ↓
④ pnpm install            （更新依赖，会顺便重新生成数据库访问代码）
        ↓
⑤ pnpm db:migrate         （应用数据库迁移）  ⚠️ 不要用 db:seed / db:reset / db:init
        ↓
⑥ pnpm build:api          （构建后端产物）
        ↓
⑦ 重启后端（面板运行环境「重启」按钮 或 systemctl restart joinyuu-api）
        ↓
⑧ 若含前端改动：pnpm build:admin / build:client-mobile → 替换 Nginx 指向的目录
        ↓
⑨ 验证：健康检查 + 登录 + 关键业务点一遍
```

**命令清单**（在 `/opt/joinyuu` 目录下依次执行）：

```bash
cd /opt/joinyuu
git rev-parse HEAD          # 升级前：记下当前版本
git fetch --tags && git checkout <新版本tag或commit>
# 改 .env（补新增变量）
pnpm install
pnpm db:migrate
pnpm build:api
systemctl restart joinyuu-api        # 或面板上点「重启」
curl http://127.0.0.1:7757/api/health
```

---

## 4. 第 0 步：升级前的备份（必做）

### 4.1 备份数据库

**方式一：1Panel 面板（最省事）**

1. 1Panel →「数据库 → PostgreSQL」→ 点 `joinyuu` →「备份」→「立即备份」。
2. 等状态变成「成功」，记下备份文件名（后面回滚要用）。

**方式二：终端命令**

```bash
mkdir -p /data/joinyuu/backup
PGPASSWORD='你的数据库密码' pg_dump -h 127.0.0.1 -U joinyuu -d joinyuu -Fc \
  -f /data/joinyuu/backup/db-before-upgrade-$(date +%F-%H%M).dump
ls -lh /data/joinyuu/backup      # 确认文件存在且大小合理（不是 0 字节）
```

### 4.2 备份上传文件与主题包

```bash
tar -czf /data/joinyuu/backup/uploads-$(date +%F).tar.gz -C /data/joinyuu uploads
tar -czf /data/joinyuu/backup/themes-$(date +%F).tar.gz  -C /opt/joinyuu/apps/api mobile-themes 2>/dev/null || true
```

> 如果 `UPLOAD_DIR` 用的是别的目录，把 `-C /data/joinyuu uploads` 换成实际路径。

### 4.3 备份前端产物（方便回滚页面）

```bash
cp -r /data/joinyuu/sites/admin  /data/joinyuu/backup/sites-admin-$(date +%F)
cp -r /data/joinyuu/sites/mobile /data/joinyuu/backup/sites-mobile-$(date +%F)
```

### 4.4 记录版本号

```bash
cd /opt/joinyuu
git rev-parse HEAD | tee -a /data/joinyuu/backup/versions.log
git log -1 --format='%h %ad %s' --date=short | tee -a /data/joinyuu/backup/versions.log
```

**要做对这件事**：版本号一定要写在纸上或记到本文附录的《升级记录模板》里——回滚时它就是「回到哪一版」的依据。

---

## 5. 第 1 步：记录当前版本号

见上一节的 4.4。若代码是从压缩包上传的（没有 `.git` 目录），至少记录**压缩包文件名 + 上传日期**，并确认 `/data/joinyuu/backup` 里有一份升级前的完整代码压缩包。

---

## 6. 第 2 步：把新版本代码取到服务器

### 情况 A：服务器上是 Git 仓库（推荐）

```bash
cd /opt/joinyuu

# 1) 查看远程有哪些新版本
git fetch --tags

# 2) 切换到目标版本（把 <版本> 换成 release tag 或 commit 号）
git checkout <版本>

# 3) 确认已切换到位（显示的应是新版本）
git log -1 --format='%h %ad %s' --date=short

# 4) 确认工作区是干净的（升级期间不要有本地改动）
git status --short      # 正常应无输出
```

> 如果第 4 步有输出（显示你改过 `.env` 之类）：`.env` 已被 git 忽略，一般不会出现；若确实有改动，先用 `git stash` 暂存再用升级，或先备份该文件再处理。

### 情况 B：服务器上是上传的压缩包

1. 在本机把新版本打包（**打包前删掉 `node_modules`**）。
2. 1Panel →「系统 → 文件」→ 进入 `/opt` → 上传压缩包 → 解压到一个新目录，例如 `/opt/joinyuu-new`。
3. **不要直接覆盖旧目录**：先把两个要保留的线上目录搬过去或复制过去：

```bash
cp -r /opt/joinyuu/apps/api/uploads      /opt/joinyuu-new/apps/api/ 2>/dev/null || true
cp -r /opt/joinyuu/apps/api/mobile-themes /opt/joinyuu-new/apps/api/ 2>/dev/null || true
cp -a /opt/joinyuu/apps/api/.env          /opt/joinyuu-new/apps/api/.env
```

4. 切换目录（先重命名旧目录保底，再改名新目录）：

```bash
mv /opt/joinyuu /opt/joinyuu-old-$(date +%F)
mv /opt/joinyuu-new /opt/joinyuu
cd /opt/joinyuu && ls -l    # 确认目录结构正确
```

> 这种「换目录」的方式天然带一份旧版本，回滚时把目录名换回来即可。记得之后重启后端（服务文件里的路径仍是 `/opt/joinyuu`，未变）。

**看到什么算成功**：`git log -1` 或目录内容确认已是新版本。

---

## 7. 第 3 步：补齐新增的环境变量

**这一步最容易被忽略，但漏了会导致后端启动失败。**

1. 在服务器上看新版本的模板：

```bash
cd /opt/joinyuu
cat apps/api/.env.example
```

2. 在服务器上打开线上配置 `/opt/joinyuu/apps/api/.env`（用 1Panel「系统 → 文件」双击编辑更方便）。
3. 一条条对照：**模板里有、而你的 `.env` 里没有的条目**，按模板的说明补上；模板里注释掉的可选项（如 `MINIO_ACCESS_KEY`）按你的实际情况决定是否启用。
4. 特别注意以下两类新增项：
   - **强制项**：例如新增的密钥类变量（缺失时生产环境会直接启动失败，日志里会写明缺了哪个）；
   - **行为开关**：例如新增的功能开关，缺失时按默认值运行——如果你希望立刻生效，要显式设置。

> 有 Git 仓库时，可以用命令直接看出模板改了哪些行（把 `<旧版本>` 换成第 1 步记录的版本号）：
>
> ```bash
> cd /opt/joinyuu
> git diff <旧版本>..HEAD -- apps/api/.env.example
> ```

**看到什么算成功**：`.env` 里所有新增条目都补上了，且没有残留 `CHANGE_ME` 之类的占位符。

---

## 8. 第 4 步：更新依赖

```bash
cd /opt/joinyuu
pnpm install
```

**这一步会自动做两件重要的事**：

1. 按新的依赖清单更新安装包；
2. 执行 `prisma generate`（**重新生成数据库访问代码**）——这一步不能省：如果新版本改了数据库结构而你没重新生成，后端一启动就会报 `PrismaClientValidationError`（提示「未知字段」之类）。

**看到什么算成功**：命令结束无红色 `Error`。若提示 `Lockfile is up to date`，说明依赖没变化，属正常。

**若内存不足被系统杀掉**：加临时交换分区后重试：

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
cd /opt/joinyuu && pnpm install
```

---

## 9. 第 5 步：应用数据库迁移

```bash
cd /opt/joinyuu
pnpm db:migrate
```

**看到什么算成功**：

- 有未应用的迁移时，会逐条打印迁移名，最后显示 `All migrations have been successfully applied.`；
- 没有新迁移时，显示 `No pending migrations to apply.`（同样算成功）。

### 三种常见异常

| 异常 | 原因 | 解决 |
| --- | --- | --- |
| `P3009 migrate found failed migrations` | 上一次迁移中途失败，留下了失败记录 | 先看失败原因（一般在迁移 SQL 里报的错，如数据不符合约束）。确认已手工修复数据后，执行 `pnpm --filter @joinyuu/api exec prisma migrate resolve --rolled-back <迁移名>`，再重新 `pnpm db:migrate` |
| `P1001 can't reach database server` | 数据库没启动 / 端口或密码改过 | 1Panel「应用商店 → 已安装」确认 PostgreSQL 状态；核对 `.env` 里的 `DATABASE_URL` |
| `P1000 authentication failed` | 数据库密码错了 | 用 `psql` 或面板验证密码后修正 `.env` |

### 顺序建议（停机时间越短越好）

本项目的迁移基本是「新增表/新增列/回填数据」这类**向后兼容**改动，所以推荐：**先迁移 → 再切代码 → 再重启**，旧代码在新库上仍能跑，停机时间最短。

如果本次版本说明里写了「删除字段 / 重命名表」这类破坏性变更，则改用**停服窗口**：先停后端 → 迁移 → 切代码 → 启动后端 → 验证。

---

## 10. 第 6 步：构建后端

```bash
cd /opt/joinyuu
pnpm build:api
ls -l apps/api/dist/main.js      # 确认产物存在
```

**看到什么算成功**：无红色 `Error`，且 `main.js` 存在、修改时间是刚刚。

---

## 11. 第 7 步：重启后端

按你上线时选的方式，**选一种**：

**方案 A：1Panel 面板**

1. 1Panel →「网站 → 运行环境 → Node.js」→ 找到 `joinyuu-api` → 点「重启」。
2. 点「日志」查看，确认没有报错，且状态是「已启动」。

> ⚠️ **用面板运行环境（容器）托管时有三个额外注意点**（详见[部署手册第 9 步方案 A](./deploy-1panel.md#11-第-9-步让后端常驻运行)）：
> - 升级时的 `pnpm install` 与 `pnpm build:api` 必须在**服务器终端**里执行，面板里的「安装 node_modules」保持关闭，否则容器内会装出另一套依赖；
> - `.env` 的数据库地址若用的是**容器名**（如 `@postgresql`）或 `host.docker.internal`，宿主机上跑 `pnpm db:migrate` 前要先在 `/etc/hosts` 里加映射（`echo '127.0.0.1 postgresql' >> /etc/hosts`），否则宿主机解析不到这些名字；
> - 升级后**不要**把 `.env` 的主机名改回 `127.0.0.1`——容器里 `127.0.0.1` 指的是容器自己。

**方案 B：systemd**

```bash
systemctl restart joinyuu-api
systemctl status joinyuu-api        # 看到 active (running)
journalctl -u joinyuu-api -n 100    # 看启动日志有没有报错
```

**方案 C：pm2**

```bash
pm2 restart joinyuu-api && pm2 logs joinyuu-api --lines 100
```

### 重启后立刻验证

```bash
curl http://127.0.0.1:7757/api/health
```

**看到什么算成功**：返回 JSON。

**没成功的话，按这个顺序自查**：

1. 日志里是否有 `PrismaClientValidationError` → 第 4 步的 `pnpm install`（含 `prisma generate`）没执行；
2. 日志里是否有 `JWT_SECRET 未配置` → 第 3 步新增变量没补齐；
3. 是否 `ECONNREFUSED 5432/6379` → 数据库/Redis 没起来或连接串有误；
4. 是否端口 7757 被占用 → `ss -lntp | grep 7757` 查看占用进程。

---

## 12. 第 8 步：更新前端页面（若本次含前端改动）

若本次版本改动了管理后台或移动端页面，需要重新构建并替换 Nginx 指向的目录：

```bash
cd /opt/joinyuu

# 1) 构建（按需构建其中一个或两个）
pnpm build:admin
pnpm build:client-mobile

# 2) 替换 Nginx 正在服务的目录（先清空旧文件，避免残留旧页面）
rm -rf /data/joinyuu/sites/admin/*  && cp -r /opt/joinyuu/apps/admin/dist/. /data/joinyuu/sites/admin/
rm -rf /data/joinyuu/sites/mobile/* && cp -r /opt/joinyuu/apps/client-mobile/dist/. /data/joinyuu/sites/mobile/

# 3) 权限保持一致
chmod -R 755 /data/joinyuu/sites
```

**浏览器看不到新版页面时**：前端文件名带哈希，正常情况下会自动加载新版；但 `index.html` 可能被浏览器缓存，让用户按 `Ctrl + F5`（强制刷新）或换无痕窗口再看一次即可。这不是故障。

> Nginx 指向的目录不要包含 `dist` 这一层（应指向 `dist` **里面**的内容，即目录下直接是 `index.html` 和 `assets/`）。

---

## 13. 第 9 步：让新配置与新权限立刻生效

系统里有几处**缓存**，升级后不会瞬间感知到新数据。三种情况要分开看：

| 缓存内容 | 自动生效时间 | 说明 |
| --- | --- | --- |
| 系统配置、字典、积分/经验/等级规则、工作台汇总 | 最长 **10 分钟** | 到期自动从数据库重新读取 |
| 管理员权限码 | 最长 **5 分钟** | 若本次版本新增了权限码，最长 5 分钟后所有账号拿到新权限 |
| 管理员账号画像（是否停用/超管/有无角色） | 最长 **60 秒** | — |

**结论**：升级后如果发现「新加的权限没有生效」「新的下拉选项没出现」，先等 5–10 分钟再去核对，通常就正常了。

**想立刻生效（可选）**：在终端执行下面的命令清缓存键（把密码换成你的 Redis 密码）：

```bash
R='redis-cli -h 127.0.0.1 -p 6379 -a 你的Redis密码 --no-auth-warning'

# 1) 清固定键
$R DEL config:system rules:points rules:experience \
        rules:levels:community_individual rules:levels:community_enterprise dashboard:summary

# 2) 清字典键与权限缓存（按前缀批量清）
$R --scan --pattern 'dicts:*'            | xargs -r -n 50 $R DEL
$R --scan --pattern 'auth:admin:perms:*' | xargs -r -n 50 $R DEL
$R --scan --pattern 'auth:admin:scopes:*'| xargs -r -n 50 $R DEL
```

> ⚠️ **不要执行 `FLUSHALL` / `FLUSHDB`**：Redis 里还存着登录会话与「强制下线黑名单」，清空会让所有登录状态失效，并让已被踢出的账号重新可用。

---

## 14. 第 10 步：升级验收清单

| # | 检查项 | 怎么做 | 期望结果 |
| --- | --- | --- | --- |
| 1 | 后端存活 | `curl http://127.0.0.1:7757/api/health` | 返回 JSON |
| 2 | 域名可达 | 浏览器打开 `https://admin.你的域名/api/health` | 返回 JSON |
| 3 | 管理后台可登录 | 打开 `https://admin.你的域名` | 正常进入工作台，无控制台报错 |
| 4 | 移动端可打开 | 打开 `https://m.你的域名` | 首页正常，登录后各页面可打开 |
| 5 | 本次改动点已生效 | 打开这次版本更新的那个页面 | 新功能/新文案已出现（权限类等 5–10 分钟） |
| 6 | 数据没丢 | 抽查几条历史数据（用户、活动、订单） | 与升级前一致 |
| 7 | 上传功能正常 | 后台素材库上传一张 5MB 图片 | 上传成功 |
| 8 | 许可证仍有效 | 系统管理 → 系统配置 → 基础设置 → 许可证管理 | 状态「有效」 |
| 9 | 图片能显示 | 打开任意带图的列表/详情 | 图片正常加载（若配了 MinIO，确认开关与密钥有效） |
| 10 | 定时任务在跑 | 后端日志里能看到调度输出，或做一次「定时发布」观察状态自动变化 | 任务被正常执行 |
| 11 | 失败回滚准备就绪 | 确认第 0 步的备份文件还在 | 文件存在且大小合理 |
| 12 | 三端版本号一致 | 打开 `/api/health`、后台「系统管理 → 关于」、移动端「我的 → 关于」 | 三处显示的版本号一致且等于本次发布的版本号（见 [版本与更新日志规范](./versioning.md)） |

---

## 15. 只升级一部分的对照表

| 本次改动 | 必须做 | 可以不做 |
| --- | --- | --- |
| 只改后端逻辑 | `pnpm install`（如依赖有变）→ `pnpm build:api` → 重启 | `db:migrate`、前端构建 |
| 只改前端页面 | `pnpm build:admin` / `build:client-mobile` → 替换目录 | 后端构建与重启 |
| 含数据库迁移 | `pnpm install` → `pnpm db:migrate` → `pnpm build:api` → 重启 | 前端（若没改） |
| 新增环境变量 | 改 `.env` → 重启后端 | 迁移（若没改） |
| 只换了移动端主题包 | 无需重新部署，在后台「系统配置 → 移动端主题」里上传/切换即可 | 任何命令 |

> 不确定时，**按第 3–9 步全部做一遍**最省心：多做的动作除了多花几分钟，不会造成损害。

---

## 16. 回滚手册（升级失败怎么办）

### 16.1 只回滚代码（数据库没动或只是新增表/列）

适用：升级后页面/接口报错，但迁移本身没有删除任何数据。

```bash
cd /opt/joinyuu
git checkout <升级前的版本号>       # 用第 1 步记录的版本号
pnpm install
pnpm build:api
systemctl restart joinyuu-api        # 或面板「重启」
curl http://127.0.0.1:7757/api/health
```

若前端也换过，把之前备份的目录换回去：

```bash
rm -rf /data/joinyuu/sites/admin/*  && cp -r /data/joinyuu/backup/sites-admin-<日期>/.  /data/joinyuu/sites/admin/
rm -rf /data/joinyuu/sites/mobile/* && cp -r /data/joinyuu/backup/sites-mobile-<日期>/. /data/joinyuu/sites/mobile/
```

> 此时数据库已应用了新迁移：如果新迁移只是「加表/加列」，旧代码照样能跑；若新迁移改了旧代码用到的结构（少见），就必须连数据库一起回滚。

### 16.2 连数据库一起回滚（迁移不可逆时才需要）

**前提**：你已经按第 0 步做过备份。

1. 先停后端，避免回滚期间有新写入：

```bash
systemctl stop joinyuu-api      # 或面板「停止」
```

2. 用备份覆盖当前数据库（把备份文件名换成实际文件名）：

```bash
# 方式一：先删库重建（⚠️ 会丢掉升级后写入的数据）
PGPASSWORD='你的数据库密码' psql -h 127.0.0.1 -U joinyuu -d postgres -c 'DROP DATABASE joinyuu;'
PGPASSWORD='你的数据库密码' psql -h 127.0.0.1 -U joinyuu -d postgres -c 'CREATE DATABASE joinyuu;'
PGPASSWORD='你的数据库密码' pg_restore -h 127.0.0.1 -U joinyuu -d joinyuu \
  --clean --if-exists /data/joinyuu/backup/db-before-upgrade-<时间>.dump

# 方式二：用 1Panel 面板「数据库 → PostgreSQL → joinyuu → 备份 → 恢复」，选择对应备份文件
```

3. 把代码切回旧版本（同 16.1），再启动后端：

```bash
systemctl start joinyuu-api
curl http://127.0.0.1:7757/api/health
```

> ⚠️ 回滚数据库会**丢掉升级后到回滚前这段时间产生的业务数据**。所以回滚前先跟业务方确认时间窗。

### 16.3 回滚后要做的事

1. 把「哪个版本、什么现象、怎么回滚的」记录下来（附录模板）。
2. 不要删掉出问题的那个版本的代码——把报错日志一起交给开发排查。
3. 排查修复后，重新按第 3–9 步升级一次（记得这次也要先备份）。

---

## 17. 升级常见问题（症状 → 原因 → 解决）

| 症状 | 原因 | 解决 |
| --- | --- | --- |
| 后端启动即失败，日志写 `JWT_SECRET 未配置` | 第 3 步新增变量没补 | 按 `.env.example` 补齐后重启 |
| 接口报 `PrismaClientValidationError`（未知字段/参数） | 没有重新生成数据库访问代码 | 执行 `pnpm install`（自带 `prisma generate`）后重新构建并重启 |
| `pnpm db:migrate` 报 `P3009 failed migrations` | 上次迁移中途失败留下记录 | 修数据后用 `prisma migrate resolve --rolled-back <迁移名>`，再重新迁移 |
| 迁移卡住不动/报锁等待 | 有长事务或另一个进程占着迁移锁 | 检查是否有正在跑的旧后端进程；等待或停掉后重试 |
| 网页白屏，控制台 404 一堆 js/css | 前端产物没替换，或目录指向多了一层 `dist` | 按第 12 步替换目录并确认目录里直接是 `index.html` |
| 页面还是旧版 | 浏览器缓存了 `index.html` | 强制刷新（`Ctrl + F5`）或无痕窗口再试 |
| 新加的权限没生效 | 权限缓存最长 5 分钟 | 等 5–10 分钟；或按第 13 步清 `auth:admin:perms:*` |
| 下拉选项里没有新增的字典项 | 字典缓存最长 10 分钟 | 等 10 分钟；或清 `dicts:*` |
| 上传大文件失败 | Nginx 上传体积限制未调整 | 部署时应在网站配置里加 `client_max_body_size 100m;` |
| 图片全挂了 | 配了 MinIO 但密钥/Endpoint 变更或容器未运行 | 检查 MinIO 应用状态；核对 `.env` 的 `MINIO_ACCESS_KEY/SECRET_KEY` 与后台「对象存储」的 Endpoint/Bucket |
| 时间显示差了 8 小时 | 服务器时区不对 | 服务器执行 `timedatectl set-timezone Asia/Shanghai`，`.env` 保留 `TZ="Asia/Shanghai"`，重启后端 |
| 许可证变成「无效」 | 通常与升级无关（过期/换了公钥） | 见[许可证管理](./license-management.md)；许可证有独立有效期 |
| 升级后写入全被拒绝 | 许可证过期（升级前就已到期） | 导入新许可证 |
| 内存不足，`pnpm build` 被杀 | 服务器内存小 | 临时加交换分区（见第 8 步） |

---

## 18. 附录：升级记录模板 / 命令速查

### 18.1 升级记录模板（建议每次升级都填一行）

| 日期 | 升级前版本 | 升级后版本 | 是否跑迁移 | 是否重建前端 | 备份文件名 | 结果 | 操作人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-17 | `abc1234` | `def5678` | 是（2 个） | 管理端+移动端 | `db-before-upgrade-2026-10-17-0300.dump` | 成功 | 张三 |
|  |  |  |  |  |  |  |  |

### 18.2 命令速查（均在 `/opt/joinyuu` 下执行）

| 目的 | 命令 |
| --- | --- |
| 查看当前版本 | `git rev-parse HEAD` |
| 拉取并切换版本 | `git fetch --tags && git checkout <版本>` |
| 看模板新增了哪些变量 | `git diff <旧版本>..HEAD -- apps/api/.env.example` |
| 更新依赖（含 prisma generate） | `pnpm install` |
| 应用数据库迁移 | `pnpm db:migrate` |
| 构建后端 | `pnpm build:api` |
| 构建前端 | `pnpm build:admin` / `pnpm build:client-mobile` |
| 重启后端 | 面板运行环境「重启」/ `systemctl restart joinyuu-api` / `pm2 restart joinyuu-api` |
| 健康检查 | `curl http://127.0.0.1:7757/api/health` |
| 看后端日志 | `journalctl -u joinyuu-api -n 200` / 面板运行环境「日志」 |
| 备份数据库 | `PGPASSWORD='密码' pg_dump -h 127.0.0.1 -U joinyuu -d joinyuu -Fc -f 文件名.dump` |
| 恢复数据库 | `PGPASSWORD='密码' pg_restore -h 127.0.0.1 -U joinyuu -d joinyuu --clean --if-exists 文件名.dump` |

### 18.3 一句话总结升级流程

> 备份数据库与上传目录 → 记录版本号 → 切换新版本代码 → 补新的环境变量 → `pnpm install` → `pnpm db:migrate` → `pnpm build:api` → 重启后端 → （有前端改动就重建并替换目录）→ 看一眼 `/api/health` 和关键页面。

---

## 19. 进阶：三端都跑在 1Panel「运行环境」里的升级流程

若你的部署形态是[部署手册第 21 节](./deploy-1panel.md#21-进阶方案三端都跑在-1panel运行环境里)（后端、管理端、移动端都由运行环境容器托管），升级流程更短：

| # | 步骤 | 说明 |
| --- | --- | --- |
| 1 | 备份数据库、上传目录、主题包 | 与第 0 步相同（不可省） |
| 2 | 记录当前版本号 | 与第 1 步相同 |
| 3 | **替换项目目录文件** | `git fetch --tags && git checkout <版本>`；前端若本次有改动，**必须同时上传新的 `apps/admin/dist`、`apps/client-mobile/dist`**（`dist` 不在 Git 里）；懒得上传就让前端容器改用 `start:admin` / `start:mobile` 自建 |
| 4 | 补新增环境变量 | 改 `/opt/joinyuu/apps/api/.env`（对照 `.env.example` 的 diff） |
| 5 | 应用数据库迁移（若有） | 在 `joinyuu-api` 容器的终端里执行 `pnpm --filter @joinyuu/api db:migrate`；宿主装了 Node 时也可在项目目录执行同一命令 |
| 6 | **重启容器** | 顺序：先 `joinyuu-api`（它负责容器内安装依赖、生成 Prisma 客户端），再 `joinyuu-admin`、`joinyuu-mobile` |
| 7 | 核对 | `/api/health`、后台「关于」页、移动端「关于」页三处版本号一致（见[版本与更新日志规范](./versioning.md)） |
| 8 | 回滚 | 把项目目录文件换回旧版本（或恢复升级前的目录备份）→ 重启对应容器；数据库回滚仍需恢复备份 |

**不需要**：`pnpm install`、`pnpm build:api`（由容器负责），也不需要替换 Nginx 站点目录（网站是反向代理到容器）。
**别忘了**：若本次改了前端而只 `git pull` 不传 `dist`，前端容器会继续服务旧产物（`serve:*` 找不到新产物时返回 503，旧产物则表现为「页面还是旧版」）。
