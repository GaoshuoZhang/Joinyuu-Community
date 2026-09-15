# 聚屿社区 · M2 客户端 Web 规划（Mock-First · v2）

> 状态：规划稿 v2（已确认）；**Mock 版本已全量交付**（M2-M1~M6 完成，见 §0 看板），接入期 M2-R 待启动。
> 2026-09-13 缺口核对（v5）：已对照 `apps/api` / `apps/admin` 代码现状逐条核对 §7，补登新增缺口（§7.4）与接入前置修复清单（§7.5）；§0/§3/§5/§6 已按纯移动端现状修正。
> 架构调整（2026-09-12）：客户端拆为两个独立应用/入口——`apps/client-mobile`（移动端，原 `apps/client`）与 `apps/client-web`（桌面端，待创建）；**先移动端后桌面端**，详见 §1.2-5。

## 0. 完成度看板（随批次勾选）

### 0.1 里程碑批次

- [√] M2-M1 工程骨架：独立 client-mobile 包（7759/代理/双壳/断点/tokens/请求层/mock 底座/session/devtools）+ 登录/注册/首页（含站内信入口与未读角标）
- [√] M2-M2 个人中心族：资料编辑 / 积分流水 / 经验等级 / 我的申请 + 提交（4 类）
- [√] M2-M3 需求广场全流程 + 活动中心（浏览/详情/报名/取消）+ 可见范围 Mock 模拟
- [√] M2-M4 签到 + 站内信中心完整交互（时间窗/围栏/失败态/未读已读/跳转）〔核对：签到与站内信已交付；devtools「模拟位置注入」三场景未实现，见 §7.5〕
- [√] M2-M5 商城（下单/我的订单/状态流转 devtools）+ 空间预约（时段占用/提交/我的）
- [√] M2-M6 内容（文章/投稿/我的投稿）+ 展示页申请 + 企业展示页 + 首页聚合完善
- [ ] M2-R 接入期：后端 /api/app/** 全量实现 + §7 缺口销号 + `VITE_API_MODE=http` 切换 + e2e（app-* 套件）+ 回归

### 0.2 页面清单（2026-09-13 核对：纯移动端，全部已交付）

> 桌面端视图已随 `apps/client-web`（未创建）迁出本应用，v2 的「双端视图」口径作废；以下与 `src/router/index.ts` 一致（登录/注册 + 33 个壳内页面）。

- [√] /login 登录　[√] /register 注册　[√] / 首页
- [√] /projects 项目　[√] /community 社区（社区服务/人才库/企业库 3 Tab）　[√] /plaza 广场（活动/资讯 2 Tab）　[√] /intros/:kind 入驻说明
- [√] /demands/:id 需求（项目）详情　[√] /demands/new 提交需求　[√] /me/demands 我的需求　[√] /me/responses 我的响应
- [√] /events 活动中心　[√] /events/:id 活动详情　[√] /events/:id/check-in 签到　[√] /me/enrollments 我的报名
- [√] /mall 商品列表　[√] /mall/:id 商品详情与下单　[√] /me/orders 我的订单
- [√] /spaces 空间列表　[√] /spaces/:id/reserve 预约提交　[√] /me/reservations 我的预约
- [√] /articles 文章列表　[√] /articles/:id 文章详情　[√] /articles/new 投稿　[√] /me/articles 我的投稿
- [√] /enterprises/:id 企业名片　[√] /enterprises/:id/showcase-apply 企业名片申请〔入口：社区·企业库卡片（成员可见）〕
- [√] /me 个人中心　[√] /me/profile/edit 资料编辑　[√] /me/points 积分流水　[√] /me/experience 经验与等级　[√] /me/applications 我的申请　[√] /applications/new 提交申请　[√] /me/projects 我的项目
- [√] /notices 站内信中心

### 0.3 后端缺口（§7.1，接入期销号）

- [ ] 缺口 1 站内信（UserNotification 模型 + 端点 + 触发点）　[ ] 缺口 2 签到（字段迁移 + check-in 端点）
- [ ] 缺口 3 首页聚合端点　[ ] 缺口 4 多身份 JWT 签发　[ ] 缺口 5 批量字典下发　[ ] 缺口 6 投稿图片上传
- [ ] 缺口 7 经验值流水端点　[ ] 缺口 8 积分触发点接线　[ ] 缺口 9 可见范围服务端过滤　[ ] 缺口 10 订单状态流转
- [ ] 缺口 11 app 图形验证码　[ ] 缺口 12 社区服务/人才库/企业库端点　[ ] 缺口 13 预约取消端点（§7.4 新增登记）　[ ] 缺口 14 申请表单 schema 下发（企业合作/人才登记）　[ ] 缺口 15 需求类型与专属字段（找服务 / 找投资 / 找合作）　[ ] 缺口 16 个人名片与关联身份（个人名片 GET /me/cards + PUT `/me/cards/individual`；关联身份 GET `/me/identities`；企业详情 GET/PUT `/me/enterprises/:id` + 转移负责人/邀请成员/退驻申请）　[ ] 缺口 17 企业成员邀请闭环与成员权限（邀请记录 + 站内信 + 邀请详情页接受/拒绝 + 成员手机号维护 + 8 项成员权限分配与服务端校验）　[ ] 缺口 18 实名认证（GET/PUT `/me/realname`，姓名 + 身份证号核验）

### 0.4 后台缺口（§7.2）

- [ ] 缺口 1 活动表单签到配置〔核对：admin 尚无〕　[ ] 缺口 2 签到名单标识与补签〔核对：手动补签已有，缺签到方式/距离标识〕
- [ ] 缺口 3 发货与站内信联动〔核对：尚无〕　[ ] 缺口 4 站内信运营视图〔核对：尚无，仅管理员维度铃铛〕

### 0.5 开放问题（§11）

- [ ] 签到围栏默认值确认（建议 200 米 / 开始前 30 分钟）　[ ] 站内信保留期限　[ ] 分享到微信（默认不做）　[ ] 部署形态
- [ ] 社区运营数据来源（社区服务「政策/指引」、人才库由哪个 admin 模块维护；人才库 role/skills 字段在 User/UserIdentity 中无对应，需运营位或新字段）

---

> 以下为 v2 规划正文。
> 修订记录：
> | 版本 | 日期 | 摘要 |
> |---|---|---|
> | v1 | 2026-09-12 | 双端 TDesign 技术方案 + 全量范围规划 |
> | v2 | 2026-09-12 | 改为 **Mock-First 策略**（前端先行，后端 /api/app/** 后置）；**站内信**与**签到**纳入规划（均为当前边界外，Mock 交付 + 缺口登记）；明确**独立服务边界**（不与 admin 粘连，端口 7759） |
> | v3 | 2026-09-12 | **架构调整：拆成两个应用/入口**（先移动端后桌面端）——`apps/client-mobile`（原 `apps/client`，dev 7759）与 `apps/client-web`（桌面端，待创建）；根脚本改 `dev:client-mobile` / `build:client-mobile`；实现契约文档更名为 `docs/wiki-client-mobile.md`。详见 §1.2-5 |
> | v4 | 2026-09-13 | **移动端重构（社区管理者视角）**：`client-mobile` 收敛为纯移动端（移除桌面端代码/`dualView`/桌面库）；底部 5 Tab 改「首页/项目/社区/广场/我的」；新增首页（搜索+轮播+需求发布+双入口+四宫格+最新项目+精选文章）、项目页（复用需求数据）、社区页（社区服务/人才库/企业库 3 Tab）、广场页（活动/资讯 2 Tab）、入驻说明页；新增社区运营 mock（政策/人才/企业）与 `api/community.ts`。详见 §6 页面清单与 `wiki-client-mobile.md` §6 |
> | v5 | 2026-09-13 | **缺口核对与登记**（v2 双端策略正式收口为「先移动端」）：对照 `apps/api` / `apps/admin` 现状逐条核对 §7；新增 3 个后端缺口（app 图形验证码 / 社区三端点 / 预约取消）与 §7.4 超界登记、§7.5 接入前置修复清单、§7.6 M2-R 交底流程；§0.2/§3.1/§3.4/§5/§6 按纯移动端现状修正 |
> | v6 | 2026-09-13 | **全页面与流程细化（Mock，仅客户端）**：§7.5 清单销号 9 项——401 改 history 事件跳转、`EnterpriseRecord` 移入 `types/`、清理 breakpoint/`vendor-tdesktop` 死代码、DevTools 增位置注入三场景与签到时间窗对齐、订单确认弹层（余额预览）+ 确认收货 + devtools 发货推进、我的预约取消、企业库展示页申请入口、投稿图片占位与驳回再投、`updateMe` 全字段与积分流水搜索、首页消费 hotEvents/未读数/siteName、mock 数据一致性（人才库/政策前缀/字典 4 类/活动时间相对化）；tsc/lint/build 全绿 |
> | v7 | 2026-09-13 | **Pixel 10 仿真 e2e 走查（chrome-devtools MCP，412×924@2.625）**：覆盖登录边界/浏览搜索/需求发布与响应/活动报名与签到四态/商城下单-发货-收货/空间预约与取消/投稿与再投/站内信/展示页申请/身份与开关/守卫与 401。**修复 3 处真实缺陷**：①需求截止日期 Picker 缺 `format`/`start`（默认 2016 年、返回 `YYYY-MM-DD HH:mm:ss`）→ 补 `format="YYYY-MM-DD"` + `:start=今天`；②站内信单条已读角标不减（store 与 mock 共享对象引用，`!item.read` 判定失效）→ 改未读快照；③DevTools 功能开关只覆写前端 store、未同步 mock 业务门禁（mall/预约写端点未拦截）→ 同步 `appConfig`。另修 Vue Router `<Transition>` 用法告警、mock 时间戳统一 `nowStamp()`（`YYYY-MM-DD HH:mm`）；tsc/lint/build 全绿 |
> | v8 | 2026-09-13 | **点击式 e2e 二轮（导航元素缺陷专项）**：全程仅用界面模拟点击（进入/返回都不走 URL）。**修复 `AppShell` 2 处导航缺陷**——①`isTab` 按路径前缀判定，导致 `/me/**` 全部子页（12 个）被当成 Tab 页：无返回箭头、无页面标题 → 改为精确匹配 Tab 路径；②`onTabChange` 与 `active` 前缀比较，在 `/me/orders` 等子页点所属 Tab 无响应 → 改为 `route.path` 精确比较（点 Tab 即回根路径）。复验通过：5 Tab、首页三处「更多」、项目/社区/广场/商城/空间/投稿/站内信/展示页申请/身份切换/开关关停全链路；观察项：登录/注册页无「返回首页」入口（建议「先逛逛」），展示页申请后从展示页返回会回到申请页（history 语义）。tsc/lint/build 全绿 |
> | v9 | 2026-09-13 | **企业合作 / 人才登记流程重构（Mock）**：①术语——「企业入驻」升级为「企业合作」（含两种方式：企业入驻→社区企业 / 合作伙伴→合作企业），政策文案与首页双入口同步；②页面——企业合作 hub（对比/选择/CTA）+ 企业入驻、合作伙伴、人才登记各自独立介绍页（`/intros/settle|cooperation|talent`）与独立表单页（`/applications/settle|cooperation|individual`）；③表单 schema 驱动（自定义字段/必填/选项/日期/上传，缺口 §7.1-14）与资料上传（图片/PDF，`api/uploads.ts`，缺口 §7.1-6）；④身份绑定申请保留为独立页（`/applications/new`）；⑤登记缺口 14 + 后台缺口 5（表单字段配置）+ §7.4-6/7；⑥e2e 走查三流程（选择态/CTA、访客登录回跳、上传成功与类型拦截、重复提交 409、返回键）并修复 `IntroView` 静态路由下 kind 解析错误；tsc/lint/build 全绿 |
> | v10 | 2026-09-13 | **发布需求细化（Mock）**：发布需求拆为类型 hub（`/demands/new`：「找人干活 / 找投资 · 合作」两选项对比 + 选择态 + CTA 联动）+ 两类独立表单页（`/demands/new/task|invest`，`components/forms/DemandFormView` 按 kind 渲染：task 期望交付/预算，investment 所属行业/合作需求/可提供回报）；需求模型增 `kind` 与专属字段，项目列表/详情/我的需求展示类型标签与专属字段；mock 校验与种子数据同步；**修复 `ProjectsView` 搜索回调 `v` 未定义缺陷**（输入即 ReferenceError）；登记缺口 15（§7.1）、后台缺口 6（§7.2）、§7.4-8、契约修订（api-app-design §6）；tsc/lint/build 全绿 + 点击式走查两条发布流程 |
> | v11 | 2026-09-13 | **发布需求三类细化（Mock）**：hub 扩为三类（找人干活 / 找投资 / 找合作），每类含 tagline + 推进流程步骤 + 适用情形，CTA 联动；新增 `/demands/new/cooperation` 与 `DemandCoopFormView`（合作需求标题/业务现状与瓶颈/合作领域/业务瓶颈与合作诉求/期望合作方式/可提供资源与回报）；`DemandFormView` 三类字段 + 顶部流程卡；详情增合作专属字段块；种子 D4012 改合作类、新增已发布 D4013；缺口 §7.1-15/§7.2-6/§7.4-8 与 api-app-design §6 同步三值；tsc/lint/build 全绿 + 点击式走查（hub 三卡片/找合作提交/我的需求/详情合作字段） |
> | v12 | 2026-09-13 | **流程标签调整 + 控制台降噪（Mock）**：①三类推进流程移除「平台审核 / 公开展示」中间步骤，流程 chips 由椭圆改 6px 圆角矩形，表单流程卡改「发布后推进流程」；②修复首页 `GridItem :icon="true"` 类型错误（每次渲染 6 条 Vue warn）→ 改 `#image` 插槽；③`main.ts` 增表单可访问性补丁（自动补 id/name 与 label 关联），首页与我的需求页控制台零消息；tsc/lint/build 全绿 |
> | v13 | 2026-09-13 | **我的展示页自助编辑（Mock）**：`/me` 当前身份下新增「编辑展示页」（仅社区个体/社区企业可见）；新增 `/me/showcase` 双目标编辑页（个人：展示名/擅长领域/简介；企业：企业名只读/行业/规模/简介）；mock 保存即发布（企业回写展示页并置 `showcaseStatus='published'`，个人写个人展示页并联动社区人才库）；缺口 §7.1-16/§7.2-7/§7.4-9 与 api-app-design §5 同步；tsc/lint/build 全绿 + 点击式走查（陈屿可见性/人才库联动、苏明远双目标、周慕深不显示） |
> | v14 | 2026-09-13 | **展示页更名「名片」+ 企业名片 / 企业管理（Mock）**：全局 UI 展示页→名片（企业名片/个人名片/申请企业名片）；「我的」按**当前身份**显示——社区个体→个人名片（查看/编辑）、社区企业→企业名片（联系人可编辑、非联系人只读）、联系人额外显示「企业管理」；新增 `/me/cards/individual`、`/me/cards/enterprise`、`/me/enterprise`（基本信息 / 转移负责人（后台「联系人」）/ 邀请成员 / 申请退驻·注销）；mock 企业数据增成员对象与 `contactUid/contactName`、退驻申请存储；缺口 §7.1-16/§7.2-7/§7.4-9 与 api-app-design §5 改写；tsc/lint/build 全绿 + 点击式走查（陈屿个人名片、苏明远企业名片/成员邀请/退驻申请、林晚转移负责人后权限回收与只读、周慕深无入口、控制台零告警） |
> | v15 | 2026-09-14 | **项目页需求分类选项卡 + 滑动修复（Mock）**：①项目页改用 TDesign `Tabs` 三类需求（找服务 / 找投资 / 找合作），搜索/分类/分页按当前类型筛选并随选项卡重置（找投资用行业字典）；`GET /api/app/demands` 增可选 `kind` 筛选参数（§7.1-15 与 api-app-design §6 已同步）；②`task` 用户可见文案由「找人干活」统一改「找服务」（发布 hub / 表单 / 标题映射 / 项目列表；类型值与路由仍为 `task`）；③滑动体验对齐社区页——沿用 TDesign 原生手感（滑动中越过 40px 即切换），但每次手势至多切换一项，修复 1.16.2 在每个 `touchmove` 连续切换导致的 1↔3 跳项；首尾不循环，纵向滚动/多指/取消手势不切换，分类标签横滚不触发；④登录页新增「暂不登录」访客入口（`replace` 回首页）；⑤滑动区覆盖 `.t-tabs__content` 撑满的整个内容区（含卡片下方空白，与社区/广场一致）；移除项目页「已加载全部 N 条」尾提示；tsc/lint/build 全绿 + 浏览器验证（滑动逐项切换、点击切换、多指与取消手势、控制台零告警） |
> | v16 | 2026-09-14 | **选项卡圆角 + 头像去描边 + 身份资产隔离（Mock）**：①项目/社区/广场选项卡白条**四角**统一 9px 圆角（`.top-tabs` 根透明 + `.t-tabs__wrapper` 圆角，避免只圆上两角/露白）；②「我的」资料卡头像移除双层描边（box-shadow 环）；③**积分/经验按当前身份隔离**——社区个体：我的积分 + 我的等级；社区企业：仅企业等级（企业经验），个人用户：仅我的积分，合作企业：无；Me 页统计位与资产入口、经验页标题（我的等级/企业等级）与取数、积分页空态均按 `auth.activeIdentity`；mock 新增企业经验 `enterpriseExperienceByEid`（E2001 芯启 Lv.3 / E2004 木白 Lv.2），`fetchExperience(identityType)` 按身份返回（契约 `GET /me/experience-records?identity=`，api-app-design §5 与 §7.1-7 已登记）；④浏览器走查四身份矩阵（苏明远 社区个体↔社区企业、林晚 个人用户↔社区企业、周慕深 个人用户↔合作企业）与控制台零告警；tsc/lint/build 全绿 |
> | v17 | 2026-09-14 | **「我的」菜单按身份严格隔离 + 签到命名（Mock）**：①菜单隔离矩阵——社区个体：个人名片 / 我的积分 / 我的等级 / 我的项目 + 个人记录（需求·响应·报名·订单·预约·投稿·申请）；个人用户：我的积分 / 我的项目 + 个人记录（无名片、无等级）；社区企业：企业名片 / 企业管理（联系人）/ 企业等级 / 我的项目 + 记录（我的需求）；合作企业：无资产组（隐藏积分/等级/订单） + 记录（我的需求·我的申请）；编辑资料/站内信/退出对所有身份保留；②修复「幽灵身份」——`stores/auth.ts` 的 `activeIdentity` 与 `apply()` 改按 `switchableIdentities` 判定，被社区个体覆盖的个人用户身份不再滞留（此前可能出现「当前身份个人用户」但切换面板无此项）；③UI 文案「位置签到」→「签到」（活动详情按钮、签到页成功提示），并修复 `AppShell` 标题前缀（`/events/check-in` → `/check-in`，此前永不命中导致签到页标题落到「活动计划」）；tsc/lint/build 全绿 + 浏览器走查（苏明远 社区个体↔社区企业、周慕深 个人用户↔合作企业 菜单矩阵；陈屿 签到页标题「签到」；控制台零告警） |
> | v18 | 2026-09-14 | **合作企业业务能力对齐 + 主体快照（Mock）**：①合作企业可发布全部类型需求（发布表单身份 chips 默认「当前身份」，与预约表单一致；mock `publisherName` 按身份取企业名/组织名，个人取昵称，对齐种子 D4002/D4004 口径）；②空间预约增「以哪个身份预约」主体快照（`identityType`/`subjectName`）：社区企业/合作企业均可预约会议室等空间，「我的预约」展示身份标签与主体名；种子 SR5001=社区个体·陈屿、SR5101=社区企业·芯启半导体；③Me 菜单：社区企业 [我的需求·我的预约]、合作企业 [我的需求·我的预约·我的申请]；④契约 api-app-design §6（需求主体）/§8（预约 asIdentity 与主体快照）同步；浏览器走查（周慕深 合作企业：发布找服务需求 → 我的需求待审核、预约共享会议室 A → 记录显示 [合作企业] 云径数据；苏明远 企业预约种子显示 [社区企业] 芯启半导体）；tsc/lint/build 全绿 |
> | v19 | 2026-09-14 | **身份模型收敛：弱化企业与个人隔离（Mock）**：①**移除全局「当前身份」**——`stores/auth.ts` 删除 `currentIdentity`/`switchIdentity`/`activeIdentity*`/`switchableIdentities` 与 `joinyuu_client_identity` 持久化；顶栏只显示昵称；②身份仅作为**发布/提交归属**在表单内单选（需求/预约表单 chips：「个人用户 · 陈屿 / 社区个体 · 陈屿 / 社区企业 · 芯启半导体」，`identityOptionLabel` 统一；发布后列表展示的主体即发布方）；③「我的」页统一菜单（不再按身份隔离）：个人名片（社区个体）/ 我的积分 / 我的等级（社区个体）/ 我的项目 / 全部记录 / 编辑资料 / 站内信；④**企业管理**收敛：仅当用户是某企业负责人时显示入口，列表卡片展示所有关联企业（负责人/成员 tag），详情页负责人可编辑信息、转移负责人、邀请成员、申请退驻，成员只读（表单禁用 + 提示负责人）；⑤契约收敛为 `/me/enterprises` + `/me/enterprises/:id`（PUT / transfer-contact / invite / exit-application），移除 `PUT /me/cards/enterprise` 与旧 `/me/enterprise` 系列；经验页按个人维度取数（`identity` 参数保留兼容）；tsc/lint/build 全绿 + 浏览器走查（苏明远：菜单/企业管理列表/详情编辑保存/转移后只读；需求与预约表单身份 chips；我的等级；控制台零告警） |
> | v20 | 2026-09-14 | **「企业管理」升级为「关联身份」（Mock）**：①入口与页面更名——「我的」页「关联身份」（note=身份个数，无关联身份时隐藏），列表以卡片展示**全部身份**：社区个体（副标题 Lv.x 等级 → 点击进个人名片）+ 各关联社区企业/合作企业（角色 负责人/成员 + 名片发布状态 → 点击进企业详情），支持同类型多个；②卡片点击路由：社区个体 → `/me/cards/individual`，企业 → `/me/enterprises/:id`（负责人可编辑/邀请/转移/退驻，成员只读）；③契约：列表端点 `GET /me/enterprises` → `GET /me/identities`（`MyIdentitySummary`：key/type/label/name/subtitle/roleLabel/isContact/enterpriseId/showcaseStatus），企业详情与操作端点不变；④新增 `IdentityListView`（替换 `EnterpriseListView`），路由 `/me/identities`；⑤a11y：`main.ts` 字段 id 改全局递增序号（修复撞号），装饰性分组 label 改 `span.field-label`（需求/预约/投稿/资料/申请等表单控制台 issue 清零）；tsc/lint/build 全绿 + 浏览器走查（苏明远：2 个身份/社区个体→个人名片/芯启半导体→详情；周慕深：合作企业·云径数据；陈屿：社区个体；新居民无关联身份不显示入口；控制台零告警） |
> | v21 | 2026-09-14 | **需求表单调整（Mock）**：①移除「截止日期」（`deadline` 不再收集，历史数据保留展示；日期文案优先 `deliverBy`、回退旧 `deadline`）；②「找服务」新增「预期交付日期」（`deliverBy`，task 必填；Picker 下限今天）；③三类需求新增「联系人 / 联系电话 / 联系邮箱」（联系人、电话必填并校验 11 位手机号；邮箱选填、校验格式；详情页展示联系人信息块）；④发布身份选项：持社区个体身份时不再单列「个人用户」；⑤「以哪个身份发布」更名「发布身份」；⑥输入框圆角修复（`tokens.css` 全局 `.t-input`/`.t-textarea` 9px，与搜索框同规格）；契约 §7.1-15 与 api-app-design §6 同步；tsc/lint/build 全绿 + 浏览器走查（task 表单校验/提交、投资表单无日期项、项目列表「预期交付」、详情联系人、控制台零 issue） |
> | v22 | 2026-09-14 | **头像 / 企业 Logo / 成员职位（Mock）**：①「我的」移除「个人名片」入口（功能并入 关联身份 → 社区个体 → 个人名片）；②顶栏右侧仅显示头像（移除昵称文字）；③头像更换：`ProfileEditView` 增头像上传（Upload → `POST /uploads`，mock data URL），`PUT /me` 增 `avatar`（`AuthResult`/`UserProfile`/auth store 同步），保存后顶栏与「我的」显示图片；④企业 Logo：企业详情基本信息增 Logo 上传（负责人可上传、成员只读），企业详情/展示页返回 `logo`，展示页 banner 显示；⑤成员职位：邀请成员必填职位，负责人点成员条目修改职位（新增 `PUT /me/enterprises/:id/member-role`）；契约 api-app-design §5（PUT /me、企业行、member-role）与 §8（展示页 logo）更新；tsc/lint/build 全绿 + 浏览器走查（头像/Logo 上传保存生效、江晚晴职位更新、邀请顾青·市场专员、控制台零 issue） |
> | v23 | 2026-09-14 | **个人/企业名片简历化 + 头像同步与直传（Mock）**：①**个人名片简历化**——`MyIndividualCard` 扩为分段字段（年龄/政治面貌/行业经验 + education/work/projects/honors/socials/customLinks 条目数组，编辑器支持添加/删除），保存后公开到人才库；新增 `/talents/:uid`（`TalentCardView`，简历式精致排版：头像/等级/简介/技能/行业经验/教育·工作·项目经历/荣誉/链接），人才库列表卡片带头像并可点入；②**头像同步**——社区个体的个人名片与公开人才名片展示个人资料头像（`avatar` 随账号）；③**企业名片丰富**——企业增 `foundedAt/website/address/services/advantages`（负责人可编辑、成员只读），展示页精致排版（Logo 横幅 + 成立时间 + 主营业务 + 核心优势 + 企业信息 + 成员）；④**头像/Logo 直传**——新增 `AvatarUploader`（点头像/Logo 直接选图上传替换，隐藏 file input，圆形头像/方形 Logo 共用），移除边上上传框；⑤负责人可修改**自己**的成员职位（成员条目全部可点）；契约 api-app-design §5/§8 与 §7.1-12/16 更新；tsc/lint/build 全绿 + 浏览器走查（头像直传保存后同步顶栏/个人名片/人才库；陈屿人才名片全部分段渲染；企业字段编辑与展示页；负责人改自己职位；控制台零 issue） |
> | v24 | 2026-09-14 | **企业名片细化 + 底栏归属 + 积分入口（Mock）**：①「企业展示」标题更名「企业名片」，成员 chips 由椭圆改圆角矩形（`--td-radius-small`）；②底栏高亮修复——`/enterprises/**` 与 `/talents/**` 归属「社区」Tab（AppShell `TAB_ALIASES`）；③负责人可**移除企业成员**（成员管理弹层新增「移除成员」+ Dialog 二次确认；新增 `POST /me/enterprises/:id/remove-member`，负责人本人不可移除并提示先转移）；④「我的积分」新增「去积分商城兑换」按钮 → `/mall`；⑤企业详情页改为**管理视图**（企业名片头部 + 「编辑企业名片」入口 + 企业负责人 / 企业成员 / 退驻注销），企业基本信息编辑独立为 `/me/enterprises/:id/edit`（`EnterpriseCardEditView`，标题「编辑企业名片」，保存后返回详情）；tsc/lint/build 全绿 + 浏览器走查（企业名片标题/成员圆角、两页底栏社区高亮、移除江晚晴后成员 1 人、负责人本人弹层提示、积分页按钮跳商城、编辑名片保存返回；控制台零告警） |
> | v25 | 2026-09-14 | **全量 e2e 覆盖（Mock，浏览器点击走查）**：覆盖登录边界（验证码/冻结/不存在/成功/「暂不登录」/守卫 redirect 与 401 事件回跳）、首页/广场/社区（标语轮播、活动与资讯检索、政策弹层、人才库检索与公开名片、企业库名片状态与未发布 Toast）、项目三选项卡（检索/详情/响应 +20 与防重复）、发布需求（hub 三卡 + 找服务全校验链 + 提交待审核 + 发布身份过滤）、活动（报名/取消 + 签到四态：定位失败/围栏外 500m/关闭定位/场地内成功 +10、签到后去重）、商城（零库存与下架过滤、下单确认弹层余额预览、我的订单、devtools 发货、确认收货完成）、空间预约（身份单选、提交、我的预约取消）、内容（文章浏览量 +1、投稿校验与提交、驳回稿重新投稿）、名片（关联身份、个人名片编辑并公开人才库、企业详情、编辑企业名片、成员职位、退驻申请）、站内信（筛选/跳转/全部已读）、DevTools 开关关停态（mallOpen/demandOpen 关闭与恢复）。**修复 2 处真实缺陷**：①积分变动后余额显示不刷新（auth store `points` 仅在登录时写入）→ 新增 `auth.refreshProfile()`（GET /me 同步昵称/头像/积分），Me/我的积分/商城列表/商品详情进入时刷新，实测签到 +10 后 2,710→2,720；②空间预约「以哪个身份预约」未过滤基础「个人用户」（与需求表单口径不一致、默认身份错）→ `SpaceReserveView` 按 `hasCommunityIndividual` 过滤。tsc/lint/build 全绿、控制台 error/warn/issue 清零 |
> | v26 | 2026-09-14 | **「我的」资料卡去重**：移除资料卡右侧积分统计块（与下方「我的资产 → 我的积分」重复），`.stats` 相关样式一并清理；tsc/lint 全绿 + 浏览器验证（资料卡仅头像/昵称/UID/身份标签，我的积分 Cell 保留） |
> | v27 | 2026-09-14 | **企业成员邀请闭环 + 成员手机号维护（Mock）**：①**邀请改为邀请记录**——`inviteEnterpriseMember` 不再直接写入成员，生成 `EnterpriseInvitation`（EI 前缀）并给被邀请人发站内信（`企业邀请：<企业>`，链接 `/me/invitations/:id`）；未注册手机号 400、已是成员/重复邀请/邀请自己 409；②新增**邀请详情页** `/me/invitations/:id`（`InvitationView`：企业概要 + 邀请人/职位/状态 + 「确认加入 / 拒绝邀请」；接受写入企业成员并通知负责人，拒绝仅记状态；仅被邀请人可处理，非本人 403）；③`PUT /me/enterprises/:id/member-role` 升级为 `PUT /me/enterprises/:id/member`——成员管理弹层可同时修改**职位与手机号**（手机号 11 位校验、冲突 409）；④企业详情返回 `invitations`（待接受列表，仅负责人，成员卡片区展示「待接受」标签）；⑤站内信触发点新增：邀请发送/接受/拒绝/成员资料更新；缺口 §7.1-17（§0.3 同步补登）、§7.2-7 补邀请记录视图、§7.4-10；api-app-design §5 更新（member 行 + invitations 两行 + invite 语义）；tsc/lint/build 全绿 + 浏览器走查（成员手机号改 13900008888、邀请陈屿接受→关联身份出现企业成员卡、邀请林晚拒绝→负责人站内信提示、未注册/自己/已是成员/重复邀请四类拦截、控制台零告警） |
> | v28 | 2026-09-14 | **企业成员权限分配 + 企业库列表去成员（Mock）**：①**成员权限体系**——8 项权限（发布需求/响应需求/空间预约/文章投稿/管理成员/邀请成员/分配权限/编辑企业名片；`constants/enterprise.ts` 目录含说明文案），负责人默认全部、成员由负责人勾选分配（成员管理弹层 CheckboxGroup，负责人行显示「默认拥有全部权限」）；②`PUT /me/enterprises/:id/member` 支持 `permissions`（需 `assign_permission`；role/phone 需 `manage_members`），`invite`/`remove-member`/企业信息编辑分别校验 `invite_member`/`manage_members`/`edit_card`（无权限 403）；③企业详情按 `myPermissions` 显隐（编辑名片入口/邀请按钮/成员操作/权限编辑），编辑名片页允许 edit_card 成员进入；④**代企业主体**：被授权成员在需求发布/空间预约表单中自动出现「社区企业 · <企业>」身份选项，payload 传 `asEnterpriseId`，mock 校验 `publish_demand`/`space_reserve` 并以企业名入主体快照（我的预约显示 [社区企业] 企业名）；权限撤销后选项即时消失；⑤**企业库列表不再显示企业成员行**（名片/详情仍展示）；⑥响应需求/文章投稿的代企业主体字段待后端支持（登记 §7.1-17 注记）；缺口 §7.1-17 扩写、§7.2-7 补权限视图、§7.4-10 扩写；api-app-design §5/§6/§8 同步；tsc/lint/build 全绿 + 浏览器走查（江晚晴种子权限回显、陈屿接受邀请后分配 5 项权限、企业身份发布需求与预约、撤销发布需求后选项消失、企业库无成员行、控制台零告警） |
> | v29 | 2026-09-14 | **成员管理改为独立页（修复弹窗无法上下滑动）**：原成员管理为底部 Popup（8 项权限 + 职位/手机号，内容超出视口无法滚动）→ 新增独立页 `/me/enterprises/:id/members/:memberKey`（`EnterpriseMemberView`：成员头部 + 成员信息 + 成员权限勾选 + 保存/移除；权限/角色与详情页口径一致，负责人显示默认全权提示；保存或移除后返回企业详情）；企业详情成员行改为路由跳转（`memberKey` 取 uid 或姓名，encodeURIComponent）；`AppShell` 标题映射「成员管理」；邀请成员仍为弹窗（字段少）；tsc/lint/build 全绿 + 浏览器走查（滚动 1390>924 可上下滑动、权限勾选保存后回详情再进持久化、移除入口与提示、控制台零告警） |
> | v30 | 2026-09-15 | **实名认证入口（Mock）**：「编辑资料」页新增「实名认证」Cell（note 已认证/未认证）；新增 `/me/realname`（`RealNameView`：未认证 → 姓名 + 18 位身份证号提交；已认证 → 脱敏展示 姓名首字 + 证件号前 4 后 4 + 认证时间，提示修改需联系运营）；契约 `GET/PUT /me/realname`（缺口 §7.1-18）；mock 姓名/证件号校验（含身份证校验码）与提交即通过 + 站内信；`accounts` 增 `realName/citizenId`（苏明远、林晚为已认证种子）；tsc/lint/build 全绿 + 浏览器走查（新居民 未认证 → 非法证件号拦截 → 通过后 `沈*`/`3301**********123X`；陈屿/苏明远 note 已认证；控制台零 issue） |
>
> 契约基线：`docs/api-app-design.md`（/api/app/** 端点设计）；业务规则：`docs/wiki-backend.md` §8；实体模型：`docs/entity-fields.md`（43 模型）；管理端参照：`docs/wiki-admin-web.md`。
> 铁律：Mock 期间一切「超出当前后端边界」的功能，代码中以 `// [MOCK-ONLY]` 注释标记，并在本文档 §7 缺口登记表集中登记；M2 接入真实后端时逐条销号。

---

## 1. 目标与总体策略

### 1.1 为什么 Mock-First

- M0→M1 已验证该路径：admin 以 `src/api/` 函数签名为契约、`src/mock/` 提供数据与实现，视图层零改动切换真实 HTTP。
- 客户端交互密度高（移动端流程多），先固化交互与信息架构，再实现 `/api/app/**`，可避免后端反复返工；Mock 交付物本身即可作为后端实现的验收脚本（页面能跑通的流程 = 端点必须支持的能力）。

### 1.2 策略要点

1. `apps/client-mobile` 为**独立服务**：独立 package（`@joinyuu/client-mobile`）、独立 Vite 实例（dev **7759**）、独立构建产物；**不 import admin/api 的任何源码**，与后台管理系统零粘连。
2. API 层按 `docs/api-app-design.md` 逐端点定义函数签名（参数/返回类型），Mock 实现与未来 HTTP 实现同签名；构建期以 `VITE_API_MODE=mock|http` 绑定实现，视图层无感切换。
3. Mock 可**超出当前边界**：站内信、签到、首页聚合等 Mock 全量交付交互；每一处超界登记 §7 缺口表（后端缺口 / 后台缺口 / 契约文档待修订项）。
4. Mock 数据从 `apps/api/prisma/seed-data/` 派生（同字段形态、同 ID 体系），保证切真实接口时数据与类型无认知差。
5. **客户端拆分为两个独立应用/入口**（2026-09-12 决定，**先移动端后桌面端**）：
    - `apps/client-mobile`（`@joinyuu/client-mobile`）——移动端，由原 `apps/client` 改名而来，dev **7759**；**2026-09-13 收敛为纯移动端**（移除 `views/desktop/**`、`dualView.ts`、`tdesign-vue-next`），信息架构按社区视角重构为 5 Tab（首页/项目/社区/广场/我的）。
    - `apps/client-web`（`@joinyuu/client-web`）——桌面端，**待创建**，将承接原桌面视图与 `tdesign-vue-next` 依赖。
    - 两应用各自独立构建与部署，且**互不加载对方组件库**（原因见 `wiki-client-mobile.md` §3：两库共用 `--td-*` 令牌与 `.t-*` 类名，同文档同时加载会互相误命中）。

---

## 2. 独立服务边界

| 项 | 约定 |
|---|---|
| 包 | `apps/client-mobile` → `@joinyuu/client-mobile`（workspace 独立成员；桌面端将新建 `apps/client-web` → `@joinyuu/client-web`） |
| 端口 | dev `7759`；构建产物独立（`dist/`），未来独立部署（静态托管即可，CSR） |
| 代理 | Vite proxy：`/api` → `http://127.0.0.1:7757`（接入期生效；Mock 期不出网） |
| 代码隔离 | 禁止 import `@joinyuu/admin`、`@joinyuu/api` 源码；允许共享的只有「约定与模式」（请求封装风格、tokens 命名、目录习惯），必要类型在 client 内独立声明 |
| 类型来源 | `src/types/` 依据 `docs/api-app-design.md` + `docs/entity-fields.md` 独立声明（不用 admin 的 types/index.ts，避免粘连；接入期与 wiki 契约逐字段核对） |
| UI 库 | 移动端 `tdesign-mobile-vue@^1.16`（已收敛纯移动端，桌面库已移除）；桌面端 `tdesign-vue-next@^1.20` 待 `client-web` 创建时引入 |
| 根脚本 | 新增 `dev:client-mobile` / `build:client-mobile`（workspace filter；桌面端应用创建后补 `dev:client-web` / `build:client-web`） |

---

## 3. Mock 架构与切换策略

### 3.1 分层

```
src/
├── api/                  # 契约层：逐端点函数签名（唯一视图层依赖）
│   ├── http.ts           # 请求封装（mock/http 双模式绑定点）
│   ├── auth.ts  config.ts  me.ts  home.ts  community.ts
│   ├── demands.ts  events.ts  mall.ts  spaces.ts
│   ├── contents.ts  notices.ts  applications.ts  projects.ts
│   └── experience.ts  enterprises.ts
├── mock/                 # [MOCK-ONLY] Mock 实现（http 模式下整目录不参与打包）
│   ├── db.ts             # 内存数据库（seed 派生实体集 + 运行时可变状态）
│   ├── session.ts        # 模拟 JWT/会话/多身份
│   ├── handlers/         # auth/config/me/home/community/demands/events/mall/spaces/contents/notices/applications/projects/experience/enterprises
│   └── latency.ts        # 模拟网络延迟与错误注入
├── composables/          # 业务逻辑（useAsyncList / useDict；视图层禁写业务）
├── stores/               # auth / config / notices（breakpoint 已无使用方，见 §7.5）
├── types/                # 实体与 API 类型（独立声明）
├── views/mobile/         # 移动视图（tdesign-mobile-vue；纯移动端，无 desktop/）
├── components/shared/    # 零组件库依赖的共享组件
├── devtools/             # [MOCK-ONLY] 开发者工具（仅 mock 模式挂载）
└── styles/tokens.css     # TDesign 令牌 + 客户端布局补充
```

### 3.2 模式切换

- `VITE_API_MODE`（默认 `mock`）：`mock` 时 `src/api/*.ts` 内部绑定 `src/mock/handlers/*`；`http` 时改绑 `http.ts` 真实请求——函数签名与返回类型完全一致，视图层零改动。
- Mock 模式响应同样走包络 `{ code: 0, data }` 与 `{ code, message }` 错误形态，错误文案与 wiki 中文口径一致（切换后无感知差异）。

### 3.3 会话与多身份 Mock

- `mock/session.ts` 维护模拟会话：登录成功签发假 JWT（payload `{ sub: uid, scope: 'app', identities: [...], jti }`），存 localStorage（`joinyuu_client_token`），TTL 与未来后端一致。
- 演示账号 = seed 用户派生（见 §4），覆盖单身份/双身份/三身份/企业成员等形态；`devtools/` 提供**身份切换器**（免登录快速切换演示账号）——`[MOCK-ONLY]` 开发工具，不登记缺口。
- 注册：受 `registrationOpen` 开关控制；验证码 Mock 直接在输入框 placeholder 提示固定码 `8888`（[MOCK-ONLY]，真实接入后走图形验证码接口）。

### 3.4 渲染与包体（2026-09-13 纯移动端）

- 路由单套（history 模式），直连 `views/mobile/*`；不再有断点分流、`dualView` 或桌面 chunk。
- 依赖：`tdesign-mobile-vue` + `tdesign-icons-vue-next`；桌面端 `tdesign-vue-next` 随 `client-web` 重建（未创建）。
- **已知遗留**：`vite.config.ts` 的 `manualChunks` 仍保留 `tdesign-vue-next → vendor-tdesktop` 死分支；`stores/breakpoint.ts` 无使用方（见 §7.5）。
- 地理定位：`navigator.geolocation`（localhost dev 可用）；Mock 期「模拟位置注入」工具**未实现**（`__mockGeolocation` 仅声明无赋值点，见 §7.5）。

---

## 4. Mock 数据设计

### 4.1 实体来源与形态

- 全部实体从 `apps/api/prisma/seed-data/*.ts` 派生：users/identities、enterprises、demands、events+enrollments、projects+milestones、goods+orders、spaces+reservations、articles+columns、announcements、points/experience records、rules/levels。
- 2026-09-13 细化：mock 数据仍为手工策展（内容与 `seed-data/*` 有差异）；已修正人才库 uid/姓名与演示账号冲突、政策改 `PL` 前缀（避免与积分流水 `PT` 撞号）、字典补齐 4 类（industry/goods_category）、活动日期相对「今天」生成；首页活动卡改由活动列表派生，保证时间/报名数一致。
- 字段形态与 `docs/entity-fields.md` 对齐（时间 `YYYY-MM-DD HH:mm`、ID 前缀体系 U/E/AP/D/P/EV/XE/EX/PT/G/RO/WS/WA/LS/S/SR/A/SU/CL/SC/AN/N/AL）。
- 可变状态（报名/下单/预约/已读标记）在 `mock/db.ts` 内存演进，刷新重置（可加 localStorage 持久化开关，devtools 提供「重置 Mock 数据」）。

### 4.2 演示账号矩阵

| 账号（手机号） | 身份 | 用途 |
|---|---|---|
| 13800000001（陈屿） | 个人用户 + 社区个体（Lv.4） | 主演示：全功能（签到/订单/预约/投稿） |
| 13800000002（苏明远） | 个人用户 + 社区个体（Lv.3）+ 社区企业成员（芯启半导体·创始人） | 三身份切换提交 |
| 13800000003（林晚） | 个人用户 + 社区企业成员（木白设计工作室·总经理） | 企业身份视角/企业名片（联系人） |
| 13800000004（周慕深） | 个人用户 + 合作企业成员（云径数据 external_enterprise） | 合作方视角/企业名片申请入口 |
| 13800000005（新居民） | 个人用户（新注册态，无流水） | 空态走查 |
- 密码统一 `client123`（Mock 任意密码也可登录，devtools 可关）；冻结账号 1 个用于登录边界（「账号已冻结」错误态）。

### 4.3 站点配置 Mock

`GET /api/app/config` 返回：站点名称/标语 + `registrationOpen / mallOpen / demandOpen / reservationOpen`（默认全开）。devtools 提供开关面板实时切换，验证各端入口隐藏与写端点 400 文案。

---

## 5. 信息架构与页面清单（约 30 路由）

> 标注：〔内〕= 当前边界内（后端已有对应能力，接入期直连）；〔外〕= 超出当前边界（Mock 交付，接入需补，见 §7）。
> 2026-09-13 纯移动端重构后：原 `/demands` 列表并入 `/projects`（项目页，复用需求数据）；新增 `/community`、`/plaza`、`/intros/:kind`；桌面端移交 `client-web`（未创建）。当前路由全量以 §0.2 为准。

### 5.1 公开页

| 路由 | 页面 | 功能点 | 边界 |
|---|---|---|---|
| /login | 登录 | 手机号+密码+验证码；冻结账号错误态；跳转 redirect | 〔内〕（登录本身内；多身份 JWT 签发为后端新能力，接入时实现） |
| /register | 注册 | 开关停用态；手机号唯一；默认 individual 身份；注册即登录 | 〔内〕 |
| / | 首页 | 站点信息/标语、进行中活动横排、最新需求、置顶文章、未读站内信入口〔外〕 | 聚合数据〔外〕（需 app 首页聚合端点） |
| /projects（原 /demands） | 项目（原需求广场） | published 列表；类别（字典）/关键词筛选；分页；可见范围过滤〔外：服务端过滤，Mock 前端模拟〕 | 列表〔内〕；范围过滤服务端〔外·B〕 |
| /demands/:id | 需求详情 | 详情/响应数/发布方身份快照；不可见 404；响应入口 | 〔内〕 |
| /events | 活动中心 | published 且未结束；类型/关键词；可见范围 | 〔内〕 |
| /events/:id | 活动详情 | 报名进度/容量/截止/我是否已报名/取消；**签到入口（时间窗内）**〔外〕 | 详情报名〔内〕；签到〔外〕 |
| /articles、/articles/:id | 文章列表（栏目筛选）/ 详情（浏览量+1） | 〔内〕 |
| /mall、/mall/:id | 商品列表（on 且库存>0）/ 详情 | mallOpen 开关 | 〔内〕 |
| /enterprises/:id | 企业名片 | published 才可见 | 〔内〕 |

### 5.2 登录后页（/me 与提交流）

| 路由 | 页面 | 功能点 | 边界 |
|---|---|---|---|
| /me | 个人中心 | 资料/多身份卡（各身份经验等级）/积分余额/快捷入口 | 〔内〕 |
| /me/profile/edit | 资料编辑 | 昵称/性别/简介 | 〔内〕 |
| /me/points | 积分流水 | 分页；来源标识；余额 | 〔内〕 |
| /me/experience | 经验与等级 | 各身份经验值流水/当前等级进度 | 〔内〕（经验流水模型已有，端点设计稿未单列，接入时补端点——§7-8） |
| /me/demands | 我的需求 | 全状态；pending 驳回原因 | 〔内〕 |
| /demands/new | 提交需求 | 选身份快照；demandOpen 开关；提交即 pending | 〔内〕 |
| /me/responses | 我的响应 | 响应记录 | 〔内〕 |
| /me/enrollments | 我的报名 | 含活动信息与状态；pending/approved 可取消 | 〔内〕 |
| /me/projects | 我的项目 | 本人/企业承接；进度与里程碑只读 | 〔内〕 |
| /me/orders | 我的订单 | 状态 pending_shipment/shipped/completed | 〔内〕 |
| /me/reservations | 我的预约 | 可取消 pending/approved | 〔内〕 |
| /me/articles | 我的投稿 | 含驳回原因、可再提交 | 〔内〕 |
| /me/applications | 我的申请 | 审核时间线 | 〔内〕 |
| /notices | 站内信中心〔外〕 | 列表/类型筛选（审核结果/报名结果/系统通知/积分与签到）/未读角标/已读/全部已读/跳转业务页 | **〔外〕**（§7-1） |
| /events/:id/check-in | 签到页〔外〕 | 时间窗校验/geolocation 定位/围栏距离校验/成功态与积分反馈/失败原因（不在围栏/未开始/已结束/重复签到） | **〔外〕**（§7-2） |
| 提交流（弹层或子页） | 需求提交/报名确认/兑换下单/预约提交（日历+时段）/投稿编辑/申请提交（4 类）/企业名片申请 | 表单与校验；开关控制 | 〔内〕（投稿编辑器：桌面用富文本、移动用多行文本+图片占位，Mock 不接上传——上传接入期补，§7-6） |

### 5.3 移动端 TabBar

首页 / 项目 / 社区 / 广场 / 我的（2026-09-13 重构后）；站内信入口在「我的」+ 首页顶部铃铛（未读角标）。

---

## 6. 核心功能详设

### 6.1 注册登录与多身份

- 注册：手机号（11 位校验）+ 密码（≥8 位含字母数字，与 admin 同强度文案）+ 验证码；成功即登录并授予 individual。
- 登录：错误文案与 admin 同口径（账号或密码错误/账号已冻结/验证码错误或已过期）。
- 会话：token 过期/登出 → 清 stores 回登录页带 redirect；401 统一拦截。

### 6.2 需求广场

- 列表：类别 chips（字典 demand_category）+ 关键词；卡片含发布方身份标签、截止、响应数。
- 提交：选身份（多身份用户弹出身份选择；快照字段按 wiki §8.7）→ 提交即 pending →「我的需求」可见驳回原因。
- 响应：详情页底部响应（附响应说明）→ 成功后站内信〔外触发〕+ 积分 `demand_responded`（Mock 直接写流水〔外〕）；不可响应自己/重复响应 409 文案。

### 6.3 活动中心与签到〔外〕

- 报名：容量/截止/`requireReview` 三态（成功/待审核/候补文案按 wiki）；`enrollmentIdentities/Levels` 校验不通过时按钮禁用+原因提示（Mock 前端模拟，接入后服务端校验）。
- **签到页**（新增，超界）：
  - 前置：活动含签到配置——场地经纬度、签到半径（米，默认 200）、签到时间窗（开始前 30 分钟 ~ 结束）；
  - 流程：进入签到页 → 请求 geolocation → 计算与场地直线距离（Haversine）→ 围栏内且在时间窗 → 签到成功（动画 + 积分 `activity_checkin` + 站内信）→ 失败态文案（距场地 X 米，超出签到范围 / 未到签到时间 / 活动已结束 / 已签到过）；
  - 边界：未授权定位 → 引导开启；`daily_login`/签到积分自然日去重（Mock 简化为活动维度一次）；
  - devtools「模拟位置注入」：预设「场地内 / 场地外 500m / 关闭定位」三种场景按钮，覆盖成功与全部失败态。

> 2026-09-13 细化：签到链路（Haversine 距离 / 时间窗 / 围栏 / 防重复 / 积分 / 站内信）已完整交付；DevTools 增「场地内 / 场地外 500m / 关闭定位 / 清除注入」四按钮（写入 `__mockGeolocation`）与「签到活动时间窗对齐当前」，任意时间可演示成功与全部失败态；失败文案按活动 `checkinOpenMin` 动态提示；活动日期相对「今天」生成，报名/签到不再随日期失效。

### 6.4 积分商城

- 列表：on 且库存>0；详情：积分价/库存/兑换说明。
- 下单：积分余额校验（不足 → 409「积分不足」）→ 确认弹层（扣除后余额预览）→ 事务语义 Mock（扣积分+写流水+扣库存+建订单 pending_shipment）→ 站内信「兑换成功，待发货」〔外〕。
- 我的订单：状态流转 Mock（devtools 可将订单推进为已发货/已完成，模拟后台发货动作——接入后该动作为管理端能力，登记 §7-4）。

> 2026-09-13 细化：下单确认弹层（商品/消耗/兑换后余额预览 + 积分不足前置提示）已实现；订单链路补 `confirmOrder`（shipped → completed，契约 `POST /api/app/mall/orders/:id/confirm`，缺口 §7.1-10）与 MyOrders「确认收货」；DevTools 增「当前账号一笔待发货订单 → 已发货」推进（模拟后台发货）。mock 订单状态用 `completed`，后端/管理端为 `finished`，接入期需统一口径（§7.1-10）。

### 6.5 空间预约

- 空间列表（needApproval/设备/容量）；详情选日期 → 当日时段占用图（已通过预约 + 活动占用，Mock 静态生成）→ 选时段提交 → pending → 站内信「预约已提交」〔外〕；冲突 409 文案同 wiki §8.8；reservationOpen 关闭隐藏入口。

> 2026-09-13 细化：「我的预约」已接入取消入口（pending/approved，Dialog 二次确认 + 刷新）；取消端点未在设计稿登记，已补登 §7.4-2。

### 6.6 内容与投稿

- 文章列表/详情（published；栏目 chips）；投递：标题+栏目+正文（桌面富文本只读演示/Mobile 纯文本）→ SU 前缀 pending → 站内信「投稿已提交」〔外〕；驳回稿可见原因并可再提交。
- 企业名片申请：合作企业成员可见入口 → 提交 → 管理端审核联动 showcaseStatus（Mock 直接改状态演示全链路）。

> 2026-09-13 细化：企业名片申请入口已接入社区·企业库卡片（企业成员显示「申请企业名片 ›」，非成员显示「企业名片未发布」）；mock「提交即发布」为演示捷径（管理端审核能力已存在，接入期改回 pending 流程）；投稿增图片上传占位（点击提示接入后开放，§7.1-6）；驳回稿可「重新投稿」。2026-09-13 更名：展示页统一改称「名片」（企业名片/个人名片）。

### 6.7 站内信中心〔外〕

- 类型：审核结果（申请/需求/预约/投稿/名片）、报名结果、订单与积分、系统通知（含签到成功）。
- 功能：未读角标（TabBar/铃铛）、列表（类型筛选/分页）、点击已读并跳转对应业务页、全部已读。
- Mock 触发点：在 mock handlers 的每个业务动作内同步写通知实体（与未来后端触发点一一对应，代码 `// [MOCK-ONLY] 通知触发点` 标记）。

### 6.8 首页聚合〔外〕

- 首页一次性取「精选活动 + 最新需求 + 置顶文章 + 未读数 + 站点信息」；Mock 合并下发；接入期需新增 `GET /api/app/home` 聚合端点（§7-5）。

---

## 7. 边界外功能与缺口登记表（接入 M2 真实后端时逐条销号）

### 7.1 后端缺口

| # | 缺口 | 涉及 | 契约动作 | 优先级 |
|---|---|---|---|---|
| 1 | **站内信**：`UserNotification` 模型（id UN；type audit_result/enroll_result/order/points/system；title/content/at/read/link?；userId）+ 端点（列表/未读数/标记已读/全部已读）+ 触发点（申请审核结果、需求审核结果、报名结果、预约审核结果、投稿审核结果、下单/发货、签到成功、注册欢迎） | /notices、各业务流 | api-app-design.md 新增 §12 站内信 | P0 |
| 2 | **签到**：Activity 增 `venueLat/venueLng/checkinRadiusM/checkinOpenMin/checkinCloseMin`（迁移）+ `POST /api/app/events/:id/check-in`（geolocation 距离校验 + 时间窗 + 防重复 + `activity_checkin` 积分接线）+ 签到记录存储（Enrollment 增 checkinAt/checkinLat/Lng 或独立表） | /events/:id/check-in | api-app-design.md §7 扩充 | P0 |
| 3 | **首页聚合端点** `GET /api/app/home`（精选活动/最新需求/置顶文章/未读数/站点信息一次下发） | / 首页 | api-app-design.md §4 扩充 | P1 |
| 4 | **多身份 JWT 签发**：register/login 返回 `{ token, uid, name, identities[], points }`（scope='app' AppJwtGuard） | 全局 | api-app-design.md §2 细化 | P0 |
| 5 | **app 首页之外的批量字典下发** `GET /api/app/dicts`（一次返回 4 类启用项，减少请求数；可选）。已核对：后端字典种子已含 4 类（含 `goods_category`），客户端 mock 仅 2 类（demand_category/event_type），接入期补 industry/goods_category | 全局筛选 | api-app-design.md §4 扩充 | P2 |
| 6 | **app 通用上传（投稿配图 / 申请资料）**：`POST /api/app/uploads`（multipart，图片/PDF；魔数嗅探与大小限制同 admin，复用存储管线）；申请附件（营业执照、作品集等）复用本端点 | /articles/new、三个申请表单 | api-app-design.md §8 扩充 | P1 |
| 7 | **经验值流水端点** `GET /api/app/me/experience-records`（个人中心经验/等级页；设计稿未单列）。客户端已收敛为无全局身份切换：经验页按**个人维度**取数（有社区个体→个人经验，否则空）；`identity` 查询参数保留兼容（未来企业经验按 `targetType=enterprise` + enterpriseId 维度查询，企业等级可挂在企业管理详情） | /me/experience、/me/points | api-app-design.md §5 扩充 | P1 |
| 8 | **积分触发点接线**：`daily_login`（自然日去重）/`demand_responded`/`demand_published`/`demand_undertaken`/`project_milestone`/`article_accepted` | 登录与各业务流 | wiki-backend §8.4 已列，随接入落地 | P0 |
| 9 | **可见范围/可报名范围服务端过滤**（列表 SQL 条件 + 详情 404，身份×等级交集，空数组=不限） | demands/events | api-app-design.md §9 已设计，接入实现 | P0 |
| 10 | **订单状态流转**（后台发货→shipped；客户端确认收货→completed 端点）。已核对：客户端 mock 用 `completed`，后端/管理端为 `finished`，接入期需统一 | /me/orders | api-app-design.md §8 扩充（确认收货端点） | P1 |
| 11 | **app 图形验证码** `GET /api/app/auth/captcha`（登录/注册页需要；admin 图形验证码实现可复用，需补 app 版签发与校验） | /login、/register | api-app-design.md §2 扩充 | P1 |
| 12 | **社区服务/人才库/企业库** `GET /api/app/community/policies` / `.../talents` / `.../talents/:uid`（公开人才名片：简历式分段字段，头像取个人资料 `avatar`）/ `.../enterprises`（社区 Tab 三数据源；政策类与人才库的运营数据来源与字段需先定：人才库 role/skills 在 User/UserIdentity 中无对应） | /community、/talents/:uid、/intros/:kind | api-app-design.md 新增章节；admin 运营来源待定（§0.5） | P1 |
| 13 | **预约取消** `POST /api/app/spaces/reservations/:id/cancel`（客户端「我的预约」取消；admin 已有同语义端点可迁移） | /me/reservations | api-app-design.md §8 扩充 | P2 |
| 14 | **申请表单 schema 下发** `GET /api/app/application-form/:type`（企业入驻 settle / 合作伙伴 cooperation / 人才登记 individual 的自定义字段：类型/必填/选项/上传属性；客户端按 schema 渲染） | 三个申请表单 | api-app-design.md §5 扩充；后台需配套「申请表单字段配置」（§7.2-5） | P1 |
| 15 | **需求类型与专属字段** `Demand` 增 `demandType`（task 找服务 / investment 找投资 / cooperation 找合作）；task 专属 `deliverable/budget/deliverBy`（预期交付日期），investment 专属 `cooperationNeed/returnOffer`，cooperation 专属 `bottleneck/partnershipMode/returnOffer`；三类均含联系人 `contactName/contactPhone/contactEmail`；`POST /api/app/demands` 增加 kind/categoryDict 与上述字段（`deadline` 不再收集，历史字段保留展示），列表支持可选 `kind` 筛选（项目页三选项卡），详情返回；「我的需求」返回 kind | /demands/new 三类表单、项目页三类选项卡、详情、我的需求 | api-app-design.md §6 扩充；后台需配套展示（§7.2-6） | P1 |
| 16 | **个人名片与关联身份**（身份模型收敛：无全局「当前身份」）`GET /api/app/me/cards` + `PUT /me/cards/individual`（**简历式**个人名片：姓名/年龄/政治面貌/个人简介/行业经验/相关技能 + 可增删分段 教育经历·工作经历·项目经历·荣誉证书·社交媒体链接·自定义链接；头像同步个人资料；真实后端应提交审核，mock 保存即发布，公开到人才库 `/talents/:uid`）；**关联身份**：`GET /me/identities`（社区个体 + 我关联的全部社区企业/合作企业，可多个；含 `roleLabel`/`isContact`/`enterpriseId`）、`GET /me/enterprises/:id`（关联人可查看、负责人可编辑：基本信息 + Logo + 成立时间/官网/办公地点/主营业务/核心优势 + 成员职位）、`PUT /me/enterprises/:id`、`POST /me/enterprises/:id/transfer-contact`（转移负责人 = 后台 `contactUserId`）/`invite`（须指定职位）/`remove-member`（移除成员，负责人本人需先转移）/`exit-application`（退驻/注销走管理端审核）；企业名片编辑独立成页（详情保留负责人/成员/退驻 + 「编辑企业名片」入口） | /me/cards/individual、/talents/:uid、/me/identities、/me/enterprises/:id、/me/enterprises/:id/edit | api-app-design.md §5 扩充；后台审核与成员管理口径待定（§7.2-7） | P2 |
| 17 | **企业成员邀请闭环**（[MOCK-ONLY]）：邀请不再直接写入成员，改为生成邀请记录并发站内信给被邀请人；新增 `GET /api/app/invitations/:id`（邀请详情：企业概要 + 邀请人/职位/状态，仅被邀请人或邀请方负责人可看）与 `POST /api/app/invitations/:id/respond`（`action=accept\|reject`；接受写入企业成员并通知负责人，拒绝仅记状态）；`PUT /me/enterprises/:id/member-role` 改为 `PUT /me/enterprises/:id/member`（可同时改职位与手机号）；企业详情返回 `invitations`（待接受列表，仅负责人）；被邀请手机号需已注册（未注册返回 400，真实后端应支持短信邀请）；**成员权限体系**（8 项：`publish_demand/respond_demand/space_reserve/article_submit/manage_members/invite_member/assign_permission/edit_card`）：负责人默认全部，成员由负责人分配；`PUT /me/enterprises/:id/member` 支持 `permissions`（需 `assign_permission`），role/phone 需 `manage_members`，`invite`/`remove-member`/企业信息编辑分别校验 `invite_member`/`manage_members`/`edit_card`；`GET /me/identities` 与 `GET /me/enterprises/:id` 返回 `permissions`/`myPermissions`；需求发布与空间预约支持 `asEnterpriseId` 代企业主体并校验对应权限（成员被授权后表单自动出现企业身份选项）；**响应需求/文章投稿的代企业主体字段与校验（`respond_demand`/`article_submit`）待后端支持 author/responder 覆盖后接入**（本轮仅权限可分配） | /me/invitations/:id、/me/enterprises/:id、需求发布/空间预约表单 | api-app-design.md §5/§6/§8 扩充；后台邀请记录与权限视图可选（§7.2-7） | P2 |
| 18 | **实名认证** `GET /api/app/me/realname`（状态：脱敏姓名首字 + 证件号前 4 后 4）、`PUT /api/app/me/realname`（提交真实姓名 + 18 位身份证号；已认证 409）；真实后端需接三要素/公安库核验后回写并发送站内信，mock 即时通过；`User.realName/citizenId` 字段已存在但无 app 端点 | /me/profile/edit（入口 note）、/me/realname | api-app-design.md §5 扩充（已完成）；后台实名审核视图可选（§7.2-7） | P2 |

> 2026-09-13 核对（`apps/api` 现状）：16 条缺口全部未按 app 契约实现（`/api/app/**` 路由数为 0）；v27 新增缺口 17（企业成员邀请闭环），v30 新增缺口 18（实名认证——`User.realName/citizenId` 字段已存在，缺少 app 提交端点与三要素核验接入）。其中 2/6/8/10 有底层可复用能力——admin 代签（`POST /api/admin/events/:id/checkin` + `checkedIn/checkInAt` 字段 + 积分接线）、上传管线（`StorageService`/`AssetsService.upload` 魔数嗅探 + `/api/public/files/:key`）、积分引擎（`issuePoints/issueExperience`；已接 `activity_checkin`/`activity_enroll_approved`/`identity_first_bind`，`daily_login` 规则种子为停用且无自然日去重）、订单发货/完成（ship/finish/cancel，终点为 `finished`）。另：`User.passwordHash` 字段已存在可支撑 app 注册/登录；app 鉴权需新增 `scope='app'` 签发与 AppJwtGuard 并让现有 admin 守卫对 app 路径短路。

### 7.2 后台（admin）缺口

| # | 缺口 | 说明 | 优先级 |
|---|---|---|---|
| 1 | 活动表单增「签到配置」：场地坐标（地图选点或经纬度手输）、签到半径、签到时间窗 | 配合签到（§7.1-2） | P0 |
| 2 | 报名/签到名单页增「签到方式」标识（签到显示距离与坐标）与手动补签 | 运营兜底 | P1 |
| 3 | 订单管理发货动作与站内信联动（发货时写 UserNotification） | 配合站内信（§7.1-1） | P1 |
| 4 | 站内信运营视图（可选）：按用户查询发送记录/系统群发 | 依赖 §7.1-1 落地 | P2 |
| 5 | 申请表单字段配置：运营在后台自定义各申请类型表单字段（增删/必填/选项/顺序/上传项），客户端按 schema 渲染 | 配合 §7.1-14（企业合作 / 人才登记流程） | P1 |
| 6 | 需求类型与专属字段：需求审核/发布页与列表展示 `demandType`（找服务 / 找投资 / 找合作）及专属字段（期望交付/预算、合作需求/可提供回报、合作诉求/合作方式/可提供资源） | 配合 §7.1-15 | P1 |
| 7 | 名片与企业管理后台支撑：名片编辑审核口径（企业有 `showcaseStatus` 审核流；个人名片与人才库联动字段的后台视图待定）；企业成员邀请/移除、负责人（联系人）转移、退驻/注销审核的后台能力；成员邀请记录视图（待接受/已拒绝，可选）与成员权限展示/配置（可选：8 项权限，负责人默认全部） | 配合 §7.1-16 / §7.1-17 | P2 |

> 2026-09-13 核对结论：缺口 1【无：`EventFormDialog` 无任何签到地理/时间窗字段】；缺口 2【部分：手动补签已有（活动详情「签到管理」Tab + `POST /api/admin/events/:id/checkin`），缺签到方式/距离/坐标标识】；缺口 3【无：发货仅改状态 + 审计，业务域均未写通知，且 `UserNotification` 模型不存在】；缺口 4【无：仅管理员维度铃铛通知（`AdminNotification`），无按用户查询/群发】。

### 7.3 契约文档待修订清单

- `docs/api-app-design.md`：新增 §12 站内信；§7 扩签到；§4 扩首页聚合（含 banner 运营位）与批量字典；§8 扩确认收货（`completed` 与后端 `finished` 口径对齐）/预约取消/经验流水/app 通用上传（图片/PDF）；§2 细化多身份 JWT 响应结构与 app 图形验证码；§5 扩申请表单 schema（`GET /application-form/:type`）、附件字段与个人名片/企业管理（`GET /me/cards`、`PUT /me/cards/individual`、`GET /me/enterprises`、`GET/PUT /me/enterprises/:id`、`transfer-contact`/`invite`/`exit-application`）；§6 扩需求类型与专属字段（`kind`/`categoryDict`/deliverable/cooperationNeed 等）；新增社区服务/人才库/企业库端点（policies/talents/enterprises）。
- `docs/entity-fields.md`：新增 UserNotification；Activity 签到字段（venueLat/venueLng/checkinRadiusM/checkinOpenMin/checkinCloseMin）；Enrollment 签到字段（checkinAt 已存在，位置/方式待定）；字典类型注记（schema 注释写 3 类、实际 4 类含 goods_category）。

### 7.4 Mock 期超界功能登记（2026-09-13 核对新增，接入期逐条销号）

> 此前代码已实现但 §7 未登记的超界项；Mock 阶段允许超界，接入前必须按本表销号。

| # | 功能 | 客户端实现 | 缺口指向 |
|---|---|---|---|
| 1 | 社区服务/人才库/企业库 3 端点 | `api/community.ts` + `CommunityView`/`IntroView`（政策 PL1~PL6、人才库、企业库） | §7.1-12；运营数据来源需 admin 侧明确 |
| 2 | 预约取消 `POST /api/app/spaces/reservations/:id/cancel` | `api/spaces.ts` + mock handler（我的预约取消入口已接入） | §7.1-13 |
| 3 | 图形验证码 `GET /api/app/auth/captcha` | `api/auth.ts`（mock 固定 8888；函数当前无调用者） | §7.1-11 |
| 4 | 首页 banner 运营位 | `HomeFeed.banners` + mock 硬编码 | 并入 §7.1-3 首页聚合端点 |
| 5 | 展示页申请「提交即发布」演示捷径 | `mock/handlers/enterprises.ts`（`[MOCK-ONLY]`） | 无后端缺口（管理端审核联动已存在），接入期改回 pending 审核流 |
| 6 | 企业合作 hub 与三流程独立页 | `EnterpriseCoopView`（企业入驻/合作伙伴对比选择）+ 独立介绍页与表单页（`ApplicationSettle/Cooperation/IndividualView`，schema 驱动渲染） | 申请类型沿用 settle/cooperation/individual；schema 与附件缺口见 §7.1-14 / §7.1-6 |
| 7 | 申请资料上传（图片/PDF） | `api/uploads.ts` + mock data URL（表单 upload 字段） | 并入 §7.1-6 app 通用上传 |
| 8 | 发布需求类型 hub 与三类独立表单 | `DemandPublishHubView`（找服务 / 找投资 / 找合作对比选择 + 流程步骤 + CTA）+ `DemandTaskFormView`/`DemandInvestFormView`/`DemandCoopFormView`（`components/forms/DemandFormView` 按 kind 渲染）；项目页 Tabs 按 kind 分类筛选；列表/详情/我的需求展示类型标签与专属字段 | §7.1-15 |
| 9 | 关联身份（社区个体 + 全部关联社区企业/合作企业，可多个；点入按身份操作） | `MyIndividualCardView` / `IdentityListView` / `EnterpriseDetailView` + `api/enterprises.ts`（fetchMyCards / updateIndividualCard / fetchMyIdentities / fetchEnterpriseDetail / updateMyEnterprise / transferEnterpriseContact / inviteEnterpriseMember / applyEnterpriseExit，企业操作按 id；mock 保存即发布；个人名片联动社区人才库；`EnterpriseRecord.members` 成员对象 + `contactUid/contactName`） | §7.1-16 |
| 10 | 企业成员邀请闭环（邀请记录 + 站内信 + 邀请详情页确认/拒绝）、成员手机号维护与成员权限分配（8 项；负责人默认全部；`permissions` 数据 + 权限勾选 UI + mock 端 `invite`/`remove-member`/`edit_card`/`manage_members`/`assign_permission` 校验 + 需求发布/空间预约 `asEnterpriseId` 代企业主体） | `InvitationView`（`/me/invitations/:id`）+ `EnterpriseDetailView` 成员管理（职位/手机号/权限勾选、待接受邀请列表、按 `myPermissions` 显隐操作与入口）+ `EnterpriseCardEditView`（edit_card 或负责人可进）+ `DemandFormView`/`SpaceReserveView`（被授权企业身份选项）+ `api/enterprises.ts`（fetchInvitation / respondInvitation / updateEnterpriseMember）+ mock `enterpriseInvitations` 存储与站内信触发（邀请/接受/拒绝/资料与权限更新） | §7.1-17；后台邀请记录与权限视图可选（§7.2-7）；响应/投稿代企业为后续批次 |
| 11 | 实名认证（编辑资料入口 + 状态脱敏展示 + 姓名/身份证号提交） | `RealNameView`（`/me/realname`）+ `ProfileEditView` 实名认证 Cell（note 已认证/未认证）+ `api/me.ts`（fetchRealName / submitRealName）+ mock `accounts.realName/citizenId`（苏明远/林晚已认证种子；提交即通过并发送站内信） | §7.1-18 |

### 7.5 接入前置修复清单（客户端 Mock 偏差）

> 2026-09-13 全页面细化（v6）：下列项多数已销号；仍遗留项供 M2-R 处理，`VITE_API_MODE=http` 切换前须全部清零。

| 状态 | 项 | 说明 |
|---|---|---|
| 已修复 | devtools 模拟位置注入 | DevTools 增「场地内 / 场地外 500m / 关闭定位 / 清除注入」+「签到活动时间窗对齐当前」 |
| 已修复 | 订单状态推进/确认弹层 | 新增 `confirmOrder`（确认收货）+ MyOrders 入口；下单确认弹层含余额预览；DevTools 可模拟后台发货 |
| 已修复 | 我的预约取消入口 | MyReservations 接入 `cancelReservation`（Dialog 二次确认 + 刷新） |
| 已修复 | 展示页申请入口 | 社区·企业库卡片按成员身份显示「申请展示页 ›」，非成员提示未发布 |
| 已修复 | `updateMe` 字段丢弃 | 昵称/性别/简介全量落库并校验；保存后同步 auth store 昵称 |
| 已修复 | 积分流水 keyword | handler 支持来源/事由过滤；积分页增防抖搜索 |
| 已修复 | 契约层反向依赖 mock | `EnterpriseRecord` 移入 `src/types/index.ts` |
| 已修复 | 401 拦截与路由不匹配 | 改 `joinyuu:unauthorized` 事件 → `main.ts` 清会话 + history 跳登录（带 redirect） |
| 已修复 | 死代码/死分支 | 删除 `stores/breakpoint.ts` 与 `vendor-tdesktop` 分块；`mockAdvanceOrder/cancelReservation` 已接线 |
| 已修复 | mock 数据一致性 | 人才库冲突 / 政策 `PL` 前缀 / 字典 4 类 / 活动时间相对化（§4.1） |
| 遗留 | `fetchEvent` 对 ended 绕过可见范围 | 演示用；接入期按服务端过滤语义对齐 |
| 遗留 | `restoreSession` / `getCaptcha` http 分支 | `restoreSession` http 由 `GET /me` 承担；`getCaptcha` 接入期改走统一请求封装（Mock 固定码 8888 策略见 §3.3） |

### 7.6 M2-R 对接前置流程（缺口交底）

1. 以 §7.1 + §7.3 + §7.4 为清单向 **API 侧**交底：模型迁移（UserNotification / 活动签到字段 / Enrollment 扩展 / 字典缓存键）、app 鉴权（`scope='app'` + AppJwtGuard + 验证码）、全部 `/api/app/**` 端点、积分触发点与自然日去重、可见范围服务端过滤；确认排期后再启动 M2-R。
2. 以 §7.2 为清单向 **admin 侧**交底：活动表单签到配置、签到名单标识（补签已有）、发货站内信联动、站内信运营视图（可选）；§7.4-1 的社区运营数据来源与入口需一并明确。
3. 双方缺口销号后，客户端先按 §7.5 修复，再切 `VITE_API_MODE=http`，新增 `app-*` e2e 套件并全量回归。

---

## 8. 里程碑（Mock 阶段 M2-M*，每批独立走查）

> 以下批次内容保留推进时的历史口径（当时为双端）；2026-09-13 起 `client-mobile` 为纯移动端，桌面端走查改由 `client-web`（未创建）承接。

| 批次 | 内容 | 验收 |
|---|---|---|
| M2-M1 | 工程骨架：独立 client-mobile 包（7759/代理/双壳/断点/tokens/请求层/mock 底座/session/devtools 身份切换器）+ 登录/注册/首页（含站内信入口与未读角标） | 双端壳切换；演示账号矩阵登录；开关停用态；tsc/build/lint |
| M2-M2 | 个人中心族：资料编辑/积分流水/经验等级/我的申请+提交（4 类） | 双端走查 + 空态（新注册账号） |
| M2-M3 | 需求广场全流程 + 活动中心（浏览/详情/报名/取消）+ 可见范围 Mock 模拟 | 提交/响应/报名闭环；站内信触发链 |
| M2-M4 | **签到** + **站内信中心**完整交互（时间窗/围栏/失败态/未读已读/跳转） | devtools 三种定位场景全覆盖 |
| M2-M5 | 商城（下单/我的订单/状态流转 devtools）+ 空间预约（时段占用/提交/我的） | 事务语义与 409 文案 |
| M2-M6 | 内容（文章/投稿/我的投稿）+ 展示页申请 + 企业展示页 + 首页聚合完善 | 全页面双端走查报告 |
| M2-R（接入期，Mock 完成后另立项） | 后端 /api/app/** 全量实现 + §7 缺口销号 + `VITE_API_MODE=http` 切换 + e2e（app-* 套件）+ 回归 | e2e 全绿 + 双端走查 |

## 9. 验证策略

> 2026-09-13 起为纯移动端：走查以移动 375 断点为主；桌面 1280 断点随 `client-web` 创建后另行规划。

- Mock 期每批次：双端 `tsc --noEmit` + `pnpm build:client-mobile` + `pnpm lint` + playwright-cli 有头浏览器走查（桌面 1280 / 移动 375 双断点，覆盖本批页面、空态、错误态、开关停用态）。
- Mock 交互边界自测清单随批次维护（登录失败/围栏外/库存不足/冲突 409/开关关闭/未登录拦截）。
- 接入期：新增 app-* e2e 套件（复用 reseed + app 登录 helper），全量回归后 `VITE_API_MODE=http` 双端走查。

## 10. 目录结构

见 §3.1；补充约定：`composables/` 命名 `use<域><动作>`；视图层禁写业务逻辑与直接访问 mock；类型与 mock 数据字段变更必须同步 `docs/api-app-design.md` 修订记录。

## 11. 开放问题

1. 签到围栏半径与时间窗默认值（建议 200 米 / 开始前 30 分钟）需运营确认。
2. 站内信是否需要保留期限（如 90 天自动清理）——接入期定。
3. 移动端是否需要「分享到微信」能力（依赖 M3/微信生态），M2 先留分享按钮占位与否——默认不做。
4. 客户端部署形态（静态托管域名/路径）——接入期定，Mock 期不影响。
5. 社区运营数据来源（社区服务「政策/指引」、人才库由哪个 admin 模块维护；人才库 role/skills 字段在 User/UserIdentity 中无对应）——对接 §7.1-12 前定。
