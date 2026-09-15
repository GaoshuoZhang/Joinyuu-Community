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
  /** 是否已完成实名认证 */
  realNameVerified?: boolean
  /** 头像图片地址（上传返回的 url；缺省时展示昵称首字） */
  avatar?: string
  gender: 'male' | 'female' | 'unknown'
  bio?: string
  points: number
  status: 'active' | 'frozen'
  registeredAt: string
  identities: UserIdentity[]
}

/* ---------- 实名认证（GET/PUT /api/app/me/realname，[MOCK-ONLY] 缺口 §7.1-18） ---------- */

export interface RealNameInfo {
  verified: boolean
  /** 脱敏展示：首字保留（如 苏*） */
  realName?: string
  /** 脱敏证件号：前 4 + 后 4（如 3301**********1234） */
  citizenIdMasked?: string
  /** 认证通过时间（mock 即时通过时记录） */
  verifiedAt?: string
}

export interface RealNamePayload {
  realName: string
  citizenId: string
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
  showcaseStatus: 'published' | 'none'
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
  enrolled: number
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
  avatar?: string
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

/** 经验/等级聚合（按当前身份取数：社区个体→个人经验；社区企业→企业经验） */
export interface ExperienceProfile {
  identityLabel: string
  level: number
  levelName: string
  nextLevelExp: number
  records: ExperienceRecord[]
}

/* ---------- 需求广场 ---------- */

export type DemandStatus = 'pending' | 'published' | 'rejected' | 'closed'

/** 需求类型（[MOCK-ONLY] 缺口 §7.1-15：后端待增 demandType 字段）
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
  /** 可见范围（空数组 = 不限；缺口 §7-9 接入期服务端过滤，Mock 前端模拟） */
  visibilityIdentities: IdentityType[]
  visibilityLevels: number[]
  createdAt: string
  rejectReason?: string
  /** 我是否已响应（详情页用） */
  myResponse?: boolean
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
  /** [MOCK-ONLY] 签到配置（缺口 §7.1-2：Activity 字段迁移 + check-in 端点） */
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
  finishedAt?: string
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
  /** 预约主体身份（快照；企业/组织预约时记录负责人或成员以何身份提交） */
  identityType?: IdentityType
  /** 预约主体名称（企业名/组织名；个人身份存昵称） */
  subjectName?: string
}

export interface ReservationCreatePayload {
  spaceId: string
  date: string
  start: string
  end: string
  topic?: string
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
  /** 投稿归属身份；代社区企业投稿时同时传 asEnterpriseId */
  asIdentity: IdentityType
  asEnterpriseId?: string
  /** 封面与正文图片均复用客户端上传契约 */
  coverUrl?: string
  content: string
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
  showcaseStatus: 'published' | 'none'
  members: string[]
}

/* ---------- 我的名片（原「展示页」更名，自助编辑，[MOCK-ONLY]，缺口 §7.1-16） ---------- */

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
  showcaseStatus: 'published' | 'none'
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
}

/* ---------- 关联身份（身份列表 + 按身份查看/操作，[MOCK-ONLY]，缺口 §7.1-16） ---------- */

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
  showcaseStatus?: 'published' | 'none'
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
  status: 'pending'
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
  showcaseStatus: 'published' | 'none'
  contactUid?: string
  contactName?: string
  members: EnterpriseMemberInfo[]
  isContact: boolean
  /** 我在该企业的权限（负责人为全部权限；成员为被分配集合） */
  myPermissions: EnterpriseMemberPermission[]
  /** 待接受的企业成员邀请（仅负责人可见） */
  invitations: EnterpriseInvitation[]
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

/** 企业成员邀请（[MOCK-ONLY] 缺口 §7.1-17；真实后端为邀请记录 + 站内信/短信 + 接受拒绝联动成员） */
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
  status: 'pending' | 'accepted' | 'rejected'
  at: string
  respondedAt?: string
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
}

export interface MyProject {
  id: string
  name: string
  role: '本人承接' | '企业承接'
  enterpriseName?: string
  progress: number
  milestones: Milestone[]
}

/* ---------- 申请（企业合作：企业入驻/合作伙伴；人才登记；身份绑定） ---------- */

export type ApplicationType = 'settle' | 'individual' | 'cooperation' | 'identity'

/** 申请表单字段类型（缺口 §7.1-14：后端按申请类型下发自定义字段） */
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

/** 申请表单 schema（GET /api/app/application-form/:type，缺口 §7.1-14） */
export interface ApplicationFormSchema {
  type: ApplicationType
  title: string
  subtitle: string
  submitLabel: string
  /** 表单顶部提示（材料清单等） */
  tips?: string[]
  fields: ApplicationFormField[]
}

/** 已上传文件（POST /api/app/uploads 返回，缺口 §7.1-6） */
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
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: string
  reviewedAt?: string
  rejectReason?: string
  /** 表单字段摘要（字段名：值 · …） */
  summary?: string
  /** 申请附件（名称与大小） */
  attachments?: { name: string; size: number }[]
}

export interface ApplicationCreatePayload {
  type: ApplicationType
  /** schema 驱动字段值（key → string | number | 附件数组） */
  fields?: Record<string, string | number | UploadedFileInfo[]>
  /** 身份绑定流程：要绑定的身份类型 */
  identityType?: IdentityType
  /** 兼容旧字段（企业名称） */
  organizationName?: string
  note?: string
}
