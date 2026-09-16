# 聚屿社区 · M2 客户端规划（Mock-First · v2）

> 状态：规划稿 v2（已确认）；**移动端 Mock 已交付至 v33 并继续深化**。当前产品决策：M2-R 暂不启动，先补齐产品闭环、治理安全、状态恢复与 UX 基线。
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
- [√] M2-v32 Mock 基础设施：版本化状态快照 + 稳定序列号 + 固定基准时钟/时间推进 + 网络异常场景 + 五域运营审核模拟
- [√] M2-v33 需求撮合闭环：响应状态/撤回与发布者筛选、接受后双向项目记录、项目详情与参与人、里程碑提交/验收、自动结项、积分/经验/站内信联动
- [√] M2-v34 审核与履约闭环：需求/投稿/申请审核中撤回与驳回后修改重提（保留编号）；商城履约模型（实物/券码/服务权益）与订单分流
- [√] M2-v35 信任与治理：联系方式登录可见、名片字段可见性与公开预览、举报与申诉、邀请有效期/撤销、负责人转移请求-接受闭环
- [√] M2-v36 系统性 UX：请求防竞态、滚动恢复、Tab 归属映射、44px 触控目标、表单标签与草稿、错误重试与搜索降级
- [√] M2-v37 激活与留存：新手任务清单、搜索升级（企业/空间/计数/最近搜索）、收藏与到货提醒、Mock 埋点漏斗
- [√] M2-v38 全量体验整改与产品级 Mock 闭环：草稿/返回/安全区/错误重试/长表单保护、服务端规则与治理（地址、账号安全、候补、通知偏好、订单取消与券码期限、空间规则、里程碑证据与退回、举报状态与屏蔽、点赞评论）
- [√] M2-v39 体验补全（纯客户端）：浏览去重与阅读历史、分享、活动日历（.ics）、骨架屏与下拉刷新、skip link 与路由聚焦、官网校验、图片占位、筛选进 URL、列表计数、政策版本化、通知归档/待处理、行内错误补齐、语义化与首页个性化；并修复 44px 触控目标误拉伸图标、投稿编辑器按钮高度不一致等回归
- [√] M2-v42 八大功能新增（纯客户端 Mock）：活动电子票、需求沟通、项目协作、积分任务与规则、个人看板、服务在线申请、企业工作台与代企业响应、实名分级权益；全场景 E2E 三轮 64 页零失败
- [√] M2-v41 移动端三轮复审整改（纯客户端）：URL query 同步、社区深链、分类全量派生、忘记密码入口、积分分页回退、Mock 时钟、预约时长约束、对比度、订单评价、注销冷静期与撤回、图片兜底、举报不预选、空态清除筛选
- [√] M2-v40 产品/UX 复审整改（纯客户端）：活动取消/改期运营模拟、分享扩展、浏览历史、首页公告、商城分类筛选（URL 同步）、物流单号、评论/用户举报、企业/人才收藏与筛选、搜索 chips 可点击、无障碍集中补丁、滚动位置记忆与骨架屏一致性；项目页排序（最新/响应最多）与文章/活动/社区/广场筛选 URL 同步、首页「为你推荐」、行内错误与列表计数补齐；Playwright headed 增量复测零控制台错误
- [ ] M2-R 接入期：**暂不启动**；未来范围仍为后端 `/api/app/**` + §7 缺口销号 + HTTP 切换 + app e2e + 回归

### 0.2 页面清单（2026-09-13 核对：纯移动端，全部已交付）

> 桌面端视图已随 `apps/client-web`（未创建）迁出本应用，v2 的「双端视图」口径作废。当前代码有 61 条路由记录：60 条 component-backed（含 AppShell 壳）、58 个唯一视图文件，另 1 条 catch-all 重定向；以下清单为核心能力分组，完整路由以 `src/router/index.ts` 为准。

- [√] /login 登录　[√] /register 注册　[√] / 首页
- [√] /projects 项目　[√] /community 社区（社区服务/人才库/企业库 3 Tab）　[√] /plaza 广场（活动/资讯 2 Tab）　[√] /intros/:kind 入驻说明
- [√] /demands/:id 需求（项目）详情　[√] /demands/new 提交需求　[√] /me/demands 我的需求　[√] /me/responses 我的响应
- [√] /events 活动中心　[√] /events/:id 活动详情　[√] /events/:id/check-in 签到　[√] /me/enrollments 我的报名
- [√] /mall 商品列表　[√] /mall/:id 商品详情与下单　[√] /me/orders 我的订单
- [√] /spaces 空间列表　[√] /spaces/:id/reserve 预约提交　[√] /me/reservations 我的预约
- [√] /articles 文章列表　[√] /articles/:id 文章详情　[√] /articles/new 投稿　[√] /me/articles 我的投稿
- [√] /enterprises/:id 企业名片　[√] /enterprises/:id/showcase-apply 企业名片申请〔入口：社区·企业库卡片（成员可见）〕
- [√] /me 个人中心　[√] /me/profile/edit 资料编辑　[√] /me/points 积分流水　[√] /me/experience 经验与等级　[√] /me/applications 我的申请　[√] /applications/new 提交申请　[√] /me/projects 我的项目　[√] /me/projects/:id 项目详情　[√] /me/favorites 我的收藏　[√] /me/addresses 收货地址　[√] /me/security 账号与安全
- [√] /forgot-password 找回密码　[√] /privacy 用户协议与隐私政策
- [√] /notices 站内信中心

### 0.3 后端缺口（§7.1，接入期销号）

- [ ] 缺口 1 站内信（UserNotification 模型 + 端点 + 触发点）　[ ] 缺口 2 签到（字段迁移 + check-in 端点）
- [ ] 缺口 3 首页聚合端点　[ ] 缺口 4 多身份 JWT 签发　[ ] 缺口 5 批量字典下发　[ ] 缺口 6 投稿图片上传
- [ ] 缺口 7 经验值流水端点　[ ] 缺口 8 积分触发点接线　[ ] 缺口 9 可见范围服务端过滤　[ ] 缺口 10 订单状态流转
- [ ] 缺口 11 app 图形验证码　[ ] 缺口 12 社区服务/人才库/企业库端点　[ ] 缺口 13 预约取消端点（§7.4 新增登记）　[ ] 缺口 14 申请表单 schema 下发（企业合作/人才登记）　[ ] 缺口 15 需求类型与专属字段（找服务 / 找投资 / 找合作）　[ ] 缺口 16 个人名片与关联身份（个人名片 GET /me/cards + PUT `/me/cards/individual`；关联身份 GET `/me/identities`；企业详情 GET/PUT `/me/enterprises/:id` + 转移负责人/邀请成员/退驻申请）　[ ] 缺口 17 企业成员邀请闭环与成员权限（邀请记录 + 站内信 + 邀请详情页接受/拒绝 + 成员手机号维护 + 8 项成员权限分配与服务端校验）　[ ] 缺口 18 实名认证（GET/PUT `/me/realname`，姓名 + 身份证号核验）　[ ] 缺口 19 需求撮合与项目协作（发布者筛选/接受/驳回响应、响应撤回；接受后立项生成项目；项目详情与里程碑提交/验收、自动结项）　[ ] 缺口 20 审核撤回与重提 + 商城履约模型　[ ] 缺口 21 信任与治理（联系方式可见范围、名片隐私、举报申诉、邀请撤销/过期、负责人转移接受）　[ ] 缺口 22 收藏 / 到货提醒 / Mock 埋点

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
> | v31 | 2026-09-15 | **搜索、社区服务与投稿体验细化（Mock）**：新增 `/search` 聚合项目/活动/文章/社区服务/人才，首页搜索直达并携带关键词。社区服务改为分类、精选专题、服务指引三级内容排版，数据继续通过 `fetchPolicies` 获取，后续后台需提供社区服务内容发布管理。投稿支持封面上传、段落间插图（复用 `POST /api/app/uploads` 缺口）及详情 Markdown 图片渲染；申请表单统一说明卡、字段分区与视觉层级；tsc/lint/build 全绿。 |
> | v32 | 2026-09-15 | **Mock 验证基础设施**：`joinyuu_client_mock_v32` 版本化快照让账号、积分、需求、报名、订单、预约、投稿、申请、企业与通知状态跨刷新保留；业务 ID 改持久序列号；业务时钟固定基准 `2026-09-15 10:00` 并支持 ±15 分钟/±1 天与一键进入签到窗口；网络支持正常/慢网/离线/500/超时；DevTools 新增需求、申请、活动报名、空间预约、投稿五域运营审核，联动状态、积分、身份、名额、占用与站内信；首页改为实时聚合，预约占用合并全账号已通过预约与活动。M2-R 未启动。 |
> | v33 | 2026-09-15 | **需求撮合闭环**：响应记录增加 `pending/accepted/rejected` 状态、响应方快照、审核时间与驳回原因，响应者可撤回待处理响应（撤回后可重投）；需求发布者在「我的需求」查看/筛选响应，可驳回并填写原因或确认接受；接受后需求转 `projected`，自动生成同一项目 ID 的发布方/承接方双向项目记录与两个里程碑，承接方获得项目立项积分 +200 与项目经验 +30（企业身份记入企业经验），双方收到站内信，其他待处理响应自动驳回；新增项目详情页 `/me/projects/:id`（参与双方、来源需求、进度、里程碑提交/验收），全部里程碑验收通过自动结项并发放项目结项经验，需求详情页支持查看已立项需求；Mock 快照升级为 `joinyuu_client_mock_v33`；tsc/lint/build 全绿；M2-R 未启动。 |
> | v34 | 2026-09-15 | **审核与履约闭环**：需求 / 投稿 / 申请支持审核中撤回（`withdrawn`）与驳回后修改重提（保留原编号，缺省内容回填，附件需重新上传；需求表单、投稿编辑器、schema 申请表单与身份绑定申请均支持 `?revise=<id>`）；商城区分履约类型（实物 `physical` / 数字券码 `voucher` / 服务权益 `service`）：实物待发货→发货→确认收货，券码下单即发券并支持复制，服务权益待使用→核销，我的订单按类型展示对应动作；tsc/lint/build 全绿。 |
> | v35 | 2026-09-15 | **信任与治理**：需求联系方式仅登录用户可见（游客提示登录后查看）；个人名片新增年龄/政治面貌公开开关与「预览公开名片」入口，公开人才名片按设置过滤敏感字段；需求 / 文章 / 企业名片支持举报（预设原因 + 补充说明，Mock 举报队列在 DevTools 可见）；驳回需求 / 投稿支持一次性申诉并展示申诉状态；企业治理闭环——成员邀请 7 天有效期与撤销、过期邀请展示，负责人转移改为请求—接受流程（目标成员接受后生效、发起方可撤销、过期失效）；tsc/lint/build 全绿。 |
> | v36 | 2026-09-15 | **系统性 UX**：`useAsyncList` 增加请求序号防竞态（旧请求不覆盖新结果）；路由 `scrollBehavior` 恢复/置顶滚动；底部 Tab 归属集中映射（项目/社区/广场/我的二级页稳定高亮）；Navbar 返回、铃铛、头像与空态重试按钮触控目标 ≥44px；登录/注册补充可见字段标签；需求发布与投稿草稿自动保存（sessionStorage，支持恢复/放弃，提交后清除）；`EmptyBlock` 支持重试动作并接入首页、项目、商城、文章、需求详情、文章详情、企业名片；全局搜索单数据源失败降级为部分结果 + 提示，不再整页失败；tsc/lint/build 全绿。 |
> | v37 | 2026-09-15 | **激活与留存**：首页新增新手任务清单（绑定社区身份 / 实名认证 / 发布需求 / 响应需求 / 报名活动，完成自动隐藏、可「不再提示」）；搜索升级——新增已发布企业与空间结果、分类计数 chips、最近搜索（localStorage，可清空/复用）；新增收藏（需求 / 文章 / 活动详情可收藏）与 `/me/favorites` 我的收藏页（+1 路由）；缺货商品支持到货提醒订阅；新增 Mock 埋点漏斗（登录/注册/发布需求/响应/报名/签到/下单/投稿/预约/收藏/举报/搜索 12 项计数，DevTools 面板可查）；tsc/lint/build 全绿。 |
> | v38 | 2026-09-15 | **全量体验整改 + 产品级 Mock 闭环**（按审查清单逐条修复）：①体验兜底——草稿生命周期修复（放弃不回写/空草稿不产生/隐藏页落盘）、返回导航不退出应用、底部安全区与 dvh、错误态重试全覆盖（约 30 处）、长表单草稿与离开保护（申请/资料/企业名片/个人名片）；②交互一致性——搜索请求防竞态 + URL 同步、列表 KeepAlive 状态保留 + 激活刷新、预约加载失败可重试与时段防竞态、积分流水分页加载、危险操作二次确认、小号按钮 ≥44px、行内校验（需求/申请/实名）与登录回车提交、通知 Tab 角标、我的需求并行加载与防重复、兑换不再强制跳转、游客可浏览商品详情；③可访问性与设备——`v-pressable` 键盘激活、aria-live 播报、document.title、12px 字号下限、图片懒加载、状态文案修正、dvh/顶部安全区、reduced-motion、离线横幅与 15s 超时、Tab 回顶、社区重复请求与双重重试等清理；④产品级 Mock 闭环——收货地址簿与实物订单地址、找回密码/换手机号/改密/注销/数据导出/注册协议同意与隐私政策页、活动候补与自动递补/取消时限/会后反馈、通知偏好、订单取消与券码 30 天有效期、空间维护/时长/提前天数规则、里程碑证据附件与退回、举报状态回写与屏蔽名单、文章点赞与评论；API/admin 跟进方法与验收标准见 §7.7；tsc/lint/build 全绿；M2-R 未启动。 |
> | v39 | 2026-09-15 | **体验补全（纯客户端，无新增接口）**：文章浏览量按浏览器 + 业务自然日去重、本机阅读历史（最近阅读 chips，可清空）、系统分享/复制链接；活动「添加到日历」（.ics 下载）；列表骨架屏（8 个浏览页）与下拉刷新（首页/项目/社区/广场 4 个 Tab 根）；skip link + 路由切换聚焦主内容 + `v-pressable` 覆盖面扩大 + AvatarUploader 键盘可达；企业官网 http(s) 校验（端 + Mock 服务端兜底）与展示页链接安全、文章图片 aspect-ratio 占位；项目页筛选（类型/分类/关键词）同步 URL 并可刷新还原；7 个列表新增「共 N 条」计数；社区政策版本化（version/effectiveAt/publisher/attachments 展示）；站内信「待处理/全部/已归档」筛选与单条归档/恢复；个人名片/资料/预约行内错误补齐；首页按已绑定社区企业身份个性化入口；**E2E 回归修复**——44px 触控目标误加在 SVG 上导致铃铛/返回图标被拉伸（改为按钮容器承载）、tokens 全局抬升小号按钮导致投稿编辑器「插入段落/插入图片」高度不一致（统一为 44px）、搜索/通知等页面在模拟网络异常时路由守卫 reject 造成整页空白（会话恢复失败降级为未登录并允许重试）、`/forgot-password` guestOnly 将登录态用户弹回首页（改为登录态重置后回账号与安全）；Playwright headed 全链路走查 22 页控制台零错误；tsc/lint/build 全绿；M2-R 未启动。 |
> | v42 | 2026-09-16 | **八大功能新增（纯客户端 Mock）**：活动电子票（确定性演示二维码 + 候补位次）；需求响应双向沟通（发布方/响应者留言板）；项目协作空间（任务 / 文件 / 讨论）；积分任务中心与积分规则页；个人数据看板；社区公共服务在线申请（政策弹层「在线申请」→ 我的服务申请）；企业工作台与代企业响应；实名认证分级权益展示；全场景 headed E2E 三轮（64 页 ×3）零失败、截图留档；tsc/lint/build 全绿；M2-R 未启动。 |
> | v41 | 2026-09-16 | **移动端三轮复审整改（纯客户端，无新增接口）**：①基础修复——KeepAlive 列表页响应 URL query（全局搜索「查看更多项目」不再丢关键词）、社区深链 `?tab=talent/enterprise` 首屏加载对应数据、服务分类改为全量派生、活动页重复计数、登录页「忘记密码」入口、积分流水加载更多失败回退页码并保留列表、邀请有效期接 Mock 时钟、预约时长受开放时段约束、占位/元信息文本对比度提升；②功能新增——商城订单评价（1~5 星 + 文字，每单一次）、账号注销 7 天冷静期与冷静期内撤回、图片加载失败兜底占位；③细节修饰——举报原因不预选默认项、项目空态一键「清除筛选」；三轮均以 headed 实测（搜索→项目筛选、社区人才深链、订单评价、注销冷静期撤回、清除筛选）零控制台错误；tsc/lint/build 全绿；M2-R 未启动。 |
> | v40 | 2026-09-16 | **产品/UX 复审整改（纯客户端，无新增接口）**：活动取消/改期运营模拟（DevTools 触发，取消后详情横幅、报名标记与通知联动）；分享扩展到需求/活动/企业名片/人才名片；新增「浏览历史」页 `/me/history`（可删除单条/清空）；首页运营公告 NoticeBar + 弹窗；商城分类筛选（字典 goods_category）并同步 URL；订单物流单号展示；举报支持评论与用户目标；收藏扩展企业与人才并支持类型筛选；全局搜索分类 chips 可点击过滤与「查看更多项目」；无障碍集中补丁（Toast aria-live、Dialog/Popup role/aria-modal、表单 id/name 仅扫描新增子树）；Tab 切换滚动位置记忆；骨架屏/列表计数/触控目标与对比度收敛；项目页排序（最新/响应最多）与文章/活动/社区/广场筛选 URL 同步；首页「为你推荐」；投稿/评论/响应/地址/账号安全/邀请/退回原因表单行内错误；我的列表与通知/社区/广场计数补齐；Playwright headed v40 增量复测（商城分类 URL、收藏筛选、搜索 chips、活动取消链路、浏览历史、排序与四页 URL、首页推荐、评论/订单行内错误与计数）零控制台错误；tsc/lint/build 全绿；M2-R 未启动。 |
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
- 可变状态在 `mock/db.ts` 内存演进，并由 v33 `mock/runtime.ts` 写入版本化 localStorage 快照，刷新后恢复；DevTools「重置 v33 Mock 数据」仅清理业务快照与 Mock 登录态，不影响其他同源偏好。超过 200KB 的 data URL 仅保留当次会话预览，以规避 localStorage 配额风险。

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

## 5. 信息架构与页面清单（当前 61 条路由记录）

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
| 19 | **需求撮合与项目协作**（[MOCK-ONLY]）：新增 `GET /api/app/me/demands/:id/responses`（仅需求发布者；响应方快照 + `status=pending/accepted/rejected`）与 `POST /api/app/me/demands/:id/responses/:responseId/review`（`action=accept\|reject`，驳回必填原因）、`POST /api/app/me/responses/:id/withdraw`（响应者撤回待处理）；接受后需求转 `projected`（= 后端立项语义），服务端需在事务内生成项目（发布方/承接方双向记录、里程碑）并发放 `demand_undertaken` 积分与项目经验、通知双方、自动驳回其余待处理响应；项目侧新增 `GET /api/app/me/projects/:id`、`POST /api/app/me/projects/:id/milestones/:milestoneId/submit`（承接方提交交付）与 `.../accept`（发起方验收），全部验收通过自动结项并按 wiki-backend §8.6 发放 `project_completed` 经验；`Demand` 增 `projectId`，`Milestone` 增交付验收状态，`DemandRespondent.status` 现为 pending/contacted/closed 需扩展 accepted/rejected 口径 | /me/demands（内联响应列表与筛选）、/me/responses（撤回）、/me/projects、/me/projects/:id | api-app-design.md §6/§8 增补（已注记 MOCK-ONLY）；entity-fields 需扩 | P1 |
| 20 | **审核撤回与重提 + 商城履约模型**（[MOCK-ONLY]·v34）：需求 `POST /me/demands/:id/withdraw`（pending→withdrawn）与 `POST /me/demands/:id/resubmit`（保留编号、驳回/撤回后重提）；投稿 `POST /me/articles/:id/withdraw`、`POST /me/articles/:id/resubmit`、`GET /me/articles/:id/payload`（重提回填原始内容）；申请 `POST /me/applications/:id/withdraw`、`POST /me/applications/:id/resubmit`、`GET /me/applications/:id/payload`；商城 `Goods` 增履约类型（physical/voucher/service）、订单状态增 `pending_use`、券码 `voucherCode` 与核销端点 `POST /mall/orders/:id/use`，实物确认收货维持既有设计 | /me/demands、/me/articles、/me/applications、/mall、/me/orders | api-app-design §8.1（MOCK-ONLY 端点表）；entity-fields 需扩 | P1 |
| 21 | **信任与治理**（[MOCK-ONLY]·v35）：需求联系方式仅登录可见（游客提示）；个人名片可见性设置（年龄/政治面貌）与公开预览；举报 `POST /reports`（需求/文章/企业名片，管理端举报处理与内容处置为后台缺口）；驳回申诉 `POST /me/demands/:id/appeal`、`POST /me/articles/:id/appeal`；企业成员邀请有效期（7 天）与 `POST /me/enterprises/invitations/:id/revoke`；负责人转移请求-接受闭环：改写 `POST /me/enterprises/:id/transfer-contact` 为发起请求，新增 `GET /me/transfer-requests`、`POST /me/transfer-requests/:id/respond`、`POST /me/transfer-requests/:id/cancel`（接受后变更负责人） | /demands/:id、/talents/:uid、/me/cards/individual、/me/identities、/me/enterprises/:id | api-app-design §8.1；后台举报队列与邀请/转移记录视图为 §7.2 新增候选 | P1 |
| 22 | **留存与观测**（[MOCK-ONLY]·v37）：收藏 `GET /me/favorites`、`POST /me/favorites/toggle`（需求/文章/活动）；到货提醒 `POST /mall/goods/:id/restock-subscribe`（缺货商品订阅，补货通知依赖后台补货动作）；Mock 埋点 `POST /analytics/events`（漏斗计数：登录/注册/发布/响应/报名/签到/下单/投稿/预约/收藏/举报/搜索；真实接入为数据平台上报） | /me/favorites、/mall/:id、各关键行为路径 | api-app-design §8.1；埋点口径与后台漏斗看板为接入期议题 | P2 |
| 23 | **v38 客户端落地项**（[MOCK-ONLY]）：收货地址簿（`GET/POST/PUT/DELETE /me/addresses`，实物订单必填地址）、账号安全（`POST /auth/reset-password`、`POST /auth/change-phone`、`POST /me/change-password`、`POST /me/deletion-request`、`POST /me/data-export`、注册协议同意留痕）、活动候补与取消时限、活动反馈、通知偏好、订单取消与券码有效期、空间预约规则、里程碑证据与退回、举报处理状态与屏蔽名单、文章点赞与评论。**详细跟进方法与验收标准见 §7.7。** | 多处（见 §7.7 对照表） | §7.7 交底表；api-app-design §8.1 已补端点 | P0~P2 |

> 2026-09-13 核对（`apps/api` 现状）：16 条缺口全部未按 app 契约实现（`/api/app/**` 路由数为 0）；v27 新增缺口 17（企业成员邀请闭环），v30 新增缺口 18（实名认证——`User.realName/citizenId` 字段已存在，缺少 app 提交端点与三要素核验接入），v33 新增缺口 19（需求响应处理与立项——客户端已实现发布者接受/驳回响应并生成协作项目），v34 新增缺口 20（审核撤回与重提 + 商城履约模型），v35 新增缺口 21（信任与治理），v37 新增缺口 22（收藏/到货提醒/埋点）。其中 2/6/8/10 有底层可复用能力——admin 代签（`POST /api/admin/events/:id/checkin` + `checkedIn/checkInAt` 字段 + 积分接线）、上传管线（`StorageService`/`AssetsService.upload` 魔数嗅探 + `/api/public/files/:key`）、积分引擎（`issuePoints/issueExperience`；已接 `activity_checkin`/`activity_enroll_approved`/`identity_first_bind`，`daily_login` 规则种子为停用且无自然日去重）、订单发货/完成（ship/finish/cancel，终点为 `finished`）。另：`User.passwordHash` 字段已存在可支撑 app 注册/登录；app 鉴权需新增 `scope='app'` 签发与 AppJwtGuard 并让现有 admin 守卫对 app 路径短路。

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

### 7.7 v38 客户端落地项：API / admin 跟进方法与验收标准（2026-09-15）

> 客户端已在 Mock 中完整落地以下能力；接入期按本表逐项实现。**验收标准 = 将该端点/页面接到 Mock 同款行为后，客户端无需改 UI 即可切换（api 层已留好 http 分支）。**


**v42 新增跟进项（移动端已 Mock，待 API/admin 落地）**

| # | 客户端现状（Mock） | API 待办 | admin 待办 | 验收要点 |
| --- | --- | --- | --- | --- |
| E1 | 活动电子票（演示二维码/核销码） | 票务签发与动态核销码、签到核销去重 | 活动签到核销台/名单导出 | 一票一码、核销不可重复 |
| E2 | 需求沟通留言板 | 会话/消息存储与参与方权限、未读与推送 | 无（或违规内容处置） | 仅参与方可见，消息可追溯 |
| E3 | 项目协作（任务/文件/讨论） | 项目任务与文件对象存储、成员权限 | 无 | 文件走对象存储与鉴权下载 |
| E4 | 积分任务中心 | 任务配置化、领取幂等、每日重置 | 任务规则配置与发放对账 | 领取幂等、奖励入账可查 |
| E5 | 个人数据看板 | /me/stats 聚合口径 | 个人维度看板（选做） | 与服务端统计一致 |
| E6 | 社区服务在线申请 | 申请单模型、受理流转与回写 | 服务申请受理队列与派单 | 状态可回执、可催办 |
| E7 | 企业工作台/代企业响应 | 企业维度聚合、企业身份鉴权 | 企业响应审核（选做） | 权限与企业成员一致 |
| E8 | 实名分级权益展示 | 权益规则下发与校验（发布/报名额度） | 权益规则配置 | 未实名限流可验证 |

**v40 复审新增跟进项（移动端已 Mock，待 API/admin 落地）**

| # | 客户端现状（Mock） | API 待办 | admin 待办 | 验收要点 |
| --- | --- | --- | --- | --- |
| D1 | DevTools「取消活动并通知报名者 / 改期 +1 天并通知」（`cancelEventAsOps/postponeEventAsOps`），详情页取消失效横幅、报名 `eventStatus/rescheduledTo` | 活动状态机加 `cancelled` 与 `postponed`；取消/改期后批量站内信 +（可选）短信 | 活动管理页「取消/改期」操作 + 原因 + 报名者通知批处理 | 取消后 C 端详情/报名列表一致展示、报名不可签到 |
| D2 | 首页运营公告 `HomeAnnouncement`（置顶优先取 2）+ NoticeBar/弹窗 | `/api/app/home` 返回 announcements（有效期内、按权重/置顶排序） | 公告配置（标题/链接/有效期/置顶）；或复用广告位/Banner 能力 | 关停/过期公告不返回；点击跳转可统计 |
| D3 | 商城 `Goods.category` 分类筛选 + URL 同步 | `/api/app/mall/goods?category=`（启用中且库存 > 0） | 商品分类字典 `goods_category` 配置与商品挂类 | 分类下架/售罄过滤正确 |
| D4 | 订单 `trackingNo`（发起发货写入并随通知下发） | 发货写运单号并下发通知；`/api/app/me/orders` 返回 | 订单履约页发货时录入运单号（含批量） | C 端详情/列表可见单号 |
| D5 | 举报支持 `comment/user` 目标（评论行内举报、人才名片举报用户） | 举报接口 targetType 扩展与校验 | 举报队列按 targetType 筛选与处置动作 | 处置结果可回执举报人 |
| D6 | 收藏类型扩展 `enterprise/talent` + 类型筛选 | 收藏表 targetType 扩展与去重 | 收藏数据看板（选做） | 跨端收藏状态一致 |
| D7 | 浏览历史 `/me/history`（本机 `readingHistory`，可删除/清空） | 登录态同步接口（可选）：增量上报/拉取 | 无 | 多端可合并、清空可生效 |
| D8 | 搜索分类 chips 过滤 +「查看更多项目」跳项目页关键词 | `/api/app/search` 支持分类过滤与分页 cursor | 搜索词/零结果看板（选做） | 分类计数与分页一致 |
| D9 | 无障碍与滚动位置记忆等纯前端补丁 | 无 | 无 | 仅客户端验收 |
#### A. API 侧（`/api/app/**`，按优先级）

| # | 能力 | 端点与关键行为 | 数据/迁移 | 验收 |
|---|---|---|---|---|
| A1 | 收货地址 | `GET/POST/PUT/DELETE /me/addresses`；默认地址唯一；实物订单 `POST /mall/orders` 必带 `addressId`，服务端写 `RedemptionOrder.recipientName/Phone/address` 快照 | 复用现有订单收货字段（当前无写入路径） | 下单无地址 400；后台订单详情可见收货信息 |
| A2 | 找回密码 / 换手机号 / 改密码 | `POST /auth/reset-password`（短信码+新密码，失败限频）、`POST /auth/change-phone`（登录态+新号验证码，占用 409）、`POST /me/change-password`（校验原密码；成功后该账号其他会话失效） | 需短信通道与验证码存储（复用 Redis 限流）；User.passwordHash 已存在 | 重置后可登录、旧密码失效；换号唯一 |
| A3 | 注销 / 数据导出 / 协议留痕 | `POST /me/deletion-request`（复核流程）、`POST /me/data-export`（异步打包 + 站内信）、注册 body 增 `agreed` 并记录协议版本与时间 | 需 `AccountRequest`（或工单）与协议同意表/字段 | 注销申请可被 admin 处理；导出包可下载 |
| A4 | 活动候补 / 取消时限 / 反馈 | 报名满员返回 `waitlisted` 并记录顺序；取消时校验开始前 24h（`cancelDeadline`）并自动递补第一名；`GET/POST /events/:id/feedback`（结束后 + 参与过，防重复） | Enrollment 扩展 `waitlisted/waitlistOrder`；新增 Feedback 模型；活动增 `cancelDeadlineHours` | 递补自动发积分与站内信；反馈一人一条 |
| A5 | 通知偏好 | `GET/PUT /me/notices/prefs`（启用的类型集合，至少一种）；列表过滤 + 推送开关 | `UserNotificationPreference`（或 User 字段）；与 §7.1-1 站内信模型同期 | 关闭后列表与推送均不出现该类型 |
| A6 | 订单取消 / 券码期限 | `POST /mall/orders/:id/cancel`（仅实物待发货；退积分 + 回补库存 + 通知）、券码签发写 `voucherExpiresAt`（30 天）并在查询时返回过期态 | 复用 admin cancel 事务；`RedemptionOrder` 增 `voucherExpiresAt/cancelledAt`；状态对齐 `completed` vs `finished` | 取消后积分与库存一致；过期券不可用 |
| A7 | 空间预约规则 | 创建预约校验：维护中 400、提前天数、最长时长、开放时间段；`GET /spaces` 返回 `status/maxHours/advanceDays` | Space 增三字段；与 §7.1-13 取消端点同期 | 规则外请求全部中文 400；维护空间不可约 |
| A8 | 里程碑证据 / 退回 | 提交支持 `attachments[]`（复用上传）；新增 `POST /me/projects/:id/milestones/:mid/return`（仅发起方、仅待验收，退回后状态回 `todo` 并记录原因） | Milestone 增 `attachments/returnReason` | 退回后可重新提交；证据可下载 |
| A9 | 举报状态 / 屏蔽 | `GET /me/reports`（状态 pending/resolved/rejected 回写）、`GET/POST /me/blocklist` + 解除；评论/内容列表过滤被屏蔽用户 | `Report` 模型 + `UserBlock` 关系；admin 处置动作回写状态 | 处置后客户端状态可见；屏蔽后内容不可见 |
| A10 | 文章点赞 / 评论 | `POST /articles/:id/likes/toggle`、`GET/POST /articles/:id/comments`（2-200 字，过滤屏蔽） | `ArticleLike` + `ArticleComment` 模型 | 计数正确、防重复；敏感词过滤接入期补 |
| A11 | 注册协议同意 | 注册接口强制 `agreed=true` 并留痕版本 | 同意记录表/字段 | 未勾选 400 |

#### B. admin 侧（运营视图/配置，按优先级）

| # | 能力 | 后台要求 | 验收 |
|---|---|---|---|
| B1 | 举报/申诉处理 | 举报队列（目标跳转、下架/恢复、处置理由、状态回写）；申诉复核入口（需求/投稿） | 处置后客户端 `我的举报` 状态与内容状态一致 |
| B2 | 注销 / 实名 / 邀请 / 转移 | 注销工单处理；实名核验与异常复核（§7.2-7 扩展）；邀请与负责人转移记录只读视图 | 工单闭环；记录可查 |
| B3 | 补货提醒 | 补货（改库存/上下架）时触发订阅者站内信；订阅名单视图（可选） | 补货后订阅者收到通知 |
| B4 | 订单地址与取消 | 订单详情展示收货信息；发货前校验地址；后台取消沿用现有退款事务 | 无地址不可发货 |
| B5 | 活动候补 / 反馈 | 报名名单区分正式/候补与顺序；活动反馈汇总（评分均值/评论列表） | 候补顺序可人工调整（可选） |
| B6 | 埋点漏斗（可选） | 接收/落库或对接数据平台；基础漏斗看板（注册→发布→响应→立项→结项） | 口径与客户端 12 项事件一致 |

#### C. 客户端切换注意（M2-R 前置）

- 快照键仍为 `joinyuu_client_mock_v33`（v38 新增状态在同一版本化快照内向后兼容），切换 http 后不再使用；无需迁移。
- §7.5 的偏差修复清单继续有效；本批新增的规则校验（空间/活动/商城）在服务端实现后，客户端本地校验保留为体验层（双保险，错误文案以服务端为准）。

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
