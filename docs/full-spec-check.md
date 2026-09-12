# 聚屿社区 — Full Spec Check（整体规划与进度核对表）

> 跨会话/跨 agent 的进度唯一事实来源。每完成一个模块，同步勾选。
> 细致契约见 [wiki-admin-web.md](./wiki-admin-web.md) 与 [wiki-backend.md](./wiki-backend.md)；实体字段见 [docs/entity-fields.md](./entity-fields.md)。
> 最后更新：2026-09-12（**M1.5 R1~R12 全部落地并有本工作树增强**：RBAC/管理员账号/登录安全/上传素材/富文本/监控/趋势/登录日志/导出打印/暗色/列配置/归档管理/新增角色/一键强制下线/角色与账号三 Tab 统一筛选栏/工作台视觉修复；e2e **25 套件 / 169 用例**）

## 0. 项目定位

创业社区数字化运营平台：管理后台（运营方）+ 客户端 Web（居民/企业成员）+ 微信小程序（居民轻入口）。

核心业务域：
- 社区成员：用户与多身份体系（个人用户/社区个体/社区企业/合作企业）、入驻与身份绑定审核、经验值与积分账本
- 业务运营：需求广场（提交→审核→发布→立项）、项目协作（多承接方占比、里程碑）、活动运营（发布/定时发布、报名审核、签到）
- 运营设施：积分商品与订单、办公位/办公室/租约、公共空间与预约、资讯内容
- 系统管理：数据字典、系统配置、审计日志、通知中心、统一待办

开发策略：**以管理后台 Web 驱动**——先冻结实体/状态流/接口形状，再实现后端与客户端。

## 1. 技术栈

| 层 | 选型 |
|---|---|
| 仓库 | pnpm Monorepo（`apps/` + `packages/`） |
| 后端 | NestJS + Prisma + PostgreSQL + Redis |
| 管理后台 / 客户端 Web | Vue 3 + Vite + TS + TDesign Vue Next + Pinia + Vue Router |
| 微信小程序 | TDesign WeChat MiniProgram |

## 2. 里程碑总览

| 里程碑 | 名称 | 状态 |
|---|---|---|
| M0 | 后台原型（Mock 驱动） | 已完成（A~E 全） |
| M1 | 后端服务（NestJS + Prisma + PG + Redis） | 已完成（A~E 全） |
| **M1.5** | **后台治理增强（R1~R12）** | **已完成（R1~R12 全 + 本工作树增强，见 §7）** |
| M2 | 客户端 Web | 未开始 |
| M3 | 微信小程序 | 未开始 |

## 3. M0 后台原型（已完成）

- **M0-A 骨架**：设计 tokens、App Shell（侧栏/顶栏/多标签）、菜单路由冻结、登录、工作台、共享组件、Mock 单一出口、API Stub 约定
- **M0-B 社区成员**：用户管理（列表/详情/冻结/账本）、社区个体、社区企业（成员/展示页审核）、外部企业、申请审批、数据概览联动
- **M0-C 业务运营**：需求（待审核→待发布→已发布/定时发布中，只读审核、立项/撤回、发布时间列）、项目（多承接方占比、里程碑）、活动（待发布→已发布/定时/结束/取消，报名开关、签到）
- **M0-D 运营设施**：积分管理（商品/订单/规则/账单）、空间管理（办公位/办公室/租约/公共空间/预约）、资讯内容（文章/栏目/展示页/阅读统计）
- **M0-E 系统管理**：通知中心、操作审计日志、系统配置、数据字典、统一待办、列表导出（CSV）、批量操作、面包屑点击

## 4. M1 后端服务（已完成）

> M1.5 增强后现状（代码为准）：36 个 controller（34 个 `/api/admin` + health + public files）共 **193 个在册 HTTP 端点**（管理端 191 + 公开 2；2026-09-12 新增 `POST /api/admin/roles`、`POST /api/admin/auth/sessions/kick-all`、`POST /api/admin/users` 与 `POST /api/admin/users/:id/reset-password`）；Prisma schema **43 模型**（M1 时 35，M1.5 新增 RBAC 4 表 / LoginLog / SchedulerLog / MallAsset / ArchiveSetting 共 8 表）。

- **M1-A 底座**：NestJS 11 + 全局管线（包络/异常过滤/JWT 守卫/审计拦截器/前缀 ID 发号器）、Docker Compose（PG+Redis）、Prisma schema（M1 时 35 模型，M1.5 后 43）+ seed 骨架、认证（JWT + Redis 登出黑名单）、健康检查
- **M1-B 社区成员域（23 端点）**：users / individuals / enterprises / external-enterprises / applications / ledgers；新增用户生成默认个人身份、管理员重置登录密码、grantIdentity 联动、账本事务、审计迁移、admin 五组页面接入
- **M1-C 业务运营域（34 端点）**：demands / projects / events；状态机服务端校验（409）、定时发布与活动自动结束、积分/经验引擎接入、立项双向关联、admin 四组页面接入
- **M1-D 运营设施域**：mall / rules / workstations / spaces / contents / announcements；订单退款事务、租约临期通知、预约冲突校验、admin 接入
- **M1-E 系统域与收尾（12 端点）**：notifications / audit-logs / config / dicts / dashboard / todos；审计 before/after 快照、Redis 缓存（配置/字典/规则/工作台，写失效）、admin 全量接入、mock 删除、`/api/app/**` 设计文档、entity-fields 文档、全量回归（e2e 完整通过、浏览器走查）

## 5. M2 客户端（移动端 `client-mobile` / 桌面端 `client-web`）

> 规划：[docs/m2-client-plan.md](./m2-client-plan.md)（v2 已确认，含完成度看板）；契约：[docs/api-app-design.md](./api-app-design.md)；移动端实现契约：[docs/wiki-client-mobile.md](./wiki-client-mobile.md)（随批次补充）；桌面端契约 `wiki-client-web.md` 待应用创建时新建。
> 策略：Mock-First——客户端拆为两个独立应用/入口，**先移动端后桌面端**；`apps/client-mobile`（原 `apps/client`，dev 7759，与 admin 零粘连）前端先行 + Mock 数据，超边界功能（站内信/位置签到/首页聚合）以 `[MOCK-ONLY]` 交付并登记缺口；接入期（M2-R）实现 `/api/app/**` 并销号。
> 拆分状态：`apps/client-mobile` **已收敛为纯移动端**（2026-09-13 移除 `views/desktop/**` 与 `dualView`，信息架构重构为 5 Tab：首页/项目/社区/广场/我的，社区视角）；`apps/client-web` 尚未创建（将承接原桌面视图与 `tdesign-vue-next`）。

- [√] 客户端工程骨架（`apps/client-mobile` 独立包 / 7759 / 纯移动端 5-Tab 壳 / tokens / 请求层 / mock 底座 / devtools 身份切换器）
- [√] 登录 / 注册 / 首页（搜索+轮播+需求发布+双入口+四宫格+最新项目+精选文章）
- [√] 注册登录与多身份管理（Mock 全量交互已交付；后端多身份 JWT 为缺口）
- [√] 需求广场：浏览（可见范围过滤）/ 提交（选身份）/ 响应
- [√] 活动中心：浏览 / 报名（可报名范围过滤）/ 我的报名 / 位置签到〔边界外，已登记缺口〕
- [√] 站内信中心〔边界外，已登记缺口〕
- [√] 项目协作：承接 / 进度查看
- [√] 个人中心：资料 / 积分 / 经验等级 / 商城兑换
- [√] 空间预约：可用时段 / 提交（冲突 409）/ 我的预约
- [√] 内容：文章浏览 / 投稿 / 我的投稿；企业展示页与展示页申请
- [ ] 对接 `/api/app/**`（M2-R：后端实现 + 缺口销号 + http 切换 + e2e）

## 6. M3 微信小程序（未开始）

- 小程序骨架（TDesign MiniProgram）
- 微信登录与账号绑定
- 轻功能：需求浏览 / 活动报名 / 个人中心（积分）

---

## 7. M1.5 后台治理增强（R1~R12，已完成）

> 以成熟后台系统为参照补齐的能力演进，前端与后端配套推进；优先级 P0 为治理打底，P1 为运营体验，P2 为打磨。
> 前端 F1~F12 与后端 B1~B12 已全部落地（B10 暗色无后端、B11 列配置纯前端，按计划跳过）。
> 验证：前后端 `tsc --noEmit` + `build` 通过；e2e **25 套件 / 163 用例**全绿（在 M1 的 16 套件 / 78 用例基础上新增 system-rbac / admins / auth-security / monitor / assets / trash / export / dashboard-trend / sanitize 共 9 套件），`pnpm db:reset` 幂等。

### 7.1 前端实现路线

| R | 能力 | 优先级 | 前端交付 |
|---|---|---|---|
| R1 | RBAC 权限体系 | P0 | 角色管理页（权限点分配矩阵）、菜单/按钮权限过滤（v-permission 指令）、403 页；数据范围说明未实现（见注记） |
| R2 | 管理员账号管理 | P0 | 管理员列表页（新增/启停/重置密码/分配角色） |
| R3 | 登录安全 | P0 | 登录页图形验证码、修改密码页、会话管理页（在线会话/强制下线） |
| R4 | 文件上传与素材库 | P1 | 素材库页（上传/列表/删除/选择器）、TDesign upload 封装、业务接入（商品图/活动封面/文章配图/企业 Logo） |
| R5 | 富文本编辑器 | P1 | 富文本组件（文章/需求/活动/公告编辑替换 textarea） |
| R6 | 系统监控面板 | P1 | 监控页（服务/Redis 健康指标卡、定时任务执行状态与结果日志） |
| R7 | 图表与趋势分析 | P1 | 工作台趋势图区块（ECharts/TDesign Charts：成员/需求/活动/积分趋势） |
| R8 | 登录日志 | P1 | 登录日志页（时间/IP/设备/状态筛选） |
| R9 | 数据导出与打印 | P1 | 全量/选中导出、租约单与审批单打印视图 |
| R10 | 暗色模式 | P2 | TDesign 暗色 token 主题切换 + 偏好持久化 |
| R11 | 列显示配置 | P2 | 列表 column-controller（显隐/顺序，持久化） |
| R12 | 回收站 / 软删除 | P2 | 删除改软删、归档管理页（13 标签页：列表/恢复/彻底删除 + 按域归档设置：自动归档/自动删除） |

### 7.2 后端支持路线

| R | 能力 | 后端交付 | 依赖 |
|---|---|---|---|
| R1 | RBAC | migration：AdminRole / AdminPermission / 关系表（AdminUser 挂角色）；`@RequirePermission` 守卫；角色/权限 CRUD + 权限点目录接口（49 码，含 `/system/export`）；登录响应带权限集合；数据范围（域维度）**未实现** | 无 |
| R2 | 管理员账号 | AdminUser CRUD（增改启停/重置密码/角色分配）端点 + 审计 | R1 |
| R3 | 登录安全 | 验证码令牌（Redis 短时）；密码策略校验（强度；**周期未实现**）；修改密码（原密码校验 + 踢下线）；会话管理（Redis 会话索引、强制下线撤销 token） | R1 |
| R4 | 上传与素材 | 对象存储抽象（本地磁盘驱动 + `UPLOAD_DIR`，MinIO 待接入）；素材表 CRUD 与上传端点（大小限制走系统配置 1-100MB） | 无 |
| R5 | 富文本 | 富文本存储 + HTML 清洁（XSS 过滤） | R4 |
| R6 | 监控 | 服务/Redis 健康与统计端点；SchedulerLog 表（任务执行记录）与状态接口 | 无 |
| R7 | 图表 | 聚合统计端点（成员/需求/活动/积分按日趋势） | 无 |
| R8 | 登录日志 | LoginLog 表 + 写入（成功/失败/锁定）+ 查询端点 | R3 |
| R9 | 导出打印 | 全量导出接口（CSV 流）；租约/审批单结构化数据端点 | 无 |
| R10 | 暗色 | 无后端（前端 token 切换） | — |
| R11 | 列配置 | 可纯前端（localStorage 持久化） | — |
| R12 | 归档管理 | 删除类改软删（deletedAt/deletedBy）+ 恢复/彻底清理端点 + 归档设置（ArchiveSetting）+ 调度自动归档/自动删除，保留审计 | 各业务域 |

> 实施注记（2026-09-12 以代码为准的口径）：
> - R1 数据范围（域维度）**未实现**：后端无 dataScope 过滤，权限控制为菜单/端点级。`@RequirePermission` 覆盖 **33/36** 个 controller（health、public files 为公开端点，notifications 有意仅登录；若不计公开 health 则为 33/35）；权限目录 **49 码**（含 `/system/export`）。装饰器支持 `string | string[]`（any-of），权限集合含 `'*'`（超管）时全量放行。
> - R3 密码周期**未实现**：仅强度校验（修改/重置 ≥8 位含字母与数字；新建管理员未传密码时随机生成 12 位初始密码并一次性返回）；登录失败锁定为 Redis 实现（5 次失败 / 15 分钟）。
> - R4 对象存储以本地磁盘驱动落地（`StorageService` 抽象 + `UPLOAD_DIR` 可配，默认 `apps/api/uploads`，MinIO 驱动待接入）；素材与富文本图片共用的上传大小限制由系统配置 `uploadMaxSizeMb` 控制（1-100MB 整数，默认 10MB；multer 100MB 硬兜底），上传经魔数嗅探（禁 SVG）与 HTML 消毒。
> - R12 软删/归档现覆盖 **13 个域/标签页**：社区企业 / 合作企业 / 资讯发布 / 投稿内容 / 公告栏 / 需求 / 项目 / 活动 / 租赁 / 空间预约 / 商品 / 商城订单 / 申请审核（资讯发布与投稿内容同属 Article 的 official/submitted 两个标签页）；每域可配置自动归档（开关 + 延时 + 状态）与自动删除（开关 + 延时），由调度任务 `archive-auto-archive` / `archive-auto-purge`（每 5 分钟）执行；恢复/彻底删除仅限 `deletedAt` 非空对象并保留审计。
> - 2026-09-12 功能增强（前后端）：**新增角色** `POST /api/admin/roles`（编码唯一/不可用 super/名称唯一，ID 走 R 前缀 seed 续号自 R5，初始无权限点，审计「RBAC · 新增角色」；UI 在 角色与账号·角色权限 Tab，筛选栏 + 新增弹窗）；**一键强制下线** `POST /api/admin/auth/sessions/kick-all`（保留当前操作者会话，返回实际下线数；UI 在 在线会话 Tab，popconfirm 确认）；管理员账号 Tab 的「新增管理员」从独占按钮行移入筛选栏右端；三 Tab 统一「筛选栏 + 表格卡片」结构；工作台修复 待办 StatCard 贴边（TDesign `.t-link` 基础样式覆盖）与 系统公告条目文字水平居中（column flex 下 `align-items:center` 渗透）。
> - 2026-09-12 有头浏览器全量走查（playwright-cli，chrome headed）：覆盖 登录边界（错验证码/错密码/5 次锁定 429/成功）、工作台交互（趋势切换/编辑布局开关恢复）、用户筛选与详情、企业新增校验、栏目系统保留行、归档空态与 13 域 tab、配置越界（1-90/1-100）、字典重名 409、日志模块筛选与 URL 同步、角色新增边界（非法编码前端拦截/super 后端 400）、暗色持久化、404 兜底、auditor 菜单裁剪与越权 403；**发现并修复缺陷**：系统管理菜单组 `canSee` 误用聚合路径码导致 auditor 整组菜单不可见（见 wiki-admin-web §4）；全程 console 零 JS 运行时异常（仅测试触发的预期 4xx）。

---

## 8. 横切约定

- 设计契约冻结机制（M0 建立，见 wiki-admin-web.md）
- 实体字段沉淀：docs/entity-fields.md（43 模型，schema.prisma 为事实来源）
- 后端测试：e2e 25 套件 / 169 用例 + `test/helpers/reseed.ts` 套件级隔离，`pnpm --filter @joinyuu/api test:e2e`
- CI/CD 与部署方案：待规划
