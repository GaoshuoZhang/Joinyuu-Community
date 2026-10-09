# 聚屿社区 · 客户端 API 设计（/api/app/**）

> 契约要点：实名认证通过身份证规则校验后立即生效，查询返回 `{ verified, realName?, citizenIdMasked?, verifiedAt? }`，不经过后台人工复核。`GET /card-schema/:type`（individual/enterprise）返回 `{type, editableFields[]}`。个人/企业名片 PUT 为部分更新：省略保留，空串清空，用户提交禁用字段 403；后台 `/api/admin/cards/**` 可维护全部名片字段。注销冷静期 7 天，届满由工作人员执行，执行前可撤回，已注销账号不可登录或恢复。

> M2 客户端 Web（居民端）端点设计。依据：M0 冻结的实体模型与状态流（`docs/wiki-admin-web.md`）、
> 后端既有契约与业务规则（`docs/wiki-backend.md` §4/§5/§8）及当前 Prisma 数据模型（68 模型）。
> 本文档为 M2 实施的契约基线：实施前如有调整，先改本文档（记录变更）再改代码（wiki-backend §14 契约变更流程）。
> 状态：**M2-R 已完成，本文为 `/api/app/**` 正式契约**。偏差先更新本文档，再按 wiki-backend 的契约变更流程修改代码。

## 1. 定位与范围

- 服务对象：个人用户 / 社区个体 / 社区企业成员 / 合作企业成员（external_enterprise 身份，经企业合作申请产生，无独立注册入口）。
- 路径前缀：`/api/app/**`，与管理端 `/api/admin/**` 平行；复用同一 NestJS 应用、同一 Prisma 库与包络/异常底座。
- 不做：管理端能力（审核/发布/配置）、管理端通知中心（AdminNotification 为管理员维度）。

## 2. 鉴权模型

| 项 | 设计 |
|---|---|
| 注册 | `POST /api/app/auth/register`；body `{channel: email\|phone, email?, phone?, code, password, agreed, gender?}`。默认邮箱注册；后台已配置可用短信渠道时可选手机号注册；**无论何种渠道都必须验证码验证**（邮箱渠道用邮箱验证码，手机渠道用短信验证码）；验证通过的邮箱/手机号即成为该用户「可信通知渠道」。注册不填昵称与用户名：服务端自动分配（用户名 `user_` + 随机码全站唯一；昵称 `岛民` + 随机数字全站唯一）。邮箱/手机号库内唯一且可空；受 `registrationOpen` 控制；默认授予 `individual`；同时记录用户协议与隐私政策版本 |
| 登录 | `POST /api/app/auth/login`；body `{identifier, password, captchaId, captchaCode}`，`identifier` 支持**手机号 / 邮箱 / 用户名**；签发多身份 JWT：`{ sub: uid, scope: 'app', identities: [...], jti }` |
| 令牌校验 | 复用 JWT Guard（按 `scope` 区分 admin/app 两套守卫）；登出黑名单复用 `auth:blacklist:{jti}` |
| 登出 | `POST /api/app/auth/logout` |
| 图形验证码 | `GET /api/app/auth/captcha` → `{captchaId,image}`；登录一次性消费 |
| 通道可用性探测 | `GET /api/app/auth/sms/available`、`GET /api/app/auth/email/available` → `{available}`（已启用对应渠道且验证码模板已发布）；客户端据此决定注册入口与验证方式是否开放 |
| 验证码发送 | `POST /api/app/auth/sms/send`（body `{phone, purpose, deviceId?}`）与 `POST /api/app/auth/email/send`（body `{email, purpose, deviceId?}`）→ `{expiresInSec, devCode?}`（`devCode` 仅非生产环境干跑时返回）；`purpose`：短信 `register\|reset_password\|change_phone\|login`、邮箱 `register\|reset_password\|change_email`；频控：同号/同邮箱+用途 60 秒冷却、日限 10 次、同 IP 10 分钟 20 次、同设备 1 小时 10 次；校验失败 5 次即失效；下发经发送队列（安全类强制送达） |
| 找回密码 | `GET /api/app/auth/recovery-channels?identifier=` → 该账号**已验证可信渠道**（脱敏 `{email, phone}`）；`POST /api/app/auth/reset-code/send` body `{identifier, channel}` 由服务端解析可信渠道并投递验证码（客户端不接触真实地址）；`POST /api/app/auth/reset-password` body `{identifier, channel, code, newPassword}` → 校验通过后更新密码并全端登出 |
| 账号绑定 | `POST /api/app/auth/change-phone`（body `{newPhone, smsCode}`）、`POST /api/app/auth/change-email`（body `{newEmail, code}`）：绑定或更换均须验证**新**手机号/邮箱，验证后标记为可信渠道；占用冲突 409 |
| 用户名/昵称 | 全站唯一，各有保留名单（`admin`/`管理员` 等，占用报 400）；用户名登录标识（字母开头 4-20 位，仅字母/数字/下划线，登录时忽略大小写），昵称仅作展示（≤20 字符，支持中文）。经 `PUT /api/app/me` 修改 |
| 修改密码 | `POST /api/app/me/change-password` body `{oldPassword, newPassword}`：校验原密码后更新，并**强制退出全部会话（含当前会话）**，客户端需重新登录 |
| 每日登录积分 | 登录成功触发 `daily_login` 规则（PointsRule 固定触发项，种子默认停用；引擎按规则启停发放，自然日去重随 M2 客户端接入落地） |

## 3. 通用约定（沿用 wiki-backend §4）

- 响应包络 `{ code: 0, data }`；错误 `{ code, message }`，中文文案风格与 M0 一致。
- 分页 `page`/`pageSize` → `{ list, total }`。
- 时间字段 `YYYY-MM-DD HH:mm` 字符串（M1 既有口径）。
- 功能开关：`registrationOpen / mallOpen / demandOpen / reservationOpen` 由配置端点下发，写端点服务端二次校验。

## 4. 配置与字典下发

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/config | 站点信息 + 功能开关 + 站点标语（登录页/首页用；不含 updatedBy 等管理字段） |
| GET | /api/app/dicts/:type | 仅 `status=enabled` 字典项（复用 `dicts:{type}` 缓存，管理页缓存键一致） |

## 5. 个人中心

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/me | 资料 + 身份列表（含各身份经验/等级）+ 积分余额 + `pointsDiscount`（积分消费折扣：1 = 1 折 … 10 = 原价，按本人社区个体等级）；`usernameChangeableAt` 下发用户名下次可修改时间（90 天限改一次，null=当前可改） |
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
| GET | /api/app/demands/:id | 详情（不可见 → 404，不暴露存在性；发布者可查看本人任意状态需求，其余人仅 `published` 且可见范围命中）；含响应数、`kind` 与类型专属字段（task: deliverable/budget/deliverBy；investment: cooperationNeed/returnOffer；cooperation: bottleneck/partnershipMode/returnOffer）与联系人信息（**同样按 `contactPublic` 下发**）；本人已响应时附 `myResponse: { message, at, status }`（`withdrawnAt` 非空即视为未响应，客户端据此隐藏响应入口并展示响应说明；响应需审核下 `status` 可能为 `pending_review`）；返回只读 `respondNeedReview` |
| POST | /api/app/demands | 提交需求：`demandOpen` 开关校验；`kind` 必填（task/investment/cooperation）；`categoryDict` 指定类目字典（task/cooperation→demand_category，investment→industry）；task 必填 `deliverable`（可选 `budget`）与 `deliverBy`（预期交付日期，希望在该日期前完成），investment 必填 `cooperationNeed`（可选 `returnOffer`），cooperation 必填 `bottleneck`（可选 `partnershipMode`/`returnOffer`）；`contactName`/`contactPhone` 必填、`contactEmail` 选填（校验格式）；`deadline` 不再收集（历史字段保留展示）；`asIdentity` 四类身份均可发布（含合作企业，类型不限），持有社区个体身份时不再单列个人用户选项；发布方身份快照按 wiki §8.7，`publisherName` 按主体取企业名/组织名（个人取昵称）；成员代企业发布时传 `asEnterpriseId`（服务端校验成员 `publish_demand` 权限，无权限 403）；创建即 `pending` → 管理端审核 |
| GET | /api/app/me/demands | 我发布的需求（全状态，含 `kind`） |
| POST | /api/app/demands/:id/respond | 响应需求入参 `{ note(必填≤500), quote?≤64, timeline?≤128, cases?≤300, phone?(11 位，留空沿用身份手机号、填写则覆盖), asIdentity?, asEnterpriseId? }`：`published` 校验、不可响应自己的需求、防重复；需求 `respondNeedReview=true` 时提交落 `pending_review`（发布者暂不可见、提交时不发积分不通知），管理员审核通过后才回 `pending` 并发放 `demand_responded` 积分、通知发布者；`respondNeedReview=false` 时提交即 `pending` 并即时发放积分（与现状一致） |
| GET | /api/app/me/responses | 我的需求响应记录（含 `pending_review` 待审核与 `rejected` 已驳回；含 `quote/timeline/cases/phone` 与驳回理由 `rejectReason`；驳回记录带 `withdrawnAt` 失效时间，可重新响应） |
| POST | /api/app/me/responses/:id/withdraw | 响应者撤回待处理响应（`pending`/`pending_review` 可撤回，撤回落 `closed` + `withdrawnAt`，可重新响应）；已处理 409 |
| GET | /api/app/me/demands/:id/responses | 需求发布者查看响应列表（**不含 `pending_review` 待审核响应，也不含已撤回/已驳回（已置失效）记录**；响应方快照 + `phone/quote/timeline/cases` + `status=pending/accepted` + 审核时间/驳回原因）；非发布者 403 |
| POST | /api/app/me/demands/:id/select | 发布者选择意向承接方（`responseIds[]` 多选，去重且非空，全部须为本人需求下未撤回的待处理响应）；需求转 `selected`（`matchedRespondent` 记录被选人），被选响应转 `accepted` 并通知本人，未选中响应保持待处理（不可驳回）；不生成项目，由管理员在后台完成立项 |

## 7. 活动中心

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/events | 浏览列表：`published` 且未结束；按可见范围过滤（§9）；分页/类型/关键词 |
| GET | /api/app/events/:id | 详情：报名进度（已通过/容量）、我是否已报名 |
| POST | /api/app/events/:id/enroll | 报名：`enrollmentOpen` + 报名截止 + 容量 + 可报名范围（§9）校验；`requireReview` 时进入 pending |
| POST | /api/app/events/:id/enroll/cancel | 取消报名：pending/approved 可取消，approved 释放名额 |
| GET | /api/app/me/enrollments | 我的报名（含活动信息与状态） |

> 签到维持管理端代签（M0 口径）；客户端电子签到（签到码）列为 M2 可选项，需先补契约。

## 8. 项目履约 / 积分商城 / 空间 / 内容

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/app/me/projects | 我承接的项目（需求发起方 / 本人或其社区企业身份所在企业承接；进度与里程碑状态）。需求发起方按项目 `demanderId` 判定：主体为企业 ID 时解析到该企业联系人（后台代企业发需求立项后，联系人同样可见） |
| GET | /api/app/me/projects/:id | 项目详情（需求方与承接方可看）：参与人、来源需求、进度与里程碑交付验收状态 |
| POST | /api/app/me/projects/:id/milestones/:milestoneId/submit | 承接方提交里程碑完成（可附说明）→ 待发起方验收；发起方调用 403 |
| POST | /api/app/me/projects/:id/milestones/:milestoneId/accept | 发起方验收里程碑；全部验收通过自动结项并按 wiki-backend §8.6 发放 `project_completed` 经验 |
| GET | /api/app/mall/goods | 商品列表：`on` 且有库存优先（`restock` 库存为 0 不展示）；`mallOpen` 关闭 → 400；**按需方身份过滤可见范围**（商品自身 + 所属商品类别的可见范围都需通过；游客/未登录按无身份，仅「不限」商品可见） |
| GET | /api/app/mall/goods/:id | 商品详情（可见范围外一律 404，不暴露存在性；口径同列表） |
| POST | /api/app/mall/orders | 兑换下单（统一券码）：**范围门槛**（商品 + 类别的可见/可下单范围都需通过，可见外 404、可下单外 403「当前身份暂不可兑换该商品」）+ **等级折扣实扣**（实扣 = round(商品积分 × 折扣 ÷ 10)，折扣取本人社区个体等级，无等级按原价；订单 `points` 存实扣额，退款按实扣退）+ 积分充足 + 库存充足（事务：扣积分+写流水+扣库存+建订单 `pending_use` 并签发 `voucherCode`/`voucherExpiresAt`） |
| GET | /api/app/me/orders | 我的兑换订单 |
| GET | /api/app/me/orders/:id | 我的兑换订单详情（仅订单本人；非本人/不存在 404，条目形状与列表项一致） |
| GET | /api/app/spaces | 可预约空间列表（`needApproval`/时段/设备/`feePerHour` 费用：积分每小时，0=免费） |
| GET | /api/app/spaces/:id/availability?date= | 某日可约时段：按空间「开放时间-关闭时间」逐小时切片（后台无预约规则配置入口，不设单次时长/提前天数限制；未开放预约、维护中或不存在一律 404）；待审核/已通过预约与命中空间的已发布活动标为 `occupied`，并返回 `type`（`reservation`/`event`）标注占用来源 |
| POST | /api/app/spaces/reservations | 提交预约：canonical payload 为 `spaceId/date/start/end/topic?/attendees?/asIdentity?/asEnterpriseId?`；`reservationOpen` 开关校验 + 开放时段校验（须落在空间「开放时间-关闭时间」内，当天时段不得早于当前时刻）+ 提交前冲突预检（pending/approved 预约与命中空间的已发布活动，活动命中与按天裁剪口径见 wiki-backend §8.8，409）+ **费用扣分**（费用 = 计费小时 × `feePerHour` 再按等级折扣折算：代企业预约取企业等级折扣、其余取本人社区个体等级折扣，实扣 = round(原价 × 折扣 ÷ 10)；计费小时不足 1 小时按 1 小时计；事务内条件扣减，余额不足 400「积分不足」并写 `source=space` 流水）→ 返回 `{ status, pointsSpent }`；管理端审核驳回或预约取消时全额退回（见 wiki-backend §8.8）。四类身份均可预约，企业身份以企业名/组织名生成服务端主体快照；成员代企业预约时服务端校验 `space_reserve` 权限（无权限 403） |
| GET | /api/app/me/reservations | 我的预约（可取消 pending/approved，取消全额退回已扣积分）；返回 `identityType`/`subjectName` 主体快照 |
| GET | /api/app/me/reservations/:id | 我的预约详情（仅本人，非本人/不存在 404）；含 `purpose`/`attendees`/`records` 时间线与 `feePoints`（本单实际消耗积分，0=免费） |
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
| POST | /api/app/me/projects/:id/milestones/:milestoneId/accept | 发起方验收里程碑；全部验收通过自动结项并按 wiki-backend §8.6 发放 `project_completed` 经验 |
| POST | /api/app/me/demands/:id/withdraw · /resubmit · /appeal | 需求撤回（pending→withdrawn）、驳回/撤回后重提（保留编号）、驳回后一次性申诉 |
| POST | /api/app/me/articles/:id/withdraw · /resubmit · /appeal；GET /api/app/me/articles/:id/payload | 投稿撤回 / 重提（回填原始内容）/ 申诉 |
| POST | /api/app/me/applications/:id/withdraw · /resubmit；GET /api/app/me/applications/:id/payload | 申请撤回 / 修改重提（可补充材料；附件需重新上传） |
| POST | /api/app/mall/orders/:id/cancel | 券码退款（仅 `pending_use` 且未过期）：退积分 + 回补库存 → `cancelled`；核销由后台工作人员现场执行（`/api/admin/mall/redemption-orders/:id/verify`），用户侧不提供核销端点；过期未使用券由定时任务自动退款 |
| POST | /api/app/mall/goods/:id/restock-subscribe | 缺货商品到货提醒订阅（补货通知依赖后台补货动作） |
| POST | /api/app/reports | 举报（需求 / 文章 / 企业名片；管理端举报处理与内容处置为后台缺口） |
| GET | /api/app/me/favorites · POST /api/app/me/favorites/toggle | 收藏需求 / 文章 / 活动与切换 |
| POST | /api/app/me/enterprises/invitations/:id/revoke | 撤销待接受的企业成员邀请（邀请 7 天有效期） |
| GET | /api/app/me/transfer-requests · POST /:id/respond · /:id/cancel | 负责人转移请求列表 / 目标成员接受或拒绝 / 发起方撤销（接受后变更负责人） |
| POST | /api/app/analytics/events | 行为埋点旁路上报（登录/注册/发布/响应/报名/签到/下单/投稿/预约/收藏/举报/搜索）；失败不影响业务交互 |
| POST | /api/app/auth/reset-password · /auth/change-phone · /me/change-password | v38 找回密码（短信码+限频）/ 换绑手机号（新号验证码+占用 409）/ 登录态改密（原密码校验，成功后其他会话失效） |
| POST | /api/app/me/deletion-request · /me/data-export | v38 注销申请（运营复核）与个人数据导出（异步打包 + 站内信） |
| GET/POST | /api/app/events/:id/feedback | v38 活动反馈（结束后 + 参与过，一人一条） |
| GET/PUT | /api/app/me/notices/prefs | v38 通知偏好（启用的类型集合，至少一种；同时约束推送） |
| POST | /api/app/me/projects/:id/milestones/:mid/return | v38 发起方退回里程碑（记录原因，承接方可重新提交；提交支持 `attachments[]`） |
| GET | /api/app/me/reports | v38 我的举报（状态 pending/resolved/rejected 由 admin 处置回写） |
| GET/POST | /api/app/me/blocklist(/:uid/remove) | v38 屏蔽名单（评论与内容列表过滤被屏蔽用户） |
| POST/GET | /api/app/articles/:id/likes/toggle · /articles/:id/comments | v38 文章点赞与评论（评论 2-200 字，过滤屏蔽用户） |
| POST | /api/app/auth/register（`agreed` 必填） | v38 注册须同意用户协议与隐私政策并留痕 |

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

## 9. 可见范围与可报名范围过滤（需求/活动通用）

- 用户身份集合 I（individual/community_individual/community_enterprise/external_enterprise）与等级集合 L（各身份 level）。
- 需求：`visibilityIdentities` 含 I 中任一身份类型 **且** `visibilityLevels` 与该身份等级有交集；空数组语义 = 不限（沿用 M0）。
- 活动：浏览按 `visibilityIdentities/Levels`；报名另校验 `enrollmentIdentities/enrollmentLevels`。
- 过滤在服务端实现（列表 SQL 条件 + 详情 404），不依赖前端隐藏。

## 10. 积分引擎触发点（M2 批次，wiki-backend §8.4）

`daily_login`（登录）、`article_accepted`（投稿审核通过）、`demand_published`（需求审核通过后由管理端发布即触发）、`demand_responded`（客户端响应）、`demand_undertaken`（立项）、`project_milestone`（里程碑完成）。M1/M1.5 已接入：`activity_enroll_approved` / `activity_checkin` / `identity_first_bind`（其余触发点随 M2 客户端行为落地；引擎一次建成、按规则启停发放）。

## 11. 里程碑建议

| 阶段 | 内容 |
|---|---|
| M2-A | 骨架 + 注册登录/多身份 JWT + 配置与字典下发 + 个人中心/积分流水 |
| M2-B | 需求广场（浏览/提交/响应）+ 活动中心（浏览/报名）+ 可见范围过滤 |
| M2-C | 商城兑换 + 空间预约 + 文章投递 + 企业名片申请 + 申请审核闭环联动 |

> 客户端接口已按本文档实现并接入真实 HTTP；当前状态与验证见 [README](../README.md)。

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
