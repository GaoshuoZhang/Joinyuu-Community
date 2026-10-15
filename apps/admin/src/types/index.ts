/* 聚屿社区 · 实体类型定义 */

export type UserStatus = 'active' | 'frozen' | 'deleted'

/* 身份类型：individual 个人用户为注册默认身份，人手一份，关联其他身份时保留（积分挂靠）
 * external_individual / external_company 仅用于社区代录需求的「需求方身份」快照（个人用户/合作企业） */
export type IdentityType =
  | 'individual'
  | 'community_individual'
  | 'community_enterprise'
  | 'external_enterprise'
  | 'external_individual'
  | 'external_company'
  /** 社区官方：后台自建需求的提交人身份（title 为工作人员角色名） */
  | 'official'

export interface UserIdentity {
  type: IdentityType
  /** 企业身份：关联企业；社区企业为社区企业 ID，合作企业为自由填写名称 */
  enterpriseId?: string
  enterpriseName?: string
  /** 社区企业身份的企业角色（合作企业无此字段） */
  role?: 'founder' | 'admin' | 'member'
  /** 职位 / 头衔 */
  title: string
  /** 经验值等级 1-5（仅社区个体/社区企业身份持有；参加活动、承接项目累积经验值升级） */
  level?: number
  /** 经验值余额（仅社区个体/社区企业身份持有，社区企业的经验值挂靠企业实体） */
  experience?: number
}

export interface UserActivity {
  time: string
  content: string
}

/** 性别取值：后台历史数据为中文（男/女），客户端注册与资料更新使用英文规范值（male/female/unknown） */
export type UserGender = '男' | '女' | 'male' | 'female' | 'unknown'

export interface User {
  /** 用户唯一标识（微信登录预备：预留 uid 命名） */
  uid: string
  /** 登录用户名（全站唯一，字母开头 4-20 位，仅字母/数字/下划线） */
  username: string
  /** 昵称（微信登录预备：不再作为真实姓名使用；全站唯一） */
  nickname: string
  /** 头像地址（客户端上传后由 /api/public/files/:key 提供；未设置时缺省） */
  avatar?: string
  /** 手机号（可空且唯一，空时后端回空串） */
  phone: string
  /** 邮箱（可空且唯一，空时后端回空串） */
  email: string
  /** 手机号是否为已验证的可信通知渠道 */
  phoneVerified?: boolean
  /** 邮箱是否为已验证的可信通知渠道 */
  emailVerified?: boolean
  gender: UserGender
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

export type EnterpriseStatus = 'active' | 'exited' | 'disabled'

export interface Enterprise {
  id: string
  name: string
  /** 企业 Logo（素材 URL，列表头像展示；未上传即无此字段） */
  logo?: string
  industry: string
  size: string
  foundedAt: string
  settledAt: string | null
  leaseType: string
  status: EnterpriseStatus
  /** 经验值余额（社区企业持有；参加活动、承接项目累积） */
  experience?: number
  /** 企业等级（按 community_enterprise 等级梯度由经验值推导，列表接口下发） */
  level?: number
  levelName?: string
  /** 关联用户 UID（社区企业必须关联一个个人用户，作为企业联系人） */
  contactUserId?: string
  /** 联系人职位（展示于成员管理） */
  contactTitle: string
  contactName: string
  contactPhone: string
  /** 联系邮箱（需求提交人自动填充用；非必填） */
  contactEmail?: string
  description: string
  tags: string[]
}

/* 申请类型（四类：企业入驻 / 个体入驻 / 企业合作 / 企业退驻）
 * 申请实体仍由 applications 维护 */
export type ApplicationType = 'settle' | 'individual' | 'cooperation' | 'exit'
export type ApplicationStatus = 'pending' | 'approved' | 'rejected'

export interface ApprovalRecord {
  step: string
  operator: string
  action: 'submit' | 'approve' | 'reject'
  comment: string
  at: string
}

export interface ApplicationDetailFile {
  name: string
  url?: string
}

export interface ApplicationDetailEntry {
  label: string
  value?: string
  files?: ApplicationDetailFile[]
}

export interface Application {
  id: string
  type: ApplicationType
  applicantName: string
  applicantPhone: string
  /** 申请人用户 ID（按手机号关联注册用户派生；无匹配为 null） */
  applicantId?: string | null
  targetName: string
  submittedAt: string
  status: ApplicationStatus
  summary: string
  details: ApplicationDetailEntry[]
  records: ApprovalRecord[]
}

export type DemandStatus =
  | 'pending'
  | 'pending_release'
  | 'scheduled'
  | 'published'
  | 'selected'
  | 'rejected'
  | 'projected'
  | 'closed'

export interface DemandRespondent {
  id: number
  name: string
  enterprise: string
  /** 联系电话（代报名必填；成员自行响应可能缺省） */
  phone?: string
  /** 联系邮箱（选填） */
  email?: string
  /** 报价（选填，如 ¥8,000） */
  quote?: string
  /** 可投入时间/预计工期（选填，≤128） */
  timeline?: string
  /** 相关经验与案例（选填，≤300） */
  cases?: string
  message: string
  at: string
  status: 'pending' | 'contacted' | 'accepted' | 'rejected' | 'closed' | 'pending_review'
  /** 审核时间（管理员通过/驳回后写入） */
  reviewedAt?: string
  /** 驳回理由（status = rejected 时存在） */
  rejectReason?: string
}

export interface Demand {
  id: string
  title: string
  /** 字典类别的显示名称；category 保存筛选和持久化使用的 code。 */
  categoryLabel?: string
  category: string
  demandType: 'task' | 'investment' | 'cooperation'
  deliverable?: string
  deliverBy?: string
  cooperationNeed?: string
  returnOffer?: string
  bottleneck?: string
  partnershipMode?: string
  /** 提交人（注册用户/企业，或未注册的自建条目） */
  publisherId: string
  publisherName: string
  /** 提交时所选身份快照（企业/未注册提交人无身份快照） */
  publisherIdentity: UserIdentity | null
  /** 联系人姓名（企业提交=企业联系人 / 个人提交=个人真实姓名 / 自定义手填；新增/编辑表单必填） */
  contactName?: string
  /** 提交人联系电话（新增/编辑表单必填；历史数据可能缺省） */
  contactPhone?: string
  /** 提交人联系邮箱（选填） */
  contactEmail?: string
  /** 公开联系人：开启后客户端（含未登录游客）可见联系人姓名/电话/邮箱；默认关闭 */
  contactPublic: boolean
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
  /** 响应需求奖励积分（历史缺省值按积分规则 demand_responded 发放） */
  respondPoints?: number
  /** 响应是否需管理员审核（默认开启；开启后成员响应需审核通过才对发布者可见） */
  respondNeedReview: boolean
  /** 未撤回总响应数 */
  responseCount: number
  /** 未撤回且待审核响应数 */
  pendingResponseCount: number
  respondents: DemandRespondent[]
  /** 归档时间（非空表示已归档，详情页写操作隐藏） */
  deletedAt?: string | null
}

/* 项目状态四态：进行中 / 已暂停 / 已关闭 / 已结项 */
export type ProjectStatus = 'running' | 'paused' | 'closed' | 'finished'

export interface ProjectUndertaker {
  /** enterprise=社区企业（经验值参与）/ individual=用户（结项时持社区个体身份者参与经验值）/ custom=自定义新增（不参与经验值） */
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
 * 与结项时持社区个体身份的用户参与；合作企业 / 个人用户（无社区个体身份）/ 自定义承接方不参与，
 * 其份额丢弃不转移 */

export interface Milestone {
  name: string
  status: 'todo' | 'submitted' | 'accepted' | 'returned'
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
  /** 立项日期（项目新增/立项时间） */
  initiatedAt: string
  description: string
  milestones: Milestone[]
  memberCount: number
  /** 来源需求 ID（由需求立项新增时存在） */
  sourceDemandId?: string
  /** 自定义项目经验值（缺省 = 按经验值规则 project_completed；结项时按承接占比分配） */
  expReward?: number
  /** 关闭原因（status = closed 时存在） */
  closeReason?: string
  /** 结项时间（status = finished 时存在） */
  finishedAt?: string
  /** 归档时间（非空表示已归档，详情页写操作隐藏） */
  deletedAt?: string | null
  /** 需求方（主体 ID / 名称 / 身份快照；需求立项照搬需求，社区自建由表单录入） */
  demanderId?: string
  demanderName?: string
  demanderIdentity?: { type?: string; enterpriseName?: string; enterpriseId?: string; title?: string } | null
  /** 创建人 */
  creatorName?: string
  creatorId?: string
  /** 联系人 / 联系电话 / 邮箱 */
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  /** 合同价格 */
  contractPrice?: string
}

export type EventStatus = 'pending_release' | 'scheduled' | 'published' | 'ended' | 'cancelled'

export interface EventEnrollment {
  userId: string
  name: string
  enterprise: string
  phone: string
  appliedAt: string
  status: 'pending' | 'approved' | 'rejected' | 'waitlisted' | 'cancelled'
  checkedIn: boolean
  checkInAt: string | null
  waitlistOrder?: number
  checkinLat?: string
  checkinLng?: string
  checkinMethod?: 'self' | 'admin'
}

/** 活动报名审核列表行（跨活动；含活动快照） */
export interface EventEnrollmentRecord {
  eventId: string
  eventTitle: string
  eventStartTime: string
  eventStatus: string
  userId: string
  name: string
  enterprise: string
  identities: UserIdentity[]
  phone: string
  appliedAt: string
  status: EventEnrollment['status']
  waitlisted: boolean
  waitlistOrder?: number
  checkedIn: boolean
  checkInAt: string | null
}

export interface CommunityEvent {
  id: string
  /** 创建时间（后台新增活动时写入，列表可按创建时间排序） */
  createdAt?: string
  title: string
  coverUrl?: string
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
  /** 报名奖励积分（历史缺省值按积分规则 activity_enroll_approved 发放） */
  enrollPoints?: number
  /** 签到奖励积分（历史缺省值按积分规则 activity_checkin 发放） */
  checkinPoints?: number
  venueLat?: string
  venueLng?: string
  checkinRadiusM?: number
  checkinOpenMin?: number
  checkinCloseMin?: number
  cancelDeadlineHours?: number
  rescheduledTo?: string
  feedbackSummary?: {
    average: number
    total: number
    list: Array<{ userId: string; rating: number; comment: string; at: string }>
  }
  description: string
  tags: string[]
  enrollments: EventEnrollment[]
  /** 归档时间（非空表示已归档，详情页写操作隐藏） */
  deletedAt?: string | null
}

/* ---------- 新增项目 Payload（需求立项 / 后台直接新增共用） ---------- */

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
  /** 起止日期（表单已删除填写项：编辑保留原值，新增为空串） */
  startDate?: string
  endDate?: string
  description: string
  milestones: MilestoneInput[]
  /** 自定义项目经验值（缺省 = 按经验值规则 project_completed 发放；结项时按承接占比分配） */
  expReward?: number
  /* 需求方 / 创建人 / 联系电话 / 合同价格（社区自建项目录入；需求立项由服务端照搬需求） */
  demanderId?: string
  demanderName?: string
  demanderIdentity?: { type: string; enterpriseId?: string; enterpriseName?: string; title?: string } | null
  creatorName?: string
  creatorId?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  contractPrice?: string
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

/* 合作企业聚合视图（由用户 external_enterprise 身份派生 + 档案补充，非独立入驻实体，无展示页） */
export interface ExternalEnterpriseMember {
  userId: string
  name: string
  title: string
  phone: string
  status: UserStatus
}

export interface ExternalEnterprise {
  /** 合作企业 ID（唯一标识，XE7001+） */
  id: string
  name: string
  industry: string
  /** 状态：active 正常 / disabled 已停用 */
  status: 'active' | 'disabled'
  size: string
  foundedAt: string
  description: string
  /** 登记日期：合作企业填表通过审核当天（YYYY-MM-DD） */
  registeredAt: string
  members: ExternalEnterpriseMember[]
}

/* ============================================================
   运营设施域 — 实体类型
   命名前缀：商品 G1001+ / 兑换订单 RO2001+ / 积分规则 R01+
   办公位 WS1001+ / 租约 LS2001+ / 空间 S1001+ / 空间预约 SR2001+
   文章 A1001+（投稿内容 SU1001+） / 栏目 CL2001+
   ============================================================ */

/* ---------- 积分商城 ---------- */

export type GoodsCategory = string
export type GoodsStatus = 'on' | 'off' | 'restock'

export interface MallGoods {
  id: string
  name: string
  coverUrl?: string
  /** 商品分类（goods_category 字典 code） */
  category: GoodsCategory
  /** 商品类型名称（后端按 goods_category 字典回填；编码已删除时回退为 category 原值） */
  categoryLabel?: string
  /** 兑换所需积分 */
  points: number
  /** 库存（虚拟/权益券可设较大值） */
  stock: number
  status: GoodsStatus
  description: string
  /** 累计兑换次数 */
  redeemedCount: number
  /** 券码有效期（天）：统一券码兑换，空值按 30 天兜底 */
  validDays?: number | null
  createdAt: string
  /** 自定义可见范围：身份与等级（空数组=不限） */
  visibilityIdentities?: IdentityType[]
  visibilityLevels?: string[]
  /** 自定义可下单范围：身份与等级（空数组=不限） */
  orderIdentities?: IdentityType[]
  orderLevels?: string[]
}

export type RedemptionOrderStatus = 'pending_use' | 'finished' | 'cancelled'

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
  /** 完成时间（finished 核销时存在） */
  finishedAt?: string
  note?: string
  /** 取消原因（cancelled 时存在，积分原路退回） */
  cancelReason?: string
  /** 券码 / 有效期 / 核销时间（统一券码兑换，下单即签发） */
  voucherCode: string
  voucherExpiresAt: string
  usedAt?: string
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
  /** 规则编码（触发项写死，后端按 code 关联经验值发放逻辑；如 activity_checkin） */
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
  /** 积分消费折扣：1 = 1 折 … 10 = 原价（支持一位小数，如 8.5 = 85 折；商城兑换 / 空间预约费用按等级折扣扣分） */
  pointsDiscount: number
  /** 该等级每日需求发布额度（-1 不限 / 0 禁止 / 正整数） */
  demandPublishLimit: number
  /** 该等级每日文章投稿额度 */
  articleSubmitLimit: number
}

export type LevelTierScope = 'community_individual' | 'community_enterprise'

export interface ScopedLevelTiers {
  scope: LevelTierScope
  tiers: LevelTier[]
}

export type PublishLimitScope =
  | 'personal_unverified'
  | 'personal_verified'
  | 'community_individual'
  | 'community_enterprise'

export interface PublishLimitRule {
  scope: PublishLimitScope
  /** Community scopes are configured per dynamic level; personal scopes omit level. */
  level?: number
  levelLabel?: string
  demandPublishLimit: number
  articleSubmitLimit: number
  eventEnrollLimit: number
  spaceReserveLimit: number
}

/* ---------- 办公位管理 ---------- */

export type WorkstationType = 'open' | 'office' | 'semi'
export type WorkstationStatus = 'idle' | 'assigned' | 'maintenance'

export interface Workstation {
  id: string
  /** 办公位编号，如 A-01、B-201 */
  seatNo: string
  /** 所在区域，如 A 区·开放办公位、B 区·独立办公室 */
  area: string
  type: WorkstationType
  /** 容量（独立办公室可多人，开放办公位 1） */
  capacity: number
  status: WorkstationStatus
  /** 当前分配企业（assigned 时存在） */
  enterpriseId?: string
  enterpriseName?: string
  /** 关联租约 ID（assigned 时存在） */
  leaseId?: string
  /** 默认月租（元）：新增租约选"月租"周期时自动累加进租金；非必填 */
  defaultMonthlyRent?: number
  /** 面积（㎡）：仅独立办公室有意义的非必填项 */
  areaSqm?: number
  /** 备注（自由文本，如维护原因、使用注意事项；非必填） */
  note?: string
}

export type LeaseBaseStatus = 'active' | 'terminated'

/** 租约编辑记录（编辑租约时必填原因，按时间追加） */
export interface LeaseEditRecord {
  at: string
  operator: string
  reason: string
}

/** 租约续期记录（「续期」动作专用，独立于编辑记录；保留原/新到期日与原/新租金便于追溯） */
export interface LeaseRenewRecord extends LeaseEditRecord {
  fromEndDate: string
  toEndDate: string
  fromRent: number
  toRent: number
}

/** 租赁方类型：enterprise=注册企业 / individual=注册个人用户 / custom=未注册（弹窗内自建条目） */
export type LeaseRenterType = 'enterprise' | 'individual' | 'custom'

/** 租赁周期：day=日租 / week=周租 / month=月租 / year=年租（缺省按月租处理） */
export type RentPeriod = 'day' | 'week' | 'month' | 'year'

/** 办公位区域（区域规划）：办公位以区域名称字符串关联（建议改为 areaId 外键） */
export interface WorkstationArea {
  id: string
  /** 区域名称，如 A 区 · 开放办公位（办公位.area 直接存该名称） */
  name: string
  /** 区域主类型：open=开放办公位 / office=独立办公室 / semi=半开放办公位 */
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
  /** 关联办公位 ID 列表 */
  workstationIds: string[]
  /** 办公位编号展示文本 */
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
  /** 备注（非必填，随新增/编辑维护） */
  note?: string | null
  /** 编辑记录（改租金/联系人等修改留痕，最新在后） */
  editRecords?: LeaseEditRecord[]
  /** 续期记录（「续期」动作专用，最新在后） */
  renewRecords?: LeaseRenewRecord[]
  /** 终止时间（terminated 时存在） */
  terminatedAt?: string
  /** 归档时间（非空表示已归档，详情页写操作隐藏） */
  deletedAt?: string | null
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
  /** 是否需要审核（仅 needReservation 开启时有效） */
  needApproval?: boolean
  /** 预约费用（积分/小时）；0 = 免费使用 */
  feePerHour: number
  /** 配备设备 */
  equipment: string[]
  status: SpaceStatus
  description: string
  /** 归档时间（非空表示已归档，详情页写操作隐藏） */
  deletedAt?: string | null
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

/** 文章状态：closed 为管理员下架；withdrawn 仅用于成员主动撤回投稿。 */
export type ArticleStatus = 'pending' | 'rejected' | 'pending_release' | 'scheduled' | 'published' | 'closed'

/** 文章来源：official=社区自行发布（资讯发布）/ submitted=用户投稿（投稿内容） */
export type ArticleChannel = 'official' | 'submitted'

export interface ArticleTakedown {
  id: number
  articleId: string
  source: 'manual'
  reason?: string | null
  takenDownAt: string
  takenDownBy: string
  restoredAt?: string | null
  restoredBy?: string | null
}

export interface Article {
  id: string
  title: string
  channel: ArticleChannel
  /** 所属栏目（多选） */
  columnIds: string[]
  columnNames: string[]
  /** 投稿作者 ID（资讯发布为社区官方，可空） */
  authorId?: string
  authorName: string
  /** 投稿身份快照（复用需求提交身份概念；资讯发布为 null） */
  authorIdentity: UserIdentity | null
  status: ArticleStatus
  /** 摘要 */
  summary: string
  /** 正文（富文本 HTML）；列表接口不下发（列表行 content 缺省），编辑/详情按 id 拉详情补齐 */
  content?: string
  tags: string[]
  commentsEnabled: boolean
  /** 定时发布时间（scheduled 时存在） */
  scheduledAt?: string
  /** 发布时间（published 时存在） */
  publishedAt?: string
  /** 阅读量 */
  views: number
  createdAt: string
  /** 驳回原因（rejected 时存在） */
  rejectedReason?: string
  takedowns?: ArticleTakedown[]
}

export type ColumnStatus = 'enabled' | 'disabled'

export interface ArticleColumn {
  id: string
  name: string
  description: string
  /** 排序权重（数字越小越靠前） */
  sort: number
  /** 是否开放用户投稿（关闭后成员端该栏目不可投稿） */
  submissionOpen: boolean
  /** 系统保留栏目（如「未指定」）：不可编辑/停用/删除，成员端不可见 */
  system?: boolean
  status: ColumnStatus
  /** 该栏目下文章数（后端列表接口聚合返回） */
  articleCount?: number
  createdAt: string
}

/* ============================================================
   系统管理域 — 实体类型（通知 / 操作日志 / 系统配置 / 数据字典）
   命名前缀：通知 N9001+ / 操作日志 AL1001+
   ============================================================ */

export interface AdminNotification {
  id: string
  /** 业务类型：approval 入驻/身份审核 | demand_review 需求审核 | reservation 空间预约 | article 文章审核 | lease 租约临期 | schedule 定时发布 */
  type: string
  title: string
  content: string
  at: string
  read: boolean
  /** 点击跳转路由 */
  link?: string
}

/** 后台操作涉及的模块（操作日志统计口径） */
export type AuditModule =
  | '社区成员'
  | '社区企业'
  | '合作企业'
  | '审核中心'
  | '需求管理'
  | '项目管理'
  | '活动管理'
  | '积分商城'
  | '空间管理'
  | '内容管理'
  | '素材库'
  | 'RBAC'
  | '系统管理'
  | '归档管理'
  | '认证'

export interface AuditLog {
  id: string
  operator: string
  module: AuditModule
  /** 动作，如 审核通过 / 发布 / 冻结账号 */
  action: string
  /** 操作对象（编号 · 名称） */
  target: string
  detail?: string
  at: string
  /** 客户端来源 IP（系统/历史记录无请求上下文时为空） */
  ip?: string
  /** 字段变更前快照（后端超限时截断为字符串预览） */
  before?: unknown
  /** 字段变更后快照（同上） */
  after?: unknown
  /** 快照因超过体量上限被截断（列表接口的体量保护标记） */
  snapshotTruncated?: boolean
}

export interface SystemConfig {
  siteName: string
  siteSlogan: string
  mobileUrl: string
  /** 客户端注册开关 */
  registrationOpen: boolean
  /** 积分商城开放开关 */
  mallOpen: boolean
  /** 需求广场开放开关 */
  demandOpen: boolean
  /** 空间预约开关 */
  reservationOpen: boolean
  /** 开启后未实名用户不能发布需求或报名活动 */
  realnameRequired: boolean
  /** 首页轮播图总开关：关闭后客户端首页不展示轮播区域 */
  homeCarouselOpen: boolean
  /** 租约临期提醒窗口（天；派生逻辑见 api/workstations EXPIRING_WINDOW_DAYS） */
  leaseExpireRemindDays: number
  /** 上传文件大小限制（MB，素材库/富文本图片上传共用） */
  uploadMaxSizeMb: number
  /** 密码过期强制改密（仅后台管理员账号，不影响客户端）：关闭（默认）= 密码永不过期 */
  passwordExpireEnabled: boolean
  /** 密码过期周期（天，1-3650）：仅 passwordExpireEnabled=true 时生效；超期登录后仅允许修改密码 */
  passwordExpireDays: number
  /** P1 实名核验：是否启用权威二要素核验 */
  realnameVerifyEnabled: boolean
  /** 核验供应商（'' 未选择 | aliyun | tencent） */
  realnameVerifyProvider: string
  /** 供应商展示名 */
  realnameVerifyProviderLabel: string
  /** 非机密参数（endpoint / region） */
  realnameVerifyConfig: Record<string, unknown>
  /** 凭据来源：inline=后台直接填写密钥（只写/脱敏）| env=登记环境变量名 */
  realnameVerifyCredentialMode: 'inline' | 'env'
  /** 凭据环境变量名映射（仅 env 模式回传；inline 模式恒为空） */
  realnameVerifyCredentialEnv: Record<string, string>
  /** 凭据脱敏视图：inline 已配置 → 掩码；env → 变量名 */
  realnameVerifyCredentialMasked: Record<string, string>
  /** 凭据环境变量是否齐备 */
  realnameVerifyCredentialConfigured: boolean
  /** 缺失的环境变量名 */
  realnameVerifyMissingCredentials: string[]
  /** 联通性测试是否通过（配置变更即重置，需重新测试） */
  realnameVerifyTestOk: boolean
  realnameVerifyTestedAt: string | null
  /** 派生模式：verified=客户端显示「实名认证」；registration=「身份信息登记」 */
  realnameMode: 'verified' | 'registration'
  /** MinIO 对象存储开关（关闭时上传写入本地磁盘 UPLOAD_DIR） */
  minioEnabled: boolean
  /** MinIO 服务地址（不含协议与端口，如 127.0.0.1） */
  minioEndpoint: string
  /** MinIO 服务端口（1-65535） */
  minioPort: number
  /** 是否使用 HTTPS 访问 MinIO */
  minioUseSsl: boolean
  /** MinIO AccessKey（访问标识，供运维核对；密钥本体不回传） */
  minioAccessKey: string
  /** SecretKey 是否已配置（服务端不回传原文；保存时留空表示保持原值） */
  minioSecretKeyConfigured: boolean
  /** SecretKey 脱敏展示值（已配置为固定掩码，否则空串） */
  minioSecretKeyMasked: string
  /** 凭据来源：环境变量优先，其次数据库 */
  minioCredentialSource: 'env' | 'database' | 'none'
  minioBucket: string
  updatedAt: string
  updatedBy: string
}

/* ---------- 消息中心（P0）：渠道配置 / 模板中心 / 发送记录 ---------- */

export type MessageChannelKind = 'sms' | 'email' | 'inapp'

export interface MessageProviderConfigField {
  key: string
  label: string
  required?: boolean
  hint?: string
}

export interface MessageProviderMeta {
  provider: string
  label: string
  supports: MessageChannelKind[]
  /** 需在环境变量中提供的凭据变量名（仅校验是否齐备，不回传值） */
  credentialKeys: string[]
  /** 凭据项的补充说明（如 SMTP 认证用户名/授权码提示） */
  credentialConfigFields?: MessageProviderConfigField[]
  configFields: MessageProviderConfigField[]
}

export interface MessageChannel {
  id: string
  kind: MessageChannelKind
  provider: string
  providerLabel: string
  name: string
  enabled: boolean
  config: Record<string, unknown>
  /** 凭据来源：inline=后台直接填写密钥（只写/脱敏）| env=登记环境变量名 */
  credentialMode: 'inline' | 'env'
  /** env 模式下的变量名映射；inline 模式恒为空（不回传密钥） */
  credentialEnv: Record<string, string>
  /** 凭据脱敏视图：inline 已配置 → 掩码；env → 变量名 */
  credentialMasked: Record<string, string>
  credentialConfigured: boolean
  missingCredentials: string[]
  dailyLimit: number
  remark: string | null
  updatedAt: string
  updatedBy: string
}

export interface MessageChannelPayload {
  kind: MessageChannelKind
  provider: string
  name: string
  enabled: boolean
  config: Record<string, unknown>
  /** 凭据来源：inline 后台直接填写（只写，留空保持原值）| env 登记环境变量名 */
  credentialMode?: 'inline' | 'env'
  credentialEnv: Record<string, string>
  dailyLimit: number
  remark?: string
}

export interface MessageChannelCatalog {
  kinds: MessageChannelKind[]
  providers: MessageProviderMeta[]
}

export type MessageTemplateCategory = 'security' | 'marketing'
export type MessageTemplateStatus = 'draft' | 'published'
export type MessageTemplateVersionStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'archived'

export interface MessageTemplateVersion {
  id: string
  version: number
  subject: string | null
  body: string
  status: MessageTemplateVersionStatus
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNote: string | null
  createdBy: string
  createdAt: string
}

export interface MessageTemplate {
  id: string
  code: string
  name: string
  kind: MessageChannelKind
  category: MessageTemplateCategory
  status: MessageTemplateStatus
  currentVersion: number
  variables: string[]
  updatedAt: string
  updatedBy: string
  publishedSubject: string | null
  publishedBody: string | null
}

export interface MessageTemplateDetail {
  id: string
  code: string
  name: string
  kind: MessageChannelKind
  category: MessageTemplateCategory
  status: MessageTemplateStatus
  currentVersion: number
  variables: string[]
  updatedAt: string
  updatedBy: string
  versions: MessageTemplateVersion[]
}

export interface MessageTemplatePayload {
  code: string
  name: string
  kind: MessageChannelKind
  category: MessageTemplateCategory
  variables: string[]
  subject?: string
  body: string
}

export type OutboxStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'dead' | 'skipped'

export interface OutboxMessage {
  id: string
  templateCode: string
  channelKind: MessageChannelKind
  recipient: string
  userId: string | null
  status: OutboxStatus
  priority: number
  attempts: number
  maxAttempts: number
  security: boolean
  lastError: string | null
  providerMessageId: string | null
  nextAttemptAt: string | null
  createdAt: string
  sentAt: string | null
  variables: Record<string, unknown> | null
}

export interface OutboxDeliveryLog {
  id: string
  attempt: number
  status: string
  provider: string
  providerMessageId: string | null
  error: string | null
  costMs: number
  at: string
}

export interface OutboxListResult {
  list: OutboxMessage[]
  total: number
  stats: Record<string, number>
}

export type DictType = 'demand_category' | 'industry' | 'event_type' | 'goods_category'
export interface DictEntry {
  code: string
  label: string
  sort: number
  status: 'enabled' | 'disabled'
  /* 商品类别（type=goods_category）专属：类别级可见/可下单范围门槛（空数组 = 不限）；其余字典类型恒为空数组 */
  visibilityIdentities: string[]
  visibilityLevels: string[]
  orderIdentities: string[]
  orderLevels: string[]
}

/* ---------- 首页轮播图（内容管理） ---------- */

export interface HomeBanner {
  id: string
  title: string
  subtitle: string
  /** 图片地址（可空；为空时客户端使用品牌渐变文字卡展示） */
  imageUrl: string | null
  /** 跳转的移动端站内路径，如 /events */
  link: string | null
  /** 排序权重（升序展示） */
  sort: number
  /** 单条是否展示 */
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/* ---------- 首页公告（内容管理） ---------- */

export type AnnouncementStatus = 'published' | 'withdrawn'

export interface Announcement {
  id: string
  title: string
  content: string
  /** 置顶：全局仅能开启一条（首页公告单例），展示在客户端首页搜索栏下方 */
  pinned: boolean
  status: AnnouncementStatus
  /** 发布时间（新增即发布 / 重新发布时写入） */
  publishedAt: string
  createdAt: string
  updatedAt?: string
  expireAt?: string
  link?: string
}
