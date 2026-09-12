/* 客户端实体与 API 类型（独立声明，不依赖 admin）。
 * 字段口径对齐 docs/api-app-design.md 与 docs/entity-fields.md；
 * [MOCK-ONLY] 标注的类型成员为当前后端边界外能力，接入 M2 时按缺口清单实现。 */

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
}

/* ---------- 字典项（GET /api/app/dicts/:type） ---------- */

export interface DictItem {
  code: string
  label: string
}

/* ---------- 身份与用户 ---------- */

export type IdentityType = 'individual' | 'community_individual' | 'community_enterprise' | 'external_enterprise'

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
  phone: string
  nickname: string
  realName?: string
  gender: 'male' | 'female' | 'unknown'
  bio?: string
  points: number
  status: 'active' | 'frozen'
  registeredAt: string
  identities: UserIdentity[]
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

/* ---------- 站内信 [MOCK-ONLY]（缺口 §7-1） ---------- */

export type NoticeType = 'audit_result' | 'enroll_result' | 'order' | 'points' | 'system'

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

/* ---------- 首页聚合 [MOCK-ONLY]（缺口 §7-3 GET /api/app/home） ---------- */

export interface HomeFeed {
  siteName: string
  siteSlogan: string
  noticesUnread: number
  banners: HomeBanner[]
  hotEvents: HomeEventCard[]
  latestDemands: HomeDemandCard[]
  topArticles: HomeArticleCard[]
}

export interface HomeBanner {
  id: string
  title: string
  subtitle: string
}

/* ---------- 社区（社区服务 / 人才库 / 企业库） ---------- */

export interface CommunityPolicy {
  id: string
  category: string
  title: string
  summary: string
  content: string
  updatedAt: string
}

export interface TalentMember {
  uid: string
  name: string
  role: string
  intro: string
  skills: string[]
}

export interface HomeEventCard {
  id: string
  title: string
  type: string
  startTime: string
  location: string
  enrolled: number
  capacity: number
}

export interface HomeDemandCard {
  id: string
  title: string
  categoryLabel: string
  publisherName: string
  publisherIdentity: IdentityType
  deadline: string
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

export interface LoginPayload {
  phone: string
  password: string
  captchaCode: string
}

export interface RegisterPayload {
  phone: string
  password: string
  confirmPassword: string
  captchaCode: string
  nickname?: string
}

/** 登录/注册响应：多身份 JWT（缺口 §7-4，后端接入时实现签发） */
export interface AuthResult {
  token: string
  uid: string
  name: string
  identities: UserIdentity[]
  points: number
}

/* ---------- 经验值流水（GET /api/app/me/experience-records，缺口 §7-7） ---------- */

export interface ExperienceRecord {
  id: string
  delta: number
  balance: number
  reason: string
  at: string
}

/* ---------- 需求广场 ---------- */

export type DemandStatus = 'pending' | 'published' | 'rejected' | 'closed'

export interface Demand {
  id: string
  title: string
  description: string
  categoryLabel: string
  status: DemandStatus
  publisherUid?: string
  publisherName: string
  publisherIdentity: IdentityType
  deadline: string
  responseCount: number
  /** 可见范围（空数组 = 不限；缺口 §7-9 接入期服务端过滤，Mock 前端模拟） */
  visibilityIdentities: IdentityType[]
  visibilityLevels: number[]
  createdAt: string
  rejectReason?: string
  /** 我是否已响应（详情页用） */
  myResponse?: boolean
}

export interface DemandCreatePayload {
  title: string
  description: string
  categoryCode: string
  deadline: string
  /** 以哪个身份发布 */
  asIdentity: IdentityType
}

export interface MyDemandItem {
  id: string
  title: string
  categoryLabel: string
  status: DemandStatus
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
}

/* ---------- 活动中心 ---------- */

export type EventStatus = 'published' | 'ended'

export interface CommunityEvent {
  id: string
  title: string
  typeLabel: string
  startTime: string
  endTime: string
  location: string
  capacity: number
  approvedCount: number
  requireReview: boolean
  enrollmentDeadline: string
  status: EventStatus
  visibilityIdentities: IdentityType[]
  visibilityLevels: number[]
  enrollmentIdentities: IdentityType[]
  enrollmentLevels: number[]
  description: string
  /** [MOCK-ONLY] 位置签到配置（缺口 §7.1-2：Activity 字段迁移 + check-in 端点） */
  venueLat: number
  venueLng: number
  checkinRadiusM: number
  checkinOpenMin: string
  checkinCloseMin: string
  myEnrollmentStatus?: 'pending' | 'approved' | 'cancelled'
  myCheckedIn?: boolean
}

export interface MyEnrollmentItem {
  id: string
  eventId: string
  eventTitle: string
  startTime: string
  location: string
  status: 'pending' | 'approved' | 'cancelled'
  checkedIn: boolean
}

export interface CheckinPayload {
  lat: number
  lng: number
}

/* ---------- 积分商城 ---------- */

export interface Goods {
  id: string
  name: string
  pointsCost: number
  stock: number
  description: string
}

export type OrderStatus = 'pending_shipment' | 'shipped' | 'completed'

export interface MyOrder {
  id: string
  goodsId: string
  goodsName: string
  pointsCost: number
  status: OrderStatus
  createdAt: string
  shippedAt?: string
}

/* ---------- 空间预约 ---------- */

export interface Space {
  id: string
  name: string
  location: string
  capacity: number
  equipment: string[]
  needApproval: boolean
  openTime: string
  closeTime: string
}

export interface SpaceSlot {
  start: string
  end: string
  occupied: boolean
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
}

export interface ReservationCreatePayload {
  spaceId: string
  date: string
  start: string
  end: string
  topic?: string
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
  content: string
}

export type SubmittedStatus = 'pending' | 'pending_release' | 'rejected' | 'published'

export interface MySubmittedArticle {
  id: string
  title: string
  columnLabel: string
  status: SubmittedStatus
  submittedAt: string
  rejectReason?: string
}

export interface ArticleCreatePayload {
  title: string
  columnCode: string
  content: string
}

/* ---------- 企业展示页与展示页申请 ---------- */

export interface EnterpriseShowcase {
  id: string
  name: string
  industry: string
  size: string
  description: string
  showcaseStatus: 'published' | 'none'
  members: string[]
}

/* ---------- 项目协作（只读） ---------- */

export interface Milestone {
  id: string
  title: string
  done: boolean
}

export interface MyProject {
  id: string
  name: string
  role: '本人承接' | '企业承接'
  enterpriseName?: string
  progress: number
  milestones: Milestone[]
}

/* ---------- 申请（入驻/合作/身份绑定） ---------- */

export type ApplicationType = 'settle' | 'individual' | 'cooperation' | 'identity'

export interface MyApplication {
  id: string
  type: ApplicationType
  targetName: string
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: string
  reviewedAt?: string
  rejectReason?: string
}

export interface ApplicationCreatePayload {
  type: ApplicationType
  organizationName?: string
  identityType?: IdentityType
  note?: string
}
