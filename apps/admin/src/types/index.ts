/* 聚屿社区 · 实体类型定义（M0 原型冻结，M1 后端以此为基础建表） */

export type UserStatus = 'active' | 'frozen' | 'pending'

/* 身份类型：individual 个人用户为注册默认身份，人手一份，关联其他身份时保留（积分挂靠） */
export type IdentityType =
  | 'individual'
  | 'community_individual'
  | 'community_enterprise'
  | 'external_enterprise'

export interface UserIdentity {
  type: IdentityType
  /** 企业身份：关联企业；社区企业为入驻企业 ID，外部企业为自由填写名称 */
  enterpriseId?: string
  enterpriseName?: string
  /** 社区企业身份的企业角色（外部企业无此字段） */
  role?: 'founder' | 'admin' | 'member'
  /** 职位 / 头衔 */
  title: string
  /** 经验等级 1-5（仅社区个人/社区企业身份持有；参加活动、承接项目累积经验值升级） */
  level?: number
  /** 经验值余额（仅社区个人/社区企业身份持有，社区企业的经验值挂靠企业实体） */
  experience?: number
}

export interface UserActivity {
  time: string
  content: string
}

export interface User {
  id: string
  name: string
  phone: string
  email: string
  gender: '男' | '女'
  status: UserStatus
  /** 积分（挂靠个人用户身份；参加活动、承接项目获取，可在积分商城兑换） */
  points: number
  registeredAt: string
  lastActiveAt: string
  identities: UserIdentity[]
  bio: string
  stats: { demands: number; projects: number; events: number }
  activities: UserActivity[]
}

export type EnterpriseStatus = 'active' | 'pending' | 'exited'
export type ShowcaseStatus = 'none' | 'pending' | 'published' | 'rejected'

export interface Enterprise {
  id: string
  name: string
  industry: string
  stage: string
  size: string
  foundedAt: string
  settledAt: string | null
  leaseType: string
  status: EnterpriseStatus
  showcaseStatus: ShowcaseStatus
  showcaseComment?: string
  /** 经验值余额（社区企业持有；参加活动、承接项目累积） */
  experience?: number
  contactName: string
  contactPhone: string
  description: string
  tags: string[]
}

export type ApplicationType = 'settle' | 'showcase' | 'space' | 'identity'
export type ApplicationStatus = 'pending' | 'approved' | 'rejected'

export interface ApprovalRecord {
  step: string
  operator: string
  action: 'submit' | 'approve' | 'reject'
  comment: string
  at: string
}

export interface Application {
  id: string
  type: ApplicationType
  applicantName: string
  applicantPhone: string
  targetName: string
  submittedAt: string
  status: ApplicationStatus
  summary: string
  details: { label: string; value: string }[]
  records: ApprovalRecord[]
}

export type DemandStatus =
  | 'draft'
  | 'pending'
  | 'pending_release'
  | 'scheduled'
  | 'published'
  | 'rejected'
  | 'projected'
  | 'closed'

export interface DemandDraftPayload {
  title: string
  category: string
  budget: string
  period: string
  description: string
  visibilityIdentities: string[]
  visibilityLevels: string[]
  enrollmentIdentities: string[]
  enrollmentLevels: string[]
  deadline: string
  publisherId: string
  publisherIdentity: UserIdentity | null
  scheduledAt?: string
}

export interface DemandRespondent {
  name: string
  enterprise: string
  message: string
  at: string
  status: 'pending' | 'contacted' | 'closed'
}

export interface Demand {
  id: string
  title: string
  category: string
  /** 提交人（任何注册并填写手机号的用户） */
  publisherId: string
  publisherName: string
  /** 提交时所选身份快照 */
  publisherIdentity: UserIdentity | null
  budget: string
  /** 项目周期，如「4 周」 */
  period: string
  /** 报名截止时间（YYYY-MM-DD HH:mm） */
  deadline: string
  /** 定时发布时间（设置后进入定时发布中状态，到点自动发布） */
  scheduledAt?: string
  /** 可见范围：身份筛选（空数组 = 不限） */
  visibilityIdentities: IdentityType[]
  /** 可见范围：等级筛选（空数组 = 不限，1-5 级） */
  visibilityLevels: string[]
  /** 可报名范围：身份筛选（默认与可见范围一致，可单独调整；空数组 = 不限） */
  enrollmentIdentities: IdentityType[]
  /** 可报名范围：等级筛选（默认与可见范围一致，可单独调整） */
  enrollmentLevels: string[]
  status: DemandStatus
  createdAt: string
  /** 发布时间（实际发布/到点自动发布时写入，待发布/定时发布中/草稿无此字段） */
  publishedAt?: string
  description: string
  tags: string[]
  /** 驳回原因（status = rejected 时存在） */
  rejectedReason?: string
  /** 匹配的响应方（status = published / projected 时存在） */
  matchedRespondent?: string
  /** 立项后关联的项目 ID（status = projected 时存在） */
  projectId?: string
  respondents: DemandRespondent[]
}

export type ProjectStatus = 'recruiting' | 'running' | 'paused' | 'finished'

export interface ProjectUndertaker {
  type: 'enterprise' | 'individual'
  /** 企业 ID 或用户 ID */
  id: string
  /** 展示名：企业名 或 「姓名 · 头衔」 */
  name: string
  /** 承接占比（百分比整数，合计 100；均分除不尽时首个承接方取余数） */
  share: number
}

export interface Milestone {
  name: string
  status: 'done' | 'active' | 'todo'
  date: string
  /** 负责该节点的承接方（多承接方项目选填，可多选，存承接方展示名） */
  owners?: string[]
}

export interface Project {
  id: string
  name: string
  code: string
  /** 承接方（可多个，各含承接占比） */
  undertakers: ProjectUndertaker[]
  status: ProjectStatus
  progress: number
  startDate: string
  endDate: string
  /** 立项日期（项目创建/立项时间） */
  initiatedAt: string
  description: string
  milestones: Milestone[]
  memberCount: number
  /** 来源需求 ID（由需求立项创建时存在） */
  sourceDemandId?: string
}

export type EventStatus = 'pending_release' | 'scheduled' | 'published' | 'ended' | 'cancelled'

export interface EventEnrollment {
  userId: string
  name: string
  enterprise: string
  phone: string
  appliedAt: string
  status: 'pending' | 'approved' | 'rejected'
  checkedIn: boolean
  checkInAt: string | null
}

export interface CommunityEvent {
  id: string
  /** 创建时间（后台创建活动时写入，列表可按创建时间排序） */
  createdAt?: string
  title: string
  type: string
  startTime: string
  endTime: string
  location: string
  capacity: number
  speaker: string
  host: string
  status: EventStatus
  /** 报名开关：已发布状态下 true=报名中 / false=暂停报名（待发布/定时/已结束/已取消不参与） */
  enrollmentOpen: boolean
  /** 可见范围：身份筛选（空数组 = 不限） */
  visibilityIdentities: IdentityType[]
  /** 可见范围：等级筛选（空数组 = 不限，1-5 级） */
  visibilityLevels: string[]
  /** 可报名范围：默认与可见范围一致，可单独调整（空数组 = 不限） */
  enrollmentIdentities: IdentityType[]
  /** 可报名范围：等级筛选 */
  enrollmentLevels: string[]
  /** 报名是否需审核 */
  requireReview: boolean
  /** 报名截止时间（空 = 不限，活动开始前均可报名） */
  enrollmentDeadline?: string
  /** 定时发布时间（设置后进入定时发布中状态，到点自动发布） */
  scheduledAt?: string
  description: string
  tags: string[]
  enrollments: EventEnrollment[]
}

/* ---------- 创建项目 Payload（需求立项 / 后台直接创建共用） ---------- */

export interface UndertakerInput {
  type: 'enterprise' | 'individual'
  id: string
  /** 承接占比（整数百分比，合计须为 100） */
  share: number
}

export interface MilestoneInput {
  name: string
  date: string
  /** 负责该节点的承接方展示名（可多选） */
  owners: string[]
}

export interface ProjectInitPayload {
  undertakers: UndertakerInput[]
  projectName: string
  startDate: string
  endDate: string
  description: string
  milestones: MilestoneInput[]
}

/* API 返回形状 */
export interface PageResult<T> {
  list: T[]
  total: number
}

/* ---------- 经验值 / 积分流水账本 ---------- */

export interface ExperienceRecord {
  id: string
  /** 归属：enterprise=社区企业 | individual=社区个人身份 */
  targetType: 'enterprise' | 'individual'
  /** 企业 ID 或用户 ID */
  targetId: string
  /** 变动值（正=增加，负=扣减） */
  delta: number
  /** 变动后余额 */
  balance: number
  reason: string
  at: string
  operator: string
}

export interface PointsRecord {
  id: string
  userId: string
  /** 变动值（正=增加，负=扣减，兑换为负） */
  delta: number
  /** 变动后余额 */
  balance: number
  reason: string
  at: string
  operator: string
}

/* 外部企业聚合视图（由用户 external_enterprise 身份派生 + 档案补充，非独立入驻实体，无展示页） */
export interface ExternalEnterpriseMember {
  userId: string
  name: string
  title: string
  phone: string
  status: UserStatus
}

export interface ExternalEnterprise {
  /** 外部企业 ID（唯一标识，XE7001+） */
  id: string
  name: string
  industry: string
  description: string
  /** 累计合作次数 */
  cooperationCount: number
  firstCooperationAt: string
  members: ExternalEnterpriseMember[]
}
