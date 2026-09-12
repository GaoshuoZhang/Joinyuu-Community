import type {
  AppConfig,
  Article,
  ArticleColumn,
  CommunityEvent,
  CommunityPolicy,
  Demand,
  Goods,
  HomeArticleCard,
  HomeBanner,
  HomeDemandCard,
  HomeEventCard,
  MyApplication,
  MyEnrollmentItem,
  MyOrder,
  MyProject,
  MyResponseItem,
  MySubmittedArticle,
  PointsRecord,
  Space,
  SpaceReservation,
  TalentMember,
  UserIdentity,
  UserNotice,
} from '@/types'

/* [MOCK-ONLY] 内存数据库：实体从 apps/api/prisma/seed-data 派生（同字段形态、同 ID 体系），
 * 运行时可变状态（报名/下单/预约/已读）内存演进，刷新重置。接入 M2 真实后端后整目录退役。 */

export const appConfig: AppConfig = {
  siteName: '聚屿社区',
  siteSlogan: '让每一座创业孤岛，在这里连成群岛。',
  registrationOpen: true,
  mallOpen: true,
  demandOpen: true,
  reservationOpen: true,
}

export const dicts: Record<string, { code: string; label: string }[]> = {
  demand_category: [
    { code: 'DC001', label: '供应链' },
    { code: 'DC002', label: '设计' },
    { code: 'DC003', label: '法务财务' },
    { code: 'DC004', label: '技术开发' },
    { code: 'DC005', label: '市场' },
    { code: 'DC006', label: '人力资源' },
  ],
  event_type: [
    { code: 'ET001', label: '沙龙' },
    { code: 'ET002', label: '培训' },
    { code: 'ET003', label: '路演' },
    { code: 'ET004', label: '社交' },
  ],
  article_column: [
    { code: 'CL001', label: '社区动态' },
    { code: 'CL002', label: '深度报道' },
    { code: 'CL003', label: '岛民故事' },
    { code: 'CL004', label: '活动回顾' },
  ],
}

/* ---------- 演示账号矩阵（plan §4.2） ---------- */

export interface MockAccount {
  uid: string
  phone: string
  password: string
  nickname: string
  status: 'active' | 'frozen'
  points: number
  identities: UserIdentity[]
  registeredAt: string
}

export const accounts: MockAccount[] = [
  {
    uid: 'U1001',
    phone: '13800000001',
    password: 'client123',
    nickname: '陈屿',
    status: 'active',
    points: 2710,
    identities: [
      { type: 'individual' },
      { type: 'community_individual', level: 4, levelName: '群岛共建者', experience: 2410 },
    ],
    registeredAt: '2025-03-12 09:30',
  },
  {
    uid: 'U1004',
    phone: '13800000002',
    password: 'client123',
    nickname: '苏明远',
    status: 'active',
    points: 1950,
    identities: [
      { type: 'individual' },
      { type: 'community_individual', level: 3, levelName: '岛屿开拓者', experience: 1320 },
      { type: 'community_enterprise', enterpriseId: 'E2001', enterpriseName: '芯启半导体', enterpriseRole: '创始人' },
    ],
    registeredAt: '2025-03-15 14:20',
  },
  {
    uid: 'U1006',
    phone: '13800000003',
    password: 'client123',
    nickname: '林晚',
    status: 'active',
    points: 860,
    identities: [
      { type: 'individual' },
      { type: 'community_enterprise', enterpriseId: 'E2004', enterpriseName: '木白设计工作室', enterpriseRole: '总经理' },
    ],
    registeredAt: '2025-07-23 10:05',
  },
  {
    uid: 'U1014',
    phone: '13800000004',
    password: 'client123',
    nickname: '周慕深',
    status: 'active',
    points: 1560,
    identities: [
      { type: 'individual' },
      { type: 'external_enterprise', organizationName: '云径数据' },
    ],
    registeredAt: '2025-05-09 16:40',
  },
  {
    uid: 'U1015',
    phone: '13800000005',
    password: 'client123',
    nickname: '新居民',
    status: 'active',
    points: 0,
    identities: [{ type: 'individual' }],
    registeredAt: '2026-09-12 09:00',
  },
  {
    uid: 'U1009',
    phone: '13800000009',
    password: 'client123',
    nickname: '被冻结用户',
    status: 'frozen',
    points: 0,
    identities: [{ type: 'individual' }],
    registeredAt: '2025-08-01 11:00',
  },
]

export function dictLabel(type: string, code: string): string {
  return dicts[type]?.find((d) => d.code === code)?.label ?? code
}

export function accountByUid(uid: string): MockAccount | undefined {
  return accounts.find((a) => a.uid === uid)
}

/* ---------- 需求广场 ---------- */

export const demands: Demand[] = [
  {
    id: 'D4001', title: '社区品牌 IP 形象共创', description: '为聚屿社区设计一套品牌 IP 形象与基础VI，需提供 3 个方向的概念稿与最终源文件。',
    categoryLabel: '设计', status: 'published', publisherUid: 'U1001', publisherName: '陈屿', publisherIdentity: 'community_individual',
    deadline: '2026-09-30', responseCount: 3, visibilityIdentities: [], visibilityLevels: [], createdAt: '2026-09-02 10:00',
  },
  {
    id: 'D4002', title: '社区小程序前端开发合作', description: '与社区联合开发成员端小程序，涵盖活动报名、需求广场与积分商城入口，三家社区企业联合共研。',
    categoryLabel: '技术开发', status: 'published', publisherUid: 'U1014', publisherName: '云径数据', publisherIdentity: 'external_enterprise',
    deadline: '2026-10-15', responseCount: 2, visibilityIdentities: ['community_enterprise', 'external_enterprise'], visibilityLevels: [], createdAt: '2026-09-06 17:12',
  },
  {
    id: 'D4003', title: '低价海报加急代做', description: '加急海报，价格好商量。', categoryLabel: '设计', status: 'rejected',
    publisherUid: 'U1001', publisherName: '陈屿', publisherIdentity: 'community_individual', deadline: '2026-09-20', responseCount: 0,
    visibilityIdentities: [], visibilityLevels: [], createdAt: '2026-09-03 09:00', rejectReason: '与社区定位不符，请补充完整需求说明与合理预算',
  },
  {
    id: 'D4004', title: '共享会议室隔音改造咨询', description: '会议室 A 隔音效果不佳，寻求改造方案与报价。', categoryLabel: '供应链',
    status: 'published', publisherUid: 'U1006', publisherName: '木白设计工作室', publisherIdentity: 'community_enterprise', deadline: '2026-10-01',
    responseCount: 2, visibilityIdentities: [], visibilityLevels: [], createdAt: '2026-09-05 09:00',
  },
  {
    id: 'D4005', title: '季度财税合规咨询', description: 'Q4 财税合规体检与政策解读，需要上门服务。', categoryLabel: '法务财务', status: 'published',
    publisherUid: 'U1004', publisherName: '苏明远', publisherIdentity: 'community_enterprise', deadline: '2026-10-08', responseCount: 1,
    visibilityIdentities: [], visibilityLevels: [3, 4, 5], createdAt: '2026-09-07 14:00',
  },
  {
    id: 'D4012', title: '社区公众号栏目代运营', description: '公众号每周两更，需选题、撰写与排版。', categoryLabel: '市场', status: 'pending',
    publisherUid: 'U1001', publisherName: '陈屿', publisherIdentity: 'community_individual', deadline: '2026-11-01', responseCount: 0,
    visibilityIdentities: [], visibilityLevels: [], createdAt: '2026-09-10 11:00',
  },
]

/* 我的响应记录（按 uid） */
export const responsesByUid: Record<string, MyResponseItem[]> = {
  U1001: [
    { id: 'DR9001', demandId: 'D4004', demandTitle: '共享会议室隔音改造咨询', note: '可提供两家供应商比价方案。', at: '2026-09-06 10:00' },
    { id: 'DR9002', demandId: 'D4001', demandTitle: '社区品牌 IP 形象共创', note: '参与概念稿方向 B。', at: '2026-09-03 15:00' },
  ],
  U1014: [
    { id: 'DR9101', demandId: 'D4001', demandTitle: '社区品牌 IP 形象共创', note: '云径设计组可参与。', at: '2026-09-04 09:00' },
  ],
}

/* ---------- 活动中心（EV6001 为签到演示主场：签到窗全天 [MOCK-ONLY]） ---------- */

export const events: CommunityEvent[] = [
  {
    id: 'EV6001', title: '第 12 期创业夜话 · AI 应用的落地时刻', typeLabel: '沙龙',
    startTime: '2026-09-12 19:00', endTime: '2026-09-12 21:00', location: '岛屿咖啡区',
    capacity: 60, approvedCount: 8, requireReview: false, enrollmentDeadline: '2026-09-12 18:00', status: 'published',
    visibilityIdentities: [], visibilityLevels: [], enrollmentIdentities: [], enrollmentLevels: [],
    description: '两位一线 AI 创业者聊落地：场景选择、成本结构与团队配置。',
    venueLat: 31.2304, venueLng: 121.4737, checkinRadiusM: 200, checkinOpenMin: '00:00', checkinCloseMin: '23:59',
  },
  {
    id: 'EV6005', title: '设计思维工作坊：从用户访谈到原型', typeLabel: '培训',
    startTime: '2026-09-18 14:00', endTime: '2026-09-18 17:00', location: '共享会议室 A',
    capacity: 24, approvedCount: 2, requireReview: true, enrollmentDeadline: '2026-09-17 12:00', status: 'published',
    visibilityIdentities: [], visibilityLevels: [], enrollmentIdentities: [], enrollmentLevels: [],
    description: '两小时工作坊，带你完整走一遍用户访谈到低保真原型的流程。',
    venueLat: 31.2318, venueLng: 121.4751, checkinRadiusM: 200, checkinOpenMin: '13:30', checkinCloseMin: '17:00',
  },
  {
    id: 'EV6003', title: '聚屿社区年度路演日 2026', typeLabel: '路演',
    startTime: '2026-09-26 13:30', endTime: '2026-09-26 18:00', location: '聚屿路演厅',
    capacity: 120, approvedCount: 2, requireReview: true, enrollmentDeadline: '2026-09-24 12:00', status: 'published',
    visibilityIdentities: [], visibilityLevels: [], enrollmentIdentities: [], enrollmentLevels: [],
    description: '十个社区项目登台路演，投资人现场点评。', venueLat: 31.2325, venueLng: 121.4762,
    checkinRadiusM: 200, checkinOpenMin: '13:00', checkinCloseMin: '18:00',
  },
  {
    id: 'EV6009', title: 'Q4 社区企业闭门交流会', typeLabel: '社交',
    startTime: '2026-10-15 18:30', endTime: '2026-10-15 21:00', location: '聚屿路演厅',
    capacity: 50, approvedCount: 0, requireReview: false, enrollmentDeadline: '2026-10-14 18:00', status: 'published',
    visibilityIdentities: ['community_enterprise', 'external_enterprise'], visibilityLevels: [], enrollmentIdentities: ['community_enterprise', 'external_enterprise'], enrollmentLevels: [],
    description: '仅面向社区企业与合作伙伴的闭门交流。', venueLat: 31.2325, venueLng: 121.4762,
    checkinRadiusM: 200, checkinOpenMin: '18:00', checkinCloseMin: '21:00',
  },
  {
    id: 'EV6008', title: '创业心理舒缓小组（第 3 期）', typeLabel: '沙龙',
    startTime: '2026-09-08 19:00', endTime: '2026-09-08 21:00', location: '岛屿咖啡区',
    capacity: 20, approvedCount: 12, requireReview: false, enrollmentDeadline: '2026-09-07 18:00', status: 'ended',
    visibilityIdentities: [], visibilityLevels: [], enrollmentIdentities: [], enrollmentLevels: [],
    description: '已结束活动（用于签到失败态演示）。', venueLat: 31.2304, venueLng: 121.4737,
    checkinRadiusM: 200, checkinOpenMin: '18:30', checkinCloseMin: '21:00',
  },
]

/* 我的报名（按 uid，含签到状态 [MOCK-ONLY]） */
export const enrollmentsByUid: Record<string, MyEnrollmentItem[]> = {
  U1001: [
    { id: 'EE7001', eventId: 'EV6005', eventTitle: '设计思维工作坊：从用户访谈到原型', startTime: '2026-09-18 14:00', location: '共享会议室 A', status: 'pending', checkedIn: false },
    { id: 'EE7002', eventId: 'EV6001', eventTitle: '第 12 期创业夜话 · AI 应用的落地时刻', startTime: '2026-09-12 19:00', location: '岛屿咖啡区', status: 'approved', checkedIn: false },
  ],
  U1004: [
    { id: 'EE7101', eventId: 'EV6001', eventTitle: '第 12 期创业夜话 · AI 应用的落地时刻', startTime: '2026-09-12 19:00', location: '岛屿咖啡区', status: 'approved', checkedIn: true },
  ],
}

/* 我的报名自增 ID */
let enrollmentSeq = 7200

/* ---------- 积分商城 ---------- */

export const goods: Goods[] = [
  { id: 'G1001', name: '会议室优先预约卡', pointsCost: 500, stock: 12, description: '未来 7 天内任意会议室时段优先预约权一张。' },
  { id: 'G1002', name: '精品咖啡券（单杯）', pointsCost: 150, stock: 30, description: '岛屿咖啡区任意现制咖啡一杯。' },
  { id: 'G1003', name: '聚屿周边帆布袋', pointsCost: 300, stock: 8, description: '社区联名帆布袋，路演日同款。' },
  { id: 'G1004', name: '独立办公位体验日', pointsCost: 800, stock: 3, description: '独立办公室体验一日（工作日有效，需提前预约）。' },
  { id: 'G1005', name: '打印机 A4 纸包月', pointsCost: 220, stock: 0, description: '公共打印机 A4 纸包月额度（补货中，暂不展示）。' },
  { id: 'G1006', name: '已下架 · 周年纪念徽章', pointsCost: 100, stock: 5, description: '已下架商品（不展示）。', },
]
export const goodsOffIds = ['G1006']
export const goodsHiddenZeroStock = true

export const ordersByUid: Record<string, MyOrder[]> = {
  U1001: [
    { id: 'RO2001', goodsId: 'G1002', goodsName: '精品咖啡券（单杯）', pointsCost: 150, status: 'shipped', createdAt: '2026-08-28 12:00', shippedAt: '2026-08-30 10:00' },
    { id: 'RO2006', goodsId: 'G1001', goodsName: '会议室优先预约卡', pointsCost: 500, status: 'pending_shipment', createdAt: '2026-09-08 15:00' },
  ],
  U1004: [
    { id: 'RO2010', goodsId: 'G1003', goodsName: '聚屿周边帆布袋', pointsCost: 300, status: 'completed', createdAt: '2026-08-15 09:00', shippedAt: '2026-08-17 09:00' },
  ],
}

/* ---------- 空间预约 ---------- */

export const spaces: Space[] = [
  { id: 'S1001', name: '岛屿咖啡区', location: '一楼东侧', capacity: 40, equipment: ['咖啡机', '白板'], needApproval: false, openTime: '08:00', closeTime: '22:00' },
  { id: 'S1002', name: '共享会议室 A', location: '二楼 201', capacity: 12, equipment: ['投影', '视频会议', '白板'], needApproval: true, openTime: '09:00', closeTime: '21:00' },
  { id: 'S1003', name: '聚屿路演厅', location: '三楼 301', capacity: 120, equipment: ['舞台灯光', '音响', '直播机位'], needApproval: true, openTime: '09:00', closeTime: '21:00' },
  { id: 'S1004', name: '共享工位区', location: '二楼 203', capacity: 30, equipment: ['升降桌', '显示器'], needApproval: false, openTime: '08:00', closeTime: '22:00' },
]

export const reservationsByUid: Record<string, SpaceReservation[]> = {
  U1001: [
    { id: 'SR5001', spaceId: 'S1002', spaceName: '共享会议室 A', date: '2026-09-20', start: '14:00', end: '16:00', status: 'approved', createdAt: '2026-09-10 10:00' },
  ],
  U1004: [
    { id: 'SR5101', spaceId: 'S1002', spaceName: '共享会议室 A', date: '2026-09-21', start: '10:00', end: '12:00', status: 'pending', createdAt: '2026-09-11 09:00' },
  ],
}

/** 某空间某日的已占用时段（确定性伪随机 + 已通过预约） */
export function occupiedSlots(spaceId: string, date: string): { start: string; end: string }[] {
  const seed = [...(spaceId + date)].reduce((s, c) => s + c.charCodeAt(0), 0)
  const slots: { start: string; end: string }[] = []
  for (let h = 9; h <= 20; h++) {
    if ((seed + h) % 4 === 0) slots.push({ start: `${String(h).padStart(2, '0')}:00`, end: `${String(h + 1).padStart(2, '0')}:00` })
  }
  return slots
}

/* ---------- 内容与投稿 ---------- */

export const columns: ArticleColumn[] = [
  { code: 'CL001', label: '社区动态' },
  { code: 'CL002', label: '深度报道' },
  { code: 'CL003', label: '岛民故事' },
  { code: 'CL004', label: '活动回顾' },
]

export const articles: Article[] = [
  { id: 'A1001', title: '入驻指南：三步加入聚屿社区', columnLabel: '社区动态', authorName: '社区运营组', publishedAt: '2026-09-05 10:00', views: 321, summary: '从注册到身份绑定的完整流程。', content: '第一步，注册账号；第二步，提交入驻申请；第三步，等待审核通过与身份授予……' },
  { id: 'A1002', title: '路演日观察：社区项目的三种成长路径', columnLabel: '深度报道', authorName: '社区运营组', publishedAt: '2026-09-01 15:00', views: 208, summary: '我们在路演日现场记录了十个项目。', content: '技术型、服务型与社群型项目在社区里的成长路径各不相同……' },
  { id: 'SU1001', title: '我在岛上的一年：从 lone wolf 到共建者', columnLabel: '岛民故事', authorName: '白若溪', publishedAt: '2026-08-20 09:00', views: 156, summary: '一位独立设计师的社区一年。', content: '一年前我拖着行李箱走进岛屿咖啡区……' },
  { id: 'A1003', title: '9 月空间使用提示：会议室预约新规', columnLabel: '社区动态', authorName: '社区运营组', publishedAt: '2026-09-03 09:30', views: 98, summary: '会议室需提前一个工作日申请。', content: '自本月起，共享会议室 A 需提前一个工作日提交预约申请……' },
  { id: 'A1004', title: '活动回顾：第 11 期创业夜话金句集', columnLabel: '活动回顾', authorName: '社区运营组', publishedAt: '2026-08-18 10:00', views: 132, summary: '十二个金句与三次全场掌声。', content: '「先找到问题，再谈技术选型」……' },
]

export const myArticlesByUid: Record<string, MySubmittedArticle[]> = {
  U1001: [
    { id: 'SU1002', title: '独立开发者接单指南', columnLabel: '岛民故事', status: 'rejected', submittedAt: '2026-09-04 10:00', rejectReason: '缺少社区案例引用，请补充你在社区的真实经历' },
    { id: 'SU1003', title: '群岛夜话侧记：一场关于定价的对谈', columnLabel: '深度报道', status: 'pending', submittedAt: '2026-09-11 16:00' },
  ],
}

/* ---------- 企业展示页 ---------- */

export interface EnterpriseRecord {
  id: string
  name: string
  industry: string
  size: string
  description: string
  showcaseStatus: 'published' | 'none'
  members: string[]
}

export const enterprises: EnterpriseRecord[] = [
  { id: 'E2001', name: '芯启半导体', industry: '集成电路', size: '50-99 人', description: '车规级芯片设计与验证服务商，社区首批入驻企业。', showcaseStatus: 'published', members: ['苏明远'] },
  { id: 'E2004', name: '木白设计工作室', industry: '设计', size: '5-9 人', description: '品牌与空间设计工作室，社区多个公共空间的设计方。', showcaseStatus: 'published', members: ['林晚'] },
  { id: 'E2002', name: '云径数据', industry: '数据服务', size: '20-49 人', description: '合作企业，数据中台与小程序联合研发伙伴。', showcaseStatus: 'none', members: ['周慕深'] },
]

/* ---------- 项目协作（只读） ---------- */

export const projectsByUid: Record<string, MyProject[]> = {
  U1001: [
    { id: 'P5001', name: '社区品牌 IP 形象共创', role: '本人承接', progress: 60, milestones: [
      { id: 'MS101', title: '概念稿（3 方向）', done: true },
      { id: 'MS102', title: '深化设计', done: true },
      { id: 'MS103', title: '最终交付与源文件', done: false },
    ] },
    { id: 'P5008', name: '社区品牌联名周边', role: '企业承接', enterpriseName: '木白设计工作室', progress: 30, milestones: [
      { id: 'MS201', title: '联名方案确认', done: true },
      { id: 'MS202', title: '打样', done: false },
      { id: 'MS203', title: '量产上架', done: false },
    ] },
  ],
  U1006: [
    { id: 'P5008', name: '社区品牌联名周边', role: '企业承接', enterpriseName: '木白设计工作室', progress: 30, milestones: [
      { id: 'MS201', title: '联名方案确认', done: true },
      { id: 'MS202', title: '打样', done: false },
    ] },
  ],
}

/* ---------- 我的申请 ---------- */

export const applicationsByUid: Record<string, MyApplication[]> = {
  U1001: [
    { id: 'AP3006', type: 'identity', targetName: '社区个体身份绑定', status: 'approved', submittedAt: '2026-07-01 09:00', reviewedAt: '2026-07-02 10:00' },
    { id: 'AP3001', type: 'individual', targetName: '社区个体入驻', status: 'approved', submittedAt: '2026-06-28 15:00', reviewedAt: '2026-06-30 11:00' },
  ],
  U1014: [
    { id: 'AP3101', type: 'cooperation', targetName: '云径数据 · 战略合作', status: 'pending', submittedAt: '2026-09-08 10:12' },
  ],
  U1015: [],
}

/* ---------- 经验值流水（缺口 §7-7） ---------- */

export const experienceByUid: Record<string, { records: { id: string; delta: number; balance: number; reason: string; at: string }[]; identityLabel: string; level: number; levelName: string; nextLevelExp: number }> = {
  U1001: {
    identityLabel: '社区个体', level: 4, levelName: '群岛共建者', nextLevelExp: 3000,
    records: [
      { id: 'EX4031', delta: +100, balance: 2410, reason: '项目里程碑：原型验收', at: '2026-09-02 11:00' },
      { id: 'EX4018', delta: +30, balance: 2310, reason: '投稿采纳', at: '2026-08-20 12:00' },
      { id: 'EX4001', delta: +50, balance: 2280, reason: '首次绑定社区个体身份', at: '2026-07-02 10:00' },
    ],
  },
  U1004: {
    identityLabel: '社区个体', level: 3, levelName: '岛屿开拓者', nextLevelExp: 1800,
    records: [{ id: 'EX4101', delta: +50, balance: 1320, reason: '首次绑定社区个体身份', at: '2026-06-30 10:00' }],
  },
}

/* ---------- 积分流水（seed 口径派生） ---------- */

export const pointsRecordsByUid: Record<string, PointsRecord[]> = {
  U1001: [
    { id: 'PT1031', delta: +200, balance: 2710, reason: '活动嘉宾感谢', source: '管理员调整', at: '2026-09-06 09:00' },
    { id: 'PT1022', delta: +100, balance: 2510, reason: '里程碑完成：原型验收', source: '项目立项', at: '2026-09-02 11:00' },
    { id: 'PT1010', delta: -180, balance: 2410, reason: '积分商城兑换礼品', source: '商城兑换', at: '2026-08-28 12:00' },
    { id: 'PT1005', delta: +200, balance: 2590, reason: '承接需求立项', source: '需求广场', at: '2026-08-20 16:00' },
    { id: 'PT0996', delta: +20, balance: 2390, reason: '响应社区需求', source: '需求广场', at: '2026-08-18 10:30' },
    { id: 'PT0988', delta: +10, balance: 2370, reason: '活动签到：第 11 期创业夜话', source: '活动签到', at: '2026-08-15 19:10' },
    { id: 'PT0971', delta: +5, balance: 2360, reason: '报名审核通过：设计思维工作坊', source: '活动报名', at: '2026-08-10 09:00' },
    { id: 'PT0902', delta: +50, balance: 2355, reason: '首次绑定社区个体身份', source: '身份授予', at: '2026-07-01 10:00' },
  ],
  U1004: [
    { id: 'PT2010', delta: +15, balance: 1950, reason: '发布需求', source: '需求广场', at: '2026-09-04 10:00' },
    { id: 'PT1980', delta: +50, balance: 1935, reason: '首次绑定社区个体身份', source: '身份授予', at: '2026-06-12 10:00' },
  ],
  U1006: [
    { id: 'PT3010', delta: +30, balance: 860, reason: '投稿采纳：岛民故事', source: '内容中心', at: '2026-08-20 12:00' },
  ],
  U1014: [
    { id: 'PT4010', delta: +20, balance: 1560, reason: '响应社区需求', source: '需求广场', at: '2026-09-05 14:00' },
  ],
  U1015: [],
  U1009: [],
}

/* ---------- 站内信 [MOCK-ONLY]（缺口 §7-1） ---------- */

export const noticesByUid: Record<string, UserNotice[]> = {
  U1001: [
    { id: 'UN3001', type: 'points', title: '积分到账 +200', content: '活动嘉宾感谢，当前积分 2710。', at: '2026-09-06 09:00', read: false, link: '/me/points' },
    { id: 'UN3002', type: 'enroll_result', title: '报名审核通过', content: '你报名的「设计思维工作坊：从用户访谈到原型」已通过审核。', at: '2026-09-05 16:00', read: false, link: '/me/enrollments' },
    { id: 'UN3003', type: 'system', title: '欢迎来到聚屿社区', content: '完善资料并绑定社区个体身份，开启你的群岛生活。', at: '2026-09-01 09:00', read: true, link: '/me' },
    { id: 'UN3004', type: 'order', title: '兑换订单已发货', content: '「精品咖啡券（单杯）」已寄出，请注意查收。', at: '2026-08-30 10:00', read: true, link: '/me/orders' },
  ],
  U1004: [
    { id: 'UN3101', type: 'audit_result', title: '需求审核通过', content: '你发布的需求「季度财税合规咨询」已通过审核并上架需求广场。', at: '2026-09-05 10:00', read: false, link: '/me/demands' },
  ],
  U1015: [],
}

/** 未读数（供 devtools 与壳角标） */
export function unreadCount(uid: string): number {
  return (noticesByUid[uid] ?? []).filter((n) => !n.read).length
}

/** [MOCK-ONLY] 通知触发点（与未来后端触发点一一对应） */
export function pushNotice(uid: string, notice: Omit<UserNotice, 'id' | 'read' | 'at'>): void {
  const at = new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 16)
  ;(noticesByUid[uid] ??= []).unshift({ id: `UN${Date.now()}${Math.floor(Math.random() * 90 + 10)}`, at, read: false, ...notice })
}

/** [MOCK-ONLY] 积分/经验入账（写流水 + 更新余额，对应后端 PointsEngineService） */
export function grantPoints(uid: string, delta: number, reason: string, source: string): void {
  const account = accountByUid(uid)
  if (!account) return
  const records = (pointsRecordsByUid[uid] ??= [])
  const balance = (records[0]?.balance ?? account.points) + delta
  const at = new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 16)
  records.unshift({ id: `PT${Date.now()}`, delta, balance, reason, source, at })
  account.points = balance
  pushNotice(uid, { type: 'points', title: `积分${delta >= 0 ? '到账' : '变动'} ${delta >= 0 ? '+' : ''}${delta}`, content: `${reason}，当前积分 ${balance}。`, link: '/me/points' })
}

/* ---------- 首页聚合卡片 ---------- */

export const homeBanners: HomeBanner[] = [
  { id: 'BN1', title: '第二批社区企业招募启动', subtitle: '申请入驻，共享工位与创业资源' },
  { id: 'BN2', title: '年度路演日报名中', subtitle: '9 月 26 日，聚屿路演厅' },
  { id: 'BN3', title: '积分商城上新', subtitle: '会议室优先预约卡等你兑换' },
]

export const homeEvents: HomeEventCard[] = [
  { id: 'EV6001', title: '第 12 期创业夜话 · AI 应用的落地时刻', type: '沙龙', startTime: '2026-09-12 19:00', location: '岛屿咖啡区', enrolled: 8, capacity: 60 },
  { id: 'EV6005', title: '设计思维工作坊：从用户访谈到原型', type: '培训', startTime: '2026-09-18 14:00', location: '共享会议室 A', enrolled: 2, capacity: 24 },
  { id: 'EV6003', title: '聚屿社区年度路演日 2026', type: '路演', startTime: '2026-09-26 13:30', location: '聚屿路演厅', enrolled: 2, capacity: 120 },
]

export const homeDemands: HomeDemandCard[] = [
  { id: 'D4001', title: '社区品牌 IP 形象共创', categoryLabel: '设计', publisherName: '陈屿', publisherIdentity: 'community_individual', deadline: '2026-09-30', responseCount: 3 },
  { id: 'D4004', title: '共享会议室隔音改造咨询', categoryLabel: '供应链', publisherName: '木白设计工作室', publisherIdentity: 'community_enterprise', deadline: '2026-10-01', responseCount: 2 },
  { id: 'D4005', title: '季度财税合规咨询', categoryLabel: '法务财务', publisherName: '苏明远', publisherIdentity: 'community_enterprise', deadline: '2026-10-08', responseCount: 1 },
]

export const homeArticles: HomeArticleCard[] = [
  { id: 'A1001', title: '入驻指南：三步加入聚屿社区', columnLabel: '社区动态', publishedAt: '2026-09-05 10:00', views: 321 },
  { id: 'A1002', title: '路演日观察：社区项目的三种成长路径', columnLabel: '深度报道', publishedAt: '2026-09-01 15:00', views: 208 },
  { id: 'SU1001', title: '我在岛上的一年：从 lone wolf 到共建者', columnLabel: '岛民故事', publishedAt: '2026-08-20 09:00', views: 156 },
]

/* ---------- 社区运营内容 [MOCK-ONLY]（社区服务：政策与指引） ---------- */

export const communityPolicies: CommunityPolicy[] = [
  {
    id: 'PT1',
    category: '入驻指南',
    title: '企业入驻流程与权益',
    summary: '提交企业资料 → 社区审核 → 签约入驻，享受工位、资源对接与活动优先。',
    content: '企业入驻面向在社区注册的创业团队。流程：1）在「我的-提交申请」选择企业入驻并填写企业简介与主要业务；2）社区运营 3 个工作日内审核；3）审核通过后签约并分配办公空间与专属顾问。入驻企业可享受共享会议室优先预约、需求广场发布、路演活动优先报名等权益。',
    updatedAt: '2026-08-01',
  },
  {
    id: 'PT2',
    category: '入驻指南',
    title: '人才登记说明',
    summary: '登记个人专长可进入社区人才库，被企业按需检索与对接。',
    content: '社区个体可登记自己的专长领域（设计 / 技术 / 法务 / 财务 / 市场等）与个人简介，审核通过后进入人才库展示。企业发布的需求可由人才库成员响应，或由社区运营进行定向撮合。登记即代表同意社区将你的专长信息展示给入驻企业。',
    updatedAt: '2026-08-01',
  },
  {
    id: 'PT3',
    category: '空间政策',
    title: '公共空间使用规范',
    summary: '会议室/路演厅需线上预约，按需使用、超时释放、保持整洁。',
    content: '社区公共空间（会议室、路演厅、咖啡区活动位）通过「空间预约」线上预订。每次预约最长 4 小时；如需变更请提前取消，否则按爽约累计；连续两次爽约将暂停预约权限一周。使用期间请保持设备与场地整洁，离场前关闭灯光与设备。',
    updatedAt: '2026-07-20',
  },
  {
    id: 'PT4',
    category: '活动规范',
    title: '活动发起与报名规则',
    summary: '活动由社区运营统一发布，报名即到、如需取消请提前 24 小时。',
    content: '社区活动（沙龙 / 培训 / 路演 / 工作坊）由运营按社区节奏统一策划发布。报名后可在线取消；活动开始前 24 小时内不可取消，无故缺席将影响后续报名优先级。部分活动仅对入驻企业与社区个体开放，报名时请留意可报名范围。',
    updatedAt: '2026-07-20',
  },
  {
    id: 'PT5',
    category: '积分规则',
    title: '积分获取与使用',
    summary: '参与响应、活动报名、投稿采纳均可获得积分，可兑换商城好礼。',
    content: '积分是社区内的通用激励：响应需求被采纳、参与活动并被核销、投稿内容被采纳等行为均可获得积分（详见商城页「积分规则」）。积分可在积分商城兑换会议室优先预约卡、代金券等。积分仅限本人使用，不可转让。',
    updatedAt: '2026-07-18',
  },
  {
    id: 'PT6',
    category: '管理制度',
    title: '社区公约',
    summary: '诚信互助、尊重隐私、共创共建，违规将被限制社区服务。',
    content: '1）诚信：发布内容与承接需求应真实，禁止虚假信息与恶意承诺；2）互助：社区倡导互帮互助，恶意抢单、不履行承诺将被记录；3）隐私：未经同意不得传播他人信息；4）共创：我们鼓励每一位成员参与社区共建。违反公约将视情节提醒、限制服务或清退。',
    updatedAt: '2026-06-01',
  },
]

/* ---------- 人才库 [MOCK-ONLY]（社区个体） ---------- */

export const talentMembers: TalentMember[] = [
  { uid: 'U1001', name: '陈屿', role: '产品设计', intro: '5 年 SaaS 产品设计经验，擅长从 0 到 1 的体验设计。', skills: ['产品设计', '用户研究', '原型'] },
  { uid: 'U1002', name: '林晚', role: '视觉设计', intro: '品牌与插画方向，社区多个活动的视觉主设计。', skills: ['品牌设计', '插画', 'UI'] },
  { uid: 'U1003', name: '苏明远', role: '技术开发', intro: '全栈工程师，专注小程序与数据中台方向。', skills: ['Vue', 'Node.js', '小程序'] },
  { uid: 'U1004', name: '许星河', role: '市场运营', intro: '本地生活与内容增长操盘手，帮助多个品牌冷启动。', skills: ['市场推广', '内容运营', '增长'] },
  { uid: 'U1005', name: '顾之遥', role: '法务财税', intro: '执业律师，专注创业公司法务与财税合规咨询。', skills: ['公司法务', '财税合规', '合同'] },
  { uid: 'U1006', name: '赵一鸣', role: '供应链', intro: '供应链与采购管理 8 年，熟悉制造与跨境电商。', skills: ['供应链', '采购', '跨境'] },
]

/* ---------- 需求/报名自增 ID ---------- */
export let demandSeq = 4020
export function nextDemandId(): string {
  return `D${demandSeq++}`
}
export function nextEnrollmentId(): string {
  return `EE${enrollmentSeq++}`
}
