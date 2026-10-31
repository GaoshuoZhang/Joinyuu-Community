# 聚屿社区 · 客户端 API 设计（/api/app/**）

> 代码路径与开发命令默认相对 apps/api 仓；文档链接指向协作仓 docs。当前路由、模型与依赖版本以源码和锁文件为准。

> 契约要点：实名认证通过身份证规则校验后立即生效，查询返回 `{ verified, realName?, citizenIdMasked?, verifiedAt? }`，不经过后台人工复核。`GET /card-schema/:type`（individual/enterprise）返回 `{type, editableFields[]}`。个人/企业名片 PUT 为部分更新：省略保留，空串清空，用户提交禁用字段 403；后台 `/api/admin/cards/**` 可维护全部名片字段。注销冷静期 7 天，届满由工作人员执行，执行前可撤回，已注销账号不可登录或恢复。

> M2 客户端 Web（居民端）端点设计。依据：M0 冻结的实体模型与状态流（`docs/admin/development.md`）、
> 后端既有契约与业务规则（`docs/backend/development.md` §4/§5/§8）及当前 Prisma 数据模型（见生成字段清单）。
> 本文档为 M2 实施的契约基线：实施前如有调整，先改本文档（记录变更）再改代码（wiki-backend §14 契约变更流程）。
> 状态：**M2-R 已完成，本文为 `/api/app/**` 正式契约**。偏差先更新本文档，再按 wiki-backend 的契约变更流程修改代码。

## 1. 定位与范围

- 服务对象：个人用户 / 社区个体 / 社区企业成员 / 合作企业成员（external_enterprise 身份，经企业合作申请产生，无独立注册入口）。
- 路径前缀：`/api/app/**`，与管理端 `/api/admin/**` 平行；复用同一 NestJS 应用、同一 Prisma 库与包络/异常底座。
- 不做：管理端能力（审核/发布/配置）、管理端通知中心（AdminNotification 为管理员维度）。

## 2. 鉴权模型

| 项 | 设计 |
|---|---|
| 注册 | `POST /api/app/auth/register`；body `{channel: email\|phone\|username, email?, phone?, username?, code?, password, agreed, gender?}`。默认邮箱注册；后台已配置可用短信渠道时可选手机号注册；**email/phone 渠道无论何时都必须验证码验证**（邮箱渠道用邮箱验证码，手机渠道用短信验证码），验证通过的邮箱/手机号即成为该用户「可信通知渠道」。`channel=username` 是**兜底**路径（短信与邮箱通道都不可用时）：用户名 + 密码注册，无验证码、无可信通知渠道（因此无法自助找回密码），`username` 必填且格式/保留词/唯一性由服务端判定。注册不填昵称，服务端自动分配（`岛民` + 随机数字全站唯一）；`email/phone` 渠道的用户名亦由服务端自动分配（`user_` + 随机码全站唯一），`username` 渠道由用户指定。邮箱/手机号库内唯一且可空；受 `registrationOpen` 控制；默认授予 `individual`；同时记录用户协议与隐私政策版本 |
| 登录 | `POST /api/app/auth/login`；body `{identifier, password, captchaId, captchaCode}`，`identifier` 支持**手机号 / 邮箱 / 用户名**；签发多身份 JWT：`{ sub: uid, scope: 'app', identities: [...], jti }` |
| 验证码登录或注册 | `POST /api/app/auth/login-by-code`；body `{channel: phone\|email, account, code, agreed}`，`account` 的形态必须与 `channel` 一致（否则 400）。`agreed` **必填**：服务端**不先查账号是否存在**再决定是否校验协议（否则构成账号枚举），无法区分「登录」与「建号」，故对所有情况统一要求勾选。验证码（purpose `login`）校验通过后：命中账号 → 登录（该渠道 `*VerifiedAt` 为空时补写）；未命中 → 建号（`passwordHash` 为空，即「未设置密码」状态，不生成隐藏随机密码），响应额外带 `isNewUser: true`。并发建号唯一冲突回落为登录（不 500）。`registrationOpen=false` 或许可证维护期（只读）下未命中标识**不建号**（400）。**不参与**密码失败锁定与图形验证码体系（验证码服务自带 60 秒冷却、日限 10 次、校验失败 5 次即失效） |
| 令牌校验 | 复用 JWT Guard（按 `scope` 区分 admin/app 两套守卫）；登出黑名单复用 `auth:blacklist:{jti}` |
| 登出 | `POST /api/app/auth/logout` |
| 图形验证码 | `GET /api/app/auth/captcha` → `{captchaId,image}`；登录一次性消费 |
| 通道可用性探测 | `GET /api/app/auth/sms/available`、`GET /api/app/auth/email/available` → `{available}`（已启用对应渠道且验证码模板已发布）；客户端据此决定注册入口与验证方式是否开放 |
| 验证码发送 | `POST /api/app/auth/sms/send`（body `{phone, purpose, deviceId?}`）与 `POST /api/app/auth/email/send`（body `{email, purpose, deviceId?}`）→ `{expiresInSec, devCode?}`（`devCode` 仅非生产环境干跑时返回）；`purpose`：短信 `register\|reset_password\|change_phone\|login`、邮箱 `register\|reset_password\|change_email\|login`；频控：同号/同邮箱+用途 60 秒冷却、日限 10 次、同 IP 10 分钟 20 次、同设备 1 小时 10 次；校验失败 5 次即失效；下发经发送队列（安全类强制送达）。`login` 用途供「验证码登录或注册」使用（该链路与两个发码端点在许可证维护期属显式例外，见 `docs/features/license.md`） |
| 找回密码 | `GET /api/app/auth/recovery-channels?identifier=` → 该账号**已验证可信渠道**（脱敏 `{email, phone}`）；`POST /api/app/auth/reset-code/send` body `{identifier, channel}` 由服务端解析可信渠道并投递验证码（客户端不接触真实地址）；`POST /api/app/auth/reset-password` body `{identifier, channel, code, newPassword}` → 校验通过后更新密码并全端登出 |
| 账号绑定 | `POST /api/app/auth/change-phone`（body `{newPhone, smsCode}`）、`POST /api/app/auth/change-email`（body `{newEmail, code}`）：绑定或更换均须验证**新**手机号/邮箱，验证后标记为可信渠道；占用冲突 409 |
| 用户名/昵称 | 全站唯一，各有保留名单（`admin`/`管理员` 等，占用报 400）；用户名登录标识（字母开头 4-20 位，仅字母/数字/下划线，登录时忽略大小写），昵称仅作展示（≤20 字符，支持中文）。经 `PUT /api/app/me` 修改 |
| 修改密码 | `POST /api/app/me/change-password` body `{oldPassword?, newPassword}`：**已有密码**的账号必须校验 `oldPassword`；`passwordHash` 为空的账号（验证码建号，即「未设置密码」）首次设置免原密码、免验证码。成功后**强制退出全部会话（含当前会话）**，客户端需重新登录 |
| 每日登录积分 | 登录成功触发 `daily_login` 规则（PointsRule 固定触发项，种子默认停用；引擎按规则启停发放，自然日去重随 M2 客户端接入落地） |

### 微信小程序身份绑定

- `POST /api/app/auth/wechat-mini/login` 接收 `{ code }`。未绑定时返回 `needBind: true`、10 分钟有效的 `ticket` 和 `channels: { phone, email, password }`；`password: true` 表示支持绑定已有账号，不受注册渠道开关限制。
- `POST /api/app/auth/wechat-mini/bind` 保留手机号/邮箱验证码请求 `{ ticket, channel: 'phone' | 'email', identifier, code, agreed: true }`，新增 `{ ticket, channel: 'password', identifier, password, captchaId?, captchaCode?, agreed: true }`。密码方式的 identifier 支持用户名、手机号、邮箱，只关联已有且正常的账号，不自动注册。
- 密码绑定与普通密码登录共用按 IP + 规范化账号的失败计数：连续错误 3 次要求图形验证码（428），达到锁定条件返回 429。错误密码在绑定接口返回 400，避免客户端将其当作会话失效而退出绑定页面。冻结、注销、未设置密码、账号不存在均不能借此建号。
- 校验失败不消费绑定票据，允许在有效期内重试；验证通过后原子消费，同一票据最多绑定一次。验证码方式需要新建账号时，用户、身份、协议记录和微信绑定在同一事务中提交；绑定失败全部回滚。已有微信关联冲突返回 409，不覆盖原关系。
- 上线时先更新 API，再更新小程序；旧小程序的验证码请求继续兼容。小程序仅在服务端声明 `channels.password` 时显示账号密码方式。
- 换绑从小程序「账号与安全」发起：已登录请求 `POST /api/app/auth/wechat-mini/rebind-ticket { code }`，返回绑定当前用户的 ticket、可用 channels 和该用户各方式对应的 identifiers。再向 `POST /api/app/auth/wechat-mini/rebind` 提交相同验证载荷，重新验证当前账号后替换当前小程序 AppID 下的绑定；两步均要求 App JWT 和有效许可证。换绑票据不能用于公开绑定接口，也不能由其他用户使用。当前微信已绑定他人时拒绝换绑，原关系保留；换绑绝不创建用户。
- 绑定/换绑事务同步 `User.wechatOpenid/wechatUnionid`，不把微信登录认证当作微信实名认证。后台详情兼容旧绑定表记录，并返回 `wechatMiniAppId/wechatMiniBoundAt`；`GET /api/app/me` 下发 `wechatMiniBound/wechatMiniBoundAt/wechatMiniLoginEnabled`，供账号安全入口展示。时间字段 `wechatMiniBoundAt` 为绑定表 DateTime 的 ISO 字符串。

## 3. 通用约定（沿用 wiki-backend §4）

- 响应包络 `{ code: 0, data }`；错误 `{ code, message }`，中文文案风格与 M0 一致。
- 分页 `page`/`pageSize` → `{ list, total }`。
- 时间字段 `YYYY-MM-DD HH:mm` 字符串（M1 既有口径）。
- 功能开关：`registrationOpen / phoneRegisterOpen / emailRegisterOpen / mallOpen / demandOpen / reservationOpen` 由配置端点下发，写端点服务端二次校验（渠道开关仅拦截「未注册 → 建号」，已有账号仍可用该渠道验证码登录）。

## 4. 配置与字典下发

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/config | 站点信息 + 功能开关 + 站点标语 + `siteLogo`（登录页/首页用，客户端浏览器标签页图标取该 logo；不含 updatedBy 等管理字段） |
| GET | /api/app/dicts/:type | 仅 `status=enabled` 字典项（复用 `dicts:{type}` 缓存，管理页缓存键一致） |

## 5. 个人中心

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/me | 资料 + 身份列表（含各身份经验/等级）+ 积分余额 + `pointsDiscount`（积分消费折扣：1 = 1 折 … 10 = 原价，按本人社区个体等级）；`usernameChangeableAt` 下发用户名下次可修改时间（90 天限改一次，null=当前可改）；`hasPassword` 下发是否已设置登录密码（false = 未设置密码：只能验证码登录，或到「账号安全」设置密码） |
| PUT | /api/app/me | 更新昵称/头像/性别/简介等可编辑字段（头像为 `POST /uploads` 返回的 url）；用户名仅在与当前值不同时校验，90 天冷却内 400，成功后记录 `usernameChangedAt` |
| GET | /api/app/me/points-records | 我的积分流水（分页，含 balance）；积分按身份隔离：仅社区个体/个人用户可查看 |
| GET | /api/app/me/realname | 实名认证状态：`{ verified, realName? 脱敏（首字）, citizenIdMasked? 前 4 后 4, verifiedAt? }` |
| PUT | /api/app/me/realname | 提交实名认证：`realName` + `citizenId`（18 位，含校验码）；规则校验通过后立即认证并记录 `verifiedAt`，已认证返回 409 |
| GET | /api/app/me/experience-records | 我的经验与等级（按**当前身份**取数：社区个体 → 个人经验/我的等级；社区企业 → 企业经验/企业等级；个人用户/合作企业 → 空）；可选 `identity` 查询参数指定身份；响应 `{ identityLabel, level, levelName, nextLevelExp, records[] }` |
| GET | /api/app/me/applications | 我提交的申请（含审核时间线） |
| GET | /api/app/application-form/:type | 申请表单 schema：`type` = settle 企业入驻 / cooperation 合作伙伴 / individual 人才登记；返回字段定义与提交按钮文案，客户端按后台配置的 schema 渲染 |
| POST | /api/app/applications | 提交申请：schema 驱动字段（`fields`: key → string \| number \| 附件数组）；upload 字段值为 `POST /api/app/uploads` 返回的 `{ key, name, size, type, url }` 数组 → 管理端「申请审核」 |
| GET | /api/app/me/cards | 我的个人名片（社区个体；简历式分段字段） |
| PUT | /api/app/me/cards/individual | 保存个人名片：`displayName/age/politicalStatus/intro/industryExperience/skills` + 可增删分段 `education/work/projects/honors/socials/customLinks`（条目数组）+ `visibility`（`age/politicalStatus/isPublic`）；头像同步个人资料（只读）；免审保存即公开到社区人才库；`visibility.isPublic=false` 时退出人才库、公开名片页 404 |
| POST | /api/app/me/activation-dismissed | 永久隐藏新手任务（幂等）：按账号持久化 `User.activationDismissed`；客户端换浏览器/设备后一致隐藏，`GET /me` 下发该字段 |
| GET | /api/app/me/identities | 我的关联身份列表：社区个体 + 我关联的社区企业/合作企业（可多个）；企业项含 `roleLabel`（负责人/成员）、`isContact`、`permissions`（成员权限；负责人为全部）与 `enterpriseId` 详情入口；每项附 `pointsDiscount`（该身份消费积分时的等级折扣：个人身份取本人社区个体等级、企业身份取企业等级、合作企业按原价）；「我的」页有关联身份时显示「关联身份」入口 |
| GET | /api/app/me/enterprises/:id | 企业详情：关联人可查看；含企业信息（`logo` 企业 Logo、`foundedAt` 成立时间、`website` 官网、`address` 办公地点、`services` 主营业务、`advantages` 核心优势）、成员列表（含 `isContact`、职位与 `permissions`）、`myPermissions`（我在该企业的权限集合；负责人为全部）、负责人、待接受邀请（仅负责人）与退驻/注销申请状态 |
| PUT | /api/app/me/enterprises/:id | 修改企业基本信息（需 `edit_card` 权限；负责人默认拥有；行业/规模/简介/`logo`/成立时间/官网/办公地点/主营业务/核心优势；保存即生效） |
| POST | /api/app/me/enterprises/:id/transfer-contact | 转移企业负责人（后台字段「联系人」= `contactUserId`，**仅负责人本人**）：`memberUid?` / `memberName`；转移后原负责人转为只读成员 |
| POST | /api/app/me/enterprises/:id/invite | 邀请企业成员（需 `invite_member` 权限；姓名 + 手机号 + **职位 `role` 必填**）：生成邀请记录并发站内信；手机号需已注册，已是成员/重复邀请/邀请自己分别 409；未注册手机号短信邀请属于后置替换项 |
| PUT | /api/app/me/enterprises/:id/member | 修改企业成员信息：`memberUid?`/`memberName` + `role`/`phone`（需 `manage_members`；phone 为空串表示清空，冲突 409）+ `permissions`（需 `assign_permission`；负责人不可被分配，8 项枚举） |
| POST | /api/app/me/enterprises/:id/remove-member | 移除企业成员（需 `manage_members` 权限；`memberUid?`/`memberName`；负责人本人需先转移负责人，否则 409） |
| POST | /api/app/me/enterprises/:id/exit-application | 申请企业退驻/注销（可选 `reason`）→ 管理端审核，记录 pending 状态 |
| GET | /api/app/invitations/:id | 企业成员邀请详情（被邀请人本人或邀请方负责人可看，否则 403）：企业概要（`enterpriseLogo/enterpriseIndustry/enterpriseSize`）+ 邀请人/受邀成员/职位/状态（pending/accepted/rejected）与时间 |
| POST | /api/app/invitations/:id/respond | 被邀请人处理邀请（body `action=accept\|reject`，仅被邀请人）：接受则写入企业成员并通知负责人；已处理 409 |
| POST/GET | /api/app/me/messages | 用户留言：`POST` 提交留言（`title` 2-60 字 + `content` 5-1000 字，纯文本 sanitize）→ `pending` 待回复；`GET` 我的留言（倒序，含 `status`、后台回复 `replyContent/repliedAt/repliedBy`；已归档留言不下发）。后台在「用户留言」页回复并推送站内信（link `/me/messages`）；入口在「我的」页（`/me/messages`） |

## 6. 需求广场

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/demands | 浏览列表：仅 `published`；按可见范围过滤（§9）；分页/类别/关键词；可选 `kind=task\|investment\|cooperation` 按需求类型筛选（分页与 total 统计前执行，省略时不限；历史无 kind 数据按 task）；返回 `kind`（task 找服务 / investment 找投资 / cooperation 找合作）与类型专属字段（task 含 `deliverBy` 预期交付日期）；**联系人 `contactName/contactPhone/contactEmail` 仅在需求 `contactPublic=true` 时下发（含未登录游客），否则一律不下发**；社区自建需求（后台创建）返回 `publisherIdentity='official'` + `publisherIdentityLabel`（创建工作人员角色名）；返回只读 `respondNeedReview`（响应需审核开关）；`responseCount`（「N 人响应」）只统计未撤回的已通过/待处理响应，**不含 `pending_review` 待审核** |
| GET | /api/app/demands/:id | 详情（不可见 → 404，不暴露存在性；发布者可查看本人任意状态需求，其余人仅 `published` 且可见范围命中）；含响应数、`kind` 与类型专属字段（task: deliverable/budget/deliverBy；investment: cooperationNeed/returnOffer；cooperation: bottleneck/partnershipMode/returnOffer）与联系人信息（**同样按 `contactPublic` 下发**）；本人已响应时附 `myResponse: { message, at, status }`（`withdrawnAt` 非空即视为未响应，客户端据此隐藏响应入口并展示响应说明；响应需审核下 `status` 可能为 `pending_review`）；返回只读 `respondNeedReview`；立项后附 `projectId` 与 **`projectStatus`**（客户端据此派生「协作项目已生成 / 协作项目已结项，该需求已完成」并为发布者提供协作项目入口） |
| POST | /api/app/demands | 提交需求：`demandOpen` 开关校验；`kind` 必填（task/investment/cooperation）；`categoryDict` 指定类目字典（task/cooperation→demand_category，investment→industry）；task 必填 `deliverable`（可选 `budget`）与 `deliverBy`（预期交付日期，希望在该日期前完成），investment 必填 `cooperationNeed`（可选 `returnOffer`），cooperation 必填 `bottleneck`（可选 `partnershipMode`/`returnOffer`）；`contactName`/`contactPhone` 必填、`contactEmail` 选填（校验格式）；`deadline` 不再收集（历史字段保留展示）；`asIdentity` 四类身份均可发布（含合作企业，类型不限），持有社区个体身份时不再单列个人用户选项；发布方身份快照按 wiki §8.7，`publisherName` 按主体取企业名/组织名（个人取昵称）；成员代企业发布时传 `asEnterpriseId`（服务端校验成员 `publish_demand` 权限，无权限 403）；创建即 `pending` → 管理端审核 |
| GET | /api/app/me/demands | 我发布的需求（全状态，含 `kind`） |
| POST | /api/app/demands/:id/respond | 响应需求入参 `{ note(必填≤500), quote?≤64, timeline?≤128, cases?≤300, phone?(11 位，留空沿用身份手机号、填写则覆盖), email?(留空沿用账号邮箱、填写则覆盖), asIdentity?, asEnterpriseId? }`：`published` 校验、不可响应自己的需求、防重复；需求 `respondNeedReview=true` 时提交落 `pending_review`（发布者暂不可见、提交时不发积分不通知），管理员审核通过后才回 `pending` 并发放 `demand_responded` 积分、通知发布者；`respondNeedReview=false` 时提交即 `pending` 并即时发放积分（与现状一致） |
| GET | /api/app/me/responses | 我的需求响应记录（含 `pending_review` 待审核与 `rejected` 已驳回；含 `note/quote/timeline/cases/phone/email` 与驳回理由 `rejectReason`；驳回记录带 `withdrawnAt` 失效时间，可重新响应；本人记录不受「向需求方隐藏」影响）。`status` 原样下发，含立项收敛后的 **`undertaken`（已承接，客户端显示「已承接」并提供「查看我的项目」入口）** 与 `closed`（已结束）；另下发需求当前状态 `demandStatus` 与立项后项目 ID `projectId?`（未立项时省略） |
| POST | /api/app/me/responses/:id/withdraw | 响应者撤回待处理响应（`pending`/`pending_review` 可撤回，撤回落 `closed` + `withdrawnAt`，可重新响应）；已处理 409 |
| GET | /api/app/me/demands/:id/responses | 需求发布者查看响应列表（**不含 `pending_review` 待审核响应，也不含已撤回/已驳回（已置失效）记录**；响应方快照 + `responderRealName?/responderNickname?`（账号口径，供展示 `真实姓名（身份 · 昵称）`，**不下发用户 ID**）+ `note/phone/email/quote/timeline/cases` + `status=pending/contacted/accepted/undertaken/rejected/closed` + 审核时间/驳回原因）；**响应审核通过时管理员可勾选「向需求方显示」的字段，未勾选的字段（`hiddenFields`）逐项省略（键整体不下发）；响应者本人的「我的响应」不受影响**；非发布者 403 |
| POST | /api/app/me/demands/:id/select | 发布者选择意向承接方（`responseIds[]` 多选，去重且非空，全部须为本人需求下未撤回的待处理响应）；需求转 `selected`（`matchedRespondent` 记录被选人），被选响应转 `accepted` 并通知本人，未选中响应保持待处理（不可驳回）；不生成项目，由管理员在后台完成立项。**`selected` 态再次调用 = 重新选定**：先把上一次的 `accepted` 回退 `pending` 再落本次选定（覆盖语义），仅对本次新入选者发通知 |
| POST | /api/app/me/demands/:id/deselect | 发布者**撤销选定**：`selected → published`，本次已选定（`accepted`）的响应一并回退 `pending`，让选错/反悔后有纠正路径；仅 `selected` 可撤销（其余 409），非发布者 403 |

## 7. 活动中心

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/events | 浏览列表：`published` 且未结束；按可见范围过滤（§9）；分页/类型/关键词 |
| GET | /api/app/events/:id | 详情：报名进度（已通过/容量）、我是否已报名；随活动下发 `checkinLocationRequired / checkinCodeRequired / checkinCodeEnabled`（=required 且已配置 6 位码）——**不下发签到码明文**，扫码预填走二维码 URL 的 `?code=` 参数 |
| POST | /api/app/events/:id/enroll | 报名：`enrollmentOpen` + 报名截止 + 容量 + 可报名范围（§9）校验；`requireReview` 时进入 pending |
| POST | /api/app/events/:id/enroll/cancel | 取消报名：pending/approved 可取消，approved 释放名额 |
| POST | /api/app/events/:id/check-in | 电子签到：入参 `{ lat?, lng?, code?, captchaId?, captchaCode? }`（位置校验开启时必传经纬度；码启用时 code 必传 6 位）。校验顺序：报名通过/未签到 → 时间窗校验（开放时限通用） → **签到码**：连续错误 ≥4 次（第 4 次起）必须先过一次性图形验证码（复用 `GET /api/app/auth/captcha`，428 提示），码错 400「签到码错误」 → **位置校验**：仅 `checkinLocationRequired` 开启且已配置场地坐标时做 haversine 围栏（不满足 400「您不在活动签到范围内」，未带定位 400）。成功：置 `checkedIn/checkInAt/checkinLat/checkinLng`（checkinMethod=self）、发放 `activity_checkin` 积分（checkinPoints ?? 规则值）、电子票即刻核销；返回 `{ pointsAwarded, position（第 N 位签到，按已签到总数计）, title, startTime, endTime }`（成功反馈页展示活动信息与「第 N 位/积分到账」） |
| GET | /api/app/me/enrollments | 我的报名（含活动信息与状态） |

> 签到码防爆破与登录同一策略：单用户单活动输错计数存 Redis（TTL 15 分钟），第 4 次起强制验证码；签到成功清除计数。验证码沿用 app 登录体系（`captcha:app:` 前缀，消费即删、防同 ID 反复爆破）。

## 8. 项目履约 / 积分商城 / 空间 / 内容

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/me/projects | 我承接的项目（需求发起方 / 本人或其社区企业身份所在企业承接；进度与里程碑状态）。需求发起方按项目 `demanderId` 判定：主体为企业 ID 时解析到该企业联系人（后台代企业发需求立项后，联系人同样可见）。每项下发 `isInitiator`（我发起）与 `isUndertaker`（我承接），供客户端「我承接的 / 我发起的」分标签页；二者可同时为真 |
| GET | /api/app/me/projects/:id | 项目详情（需求方与承接方可看）：参与人、来源需求、进度与里程碑交付验收状态 |
| POST | /api/app/me/projects/:id/milestones/:milestoneId/submit | 承接方提交里程碑完成（可附说明）→ 待发起方验收；发起方调用 403 |
| POST | /api/app/me/projects/:id/milestones/:milestoneId/accept | 发起方验收里程碑；全部验收通过自动结项并按 wiki-backend §8.6 发放 `project_completed` 经验（仅「进行中/已暂停」项目且节点为「待验收」时可操作，409/404 与后台「进度节点」同口径；实现由 `ProjectMilestoneReviewService` 与后台共用） |
| GET | /api/app/mall/goods | 商品列表：`on` 且有库存优先（`restock` 库存为 0 不展示）；`mallOpen` 关闭 → 400；**按需方身份过滤可见范围**（商品自身 + 所属商品类别的可见范围都需通过；游客/未登录按无身份，仅「不限」商品可见）；**类别被停用或其字典项不存在时，该类别下商品一律不展示** |
| GET | /api/app/mall/goods/:id | 商品详情（可见范围外一律 404，不暴露存在性；口径同列表） |
| POST | /api/app/mall/orders | 兑换下单（统一券码）：**范围门槛**（商品 + 类别的可见/可下单范围都需通过，可见外 404、可下单外 403「当前身份暂不可兑换该商品」）+ **等级折扣实扣**（实扣 = round(商品积分 × 折扣 ÷ 10)，折扣取本人社区个体等级，无等级按原价；订单 `points` 存实扣额，退款按实扣退）+ 积分充足 + 库存充足（事务：扣积分+写流水+扣库存+建订单 `pending_use` 并签发 `voucherCode`/`voucherExpiresAt`） |
| GET | /api/app/me/orders | 我的兑换订单 |
| GET | /api/app/me/orders/:id | 我的兑换订单详情（仅订单本人；非本人/不存在 404，条目形状与列表项一致） |
| GET | /api/app/spaces | 可预约空间列表（`needApproval`/时段/设备/`feePerHour` 费用：积分每小时，0=免费）；**按空间的可见范围过滤**（`visibilityIdentities`/`visibilityLevels`，口径见 §9；游客与无等级身份仅见「不限」空间，详情/可用时段同样 404 且不暴露存在性） |
| GET | /api/app/spaces/:id/availability?date= | 某日可约时段：按空间「开放时间-关闭时间」逐小时切片（后台无预约规则配置入口，不设单次时长/提前天数限制；未开放预约、维护中、不在可见范围或不存在一律 404）；待审核/已通过预约与命中空间的已发布活动标为 `occupied`，并返回 `type`（`reservation`/`event`）标注占用来源 |
| POST | /api/app/spaces/reservations | 提交预约：canonical payload 为 `spaceId/date/start/end/topic?/attendees?/asIdentity?/asEnterpriseId?`；`reservationOpen` 开关校验 + 开放时段校验（须落在空间「开放时间-关闭时间」内，当天时段不得早于当前时刻）+ **可预约范围校验**（按本次实际身份 + 该身份经验值等级判定 `reservationIdentities`/`reservationLevels`，两数组都空 = 不限，不命中 403「该空间不在你的可预约范围内」；无等级身份在不限等级时可预约）+ 提交前冲突预检（pending/approved 预约与命中空间的已发布活动，活动命中与按天裁剪口径见 wiki-backend §8.8，409）+ **费用扣分**（费用 = 计费小时 × `feePerHour` 再按等级折扣折算：代企业预约取企业等级折扣、其余取本人社区个体等级折扣，实扣 = round(原价 × 折扣 ÷ 10)；计费小时不足 1 小时按 1 小时计；事务内条件扣减，余额不足 400「积分不足」并写 `source=space` 流水）→ 返回 `{ status, pointsSpent }`；管理端审核驳回或预约取消时全额退回（见 wiki-backend §8.8）。四类身份均可预约，企业身份以企业名/组织名生成服务端主体快照；成员代企业预约时服务端校验 `space_reserve` 权限（无权限 403） |
| GET | /api/app/me/reservations | 我的预约（可取消 pending 与未过结束时间的 approved，取消全额退回已扣积分）；`status` 新增派生值 `ended`「已完成」——已通过且已过预约结束时间时下发（存储态仍为 approved，与后台归档口径一致），该状态不可再取消；返回 `identityType`/`subjectName` 主体快照 |
| GET | /api/app/me/reservations/:id | 我的预约详情（仅本人，非本人/不存在 404）；含 `purpose`/`attendees`/`records` 时间线与 `feePoints`（本单实际消耗积分，0=免费）；状态口径同列表（`approved` 已过结束时间派生为 `ended`） |
| GET | /api/app/articles | 文章列表（`published`，栏目筛选/关键词；浏览量详情时 +1） |
| GET | /api/app/articles/:id | 文章详情 |
| GET | /api/app/article-columns | 栏目列表（enabled）；`?submission=1` 仅返回开放投稿栏目（投稿页使用，广场浏览筛选不受开关影响） |
| POST | /api/app/articles | 投递文章（channel=submitted，编号 SU 前缀）：提交即待审核，审核通过转待发布（状态机同 wiki §8.1，作者身份快照） |
| GET | /api/app/me/articles | 我投递的文章（含驳回原因，可再提交） |
| GET | /api/app/enterprises/:id | 企业展示页（`logo`/`foundedAt`/`website`/`address`/`services`/`advantages` 精致名片字段） |
| POST | /api/app/uploads | 申请资料 / 配图上传：multipart（`file` + `bizType`），仅图片与 PDF（魔数嗅探），大小限制同系统配置；返回 `{ key, name, size, type, url }` |

### 8.1 需求撮合与项目履约端点

> 本节端点均已实现并接入真实后端。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/me/demands/:id/responses | 需求发布者查看响应（**不含 `pending_review` 待审核响应**；响应方快照 + `status=pending/accepted/rejected` + 审核时间/驳回原因）；非发布者 403 |
| POST | /api/app/me/demands/:id/select | 发布者选择意向承接方（`responseIds[]` 多选）→ 需求转 `selected`、被选响应转 `accepted` 并通知；未选中响应保持待处理，不生成项目，由管理员后台立项 |
| POST | /api/app/me/responses/:id/withdraw | 响应者撤回待处理响应（`pending`/`pending_review` 可撤回，撤回后可重新响应） |
| GET | /api/app/me/projects/:id | 项目详情（参与双方、来源需求、进度与里程碑交付验收状态） |
| POST | /api/app/me/projects/:id/milestones/:milestoneId/submit | 承接方提交里程碑完成（可附说明）→ 待发起方验收；发起方调用 403 |
| POST | /api/app/me/projects/:id/milestones/:milestoneId/accept | 发起方验收里程碑；全部验收通过自动结项并按 wiki-backend §8.6 发放 `project_completed` 经验（仅「进行中/已暂停」项目且节点为「待验收」时可操作，409/404 与后台「进度节点」同口径；实现由 `ProjectMilestoneReviewService` 与后台共用） |
| POST | /api/app/me/demands/:id/withdraw · /resubmit · /appeal | 需求撤回（pending→withdrawn）、驳回/撤回后重提（保留编号）、驳回后一次性申诉 |
| POST | /api/app/me/articles/:id/withdraw · /resubmit · /appeal；GET /api/app/me/articles/:id/payload | 投稿撤回 / 重提（回填原始内容）/ 申诉 |
| POST | /api/app/me/applications/:id/withdraw · /resubmit；GET /api/app/me/applications/:id/payload | 申请撤回 / 修改重提（可补充材料；附件需重新上传） |
| POST | /api/app/mall/orders/:id/cancel | 券码退款（仅 `pending_use` 且未过期）：退积分 + 回补库存 → `cancelled`；核销由后台工作人员现场执行（`/api/admin/mall/redemption-orders/:id/verify`），用户侧不提供核销端点；过期未使用券由定时任务自动退款 |
| GET | /api/app/me/favorites · POST /api/app/me/favorites/toggle | 收藏需求 / 文章 / 活动与切换 |
| POST | /api/app/me/enterprises/invitations/:id/revoke | 撤销待接受的企业成员邀请（邀请 7 天有效期） |
| GET | /api/app/me/transfer-requests · POST /:id/respond · /:id/cancel | 待确认负责人转移请求列表（GET 仅返回 `pending`，已处理/已过期不再下发） / 目标成员接受或拒绝 / 发起方撤销（接受后变更负责人） |
| POST | /api/app/analytics/events | 行为埋点旁路上报（登录/注册/发布/响应/报名/签到/下单/投稿/预约/收藏/举报/搜索）；失败不影响业务交互 |
| POST | /api/app/auth/reset-password · /auth/change-phone · /me/change-password | v38 找回密码（短信码+限频）/ 换绑手机号（新号验证码+占用 409）/ 登录态改密（原密码校验，成功后其他会话失效） |
| POST | /api/app/me/deletion-request · /me/data-export | v38 注销申请（运营复核）与个人数据导出（异步打包 + 站内信） |
| GET/POST | /api/app/events/:id/feedback | v38 活动反馈（结束后 + 参与过，一人一条） |
| GET/PUT | /api/app/me/notices/prefs | v38 通知偏好（启用的类型集合，至少一种；同时约束推送） |
| POST | /api/app/me/projects/:id/milestones/:mid/return | v38 发起方退回里程碑（记录原因，承接方可重新提交；提交支持 `attachments[]`；与后台「进度节点」驳回同口径，仅「进行中/已暂停」项目且节点为「待验收」时可操作） |
| GET/POST | /api/app/me/blocklist(/:uid/remove) | v38 屏蔽名单（评论与内容列表过滤被屏蔽用户） |
| POST/GET | /api/app/articles/:id/likes/toggle · /articles/:id/comments | v38 文章点赞与评论（评论 2-200 字，过滤屏蔽用户） |
| POST | /api/app/auth/register（`agreed` 必填） | v38 注册须同意用户协议与隐私政策并留痕 |
| POST | /api/app/auth/login-by-code（`agreed` 必填） | 登录/注册统一入口：手机号/邮箱验证码校验通过后由服务端判定登录或建号（`isNewUser`），建号账号为「未设置密码」。单条端点承担两种语义，故协议勾选统一必填；`GET /api/app/me` 的 `hasPassword` 与 `POST /api/app/me/change-password` 的 `oldPassword` 可选共同支撑「未设置密码 → 设置密码」链路 |

### 8.2 撤回/重提/申诉与回填端点

> 本节源自 v40~v43 客户端能力，现均为正式契约。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/search | 全域聚合搜索：`keyword` + 可选类型过滤（demand/event/article/enterprise/space/talent/community）+ 分类计数 + 分页 cursor；结果与首页/各列表一致 |
| GET | /api/app/home | 首页聚合：siteInfo + 功能开关 + 公告 `announcements`（有效期内、置顶优先取 2，Announcement 增 `expireAt/link`）+ 轮播 `carouselEnabled` 与 `banners`（专用 `HomeBanner`，仅 enabled、按 sort 升序；受 SystemConfig.homeCarouselOpen 总开关控制，关闭时 `carouselEnabled=false` 且 `banners=[]`）+ 精选活动/最新需求/置顶文章/未读数（缺口 §7.1-3 扩展） |
| GET | /api/app/events/:id/ticket | 电子票（按活动，移动端唯一入口）：报名 approved 签发 `ticketNo` + HMAC 确定性核销码（HMAC-SHA256(eventId+ticketId+secret) 截断），返回 `eventId/eventTitle/startTime/location/ticketCode/status(valid/checked/cancelled)/checkedIn/waitlistOrder`；签到成功即核销（E1）。原 `GET /me/enrollments/:id/ticket`（返回 ticketNo/redeemCode）已于对齐修复中移除 |
| GET/POST | /api/app/me/demands/:id/messages | 需求沟通留言板：`GET` 消息列表（仅需求发布方与响应方可见，未读计数）+ `POST` 发言，消息可追溯（E2） |
| GET | /api/app/me/realname-rights | 当前发布限制展示：个人实名状态、社区个体/社区企业等级对应的需求发布、文章投稿额度与积分消费折扣（活动报名/空间预约不再按等级区分，故等级卡不展示；按身份组的额度在「个人用户规则」页维护）；企业额度按企业主体共享 |
| GET | /api/app/me/stats | 个人数据看板：积分/经验/需求/响应/项目/活动/签到聚合口径（E5） |
| GET | /api/app/me/enterprise-workbench | 企业工作台：企业维度聚合（需求/响应/项目/成员统计），仅成员/负责人可看（E7） |
| — | ~~/api/app/service-applications~~ | 社区公共服务申请已下线（社区政策浏览与通用申请审核保留） |
| POST | /api/app/mall/orders/:id/review | 订单评价：1~5 星 + 文字（每单一次；需订单 finished） |
| GET/POST | /api/app/me/history | 浏览历史：本机阅读历史增量上报/拉取/分页；DELETE 清空（D7） |
| GET | /api/app/card-schema/:type | 名片可编辑字段 schema 下发（`type=individual\|enterprise`；后台可配置用户可填字段） |
| GET | /api/app/community/policies | 社区服务/政策内容（Policy 模型：PL 前缀、`category/version/effectiveAt/publisher/attachments/featured/status`；运营来源 admin A18）（§7.1-12 + Q3） |

**§8.1/§8.2 转正注记**：响应撤回、项目里程碑、申请与投稿重提、商城履约、收藏、埋点、地址、账号治理、举报、屏蔽、评论、候补等端点均已实现。

## 9. 可见范围与可预约/可报名范围过滤（需求/活动/空间通用）

- 用户身份集合 I（individual/community_individual/community_enterprise/external_enterprise）与等级集合 L（各身份 level）。
- 需求：`visibilityIdentities` 含 I 中任一身份类型 **且** `visibilityLevels` 与该身份等级有交集；空数组语义 = 不限（沿用 M0）。
- 活动：浏览按 `visibilityIdentities/Levels`；报名另校验 `enrollmentIdentities/enrollmentLevels`。
- 空间：浏览按 `visibilityIdentities/Levels`（`/api/app/spaces` 列表条件 + 详情/可用时段 404）；提交预约另按「本次实际身份 + 该身份等级」校验 `reservationIdentities/reservationLevels`（不命中 403）。
- 过滤在服务端实现（列表 SQL 条件 + 详情 404），不依赖前端隐藏。

## 10. 积分引擎触发点（M2 批次，wiki-backend §8.4）

`daily_login`（登录）、`article_accepted`（投稿审核通过）、`demand_published`（需求审核通过后由管理端发布即触发）、`demand_responded`（客户端响应）、`demand_undertaken`（立项）、`project_milestone`（里程碑完成）。M1/M1.5 已接入：`activity_enroll_approved` / `activity_checkin` / `identity_first_bind`（触发调用由当前业务 Service 维护，按规则启停发放）。

## 11. 实现与维护

接口已接入真实 HTTP；新增路由见 [生成索引](routes.md)。请求 DTO、鉴权和业务状态机以当前源码为依据，不将早期 M2 分期表作为待办清单。

## 12. 站内信

> 缺口 §7.1-1。`UserNotification` 模型（id UN；type audit_result/enroll_result/order/points/system/invite/transfer/report/article/demand/project/mall/service + link?；title/content/at/read；userId）。**不再有归档与分类偏好**：全部消息同一列表，按时间倒序；`NotificationService` 始终写入。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/notices | 站内信列表：分页（按时间倒序，可按类型查询但前端不分类）；返回未读数 |
| GET | /api/app/notices/unread-count | 未读数（首页/顶栏角标） |
| POST | /api/app/notices/:id/read | 标记已读（幂等） |
| POST | /api/app/notices/read-all | 全部已读 |
| — | ~~/api/app/notices/:id/archive~~ · ~~/api/app/me/notices/prefs~~ | 归档与通知偏好端点已移除（404） |

**触发点**（R2/R3 各业务接线，均经 `NotificationService.pushNotice()`）：申请/需求/投稿/报名/预约审核结果、订单下单/发货/取消/补货、签到成功、注册欢迎、企业邀请/接受/拒绝/成员更新、负责人转移请求/结果、举报处置回执、活动候补递补、改期/取消通知、里程碑提交/验收/退回、数据导出完成。


## 现金交易

/api/app/commerce 已包含报价、订单、支付、微信授权、小程序 openid 绑定、取消与退款申请；/api/app/me 包含现金交易和账单。流程、资源占用与验收边界见 [交易与支付](../features/commerce.md)。旧积分接口仍拒绝现金商品/空间，不能绕过收银台免费履约。


## 企业代办

企业代办是独立业务域，不复用身份类 `/api/app/applications`：提交通过只改代办状态，不授予社区身份、不发积分。本期只开放 `serviceType=registration`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/app/enterprise-agency/registration/uploads` | 私有附件上传（JPG/PNG/GIF/WebP/PDF，上限取系统上传配置，默认10MB），返回 `{ fileId,name,size,mime }`，不返回公开 URL |
| GET | `/api/app/enterprise-agency/registration/files/:fileId` | 本人附件读取（鉴权 Blob） |
| POST | `/api/app/enterprise-agency/registrations` | 提交企业注册申请；`payload` 含公司、股东数组、法人/监事/财务、产权材料、联系人、授权。可选请求头 `x-idempotency-key`（1–64 位可见 ASCII）：同键同载荷重放原响应（返回原申请 ID），同键不同载荷 409；键记录与业务写入同事务，过期时间 24 小时，过期后同键视为新请求 |
| GET | `/api/app/enterprise-agency/registrations` | 我的办理记录 |
| GET | `/api/app/enterprise-agency/registrations/:id` | 我的申请详情（内部备注不返回） |
| POST | `/api/app/enterprise-agency/registrations/:id/withdraw` | 撤回（仅 `pending`） |
| POST | `/api/app/enterprise-agency/registrations/:id/resubmit` | 待补充/已驳回/已撤回 → 待处理；幂等键语义同提交，载荷摘要额外绑定申请 ID |

客户端幂等键约定（P0-6/S3）：移动 Web 与小程序在表单内容变化后重新生成键，自上次内容变化以来的提交/重试共用同一键；键仅保存在内存，不写入本地存储。未携带键保持原语义（不重放），重复提交仍被「同用户同服务仅一单进行中」约束与材料绑定校验拦截。过期幂等记录由调度任务 `app-idempotency-cleanup` 每小时清理。

管理端（`@RequirePermission('/enterprise-agency/registration')`）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/enterprise-agency/registrations` | 列表：`status` + `keyword`（申请编号/公司名/联系人/电话）+ 分页 |
| GET | `/api/admin/enterprise-agency/registrations/:id` | 详情（含申请人、完整资料、时间线；写审计） |
| GET | `/api/admin/enterprise-agency/registrations/:id/files/:fileId` | 私有附件读取（写审计） |
| POST | `.../:id/accept` | `pending → processing`；`comment` 可选 |
| POST | `.../:id/request-info` | `pending/processing → needs_info`；`reason` 必填 |
| POST | `.../:id/complete` | `processing/needs_info → completed`；`comment` 可选 |
| POST | `.../:id/reject` | `pending/processing/needs_info → rejected`；`reason` 必填 |
| POST | `.../:id/notes` | 内部备注（`visibility=admin`，用户端不可见） |

状态：`pending / processing / needs_info / completed / rejected / withdrawn`。同一用户同服务只允许一单未归档的进行中申请（pending/processing/needs_info），新建及旧单重提均校验，冲突返回409。数据库部分唯一索引兜底，事务行锁保护时间线追加；申请、文件绑定、站内信与后台操作审计原子提交，失败全部回滚。重复状态动作返回409。字段、校验与隐私边界见 [企业代办](../features/enterprise-agency.md)。

## 企业代办扩展服务（财税 / 工商变更 / 资质许可）

三个扩展服务为「社区代办前信息收集」入口：**任意登录用户可提交**（与企业注册口径一致），申请是服务请求记录、不代表系统内企业身份，与 UserIdentity/enterpriseId 完全解耦；企业成员代表授权不设系统字段，由工作人员受理时核实。六态状态机、进行中唯一约束、行锁时间线、附件鉴权、站内信、审计与幂等键均与注册代办同口径。

公共接口（`/api/app` 前缀）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/app/enterprise-services/catalog` | 服务目录：`code/name/route/enabled/disabledReason/guide` + `version/schemaVersion/consentVersion`；guide为带版本/核对日期/来源的采集准备清单，含事项说明及条件材料，不替代地区办事指南 |
| GET | `/api/app/enterprise-services/mine` | 我的聚合记录：跨四服务稳定排序，`cursor/pageSize` 分页，返回 `list/nextCursor/hasMore/activeByService`；后者为各服务的最新进行中摘要（无则null），不受当前分页影响；两者均仅含id/serviceType/status/companyName/summary/submittedAt/updatedAt，不含联系人、电话、payload与内部备注。按submittedAt降序、serviceType升序、id降序键集分页；游标记录移动/软删除不会失效，后续翻页不包含新插入的头部记录，刷新可见新头部 |
| POST | `.../enterprise-services/:service/uploads` | 已停用（410，请随提交multipart上传）；原契约：分服务私有上传（JPG/PNG/GIF/WebP/PDF，≤10MB），返回 `fileId/name/size/mime`。新单须服务启用；旧单补件带 `?requestId=<id>`，校验本人、服务与needs_info/rejected/withdrawn状态，暂停时仍可补件 |
| GET | `.../enterprise-services/:service/files/:fileId` | 本人分服务附件读取（鉴权 Blob，private/no-store） |
| POST | `.../enterprise-services/:service/applications` | 提交：`{ payload }`；可选 `x-idempotency-key`（语义同注册代办） |
| GET | `.../enterprise-services/:service/applications` | 我的该服务记录 |
| GET | `.../enterprise-services/:service/applications/:id` | 详情：`revision/schemaVersion/catalogVersion` + 类型化 payload + 用户可见 records（含稳定id）+ `canWithdraw/canResubmit`；跨用户统一 404 |
| POST | `.../:id/withdraw` | 撤回（仅 `pending`） |
| POST | `.../:id/resubmit` | 待补充/已驳回/已撤回 → 待处理；幂等键摘要绑定申请 ID |

修订号由四张申请表的数据库触发器持久维护，状态/载荷/时间线/软删除实质更新递增，读取、失败事务、幂等重放不递增；仍以行锁控制写入，不接受expectedRevision条件写。旧时间线事件派生稳定兼容ID，下一次追加自然持久化；旧三类申请版本为legacy，新提交/重提记录当前schemaVersion=1、catalogVersion=2026-10-31。payload可携带两项版本，显式不匹配返回400并提示重载；安装中的旧客户端省略版本兼容接收。授权文案版本consent.version须为2026-10，确认时间consent.agreedAt由服务端生成。

`:service` 取值 `finance-tax` / `business-change` / `license`。附件引用约定与注册一致：payload 内 `xxxFileId` 传 fileId 字符串，`name/size/mime` 由服务端按库重建，拒绝伪造元数据。未知字段一律 400（错误信息带字段路径）。

管理端（`/api/admin/enterprise-services`，权限按服务映射既有菜单码 `/enterprise-agency/finance-tax|business-change|license`，无对应菜单码 403）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/:service/applications` | 列表：`status/keyword/purpose/licenseType` + 分页；手机号脱敏（前3后4） |
| GET | `/:service/applications/:id` | 详情（完整 payload、时间线含内部备注；写审计） |
| GET | `/:service/applications/:id/files/:fileId` | 附件读取（须与申请、服务域匹配；写审计） |
| POST | `.../:id/accept` | `pending → processing`；`note` 可选 |
| POST | `.../:id/request-info` | `pending/processing → needs_info`；`reason` 必填 |
| POST | `.../:id/complete` | `processing/needs_info → completed`；完成摘要必填（交付范围/日期/可核验凭证编号） |
| POST | `.../:id/reject` | `pending/processing/needs_info → rejected`；`reason` 必填 |
| POST | `.../:id/notes` | 内部备注（用户端不可见，不发通知） |

三个服务在注册表中为独立模型（`EnterpriseTaxEngagement` 前缀 TE、`BusinessChangeRequest` 前缀 BR、`LicenseApplication` 前缀 LA），附件经 `EnterpriseAgencyFile.domain + taxRequestId/changeRequestId/licenseRequestId` 类型化绑定（数据库 CHECK 保证恰一归属）。需部署迁移 `20261030140000_enterprise_services_expansion`。表单字段矩阵、条件卡版本与完成语义见 [企业代办](../features/enterprise-agency.md)。

后台系统配置新增 `enterpriseTaxOpen/enterpriseChangeOpen/enterpriseLicenseOpen`（布尔值，默认false，旧载荷省略时保持原值）。目录与创建检查即时读库；新建在事务内对配置行加共享锁，与暂停写入串行化。关闭不影响旧申请的查询、合法重提/撤回及既有请求的幂等重放；新创建及无申请上下文上传返回403。跨服务/跨用户补件上下文返回404。

扩展服务时间线写入锁定对应独立申请表；附件绑定同时检查domain与四类关联，未绑定材料也不可跨域复用。孤儿清理须四类关联均为空，数据库禁止绑定材料进入deleting。增量迁移为 `20261031010000_enterprise_service_switches`、`20261031011000_enterprise_service_cleanup_guard`，不使用seed重置存量数据。

## 企业代办收费（agency_service 资金链路）

企业代办四类业务支持按服务配置收费：`free`（免费）/ `fixed`（固定费用）/ `manual`（人工报价），各代办列表页“业务设置 → 收费设置”按服务配置模式、金额（分）、账单标题与退款政策；任一收费相关字段变化时配置版本自增。默认全部免费；2026-11-01起退役各模块独立收款开关，收费由业务定价/首次受理费用决定，支付仍须商户配置齐全并启用。

费用在**受理动作**内确定并出账（同一事务）：`free` 持久免费决定（后续重提/配置变化不补收）；`fixed` 按配置金额生成账单；`manual` 由受理管理员填报价金额（1–100000000 分）与说明。账单 `businessKey = agency:<serviceType>:<applicationId>` 防重；订单 `sourceType='agency_service'`、归属申请人。办理状态与资金状态独立：未付款不阻塞补件/办结，付款/退款不改变办理状态。

### 用户端

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/app/enterprise-services/fee?service=<route>&id=<applicationId>` | 费用投影：`decisionStatus`（pending_acceptance/free/quoted）、`estimated`、`amountFen`（未决定为 null）、`paidFen/refundedFen/reservedRefundFen`、`canPay/blockedReasonCode`（NOT_ACCEPTED/FREE/REPRICING/ATTENTION/PAYMENT_UNAVAILABLE）、`activeChange`；须本人申请 |
| POST | `/api/app/commerce/orders/:id/payments` | 发起支付（复用商城收银台编排：微信内 JSAPI/外部浏览器 H5/桌面 Native/小程序 wx.requestPayment）；代办必传 `quoteVersion`，版本变化返回 409 要求重新确认 |

### 管理端

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/admin/enterprise-agency/registrations/:id/accept` 与 `/api/admin/enterprise-services/:service/applications/:id/accept` | 受理同事务出账；manual 模式必传 `quoteAmountFen`（1–100000000 分）与 `quoteNote`；已有费用决定不重新报价 |
| PUT | `/api/admin/enterprise-services/fees/:billId` | 未付账单改价：`amountFen/reason/expectedQuoteVersion` + `Idempotency-Key`；两阶段（渠道查关全部未终结尝试 → 应用），返回 200（已应用）或 202（处理中）；已付款/版本冲突/同额拒绝 |
| GET | `/api/admin/enterprise-services/fees`、`/fees/:billId` | 费用列表/详情：按管理员可访问服务过滤，含改价历史与退款进度 |
| POST | `/api/admin/commerce/payments/:id/refunds` | 部分退款（agency 新增能力，其他来源仍全额）：`amountFen ≤ 实收−占额`、`operationKey` 幂等、异人审批；退款不改办理状态 |

### 实施边界

- 改价期间（`editState=repricing`）禁止新支付；在途下单持久登记，改价前必须查关全部旧尝试，结果不明转 `attention` 人工核对，迟到实收保留证据不覆盖。
- 用户自助退款对代办返回业务拒绝；退款由运营发起、异人审批。已全退申请重提不再出账。
- 迁移：`20261031130000_agency_payment_dispatch_owner`、`20261031133000_agency_fee_integrity`（含历史受理 legacy_free 保守回填，不追溯收费）。默认全部免费，暂不发布。

## 微信网站应用（扫码）一键登录

移动 Web 的微信扫码登录基于微信开放平台「网站应用」OAuth2（[官方文档](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html)）。AppID/AppSecret/授权回调地址在后台「系统配置 → 功能开关 → 微信网站应用（扫码）登录 · 移动客户端」配置（AppSecret 只写、不回传原文）；环境变量 `WXWEB_APPID / WXWEB_APP_SECRET / WXWEB_REDIRECT_URI` 仅作回退。该渠道有独立开关 `wxWebLoginOpen`，与小程序一键登录的 `wxLoginOpen` 互不影响；`GET /api/app/config` 的 `wxWebLoginOpen` 表示网站应用开关开启且配置齐全。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/app/auth/wechat-web/start?redirect=` | 下发微信 OAuth 授权页地址（`open.weixin.qq.com/connect/qrconnect`，scope=snsapi_login）；redirect 仅接受站内路径，作为 `state` 原样带回 |
| POST | `/api/app/auth/wechat-web/login` | `{ code }` 授权码换身份：服务端 access_token → userinfo（access_token 不落库）。已绑定直接返回登录结果；未绑定签发一次性票据（10 分钟）与可用验证渠道，`wechatNickname` 为微信昵称兜底展示 |
| POST | `/api/app/auth/wechat-mini/bind` | 绑定第二步（小程序与网站应用共用）：票据按 appid 区分来源；验证码方式可登录或注册，密码方式只绑定已有账号 |

微信身份统一落 `WechatUserBinding`（appid+openid 唯一）；同开放平台 unionid 已在其他渠道绑定时自动并号到同一账号。回调域：微信授权完成后浏览器回到 `wxWebRedirectUri`（须与开放平台「授权回调域」一致），移动 Web 登录页检测 `code`+`state` 后调用登录接口并清理 URL。


## 企业代办入口开关（2026-10-31补充）

新增 `enterpriseAgencyOpen` 总开关及 `enterpriseRegistrationOpen` 注册业务开关（均默认true以保持已有注册能力），财税/工商变更/资质许可仍默认false。后台功能开关统一配置并留审计；旧载荷省略新字段保持原值。`/api/app/config`即时返回总开关及注册开关，后台壳读取同一公开配置，无需系统配置权限。

关闭单项时两端隐藏该服务申请卡片、介绍页引流入口；已有办理记录仍保留，旧单合法重提继续可用。关闭总开关时两端隐藏企业代办入口、直达页回到我的页；后台隐藏整个企业代办菜单并拦截直达页，清理已打开代办标签。总开关不覆写各子项设置。API总开关覆盖扩展服务目录和新建检查，注册新建也检查总/子开关；保留旧单读取及办理API，避免隐藏菜单等同删除业务数据。

## 企业代办附件与保留期更新（2026-10-31）

四业务提交/重提沿用原POST路径，支持multipart/form-data：payload为JSON字符串、文件字段名为payload所引用的UUID v4；单文件10MB、总文件64MB、最多64份、payload最多1MB。JSON仍用于既有合法附件引用。x-idempotency-key保持原契约，同键重放不重复申请/绑定；同文件ID不同内容拒绝覆盖。独立registration/uploads及三服务uploads返回410（要求更新客户端），不保存未提交草稿。

SystemConfig.enterpriseAgencyFileRetentionDays为后台整数配置，默认90，范围1–3650；省略保持原值，null和越界400，不下发App配置。四申请模型completedAt从完成状态起算；只有completed申请参加过期清理，其他状态保留。到期仅删除存储附件，保留payload、办理记录及时间线；删除后的附件读取404，无用户删除申请接口，不下发保存截止日期。详细操作、批次与失败恢复见[材料生命周期](../features/enterprise-material-lifecycle-2026-10-31.md)。


## 业务设置就近维护（2026-11-01）

新增`GET/PUT /api/admin/business-settings/:scope`，按业务白名单返回/保存配置；PUT为`{values, expected}`，事务内比较原值，冲突409，未知字段/非法值400。需对应菜单权限、`perm:business-settings:<scope>`和数据域共同满足，不自动授予既有角色。

名片`GET/PUT .../:scope/card`，表单`GET/PUT .../:scope/form`，行业`GET/POST .../enterprises/industry`、`POST .../enterprises/industry/:code/toggle-status`、`DELETE .../enterprises/industry/:code`。迁移`20261101000000_business_settings`增加四业务独立附件保留天数并继承原值。旧系统全量保存不再覆盖已迁出的业务字段；旧名片/表单写入口同样校验业务设置权限。scope与字段范围见[业务设置规范](../features/business-settings-2026-11-01.md)。

退役cashMallOpen/cashSpaceOpen/cashEventOpen/cashLeaseOpen/cashAgencyOpen的运行时门禁：商户配置、渠道能力、收费金额、归属、版本与资金状态仍校验。兼容字段不再可写，公开布尔兼容值恒true，不代表商户已开放，实际能力仍读commerce/capabilities。积分计价不改变。
