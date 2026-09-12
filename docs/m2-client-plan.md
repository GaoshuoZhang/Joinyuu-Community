# 聚屿社区 · M2 客户端 Web 规划（Mock-First · v2）

> 状态：规划稿 v2（已确认）；**Mock 版本已全量交付**（M2-M1~M6 完成，见 §0 看板），接入期 M2-R 待启动。
> 架构调整（2026-09-12）：客户端拆为两个独立应用/入口——`apps/client-mobile`（移动端，原 `apps/client`）与 `apps/client-web`（桌面端，待创建）；**先移动端后桌面端**，详见 §1.2-5。

## 0. 完成度看板（随批次勾选）

### 0.1 里程碑批次

- [√] M2-M1 工程骨架：独立 client-mobile 包（7759/代理/双壳/断点/tokens/请求层/mock 底座/session/devtools）+ 登录/注册/首页（含站内信入口与未读角标）
- [√] M2-M2 个人中心族：资料编辑 / 积分流水 / 经验等级 / 我的申请 + 提交（4 类）
- [√] M2-M3 需求广场全流程 + 活动中心（浏览/详情/报名/取消）+ 可见范围 Mock 模拟
- [√] M2-M4 位置签到 + 站内信中心完整交互（时间窗/围栏/失败态/未读已读/跳转）
- [√] M2-M5 商城（下单/我的订单/状态流转 devtools）+ 空间预约（时段占用/提交/我的）
- [√] M2-M6 内容（文章/投稿/我的投稿）+ 展示页申请 + 企业展示页 + 首页聚合完善
- [ ] M2-R 接入期：后端 /api/app/** 全量实现 + §7 缺口销号 + `VITE_API_MODE=http` 切换 + e2e（app-* 套件）+ 回归

### 0.2 页面清单（双端视图均完成才可勾选）

- [√] /login 登录　[√] /register 注册　[√] / 首页
- [√] /demands 需求广场　[√] /demands/:id 需求详情　[√] /demands/new 提交需求　[√] /me/demands 我的需求　[√] /me/responses 我的响应
- [√] /events 活动中心　[√] /events/:id 活动详情　[√] /events/:id/check-in 位置签到　[√] /me/enrollments 我的报名
- [√] /mall 商品列表　[√] /mall/:id 商品详情与下单　[√] /me/orders 我的订单
- [√] /spaces 空间列表　[√] /spaces/:id/reserve 预约提交　[√] /me/reservations 我的预约
- [√] /articles 文章列表　[√] /articles/:id 文章详情　[√] /articles/new 投稿　[√] /me/articles 我的投稿
- [√] /enterprises/:id 企业展示页　[√] /enterprises/:id/showcase-apply 展示页申请
- [√] /me 个人中心　[√] /me/profile/edit 资料编辑　[√] /me/points 积分流水　[√] /me/experience 经验与等级　[√] /me/applications 我的申请　[√] /applications/new 提交申请　[√] /me/projects 我的项目
- [√] /notices 站内信中心

### 0.3 后端缺口（§7.1，接入期销号）

- [ ] 缺口 1 站内信（UserNotification 模型 + 端点 + 触发点）　[ ] 缺口 2 位置签到（字段迁移 + check-in 端点）
- [ ] 缺口 3 首页聚合端点　[ ] 缺口 4 多身份 JWT 签发　[ ] 缺口 5 批量字典下发　[ ] 缺口 6 投稿图片上传
- [ ] 缺口 7 经验值流水端点　[ ] 缺口 8 积分触发点接线　[ ] 缺口 9 可见范围服务端过滤　[ ] 缺口 10 订单状态流转

### 0.4 后台缺口（§7.2）

- [ ] 缺口 1 活动表单签到配置　[ ] 缺口 2 签到名单标识与补签　[ ] 缺口 3 发货与站内信联动　[ ] 缺口 4 站内信运营视图

### 0.5 开放问题（§11）

- [ ] 签到围栏默认值确认（建议 200 米 / 开始前 30 分钟）　[ ] 站内信保留期限　[ ] 分享到微信（默认不做）　[ ] 部署形态

---

> 以下为 v2 规划正文。
> 修订记录：
> | 版本 | 日期 | 摘要 |
> |---|---|---|
> | v1 | 2026-09-12 | 双端 TDesign 技术方案 + 全量范围规划 |
> | v2 | 2026-09-12 | 改为 **Mock-First 策略**（前端先行，后端 /api/app/** 后置）；**站内信**与**位置签到**纳入规划（均为当前边界外，Mock 交付 + 缺口登记）；明确**独立服务边界**（不与 admin 粘连，端口 7759） |
> | v3 | 2026-09-12 | **架构调整：拆成两个应用/入口**（先移动端后桌面端）——`apps/client-mobile`（原 `apps/client`，dev 7759）与 `apps/client-web`（桌面端，待创建）；根脚本改 `dev:client-mobile` / `build:client-mobile`；实现契约文档更名为 `docs/wiki-client-mobile.md`。详见 §1.2-5 |
> | v4 | 2026-09-13 | **移动端重构（社区管理者视角）**：`client-mobile` 收敛为纯移动端（移除桌面端代码/`dualView`/桌面库）；底部 5 Tab 改「首页/项目/社区/广场/我的」；新增首页（搜索+轮播+需求发布+双入口+四宫格+最新项目+精选文章）、项目页（复用需求数据）、社区页（社区服务/人才库/企业库 3 Tab）、广场页（活动/资讯 2 Tab）、入驻说明页；新增社区运营 mock（政策/人才/企业）与 `api/community.ts`。详见 §6 页面清单与 `wiki-client-mobile.md` §6 |
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
3. Mock 可**超出当前边界**：站内信、位置签到、首页聚合等 Mock 全量交付交互；每一处超界登记 §7 缺口表（后端缺口 / 后台缺口 / 契约文档待修订项）。
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
│   ├── auth.ts  config.ts  me.ts  demands.ts  events.ts
│   ├── mall.ts  spaces.ts  contents.ts  notices.ts  checkin.ts
├── mock/                 # [MOCK-ONLY] Mock 实现（http 模式下整目录不参与打包）
│   ├── db.ts             # 内存数据库（seed 派生实体集 + 运行时可变状态）
│   ├── session.ts        # 模拟 JWT/会话/多身份
│   ├── handlers/         # auth/config/me/demands/events/mall/spaces/contents/notices/checkin
│   └── latency.ts        # 模拟网络延迟与错误注入
├── composables/          # 业务逻辑（双端共享，视图层禁写业务）
├── stores/               # auth / config / notices / breakpoint
├── types/                # 实体与 API 类型（独立声明）
├── views/
│   ├── desktop/          # 桌面视图（tdesign-vue-next）
│   └── mobile/           # 移动视图（tdesign-mobile-vue）
├── components/
│   ├── desktop/  mobile/  shared/
├── devtools/             # [MOCK-ONLY] 开发者工具（仅 mock 模式挂载）
└── styles/tokens.css     # 双库统一品牌令牌
```

### 3.2 模式切换

- `VITE_API_MODE`（默认 `mock`）：`mock` 时 `src/api/*.ts` 内部绑定 `src/mock/handlers/*`；`http` 时改绑 `http.ts` 真实请求——函数签名与返回类型完全一致，视图层零改动。
- Mock 模式响应同样走包络 `{ code: 0, data }` 与 `{ code, message }` 错误形态，错误文案与 wiki 中文口径一致（切换后无感知差异）。

### 3.3 会话与多身份 Mock

- `mock/session.ts` 维护模拟会话：登录成功签发假 JWT（payload `{ sub: uid, scope: 'app', identities: [...], jti }`），存 localStorage（`joinyuu_client_token`），TTL 与未来后端一致。
- 演示账号 = seed 用户派生（见 §4），覆盖单身份/双身份/三身份/企业成员等形态；`devtools/` 提供**身份切换器**（免登录快速切换演示账号）——`[MOCK-ONLY]` 开发工具，不登记缺口。
- 注册：受 `registrationOpen` 开关控制；验证码 Mock 直接在输入框 placeholder 提示固定码 `8888`（[MOCK-ONLY]，真实接入后走图形验证码接口）。

### 3.4 双端渲染与包体

- 断点：`matchMedia('(max-width: 767px)')` → Pinia `breakpoint.isMobile`（resize 监听）。
- 路由单套；页面经 `resolveView(key)` 按断点动态 import `views/desktop/X.vue` 或 `views/mobile/X.vue`——**移动端首屏不加载桌面组件库**（反之亦然）；Vite `manualChunks` 将两库拆分独立 chunk。
- 依赖：`tdesign-vue-next`（桌面）、`tdesign-mobile-vue`（移动）、`tdesign-icons-vue-next`（共用图标）；按需引入 + resolver。
- 地理定位：`navigator.geolocation`（localhost dev 可用）；Mock 期配「模拟位置注入」工具（见 §6.3）。

---

## 4. Mock 数据设计

### 4.1 实体来源与形态

- 全部实体从 `apps/api/prisma/seed-data/*.ts` 派生：users/identities、enterprises、demands、events+enrollments、projects+milestones、goods+orders、spaces+reservations、articles+columns、announcements、points/experience records、rules/levels。
- 字段形态与 `docs/entity-fields.md` 对齐（时间 `YYYY-MM-DD HH:mm`、ID 前缀体系 U/E/AP/D/P/EV/XE/EX/PT/G/RO/WS/WA/LS/S/SR/A/SU/CL/SC/AN/N/AL）。
- 可变状态（报名/下单/预约/已读标记）在 `mock/db.ts` 内存演进，刷新重置（可加 localStorage 持久化开关，devtools 提供「重置 Mock 数据」）。

### 4.2 演示账号矩阵

| 账号（手机号） | 身份 | 用途 |
|---|---|---|
| 13800000001（陈屿） | 个人用户 + 社区个体（Lv.4） | 主演示：全功能 |
| 13800000002 | 社区个体 + 社区企业成员 | 多身份切换提交 |
| 13800000003 | 社区企业成员（星澜智能科技） | 企业身份视角/企业展示页 |
| 13800000004 | 合作企业成员（云径网络 external_enterprise） | 合作方视角 |
| 13800000005 | 个人用户（新注册态，无流水） | 空态走查 |
- 密码统一 `client123`（Mock 任意密码也可登录，devtools 可关）；冻结账号 1 个用于登录边界（「账号已冻结」错误态）。

### 4.3 站点配置 Mock

`GET /api/app/config` 返回：站点名称/标语 + `registrationOpen / mallOpen / demandOpen / reservationOpen`（默认全开）。devtools 提供开关面板实时切换，验证各端入口隐藏与写端点 400 文案。

---

## 5. 信息架构与页面清单（约 30 路由）

> 标注：〔内〕= 当前边界内（后端已有对应能力，接入期直连）；〔外〕= 超出当前边界（Mock 交付，接入需补，见 §7）。

### 5.1 公开页

| 路由 | 页面 | 功能点 | 边界 |
|---|---|---|---|
| /login | 登录 | 手机号+密码+验证码；冻结账号错误态；跳转 redirect | 〔内〕（登录本身内；多身份 JWT 签发为后端新能力，接入时实现） |
| /register | 注册 | 开关停用态；手机号唯一；默认 individual 身份；注册即登录 | 〔内〕 |
| / | 首页 | 站点信息/标语、进行中活动横排、最新需求、置顶文章、未读站内信入口〔外〕 | 聚合数据〔外〕（需 app 首页聚合端点） |
| /demands | 需求广场 | published 列表；类别（字典）/关键词筛选；分页；可见范围过滤〔外：服务端过滤，Mock 前端模拟〕 | 列表〔内〕；范围过滤服务端〔外·B〕 |
| /demands/:id | 需求详情 | 详情/响应数/发布方身份快照；不可见 404；响应入口 | 〔内〕 |
| /events | 活动中心 | published 且未结束；类型/关键词；可见范围 | 〔内〕 |
| /events/:id | 活动详情 | 报名进度/容量/截止/我是否已报名/取消；**位置签到入口（时间窗内）**〔外〕 | 详情报名〔内〕；签到〔外〕 |
| /articles、/articles/:id | 文章列表（栏目筛选）/ 详情（浏览量+1） | 〔内〕 |
| /mall、/mall/:id | 商品列表（on 且库存>0）/ 详情 | mallOpen 开关 | 〔内〕 |
| /enterprises/:id | 企业展示页 | published 才可见 | 〔内〕 |

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
| /events/:id/check-in | 位置签到页〔外〕 | 时间窗校验/geolocation 定位/围栏距离校验/成功态与积分反馈/失败原因（不在围栏/未开始/已结束/重复签到） | **〔外〕**（§7-2） |
| 提交流（弹层或子页） | 需求提交/报名确认/兑换下单/预约提交（日历+时段）/投稿编辑/申请提交（4 类）/展示页申请 | 表单与校验；开关控制 | 〔内〕（投稿编辑器：桌面用富文本、移动用多行文本+图片占位，Mock 不接上传——上传接入期补，§7-6） |

### 5.3 移动端 TabBar

首页 / 需求 / 活动 / 商城 / 我的；站内信入口在「我的」+ 首页顶部铃铛（未读角标）。

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

### 6.3 活动中心与位置签到〔外〕

- 报名：容量/截止/`requireReview` 三态（成功/待审核/候补文案按 wiki）；`enrollmentIdentities/Levels` 校验不通过时按钮禁用+原因提示（Mock 前端模拟，接入后服务端校验）。
- **位置签到页**（新增，超界）：
  - 前置：活动含签到配置——场地经纬度、签到半径（米，默认 200）、签到时间窗（开始前 30 分钟 ~ 结束）；
  - 流程：进入签到页 → 请求 geolocation → 计算与场地直线距离（Haversine）→ 围栏内且在时间窗 → 签到成功（动画 + 积分 `activity_checkin` + 站内信）→ 失败态文案（距场地 X 米，超出签到范围 / 未到签到时间 / 活动已结束 / 已签到过）；
  - 边界：未授权定位 → 引导开启；`daily_login`/签到积分自然日去重（Mock 简化为活动维度一次）；
  - devtools「模拟位置注入」：预设「场地内 / 场地外 500m / 关闭定位」三种场景按钮，覆盖成功与全部失败态。

### 6.4 积分商城

- 列表：on 且库存>0；详情：积分价/库存/兑换说明。
- 下单：积分余额校验（不足 → 409「积分不足」）→ 确认弹层（扣除后余额预览）→ 事务语义 Mock（扣积分+写流水+扣库存+建订单 pending_shipment）→ 站内信「兑换成功，待发货」〔外〕。
- 我的订单：状态流转 Mock（devtools 可将订单推进为已发货/已完成，模拟后台发货动作——接入后该动作为管理端能力，登记 §7-4）。

### 6.5 空间预约

- 空间列表（needApproval/设备/容量）；详情选日期 → 当日时段占用图（已通过预约 + 活动占用，Mock 静态生成）→ 选时段提交 → pending → 站内信「预约已提交」〔外〕；冲突 409 文案同 wiki §8.8；reservationOpen 关闭隐藏入口。

### 6.6 内容与投稿

- 文章列表/详情（published；栏目 chips）；投递：标题+栏目+正文（桌面富文本只读演示/Mobile 纯文本）→ SU 前缀 pending → 站内信「投稿已提交」〔外〕；驳回稿可见原因并可再提交。
- 展示页申请：合作企业成员可见入口 → 提交 → 管理端审核联动 showcaseStatus（Mock 直接改状态演示全链路）。

### 6.7 站内信中心〔外〕

- 类型：审核结果（申请/需求/预约/投稿/展示页）、报名结果、订单与积分、系统通知（含签到成功）。
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
| 2 | **位置签到**：Activity 增 `venueLat/venueLng/checkinRadiusM/checkinOpenMin/checkinCloseMin`（迁移）+ `POST /api/app/events/:id/check-in`（geolocation 距离校验 + 时间窗 + 防重复 + `activity_checkin` 积分接线）+ 签到记录存储（Enrollment 增 checkinAt/checkinLat/Lng 或独立表） | /events/:id/check-in | api-app-design.md §7 扩充 | P0 |
| 3 | **首页聚合端点** `GET /api/app/home`（精选活动/最新需求/置顶文章/未读数/站点信息一次下发） | / 首页 | api-app-design.md §4 扩充 | P1 |
| 4 | **多身份 JWT 签发**：register/login 返回 `{ token, uid, name, identities[], points }`（scope='app' AppJwtGuard） | 全局 | api-app-design.md §2 细化 | P0 |
| 5 | **app 首页之外的批量字典下发** `GET /api/app/dicts`（一次返回 4 类启用项，减少请求数；可选） | 全局筛选 | api-app-design.md §4 扩充 | P2 |
| 6 | **投稿图片上传**：富文本/正文配图走上传（复用 admin 上传管线 + `/api/app/uploads` 或直用 admin 端点鉴权放宽） | /articles/new | api-app-design.md §8 扩充 | P1 |
| 7 | **经验值流水端点** `GET /api/app/me/experience-records`（个人中心经验/等级页；设计稿未单列） | /me/experience | api-app-design.md §5 扩充 | P1 |
| 8 | **积分触发点接线**：`daily_login`（自然日去重）/`demand_responded`/`demand_published`/`demand_undertaken`/`project_milestone`/`article_accepted` | 登录与各业务流 | wiki-backend §8.4 已列，随接入落地 | P0 |
| 9 | **可见范围/可报名范围服务端过滤**（列表 SQL 条件 + 详情 404，身份×等级交集，空数组=不限） | demands/events | api-app-design.md §9 已设计，接入实现 | P0 |
| 10 | **订单状态流转**（后台发货→shipped；客户端确认收货→completed 端点） | /me/orders | api-app-design.md §8 扩充（确认收货端点） | P1 |

### 7.2 后台（admin）缺口

| # | 缺口 | 说明 | 优先级 |
|---|---|---|---|
| 1 | 活动表单增「签到配置」：场地坐标（地图选点或经纬度手输）、签到半径、签到时间窗 | 配合位置签到（§7.1-2） | P0 |
| 2 | 报名/签到名单页增「签到方式」标识（位置签到显示距离与坐标）与手动补签 | 运营兜底 | P1 |
| 3 | 订单管理发货动作与站内信联动（发货时写 UserNotification） | 配合站内信（§7.1-1） | P1 |
| 4 | 站内信运营视图（可选）：按用户查询发送记录/系统群发 | 依赖 §7.1-1 落地 | P2 |

### 7.3 契约文档待修订清单

- `docs/api-app-design.md`：新增 §12 站内信；§7 扩位置签到；§4 扩首页聚合与批量字典；§8 扩确认收货/经验流水；§2 细化多身份 JWT 响应结构。
- `docs/entity-fields.md`：新增 UserNotification；Activity 签到字段；Enrollment 签到字段。

---

## 8. 里程碑（Mock 阶段 M2-M*，每批独立走查）

| 批次 | 内容 | 验收 |
|---|---|---|
| M2-M1 | 工程骨架：独立 client-mobile 包（7759/代理/双壳/断点/tokens/请求层/mock 底座/session/devtools 身份切换器）+ 登录/注册/首页（含站内信入口与未读角标） | 双端壳切换；演示账号矩阵登录；开关停用态；tsc/build/lint |
| M2-M2 | 个人中心族：资料编辑/积分流水/经验等级/我的申请+提交（4 类） | 双端走查 + 空态（新注册账号） |
| M2-M3 | 需求广场全流程 + 活动中心（浏览/详情/报名/取消）+ 可见范围 Mock 模拟 | 提交/响应/报名闭环；站内信触发链 |
| M2-M4 | **位置签到** + **站内信中心**完整交互（时间窗/围栏/失败态/未读已读/跳转） | devtools 三种定位场景全覆盖 |
| M2-M5 | 商城（下单/我的订单/状态流转 devtools）+ 空间预约（时段占用/提交/我的） | 事务语义与 409 文案 |
| M2-M6 | 内容（文章/投稿/我的投稿）+ 展示页申请 + 企业展示页 + 首页聚合完善 | 全页面双端走查报告 |
| M2-R（接入期，Mock 完成后另立项） | 后端 /api/app/** 全量实现 + §7 缺口销号 + `VITE_API_MODE=http` 切换 + e2e（app-* 套件）+ 回归 | e2e 全绿 + 双端走查 |

## 9. 验证策略

- Mock 期每批次：双端 `tsc --noEmit` + `pnpm build:client-mobile` + `pnpm lint` + playwright-cli 有头浏览器走查（桌面 1280 / 移动 375 双断点，覆盖本批页面、空态、错误态、开关停用态）。
- Mock 交互边界自测清单随批次维护（登录失败/围栏外/库存不足/冲突 409/开关关闭/未登录拦截）。
- 接入期：新增 app-* e2e 套件（复用 reseed + app 登录 helper），全量回归后 `VITE_API_MODE=http` 双端走查。

## 10. 目录结构

见 §3.1；补充约定：`composables/` 命名 `use<域><动作>`；视图层禁写业务逻辑与直接访问 mock；类型与 mock 数据字段变更必须同步 `docs/api-app-design.md` 修订记录。

## 11. 开放问题

1. 位置签到围栏半径与时间窗默认值（建议 200 米 / 开始前 30 分钟）需运营确认。
2. 站内信是否需要保留期限（如 90 天自动清理）——接入期定。
3. 移动端是否需要「分享到微信」能力（依赖 M3/微信生态），M2 先留分享按钮占位与否——默认不做。
4. 客户端部署形态（静态托管域名/路径）——接入期定，Mock 期不影响。
