/* 聚屿社区 · 实体类型定义（M0 原型冻结，M1 后端以此为基础建表） */

export type UserStatus = 'active' | 'frozen'

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
  /** 经验等级 1-5（仅社区个体/社区企业身份持有；参加活动、承接项目累积经验值升级） */
  level?: number
  /** 经验值余额（仅社区个体/社区企业身份持有，社区企业的经验值挂靠企业实体） */
  experience?: number
}

export interface UserActivity {
  time: string
  content: string
}

export interface User {
  /** 用户唯一标识（微信登录预备：预留 uid 命名） */
  uid: string
  /** 昵称（微信登录预备：不再作为真实姓名使用） */
  nickname: string
  phone: string
  email: string
  gender: '男' | '女'
  status: UserStatus
  /** 实名信息（真实姓名与身份证号均填写即视为已实名；实名状态由二者派生） */
  realName?: string
  citizenId?: string
  /** 微信登录信息（可空，未绑定微信时缺省） */
  wechatOpenid?: string
  wechatUnionid?: string
  /** 是否完成微信实名认证流程（默认 false） */
  wechatVerified?: boolean
  /** 冻结信息（frozen 时存在；frozenUntil 空表示长期冻结） */
  frozenUntil?: string
  frozenReason?: string
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
  /** 联系邮箱（需求提交人自动填充用；非必填） */
  contactEmail?: string
  description: string
  tags: string[]
}

/* 申请类型（迁移后仅保留入驻与身份绑定；空间预约→公共空间模块、展示页发布→资讯内容模块）
 * 申请实体仍由 applications 维护，仅类型收窄 */
export type ApplicationType = 'settle' | 'identity'
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
  | 'pending'
  | 'pending_release'
  | 'scheduled'
  | 'published'
  | 'rejected'
  | 'projected'
  | 'closed'

export interface DemandRespondent {
  name: string
  enterprise: string
  /** 联系电话（代报名必填；成员自行响应可能缺省） */
  phone?: string
  /** 联系邮箱（选填） */
  email?: string
  /** 报价（选填，如 ¥8,000） */
  quote?: string
  message: string
  at: string
  status: 'pending' | 'contacted' | 'closed'
}

export interface Demand {
  id: string
  title: string
  category: string
  /** 提交人（注册用户/企业，或未注册的自建条目） */
  publisherId: string
  publisherName: string
  /** 提交时所选身份快照（企业/未注册提交人无身份快照） */
  publisherIdentity: UserIdentity | null
  /** 联系人姓名（企业提交=企业联系人 / 个人提交=个人真实姓名 / 自定义手填；创建/编辑表单必填） */
  contactName?: string
  /** 提交人联系电话（创建/编辑表单必填；历史数据可能缺省） */
  contactPhone?: string
  /** 提交人联系邮箱（选填） */
  contactEmail?: string
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
  /** 发布时间（实际发布/到点自动发布时写入，待发布/定时发布中无此字段） */
  publishedAt?: string
  description: string
  tags: string[]
  /** 驳回原因（status = rejected 时存在） */
  rejectedReason?: string
  /** 匹配的响应方（status = published / projected 时存在） */
  matchedRespondent?: string
  /** 立项后关联的项目 ID（status = projected 时存在） */
  projectId?: string
  /** 自定义响应需求奖励积分（缺省 = 按积分规则 demand_responded 发放） */
  respondPoints?: number
  respondents: DemandRespondent[]
}

/* 项目状态四态：进行中 / 已暂停 / 已关闭 / 已结项 */
export type ProjectStatus = 'running' | 'paused' | 'closed' | 'finished'

export interface ProjectUndertaker {
  /** enterprise=社区企业（经验参与）/ individual=用户（结项时持社区个体身份者参与经验）/ custom=自定义添加（不参与经验） */
  type: 'enterprise' | 'individual' | 'custom'
  /** 企业 ID / 用户 ID / 自定义项为空串 */
  id: string
  /** 展示名：企业名 或 「姓名 · 头衔」 或 自定义名称 */
  name: string
  /** 承接占比（百分比整数，合计 100；均分除不尽时首个承接方取余数） */
  share: number
  /** 自定义承接方：联系人 */
  contactName?: string
  /** 自定义承接方：联系电话 */
  phone?: string
}
/* 经验值分配口径（项目结项）：项目经验值 × 承接占比%，仅社区企业（type=enterprise 且 E 前缀）
 * 与结项时持社区个体身份的用户参与；外部企业 / 个人用户（无社区个体身份）/ 自定义承接方不参与，
 * 其份额丢弃不转移 */

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
  /** 自定义项目经验值（缺省 = 按经验值规则 project_completed；结项时按承接占比分配） */
  expReward?: number
  /** 关闭原因（status = closed 时存在） */
  closeReason?: string
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
  /** 自定义报名奖励积分（缺省 = 按积分规则 activity_enroll_approved 发放） */
  enrollPoints?: number
  /** 自定义签到奖励积分（缺省 = 按积分规则 activity_checkin 发放） */
  checkinPoints?: number
  description: string
  tags: string[]
  enrollments: EventEnrollment[]
}

/* ---------- 创建项目 Payload（需求立项 / 后台直接创建共用） ---------- */

export interface UndertakerInput {
  type: 'enterprise' | 'individual' | 'custom'
  /** 企业 ID / 用户 ID / 自定义项为空串 */
  id: string
  /** 承接占比（整数百分比，合计须为 100） */
  share: number
  /** 自定义承接方：展示名（type=custom 时必填） */
  name?: string
  /** 自定义承接方：联系人 */
  contactName?: string
  /** 自定义承接方：联系电话 */
  phone?: string
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
  /** 起止日期（表单已移除填写项：编辑保留原值，新建为空串） */
  startDate?: string
  endDate?: string
  description: string
  milestones: MilestoneInput[]
  /** 自定义项目经验值（缺省 = 按经验值规则 project_completed 发放；结项时按承接占比分配） */
  expReward?: number
}

/* API 返回形状 */
export interface PageResult<T> {
  list: T[]
  total: number
}

/* ---------- 经验值 / 积分流水账本 ---------- */

export interface ExperienceRecord {
  id: string
  /** 归属：enterprise=社区企业 | individual=社区个体身份 */
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
  /** 记录来源：rule=规则自动发放 / manual=管理员手动调整（含扣减） */
  source: 'rule' | 'manual'
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
  /** 记录来源：rule=规则自动发放 / manual=管理员手动调整 / redemption=商城兑换扣减 */
  source: 'rule' | 'manual' | 'redemption'
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

/* ============================================================
   M0-D 运营设施域 — 实体类型（M0 原型冻结，M1 后端以此为基础建表）
   命名前缀：商品 G1001+ / 兑换订单 RO2001+ / 积分规则 R01+
   工位 WS1001+ / 租约 LS2001+ / 空间 S1001+ / 空间预约 SR2001+
   文章 A1001+ / 栏目 CL2001+ / 展示页发布申请 SC1001+
   ============================================================ */

/* ---------- 积分商城 ---------- */

export type GoodsCategory = 'physical' | 'virtual' | 'voucher'
export type GoodsStatus = 'on' | 'off'

export interface MallGoods {
  id: string
  name: string
  /** 实物商品 / 虚拟服务 / 权益券 */
  category: GoodsCategory
  /** 兑换所需积分 */
  points: number
  /** 库存（虚拟/权益券可设较大值） */
  stock: number
  status: GoodsStatus
  description: string
  /** 累计兑换次数 */
  redeemedCount: number
  createdAt: string
}

export type RedemptionOrderStatus = 'pending_shipment' | 'shipped' | 'finished' | 'cancelled'

export interface RedemptionOrder {
  id: string
  userId: string
  userName: string
  goodsId: string
  goodsName: string
  /** 兑换扣减积分（负值记录于积分流水） */
  points: number
  status: RedemptionOrderStatus
  createdAt: string
  /** 发货时间（shipped/finished 时存在） */
  shippedAt?: string
  /** 完成时间（finished 时存在，模拟层标记完成） */
  finishedAt?: string
  /** 收件信息（实物商品） */
  recipientName?: string
  recipientPhone?: string
  address?: string
  note?: string
  /** 取消原因（cancelled 时存在，积分原路退回） */
  cancelReason?: string
}

export type RuleStatus = 'enabled' | 'disabled'

export interface PointsRule {
  /** 规则编码（触发项写死，后端按 code 关联积分发放逻辑；如 activity_checkin） */
  code: string
  /** 触发项名称（写死不可编辑） */
  name: string
  /** 行为场景说明（写死不可编辑） */
  scene: string
  /** 发放积分（正数），仅此项与启停可编辑 */
  points: number
  status: RuleStatus
  description?: string
  updatedAt: string
}

/* ---------- 规则管理：经验值规则 / 等级规则 ---------- */

export interface ExperienceRule {
  /** 规则编码（触发项写死，后端按 code 关联经验发放逻辑；如 activity_checkin） */
  code: string
  /** 触发项名称（写死不可编辑） */
  name: string
  /** 行为场景说明（写死不可编辑） */
  scene: string
  /** 发放经验值（正数），仅此项与启停可编辑 */
  exp: number
  status: RuleStatus
  description?: string
  updatedAt: string
}

export interface LevelTier {
  /** 等级序号（1 起连续递增，梯度设定后自动编排） */
  level: number
  /** 等级标签（如：青铜、白银、黄金、铂金、钻石） */
  label: string
  /** 达到该等级所需累计经验值门槛 */
  threshold: number
}

/* ---------- 办公位管理 ---------- */

export type WorkstationType = 'open' | 'office' | 'semi'
export type WorkstationStatus = 'idle' | 'assigned' | 'maintenance'

export interface Workstation {
  id: string
  /** 工位编号，如 A-01、B-201 */
  seatNo: string
  /** 所在区域，如 A 区·开放工位、B 区·独立办公室 */
  area: string
  type: WorkstationType
  /** 容量（独立办公室可多人，开放工位 1） */
  capacity: number
  status: WorkstationStatus
  /** 当前分配企业（assigned 时存在） */
  enterpriseId?: string
  enterpriseName?: string
  /** 关联租约 ID（assigned 时存在） */
  leaseId?: string
  /** 默认月租（元）：创建租约选"月租"周期时自动累加进租金；非必填 */
  defaultMonthlyRent?: number
  /** 面积（㎡）：仅独立办公室有意义的非必填项 */
  areaSqm?: number
  /** 备注（自由文本，如维护原因、使用注意事项；非必填） */
  note?: string
}

export type LeaseBaseStatus = 'active' | 'terminated'

/** 租赁方类型：enterprise=注册企业 / individual=注册个人用户 / custom=未注册（弹窗内自建条目） */
export type LeaseRenterType = 'enterprise' | 'individual' | 'custom'

/** 租赁周期：day=日租 / week=周租 / month=月租 / year=年租（缺省按月租处理） */
export type RentPeriod = 'day' | 'week' | 'month' | 'year'

/** 工位区域（区域规划）：工位以区域名称字符串关联（M1 建议改为 areaId 外键） */
export interface WorkstationArea {
  id: string
  /** 区域名称，如 A 区 · 开放工位（工位.area 直接存该名称） */
  name: string
  /** 区域主类型：open=开放工位 / office=独立办公室 / semi=半开放工位 */
  type: WorkstationType
  description: string
  createdAt: string
}

export interface Lease {
  id: string
  /** 租赁方 ID：enterprise=企业 ID / individual=用户 ID / custom=空 */
  enterpriseId: string
  /** 租赁方名称（企业名 / 用户名 / 自建条目名称） */
  enterpriseName: string
  /** 租赁方类型（旧数据缺省时按 enterpriseId 前缀推断：E 开头=企业，其余=custom） */
  renterType?: LeaseRenterType
  /** 关联工位 ID 列表 */
  workstationIds: string[]
  /** 工位编号展示文本 */
  workstationLabels: string[]
  startDate: string
  endDate: string
  /** 长期租约：无结束日期（endDate 为空串），不参与到期派生 */
  longTerm?: boolean
  /** 原始状态：active=生效中 / terminated=已终止（到期临期/已到期由读取时派生） */
  status: LeaseBaseStatus
  /** 月租金（元） */
  monthlyRent: number
  /** 租赁周期（缺省按月租处理） */
  rentPeriod?: RentPeriod
  contactName: string
  contactPhone: string
  /** 终止时间（terminated 时存在） */
  terminatedAt?: string
}

/* ---------- 公共空间 ---------- */

export type SpaceType = 'meeting' | 'roadshow' | 'meeting_room' | 'multi' | 'study'
export type SpaceStatus = 'available' | 'maintenance' | 'disabled'

export interface Space {
  id: string
  name: string
  type: SpaceType
  capacity: number
  location: string
  /** 开放时段（HH:mm）；allDay 时存 00:00/23:59 */
  openTime: string
  closeTime: string
  /** 全天开放：不设时段限制，展示"全天开放" */
  allDay?: boolean
  /** 是否需要预约（默认关闭） */
  needReservation?: boolean
  /** 是否需要审批（仅 needReservation 开启时有效） */
  needApproval?: boolean
  /** 配备设备 */
  equipment: string[]
  status: SpaceStatus
  description: string
}

export type ReservationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface SpaceReservation {
  id: string
  userId: string
  userName: string
  phone: string
  spaceId: string
  spaceName: string
  /** 预约日期（YYYY-MM-DD） */
  date: string
  /** 使用时段（HH:mm） */
  startTime: string
  endTime: string
  purpose: string
  attendees: number
  status: ReservationStatus
  submittedAt: string
  records: ApprovalRecord[]
  rejectReason?: string
}

/* ---------- 资讯内容 ---------- */

export type ArticleStatus = 'draft' | 'pending' | 'published' | 'withdrawn' | 'rejected'

export interface Article {
  id: string
  title: string
  columnId: string
  columnName: string
  authorId: string
  authorName: string
  /** 提交身份快照（复用需求提交身份概念） */
  authorIdentity: UserIdentity | null
  status: ArticleStatus
  /** 发布时间（published/withdrawn 时存在） */
  publishedAt?: string
  /** 阅读量 */
  views: number
  summary: string
  tags: string[]
  createdAt: string
  /** 驳回原因（rejected 时存在） */
  rejectedReason?: string
}

export type ColumnStatus = 'enabled' | 'disabled'

export interface ArticleColumn {
  id: string
  name: string
  description: string
  /** 排序权重（数字越小越靠前） */
  sort: number
  status: ColumnStatus
  createdAt: string
}

export type ShowcaseTargetType = 'enterprise' | 'individual'

export interface ShowcaseRequest {
  id: string
  targetType: ShowcaseTargetType
  /** 企业 ID（targetType=enterprise 时存在） */
  targetId?: string
  targetName: string
  contentSummary: string
  submitterName: string
  submitterPhone: string
  submittedAt: string
  status: ReservationStatus
  records: ApprovalRecord[]
  rejectReason?: string
}
