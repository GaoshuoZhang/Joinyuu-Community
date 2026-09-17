# M2-R 收口验收记录

日期：2026-09-17。范围：A6、A19、HTTP 浏览器走查、问题修复与文档销号。代码保留工作树，未提交、未推送。

## 交付

- A6：`/member-governance` 提供注销工单与实名复核。注销冷静期 7 天，届满由工作人员确认执行；执行前可撤回。执行后账号 `deleted`、基础资料匿名化、密码清除、会话失效，业务历史保留；不能解冻恢复。驳回记录原因并发站内信。
- 实名提交规则校验后即时生效，状态 `pending`；人工通过为 `approved`，驳回为 `rejected` 并清除实名信息，允许更正重提。列表证件号脱敏，动作留审计；客户端显示复核状态与驳回原因。
- A19：`/card-management` 维护个人/企业名片，包含简历分段编辑和用户可编辑字段配置。`GET /api/app/card-schema/:type` 下发字段，服务端拒绝禁用字段，移动端隐藏对应输入项。省略字段保留、空串清空；后台编辑不受用户白名单限制。`IndividualCard.displayName` 持久化并用于公开名片。
- 初始收口迁移 `20260917020000_m2r_closeout_governance`：1 个模型 `CardFieldConfig`，扩展 User、AccountDeletionRequest、IndividualCard，增加 2 个 RBAC 权限。后续规则与信息架构重构见本页 §后续调整；当前为 70 模型 / 31 迁移 / 55 权限码。

## 前次收口验证证据（本次复查前）

| 检查 | 结果 |
|---|---|
| 隔离空库顺序回放 | 两个隔离库均成功回放 27 个迁移 |
| 数据库与 schema 对比 | `prisma migrate diff`：No difference detected |
| 开发主库升级 | 仅增量应用新迁移，未重置、未重种子 |
| API e2e | 37 套件 / 252 用例全绿 |
| API unit | 4 套件 / 24 用例全绿 |
| Admin UI contract | 10/10 |
| TypeScript | API / Admin / Client Mobile 全通过 |
| Client Mobile lint | 通过 |
| 生产构建 | API / Admin / Client Mobile 全通过 |

新增 `member-closeout.e2e-spec.ts` 六个场景覆盖：权限隔离；实名驳回重提与并发复核；白名单与禁用字段保留；后台编辑及公开名片同步；注销冷静期/驳回/撤回；并发注销、匿名化、会话失效及不可恢复。

## 浏览器范围

使用 Playwright CLI、真实 HTTP、隔离 PostgreSQL 数据和 Redis DB 6；移动窗口 390×844，Admin 1440×1000。

64 个页面入口为前次走查范围，其中包含已在本轮移除的积分任务与展示申请入口；当前移动端不再展示这两个流程。

这 64 项为入口加载及请求/运行时检查，最终结果：页面异常 0、API 失败 0、Vue 警告 0、横向溢出 0。它不表示每页所有按钮和业务分支都已逐一点击；业务状态机由 API e2e 覆盖。

另行浏览器验证：

- 真实图形验证码登录两个身份；登录/注册/找回密码访客页面。
- Admin 修改个人名片展示名，禁用年龄字段；移动端隐藏年龄输入并保存简介；API 核对年龄仍为 32、展示名与后台一致，随后恢复字段配置。
- 客户端提交注销工单，Admin 冷静期内确认注销按钮禁用，填写原因驳回，客户端收到通知。
- 移动端提交实名，显示已生效待复核；Admin 通过后移动端刷新显示已认证。
- 企业邀请详情显示真实邀请及职位；电子票与签到页面加载。

走查修复：需求详情 `Tag` 未导入；HTTP 登录页显示 Mock 演示账号；企业邀请通知使用旧路径；实名/注销文案与复核流程不一致；已签到电子票显示有效及签到时间窗缺单位。HTTP 电子票仅展示真实核销码，演示图案限 Mock 模式。

## 收尾复查整改（2026-09-17）

1. 注销申请：提交、撤回与后台执行共用用户行锁；数据库部分唯一索引阻止重复 cooling 申请。撤回按用户清除全部进行中申请。迁移将历史重复申请组全部标记 cancelled，保留记录与原因，需用户重新提交；单份申请不变。
2. 名片隐私：前后台在同一事务内合并现有 visibility，只改传入键，省略/空对象保留；拒绝 null、数组和非布尔值。并发修改不同开关不会互相覆盖。
3. 举报恢复：记录实际处置动作、目标版本和恢复时间；恢复必须来自实际下架/冻结的原举报，且之后没有新的处置，仅可成功一次。数据库触发器覆盖需求、文章、企业、用户的状态及归档/冻结写入；同值重新处置也使旧恢复资格失效。管理端按 canRestore 展示入口。旧版无来源快照记录不推测恢复资格；由工作人员经原业务入口复核处理。
4. 展示姓名搜索：人才库（数据库及内存筛选）、全域人才搜索、后台个人名片管理均支持 displayName；全域人才搜索名称与公开名片一致，计数/分页口径同步。

新增迁移 `20260917030000_closeout_review_guards`，当前 72 模型 / 28 迁移。原已应用迁移未修改。开发库升级前检查重复 cooling 用户数为 0，增量升级没有撤销现有申请；未重置、未重种子，API 已重新启动并通过 health 检查。

新增 `closeout-review.e2e-spec.ts` 12 个回归用例；原治理测试改为验证新举报不可解冻其他工单，原举报可恢复。定向 3 套件 / 23 用例通过，隔离空库 28 迁移回放和 schema diff 通过。SQL 部分索引及触发器的行为由回归用例独立验证，不以 schema diff 代替。

首轮完整回归的 38 套件 / 264 断言通过，但后台 cron 在测试关闭连接时仍运行，导致 Jest 因套件结束后输出日志而非零退出。现于 `NODE_ENV=test` 禁止自动注册 cron，调度业务仍由已有事件/租约/监控用例显式调用验证；开发和生产调度保持开启。

最终复跑：**38 e2e 套件 / 264 用例、4 unit 套件 / 24 用例全绿，命令正常退出（0）**；Admin UI contract 10/10、API/Admin/Client Mobile tsc 与三端构建、移动 lint、API lint（5 条既有未使用导入警告，0 error）、diff 空白检查通过。测试使用临时 PostgreSQL 库与空闲 Redis DB 14，结束后均清理，未触碰开发数据。开发库只增量部署上述新迁移。

本轮未重跑 64 入口走查；补充浏览器复测管理端展示姓名检索、名片隐私开关回填、治理页 `canRestore`/待处理操作显隐与移动端 schema 渲染，均通过且无控制台错误。上述 64 入口记录仍属于前次验收证据。

## 后续调整（2026-09-17）

- 积分任务中心、`PointsTask`、`UserTaskRecord` 与领取接口已移除；积分规则保留为固定自动发放目录，管理员仅能编辑积分值和启停状态。
- 等级规则拆为社区个体与社区企业两个独立梯度；发布限制替代实名权益，按个人未实名、个人已实名、社区个体等级、社区企业等级配置需求发布、文章投稿、活动报名、空间预约的每日额度。企业成员共用企业主体额度。
- 社区政策移至内容管理，协议与政策移至系统管理，服务端以独立路由和权限强制类型边界。举报与申诉不再承载政策编辑。
- 展示页发布审核及其申请表、接口、权限、待办、数据表已移除；名片管理继续维护个人与企业名片，企业可见性仍由 `showcaseStatus` 和治理下架保护。
- 申请表单配置改为可视化字段设计器，支持字段类型、必填、选项、上传限制与顺序，保留高级 JSON 回退，并以服务端嵌套校验保护 schema。
- 本轮以隔离库从空库回放 31 个迁移并重种子，schema diff 为零；全量 API e2e 39 套件 / 264 用例、Admin UI contract 10/10、三端 TypeScript 与生产构建、移动 lint 通过。开发库仅增量应用迁移，未重置或重种子。
- 后续信息架构微调：发布限制默认全为 `-1`，等级与标签分行；侧栏“积分管理”更名“积分商城”；积分/经验发放记录入口迁入规则页；申请表单配置、注销工单、实名复核移入系统管理并拆分独立页面；用户详情与企业详情新增名片页签。新增迁移后当前为 32 个迁移，隔离库回放及定向 3 套件 / 20 用例通过。
- 文章与轮播图调整（迁移 `20260917160000_article_closed_banners_notices_services`）：后台/举报下架统一进入 `closed` 已关闭并可归档，成员主动撤回投稿保持 `withdrawn`；新增 `ArticleTakedown` 记录每次下架与原因并在文章详情抽屉展示；`Article.commentsEnabled` 默认开启、关闭后客户端读写评论返回 409。新增独立 `HomeBanner` 模型和 `SystemConfig.homeCarouselOpen` 总开关，后台「轮播图管理」支持新增/编辑/删除/排序/启停，关闭后客户端首页不渲染轮播区域。
- 同批简化：站内信改为单一列表、移除归档与分类偏好（`UserNotification.archived` 与 `UserNotificationPreference` 删除，`NotificationService` 始终写入）；社区服务申请（后台面板、App 端点、`ServiceApplication` 模型、`SA` 发号与权限）整体下线，社区政策与通用申请审核保留。
- 移动端修复：广场/活动/活动详情的 `typeLabel` 由服务端 DTO 正确下发（此前误发 `type` 导致标签空）；文章详情正文兼容后台富文本 HTML，经 DOMPurify 清洗后渲染，保留纯文本/Markdown 图片行回退。
- 最终验证（隔离库 `joinyuu_verify_0917` 从空库回放 **33 个迁移**并重种子，schema diff 为零）：**40 e2e 套件 / 269 用例**全绿（新增 `banners.e2e-spec.ts` 4 例）；Admin UI contract 10/10；API/Admin/Client Mobile TypeScript 与三端生产构建、移动 lint 通过。随后为已迁移的开发库增量补 `20260917170000_banners_permission`（轮播图管理权限），当前为 **34 个迁移**。
- 需求撮合口径调整（无迁移）：成员端发布者选定承接方改为 `POST /api/app/me/demands/:id/select`（多选 → `selected`，被选响应 `accepted`，未选保持 pending，不生成项目；原 `responses/:responseId/review` 删除），管理员 `initiate-project` 支持 `published|selected` 并补发承接方 `demand_undertaken` 积分与 `project_undertaken` 经验、通知双方（企业发布者站内信落到企业联系人）；发布者可查看本人任意状态需求详情；移动端「我的需求」行进入详情并在详情页完成响应查看/多选提交，后台需求列表增加「已选定」筛选、立项操作与响应积分三色标签。验证（隔离库 `joinyuu_verify_demands` 从空库回放 **34 个迁移**并重种子）：**40 e2e 套件 / 270 用例**全绿、API unit 24/24、Admin UI contract 10/10、三端 TypeScript 与生产构建、移动 lint 通过；开发库未重置。
- 三端联调 e2e（`apps/api/test/journey-flows.e2e-spec.ts`，12 例）：单套件连续驱动注册 → 登录 → 实名提交/后台复核 → 人才登记/企业入驻申请/后台审核 → 个人名片（客户端编辑 + 后台读写 + 字段白名单）→ 企业名片（客户端编辑 + 后台读写）→ 企业主体需求发布/后台审核发布 → 成员响应 → 发布者选定 → 管理员立项 → 里程碑提交/验收结项 → 空间预约（客户端企业主体 + 后台审核）→ 活动报名（后台审核）+ 客户端电子票签到 + 后台补签 → 商城兑换（后台发货）/确认收货/评价。全量验证（隔离库 `joinyuu_verify_journey` 回放 34 个迁移并重种子）：**41 e2e 套件 / 282 用例**全绿、API unit 24/24、Admin UI contract 10/10、API TypeScript/lint 通过。
- 三端接口对齐审计与修复（`docs/api-alignment-audit.md`，无迁移）：移除重复注册的企业工作台路由（保留 `GET /api/app/me/enterprise-workbench`）与重复的活动电子票路由（保留 `GET /api/app/events/:id/ticket`），后端路由 368 → **365**；后台接入监控「手动执行」（`POST /api/admin/monitor/jobs/:name/run`）与租约打印接口（`GET /api/admin/leases/:id/print`）；移动端接入协议版本（`GET /api/app/policies/:kind`）、实名分级权益（`GET /api/app/me/realname-rights`）、默认地址（`POST /api/app/me/addresses/:id/default`）与空间详情（`GET /api/app/spaces/:id`）。验证（隔离库 `joinyuu_verify_fix` 回放 34 个迁移）：**40 e2e 套件 / 270 用例**全绿、unit 24/24、Admin UI contract 10/10、三端 TypeScript 与生产构建、移动 lint 通过。

## 后置范围

R4-7 浏览历史跨端同步、可选运营看板、邀请/转移只读运营视图继续后置。短信与三要素实名保持既定降级方案；桌面客户端和 M3 未开始。
