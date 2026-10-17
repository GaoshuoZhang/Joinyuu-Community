# 部署手册 · 使用 1Panel 上线聚屿社区

> 面向对象：**完全没有运维经验也能照着做完**的部署手册。按顺序照做即可，每一步都写清了「在哪里点、填什么、看到什么算成功」。
> 本手册的主线是 **三端（后端 + 管理端 + 移动端）全部跑在 1Panel「网站 → 运行环境 → Node.js」的容器里**：好处是宿主机可以不装 Node，以后更新只需「替换项目目录里的文件 + 重启对应容器」。静态网站方案降级为 [附录 16.6](#166-备选方案静态网站--nginx) 的备选方案。
> 配套文档：[后端升级手册](./backend-upgrade.md)、[许可证管理](./license-management.md)、[版本与更新日志规范](./versioning.md)、[后端开发 Wiki](./wiki-backend.md)。
> 环境变量模板：`apps/api/.env.example`（本手册[第 5 步](#7-第-5-步写后端配置-appsapienv)会逐字段解释）。

---

## 目录

1. [先看全貌：我们要搭出什么](#1-先看全貌我们要搭出什么)
2. [准备清单](#2-准备清单)
3. [第 1 步：安装 1Panel](#3-第-1-步安装-1panel)
4. [第 2 步：安装 PostgreSQL 与 Redis](#4-第-2-步安装-postgresql-与-redis)
5. [第 3 步：端口与安全组](#5-第-3-步端口与安全组)
6. [第 4 步：把代码放到服务器](#6-第-4-步把代码放到服务器)
7. [第 5 步：写后端配置 apps/api/.env](#7-第-5-步写后端配置-appsapienv)
8. [第 6 步：创建三个运行环境](#8-第-6-步创建三个运行环境)
9. [第 7 步：首次初始化数据库](#9-第-7-步首次初始化数据库)
10. [第 8 步：访问验证](#10-第-8-步访问验证)
11. [第 9 步：域名与 HTTPS](#11-第-9-步域名与-https)
12. [第 10 步：首登与业务初始化](#12-第-10-步首登与业务初始化)
13. [第 11 步：验收清单](#13-第-11-步验收清单)
14. [日常运维与版本更新](#14-日常运维与版本更新)
15. [排错表（实战踩过的坑）](#15-排错表实战踩过的坑)
16. [附录](#16-附录)

---

## 1. 先看全貌：我们要搭出什么

最终形态：**三个容器（后端 + 管理端 + 移动端）跑在 1Panel 的运行环境里，外加两个数据库/中间件容器**，前面再（可选地）套一层 Nginx 做域名与 HTTPS：

```
                           ┌──────────────── 服务器（一台 Linux） ────────────────┐
浏览器 / 手机                │                                                      │
  │                          │  ⑥（可选）1Panel 的 Nginx / OpenResty                  │
  │  方式B：域名访问           │      ├─ 网站 admin.你的域名：/api 前缀 → 127.0.0.1:7757│
  ├──────────────────────────┼──────┤                    其余 → 127.0.0.1:7758      │
  │  方式A：IP + 端口直连      │      └─ 网站 m.你的域名    ：/api 前缀 → 127.0.0.1:7757│
  │                          │                           其余 → 127.0.0.1:7759      │
  │                          │                       ↓                              │
  │                          │  1Panel「网站 → 运行环境 → Node.js」三个容器：            │
  │                          │      ① joinyuu-api     :7757   后端（start:api）       │
  │                          │      ② joinyuu-admin   :7758   管理端静态服务(serve:admin)│
  │                          │      ③ joinyuu-mobile  :7759   移动端静态服务(serve:mobile)│
  │                          │                       ↓                              │
  │                          │  1Panel 应用商店容器：                                 │
  │                          │      ④ PostgreSQL（容器名 postgresql，5432）            │
  │                          │      ⑤ Redis（容器名 redis，6379）                      │
  │                          │      ⑥ MinIO（可选，9000）                              │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

关键点（记住这几句话就够）：

1. **三个容器共享同一份挂载目录**（`/opt/joinyuu` → 容器内 `/app`），依赖只由 `joinyuu-api` 容器安装一份，所以**重启顺序永远先是 `joinyuu-api`，再是另外两个**。
2. **后端、数据库、Redis、两个前端容器都在同一个 Docker 网络里**，容器之间直接用**容器名**互相访问（实测容器内解析 `joinyuu-api` → `172.18.0.6`，`http://joinyuu-api:7757/api/health` 返回 200）。因此 `.env` 里写的是 `@postgresql`、`@redis`，不是 `127.0.0.1`。
3. **两个前端容器自带零依赖静态服务，并且内置 `/api` 前缀的反向代理**（默认转发到 `http://joinyuu-api:7757`）。所以「IP + 端口」直连也能正常调后端，不需要额外配置。
4. **三种访问方式**：方式 A 直接用 `http://<服务器IP>:7758` / `:7759`（零配置，但 7757/7758/7759 对公网开放）；方式 B 用域名 + Nginx「反向代理」站点（推荐上线形态）；两者可并存。
5. **宿主机不装 Node**：所有需要 pnpm 的命令都在**容器终端**里执行（见[第 7 步](#9-第-7-步首次初始化数据库)）。

---

## 2. 准备清单

| 序号 | 需要准备的东西 | 说明 / 建议 |
| --- | --- | --- |
| 1 | 一台 Linux 云服务器 | Ubuntu 22.04 / 24.04 或 Debian 12 最省心；建议 **2 核 4G 内存、40G 以上磁盘**（前端构建吃内存，1 核容易构建失败） |
| 2 | 服务器公网 IP | 在云厂商控制台能看到，形如 `123.45.67.89`。本手册统一写作 `<服务器IP>` |
| 3 | 域名（**可选**） | 只想先跑通、不追求 HTTPS，就**先用 IP 直连**（方式 A），域名可以以后再配。正式上线建议准备两个：`admin.你的域名`（管理后台）、`m.你的域名`（手机端），都解析到上面的公网 IP |
| 4 | 域名备案 | **仅中国内地服务器且使用域名时**需要，否则 80/443 会被拦截。纯 IP 访问不受此限制 |
| 5 | SSL 证书（**可选**） | 用域名时准备：可在云厂商申请免费证书，或稍后用 1Panel「网站 → 证书 → 申请」自动签发（需要能访问 80 端口） |
| 6 | 服务器 SSH 登录方式 | 云厂商控制台一般能直接「远程登录」，或用 FinalShell / Xshell / 系统自带 `ssh`。本手册示例 SSH 端口 `2002`，请换成你自己的 |
| 7 | 一份许可证文件 | 由供应商签发（`.license` 文件），部署完成后在[第 10 步](#12-第-10-步首登与业务初始化)导入。**没有它系统只能查看、不能写入业务数据**（详见[许可证管理](./license-management.md)） |
| 8 | 服务器上可用的 Docker | 1Panel 会自带管理 Docker。装完 1Panel 后无需单独装 Docker；用 `docker ps` 能列出容器即正常 |

**提前记好 6 个「等下要填」的信息**（边做边填，免得来回翻）：

| 要填的信息 | 举例 | 你实际的值 |
| --- | --- | --- |
| 服务器公网 IP | `123.45.67.89` | |
| 管理后台域名（可选） | `admin.example.com` | |
| 移动端域名（可选） | `m.example.com` | |
| 数据库（PostgreSQL）用户名 / 密码 | `joinyuu` / 自己设的强密码 | |
| Redis 密码 | 自己设的强密码 | |
| 许可证文件存放位置 | 供应商给的 `.license` | |

> 三个容器名固定建议用 `joinyuu-api` / `joinyuu-admin` / `joinyuu-mobile`，数据库容器名 `postgresql`、Redis 容器名 `redis`（1Panel 应用商店安装时不要改名，`.env` 里会用到）。

---

## 3. 第 1 步：安装 1Panel

**在哪里做**：服务器的 SSH 终端（云的「远程登录」窗口即可）。

1. 用 `root` 用户登录服务器，执行官方一键脚本：

```bash
bash -c "$(curl -sSL https://resource.fit2cloud.com/1panel/package/v2/quick_start.sh)"
```

2. 安装脚本会问你面板端口、安全入口、用户名、密码。**建议全部按它的默认值走，直接把最后打印出来的这一块抄下来保存**：

```
面板地址: http://<服务器IP>:xxxxx/xxxxxx
面板用户: xxxxxx
面板密码: xxxxxx
```

3. 浏览器打开上面那个「面板地址」→ 输入账号密码 → 进入 1Panel。本手册的界面以 **1Panel v2.3.2** 为准。

**看到什么算成功**：能看到 1Panel 的「概览」页面，顶部有 CPU、内存、磁盘等图表。

> 忘记面板地址 / 用户名 / 密码时，在服务器终端执行下面的命令可以重新查看：

```bash
1pctl user-info
```

**顺手做一件事**：左侧菜单找到「主机 → 终端」（不同版本位置略有差异，找不到就用菜单上方的搜索框搜「终端」），确认你能打开网页版终端——后面很多 docker 命令在这里执行很方便。

---

## 4. 第 2 步：安装 PostgreSQL 与 Redis

**在哪里做**：1Panel 左侧菜单「应用商店」。

### 4.1 安装 PostgreSQL（数据库，必装）

1. 应用商店 → 搜索框中输入 `PostgreSQL` → 点「安装」。
2. 在弹出的安装表单里填写：

| 字段 | 填什么 |
| --- | --- |
| 名称 | `postgresql`（**建议就用这个默认名，后面 `.env` 里要写它**） |
| 版本 | 选默认的 17 版本（与项目一致） |
| 端口 | `5432`（默认；若被占用改成 55432，后面 `.env` 也要跟着改） |
| 用户名 | `joinyuu`（建议与项目默认一致） |
| 密码 | **自己设一个强密码**（只用字母+数字最省事，记到第 2 步的表格里） |
| 数据库 | `joinyuu` |
| 允许远程连接 | **不要勾**（后端就在同一台机器，不需要远程连） |

3. 点「确认」，等待状态变成「已启动」（绿色）。

### 4.2 安装 Redis（缓存与会话，必装）

1. 应用商店 → 搜索 `Redis` → 点「安装」。
2. 表单里填：

| 字段 | 填什么 |
| --- | --- |
| 名称 | `redis`（**建议就用这个默认名**） |
| 端口 | `6379` |
| 密码 | **自己设一个强密码**（记到表格里） |
| 持久化 | 保持默认开启 |

3. 确认安装，等待状态变成「已启动」。

> **两个容器的名字很重要**：1Panel 会把应用商店里的应用跑成容器，容器名就是你上面填的名称。打开「容器 → 容器」，你应该能看到一个 `postgresql`、一个 `redis`。这三个（加上后面的 `joinyuu-api`）默认都在同一个 Docker 网络里，可以直接用容器名互相访问。

### 4.3 安装 MinIO（对象存储，可选但推荐）

**什么情况下需要**：网站上会有图片、合同、素材等文件。项目默认把文件存到服务器磁盘（够用、最简单）；若希望文件独立存放 / 便于扩容 / 多台服务器共享，就用 MinIO。

1. 应用商店 → 搜索 `MinIO` → 安装。
2. 表单里填：

| 字段 | 填什么 |
| --- | --- |
| 名称 | `minio` |
| 端口 | `9000`（API）、`9001`（控制台） |
| 用户名（AccessKey） | 自己设（记下来） |
| 密码（SecretKey） | **强密码**（记下来） |
| 存储路径 | 默认 |

3. 安装完成后，**不要**在云安全组 / 防火墙对外放行 9000/9001——只让服务器内部访问即可。

> 若暂时不确定要不要 MinIO：**先不装**，用默认磁盘存储也能正常上线；以后想切换，在管理后台「系统管理 → 系统配置 → 对象存储」里打开并填 Endpoint 即可（见[第 10 步](#12-第-10-步首登与业务初始化)）。

---

## 5. 第 3 步：端口与安全组

**在哪里做**：两个地方都要设：① 云厂商控制台的「安全组」；② 1Panel 左侧「系统 → 防火墙」。**两处都放行才通**。

| 端口 | 用途 | 是否对外放行 |
| --- | --- | --- |
| `80` | HTTP（申请证书、自动跳转到 HTTPS 用） | ✅ 放行 |
| `443` | HTTPS（正式访问） | ✅ 放行 |
| 面板端口（形如 `xxxxx`） | 登录 1Panel 面板 | ✅ 放行（也可只放行你自己的办公 IP，更安全） |
| `7757` | 后端 API 容器 | 仅「方式 A：IP 直连」时需要放行；走域名（方式 B）时**不要**放行 |
| `7758` | 管理端容器 | 仅「方式 A：IP 直连」时需要放行；走域名时**不要**放行 |
| `7759` | 移动端容器 | 仅「方式 A：IP 直连」时需要放行；走域名时**不要**放行 |
| `5432` | PostgreSQL | ❌ **不要放行** |
| `6379` | Redis | ❌ **不要放行** |
| `9000` / `9001` | MinIO | ❌ **不要放行**（需要时用 SSH 隧道临时看控制台） |

**操作**：1Panel →「系统 → 防火墙」→「端口规则」→「添加规则」，把 80、443（以及面板端口）加进去；同时到云厂商控制台的安全组里做同样的事。

> ⚠️ **关于运行环境的「端口外部访问」开关**：创建运行环境时，端口行的这个开关**实测默认是开启的**（= 绑定 `0.0.0.0`，对全网开放）。**推荐做法：三个运行环境都把它关掉**，对外一律由 Nginx（方式 B）或你自己决定是否临时放行（方式 A）。只有当你确定要用「IP + 端口直连」时，才把 7757/7758/7759 打开并同步放行安全组。

> 如果你只想先跑通、暂时用方式 A：那就放行 7757/7758/7759，并把三个运行环境的「端口外部访问」打开；等域名反代跑通后，再关掉它们并收回安全组规则。

---

## 6. 第 4 步：把代码放到服务器

**要放哪里**：统一放在 `/opt/joinyuu`（干净、好找、不占系统目录，且与运行环境的「项目目录」一致）。

**方式一（推荐）：用 Git 拉取**

在 1Panel 的终端里执行（逐行输入，每行回车）：

```bash
# 1) 创建目录并进入
mkdir -p /opt && cd /opt

# 2) 拉取代码（公开仓库可直接拉；私有仓库需要先在 GitHub 配置访问令牌或用 SSH key）
git clone https://github.com/GaoshuoZhang/Joinyuu-Community.git joinyuu

# 3) 进入项目目录
cd /opt/joinyuu

# 4) 记录当前版本号，升级/回滚时要对照
git rev-parse HEAD
```

**方式二：上传压缩包**

1. 在你自己电脑上把项目打包成 zip（**打包前删掉 `node_modules` 可以让它小很多**；`.git` 可留可删）。
2. 1Panel →「系统 → 文件」→ 进入 `/opt` → 点「上传」选文件 → 上传完成后右键压缩包 →「解压」。
3. 解压后确认目录结构是 `/opt/joinyuu/apps/api/...`（若解压出来多了一层，把里面的目录整体移到 `/opt/joinyuu`）。

**看到什么算成功**：终端里执行下面的命令，能看到 `apps`、`docs`、`package.json` 三样东西：

```bash
cd /opt/joinyuu && ls -l
```

> ⚠️ 如果服务器上没有 `git`，先装一下：
> Ubuntu/Debian：`apt update && apt install -y git`
> CentOS/RHEL：`yum install -y git`

---

## 7. 第 5 步：写后端配置 apps/api/.env

后端的全部配置都在这一个文件里。**本项目后端跑在容器里**，所以数据库 / Redis 的地址要写**容器名**，而不是 `127.0.0.1`。

**在哪里做**：1Panel →「系统 → 文件」→ 进入 `/opt/joinyuu/apps/api` → 找到 `.env.example`，**复制一份改名为 `.env`**（右键 → 复制 → 粘贴 → 重命名），然后双击 `.env` 打开编辑。

**照下面填写（★ 为必填，`<...>` 换成你自己的值）**：

```ini
# ---------- ★ 必填 ----------
# 固定写 production：只有它才会关闭「把短信/邮箱验证码回显到接口」等调试行为
NODE_ENV="production"

# PostgreSQL：主机写容器名 postgresql（就是第 2 步安装时填的名称）。
# 密码换成第 2 步设置的强密码；库名 joinyuu 一般不用改。
DATABASE_URL="postgresql://joinyuu:<数据库密码>@postgresql:5432/joinyuu?schema=public"

# Redis：注意密码前面有一个冒号（写错会报 NOAUTH Authentication required）
REDIS_URL="redis://:<Redis密码>@redis:6379"

# 后端签发登录凭证用的密钥。必须自己生成一串随机值，命令见下方
JWT_SECRET="把 openssl rand -hex 32 生成的字符串粘到这里"

# ---------- 服务与网络 ----------
PORT=7757
TZ="Asia/Shanghai"
# 走 Nginx 反向代理时保持 1（让审计日志与限流能拿到访客真实 IP）
TRUST_PROXY=1

# ---------- 文件存储 ----------
# 建议改到独立目录，升级/重装时不会丢。
# ⚠️ 改了这里必须在运行环境的「挂载」标签页把宿主机同路径挂进容器（见第 6 步）。
UPLOAD_DIR="/data/joinyuu/uploads"

# ---------- 可选：只在第 2 步装了 MinIO 时才填 ----------
# MINIO_ACCESS_KEY="你在 MinIO 里设的用户名"
# MINIO_SECRET_KEY="你在 MinIO 里设的密码"

# ---------- 可选：短信 / 邮件渠道凭据（需要真实收发时再填，见第 10 步） ----------
# ALIYUN_SMS_ACCESS_KEY_ID=""
# ALIYUN_SMS_ACCESS_KEY_SECRET=""
# TENCENT_SMS_SECRET_ID=""
# TENCENT_SMS_SECRET_KEY=""
# SMTP_USER=""
# SMTP_PASSWORD=""
```

**生成 JWT_SECRET**：在服务器终端执行下面这条，把输出的那串字符整行复制到上面：

```bash
openssl rand -hex 32
```

**五个容易写错的地方（务必自查）**：

| 容易错 | 正确写法 |
| --- | --- |
| **沿用模板里的 `@127.0.0.1`** | 后端在容器里，`127.0.0.1` 指的是容器自己。必须改成容器名 `@postgresql` / `@redis` |
| Redis 密码前漏掉冒号 | `redis://:<Redis密码>@redis:6379` |
| **`DATABASE_URL` 漏写库名**（只写到端口） | 必须写到库名：`…:5432/joinyuu?schema=public`。**漏写库名时 Prisma 不会报错，而是连到 PostgreSQL 的默认库 `postgres`**——表现为"1Panel 里能看到的 `joinyuu` 库是空的、表全在别处"，后续备份/恢复极易搞错库 |
| 密码里有 `@` `:` `/` 等符号没转义 | 密码只使用字母 + 数字，最省事 |
| `NODE_ENV` 写成 `development` 或没写 | 必须 `production`（否则验证码会被直接回显给接口，存在安全风险） |

> 自查库名是否写对（在 `joinyuu-api` 容器终端里执行，会打印后端**实际**连接的库与用户）：
>
> ```bash
> cd /app/apps/api && node -e "require('dotenv').config();const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\$queryRawUnsafe('select current_database() db, current_user usr').then(r=>console.log(r)).finally(()=>p.\$disconnect())"
> ```
>
> 输出的 `db` 应当就是你 `.env` 里写的库名（例如 `joinyuu`），而不是 `postgres`。


**关于 CORS**：**不需要配置**。因为管理端、移动端和后端在同一个域（Nginx 把 `/api` 前缀转给后端，或前端容器自带代理），浏览器同源，跨域规则不生效。`CORS_ORIGINS` 保持注释即可。

**容器形态下不需要改 `/etc/hosts`**：因为后端、迁移、初始化**全都在容器里执行**（`start:api` 在 `joinyuu-api` 容器内跑，`db:init` 也在容器终端里跑），容器内的 Docker DNS 本来就能解析 `postgresql` / `redis`。只有当你选择「在宿主机上装 Node、在宿主机执行 pnpm 命令」这条**可选路线**时，宿主机解析不到容器名，才需要补 hosts 映射（例如 `echo '127.0.0.1 postgresql' >> /etc/hosts`）。

**看到什么算成功**：`.env` 文件里 4 个必填项都不是占位符（没有 `CHANGE_ME`、没有 `你设的…`、没有 `<...>` 这类东西）。

---

## 8. 第 6 步：创建三个运行环境

「运行环境」本质是**容器**：1Panel 会把你的「项目目录」挂载进容器（宿主机 `/opt/joinyuu` → 容器内 `/app`），在里面用你选的包管理器装依赖、按你填的启动命令跑进程，再做端口映射。

**在哪里做**：1Panel →「网站 → 运行环境 → Node.js」→「创建运行环境」→ 从右侧滑出一个「创建」抽屉（底部有 **端口 / 环境变量 / 挂载 / 主机映射** 四个标签页）。

### 8.1 三个运行环境总表（照这个填）

| 运行环境（名称） | 项目目录 | 启动命令（下拉选） | 应用端口 | 端口外部访问 | 安装 node_modules |
| --- | --- | --- | --- | --- | --- |
| `joinyuu-api` | `/opt/joinyuu` | `start:api` | 7757 | **关闭** | **打开**（包管理器选 `pnpm`） |
| `joinyuu-admin` | `/opt/joinyuu` | `serve:admin` | 7758 | **关闭** | 关闭 |
| `joinyuu-mobile` | `/opt/joinyuu` | `serve:mobile` | 7759 | **关闭** | 关闭 |

- **项目目录一律填仓库根 `/opt/joinyuu`**（不要填 `/opt/joinyuu/apps/api`）：pnpm 的 `node_modules` 靠符号链接指向仓库根，只挂子目录会导致链接断掉、启动报「找不到模块」。
- **「安装 node_modules」只有 `joinyuu-api` 打开**：三个运行环境共享同一份挂载目录，依赖只需要一份；让 `joinyuu-api` 用 pnpm 装一遍（顺带为容器平台生成 Prisma 客户端），两个前端容器就不会重复安装、也不会互相覆盖。
- **「端口外部访问」建议三个都关闭**，对外访问交给 Nginx（方式 B）；若先用方式 A（IP 直连），请打开并按[第 3 步](#5-第-3-步端口与安全组)放行安全组。

### 8.2 创建抽屉的字段逐项说明

> 字段名与选项**按 1Panel v2.3.2 的实际界面核对过**（面板版本不同可能略有差异，含义一致）。

| 面板字段 | 填什么 | 为什么这么填 |
| --- | --- | --- |
| **名称** * | `joinyuu-api` / `joinyuu-admin` / `joinyuu-mobile` | 面板里显示的名字，三个都要不重名 |
| **应用** * | 左边选 `Node.js`；右边选 **20 或 22**（如 `22.22.2`） | 实测版本列表含 12/14/16/18/20/21/22/24/25；本项目要求 Node ≥ 20，**优先选 22 或 20 的 LTS**（默认高亮的是 25.9.0，属最新非 LTS，能用但不必冒险） |
| **项目目录** * | `/opt/joinyuu` | 三个运行环境都填同一个仓库根（见 8.1 说明）。可用右侧文件夹按钮选，也可直接输入 |
| **启动命令** * | 保持「自定义启动命令」开关**关闭**，直接在下拉里选（后端 `start:api`、前端 `serve:admin` / `serve:mobile`，详见 8.3） | 下拉项来自「项目目录」里 `package.json` 的 scripts；打开开关则改为手填命令 |
| **容器名称** * | `joinyuu-api` / `joinyuu-admin` / `joinyuu-mobile` | 容器的名字（1Panel「容器 → 容器」里能看到，`docker logs` 也用这个名字）。**`joinyuu-api` 的名字不要改**，前端容器的默认代理目标写死了它 |
| **备注** | `聚屿社区后端 API` / `管理端` / `移动端` | 选填 |
| **包管理器** * | `joinyuu-api` 选 `pnpm`；两个前端随便（不会被用到） | 实测可选 `npm` / `yarn` / `pnpm`，默认 `npm`。只有 `joinyuu-api` 会真正装依赖，必须选 `pnpm` |
| **安装 node_modules** | `joinyuu-api` **打开**；两个前端**关闭** | 三个容器共享同一份挂载目录里的 `node_modules`，只让 `joinyuu-api` 装一次 |
| **镜像源** * | 默认，或国内服务器选「淘宝 `registry.npmmirror.com`」 | 实测三选：默认 `registry.npmjs.org`、淘宝 `registry.npmmirror.com`、腾讯 `mirrors.cloud.tencent.com/mirror/npm/`。只有会装依赖的 `joinyuu-api` 受它影响 |

**底部四个标签页**（每行都要点「添加」才会出现一行，逐行填）：

| 标签页 | 怎么填 | 说明 |
| --- | --- | --- |
| **端口** | 添加一行：协议 `tcp`、**应用端口** 7757 / 7758 / 7759（按运行环境）、**外部映射端口** 填同一个值；右侧「**端口外部访问**」按 8.1 的取舍设置 | 实测该开关默认开启 = 绑定 `0.0.0.0`（对公网开放） |
| **环境变量** | `joinyuu-api` **留空**；两个前端一般也**留空** | 后端自己读挂载目录里的 `apps/api/.env`。前端容器的 `/api` 代理默认目标已是 `http://joinyuu-api:7757`，无需配置。**只有**想改代理目标时才加一行 `API_PROXY_TARGET`（见 8.4） |
| **挂载** | 仅当 `.env` 里 `UPLOAD_DIR` 指向仓库外目录时添加一行：**本机目录** `/data/joinyuu/uploads` → **容器目录** `/data/joinyuu/uploads`（权限「读写」） | 容器看不到宿主机目录；不挂载的话上传文件写进容器内部，**重启就丢**。`mobile-themes` 在项目目录内，随「项目目录」已挂载，无需另配。**只需给 `joinyuu-api` 配这一行** |
| **主机映射** | **留空** | 本项目用容器名连数据库，不需要往容器 `/etc/hosts` 写映射。（仅当改用「宿主机端口」连库时才需要 `host.docker.internal` → `172.17.0.1`） |

### 8.3 启动命令怎么选（关键）

仓库根 `package.json` 的脚本语义如下，**只有标注「常驻」的几个是用来让容器长期运行的**：

| 脚本 | 内容 | 用途 |
| --- | --- | --- |
| `start` | `pnpm --filter @joinyuu/api start` | 只启动，**不构建**（dist 不存在会报错） |
| `start:api` | `pnpm build:api` + `db:migrate` + `start` | **常驻**：先构建后端 → 应用数据库迁移 → 启动。宿主机免 Node 的关键 |
| `serve:admin` / `serve:mobile` | 零依赖静态服务脚本 | **常驻**：只服务**已构建**的 dist（dist 缺失返回 503） |
| `start:admin` / `start:mobile` | 构建 + 服务 | **常驻**：容器内先构建前端再服务（更省心，但每次重启都要构建、吃内存） |
| `build:api` / `build:admin` / `build:client-mobile` | 只构建 | ❌ **不要**用它们常驻（构建完进程就退出） |
| `db:migrate` / `db:init` | 迁移 / 初始化 | ❌ **不要**用它们常驻（跑完即退出，容器会反复重启） |
| `dev:api` / `dev:admin` / `dev:client-mobile` | 开发模式 | ❌ 生产不要用 |

**本项目推荐组合**：

- `joinyuu-api` → **`start:api`**（容器内自动构建 + 迁移 + 启动，宿主机不需要 Node，也不用手工传 dist）。
- `joinyuu-admin` → **`serve:admin`**（只服务已构建产物，快、省内存）。
- `joinyuu-mobile` → **`serve:mobile`**。

> **`serve:*` 与 `start:*` 的取舍**：`serve:*` 要求项目目录里**已经有 dist**（`dist/` 不在 Git 仓库里，必须自己上传，见[第 10 步](#10-第-8-步访问验证)与[日常运维](#14-日常运维与版本更新)），但重启很快；`start:*` 让容器每次启动自己构建，**完全不依赖宿主机 Node**，代价是重启慢（几十秒到一两分钟）且吃内存。二者都可以，看你更在意「重启快」还是「更新省事」。

> 面板自带的提示（打开「自定义启动命令」后可见）：「请填写完整的启动命令，例如：`npm run start`，**pm2 启动命令请换为 `pm2-runtime`**，否则会启动失败。」

### 8.4 前端容器内置的 `/api` 代理（了解即可）

两个前端容器用的都是仓库自带的零依赖静态服务脚本（[apps/admin/server.mjs](./../apps/admin/server.mjs)、[apps/client-mobile/server.mjs](./../apps/client-mobile/server.mjs)），能力等同 Nginx 静态托管：正确 MIME、`index.html` 不缓存、带哈希资源长缓存、移动端 history 路由兜底、路径穿越防护。

它会**把以 `/api` 开头的请求反向代理到后端**：默认目标 `http://joinyuu-api:7757`（容器网络内按容器名解析）；可在运行环境「环境变量」里设 `API_PROXY_TARGET` 改目标，**设为空字符串则关闭本代理**（此时必须靠 Nginx 反代，否则接口会落到静态服务上，登录会报「请求失败（405）」）。

**怎么确认它开着**：容器启动日志首行会打印一段类似下面的话——

```
[admin] 静态服务已启动：http://0.0.0.0:7758（目录 /app/apps/admin/dist；/api 代理 http://joinyuu-api:7757）
```

看到末尾是 `；/api 代理 http://joinyuu-api:7757`（而不是「已关闭」）就说明代理正常。

### 8.5 创建完怎么核对

点「确认」创建后，回到「运行环境 → Node.js」列表，逐行核对：

- 列表的列依次是「名称 / 项目目录 / **版本** / **外部映射端口** / **状态** / 日志 / 备注 / 时间 / 操作」；
- **「外部映射端口」列应分别显示 7757 / 7758 / 7759**；
- **「状态」应是「已启动」（绿色）**；
- 点该行的「日志」看有没有红色报错；`joinyuu-api` 首次启动会执行「安装依赖 + 构建 + 迁移」，**慢一些属正常**（日志里出现 `Ignored build scripts: @alicloud/openapi-core` 是 pnpm 拦截第三方构建脚本的提示，不影响运行；`Packages: -71` 之类的行是容器每次启动重新校准依赖，属预期）。

**顺手核对三端连通性**：在服务器终端执行——

```bash
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
docker exec -it joinyuu-api curl -s http://joinyuu-api:7757/api/health
```

第二条应返回一段 JSON。

---

## 9. 第 7 步：首次初始化数据库

这一步把**基础数据**写进空库：权限点、角色、超级管理员、系统配置、字典、规则、渠道模板、发号序列。**不含任何演示数据。**

**为什么这一步必须手动**：`start:api` 只会自动应用**数据库迁移**（建表），不会写入基础数据。表建好后若基础数据为空，后端启动自检会拒绝启动并报：

```
权限码目录校验失败，发现未登记权限码: /system/config @ ...
```

所以要在**首次部署时**手动跑一次 `db:init`。

### 9.1 在容器终端里执行（宿主机没有 Node，别在宿主机上跑）

**在哪里做**：1Panel →「容器 → 容器」→ 点 `joinyuu-api` → 右侧抽屉「终端」→ 命令选 `/bin/bash`（连不上就试 `/bin/sh`）→ 在终端里执行：

```bash
cd /app && pnpm --filter @joinyuu/api db:init
```

> ⚠️ **不要**在宿主机（1Panel 的「主机 → 终端」或 SSH）里执行任何 `pnpm` 命令——宿主机没装 Node，会立刻报：
> `/usr/bin/env: 'node': No such file or directory`

**默认会随机生成一个超级管理员密码并打印在屏幕上，只打印这一次**，请立刻抄下来：

```
[init] 超级管理员：admin / 社区管理员
[init] 初始密码：xxxxxxxxxxxx（仅本次打印，请立即登录并修改密码）
```

> 想自己指定初始密码：先在 `.env` 里加一行 `INIT_ADMIN_PASSWORD="你的密码"`，再执行上面的 `db:init`（执行完可以从 `.env` 里删掉这行）。

### 9.2 初始化完成后重启后端容器

1Panel →「网站 → 运行环境 → Node.js」→ 点 `joinyuu-api` 的「**重启**」→ 等状态回到「已启动」，日志里不再出现「权限码目录校验失败」。

### 9.3 ⚠️ 三条绝对不能执行的命令（会破坏数据）

| 命令 | 后果 |
| --- | --- |
| `pnpm db:seed` | 写入**整套演示数据**（演示用户、需求、活动、商城订单、审计日志…），只适合本地开发 |
| `pnpm db:reset` | **清空整个数据库**再重建，生产环境等于删库 |
| 把 `db:init` 挂进启动命令 | `db:init` 在已初始化的库上会**拒绝执行并退出（退出码 1）**，长期挂在启动命令里会导致容器反复重启失败。它只应手动跑一次 |

**看到什么算成功**：`db:init` 打印了一串「实体计数」，最后两行是超级管理员账号与初始密码。

**顺手检查一下数据库**：1Panel →「数据库 → PostgreSQL」→ 点 `joinyuu` → 「管理」→ 能看到一堆数据表（如 `User`、`CommunityEvent`、`AdminUser` 等）。

---

## 10. 第 8 步：访问验证

两种访问方式，**先用方式 A 跑通，再决定要不要上方式 B（域名）**。

### 10.1 方式 A：直接用 IP + 端口（零配置）

| 要访问 | 地址 | 说明 |
| --- | --- | --- |
| 管理后台 | `http://<服务器IP>:7758` | 页面与接口都由 `joinyuu-admin` 容器提供（容器内把 `/api` 前缀转给后端） |
| 移动端 | `http://<服务器IP>:7759` | 同上，由 `joinyuu-mobile` 容器提供 |

前提（二选一或都满足）：

- 三个运行环境的「端口外部访问」**打开**，且安全组/防火墙已放行 7757/7758/7759（见[第 3 步](#5-第-3-步端口与安全组)）；
- 或者保持「端口外部访问」关闭，改用方式 B。

**看到什么算成功**：浏览器打开 `http://<服务器IP>:7758` 能看到管理后台登录页；`:7759` 能看到移动端首页。

### 10.2 方式 B：域名 + Nginx 反向代理（推荐上线形态）

**在哪里做**：1Panel →「网站 → 网站」→「创建网站」。

> 如果弹出提示说 OpenResty（Nginx）未安装，点「确认安装」装上即可。

1. 网站类型选「**反向代理**」（注意：**不是**「静态网站」）。
2. 填写：

| 字段 | 管理端填 | 移动端填 |
| --- | --- | --- |
| 主域名 | `admin.你的域名` | `m.你的域名` |
| 代号 | `joinyuu-admin` | `joinyuu-mobile` |
| 启用 HTTPS | 先不勾（证书在[第 9 步](#11-第-9-步域名与-https)配，避免卡住） | 先不勾 |

3. 创建完成后，进入该网站的「反向代理」，添加**两条**代理规则，**顺序不能颠倒**：

| 顺序 | 匹配规则 | 代理地址（管理端） | 代理地址（移动端） | 说明 |
| --- | --- | --- | --- | --- |
| 1 | `/api` | `http://127.0.0.1:7757` | `http://127.0.0.1:7757` | **必须写在前面**（更精确的优先匹配），否则接口会被前端容器默认那条 `/` 规则吃掉 |
| 2 | `/` | `http://127.0.0.1:7758` | `http://127.0.0.1:7759` | 页面与静态资源 |

4. **提高上传体积上限（重要）**：Nginx 默认只允许 1MB 上传，而本系统默认允许 10MB（可在后台配置，最大 100MB）。进「网站配置」→ 编辑配置文件，在 `server { ... }` 段里加入一行（两个网站都加）：

```nginx
client_max_body_size 100m;
```

保存后 Nginx 会自动重载。

> ⚠️ 方式 B 生效后，可以把三个运行环境的「端口外部访问」关掉、并收回安全组里的 7757/7758/7759——对外只留 80/443 最安全。

### 10.3 自测与状态码对照

**最简单的一条自测**（在服务器终端执行）：

```bash
curl -s http://127.0.0.1:7757/api/health
```

**看到什么算成功**：返回一段 JSON（形如 `{"code":0,"data":{"version":"1.5.0",...}}`）。

**经域名 / 经端口自测**：浏览器直接打开 `http://admin.你的域名/api/health`（方式 B）或 `http://<服务器IP>:7758/api/health`（方式 A），同样应显示一段 JSON。

| 你看到的 | 含义 | 怎么办 |
| --- | --- | --- |
| 一段 JSON | 成功 | 继续下一步 |
| **404**（空响应体） | 反代规则顺序/路径不对；或请求落到了前端容器而容器内代理被关掉、且没有 Nginx 反代 | 检查代理规则是否为 `/api` 且排在 `/` 前面；检查前端容器日志是否打印「`/api` 代理 http://joinyuu-api:7757」 |
| **405**（登录时提示「请求失败（405）」） | `/api` 前缀的请求落到了前端**静态服务**（既没配 Nginx 反代，容器内代理又被 `API_PROXY_TARGET` 置空） | 见[排错表第 6 条](#15-排错表实战踩过的坑)；删掉该环境变量并重启容器，或改用方式 B |
| **502** | Nginx / 容器代理通了，但**后端没在运行** | 到「运行环境 → Node.js」看 `joinyuu-api` 状态与日志；90% 是 `.env` 写错、`JWT_SECRET` 缺失或 dist 不存在 |
| **503** | 前端**产物 dist 缺失**（静态服务返回 503 表示找不到 `index.html`） | 上传 dist，或把启动命令改成 `start:admin` / `start:mobile` |
| **一直转圈 / 超时** | 防火墙或安全组没放行 80/443，或域名解析没生效 | 检查[第 3 步](#5-第-3-步端口与安全组)与 DNS 解析（`ping admin.你的域名` 看解析到没） |

---

## 11. 第 9 步：域名与 HTTPS

**仅用方式 A（IP 直连）可跳过本步**，但正式上线强烈建议做。

**方式一：面板自动申请（推荐，免费）**

1. 1Panel →「网站 → 证书」→「申请证书」→ 填写你的域名（`admin.你的域名`、`m.你的域名`）→ 选择 ACME 账户（没有就按提示创建，邮箱随便填一个可用的）→ 提交。
2. 申请成功后，回到「网站」→ 点网站 →「网站配置」→ 勾选「启用 HTTPS」→ 选择刚签发的证书 → 保存。
3. 建议同时打开「HTTP 自动跳转到 HTTPS」。

**方式二：上传已有证书**

1. 1Panel →「网站 → 证书」→「上传证书」→ 把云厂商下载的 `.crt/.pem`（证书内容）与 `.key`（私钥）分别粘贴进去 → 保存。
2. 再按上面的方式在网站里启用 HTTPS。

**看到什么算成功**：浏览器地址栏出现小锁图标，`https://admin.你的域名` 与 `https://m.你的域名` 都不再提示「不安全」。

> 证书一般 90 天到期。面板签发的证书会自动续签；自己上传的证书到期前记得换新。

---

## 12. 第 10 步：首登与业务初始化

### 12.1 登录并改密码

1. 打开管理后台（`https://admin.你的域名` 或 `http://<服务器IP>:7758`）。
2. 用户名 `admin`，密码用[第 7 步](#9-第-7-步首次初始化数据库)打印出来的初始密码（要输入页面上的图形验证码）。
3. 登录后立刻：右上角头像 →「修改密码」→ 换成你自己的强密码。

### 12.2 导入许可证（⚠️ 必做，否则系统只读）

系统的所有「写入类」操作都受许可证控制：没有导入许可证时，只能查看/导出，不能新增活动、审核申请、发布需求等。

1. 在管理后台进入「系统管理 → 系统配置 → 基础设置 → 许可证管理」。
2. 点「生成申请文件」，下载 `license-request-xxxx.json`，发给供应商签发。
3. 收到 `.license` 文件后，在同一页面点「导入许可证」上传。
4. 状态显示为**有效**即可（到期时间按北京时间展示）。

> 详细规则见[许可证管理](./license-management.md)。

### 12.3 按需完成的初始化配置

| 位置 | 做什么 |
| --- | --- |
| 系统管理 → 系统配置 → 基础设置 | 站点名称、Slogan、各业务开关（注册/商城/需求/预约/首页轮播）；若要启用 MinIO：打开「对象存储」开关，填 Endpoint `127.0.0.1`、端口 `9000`、Bucket（如 `joinyuu`）、不使用 TLS（密钥已由 `.env` 注入，页面只显示「已配置」） |
| 系统管理 → 系统配置 → 通知渠道配置 | 需要真实发短信/邮件时：先在 `.env` 里注入渠道凭据（见下方 ini 块），再把渠道的凭据来源设为「环境变量」并点「测试发送」验证 |
| 系统管理 → 系统配置 → 移动端主题 | 上传/切换客户主题包（可选） |
| 系统管理 → 角色与账号 | 创建运营、审核等子账号并分配角色（**不要**再使用演示密码 `admin123`） |
| 系统管理 → 素材库 | 查看与管理已上传的图片、合同附件 |
| 系统管理 → 日志与审计 | 查看登录日志与操作审计 |
| 规则管理 | 积分规则、经验规则、等级梯度、发布限制（新库默认发布不限制，可按运营策略收紧） |

**短信 / 邮件凭据示例**（写进 `/opt/joinyuu/apps/api/.env` → **重启 `joinyuu-api` 容器**才生效）：

```ini
ALIYUN_SMS_ACCESS_KEY_ID="你的 AccessKeyId"
ALIYUN_SMS_ACCESS_KEY_SECRET="你的 AccessKeySecret"
TENCENT_SMS_SECRET_ID="你的 SecretId"
TENCENT_SMS_SECRET_KEY="你的 SecretKey"
SMTP_USER="你的邮箱账号"
SMTP_PASSWORD="邮箱授权码"
```

> `.env` 里的变量名要与后台渠道里登记的变量名一致（种子渠道默认已登记阿里云短信与 SMTP 的这几个名字）。改完 `.env` **必须重启 `joinyuu-api`** 才生效。

**腾讯云短信渠道的配置要点**（改用腾讯云发短信时）：

1. `.env` 注入凭据（变量名与渠道登记保持一致）：`TENCENT_SMS_SECRET_ID` / `TENCENT_SMS_SECRET_KEY`。
2. 在「通知渠道配置」里把该通知类型的供应商切换为「腾讯云短信」，并照**腾讯云控制台已审批**的内容填写：`SmsSdkAppId`（应用管理里的 SdkAppId）、签名内容（填**签名文字本身，不是签名 ID**）、模板映射（我方模板 code → 腾讯模板 ID）；必要时填 `templateParamOrder`——腾讯模板变量是**位置参数**（`{1}`、`{2}`…），顺序与腾讯模板不一致会报参数不匹配。
3. 三条最容易踩的接口约束（摘自腾讯云 SendSms 文档）：
   - 模板参数**个数**必须与已审批模板完全一致，否则报 `FailedOperation.TemplateParamSetNotMatchApprovedTemplate`；
   - 2024-01-25 之后开通的新账号，单个模板变量默认**最长 6 个字符**，且**验证码类模板的变量只能是 0–6 位纯数字**（「几分钟内有效」这类文案建议直接写死在腾讯模板里）；
   - 国内短信的签名是必填项，必须填已审批通过的**签名内容**。
4. 发送失败时，错误文案里会带上**腾讯云错误码与 RequestId**（如 `FailedOperation.SignatureIncorrectOrUnapproved（RequestId：…）`），可直接把 RequestId 提供给腾讯云提工单。

> 重试口径：限流类（`LimitExceeded.*`）与系统类（`InternalError.*`）失败会进入自动重试；参数 / 权限 / 模板 / 号码类失败（`InvalidParameterValue.*`、`UnauthorizedOperation.*`、`UnsupportedOperation.*`、`FailedOperation.*` 等）判为**不可重试**——看到这类失败请按错误码先修配置，等重试无用（详见消息发送记录里的失败原因）。

---

## 13. 第 11 步：验收清单

部署完成后，把下面每一条都点一遍，全部通过才算上线成功：

| # | 检查项 | 怎么做 | 期望结果 |
| --- | --- | --- | --- |
| 1 | 后端存活 | `curl http://127.0.0.1:7757/api/health` | 返回 JSON，且 `data.version` 有值 |
| 2 | 接口经域名/端口可达 | 浏览器打开 `https://admin.你的域名/api/health` 或 `http://<服务器IP>:7758/api/health` | 返回 JSON |
| 3 | 管理后台可登录 | 打开后台，用新密码登录 | 进入工作台 |
| 4 | 移动端可打开 | 打开 `https://m.你的域名` 或 `http://<服务器IP>:7759` | 显示首页，可登录（用你自己注册的账号） |
| 5 | 移动端刷新不 404 | 登录后进入「我的」，按 F5 刷新 | 页面正常，不报 404（history 路由兜底生效） |
| 6 | 许可证有效 | 系统管理 → 系统配置 → 基础设置 → 许可证管理 | 状态「有效」，可写入业务数据 |
| 7 | 图片上传正常 | 系统管理 → 素材库，上传一张 5MB 图片 | 上传成功且能预览（验证 Nginx 100m 与 `UPLOAD_DIR` 挂载都对） |
| 8 | 数据库连接正常 | 后台任意列表能加载数据 | 有数据（空列表也算通过，不能报错） |
| 9 | 时间正确 | 查看任意列表的「创建时间」 | 与北京时间一致（时分正确） |
| 10 | 访客真实 IP | 系统管理 → 日志与审计 → 登录日志，看 IP 列 | 是你自己的公网 IP，不是 `127.0.0.1` |
| 11 | 定时任务在跑 | 做一次可观察的验证：新建一个「定时发布」的需求（设为 1–2 分钟后发布），到点后刷新列表 | 状态自动从「定时发布」变为「已发布」（也可在后端日志里看到调度输出） |
| 12 | **三端版本号一致** | 对比后台「系统管理 → 关于 → 版本信息」（管理后台 + 服务端）、移动端「我的 → 关于」、`/api/health` | 三处显示同一版本号（如 `v1.5.0`），见[版本与更新日志规范](./versioning.md) |
| 13 | 重启后自愈 | 服务器执行 `reboot`，等 2 分钟 | 三个容器与数据库、Redis 全部自动恢复，网站可访问 |
| 14 | 更新流程可复现 | 按[日常运维](#14-日常运维与版本更新)走一遍更新（git pull + 上传 dist + 重启） | 版本号升级、强刷后页面为新版 |

---

## 14. 日常运维与版本更新

### 14.1 备份（强烈建议设成每天自动执行）

**要备份三样东西**：数据库、上传的文件/主题包、代码版本号。

**用 1Panel 做数据库定时备份（推荐）**：

1. 1Panel →「数据库 → PostgreSQL」→ 点 `joinyuu` →「备份」，点一次「立即备份」验证可用。
2. 1Panel →「计划任务」→「创建任务」→ 类型选「备份数据库」→ 目标选 `joinyuu` → 周期选「每天」→ 时间选凌晨 3 点 → 保留份数 7 → 保存。
3. 备份文件默认落在 1Panel 的备份目录，可在「计划任务 → 备份」里查看与下载。

**手工备份命令**（等效，随时可用；数据库在容器里，所以用 `docker exec`）：

```bash
# 0) 先确保备份目录存在
mkdir -p /data/joinyuu/backup

# 1) 数据库导出（把密码换成你的）
docker exec -e PGPASSWORD='你的数据库密码' postgresql \
  pg_dump -U joinyuu -d joinyuu -Fc > /data/joinyuu/backup/db-$(date +%F).dump

# 2) 上传文件与主题包打包
tar -czf /data/joinyuu/backup/uploads-$(date +%F).tar.gz -C /data/joinyuu uploads
tar -czf /data/joinyuu/backup/themes-$(date +%F).tar.gz  -C /opt/joinyuu/apps/api mobile-themes 2>/dev/null || true

# 3) 记录当前代码版本
cd /opt/joinyuu && git rev-parse HEAD >> /data/joinyuu/backup/versions.log
```

**恢复数据库**（导出成纯文本 SQL 时用 `psql`，用上面 `-Fc` 的自定义格式时改用 `pg_restore`）：

```bash
# 纯文本 SQL：db-2026-10-17.sql
docker exec -i -e PGPASSWORD='你的数据库密码' postgresql psql -U joinyuu -d joinyuu < /data/joinyuu/backup/db-2026-10-17.sql

# 自定义格式（-Fc）：需先建空库再用 pg_restore
docker exec -i -e PGPASSWORD='你的数据库密码' postgresql pg_restore -U joinyuu -d joinyuu --clean < /data/joinyuu/backup/db-2026-10-17.dump
```

> ⚠️ **含破坏性迁移（删列、改表名、清洗数据）的版本，重启容器前必须先备份**——迁移由 `start:api` 自动应用，一旦重启就会执行，且往往不可逆。

### 14.2 看日志：出问题先看这三处

| 要看什么 | 在哪里看 |
| --- | --- |
| 三个容器的运行日志 | 1Panel「网站 → 运行环境 → Node.js」→ 该环境的「日志」列；或终端 `docker logs --tail 200 joinyuu-api`（换成 `joinyuu-admin` / `joinyuu-mobile`） |
| Web 访问日志 | 1Panel「网站」→ 点网站 →「日志」（方式 B 才有） |
| 数据库日志 | 1Panel「数据库 → PostgreSQL」→ 该库的「日志」（或应用商店 → 已安装 → PostgreSQL → 日志） |
| 业务审计日志 | 管理后台「系统管理 → 日志与审计」 |

### 14.3 重启顺序（一定按这个顺序）

因为三个容器共享同一份 `node_modules`，**依赖由 `joinyuu-api` 负责安装**：

```text
1) 先重启 joinyuu-api   （它会重新安装依赖 + 构建 + 迁移）
2) 再重启 joinyuu-admin
3) 最后重启 joinyuu-mobile
```

只有数据库 / Redis 也异常时，才用 1Panel「应用商店 → 已安装」里的「重启」按钮。

### 14.4 版本更新流程（这套方案的核心收益）

```text
1) 替换项目目录文件：
   - 后端/源码：cd /opt/joinyuu && git pull
   - 前端产物：上传新的 apps/admin/dist、apps/client-mobile/dist（dist 不在 Git 仓库里，必须单独上传）
2) 后端无需手动迁移：joinyuu-api 的启动命令 start:api 内部会自动跑迁移
   （仅首次部署需要手动执行一次 db:init）
3) 1Panel「网站 → 运行环境 → Node.js」：先重启 joinyuu-api，再重启 joinyuu-admin / joinyuu-mobile
4) 浏览器强制刷新（Ctrl+F5）后核对：后台「关于」页、移动端「关于」页、/api/health 三处版本号一致
```

**前端 dist 的两种上传方式**：

1. 1Panel「系统 → 文件」→ 进入 `/opt/joinyuu/apps/admin` → 上传 `dist` 压缩包并解压（覆盖同名目录）；移动端同理进 `apps/client-mobile`。
2. 用 scp 直接推送（把密钥路径、端口换成你自己的；本手册示例 SSH 端口 `2002`）：

```bash
scp -i "C:\Users\<你>\.ssh\<你的密钥>" -P 2002 -o IdentitiesOnly=yes -r \
  "d:\Projects\Joinyuu-Community\apps\admin\dist" root@<服务器IP>:/opt/joinyuu/apps/admin/
scp -i "C:\Users\<你>\.ssh\<你的密钥>" -P 2002 -o IdentitiesOnly=yes -r \
  "d:\Projects\Joinyuu-Community\apps\client-mobile\dist" root@<服务器IP>:/opt/joinyuu/apps/client-mobile/
```

> 上传 dist 后**静态服务无需重启**（它按请求读文件），浏览器强制刷新即可看到新版；但如果端口 / 环境变量有变化，仍要重启对应容器。

**更新相关的常见现象**：

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 页面还是旧版 | 未替换 dist，或容器未重启 | 覆盖 dist → 重启对应容器 → 强制刷新（Ctrl+F5） |
| 直接访问前端容器返回 503 | dist 缺失（前端产物没上传） | 上传 dist，或把启动命令改成 `start:admin` / `start:mobile` |
| 以 `/api` 开头的请求返回 404 且响应体是 JSON 包络 | 代理规则顺序错，请求落到了前端容器 | 把 `/api` 规则调到 `/` 之前 |

> 更完整的升级步骤（含破坏性迁移的处理、回滚方法）见[后端升级手册](./backend-upgrade.md)。

---

## 15. 排错表（实战踩过的坑）

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| 在宿主机（SSH / 主机终端）执行任何 pnpm 脚本，报 `/usr/bin/env: 'node': No such file or directory` | 宿主机**没装 Node**（这正是容器形态的既定前提） | 改在**容器终端**执行：1Panel「容器 → 容器」→ 点 `joinyuu-api` →「终端」→ 命令 `/bin/bash` → `cd /app && pnpm --filter @joinyuu/api <脚本>`。若确实想在宿主机用，就装 Node：`curl -fsSL https://deb.nodesource.com/setup_22.x \| bash - && apt install -y nodejs && corepack enable`，并在 `/etc/hosts` 里给容器名加映射 |
| 外网访问 `http://<服务器IP>:7758` / `:7759` 提示「无法访问此网站」或返回 503 | 前端产物 `dist` 缺失（静态服务找不到 `index.html` 就返回 503） | 上传 dist（scp 或 1Panel 文件管理），或把启动命令改成 `start:admin` / `start:mobile`。查证：`docker logs --tail 20 joinyuu-admin`（日志会打印服务目录），再看 `ls -l /opt/joinyuu/apps/admin/dist/index.html` |
| 后端容器报 `Cannot find module '/app/apps/api/dist/main.js'` | 启动命令选了 `start`（只启动、**不构建**），dist 还没生成 | 把 `joinyuu-api` 的启动命令改成 `start:api`（构建 + 迁移 + 启动），重启容器 |
| 后端报 `The table public.AdminPermission does not exist in the current database` | 数据库迁移没成功执行 | 迁移已由 `start:api` 自动应用；仍报此项说明迁移段失败，检查容器日志里 `db:migrate` 那一段的报错（多半是 `.env` 的 `DATABASE_URL` 连不上或密码错） |
| 1Panel 里能看到 `joinyuu` 库，但**里面一张表都没有**；应用却跑得好好的 | `DATABASE_URL` 漏写了库名，Prisma 连到了默认库 `postgres` | 把 `DATABASE_URL` 补成 `…:5432/joinyuu?schema=public`，重启 `joinyuu-api` 让迁移在正确库里建表（全新部署可在补库名后执行一次 `db:init`）；用上一节的一行命令确认后端实际连接的库 |
| 后端报 `权限码目录校验失败，发现未登记权限码: /system/config @ ...`（自检拒绝启动） | 表已建好，但**基础数据没写入** | 进 `joinyuu-api` 容器终端跑一次 `cd /app && pnpm --filter @joinyuu/api db:init`，记下超管密码，然后重启容器。⚠️ **不要**把 `db:init` 并进启动命令——已初始化即拒绝并退出 1，会导致容器反复重启失败 |
| 用 IP 访问时登录报「请求失败（405）」 | 以 `/api` 开头的请求落到了前端**静态服务**（既没配 Nginx 反代，容器内代理又被 `API_PROXY_TARGET` 置空） | 检查容器日志首行是否打印「`/api` 代理 http://joinyuu-api:7757」；没有就说明 `API_PROXY_TARGET` 被设成了空值——删掉该环境变量并重启容器，或改用方式 B（域名 + Nginx 反代） |
| 更新了源码，但页面还是旧版 | `dist/` 不在 Git 仓库里（`.gitignore` 已忽略），`git pull` 不会带来前端产物 | 更新前端**必须**同时上传 `apps/*/dist`，否则 `serve:*` 返回 503 或页面仍旧版 |
| 两个前端容器启动报「找不到模块」，或后端报 Prisma 引擎错误 | 三个容器共享同一挂载目录里的 `node_modules`，依赖应由 `joinyuu-api` 容器负责安装 | 核对「安装 node_modules」只有 `joinyuu-api` 打开（包管理器选 `pnpm`），且「项目目录」是仓库根 `/opt/joinyuu`；然后按**先 `joinyuu-api`、再两个前端**的顺序重启 |
| 日志里出现 `Ignored build scripts: @alicloud/openapi-core`；或出现 `Packages: -71` 这类行 | 前者是 pnpm 默认拦截第三方构建脚本的提示；后者是容器每次启动重新校准依赖 | **均属预期，不影响运行**，只影响重启速度，无需处理 |

---

## 16. 附录

### 16.1 端口一览

| 端口 | 服务 | 对外 | 说明 |
| --- | --- | --- | --- |
| 80 | Nginx(OpenResty) | ✅ | HTTP，用于证书签发与跳转 |
| 443 | Nginx(OpenResty) | ✅ | HTTPS 正式访问 |
| 面板端口 | 1Panel | ✅（可限 IP） | 管理面板 |
| 7757 | 后端 API 容器 `joinyuu-api` | 方式 B ❌ / 方式 A ✅ | 仅容器网络与 Nginx 访问 |
| 7758 | 管理端容器 `joinyuu-admin` | 方式 B ❌ / 方式 A ✅ | Nginx 反代 `/` 指向它 |
| 7759 | 移动端容器 `joinyuu-mobile` | 方式 B ❌ / 方式 A ✅ | Nginx 反代 `/` 指向它 |
| 5432 | PostgreSQL 容器 `postgresql` | ❌ | 仅容器网络访问 |
| 6379 | Redis 容器 `redis` | ❌ | 仅容器网络访问 |
| 9000 / 9001 | MinIO API / 控制台 | ❌ | 需要时用 SSH 隧道临时查看 |

### 16.2 关键目录一览

| 路径 | 内容 | 升级时 |
| --- | --- | --- |
| `/opt/joinyuu`（容器内 `/app`） | 项目代码（三个运行环境共享的挂载目录） | 需要更新（`git pull` + 上传 `apps/*/dist`） |
| `/opt/joinyuu/apps/api/dist` | 后端构建产物（`start:api` 会在容器内重新构建） | 重新构建（自动） |
| `/opt/joinyuu/apps/admin/dist`、`/opt/joinyuu/apps/client-mobile/dist` | 两个前端产物（不在 Git 仓库里） | ⚠️ **必须手动上传替换** |
| `/data/joinyuu/uploads`（或默认 `apps/api/uploads`） | 用户上传的图片/合同 | ⚠️ **必须保留，不要删** |
| `/opt/joinyuu/apps/api/mobile-themes` | 已安装的移动端主题包 | ⚠️ **必须保留，不要删** |
| `/data/joinyuu/backup` | 备份文件 | 保留 |

### 16.3 环境变量速查（详见 `apps/api/.env.example`）

| 变量 | 必填 | 作用 | 容器形态下的写法 |
| --- | --- | --- | --- |
| `NODE_ENV` | ✅ | 固定 `production` | `"production"` |
| `DATABASE_URL` | ✅ | PostgreSQL 连接串 | `postgresql://joinyuu:密码@postgresql:5432/joinyuu?schema=public` |
| `REDIS_URL` | ✅ | Redis 连接串（**密码前有冒号**） | `redis://:密码@redis:6379` |
| `JWT_SECRET` | ✅ | 登录凭证密钥（`openssl rand -hex 32`） | 粘贴生成的字符串 |
| `INIT_ADMIN_PASSWORD` | 否 | 仅 `db:init` 使用，指定超管初始密码 | 用完可删 |
| `PORT` | 否 | 后端端口，默认 7757 | `7757` |
| `TZ` | 否 | 固定 `Asia/Shanghai` | `"Asia/Shanghai"` |
| `TRUST_PROXY` | 否 | 反向代理层数，走 Nginx 填 1 | `1` |
| `CORS_ORIGINS` | 否 | 同源部署**不用配**；只有跨域访问才需要 | 保持注释 |
| `UPLOAD_DIR` | 否 | 上传文件目录（改了要同步配「挂载」） | `"/data/joinyuu/uploads"` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | 否 | MinIO 密钥（Endpoint/Bucket 在后台配置） | 装了 MinIO 才填 |
| `ALIYUN_SMS_*` / `TENCENT_SMS_*` / `SMTP_*` | 否 | 短信/邮件渠道凭据 | 需要真实收发时填 |
| `AUTH_REVOCATION_FAIL_OPEN` | 否 | 仅在 Redis 故障排障时临时设为 1 | 保持注释 |
| `API_PROXY_TARGET`（**前端容器**） | 否 | 前端容器内置代理的目标 | 缺省 `http://joinyuu-api:7757`；置空字符串则关闭 |

### 16.4 命令速查

| 目的 | 命令 | 在哪里执行 |
| --- | --- | --- |
| 应用数据库迁移 | `cd /app && pnpm --filter @joinyuu/api db:migrate` | `joinyuu-api` 容器终端 |
| 写入基础配置（仅首次） | `cd /app && pnpm --filter @joinyuu/api db:init` | `joinyuu-api` 容器终端 |
| 构建后端 | `cd /app && pnpm build:api` | `joinyuu-api` 容器终端 |
| 构建管理端 / 移动端 | `pnpm build:admin` / `pnpm build:client-mobile` | 你自己电脑（已装 Node），产物再上传 |
| 健康检查 | `curl -s http://127.0.0.1:7757/api/health` | 服务器终端（宿主机） |
| 容器内健康检查 | `docker exec -it joinyuu-api curl -s http://joinyuu-api:7757/api/health` | 服务器终端 |
| 看容器状态 | `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` | 服务器终端 |
| 看某容器日志 | `docker logs --tail 200 joinyuu-api` | 服务器终端 |

### 16.5 1Panel 常用 CLI 小抄

| 目的 | 命令 |
| --- | --- |
| 查看面板地址/用户/密码 | `1pctl user-info` |
| 查看面板服务状态 | `1pctl status` |
| 重启面板 | `1pctl restart` |
| 停止 / 启动面板 | `1pctl stop` / `1pctl start` |
| 升级面板 | `1pctl update` |

> 不同 1Panel 版本的子命令可能略有差异，以服务器上 `1pctl --help` 的输出为准。

### 16.6 备选方案：静态网站 + Nginx

若不想让前端也占一个常驻容器，可以让**两个前端改由 Nginx 直接发文件**，只有后端跑容器。两者可以混用（后端仍用 `joinyuu-api` 运行环境）：

1. **构建并归拢产物**（在你自己电脑构建，或临时用 `start:admin` 让容器构建一次后拷出）：

```bash
cd /opt/joinyuu
mkdir -p /data/joinyuu/sites/admin /data/joinyuu/sites/mobile
cp -r /opt/joinyuu/apps/admin/dist/. /data/joinyuu/sites/admin/
cp -r /opt/joinyuu/apps/client-mobile/dist/. /data/joinyuu/sites/mobile/
chown -R root:root /data/joinyuu/sites
chmod -R 755 /data/joinyuu/sites
```

2. **创建两个「静态网站」**（1Panel →「网站 → 网站」→「创建网站」→ 类型选「静态网站」）：

| 字段 | 管理后台网站 | 移动端网站 |
| --- | --- | --- |
| 主域名 | `admin.你的域名` | `m.你的域名` |
| 代号 | `joinyuu-admin` | `joinyuu-mobile` |
| 网站目录 | `/data/joinyuu/sites/admin` | `/data/joinyuu/sites/mobile` |

3. **各加一条 `/api` 反向代理**：`/api` → `http://127.0.0.1:7757`（做法同[第 8 步方式 B](#102-方式-b域名--nginx-反向代理推荐上线形态)）。
4. **移动端加 SPA 兜底**（在网站配置的 `server { ... }` 里，否则刷新任意页面 404）：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

5. **两个网站都加** `client_max_body_size 100m;`。

**与主线方案的对照**：

| 对比项 | 主线：前端也跑容器（`serve:admin` / `serve:mobile`） | 备选：静态网站 + Nginx |
| --- | --- | --- |
| 更新方式 | 替换 `apps/*/dist`，或重启容器 | 替换 `/data/joinyuu/sites/*` 里的文件 |
| 多占内存 | 多两个常驻进程（每端约 60–120MB） | 无 |
| 请求链路 | Nginx → 容器内 Node → 文件 | Nginx → 文件（少一跳） |
| `/api` 代理 | 前端容器可自带（IP 直连也能用） | 必须由 Nginx 配 `/api` 反代 |
| 移动端刷新兜底 | 服务脚本内置 | 需手写 `try_files` |
| 适合场景 | 想在面板里统一管理、更新只点重启 | 追求最低成本、最简链路 |

---

> 升级已有部署请看[后端升级手册](./backend-upgrade.md)。
