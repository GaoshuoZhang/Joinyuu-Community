# 多仓部署

适用于当前独立仓库结构。以下命令按代码包脚本核对，不绑定某个 1Panel 菜单版本。1Panel 中分别创建 API、后台、移动 Web 的 Node 24 运行环境；也可使用自己的进程托管。生产配置与数据必须在代码更新之外持久保存。

## 准备代码与依赖

克隆协作仓，安装 pnpm 12.3.4，执行 `pnpm workspace:init`；按根仓 releases 清单检出各端目标 commit。若只部署单端，可直接克隆该业务仓。

三个运行环境的工作目录分别设为对应仓库根目录，不是协作仓根目录。分别运行 `pnpm install --frozen-lockfile`；构建需要 devDependencies，勿在构建前只安装生产依赖。小程序使用 npm ci，随后通过微信开发者工具构建与发布，不作为服务器 Node 服务部署。

## 后端配置与数据

以 `apps/api/.env.example` 为环境变量清单。生产必须设置 NODE_ENV=production、自己的 JWT_SECRET、DATABASE_URL、REDIS_URL、TZ=Asia/Shanghai，以及与真实代理层数一致的 TRUST_PROXY。数据库和 Redis 地址必须能从 API 容器访问，不能照抄宿主机的回环地址；明确配置容器网络。

PostgreSQL 与 Redis 需持久卷。项目自带 docker-compose.dev.yml 是本地开发配置，含演示密码与公开映射端口，不直接作为生产配置。已有本地 Compose 项目名为 api，不因目录或仓库更名创建一套空卷。

持久保存上传目录 UPLOAD_DIR、对象存储数据、许可证数据库记录、支付配置加密主密钥；默认主密钥在 API 工作目录 .private/wechatpay-config.key，可通过 PAYMENT_CONFIG_KEY_FILE 指定私有挂载路径。数据库与对应主密钥须一起备份，多实例共享同一主密钥。环境文件、密钥及客户数据不进入 Git。

## 首次启动

在 API 仓目录执行：

```sh
pnpm db:migrate
pnpm db:init
pnpm build
pnpm start
```

db:init 仅用于未初始化的数据库，写入基础配置和管理员；初始密码来自 INIT_ADMIN_PASSWORD，未配置时随机生成并仅打印一次。已有业务库升级不运行 db:init、db:seed 或 db:reset。start 会再次执行 migrate deploy，成功后启动 dist/main.js。默认 API 端口 7757。

## 两个 Web 服务

各自在仓目录执行 `pnpm build`，再以 `pnpm serve` 启动。后台默认 7758，移动 Web 默认 7759。server.mjs 服务本仓 dist 并支持 history 路由回退；PORT、HOST 控制监听，API_PROXY_TARGET 设置后端上游，默认 http://joinyuu-api:7757。该默认域名只有在网络中实际可解析时才可使用。

1Panel 或网关将各站点转发至对应 Web 服务，保持 /api 转发至同一后端。也可由网关直接服务 dist，并配置 SPA history 回退及 /api 代理。公网入口配置 HTTPS，数据库、Redis、对象存储管理端口保持内部访问。上传限制和代理超时需符合实际业务。

## 上线验收

检查 /api/health、两端首页与深链接、/api 代理、登录、权限、上传与后台配置。首次管理员登录后修改密码，导入客户许可证。短信、邮件、微信登录与支付分别配置真实服务凭据并单独验证；静态构建成功不代表供应商调用成功。

交易能力与真实收款前置见 [交易与支付](../features/commerce.md)，主题见 [主题规范](../features/mobile-theme.md)，授权见 [许可证](../features/license.md)。升级请执行 [升级与回滚](upgrade.md)。
