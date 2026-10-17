# 更新日志 · 后端服务（apps/api）

> 三端锁步发布，版本号唯一来源为 [apps/api/package.json](./package.json) 的 `version`；版本规则与发布流程见 [docs/versioning.md](../../docs/versioning.md)。
> 本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 变更

- 仓库根 `package.json` 新增 `start` 脚本（`pnpm --filter @joinyuu/api start`）：1Panel「运行环境 → 启动命令」下拉可直接选 `start`，执行时 pnpm 自动把工作目录切到 `apps/api`，`.env` 可正常读取，无需在面板里额外配置环境变量。
- 新增 `start:api`（= `pnpm build:api && pnpm --filter @joinyuu/api db:migrate && pnpm --filter @joinyuu/api start`）：供 1Panel 运行环境容器使用，容器内**先构建、再自动应用数据库迁移、最后启动**，宿主机无需安装 Node、也不用手工上传 `apps/api/dist` 或手动跑迁移；`start` 保持「只启动不构建」语义（systemd / 已构建产物的场景继续用它）。首次部署的空库仍需手动执行一次 `db:init`（写入基础配置并打印超管初始密码）。

### 修复

- **短信参数集改为「只传模板正文实际引用的变量」**：此前验证码通知固定携带 `code` + `minutes` 两个变量，腾讯/阿里模板按**位置**传参、变量个数由已审批模板决定，多传即报 `FailedOperation.TemplateParamSetNotMatchApprovedTemplate`（腾讯云）等「参数与模板不匹配」错误。现在发送端与渠道「测试发送」都会按模板正文（其次主题）里 `{{变量}}` 的出现顺序取子集（新增 `MessageRenderService.pickUsed`），正文写几个变量就发几个参数；参数顺序缺省沿用正文出现顺序，需要时仍可用渠道「模板参数顺序」覆盖（`templateParamOrder` 的缺省由「按变量名排序」改为「保持传入顺序」）。⚠️ 模板正文必须用双花括号 `{{code}}`。
- **腾讯云短信失败重试口径修正**（对齐腾讯云 SendSms 官方错误码表）：改为按错误码命名空间前缀判定——`LimitExceeded.*`（限流）、`InternalError.*`（系统侧）、`FailedOperation.SendAndRecvFail` 可重试；参数 / 权限 / 模板 / 号码类（`InvalidParameterValue.*`、`UnauthorizedOperation.*`、`UnsupportedOperation.*`、`FailedOperation.*`）不可重试。此前 SDK 层异常一律标记为可重试、单号失败又因等值比较（旧写法比较不带命名空间的 `LimitExceeded`）永远判为不可重试，两个方向都不对；无法识别错误码（多为网络/超时）仍按可重试处理。
- **短信失败文案带上腾讯云错误码与 RequestId**：便于运维凭 RequestId 向腾讯云提工单（官方文档要求提供）；新增 `sms.providers.spec.ts` 覆盖错误码提取、重试判定与 RequestId 拼接。

## [1.5.0] - 2026-10-17

首个正式发布版本（后端 / 管理后台 / 移动端同为 v1.5.0），覆盖平台从 M1 到 M2-R 的完整能力。

### 新增

- **认证与安全**：后台图形验证码（连续失败 3 次后强制）、账号锁定（5 次失败锁 15 分钟）、JWT 在线会话与强踢（一次性下线全部会话）、密码过期强制改密开关（默认关闭）、登录日志（含失败原因与真实 IP）；客户端短信/邮箱验证码登录、注册、找回密码、换绑手机号/邮箱、账号注销工单、用户名 90 天限改一次。
- **权限与治理**：RBAC 权限点目录 / 角色 / 数据范围域、登录态画像缓存（权限 5 分钟、画像 60 秒）、审计日志（操作快照 + 请求上下文 + 真实 IP）、13 个业务域软删除归档体系（自动归档 / 自动删除 + 按域设置）、日志保留期清理任务。
- **业务域闭环**：需求（发布 → 审核 → 响应撮合 → 立项 → 承接方选定与撤销）、项目协作（承接方占比、里程碑提交/验收、结项经验值分配）、活动（发布/报名/候补/签到校验位置与 6 位签到码、签到二维码、电子票）、积分商城（统一券码核销、过期自动退款、类别可见范围）、积分与经验引擎（推荐等级、积分消费折扣）、公共空间预约（时段计费、范围校验）、租赁与办公位（续期、合同素材管理）、内容（资讯/投稿/栏目/公告/首页轮播）、政策与协议版本化。
- **消息与集成**：消息中心（渠道 / 模板 / Outbox / 投递日志，凭据支持 env 与 inline 双模式且只写脱敏）、站内信、实名核验（供应商可切换、联通性测试）、素材存储（本地磁盘 / MinIO，魔数嗅探校验）、离线许可证校验（Ed25519 内置公钥，过期转只读）。
- **基础设施**：10 项定时任务（定时发布/活动结束/租约临期/自动归档/自动删除/消息投递/券码过期退款/日志清理）、CSV 导出、系统监控（服务/数据库/Redis/定时任务）、统一响应包络与异常过滤、前缀 ID 发号器、Redis 缓存（配置/字典/规则/工作台）。
- **部署与运维**：`pnpm db:init` 生产初始化（仅基础配置，不含演示数据；冲突即跳过、已初始化即中止）；`/api/health` 与 `/api/app/config` 回传服务端版本号。

### 变更

- **登录安全策略**：验证码由「始终必填」调整为「连续失败 3 次（CAPTCHA_AFTER_FAILURES）后必填」，第 5 次失败返回 429 并锁定 15 分钟；相关 e2e 断言同步为当前契约。
- **消息渠道**：同一通知类型仅保留一条固定配置，禁止隐式覆盖新增（同 kind+provider 或同 kind 已存在时返回 409）；后台编辑走 `PUT /:id` 或 `PUT /fixed/:kind`。
- **时间口径**：全站时间字符串统一 `YYYY-MM-DD HH:mm`（Asia/Shanghai），进程时区不符时启动告警。
- **空间与等级**：公共空间可见/可预约范围支持按身份与等级多选；等级规则支持积分消费折扣（一位小数，10 = 原价）。

### 修复

- 修正需求立项后响应状态收敛口径（`accepted` 与 `undertaken` 一并收敛，避免里程碑积分与站内信失配）。
- 修正负责人转移请求列表返回已处理条目、客户端点击后报错的问题。
- 修正关闭密码过期强制改密开关后，Redis 中残留过期标记导致当前会话仍被拦截的问题。
- 修正 Prisma schema 变更后未重新生成客户端导致的 `PrismaClientValidationError` 问题（升级流程已写入部署手册）。

### 安全

- 供应商凭据一律只写、脱敏、不入审计快照；MinIO SecretKey 仅经环境变量或数据库解析，对外仅回「是否已配置」。
- 会话吊销/策略类 Redis 操作默认 fail-closed（异常返回 503），仅在排障窗口可用 `AUTH_REVOCATION_FAIL_OPEN=1` 临时降级。
- 登录失败与验证码接口带 IP 维度限流，账号锁定键与失败计数键带 TTL 落 Redis。

### 说明

- 版本号来源：`apps/api/package.json` 的 `version`（`src/common/version.ts` 统一读取，src 与 dist 两种运行形态均可用）。
- 对外可见位置：`GET /api/health`（`data.version`）、`GET /api/app/config`（`data.version`）、后台「系统管理 → 系统监控」概览。
