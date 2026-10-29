# 数据模型与字段

由 `node scripts/generate-reference.mjs` 从 `apps/api/prisma/schema.prisma` 生成；不手工修改。字段、关系和 Schema 索引如下；数据库 CHECK、触发器和部分索引还需查看 `apps/api/prisma/migrations/`。DTO 校验和权限约束不由本清单替代。

共 84 个模型或枚举。

## MobileThemePackage

```prisma
model MobileThemePackage {
  id        String   @id
  themeId   String
  version   String
  manifest  Json
  assets    Json
  checksum  String   @unique
  createdAt DateTime @default(now())
  createdBy String
}
```

## MobileThemeState

```prisma
model MobileThemeState {
  id         Int     @id @default(1)
  activeId   String?
  previousId String?
  revision   Int     @default(0)
}
```

## MobileThemePreview

```prisma
model MobileThemePreview {
  tokenHash String   @id
  packageId String
  expiresAt DateTime

  @@index([expiresAt])
}
```

## DeploymentLicense

```prisma
model DeploymentLicense {
  id           String    @id @default("default")
  deploymentId String    @unique
  document     Json?
  importedAt   DateTime?
}
```

## CommerceService

```prisma
model CommerceService {
  id            String @id @db.VarChar(16)
  name          String @db.VarChar(128)
  module        String @db.VarChar(16)
  amountFen     Int
  description   String @db.VarChar(2000)
  refundPolicy  String @db.VarChar(2000)
  status        String @default("draft") @db.VarChar(16)
  version       Int @default(1)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

## CommerceBill

```prisma
model CommerceBill {
  id              String @id @db.VarChar(16)
  businessKey     String @unique @db.VarChar(128)
  module          String @db.VarChar(16)
  sourceId        String @db.VarChar(16)
  sourceName      String @db.VarChar(128)
  buyerType       String @db.VarChar(16)
  buyerId         String @db.VarChar(16)
  buyerName       String @db.VarChar(128)
  title           String @db.VarChar(128)
  period          String @db.VarChar(64)
  amountFen       Int
  paidFen         Int @default(0)
  refundedFen     Int @default(0)
  dueDate         String @db.VarChar(10)
  status          String @default("unpaid") @db.VarChar(16)
  snapshot        Json
  createdBy       String @db.VarChar(64)
  createdAt       DateTime @default(now())
  receipts        CommerceReceipt[]
  payments        CommercePayment[]
  order           CommerceOrder?
  @@index([module, status, dueDate])
  @@index([buyerType, buyerId])
}
```

## CommerceReceipt

```prisma
model CommerceReceipt {
  id          String @id @db.VarChar(16)
  billId      String @db.VarChar(16)
  reference   String @unique @db.VarChar(128)
  amountFen   Int
  note        String @db.VarChar(500)
  status      String @default("pending") @db.VarChar(16)
  createdBy   String @db.VarChar(64)
  reviewedBy  String? @db.VarChar(64)
  createdAt   DateTime @default(now())
  reviewedAt  DateTime?
  bill        CommerceBill @relation(fields: [billId], references: [id], onDelete: Restrict)
  @@index([billId])
}
```

## CommercePayment

```prisma
model CommercePayment {
  id             String @id @db.VarChar(32)
  billId         String @db.VarChar(16)
  amountFen      Int
  appid          String @db.VarChar(64)
  mchid          String @db.VarChar(64)
  method         String @db.VarChar(16)
  status         String @default("pending") @db.VarChar(16)
  transactionId  String? @unique @db.VarChar(64)
  prepay         Json?
  expiresAt      DateTime
  paidAt         DateTime?
  checkedAt      DateTime?
  nextCheckAt    DateTime @default(now())
  attempts       Int @default(0)
  lastError      String? @db.VarChar(255)
  createdAt      DateTime @default(now())
  bill           CommerceBill @relation(fields: [billId], references: [id], onDelete: Restrict)
  refunds        CommerceRefund[]
  @@index([status, nextCheckAt])
}
```

## CommerceRefund

```prisma
model CommerceRefund {
  id           String @id @db.VarChar(32)
  paymentId    String @db.VarChar(32)
  amountFen    Int
  reason       String @db.VarChar(80)
  status       String @default("pending") @db.VarChar(16)
  createdBy    String @db.VarChar(64)
  approvedBy   String? @db.VarChar(64)
  lastError    String? @db.VarChar(255)
  nextCheckAt  DateTime @default(now())
  attempts     Int @default(0)
  createdAt    DateTime @default(now())
  completedAt  DateTime?
  payment      CommercePayment @relation(fields: [paymentId], references: [id], onDelete: Restrict)
  @@index([status, nextCheckAt])
}
```

## CommerceQuote

```prisma
model CommerceQuote {
  id           String   @id @db.VarChar(32)
  createdBy    String   @db.VarChar(16)
  sourceType   String   @db.VarChar(24) // mall | space | event | lease_bill
  sourceId     String   @db.VarChar(16)
  sourceName   String   @db.VarChar(128)
  buyerType    String   @db.VarChar(16) // user | enterprise
  buyerId      String   @db.VarChar(16)
  buyerName    String   @db.VarChar(128)
  quantity     Int      @default(1)
  unitPriceFen Int
  amountFen    Int
  payload      Json // 客户端选择的日期/时段/人数/身份等，创建订单时重新校验
  snapshot     Json // 展示摘要、退款约定、有效期说明等
  status       String   @default("open") @db.VarChar(16) // open | consumed | expired
  expiresAt    DateTime
  orderId      String?  @unique @db.VarChar(32)
  createdAt    DateTime @default(now())

  @@index([createdBy, status])
  @@index([status, expiresAt])
}
```

## CommerceOrder

```prisma
model CommerceOrder {
  id                String        @id @db.VarChar(32)
  billId            String?       @unique @db.VarChar(16)
  quoteId           String?       @unique @db.VarChar(32)
  sourceType        String        @db.VarChar(24) // mall | space | event | lease_bill
  sourceId          String        @db.VarChar(16)
  sourceName        String        @db.VarChar(128)
  buyerType         String        @db.VarChar(16) // user | enterprise
  buyerId           String        @db.VarChar(16)
  buyerName         String        @db.VarChar(128)
  createdBy         String        @db.VarChar(16) // 发起支付的 App 用户 uid（归属校验）
  quantity          Int           @default(1)
  unitPriceFen      Int
  amountFen         Int
  paidFen           Int           @default(0)
  refundedFen       Int           @default(0)
  paymentStatus     String        @default("unpaid") @db.VarChar(16) // unpaid | confirming | paid | closed | attention
  approvalStatus    String        @default("not_required") @db.VarChar(16) // not_required | pending | approved | rejected
  fulfillmentStatus String        @default("pending") @db.VarChar(16) // pending | ready | used | cancelled | exception
  afterSalesStatus  String        @default("none") @db.VarChar(16) // none | requested | rejected | processing | refunded | exception
  snapshot          Json
  reservationId     String?       @db.VarChar(16)
  enrollmentId      Int?
  redemptionOrderId String?       @db.VarChar(16)
  expiresAt         DateTime
  paidAt            DateTime?
  closedAt          DateTime?
  fulfilledAt       DateTime?
  lastError         String?       @db.VarChar(255)
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  bill              CommerceBill? @relation(fields: [billId], references: [id], onDelete: Restrict)

  @@index([createdBy, createdAt])
  @@index([paymentStatus, expiresAt])
  @@index([sourceType, sourceId])
}
```

## WechatUserBinding

```prisma
model WechatUserBinding {
  id        String   @id @db.VarChar(16)
  userId    String   @db.VarChar(16)
  appid     String   @db.VarChar(64)
  openid    String   @db.VarChar(64)
  unionid   String?  @db.VarChar(64)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([appid, openid])
  @@unique([userId, appid])
}
```

## AdminUser

```prisma
model AdminUser {
  id                Int             @id @default(autoincrement())
  username          String          @unique @db.VarChar(64)
  passwordHash      String
  name              String          @db.VarChar(64)
  status            String          @default("active") @db.VarChar(16) // active | disabled
  lastLoginAt       String?         @db.VarChar(16)
  /**
   * 密码最近修改时间（密码周期策略用；YYYY-MM-DD HH:mm）
   */
  passwordUpdatedAt String?         @db.VarChar(16)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  roles             AdminUserRole[]
}
```

## AdminRole

```prisma
model AdminRole {
  id          String                @id @db.VarChar(16)
  code        String                @unique @db.VarChar(32)
  name        String                @db.VarChar(64)
  description String                @db.VarChar(255)
  sort        Int                   @default(0)
  /**
   * 数据范围（域维度）：members|biz|space|contents|mall|rules|system；空数组=全部
   */
  dataScope   String[]              @default([])
  createdAt   String                @db.VarChar(16)
  userRoles   AdminUserRole[]
  permissions AdminRolePermission[]
}
```

## AdminPermission

```prisma
model AdminPermission {
  code     String @id @db.VarChar(64)
  name     String @db.VarChar(64)
  module   String @db.VarChar(32)
  authType String @db.VarChar(8) // menu | button
  sort     Int    @default(0)
}
```

## AdminUserRole

```prisma
model AdminUserRole {
  id          Int       @id @default(autoincrement())
  adminUserId Int
  roleId      String    @db.VarChar(16)
  adminUser   AdminUser @relation(fields: [adminUserId], references: [id], onDelete: Cascade)
  role        AdminRole @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([adminUserId, roleId])
  @@index([roleId])
}
```

## AdminRolePermission

```prisma
model AdminRolePermission {
  id             Int       @id @default(autoincrement())
  roleId         String    @db.VarChar(16)
  permissionCode String    @db.VarChar(64)
  role           AdminRole @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([roleId, permissionCode])
  @@index([permissionCode])
}
```

## LoginLog

```prisma
model LoginLog {
  id         String  @id @db.VarChar(16)
  loginAt    String  @db.VarChar(19)
  username   String  @db.VarChar(64)
  ip         String  @db.VarChar(64)
  device     String  @db.VarChar(128)
  status     String  @db.VarChar(16) // success | fail | locked
  failReason String? @db.VarChar(255)

  @@index([loginAt])
  @@index([status])
}
```

## SchedulerLog

```prisma
model SchedulerLog {
  id           String  @id @db.VarChar(16)
  jobName      String  @db.VarChar(64)
  startedAt    String  @db.VarChar(19)
  finishedAt   String  @db.VarChar(19)
  durationMs   Int
  status       String  @db.VarChar(16) // ok | error
  detail       String? @db.VarChar(255)
  rowsAffected Int     @default(0)

  @@index([jobName, startedAt])
}
```

## MallAsset

```prisma
model MallAsset {
  id         String  @id @db.VarChar(32)
  fileName   String  @db.VarChar(255)
  mime       String  @db.VarChar(64)
  size       Int
  url        String  @db.VarChar(512)
  storeKey   String  @db.VarChar(255)
  bizType    String? @db.VarChar(32)
  /**
   * 引用来源：article=资讯发布 / submission=投稿内容（文章保存时按正文 URL 反查绑定）
   */
  sourceType String? @db.VarChar(16)
  /**
   * 来源业务编号（文章 ID，如 A1010 / SU1006）
   */
  sourceId   String? @db.VarChar(16)
  createdBy  String  @db.VarChar(64)
  createdAt  String  @db.VarChar(16)

  @@index([bizType])
  @@index([sourceType])
}
```

## AnalyticsEvent

```prisma
model AnalyticsEvent {
  id        Int @id @default(autoincrement())
  eventType String @db.VarChar(32)
  userId    String? @db.VarChar(16)
  at        DateTime @default(now())
  payload   Json @default("{}")
  @@index([eventType, at])
}
```

## PublishingLimitRule

```prisma
model PublishingLimitRule {
  identityType String @db.VarChar(32)
  level        Int    @default(0)
  action       String @db.VarChar(32)
  dailyLimit   Int    @default(-1)

  @@id([identityType, level, action])
}
```

## PublishingLimitUsage

```prisma
model PublishingLimitUsage {
  subjectType String @db.VarChar(16)
  subjectId   String @db.VarChar(16)
  action      String @db.VarChar(32)
  date        String @db.VarChar(10)
  count       Int    @default(0)

  @@id([subjectType, subjectId, action, date])
}
```

## IdSequence

```prisma
model IdSequence {
  entityType String @id @db.VarChar(32)
  nextNumber Int    @default(1)
}
```

## User

```prisma
model User {
  uid                    String                      @id @db.VarChar(16)
  // 登录标识之一：全站唯一、仅字母/数字/下划线；注册后自动分配，用户可改
  username               String                      @unique @db.VarChar(32)
  // 展示用昵称：全站唯一，允许中文；注册后自动分配，用户可改
  nickname               String                      @unique @db.VarChar(64)
  // 手机号/邮箱可空（邮箱注册无手机号，反之亦然），非空时全站唯一
  phone                  String?                     @unique @db.VarChar(32)
  email                  String?                     @unique @db.VarChar(128)
  // 可信通知渠道：非空=该渠道已验证（注册验证或绑定验证通过）
  phoneVerifiedAt        String?                     @db.VarChar(16)
  emailVerifiedAt        String?                     @db.VarChar(16)
  gender                 String                      @db.VarChar(8)
  status                 String                      @default("active") @db.VarChar(16)
  realName               String?                     @db.VarChar(64)
  citizenId              String?                     @db.VarChar(32)
  verifiedAt             String?                     @db.VarChar(16)
  wechatOpenid           String?                     @db.VarChar(64)
  wechatUnionid          String?                     @db.VarChar(64)
  wechatVerified         Boolean                     @default(false)
  frozenUntil            String?                     @db.VarChar(16)
  frozenReason           String?                     @db.VarChar(255)
  passwordHash           String?                     @db.VarChar(255)
  passwordUpdatedAt      String?                     @db.VarChar(16)
  // 用户名修改时间；每 90 天仅可修改一次（null=从未修改，可随时修改）
  usernameChangedAt      String?                     @db.VarChar(16)
  points                 Int                         @default(0)
  registeredAt           String                      @db.VarChar(16)
  lastActiveAt           String                      @db.VarChar(16)
  bio                    String                      @db.Text
  avatar                 String?                     @db.VarChar(255)
  activities             Json                        @default("[]")
  // 新手任务是否被用户永久隐藏（按账号持久化，跨浏览器/设备一致；仅客户端 UI 偏好）
  activationDismissed    Boolean                     @default(false)
  identities             UserIdentity[]
  pointsRecords          PointsRecord[]
  enrollments            EventEnrollment[]
  reservations           SpaceReservation[]
  orders                 RedemptionOrder[]
  notifications          UserNotification[]
  agreementConsents      AgreementConsent[]
  deletionRequests       AccountDeletionRequest[]
  articleComments        ArticleComment[]
  demandResponses        DemandRespondent[]
  individualCard         IndividualCard?
  notificationPreference UserNotificationPreference?

  @@index([status])
}
```

## UserIdentity

```prisma
model UserIdentity {
  id             Int     @id @default(autoincrement())
  userId         String  @db.VarChar(16)
  type           String  @db.VarChar(32)
  enterpriseId   String? @db.VarChar(16)
  enterpriseName String? @db.VarChar(128)
  role           String? @db.VarChar(16)
  title          String  @db.VarChar(64)
  // M2-R R3：企业成员 8 项权限（publish_demand/respond_demand/space_reserve/article_submit/manage_members/invite_member/assign_permission/edit_card）；负责人隐式全量
  permissions    String[] @default([])
  // M2-R R3：成员联系电话（企业侧维护，可空）
  memberPhone    String? @db.VarChar(32)
  level          Int?
  experience     Int?
  user           User    @relation(fields: [userId], references: [uid], onDelete: Cascade)

  @@unique([userId, type, enterpriseId])
  @@index([type, enterpriseId])
  @@index([type, enterpriseName])
}
```

## Enterprise

```prisma
model Enterprise {
  id              String   @id @db.VarChar(16)
  name            String   @db.VarChar(128)
  industry        String   @db.VarChar(64)
  size            String   @db.VarChar(32)
  foundedAt       String   @db.VarChar(16)
  settledAt       String?  @db.VarChar(16)
  leaseType       String   @db.VarChar(32)
  status          String   @default("pending") @db.VarChar(16)
  experience      Int      @default(0)
  // 关联用户（社区企业必须关联一个个人用户，作为企业联系人）
  contactUserId   String?  @db.VarChar(16)
  // 联系人职位（展示于成员管理）
  contactTitle    String   @default("") @db.VarChar(64)
  contactName     String   @db.VarChar(64)
  contactPhone    String   @db.VarChar(32)
  contactEmail    String?  @db.VarChar(128)
  description     String   @db.Text
  // M2-R R3：企业名片可编辑字段（Q8 决：免审保存 + admin 可查看编辑）
  logo            String?  @db.VarChar(255)
  website         String?  @db.VarChar(255)
  address         String?  @db.VarChar(255)
  services        String[] @default([])
  advantages      String[] @default([])
  tags            String[]
  deletedAt       String?  @db.VarChar(16)
  deletedBy       String?  @db.VarChar(64)

  @@index([status])
  @@index([industry])
  @@index([deletedAt])
}
```

## ExternalEnterpriseProfile

```prisma
model ExternalEnterpriseProfile {
  id                 String  @id @db.VarChar(16)
  name               String  @db.VarChar(128)
  industry           String  @db.VarChar(64)
  status             String  @default("active") @db.VarChar(16) // active | disabled
  size               String  @default("") @db.VarChar(32)
  foundedAt          String  @default("") @db.VarChar(16)
  description        String  @db.Text
  registeredAt       String  @db.VarChar(16)
  deletedAt          String? @db.VarChar(16)
  deletedBy          String? @db.VarChar(64)

  @@index([name])
  @@index([deletedAt])
}
```

## Application

```prisma
model Application {
  id             String  @id @db.VarChar(16)
  type           String  @db.VarChar(16) // settle | identity
  applicantName  String  @db.VarChar(64)
  applicantPhone String  @db.VarChar(32)
  // 申请人 uid：归属「我的申请」；历史数据可空（回退按 applicantPhone 匹配）
  userId         String? @db.VarChar(16)
  targetName     String  @db.VarChar(128)
  submittedAt    String  @db.VarChar(16)
  status         String  @db.VarChar(16) // pending | approved | rejected
  summary        String  @db.VarChar(255)
  details        Json    @default("[]")
  records        Json    @default("[]")
  deletedAt      String? @db.VarChar(16)
  deletedBy      String? @db.VarChar(64)
  archivableAt   String? @db.VarChar(16)

  @@index([status, type])
  @@index([userId])
  @@index([archivableAt])
  @@index([deletedAt])
}
```

## ApplicationFormConfig

```prisma
model ApplicationFormConfig {
  type        String @id @db.VarChar(16)
  title       String @db.VarChar(128)
  subtitle    String @db.VarChar(255)
  submitLabel String @db.VarChar(64)
  tips        Json   @default("[]")
  fields      Json   @default("[]")
  updatedAt   String @db.VarChar(16)
}
```

## EnterpriseAgencyRequest

```prisma
model EnterpriseAgencyRequest {
  id           String  @id @db.VarChar(16)
  // registration | finance_tax | business_change | license
  serviceType  String  @db.VarChar(24)
  userId       String  @db.VarChar(16)
  companyName  String  @db.VarChar(128)
  contactName  String  @db.VarChar(64)
  contactPhone String  @db.VarChar(32)
  // pending | processing | needs_info | completed | rejected | withdrawn
  status       String  @db.VarChar(16)
  summary      String  @db.VarChar(255)
  // 结构化表单载荷；附件字段存 { fileId, name, size, mime }，不存公开 URL
  payload      Json
  records      Json    @default("[]")
  submittedAt  String  @db.VarChar(16)
  updatedAt    String  @db.VarChar(16)
  archivableAt String? @db.VarChar(16)
  deletedAt    String? @db.VarChar(16)
  deletedBy    String? @db.VarChar(64)

  @@index([serviceType, status])
  @@index([userId])
  @@index([companyName])
  @@index([submittedAt])
  @@index([deletedAt])
}
```

## EnterpriseAgencyFile

```prisma
model EnterpriseAgencyFile {
  id         String  @id @db.VarChar(36)
  userId     String  @db.VarChar(16)
  requestId  String? @db.VarChar(16)
  storageKey String  @db.VarChar(160)
  name       String  @db.VarChar(255)
  size       Int
  mime       String  @db.VarChar(64)
  createdAt  String  @db.VarChar(16)
  deletedAt  String? @db.VarChar(16)

  @@index([userId])
  @@index([requestId])
  @@index([deletedAt])
}
```

## Demand

```prisma
model Demand {
  chargeAmountFen Int @default(0) // cash unit price in fen; 0 = unconfigured
  chargeRefundPolicy String @default("") @db.VarChar(2000)
  id                   String             @id @db.VarChar(16)
  title                String             @db.VarChar(128)
  // 需求类别：存 demand_category 字典的**中文 label**（如 '供应链'、'技术开发'），非字典 code
  category             String             @db.VarChar(64)
  // M2-R R2：需求类型 task 找服务 / investment 找投资 / cooperation 找合作
  demandType           String             @default("task") @db.VarChar(16)
  // task 专属：预期交付内容 / 预期交付日期
  deliverable          String?            @db.VarChar(255)
  deliverBy            String?            @db.VarChar(16)
  // investment 专属：合作需求 / 可提供回报
  cooperationNeed      String?            @db.VarChar(255)
  returnOffer          String?            @db.VarChar(255)
  // cooperation 专属：业务瓶颈 / 期望合作方式（partnershipMode 复用 returnOffer 语义置于此）
  bottleneck           String?            @db.VarChar(255)
  partnershipMode      String?            @db.VarChar(128)
  publisherId          String             @default("") @db.VarChar(16)
  publisherName        String             @db.VarChar(128)
  publisherIdentity    Json?
  contactName          String?            @db.VarChar(64)
  contactPhone         String?            @db.VarChar(32)
  contactEmail         String?            @db.VarChar(128)
  // 公开联系人开关：true 时客户端（含未登录游客）可见联系人姓名/电话/邮箱；false 时客户端一律不可见（后台始终可见）
  contactPublic        Boolean            @default(false)
  // 响应需审核：true 时客户端提交的响应先落 pending_review，管理员审核通过后才对发布者可见（默认开启）
  respondNeedReview    Boolean            @default(true)
  budget               String             @db.VarChar(64)
  period               String             @db.VarChar(32)
  deadline             String             @db.VarChar(16)
  scheduledAt          String?            @db.VarChar(16)
  visibilityIdentities String[]
  visibilityLevels     String[]
  enrollmentIdentities String[]
  enrollmentLevels     String[]
  status               String             @db.VarChar(24)
  createdAt            String             @db.VarChar(16)
  publishedAt          String?            @db.VarChar(16)
  description          String             @db.Text
  tags                 String[]
  rejectedReason       String?            @db.VarChar(255)
  matchedRespondent    String?            @db.VarChar(128)
  projectId            String?            @db.VarChar(16)
  respondPoints        Int?
  respondents          DemandRespondent[]
  deletedAt            String?            @db.VarChar(16)
  deletedBy            String?            @db.VarChar(64)
  archivableAt         String?            @db.VarChar(16)

  @@index([status])
  @@index([publisherId])
  @@index([category])
  @@index([demandType])
  @@index([archivableAt])
  @@index([deletedAt])
}
```

## DemandRespondent

```prisma
model DemandRespondent {
  id                Int     @id @default(autoincrement())
  demandId          String  @db.VarChar(16)
  // M2-R R2：响应者 uid（「我的响应」撤回依赖）；企业身份响应存 responderIdentity
  userId            String? @db.VarChar(16)
  responderIdentity Json?
  name              String  @db.VarChar(64)
  enterprise        String  @db.VarChar(128)
  phone             String? @db.VarChar(32)
  email             String? @db.VarChar(128)
  quote             String? @db.VarChar(64)
  // 可投入时间/预计工期（自由文本，如「2 周内可开工」）；相关经验与案例（≤300 字）
  timeline          String? @db.VarChar(128)
  cases             String? @db.VarChar(300)
  message           String  @db.Text
  // 响应审核通过时由管理员勾选：对需求方隐藏的响应字段（message/quote/timeline/cases/phone/email），空 = 全部显示
  hiddenFields      String[] @default([])
  at                String  @db.VarChar(16)
  // pending_review（待管理员审核） | pending | contacted | closed +（R2 撮合扩展）accepted | rejected
  status            String  @default("pending") @db.VarChar(16)
  reviewAt          String? @db.VarChar(16)
  rejectReason      String? @db.VarChar(255)
  withdrawnAt       String? @db.VarChar(16)
  demand            Demand  @relation(fields: [demandId], references: [id], onDelete: Cascade)
  user              User?   @relation(fields: [userId], references: [uid], onDelete: SetNull)

  @@index([demandId])
  @@index([userId])
}
```

## Project

```prisma
model Project {
  chargeAmountFen Int @default(0) // cash unit price in fen; 0 = unconfigured
  chargeRefundPolicy String @default("") @db.VarChar(2000)
  id             String              @id @db.VarChar(16)
  name           String              @db.VarChar(128)
  code           String              @unique @db.VarChar(32)
  status         String              @db.VarChar(16) // running | paused | closed | finished
  progress       Int                 @default(0)
  startDate      String              @default("") @db.VarChar(16)
  endDate        String              @default("") @db.VarChar(16)
  initiatedAt    String              @db.VarChar(16)
  description    String              @db.Text
  memberCount    Int
  sourceDemandId String?             @db.VarChar(16)
  // 需求方（立项时照搬需求发布方快照；社区自建项目由表单录入）：主体 ID（用户 uid / 企业 ID）+ 名称 + 身份快照
  demanderId     String?             @db.VarChar(16)
  demanderName   String?             @db.VarChar(128)
  demanderIdentity Json?
  // 创建人（需求立项取需求创建人/发布方；自建项目取当前操作人）
  creatorName    String?             @db.VarChar(64)
  creatorId      String?             @db.VarChar(16)
  // 联系方式与合同价格（需求立项照搬需求；自建项目由表单录入）
  contactName    String?             @db.VarChar(64)
  contactPhone   String?             @db.VarChar(32)
  contactEmail   String?             @db.VarChar(128)
  contractPrice  String?             @db.VarChar(64)
  expReward      Int?
  closeReason    String?             @db.VarChar(255)
  finishedAt     String?             @db.VarChar(16)
  undertakers    ProjectUndertaker[]
  milestones     Milestone[]
  deletedAt      String?             @db.VarChar(16)
  deletedBy      String?             @db.VarChar(64)
  archivableAt   String?             @db.VarChar(16)

  @@index([status])
  @@index([archivableAt])
  @@index([deletedAt])
}
```

## ProjectUndertaker

```prisma
model ProjectUndertaker {
  id          Int     @id @default(autoincrement())
  projectId   String  @db.VarChar(16)
  type        String  @db.VarChar(16) // enterprise | individual | custom
  refId       String  @default("") @db.VarChar(16)
  name        String  @db.VarChar(128)
  share       Int
  contactName String? @db.VarChar(64)
  phone       String? @db.VarChar(32)
  project     Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
}
```

## Milestone

```prisma
model Milestone {
  id           Int      @id @default(autoincrement())
  projectId    String   @db.VarChar(16)
  name         String   @db.VarChar(128)
  // M2-R R2 交付状态：todo | submitted | accepted | returned（done 归档为 accepted）
  status       String   @default("todo") @db.VarChar(16)
  date         String   @db.VarChar(16)
  owners       String[]
  attachments  String[] @default([]) // 提交时的证据附件（key 列表，复用上传）
  returnReason String?  @db.VarChar(255)
  submitAt     String?  @db.VarChar(16)
  acceptAt     String?  @db.VarChar(16)
  returnedAt   String?  @db.VarChar(16)
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
}
```

## CommunityEvent

```prisma
model CommunityEvent {
  chargeAmountFen Int @default(0) // cash unit price in fen; 0 = unconfigured
  chargeRefundPolicy String @default("") @db.VarChar(2000)
  id                   String            @id @db.VarChar(16)
  createdAt            String            @db.VarChar(16)
  title                String            @db.VarChar(128)
  coverUrl             String?           @db.VarChar(512)
  type                 String            @db.VarChar(32)
  startTime            String            @db.VarChar(16)
  endTime              String            @db.VarChar(16)
  location             String            @db.VarChar(128)
  capacity             Int
  speaker              String            @db.VarChar(64)
  host                 String            @db.VarChar(64)
  status               String            @db.VarChar(24) // pending_release | scheduled | published | ended | cancelled | postponed
  enrollmentOpen       Boolean           @default(false)
  visibilityIdentities String[]
  visibilityLevels     String[]
  enrollmentIdentities String[]
  enrollmentLevels     String[]
  requireReview        Boolean           @default(false)
  // 报名需绑定手机号 / 邮箱（默认关）：未绑定时客户端提示并引导去「账号与安全」绑定，服务端报名时二次校验
  enrollRequirePhone   Boolean           @default(false)
  enrollRequireEmail   Boolean           @default(false)
  enrollmentDeadline   String?           @db.VarChar(16)
  scheduledAt          String?           @db.VarChar(16)
  enrollPoints         Int?
  checkinPoints        Int?
  // M2-R R2：签到几何与时间窗（米/分钟）
  venueLat             String?           @db.VarChar(32)
  venueLng             String?           @db.VarChar(32)
  checkinRadiusM       Int?              @default(200)
  checkinOpenMin       Int?              @default(30)
  checkinCloseMin      Int?              @default(30)
  // 签到校验位置开关：开启时客户端签到才做地理围栏校验（默认关；存量按经纬度是否已配置回填）
  checkinLocationRequired Boolean        @default(false)
  // 签到校验码开关（默认开）与 6 位签到码；仅 required=true 且 code 非空时客户端强制输码
  checkinCodeRequired  Boolean           @default(true)
  checkinCode          String?           @db.VarChar(6)
  // M2-R R2：报名取消时限（小时，默认 24）与改期目标时间
  cancelDeadlineHours  Int?              @default(24)
  rescheduledTo        String?           @db.VarChar(16)
  description          String            @db.Text
  tags                 String[]
  enrollments          EventEnrollment[]
  tickets              EventTicket[]
  deletedAt            String?           @db.VarChar(16)
  deletedBy            String?           @db.VarChar(64)
  archivableAt         String?           @db.VarChar(16)

  @@index([status])
  @@index([startTime])
  @@index([archivableAt])
  @@index([deletedAt])
}
```

## EventEnrollment

```prisma
model EventEnrollment {
  id            Int            @id @default(autoincrement())
  eventId       String         @db.VarChar(16)
  userId        String         @db.VarChar(16)
  name          String         @db.VarChar(64)
  enterprise    String         @db.VarChar(128)
  phone         String         @db.VarChar(32)
  // 报名留言（客户端报名二次确认框选填，后台报名审核可见）
  message       String?        @db.VarChar(200)
  appliedAt     String         @db.VarChar(16)
  status        String         @default("pending") @db.VarChar(16) // pending | pending_payment | approved | rejected | cancelled + waitlisted（R2 候补）
  // 收费活动：待付款报名占用名额，付款成功后转 approved；退款中冻结签到/取票
  commerceOrderId String?      @unique @db.VarChar(32)
  afterSalesFrozen Boolean     @default(false)
  checkedIn     Boolean        @default(false)
  checkInAt     String?        @db.VarChar(16)
  // M2-R R2：候补与递补顺序、签到位置与方式
  waitlisted    Boolean        @default(false)
  waitlistOrder Int?
  checkinLat    String?        @db.VarChar(32)
  checkinLng    String?        @db.VarChar(32)
  checkinMethod String?        @db.VarChar(16) // self | admin
  event         CommunityEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user          User           @relation(fields: [userId], references: [uid], onDelete: Restrict)
  ticket        EventTicket?

  @@unique([eventId, userId])
  @@index([userId])
}
```

## EventTicket

```prisma
model EventTicket {
  id           Int             @id @default(autoincrement())
  eventId      String          @db.VarChar(16)
  enrollmentId Int             @unique
  ticketNo     String          @unique @db.VarChar(32)
  redeemCode   String          @db.VarChar(16)
  redeemedAt   String?         @db.VarChar(16)
  event        CommunityEvent  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  enrollment   EventEnrollment @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)

  @@index([eventId])
}
```

## EventFeedback

```prisma
model EventFeedback {
  id      Int    @id @default(autoincrement())
  eventId String @db.VarChar(16)
  userId  String @db.VarChar(16)
  rating  Int
  comment String @db.VarChar(500)
  at      String @db.VarChar(16)

  @@unique([eventId, userId])
}
```

## ExperienceRecord

```prisma
model ExperienceRecord {
  id         String @id @db.VarChar(16)
  targetType String @db.VarChar(16) // enterprise | individual
  targetId   String @db.VarChar(16)
  delta      Int
  balance    Int
  reason     String @db.VarChar(255)
  at         String @db.VarChar(16)
  operator   String @db.VarChar(64)
  source     String @db.VarChar(16) // rule | manual

  @@index([targetType, targetId])
}
```

## PointsRecord

```prisma
model PointsRecord {
  id        String  @id @db.VarChar(16)
  userId    String  @db.VarChar(16)
  delta     Int
  balance   Int
  reason    String  @db.VarChar(255)
  at        String  @db.VarChar(16)
  operator  String  @db.VarChar(64)
  source    String  @db.VarChar(16) // rule | manual | redemption | space
  dedupeKey String? @unique @db.VarChar(128)
  user      User    @relation(fields: [userId], references: [uid], onDelete: Restrict)

  @@index([userId])
  @@index([source])
}
```

## MallGoods

```prisma
model MallGoods {
  chargeAmountFen Int @default(0) // cash unit price in fen; 0 = unconfigured
  chargeRefundPolicy String @default("") @db.VarChar(2000)
  id                   String   @id @db.VarChar(16)
  name                 String   @db.VarChar(128)
  coverUrl             String?  @db.VarChar(512)
  // M2-R R2（Q1 决）：category 改造为 goods_category 字典分类
  // 取值口径：存 goods_category 字典的**code**（如 GC001、GC003），非中文 label
  category             String   @db.VarChar(16)
  points               Int
  stock                Int
  status               String   @default("off") @db.VarChar(8) // on | off
  description          String   @db.Text
  redeemedCount        Int      @default(0)
  /** 券码有效期（天）：下单时据此计算券码到期时间；空值按 30 天兜底 */
  validDays            Int?
  visibilityIdentities String[] // 自定义可见范围：身份类型
  visibilityLevels     String[] // 自定义可见范围：等级
  orderIdentities      String[] // 自定义可下单范围：身份类型
  orderLevels          String[] // 自定义可下单范围：等级
  createdAt            String   @db.VarChar(16)
  deletedAt            String?  @db.VarChar(16)
  deletedBy            String?  @db.VarChar(64)
  archivableAt         String?  @db.VarChar(16)

  @@index([status])
  @@index([archivableAt])
  @@index([deletedAt])
}
```

## RedemptionOrder

```prisma
model RedemptionOrder {
  id               String  @id @db.VarChar(16)
  userId           String  @db.VarChar(16)
  userName         String  @db.VarChar(64)
  goodsId          String  @db.VarChar(16)
  goodsName        String  @db.VarChar(128)
  points           Int
  // 现金购买实付（分）：0 = 积分兑换；现金券退款走原路退款，不复用积分过期退款任务
  amountFen        Int     @default(0)
  commerceOrderId  String? @unique @db.VarChar(32)
  // 退款申请处理中冻结核销（后台核销须校验）
  afterSalesFrozen Boolean @default(false)
  status           String  @db.VarChar(24) // pending_use | finished | cancelled
  createdAt        String  @db.VarChar(16)
  finishedAt       String? @db.VarChar(16)
  voucherCode      String  @db.VarChar(64)
  voucherExpiresAt String  @db.VarChar(16)
  usedAt           String? @db.VarChar(16)
  cancelledAt      String? @db.VarChar(16)
  rating           Int?
  reviewComment    String? @db.VarChar(500)
  note             String? @db.VarChar(255)
  cancelReason     String? @db.VarChar(255)
  deletedAt        String? @db.VarChar(16)
  deletedBy        String? @db.VarChar(64)
  archivableAt     String? @db.VarChar(16)
  user             User    @relation(fields: [userId], references: [uid], onDelete: Restrict)

  @@index([status])
  @@index([userId])
  @@index([voucherCode])
  @@index([archivableAt])
  @@index([deletedAt])
}
```

## PointsRule

```prisma
model PointsRule {
  code        String  @id @db.VarChar(32)
  name        String  @db.VarChar(64)
  scene       String  @db.VarChar(255)
  points      Int
  status      String  @default("enabled") @db.VarChar(8)
  description String? @db.VarChar(255)
  updatedAt   String  @db.VarChar(16)
}
```

## ExperienceRule

```prisma
model ExperienceRule {
  code        String  @id @db.VarChar(32)
  name        String  @db.VarChar(64)
  scene       String  @db.VarChar(255)
  exp         Int
  status      String  @default("enabled") @db.VarChar(8)
  description String? @db.VarChar(255)
  updatedAt   String  @db.VarChar(16)
}
```

## LevelTier

```prisma
model LevelTier {
  identityType String @db.VarChar(32)
  level        Int
  label        String @db.VarChar(32)
  threshold    Int
  // 积分消费折扣：1 = 1 折 … 10 = 原价（支持一位小数，如 8.5 = 85 折；默认 10）
  pointsDiscount Float  @default(10)

  @@id([identityType, level])
}
```

## WorkstationArea

```prisma
model WorkstationArea {
  id           String        @id @db.VarChar(16)
  name         String        @unique @db.VarChar(64)
  type         String        @db.VarChar(8) // open | office | semi
  description  String        @db.VarChar(255)
  createdAt    String        @db.VarChar(16)
  workstations Workstation[]
}
```

## Workstation

```prisma
model Workstation {
  id                 String             @id @db.VarChar(16)
  seatNo             String             @unique @db.VarChar(32)
  areaId             String             @db.VarChar(16)
  type               String             @db.VarChar(8)
  capacity           Int
  status             String             @default("idle") @db.VarChar(16) // idle | assigned | maintenance
  enterpriseId       String?            @db.VarChar(16)
  enterpriseName     String?            @db.VarChar(128)
  leaseId            String?            @db.VarChar(16)
  defaultMonthlyRent Int?
  areaSqm            Int?
  note               String?            @db.VarChar(255)
  area               WorkstationArea    @relation(fields: [areaId], references: [id])
  leaseWorkstations  LeaseWorkstation[]

  @@index([status])
  @@index([areaId])
}
```

## Lease

```prisma
model Lease {
  id           String             @id @db.VarChar(16)
  renterId     String             @default("") @db.VarChar(16)
  renterName   String             @db.VarChar(128)
  renterType   String             @default("custom") @db.VarChar(16) // enterprise | individual | custom
  startDate    String             @db.VarChar(16)
  endDate      String             @default("") @db.VarChar(16) // longTerm=true 时空串
  longTerm     Boolean            @default(false)
  status       String             @db.VarChar(16) // active | terminated（expiring/expired 读取派生）
  monthlyRent  Int
  rentPeriod   String             @default("month") @db.VarChar(8) // day | week | month | year
  contactName  String             @db.VarChar(64)
  contactPhone String             @db.VarChar(32)
  note         String?            @db.VarChar(255)
  editRecords  Json               @default("[]")
  /**
   * 续期记录（独立于编辑记录）：[{ at, operator, reason, fromEndDate, toEndDate, fromRent, toRent }]，最新在后
   */
  renewRecords Json               @default("[]")
  terminatedAt String?            @db.VarChar(16)
  deletedAt    String?            @db.VarChar(16)
  deletedBy    String?            @db.VarChar(64)
  archivableAt String?            @db.VarChar(16)
  workstations LeaseWorkstation[]

  @@index([status])
  @@index([archivableAt])
  @@index([deletedAt])
}
```

## LeaseWorkstation

```prisma
model LeaseWorkstation {
  leaseId       String      @db.VarChar(16)
  workstationId String      @db.VarChar(16)
  lease         Lease       @relation(fields: [leaseId], references: [id], onDelete: Cascade)
  workstation   Workstation @relation(fields: [workstationId], references: [id], onDelete: Cascade)

  @@id([leaseId, workstationId])
  @@index([workstationId])
}
```

## Space

```prisma
model Space {
  chargeAmountFen Int @default(0) // cash unit price in fen; 0 = unconfigured
  chargeRefundPolicy String @default("") @db.VarChar(2000)
  id              String   @id @db.VarChar(16)
  name            String   @db.VarChar(64)
  type            String   @db.VarChar(16) // meeting | roadshow | meeting_room | multi | study
  capacity        Int
  location        String   @db.VarChar(128)
  openTime        String   @db.VarChar(8)
  closeTime       String   @db.VarChar(8)
  allDay          Boolean  @default(false)
  needReservation Boolean  @default(false)
  needApproval    Boolean  @default(false)
  // 预约费用（积分/小时）；0 = 免费使用
  feePerHour      Int      @default(0)
  equipment       String[]
  status          String   @default("available") @db.VarChar(16) // available | maintenance（R2 维护中）
  maxHours        Int? // R2：单次预约最长时长（小时）
  advanceDays     Int? // R2：最早可提前预约天数
  openHours       Json? // R2：可预约开放时段 [{start,end}]
  description     String   @db.Text
  // 可见范围 / 可预约范围（空数组 = 不限）：口径与 Demand 的 visibility*/enrollment* 一致，
  // 「可预约」在客户端提交预约时校验；等级仅对持有经验值的社区个体/社区企业身份生效
  visibilityIdentities    String[] @default([])
  visibilityLevels        String[] @default([])
  reservationIdentities   String[] @default([])
  reservationLevels       String[] @default([])
  deletedAt       String?  @db.VarChar(16)
  deletedBy       String?  @db.VarChar(64)

  @@index([deletedAt])
}
```

## SpaceReservation

```prisma
model SpaceReservation {
  id             String  @id @db.VarChar(16)
  userId         String  @db.VarChar(16)
  userName       String  @db.VarChar(64)
  phone          String  @db.VarChar(32)
  spaceId        String  @db.VarChar(16)
  spaceName      String  @db.VarChar(64)
  date           String  @db.VarChar(16)
  startTime      String  @db.VarChar(8)
  endTime        String  @db.VarChar(8)
  purpose        String  @db.VarChar(255)
  attendees      Int
  // 该预约实际消耗的积分（提交时按 计费小时 × 空间 feePerHour 扣除；驳回/取消按此退回）
  feePoints      Int     @default(0)
  // 现金预约实付（分）：0 = 免费/积分预约；现金支付成功后预约才生效
  amountFen      Int     @default(0)
  commerceOrderId String? @unique @db.VarChar(32)
  afterSalesFrozen Boolean @default(false)
  status         String  @db.VarChar(16) // pending | pending_payment | approved | rejected | cancelled
  submittedAt    String  @db.VarChar(16)
  records        Json    @default("[]")
  rejectReason   String? @db.VarChar(255)
  // M2-R R2：预约主体快照（个人用户/社区个体/社区企业/合作企业）与代企业主体
  identityType   String? @db.VarChar(24)
  subjectName    String? @db.VarChar(64)
  asEnterpriseId String? @db.VarChar(16)
  deletedAt      String? @db.VarChar(16)
  deletedBy      String? @db.VarChar(64)
  archivableAt   String? @db.VarChar(16)
  user           User    @relation(fields: [userId], references: [uid], onDelete: Restrict)

  @@index([spaceId, date, status])
  @@index([userId])
  @@index([archivableAt])
  @@index([deletedAt])
}
```

## Article

```prisma
model Article {
  id             String           @id @db.VarChar(16)
  title          String           @db.VarChar(128)
  channel        String           @default("official") @db.VarChar(16)
  columnId       String           @db.VarChar(16)
  columnName     String           @db.VarChar(64)
  /**
   * 作者 ID：官方可空；用户投稿为 UID；合作企业为 XE*（非 User 外键，避免官方/合作企业作者无用户记录）
   */
  authorId       String?          @db.VarChar(16)
  authorName     String           @db.VarChar(64)
  authorIdentity Json?
  status         String           @default("pending_release") @db.VarChar(16)
  /**
   * 正文（富文本 HTML，写入时统一 sanitize）
   */
  content        String           @default("") @db.Text
  /**
   * 定时发布时间（scheduled 时存在）
   */
  scheduledAt    String?          @db.VarChar(16)
  publishedAt    String?          @db.VarChar(16)
  views          Int              @default(0)
  // M2-R R2：点赞/评论计数（冗余列，事务更新）
  likeCount      Int              @default(0)
  commentCount   Int              @default(0)
  summary        String           @db.VarChar(255)
  tags           String[]
  createdAt      String           @db.VarChar(16)
  rejectedReason String?          @db.VarChar(255)
  archivableAt   String?          @db.VarChar(16)
  deletedAt      String?          @db.VarChar(16)
  deletedBy      String?          @db.VarChar(64)
  /**
   * 是否开放评论（默认开启）；关闭后客户端隐藏评论区且服务端拒绝读写
   */
  commentsEnabled Boolean         @default(true)
  comments       ArticleComment[]
  takedowns      ArticleTakedown[]

  @@index([status])
  @@index([columnId])
  @@index([channel])
  @@index([archivableAt])
  @@index([deletedAt])
}
```

## ArticleTakedown

```prisma
model ArticleTakedown {
  id          Int      @id @default(autoincrement())
  articleId   String   @db.VarChar(16)
  source      String   @db.VarChar(16) // manual 后台主动下架
  reason      String?  @db.VarChar(255)
  takenDownAt String   @db.VarChar(16)
  takenDownBy String   @db.VarChar(64)
  restoredAt  String?  @db.VarChar(16)
  restoredBy  String?  @db.VarChar(64)
  article     Article  @relation(fields: [articleId], references: [id], onDelete: Cascade)

  @@index([articleId, takenDownAt])
}
```

## ArticleComment

```prisma
model ArticleComment {
  id        Int     @id @default(autoincrement())
  articleId String  @db.VarChar(16)
  userId    String  @db.VarChar(16)
  userName  String  @db.VarChar(64)
  content   String  @db.VarChar(200)
  at        String  @db.VarChar(16)
  /** 发表身份快照（type + 企业/组织信息），历史评论为空按个人用户 */
  identity  Json?
  article   Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  user      User    @relation(fields: [userId], references: [uid], onDelete: Cascade)

  @@index([articleId, at])
  @@index([userId])
}
```

## HomeBanner

```prisma
model HomeBanner {
  id        String  @id @db.VarChar(16) // BN 前缀
  title     String  @db.VarChar(64)
  subtitle  String  @default("") @db.VarChar(128)
  imageUrl  String? @db.VarChar(512)
  link      String? @db.VarChar(512)
  sort      Int     @default(0)
  enabled   Boolean @default(true)
  createdAt String  @db.VarChar(16)
  updatedAt String  @db.VarChar(16)

  @@index([enabled, sort])
}
```

## ArticleColumn

```prisma
model ArticleColumn {
  id             String  @id @db.VarChar(16)
  name           String  @db.VarChar(64)
  description    String  @db.VarChar(255)
  sort           Int
  submissionOpen Boolean @default(true)
  system         Boolean @default(false)
  status         String  @default("enabled") @db.VarChar(8)
  createdAt      String  @db.VarChar(16)
}
```

## Announcement

```prisma
model Announcement {
  id           String  @id @db.VarChar(16)
  title        String  @db.VarChar(128)
  content      String  @db.Text
  pinned       Boolean @default(false)
  status       String  @default("published") @db.VarChar(16) // published | withdrawn
  publishedAt  String  @db.VarChar(16)
  createdAt    String  @db.VarChar(16)
  updatedAt    String? @db.VarChar(16)
  expireAt     String? @db.VarChar(16) // R2：有效期（过期不下发）
  link         String? @db.VarChar(128) // R2：跳转链接
  archivableAt String? @db.VarChar(16)
  deletedAt    String? @db.VarChar(16)
  deletedBy    String? @db.VarChar(64)

  @@index([archivableAt])
  @@index([deletedAt])
}
```

## Favorite

```prisma
model Favorite {
  id         Int    @id @default(autoincrement())
  userId     String @db.VarChar(16)
  targetType String @db.VarChar(16) // demand | article | event | enterprise | talent
  targetId   String @db.VarChar(16)
  // M2-R R3：收藏时的展示快照（列表直接读取，避免跨域 join）
  title      String @default("") @db.VarChar(128)
  subtitle   String? @db.VarChar(128)
  createdAt  String @db.VarChar(16)

  @@unique([userId, targetType, targetId])
  @@index([userId])
}
```

## UserMessage

```prisma
model UserMessage {
  id           String  @id @db.VarChar(16)
  userId       String  @db.VarChar(16)
  title        String  @db.VarChar(128)
  content      String  @db.Text
  // pending 待回复 | replied 已回复
  status       String  @db.VarChar(16)
  createdAt    String  @db.VarChar(16)
  replyContent String? @db.Text
  repliedAt    String? @db.VarChar(16)
  // 回复人（后台工作人员姓名）
  repliedBy    String? @db.VarChar(64)
  // 归档体系（同需求/投稿等域）：replied 时写 archivableAt，归档写 deletedAt/deletedBy
  archivableAt String? @db.VarChar(16)
  deletedAt    String? @db.VarChar(16)
  deletedBy    String? @db.VarChar(64)

  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@index([archivableAt])
  @@index([deletedAt])
}
```

## AdminNotification

```prisma
model AdminNotification {
  id      String  @id @db.VarChar(16)
  type    String  @db.VarChar(32) // approval | demand_review | reservation | article | lease | schedule
  title   String  @db.VarChar(128)
  content String  @db.VarChar(255)
  at      String  @db.VarChar(16)
  read    Boolean @default(false)
  link    String? @db.VarChar(128)
  // BE-M4：收件人（管理员账号 id）；NULL = 全局广播（定时任务/系统事件），非空 = 定向通知
  recipientId String? @db.VarChar(16)

  @@index([read])
  @@index([recipientId])
}
```

## AuditLog

```prisma
model AuditLog {
  id       String  @id @db.VarChar(16)
  operator String  @db.VarChar(64)
  module   String  @db.VarChar(16)
  action   String  @db.VarChar(32)
  target   String  @db.VarChar(255)
  detail   String? @db.VarChar(255)
  at       String  @db.VarChar(16)
  ip       String? @db.VarChar(64)
  before   Json?
  after    Json?

  @@index([at])
  @@index([module])
}
```

## SystemConfig

```prisma
model SystemConfig {
  id                    Int     @id @default(1)
  siteName              String  @db.VarChar(64)
  siteSlogan            String  @db.VarChar(128)
  /** 站点 logo（素材 URL）：后台左上角图标与浏览器标签页图标；空 = 使用内置默认字标。
   * 客户端亦随 /api/app/config 下发该字段，用作客户端标签页图标（页面内品牌位仍跟随定制主题）。 */
  siteLogo              String  @default("") @db.VarChar(512)
  mobileUrl             String  @default("localhost:7759") @db.VarChar(2048)
  registrationOpen      Boolean @default(true)
  /**
   * 手机号/邮箱注册渠道开关（仅 registrationOpen=true 时生效；缺行视为开启，与既有口径一致）：
   * 关闭后不允许使用该渠道注册新账号（已有账号仍可用该渠道验证码登录）；
   * 两个渠道均关闭时保存侧同步关闭 registrationOpen（客户端注册整体暂停）。
   */
  phoneRegisterOpen     Boolean @default(true)
  emailRegisterOpen     Boolean @default(true)
  mallOpen              Boolean @default(true)
  demandOpen            Boolean @default(true)
  reservationOpen       Boolean @default(true)
  /** 客户端在线收款模块开关（与微信商户启用状态同时满足才允许新建支付） */
  cashMallOpen          Boolean @default(false)
  cashSpaceOpen         Boolean @default(false)
  cashEventOpen         Boolean @default(false)
  cashLeaseOpen         Boolean @default(false)
  leaseExpireRemindDays Int     @default(15)
  /**
   * 上传文件大小限制（MB），素材库与富文本图片上传共用
   */
  uploadMaxSizeMb       Int     @default(10)
  /**
   * 密码过期强制改密（仅后台管理员账号，不影响客户端用户）：
   * passwordExpireEnabled=false（默认）= 密码永不过期；true= 超过 passwordExpireDays 未改密的后台账号登录后仅允许修改密码
   */
  passwordExpireEnabled  Boolean @default(false)
  /**
   * 密码有效期（天）：仅在 passwordExpireEnabled=true 时生效；超期登录后仅允许修改密码
   */
  passwordExpireDays    Int     @default(90)
  /**
   * M2-R R3：发布/报名等操作是否强制实名（实名分级权益，默认关闭保证存量兼容）
   */
  realnameRequired      Boolean @default(false)
  /**
   * P1 实名核验（权威二要素）：启用开关 + 供应商单选（aliyun|tencent|空=未选）
   * + 非机密参数 + 凭据环境变量名（仅存变量名）+ 连通性测试结果（变更即重置，需重测）
   */
  realnameVerifyEnabled       Boolean @default(false)
  realnameVerifyProvider      String  @default("") @db.VarChar(16)
  realnameVerifyConfig        Json?
  realnameVerifyCredentialEnv Json?
  /** 凭据来源：inline=后台直接填写密钥（只写、脱敏、不入审计）| env=登记环境变量名 */
  realnameVerifyCredentialMode String @default("inline") @db.VarChar(8)
  realnameVerifyTestOk        Boolean @default(false)
  realnameVerifyTestedAt      String? @db.VarChar(16)
  /**
   * 首页轮播图总开关：关闭后客户端首页不展示轮播区域
   */
  homeCarouselOpen      Boolean @default(true)
  /**
   * MinIO 对象存储配置（R4）：未启用时使用本地磁盘驱动
   */
  /* 微信小程序一键登录：开关 + AppID（可回显）+ AppSecret（只写，接口只回传是否已配置） */
  wxLoginOpen           Boolean @default(false)
  wxMiniAppId           String  @default("") @db.VarChar(64)
  wxMiniAppSecret       String  @default("") @db.VarChar(128)
  /* 微信网站应用（扫码）一键登录：AppID（可回显）+ AppSecret（只写）+ OAuth 回跳地址（须与开放平台「授权回调域」一致） */
  wxWebAppId            String  @default("") @db.VarChar(64)
  wxWebAppSecret        String  @default("") @db.VarChar(128)
  wxWebRedirectUri      String  @default("") @db.VarChar(255)

  minioEnabled          Boolean @default(false)
  minioEndpoint         String  @default("") @db.VarChar(255)
  minioPort             Int     @default(9000)
  minioUseSsl           Boolean @default(false)
  minioAccessKey        String  @default("") @db.VarChar(128)
  minioSecretKey        String  @default("") @db.VarChar(128)
  minioBucket           String  @default("joinyuu") @db.VarChar(64)
  /**
   * 日志保留期（天）：操作日志 / 登录日志超过该天数由定时任务 log-retention-purge 清理；
   * 0 = 永久保存。默认 180 天，对应「日志与审计」页右上角「日志设置」。
   */
  auditLogRetentionDays Int     @default(180)
  loginLogRetentionDays Int     @default(180)
  updatedAt             String  @db.VarChar(16)
  updatedBy             String  @db.VarChar(64)
}
```

## DictEntry

```prisma
model DictEntry {
  type   String @db.VarChar(32) // demand_category | industry | event_type | goods_category
  code   String @db.VarChar(16)
  label  String @db.VarChar(64)
  sort   Int
  status String @default("enabled") @db.VarChar(8)
  // 商品类别专属（type=goods_category）：类别级可见/可下单范围门槛（空数组 = 不限）；
  // 商品需「类别范围 + 商品自身范围」同时通过才可见/可下单，其余字典类型该四项恒为空数组
  visibilityIdentities String[]
  visibilityLevels     String[]
  orderIdentities      String[]
  orderLevels          String[]

  @@id([type, code])
  @@unique([label])
  @@index([type, sort])
}
```

## ArchiveSetting

```prisma
model ArchiveSetting {
  domain           String  @id @db.VarChar(24)
  autoArchive      Boolean @default(false)
  archiveDelayDays Int     @default(7)
  autoPurge        Boolean @default(false)
  purgeDelayDays   Int     @default(30)
  archiveStatuses  Json?
}
```

## LeasePrintLayout

```prisma
model LeasePrintLayout {
  id          String   @id @default("default") @db.VarChar(16)
  title       String   @default("聚屿社区 · 办公位租约确认单") @db.VarChar(64)
  fields      Json?
  clausesText String?
  updatedAt   DateTime @updatedAt
  updatedBy   String   @default("") @db.VarChar(32)
}
```

## UserNotification

```prisma
model UserNotification {
  id       String  @id @db.VarChar(16) // UN 前缀
  userId   String  @db.VarChar(16)
  type     String  @db.VarChar(32) // audit_result | enroll_result | order | points | system | invite | transfer | report | article | demand | project | mall | service
  title    String  @db.VarChar(128)
  content  String  @db.VarChar(255)
  link     String? @db.VarChar(128)
  at       String  @db.VarChar(16)
  read     Boolean @default(false)
  user     User    @relation(fields: [userId], references: [uid], onDelete: Cascade)

  @@index([userId, read])
  @@index([userId, type])
}
```

## AgreementConsent

```prisma
model AgreementConsent {
  id            Int    @id @default(autoincrement())
  userId        String @db.VarChar(16)
  agreementType String @db.VarChar(32) // user_agreement | privacy_policy
  version       String @db.VarChar(32)
  consentedAt   String @db.VarChar(16)
  user          User   @relation(fields: [userId], references: [uid], onDelete: Cascade)

  @@unique([userId, agreementType, version])
  @@index([userId])
}
```

## AccountDeletionRequest

```prisma
model AccountDeletionRequest {
  id           String  @id @db.VarChar(16) // DR 前缀
  userId       String  @db.VarChar(16)
  status       String  @default("cooling") @db.VarChar(16) // cooling 冷静期 | approved 已注销 | rejected 已驳回 | cancelled 已撤回
  requestedAt  String  @db.VarChar(16)
  effectiveAt  String? @db.VarChar(16)
  reason       String? @db.VarChar(255)
  cancelReason String? @db.VarChar(255)
  cancelledAt  String? @db.VarChar(16)
  approvedAt   String? @db.VarChar(16)
  reviewedAt   String? @db.VarChar(16)
  reviewedBy   String? @db.VarChar(64)
  reviewNote   String? @db.VarChar(255)
  user         User    @relation(fields: [userId], references: [uid], onDelete: Cascade)

  @@index([userId])
}
```

## UserNotificationPreference

```prisma
model UserNotificationPreference {
  userId          String   @id @db.VarChar(16)
  mutedTypes      String[] @default([])
  /// P0 安静时段（HH:mm；两者都填才生效；security 类通知不受影响）
  quietHoursStart String?  @db.VarChar(5)
  quietHoursEnd   String?  @db.VarChar(5)
  /// P0 按渠道的营销接收偏好（{ sms?: boolean; email?: boolean; inapp?: boolean }），安全类不受影响
  channelPrefs    Json?
  updatedAt       String   @db.VarChar(16)
  user            User     @relation(fields: [userId], references: [uid], onDelete: Cascade)
}
```

## EnterpriseInvitation

```prisma
model EnterpriseInvitation {
  id            String  @id @db.VarChar(16) // EI 前缀
  enterpriseId  String  @db.VarChar(16)
  inviterId     String  @db.VarChar(16)
  inviteeUid    String  @db.VarChar(16) // 手机号命中用户（未注册手机号在邀请时即拒绝）
  memberName    String  @db.VarChar(64)
  phone         String  @db.VarChar(32)
  role          String  @db.VarChar(64)
  status        String  @default("pending") @db.VarChar(16) // pending | accepted | rejected | revoked | expired
  createdAt     String  @db.VarChar(16)
  expiresAt     String  @db.VarChar(16)
  respondedAt   String? @db.VarChar(16)

  @@index([enterpriseId])
  @@index([inviteeUid, status, expiresAt])
  @@index([phone])
}
```

## MessageChannel

```prisma
model MessageChannel {
  id            String  @id @db.VarChar(16) // MC 前缀
  kind          String  @db.VarChar(16) // sms | email | inapp
  provider      String  @db.VarChar(32) // aliyun_sms | tencent_sms | smtp | inapp | dry_run
  name          String  @db.VarChar(64)
  enabled       Boolean @default(false)
  /// 非机密配置：签名 / 发件人 / Region / Endpoint / 模板映射 / 默认模板等
  config        Json?
  /// 凭据环境变量名映射（仅存变量名，如 { accessKeyId: "ALIYUN_SMS_ACCESS_KEY_ID" }）
  credentialEnv Json?
  /// 凭据来源：env=登记环境变量名（默认，兼容既有数据）| inline=后台直接填写密钥（只写、脱敏、不入审计）
  credentialMode String @default("env") @db.VarChar(8)
  /// 每日发送上限，0 = 不限
  dailyLimit    Int     @default(0)
  remark        String? @db.VarChar(255)
  createdAt     String  @db.VarChar(16)
  updatedAt     String  @db.VarChar(16)
  updatedBy     String  @db.VarChar(64)

  @@unique([kind, provider])
  @@index([kind, enabled])
}
```

## MessageTemplate

```prisma
model MessageTemplate {
  id             String   @id @db.VarChar(16) // MT 前缀
  code           String   @db.VarChar(64) // verify_code / account_security / event_changed ...
  name           String   @db.VarChar(64)
  kind           String   @db.VarChar(16) // sms | email | inapp
  /// security 安全类（强制送达）| marketing 营销类（可退订、受安静时段与偏好约束）
  category       String   @default("security") @db.VarChar(16)
  /// 允许的模板变量白名单（如 ["code","minutes"]），渲染时校验
  variables      Json?
  status         String   @default("draft") @db.VarChar(16) // draft | published
  currentVersion Int      @default(0)
  updatedAt      String   @db.VarChar(16)
  updatedBy      String   @db.VarChar(64)
  versions       MessageTemplateVersion[]

  @@unique([code])
  @@index([kind, status])
}
```

## MessageTemplateVersion

```prisma
model MessageTemplateVersion {
  id         String          @id @db.VarChar(16) // MV 前缀
  templateId String          @db.VarChar(16)
  version    Int
  subject    String?         @db.VarChar(128) // 邮件主题；短信/站内信为空
  body       String          @db.Text
  /// draft | pending | approved | rejected | published | archived
  status     String          @default("draft") @db.VarChar(16)
  reviewedBy String?         @db.VarChar(64)
  reviewedAt String?         @db.VarChar(16)
  reviewNote String?         @db.VarChar(255)
  createdBy  String          @db.VarChar(64)
  createdAt  String          @db.VarChar(16)
  template   MessageTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  @@unique([templateId, version])
  @@index([templateId, status])
}
```

## OutboxMessage

```prisma
model OutboxMessage {
  id                String  @id @db.VarChar(16) // OB 前缀
  idempotencyKey    String  @db.VarChar(128)
  channelKind       String  @db.VarChar(16) // sms | email | inapp
  templateCode      String  @db.VarChar(64)
  recipient         String  @db.VarChar(128) // 手机号 / 邮箱 / uid
  userId            String? @db.VarChar(16)
  /// 模板变量（渲染用）
  payload           Json?
  /// pending | sending | sent | failed（待重试）| dead（死信）| skipped（偏好/安静时段跳过）
  status            String  @default("pending") @db.VarChar(16)
  priority          Int     @default(0)
  attempts          Int     @default(0)
  maxAttempts       Int     @default(3)
  nextAttemptAt     String? @db.VarChar(16)
  lastError         String? @db.VarChar(512)
  providerMessageId String? @db.VarChar(128)
  /// 安全类消息：不受用户营销偏好与安静时段约束
  security          Boolean @default(false)
  createdAt         String  @db.VarChar(16)
  updatedAt         String  @db.VarChar(16)
  sentAt            String? @db.VarChar(16)
  deliveryLogs      MessageDeliveryLog[]

  @@unique([idempotencyKey])
  @@index([status, nextAttemptAt])
  @@index([channelKind, status])
  @@index([userId, createdAt])
}
```

## MessageDeliveryLog

```prisma
model MessageDeliveryLog {
  id                String @id @db.VarChar(16) // ML 前缀
  outboxId          String @db.VarChar(16)
  channelKind       String @db.VarChar(16)
  provider          String @db.VarChar(32)
  recipient         String @db.VarChar(128)
  attempt           Int
  status            String @db.VarChar(16) // sent | failed | skipped
  providerMessageId String? @db.VarChar(128)
  error             String? @db.VarChar(512)
  costMs            Int    @default(0)
  at                String @db.VarChar(16)
  outbox            OutboxMessage @relation(fields: [outboxId], references: [id], onDelete: Cascade)

  @@index([outboxId])
  @@index([channelKind, at])
}
```

## ContactConsent

```prisma
model ContactConsent {
  id          Int     @id @default(autoincrement())
  userId      String  @db.VarChar(16)
  channelKind String  @db.VarChar(16) // sms | email
  purpose     String  @db.VarChar(16) // security | marketing
  consented   Boolean @default(true)
  at          String  @db.VarChar(16)

  @@unique([userId, channelKind, purpose])
  @@index([userId])
}
```

## TransferRequest

```prisma
model TransferRequest {
  id           String  @id @db.VarChar(16) // TR 前缀
  enterpriseId String  @db.VarChar(16)
  fromUserId   String  @db.VarChar(16)
  toUserId     String  @db.VarChar(16)
  status       String  @default("pending") @db.VarChar(16) // pending | accepted | rejected | revoked | expired
  createdAt    String  @db.VarChar(16)
  expiresAt    String  @db.VarChar(16)
  respondedAt  String? @db.VarChar(16)

  @@index([toUserId, status])
  @@index([enterpriseId])
}
```

## Policy

```prisma
model Policy {
  id          String  @id @db.VarChar(16) // PL 前缀
  kind        String  @db.VarChar(24)
  category    String  @default("-") @db.VarChar(32)
  title       String  @db.VarChar(128)
  summary     String  @default("") @db.VarChar(255)
  content     String  @db.Text
  version     String  @default("1.0") @db.VarChar(32)
  effectiveAt String? @db.VarChar(16)
  publisher   String  @default("聚屿社区") @db.VarChar(64)
  attachments Json    @default("[]")
  featured    Boolean @default(false)
  status      String  @default("published") @db.VarChar(16) // published | archived
  publishedAt String  @db.VarChar(16)
  updatedAt   String  @db.VarChar(16)

  @@index([kind, status])
  @@index([category, status, effectiveAt])
}
```

## IndividualCard

```prisma
model IndividualCard {
  userId             String  @id @db.VarChar(16)
  displayName        String? @db.VarChar(64)
  intro              String  @default("") @db.VarChar(500)
  industryExperience String? @db.VarChar(255)
  skills             String[] @default([])
  age                Int?
  politicalStatus    String? @db.VarChar(16)
  education          Json    @default("[]")
  work               Json    @default("[]")
  projects           Json    @default("[]")
  honors             Json    @default("[]")
  socials            Json    @default("[]")
  customLinks        Json    @default("[]")
  // 隐私开关：{ age, politicalStatus }
  visibility         Json    @default("{\"age\":true,\"politicalStatus\":true}")
  updatedAt          String  @db.VarChar(16)
  user               User    @relation(fields: [userId], references: [uid], onDelete: Cascade)
}
```

## CardFieldConfig

```prisma
model CardFieldConfig {
  type           String   @id @db.VarChar(16) // individual | enterprise
  editableFields String[] @default([])
  updatedAt      String   @db.VarChar(16)
  updatedBy      String   @db.VarChar(64)
}
```

## PaymentMerchantConfig

```prisma
model PaymentMerchantConfig {
  id String @id @db.VarChar(16)
  ciphertext String @db.Text
  version Int @default(1)
  updatedBy String @db.VarChar(64)
  updatedAt DateTime @updatedAt
}
```
