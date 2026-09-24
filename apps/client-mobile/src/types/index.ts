/* 客户端实体与 API 类型（独立声明，不依赖 admin）。
 * 字段口径对齐 docs/api-app-design.md 与 docs/entity-fields.md。 */

/* ---------- 通用 ---------- */

export interface PageResult<T> {
  list: T[]
  total: number
}

export interface PageQuery {
  page?: number
  pageSize?: number
  keyword?: string
}

/* ---------- 站点配置（GET /api/app/config） ---------- */

export interface AppConfig {
  siteName: string
  siteSlogan: string
  registrationOpen: boolean
  mallOpen: boolean
  demandOpen: boolean
  reservationOpen: boolean
  /** 首页轮播图总开关：关闭后首页不展示轮播区域 */
  homeCarouselOpen: boolean
  /** P1 实名核验：verified=「实名认证」（后台已启用并测试联通）；registration=「身份信息登记」 */
  realnameMode?: 'verified' | 'registration'
}

/* ---------- 字典项（GET /api/app/dicts/:type） ---------- */

export interface DictItem {
  code: string
  label: string
}

/* ---------- 身份与用户 ---------- */

export type IdentityType = 'individual' | 'community_individual' | 'community_enterprise' | 'external_enterprise' | 'official'

export interface UserIdentity {
  type: IdentityType
  /** 社区身份持有的经验等级（individual/external 无等级） */
  level?: number
  levelName?: string
  experience?: number
  /** community_enterprise 关联企业 */
  enterpriseId?: string
  enterpriseName?: string
  /** 用户在关联企业内的职务（身份切换选项展示用） */
  enterpriseRole?: string
  /** external_enterprise 自由填写主体 */
  organizationName?: string
}

export interface UserProfile {
  uid: string
  /** 登录标识（用户可修改，全站唯一） */
  username: string
  /** 昵称（社区展示名） */
  nickname: string
  /** 已绑定手机号（未绑定为空；服务端下发未脱敏值，展示层自行脱敏） */
  phone?: string
  /** 已绑定邮箱（未绑定为空） */
  email?: string
  /** 手机号是否为已验证可信渠道（可用于找回密码/接收通知） */
  phoneVerified?: boolean
  /** 邮箱是否为已验证可信渠道 */
  emailVerified?: boolean
  realName?: string
  /** 是否已完成实名认证 */
  realNameVerified?: boolean
  /** 头像图片地址（上传返回的 url；缺省时展示昵称首字） */
  avatar?: string
  gender: 'male' | 'female' | 'unknown'
  bio?: string
  points: number
  /** 积分消费折扣：1 = 1 折 … 10 = 原价（等级规则配置；商城与空间预约按此展示折后价） */
  pointsDiscount: number
  status: 'active' | 'frozen'
  registeredAt: string
  /** 是否已永久隐藏新手任务（服务端按账号持久化，跨浏览器一致） */
  activationDismissed?: boolean
  /** 用户名下次可修改时间（YYYY-MM-DD HH:mm）；null=当前可修改（90 天限改一次） */
  usernameChangeableAt?: string | null
  identities: UserIdentity[]
}

/* ---------- 实名认证（GET/PUT /api/app/me/realname） ---------- */

export interface RealNameInfo {
  verified: boolean
  /** 当前展示模式（后端下发）：verified=实名认证 / registration=身份信息登记 */
  mode?: 'verified' | 'registration'
  /** 脱敏展示：首字保留（如 苏*） */
  realName?: string
  /** 脱敏证件号：前 4 + 后 4（如 3301**********1234） */
  citizenIdMasked?: string
  /** 认证通过时间 */
  verifiedAt?: string
}

export interface RealNamePayload {
  realName: string
  citizenId: string
}

/** 实名分级权益分组（GET /api/app/me/realname-rights） */
export interface RealnameRightsGroup {
  identityType: string
  level: number
  /** 如「已实名个人」「社区企业 · 等级 3」 */
  title: string
  /** 等级头衔（LevelTier.label，如「共创者」；无配置为空串） */
  label?: string
  /** 达到该等级所需经验门槛（无配置为 null） */
  threshold?: number | null
  /** 是否为当前用户所处层级 */
  active: boolean
  items: string[]
  limits: Record<string, number>
}

/* ---------- 积分流水（GET /api/app/me/points-records） ---------- */

export interface PointsRecord {
  id: string
  delta: number
  balance: number
  reason: string
  source: string
  at: string
}

/* ---------- 我的租约（GET /api/app/me/leases） ---------- */

export type LeaseStatus = 'active' | 'terminated' | 'expired' | 'expiring'

export interface MyLease {
  id: string
  renterType: 'individual' | 'enterprise'
  renterName: string
  workstationLabels: string[]
  startDate: string
  endDate: string
  longTerm: boolean
  status: LeaseStatus
  monthlyRent: number
  rentPeriod: 'day' | 'week' | 'month' | 'year'
  contactName: string
  contactPhone: string
}

/* ---------- 站内信 ---------- */

export type NoticeType =
  | 'audit_result'
  | 'enroll_result'
  | 'order'
  | 'points'
  | 'system'
  | 'invite'
  | 'transfer'
  | 'article'
  | 'demand'
  | 'project'
  | 'mall'
  | 'service'

export interface UserNotice {
  id: string
  type: NoticeType
  title: string
  content: string
  at: string
  read: boolean
  /** 点击跳转的业务路由（可选） */
  link?: string
}

/** 我的留言（客户端提交，后台回复）：status pending 待回复 | replied 已回复 */
export interface MyMessage {
  id: string
  title: string
  content: string
  status: 'pending' | 'replied'
  createdAt: string
  /** 后台回复内容与回复时间（已回复时下发） */
  replyContent?: string
  repliedAt?: string
  /** 回复人（社区工作人员姓名） */
  repliedBy?: string
}

/** 通知偏好：类型目录 + 已静音集合（mutable=false 的类型不可关闭） */
export interface NoticePreferenceType {
  type: string
  label: string
  mutable: boolean
  muted: boolean
}

export interface NoticePreferences {
  types: NoticePreferenceType[]
  mutedTypes: string[]
}

/* ---------- 首页聚合（GET /api/app/home） ---------- */

export interface HomeFeed {
  siteName: string
  siteSlogan: string
  noticesUnread: number
  /** 后台「轮播图管理」总开关；false 时首页不展示轮播区域 */
  carouselEnabled: boolean
  banners: HomeBanner[]
  hotEvents: HomeEventCard[]
  latestDemands: HomeDemandCard[]
  topArticles: HomeArticleCard[]
  /** 运营公告（由首页聚合接口下发） */
  announcements?: HomeAnnouncement[]
}

/* ===== v42 新功能类型 ===== */
export interface MyStats { pointsEarned: number; pointsSpent: number; demands: number; responses: number; enrollments: number; articles: number; projects: number; orders: number; checkedIn?: number; experience?: number }
export interface EventTicket { eventId: string; eventTitle: string; startTime: string; location: string; ticketCode: string; status: 'valid' | 'checked' | 'cancelled' | 'expired'; checkedIn: boolean; waitlistOrder?: number }
export interface RealNameBenefit { tier: string; title: string; items: string[]; active: boolean }

/** 首页公告 */
export interface HomeAnnouncement {
  id: string
  title: string
  content: string
  at: string
  pinned?: boolean
  /** 站内跳转路径（后台公告配置的「跳转链接」，未配置则不下发） */
  link?: string
}

export interface HomeBanner {
  id: string
  title: string
  subtitle: string
  /** 轮播图片（可空；为空时使用品牌渐变文字卡） */
  imageUrl?: string
  /** 点击跳转的站内路径，如 /events */
  link?: string
}

/* ---------- 社区（社区服务 / 人才库 / 企业库） ---------- */

export interface CommunityPolicy {
  id: string
  category: string
  title: string
  summary: string
  content: string
  updatedAt: string
  /** v39：版本与生效信息（真实后端由内容管理发布） */
  version?: string
  effectiveAt?: string
  publisher?: string
  attachments?: { name: string; url: string }[]
}

export interface TalentMember {
  uid: string
  name: string
  role: string
  /** 同步个人资料头像 */
  avatar?: string
  intro: string
  skills: string[]
}

/* ---------- 个人名片（简历式）分段字段 ---------- */

/** 教育经历条目 */
export interface IndividualEducation {
  school: string
  major?: string
  degree?: string
  period?: string
}

export interface IndividualWork {
  company: string
  title?: string
  period?: string
  description?: string
}

export interface IndividualProject {
  name: string
  role?: string
  period?: string
  description?: string
}

export interface IndividualHonor {
  name: string
  date?: string
}

export interface IndividualLink {
  label: string
  url: string
}

/** 企业成员权限（负责人可分配；控制成员「代替企业」的能力） */
export type EnterpriseMemberPermission =
  | 'publish_demand'
  | 'respond_demand'
  | 'space_reserve'
  | 'article_submit'
  | 'manage_members'
  | 'invite_member'
  | 'assign_permission'
  | 'edit_card'

export interface EnterpriseMember {
  /** 已注册成员的 uid（未注册/待确认成员为空） */
  uid?: string
  name: string
  role?: string
  phone?: string
  /** 成员权限（负责人默认拥有全部权限，无需存储） */
  permissions?: EnterpriseMemberPermission[]
}

export interface EnterpriseRecord {
  id: string
  name: string
  /** 企业 Logo（上传返回的 url） */
  logo?: string
  industry: string
  size: string
  /** 成立时间（如 2020-06） */
  foundedAt?: string
  /** 企业官网 */
  website?: string
  /** 办公地点 */
  address?: string
  /** 主营业务 / 服务 */
  services?: string
  /** 核心优势 */
  advantages?: string
  description: string
  /** 企业等级（社区企业等级梯度，按经验值推导；企业库列表下发） */
  level?: number
  levelName?: string
  members: EnterpriseMember[]
  /** 企业联系人（负责人，对应后台 Enterprise.contactUserId） */
  contactUid?: string
  contactName?: string
}

export interface HomeEventCard {
  id: string
  title: string
  type: string
  startTime: string
  location: string
  capacity: number
}

export interface HomeDemandCard {
  id: string
  title: string
  categoryLabel: string
  publisherName: string
  publisherIdentity: IdentityType
  /** task：预期交付日期（历史数据可能只有 deadline） */
  deliverBy?: string
  deadline?: string
  responseCount: number
}

export interface HomeArticleCard {
  id: string
  title: string
  columnLabel: string
  publishedAt: string
  views: number
}

/* ---------- 鉴权 ---------- */

/** 登录标识：手机号 / 邮箱 / 用户名 */
export interface LoginPayload {
  identifier: string
  password: string
  captchaCode: string
  captchaId: string
}

export interface RegisterPayload {
  /** 注册渠道：email（默认）| phone */
  channel: 'email' | 'phone'
  email?: string
  phone?: string
  /** 6 位验证码（邮箱注册为邮箱验证码，手机号注册为短信验证码） */
  code: string
  password: string
  /** 仅客户端本地校验一致性，不随请求下发 */
  confirmPassword?: string
  /** v38：注册须勾选同意用户协议与隐私政策 */
  agreed?: boolean
  gender?: string
}

/** 短信验证码用途 */
export type SmsPurpose = 'register' | 'reset_password' | 'change_phone' | 'login'

/** 邮箱验证码用途 */
export type EmailPurpose = 'register' | 'reset_password' | 'change_email'

/** 发送验证码响应：devCode 仅开发/未接入通道时下发 */
export interface SendCodeResult {
  expiresInSec: number
  devCode?: string
}

/** 找回密码前置：账号已验证可信渠道（脱敏值，null 表示不可用） */
export interface RecoveryChannels {
  email: string | null
  phone: string | null
}

/** 登录/注册响应：包含多身份摘要的 App JWT。 */
export interface AuthResult {
  token: string
  uid: string
  /** 登录标识（用户可修改，全站唯一） */
  username: string
  /** 展示昵称（沿用 name 字段） */
  name: string
  avatar?: string
  identities: UserIdentity[]
  points: number
  /** 积分消费折扣：1 = 1 折 … 10 = 原价 */
  pointsDiscount: number
}

/* ---------- 经验值流水（GET /api/app/me/experience-records） ---------- */

export interface ExperienceRecord {
  id: string
  delta: number
  balance: number
  reason: string
  at: string
}

/** 经验/等级聚合（按当前身份取数：社区个体→个人经验；社区企业→企业经验） */
export interface ExperienceProfile {
  identityLabel: string
  level: number | null
  levelName: string
  currentExperience: number
  currentLevelThreshold: number
  nextLevelThreshold: number | null
  records: ExperienceRecord[]
}

/* ---------- 需求广场 ---------- */

export type DemandStatus =
  | 'pending'
  | 'pending_release'
  | 'scheduled'
  | 'published'
  | 'selected'
  | 'projected'
  | 'rejected'
  | 'withdrawn'
  | 'closed'

/** 需求类型
 * task = 找服务（寻找项目执行与交付服务）；investment = 找投资（有规划找投资人与伙伴）；
 * cooperation = 找合作（业务瓶颈找互补伙伴） */
export type DemandKind = 'task' | 'investment' | 'cooperation'

export interface Demand {
  id: string
  title: string
  description: string
  categoryLabel: string
  status: DemandStatus
  /** 需求类型（历史数据可能为空） */
  kind?: DemandKind
  publisherUid?: string
  publisherName: string
  publisherIdentity: IdentityType
  /** 社区自建需求（official）的身份快照文案：创建该需求的工作人员角色名 */
  publisherIdentityLabel?: string
  /** 截止日期（表单已不再收集，保留历史数据展示；新需求以 deliverBy 为准） */
  deadline?: string
  /** task：预期交付日期（希望在这一天之前完成） */
  deliverBy?: string
  /** 联系人信息（发布时填写） */
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  responseCount: number
  /** task：期望交付 / 预算范围 */
  deliverable?: string
  budget?: string
  /** investment：希望获得的投资 / 合作；cooperation：业务瓶颈与合作诉求 */
  cooperationNeed?: string
  bottleneck?: string
  partnershipMode?: string
  /** investment / cooperation：可提供的回报与资源 */
  returnOffer?: string
  /** 可见范围（空数组 = 不限；HTTP 模式由服务端过滤） */
  visibilityIdentities: IdentityType[]
  visibilityLevels: number[]
  createdAt: string
  rejectReason?: string
  projectId?: string
  /** 我是否已响应（详情页用） */
  /** 本人响应快照（撤回后不返回，可重新响应） */
  myResponse?: { message: string; at: string; status: string }
}

export interface DemandCreatePayload {
  kind: DemandKind
  title: string
  description: string
  /** 类目编码（categoryDict 指定字典：task/cooperation→demand_category，investment→industry） */
  categoryCode: string
  categoryDict: 'demand_category' | 'industry'
  /** 截止日期（历史字段，表单不再收集） */
  deadline?: string
  /** 发布身份（仅决定发布后展示的发布方） */
  asIdentity: IdentityType
  /** 代企业发布时的企业 id（成员持 publish_demand 权限时；负责人不传） */
  asEnterpriseId?: string
  /** 联系人信息 */
  contactName: string
  contactPhone: string
  contactEmail?: string
  /** task 专属 */
  deliverable?: string
  budget?: string
  /** task 专属：预期交付日期 */
  deliverBy?: string
  /** investment 专属 */
  cooperationNeed?: string
  /** cooperation 专属 */
  bottleneck?: string
  partnershipMode?: string
  /** investment / cooperation：可提供的回报与资源 */
  returnOffer?: string
}

/** 已发布的用户协议 / 隐私政策（GET /api/app/policies/:kind） */
export interface AgreementPolicy {
  kind: 'user_agreement' | 'privacy_policy'
  title: string
  version: string
  content: string
  publishedAt: string
  /** true=后台尚未发布协议，当前为系统内置 V1.0（正式部署兜底） */
  builtIn?: boolean
}

export interface MyDemandItem {
  id: string
  title: string
  categoryLabel: string
  status: DemandStatus
  kind?: DemandKind
  responseCount: number
  createdAt: string
  rejectReason?: string
}

export interface MyResponseItem {
  id: string
  demandId: string
  demandTitle: string
  note: string
  at: string
  responderUid?: string
  responderName?: string
  responderIdentity?: IdentityType
  responderEnterpriseId?: string
  status?: 'pending' | 'contacted' | 'accepted' | 'rejected' | 'closed'
  reviewedAt?: string
  rejectReason?: string
  /** 已撤回时间（撤回后视为未响应，可重新响应） */
  withdrawnAt?: string
}

/* ---------- 活动中心 ---------- */

export type EventStatus = 'pending_release' | 'scheduled' | 'published' | 'ended' | 'cancelled'

export interface CommunityEvent {
  id: string
  title: string
  coverUrl?: string
  typeLabel: string
  startTime: string
  endTime: string
  location: string
  capacity: number
  requireReview: boolean
  enrollmentOpen: boolean
  enrollmentDeadline: string
  status: EventStatus
  visibilityIdentities: IdentityType[]
  visibilityLevels: number[]
  enrollmentIdentities: IdentityType[]
  enrollmentLevels: number[]
  description: string
  /** 签到配置（围栏半径；开放/关闭为相对开始时间的分钟偏移，负数/正数由服务端计算） */
  venueLat: number
  venueLng: number
  checkinRadiusM: number
  checkinOpenMin: number
  checkinCloseMin: number
  myEnrollmentStatus?: 'pending' | 'approved' | 'waitlisted' | 'rejected' | 'cancelled'
  myEnrollmentRejectReason?: string
  myCheckedIn?: boolean
}

export interface MyEnrollmentItem {
  id: string
  eventId: string
  eventTitle: string
  startTime: string
  endTime?: string
  cancelDeadlineHours?: number
  location: string
  status: 'pending' | 'approved' | 'waitlisted' | 'rejected' | 'cancelled'
  checkedIn: boolean
  rejectReason?: string
  /** 候补顺序（1 为最先递补） */
  waitlistOrder?: number
  /** 活动状态快照（用于展示「活动已取消/已改期」） */
  eventStatus?: EventStatus
  /** 改期后的开始时间（与原 startTime 不同时展示） */
  rescheduledTo?: string
}

export interface EventEnrollmentResult {
  status: 'approved' | 'pending' | 'waitlisted'
  waitlistOrder?: number
}

export interface CheckinPayload {
  lat: number
  lng: number
}

/** 活动反馈（结束后提交，用于运营复盘） */
export interface EventFeedbackPayload {
  rating: number
  comment?: string
}

export interface MyEventFeedback {
  eventId: string
  rating: number
  comment?: string
  at: string
}

/* ---------- 积分商城（统一券码兑换） ---------- */

export interface Goods {
  id: string
  name: string
  coverUrl?: string
  pointsCost: number
  stock: number
  description: string
  /** 商品分类（字典 goods_category） */
  category?: string
  /** 券码有效期（天）：下单后券码到期时间依据，空值按 30 天兜底 */
  validDays?: number
}

export type OrderStatus = 'pending_use' | 'completed' | 'cancelled' | 'expired'

export interface MyOrder {
  id: string
  goodsId: string
  goodsName: string
  pointsCost: number
  status: OrderStatus
  /** 券码：下单即签发，现场由工作人员核销 */
  voucherCode: string
  /** 券码有效期（过期未使用由系统自动退回积分） */
  voucherExpiresAt: string
  /** v41 订单评价（完成订单可评一次） */
  rating?: number
  review?: string
  reviewedAt?: string
  createdAt: string
  usedAt?: string
  finishedAt?: string
  cancelledAt?: string
}

/* ---------- 空间预约 ---------- */

export interface Space {
  id: string
  name: string
  /** 空间类型（社区服务空间字典） */
  type?: string
  location: string
  capacity: number
  equipment: string[]
  needApproval: boolean
  /** 预约费用（积分/小时）；0 = 免费使用 */
  feePerHour: number
  openTime: string
  closeTime: string
  /** 开放 / 维护中（维护中不可预约） */
  status: 'open' | 'maintenance'
  /** 空间说明（设备与服务提示） */
  description?: string
}

export interface SpaceSlot {
  start: string
  end: string
  occupied: boolean
  /** 占用来源：空间预约 / 已发布社区活动（用于页面标注占用原因） */
  type?: 'reservation' | 'event'
}

export interface SpaceReservation {
  id: string
  spaceId: string
  spaceName: string
  date: string
  start: string
  end: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  createdAt: string
  /** 预约主体身份（快照；企业/组织预约时记录负责人或成员以何身份提交） */
  identityType?: IdentityType
  /** 预约主体名称（企业名/组织名；个人身份存昵称） */
  subjectName?: string
  rejectReason?: string
  /** 详情字段，列表页无需展示。 */
  purpose?: string
  attendees?: number
  records?: ReviewTimelineItem[]
}

export interface ReviewTimelineItem {
  at: string
  action: string
  title: string
  text?: string
  operator?: string
}

export interface SpaceReservationDetail extends SpaceReservation {
  purpose: string
  attendees: number
  /** 本单实际消耗的积分（0 = 免费空间；驳回/取消已全额退回） */
  feePoints: number
  records: ReviewTimelineItem[]
}

export interface ReservationCreatePayload {
  spaceId: string
  date: string
  start: string
  end: string
  topic?: string
  /** 参与人数（1 ~ Space.capacity；缺省按 1 人） */
  attendees?: number
  /** 以哪个身份预约（个人用户/社区个体/社区企业/合作企业） */
  asIdentity?: IdentityType
  /** 代企业预约时的企业 id（成员持 space_reserve 权限时；负责人不传） */
  asEnterpriseId?: string
}

/* ---------- 内容与投稿 ---------- */

export interface ArticleColumn {
  code: string
  label: string
}

export interface Article {
  id: string
  title: string
  columnLabel: string
  authorName: string
  publishedAt: string
  views: number
  summary: string
  /** 文章封面（投稿时上传，可选） */
  coverUrl?: string
  content: string
  commentCount?: number
  commentsEnabled: boolean
  /** 点赞数与我的点赞状态 */
  likeCount?: number
  liked?: boolean
}

/** 文章评论 */
export interface ArticleComment {
  id: string
  articleId: string
  uid: string
  authorName: string
  avatar?: string
  content: string
  at: string
  /** v44：发表身份（历史评论为空按个人用户） */
  identityType?: IdentityType
  identityName?: string
}

export type SubmittedStatus = 'pending' | 'pending_release' | 'scheduled' | 'rejected' | 'withdrawn' | 'published' | 'closed'

export interface MySubmittedArticle {
  id: string
  title: string
  columnLabel: string
  status: SubmittedStatus
  submittedAt: string
  rejectReason?: string
}

export interface MySubmittedArticleDetail extends MySubmittedArticle {
  authorName: string
  content: string
  summary: string
  tags: string[]
  asIdentity?: IdentityType
  asEnterpriseId?: string
  identityName?: string
  scheduledAt?: string
  publishedAt?: string
}

export interface ArticleCreatePayload {
  title: string
  columnCode: string
  /** 投稿归属身份；代社区企业投稿时同时传 asEnterpriseId */
  asIdentity: IdentityType
  asEnterpriseId?: string
  /** 封面与正文图片均复用客户端上传契约 */
  coverUrl?: string
  content: string
  /** 列表卡片副标题与搜索摘要；未提供时后端留空 */
  summary?: string
}

/* ---------- 企业名片与名片申请 ---------- */

export interface EnterpriseShowcase {
  id: string
  name: string
  /** 企业 Logo（上传返回的 url） */
  logo?: string
  industry: string
  size: string
  /** 成立时间 */
  foundedAt?: string
  /** 企业官网 */
  website?: string
  /** 办公地点 */
  address?: string
  /** 主营业务 / 服务 */
  services?: string
  /** 核心优势 */
  advantages?: string
  description: string
  members: string[]
}

/* ---------- 我的名片（自助编辑） ---------- */

/** 名片字段可见性（个人名片公开预览用） */
export interface CardVisibility {
  age: boolean
  politicalStatus: boolean
  /** 是否公开名片：关闭后不出现在社区人才库、公开名片页不可见（缺省视为公开） */
  isPublic?: boolean
}

export interface MyIndividualCard {
  displayName: string
  /** 同步个人资料头像（只读展示） */
  avatar?: string
  age?: string
  politicalStatus?: string
  intro: string
  industryExperience?: string
  skills: string[]
  education: IndividualEducation[]
  work: IndividualWork[]
  projects: IndividualProject[]
  honors: IndividualHonor[]
  socials: IndividualLink[]
  customLinks: IndividualLink[]
  level?: number
  levelName?: string
  /** 公开可见性（缺省视为全部公开） */
  visibility?: CardVisibility
}

/** 公开人才名片（GET /api/app/community/talents/:uid）：人才库点入的公开简历页 */
export interface TalentCard {
  uid: string
  name: string
  avatar?: string
  level?: number
  levelName?: string
  age?: string
  politicalStatus?: string
  intro: string
  industryExperience?: string
  skills: string[]
  education: IndividualEducation[]
  work: IndividualWork[]
  projects: IndividualProject[]
  honors: IndividualHonor[]
  socials: IndividualLink[]
  customLinks: IndividualLink[]
}

export interface MyEnterpriseCard {
  enterpriseId: string
  enterpriseName: string
  industry: string
  size: string
  description: string
  /** 当前用户是否为企业联系人（负责人），决定名片是否可编辑 */
  isContact: boolean
  /** 企业联系人姓名（只读展示用） */
  contactName?: string
}

/** 我的名片（GET /api/app/me/cards）：按社区个体/社区企业身份返回可查看/编辑目标 */
export interface MyCards {
  individual?: MyIndividualCard
  enterprise?: MyEnterpriseCard
}

export interface MyIndividualCardPayload {
  displayName: string
  age?: string
  politicalStatus?: string
  intro: string
  industryExperience?: string
  skills: string[]
  education: IndividualEducation[]
  work: IndividualWork[]
  projects: IndividualProject[]
  honors: IndividualHonor[]
  socials: IndividualLink[]
  customLinks: IndividualLink[]
  /** 公开可见性（缺省视为全部公开） */
  visibility?: CardVisibility
}

/* ---------- 关联身份（身份列表 + 按身份查看/操作） ---------- */

/** 关联身份摘要（GET /api/app/me/identities）：社区个体 + 我关联的社区企业/合作企业（可多个） */
export interface MyIdentitySummary {
  /** 唯一键：community_individual / 企业 id / external:<组织名> */
  key: string
  type: IdentityType
  /** 身份标签：社区个体 / 社区企业 / 合作企业 */
  label: string
  /** 主体名称：昵称 / 企业名 / 组织名 */
  name: string
  /** 副标题：等级（社区个体）或 行业 · 规模（企业） */
  subtitle?: string
  /** 企业身份：我在该企业的角色（负责人可编辑、成员只读） */
  roleLabel?: string
  isContact?: boolean
  /** 企业成员权限（负责人为全部权限；用于「代替企业」能力判定） */
  permissions?: EnterpriseMemberPermission[]
  /** 企业身份的详情入口（无记录的合作企业组织无此字段） */
  enterpriseId?: string
  /** 该身份消费积分时的等级折扣（1 = 1 折 … 10 = 原价；个人身份取本人社区个体等级、企业身份取企业等级） */
  pointsDiscount: number
}

export interface EnterpriseMemberInfo {
  uid?: string
  name: string
  role?: string
  phone?: string
  permissions?: EnterpriseMemberPermission[]
  isContact?: boolean
}

export interface EnterpriseExitApplication {
  status: 'pending' | 'approved' | 'rejected'
  reason?: string
  at: string
}

/** 企业详情（GET /api/app/me/enterprises/:id）：关联人均可查看，负责人可操作 */
export interface MyEnterpriseDetail {
  enterpriseId: string
  enterpriseName: string
  /** 企业 Logo（上传返回的 url；负责人可上传） */
  logo?: string
  industry: string
  size: string
  /** 成立时间 */
  foundedAt?: string
  /** 企业官网 */
  website?: string
  /** 办公地点 */
  address?: string
  /** 主营业务 / 服务 */
  services?: string
  /** 核心优势 */
  advantages?: string
  description: string
  contactUid?: string
  contactName?: string
  members: EnterpriseMemberInfo[]
  isContact: boolean
  /** 我在该企业的权限（负责人为全部权限；成员为被分配集合） */
  myPermissions: EnterpriseMemberPermission[]
  /** 待接受的企业成员邀请（仅负责人可见，过期邀请以 expired 状态返回） */
  invitations: EnterpriseInvitation[]
  /** 我发起的负责人转移请求（仅负责人可见，待对方接受） */
  transferRequest?: EnterpriseTransferRequest | null
  exitApplication?: EnterpriseExitApplication | null
}

export interface MyEnterprisePayload {
  industry: string
  size: string
  description: string
  /** 企业 Logo（上传返回的 url；不传表示不修改） */
  logo?: string
  foundedAt?: string
  website?: string
  address?: string
  services?: string
  advantages?: string
}

export interface TransferContactPayload {
  memberUid?: string
  memberName: string
}

export interface InviteMemberPayload {
  name: string
  phone: string
  /** 成员职位（邀请时指定） */
  role: string
}

/** 修改企业成员信息：职位 / 手机号 / 权限（负责人或持对应权限的成员） */
export interface UpdateMemberPayload {
  memberUid?: string
  memberName: string
  /** 不传表示不修改 */
  role?: string
  /** 不传表示不修改；空串表示清空手机号 */
  phone?: string
  /** 不传表示不修改；负责人不可被分配权限 */
  permissions?: EnterpriseMemberPermission[]
}

export type InvitationAction = 'accept' | 'reject'

/** 企业成员邀请（邀请记录 + 站内信 + 接受/拒绝联动成员） */
export interface EnterpriseInvitation {
  id: string
  enterpriseId: string
  enterpriseName: string
  /** 被邀请人姓名（邀请时填写，接受后作为成员名） */
  memberName: string
  phone: string
  /** 加入后的成员职位 */
  role: string
  inviterName: string
  status: 'pending' | 'accepted' | 'rejected' | 'revoked' | 'expired'
  at: string
  respondedAt?: string
  /** 邀请有效期（默认 7 天；过期后不可处理） */
  expiresAt?: string
}

/** 负责人转移请求：需目标成员接受后生效 */
export interface EnterpriseTransferRequest {
  id: string
  enterpriseId: string
  enterpriseName: string
  fromUid: string
  fromName: string
  toUid: string
  toName: string
  status: 'pending' | 'accepted' | 'rejected' | 'revoked' | 'expired'
  at: string
  respondedAt?: string
  /** 请求有效期（默认 7 天） */
  expiresAt?: string
}


/* ---------- 收藏 ---------- */

export type FavoriteTargetType = 'demand' | 'article' | 'event' | 'enterprise' | 'talent'




export interface FavoriteItem {
  id: string
  type: FavoriteTargetType
  targetId: string
  title: string
  subtitle?: string
  at: string
}

/** 邀请详情（GET /api/app/invitations/:id）：邀请 + 企业概要，供被邀请人确认加入/拒绝 */
export interface InvitationDetail extends EnterpriseInvitation {
  enterpriseLogo?: string
  enterpriseIndustry: string
  enterpriseSize: string
}

/** 移除企业成员（仅企业负责人，不可移除负责人本人） */
export interface RemoveMemberPayload {
  memberUid?: string
  memberName: string
}

export interface EnterpriseExitPayload {
  reason?: string
}

/* ---------- 项目协作（只读） ---------- */

export interface Milestone {
  id: string
  title: string
  done: boolean
  /** 交付验收状态；历史数据缺省时按 done 推导 */
  status?: 'todo' | 'submitted' | 'accepted'
  submittedAt?: string
  submitNote?: string
  /** 交付证据附件（图片） */
  attachments?: { name: string; url: string }[]
  /** 被发起方退回的原因（退回后回到待提交） */
  returnReason?: string
  acceptedAt?: string
}

export interface MyProject {
  id: string
  name: string
  role: '需求发起方' | '本人承接' | '企业承接'
  enterpriseName?: string
  /** 企业承接时的企业 id（结项经验按企业维度发放） */
  enterpriseId?: string
  sourceDemandId?: string
  partnerName?: string
  progress: number
  milestones: Milestone[]
  /** 全部里程碑验收通过后的结项时间 */
  finishedAt?: string
}

/* ---------- 申请（企业合作：企业入驻/合作伙伴；人才登记） ---------- */

export type ApplicationType = 'settle' | 'individual' | 'cooperation'

/** 申请表单字段类型（后端按申请类型下发） */
export type ApplicationFieldType = 'text' | 'textarea' | 'select' | 'number' | 'date' | 'upload'

export interface ApplicationFormField {
  key: string
  label: string
  type: ApplicationFieldType
  required?: boolean
  placeholder?: string
  help?: string
  maxlength?: number
  /** select 选项 */
  options?: { label: string; value: string }[]
  /** upload 属性 */
  accept?: string
  multiple?: boolean
  maxCount?: number
}

/** 申请表单 schema（GET /api/app/application-form/:type） */
export interface ApplicationFormSchema {
  type: ApplicationType
  title: string
  subtitle: string
  submitLabel: string
  /** 表单顶部提示（材料清单等） */
  tips?: string[]
  fields: ApplicationFormField[]
}

/** 已上传文件（POST /api/app/uploads 返回） */
export interface UploadedFileInfo {
  key: string
  name: string
  size: number
  type: string
  url: string
}

export interface MyApplication {
  id: string
  type: ApplicationType
  targetName: string
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  submittedAt: string
  reviewedAt?: string
  rejectReason?: string
  /** 表单字段摘要（字段名：值 · …） */
  summary?: string
  /** 申请附件（名称与大小） */
  attachments?: { name: string; size: number }[]
  records: ReviewTimelineItem[]
}

export interface ApplicationDetailField {
  key?: string
  label: string
  value?: string
  files?: { name: string; size?: number; url?: string }[]
}

export interface MyApplicationDetail extends MyApplication {
  fields: ApplicationDetailField[]
  note?: string
}

export interface ApplicationCreatePayload {
  type: ApplicationType
  /** schema 驱动字段值（key → string | number | 附件数组） */
  fields?: Record<string, string | number | UploadedFileInfo[]>
  note?: string
}
