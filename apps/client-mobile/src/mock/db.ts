import type {
  AddressItem,
  AppConfig,
  ArticleComment,
  ApplicationFormSchema,
  ApplicationType,
  Article,
  ArticleColumn,
  CommunityEvent,
  CommunityPolicy,
  Demand,
  EnterpriseInvitation,
  EnterpriseRecord,
  EnterpriseTransferRequest,
  ExperienceProfile,
  FavoriteItem,
  Goods,
  HomeArticleCard,
  HomeAnnouncement,
  HomeBanner,
  HomeDemandCard,
  HomeEventCard,
  MyApplication,
  MyEnrollmentItem,
  MyEventFeedback,
  MyIndividualCard,
  MyOrder,
  MyProject,
  MyResponseItem,
  MySubmittedArticle,
  PointsRecord,
  ReportPayload,
  Space,
  SpaceReservation,
  TalentMember,
  UserIdentity,
  UserNotice,
} from '@/types'
import {
  formatMockStamp,
  mockNowDate,
  nextMockId,
  readStoredMockData,
  registerMockStateExporter,
} from '@/mock/runtime'

export { nextMockId } from '@/mock/runtime'

/* [MOCK-ONLY] v33 内存数据库：实体从 seed 派生，可变状态写入版本化 localStorage 快照。 */

export const appConfig: AppConfig = {
  siteName: '聚屿社区',
  siteSlogan: '让每一座创业孤岛，在这里连成群岛。',
  registrationOpen: true,
  mallOpen: true,
  demandOpen: true,
  reservationOpen: true,
  homeCarouselOpen: true,
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
    { code: 'ET005', label: '赛事' },
  ],
  industry: [
    { code: 'IN001', label: '人工智能' },
    { code: 'IN002', label: '芯片半导体' },
    { code: 'IN003', label: '文化创意' },
    { code: 'IN004', label: '企业服务 SaaS' },
    { code: 'IN005', label: '新材料' },
    { code: 'IN006', label: '智慧交通' },
    { code: 'IN007', label: '设计服务' },
    { code: 'IN008', label: '商业航天' },
    { code: 'IN009', label: '医疗健康' },
    { code: 'IN010', label: '风险投资' },
    { code: 'IN011', label: '财务咨询' },
  ],
  goods_category: [
    { code: 'GC001', label: '实物商品' },
    { code: 'GC002', label: '虚拟服务' },
    { code: 'GC003', label: '权益券' },
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
  gender?: 'male' | 'female' | 'unknown'
  bio?: string
  /** 头像图片地址（上传返回的 url） */
  avatar?: string
  /** 实名认证：真实姓名与证件号（[MOCK-ONLY] 缺口 §7.1-18；真实后端走三要素核验） */
  realName?: string
  citizenId?: string
  realNameVerifiedAt?: string
  /** v38：协议同意时间（版本化留痕为后端缺口） */
  agreementAt?: string
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
    gender: 'male',
    bio: '独立产品设计师，专注 SaaS 产品体验设计。',
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
    gender: 'male',
    bio: '全栈工程师，芯启半导体创始人，专注车规级芯片。',
    realName: '苏明远',
    citizenId: '330106199203081236',
    realNameVerifiedAt: '2025-03-16 10:20',
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
    gender: 'female',
    bio: '品牌与空间设计师，木白设计工作室总经理。',
    realName: '林晚',
    citizenId: '330106199507221023',
    realNameVerifiedAt: '2025-07-24 09:12',
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
    gender: 'male',
    bio: '数据中台产品经理，云径数据联合创始人。',
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
    gender: 'unknown',
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
    gender: 'unknown',
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
    categoryLabel: '设计', status: 'published', kind: 'task', publisherUid: 'U1001', publisherName: '陈屿', publisherIdentity: 'community_individual',
    deliverable: '3 个方向的 IP 概念稿、最终 VI 源文件与使用说明', budget: '¥8,000 - 15,000',
    deliverBy: '2026-09-25', contactName: '陈屿', contactPhone: '13800000001', contactEmail: 'chenyu@example.com',
    deadline: '2026-09-30', responseCount: 2, visibilityIdentities: [], visibilityLevels: [], createdAt: '2026-09-02 10:00',
  },
  {
    id: 'D4002', title: '社区小程序前端开发合作', description: '与社区联合开发成员端小程序，涵盖活动报名、需求广场与积分商城入口，三家社区企业联合共研。',
    categoryLabel: '技术开发', status: 'published', kind: 'investment', publisherUid: 'U1014', publisherName: '云径数据', publisherIdentity: 'external_enterprise',
    cooperationNeed: '寻找 3 家社区企业联合共研，需要产品设计与前端研发资源', returnOffer: '联合署名、成果共享、优先内推合作机会',
    contactName: '周慕深', contactPhone: '13800000004', contactEmail: 'zhoumoshen@example.com',
    deadline: '2026-10-15', responseCount: 2, visibilityIdentities: ['community_enterprise', 'external_enterprise'], visibilityLevels: [], createdAt: '2026-09-06 17:12',
  },
  {
    id: 'D4003', title: '低价海报加急代做', description: '加急海报，价格好商量。', categoryLabel: '设计', status: 'rejected', kind: 'task',
    publisherUid: 'U1001', publisherName: '陈屿', publisherIdentity: 'community_individual', deliverBy: '2026-09-18', contactName: '陈屿', contactPhone: '13800000001',
    deadline: '2026-09-20', responseCount: 0,
    visibilityIdentities: [], visibilityLevels: [], createdAt: '2026-09-03 09:00', rejectReason: '与社区定位不符，请补充完整需求说明与合理预算',
  },
  {
    id: 'D4004', title: '共享会议室隔音改造咨询', description: '会议室 A 隔音效果不佳，寻求改造方案与报价。', categoryLabel: '供应链',
    status: 'published', kind: 'task', publisherUid: 'U1006', publisherName: '木白设计工作室', publisherIdentity: 'community_enterprise', deadline: '2026-10-01',
    deliverable: '隔音改造方案、材料清单与施工报价', deliverBy: '2026-09-28',
    contactName: '林晚', contactPhone: '13800000003', contactEmail: 'linwan@example.com',
    responseCount: 1, visibilityIdentities: [], visibilityLevels: [], createdAt: '2026-09-05 09:00',
  },
  {
    id: 'D4005', title: '季度财税合规咨询', description: 'Q4 财税合规体检与政策解读，需要上门服务。', categoryLabel: '法务财务', status: 'published', kind: 'task',
    publisherUid: 'U1004', publisherName: '苏明远', publisherIdentity: 'community_enterprise', deadline: '2026-10-08',
    deliverable: 'Q4 财税合规体检报告与一场政策解读会', deliverBy: '2026-10-02',
    contactName: '苏明远', contactPhone: '13800000002',
    responseCount: 1, visibilityIdentities: [], visibilityLevels: [3, 4, 5], createdAt: '2026-09-07 14:00',
  },
  {
    id: 'D4012', title: '社区公众号栏目代运营', description: '公众号每周两更，需选题、撰写与排版。', categoryLabel: '市场', status: 'pending', kind: 'cooperation',
    publisherUid: 'U1001', publisherName: '陈屿', publisherIdentity: 'community_individual', deadline: '2026-11-01', responseCount: 0,
    bottleneck: '团队精力集中在产品研发，公众号「每周两更」难以为继，希望找到稳定的内容团队承接',
    partnershipMode: '按季度代运营合作，可先试运营一个月',
    returnOffer: '已有栏目定位与素材库，可提供选题方向、社区案例与署名曝光',
    visibilityIdentities: [], visibilityLevels: [], createdAt: '2026-09-10 11:00',
  },
  {
    id: 'D4013', title: '设计工作室寻求线上渠道合作伙伴', description: '团队深耕品牌与空间设计，希望找到擅长线上获客与内容运营的伙伴联合拓展。', categoryLabel: '市场', status: 'published', kind: 'cooperation',
    publisherUid: 'U1006', publisherName: '木白设计工作室', publisherIdentity: 'community_enterprise', deadline: '2026-10-20', responseCount: 0,
    bottleneck: '获客渠道单一，线上内容与投放缺乏专人运营',
    partnershipMode: '联合运营 + 渠道分成，可按项目结算',
    returnOffer: '设计能力与案例背书，可承接伙伴客户的品牌与空间设计',
    visibilityIdentities: [], visibilityLevels: [], createdAt: '2026-09-12 15:30',
  },
]

/* 我的响应记录（按 uid） */
export const responsesByUid: Record<string, MyResponseItem[]> = {
  U1001: [
    { id: 'DR9001', demandId: 'D4004', demandTitle: '共享会议室隔音改造咨询', note: '可提供两家供应商比价方案。', at: '2026-09-06 10:00', responderUid: 'U1001', responderName: '陈屿', responderIdentity: 'community_individual', status: 'pending' },
  ],
  U1004: [
    { id: 'DR9002', demandId: 'D4001', demandTitle: '社区品牌 IP 形象共创', note: '参与概念稿方向 B。', at: '2026-09-03 15:00', responderUid: 'U1004', responderName: '苏明远', responderIdentity: 'community_individual', status: 'pending' },
  ],
  U1014: [
    { id: 'DR9101', demandId: 'D4001', demandTitle: '社区品牌 IP 形象共创', note: '云径设计组可参与。', at: '2026-09-04 09:00', responderUid: 'U1014', responderName: '周慕深', responderIdentity: 'external_enterprise', status: 'pending' },
  ],
}

/* [MOCK-ONLY] 演示日期工具：活动时间按「今天 + 偏移天」生成，保证报名/签到等场景在任意日期打开都可走通 */
function demoDate(dayOffset: number, hhmm: string): string {
  const d = mockNowDate()
  d.setDate(d.getDate() + dayOffset)
  const [h, m] = hhmm.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(h)}:${pad(m)}`
}

/* ---------- 活动中心（EV6001 为签到演示主场：今晚 19:00，签到窗 18:30-21:00 [MOCK-ONLY]） ---------- */

export const events: CommunityEvent[] = [
  {
    id: 'EV6001', title: '第 12 期创业夜话 · AI 应用的落地时刻', typeLabel: '沙龙',
    startTime: demoDate(0, '19:00'), endTime: demoDate(0, '21:00'), location: '岛屿咖啡区',
    capacity: 60, approvedCount: 8, requireReview: false, enrollmentDeadline: demoDate(0, '18:00'), status: 'published',
    visibilityIdentities: [], visibilityLevels: [], enrollmentIdentities: [], enrollmentLevels: [],
    description: '两位一线 AI 创业者聊落地：场景选择、成本结构与团队配置。',
    venueLat: 31.2304, venueLng: 121.4737, checkinRadiusM: 200, checkinOpenMin: '18:30', checkinCloseMin: '21:00',
  },
  {
    id: 'EV6005', title: '设计思维工作坊：从用户访谈到原型', typeLabel: '培训',
    startTime: demoDate(5, '14:00'), endTime: demoDate(5, '17:00'), location: '共享会议室 A',
    capacity: 24, approvedCount: 2, requireReview: true, enrollmentDeadline: demoDate(4, '12:00'), status: 'published',
    visibilityIdentities: [], visibilityLevels: [], enrollmentIdentities: [], enrollmentLevels: [],
    description: '两小时工作坊，带你完整走一遍用户访谈到低保真原型的流程。',
    venueLat: 31.2318, venueLng: 121.4751, checkinRadiusM: 200, checkinOpenMin: '13:30', checkinCloseMin: '17:00',
  },
  {
    id: 'EV6003', title: '聚屿社区年度路演日 2026', typeLabel: '路演',
    startTime: demoDate(13, '13:30'), endTime: demoDate(13, '18:00'), location: '聚屿路演厅',
    capacity: 120, approvedCount: 2, requireReview: true, enrollmentDeadline: demoDate(12, '12:00'), status: 'published',
    visibilityIdentities: [], visibilityLevels: [], enrollmentIdentities: [], enrollmentLevels: [],
    description: '十个社区项目登台路演，投资人现场点评。', venueLat: 31.2325, venueLng: 121.4762,
    checkinRadiusM: 200, checkinOpenMin: '13:00', checkinCloseMin: '18:00',
  },
  {
    id: 'EV6009', title: 'Q4 社区企业闭门交流会', typeLabel: '社交',
    startTime: demoDate(32, '18:30'), endTime: demoDate(32, '21:00'), location: '聚屿路演厅',
    capacity: 50, approvedCount: 0, requireReview: false, enrollmentDeadline: demoDate(31, '18:00'), status: 'published',
    visibilityIdentities: ['community_enterprise', 'external_enterprise'], visibilityLevels: [], enrollmentIdentities: ['community_enterprise', 'external_enterprise'], enrollmentLevels: [],
    description: '仅面向社区企业与合作伙伴的闭门交流。', venueLat: 31.2325, venueLng: 121.4762,
    checkinRadiusM: 200, checkinOpenMin: '18:00', checkinCloseMin: '21:00',
  },
  {
    id: 'EV6008', title: '创业心理舒缓小组（第 3 期）', typeLabel: '沙龙',
    startTime: demoDate(-5, '19:00'), endTime: demoDate(-5, '21:00'), location: '岛屿咖啡区',
    capacity: 20, approvedCount: 12, requireReview: false, enrollmentDeadline: demoDate(-6, '18:00'), status: 'ended',
    visibilityIdentities: [], visibilityLevels: [], enrollmentIdentities: [], enrollmentLevels: [],
    description: '已结束活动（用于签到失败态演示）。', venueLat: 31.2304, venueLng: 121.4737,
    checkinRadiusM: 200, checkinOpenMin: '18:30', checkinCloseMin: '21:00',
  },
]

/* 我的报名（按 uid，含签到状态 [MOCK-ONLY]） */
export const enrollmentsByUid: Record<string, MyEnrollmentItem[]> = {
  U1001: [
    { id: 'EE7002', eventId: 'EV6001', eventTitle: '第 12 期创业夜话 · AI 应用的落地时刻', startTime: events.find((event) => event.id === 'EV6001')!.startTime, location: '岛屿咖啡区', status: 'approved', checkedIn: false },
  ],
  U1004: [
    { id: 'EE7001', eventId: 'EV6005', eventTitle: '设计思维工作坊：从用户访谈到原型', startTime: events.find((event) => event.id === 'EV6005')!.startTime, location: '共享会议室 A', status: 'pending', checkedIn: false },
    { id: 'EE7101', eventId: 'EV6001', eventTitle: '第 12 期创业夜话 · AI 应用的落地时刻', startTime: events.find((event) => event.id === 'EV6001')!.startTime, location: '岛屿咖啡区', status: 'approved', checkedIn: true },
  ],
}

/* ---------- 积分商城 ---------- */

export const goods: Goods[] = [
  { id: 'G1001', name: '会议室优先预约卡', pointsCost: 500, stock: 12, description: '未来 7 天内任意会议室时段优先预约权一张。', fulfillment: 'service', category: 'GC002' },
  { id: 'G1002', name: '精品咖啡券（单杯）', pointsCost: 150, stock: 30, description: '岛屿咖啡区任意现制咖啡一杯。', fulfillment: 'voucher', category: 'GC003' },
  { id: 'G1003', name: '聚屿周边帆布袋', pointsCost: 300, stock: 8, description: '社区联名帆布袋，路演日同款。', fulfillment: 'physical', category: 'GC001' },
  { id: 'G1004', name: '独立办公位体验日', pointsCost: 800, stock: 3, description: '独立办公室体验一日（工作日有效，需提前预约）。', fulfillment: 'service', category: 'GC002' },
  { id: 'G1005', name: '打印机 A4 纸包月', pointsCost: 220, stock: 0, description: '公共打印机 A4 纸包月额度（补货中，暂不展示）。', fulfillment: 'physical' },
  { id: 'G1006', name: '已下架 · 周年纪念徽章', pointsCost: 100, stock: 5, description: '已下架商品（不展示）。', fulfillment: 'physical' },
]
export const goodsOffIds = ['G1006']
export const goodsHiddenZeroStock = true

export const ordersByUid: Record<string, MyOrder[]> = {
  U1001: [
    { id: 'RO2001', goodsId: 'G1002', goodsName: '精品咖啡券（单杯）', pointsCost: 150, status: 'completed', fulfillment: 'voucher', voucherCode: 'JYV-8F2K6M', createdAt: '2026-08-28 12:00', finishedAt: '2026-08-28 12:00' },
    { id: 'RO2006', goodsId: 'G1001', goodsName: '会议室优先预约卡', pointsCost: 500, status: 'pending_use', fulfillment: 'service', createdAt: '2026-09-08 15:00' },
  ],
  U1004: [
    { id: 'RO2010', goodsId: 'G1003', goodsName: '聚屿周边帆布袋', pointsCost: 300, status: 'completed', fulfillment: 'physical', createdAt: '2026-08-15 09:00', shippedAt: '2026-08-17 09:00', finishedAt: '2026-08-18 10:00' },
  ],
}

/* ---------- 空间预约 ---------- */

export const spaces: Space[] = [
  { id: 'S1001', name: '岛屿咖啡区', location: '一楼东侧', capacity: 40, equipment: ['咖啡机', '白板'], needApproval: false, openTime: '08:00', closeTime: '22:00', status: 'open', maxHours: 4, advanceDays: 30 },
  { id: 'S1002', name: '共享会议室 A', location: '二楼 201', capacity: 12, equipment: ['投影', '视频会议', '白板'], needApproval: true, openTime: '09:00', closeTime: '21:00', status: 'open', maxHours: 4, advanceDays: 30 },
  { id: 'S1003', name: '聚屿路演厅', location: '三楼 301', capacity: 120, equipment: ['舞台灯光', '音响', '直播机位'], needApproval: true, openTime: '09:00', closeTime: '21:00', status: 'open', maxHours: 4, advanceDays: 30 },
  { id: 'S1004', name: '共享工位区', location: '二楼 203', capacity: 30, equipment: ['升降桌', '显示器'], needApproval: false, openTime: '08:00', closeTime: '22:00', status: 'open', maxHours: 4, advanceDays: 30 },
  { id: 'S1005', name: '共享会议室 B', location: '二楼 202', capacity: 8, equipment: ['投影', '白板'], needApproval: true, openTime: '09:00', closeTime: '21:00', status: 'maintenance', maxHours: 2, advanceDays: 14 },
]

export const reservationsByUid: Record<string, SpaceReservation[]> = {
  U1001: [
    { id: 'SR5001', spaceId: 'S1002', spaceName: '共享会议室 A', date: '2026-09-20', start: '14:00', end: '16:00', status: 'approved', createdAt: '2026-09-10 10:00', identityType: 'community_individual', subjectName: '陈屿' },
  ],
  U1004: [
    { id: 'SR5101', spaceId: 'S1002', spaceName: '共享会议室 A', date: '2026-09-22', start: '10:00', end: '12:00', status: 'pending', createdAt: '2026-09-11 09:00', identityType: 'community_enterprise', subjectName: '芯启半导体' },
  ],
}

/** 某空间某日的已占用时段（基础占用 + 全账号已通过预约 + 同场地活动）。 */
export function occupiedSlots(spaceId: string, date: string): { start: string; end: string }[] {
  const seed = [...(spaceId + date)].reduce((s, c) => s + c.charCodeAt(0), 0)
  const slots: { start: string; end: string }[] = []
  for (let h = 9; h <= 20; h++) {
    if ((seed + h) % 4 === 0) slots.push({ start: `${String(h).padStart(2, '0')}:00`, end: `${String(h + 1).padStart(2, '0')}:00` })
  }
  for (const records of Object.values(reservationsByUid)) {
    for (const reservation of records) {
      if (reservation.spaceId === spaceId && reservation.date === date && reservation.status === 'approved') {
        slots.push({ start: reservation.start, end: reservation.end })
      }
    }
  }
  const spaceName = spaces.find((space) => space.id === spaceId)?.name
  for (const event of events) {
    if (spaceName && event.location === spaceName && event.status === 'published' && event.startTime.startsWith(date)) {
      slots.push({ start: event.startTime.slice(11, 16), end: event.endTime.slice(11, 16) })
    }
  }
  return slots.filter((slot, index, list) => list.findIndex((item) => item.start === slot.start && item.end === slot.end) === index)
}

/* ---------- 内容与投稿 ---------- */

export const columns: ArticleColumn[] = [
  { code: 'CL001', label: '社区动态' },
  { code: 'CL002', label: '深度报道' },
  { code: 'CL003', label: '岛民故事' },
  { code: 'CL004', label: '活动回顾' },
]

export const articles: Article[] = [
  { id: 'A1001', title: '入驻指南：三步加入聚屿社区', columnLabel: '社区动态', authorName: '社区运营组', publishedAt: '2026-09-05 10:00', views: 321, summary: '从注册到身份绑定的完整流程。', content: '第一步，注册账号；第二步，提交入驻申请；第三步，等待审核通过与身份授予……', commentsEnabled: true },
  { id: 'A1002', title: '路演日观察：社区项目的三种成长路径', columnLabel: '深度报道', authorName: '社区运营组', publishedAt: '2026-09-01 15:00', views: 208, summary: '我们在路演日现场记录了十个项目。', content: '技术型、服务型与社群型项目在社区里的成长路径各不相同……', commentsEnabled: true },
  { id: 'SU1001', title: '我在岛上的一年：从 lone wolf 到共建者', columnLabel: '岛民故事', authorName: '白若溪', publishedAt: '2026-08-20 09:00', views: 156, summary: '一位独立设计师的社区一年。', content: '一年前我拖着行李箱走进岛屿咖啡区……', commentsEnabled: true },
  { id: 'A1003', title: '9 月空间使用提示：会议室预约新规', columnLabel: '社区动态', authorName: '社区运营组', publishedAt: '2026-09-03 09:30', views: 98, summary: '会议室需提前一个工作日申请。', content: '自本月起，共享会议室 A 需提前一个工作日提交预约申请……', commentsEnabled: true },
  { id: 'A1004', title: '活动回顾：第 11 期创业夜话金句集', columnLabel: '活动回顾', authorName: '社区运营组', publishedAt: '2026-08-18 10:00', views: 132, summary: '十二个金句与三次全场掌声。', content: '「先找到问题，再谈技术选型」……', commentsEnabled: true },
]

export const myArticlesByUid: Record<string, MySubmittedArticle[]> = {
  U1001: [
    { id: 'SU1002', title: '独立开发者接单指南', columnLabel: '岛民故事', status: 'rejected', submittedAt: '2026-09-04 10:00', rejectReason: '缺少社区案例引用，请补充你在社区的真实经历' },
    { id: 'SU1003', title: '群岛夜话侧记：一场关于定价的对谈', columnLabel: '深度报道', status: 'pending', submittedAt: '2026-09-11 16:00' },
  ],
}

/* ---------- 企业名片（原「展示页」更名，含成员与联系人） ---------- */

export const enterprises: EnterpriseRecord[] = [
  {
    id: 'E2001', name: '芯启半导体', industry: '集成电路', size: '50-99 人',
    foundedAt: '2019-05', website: 'https://xinqi.example.com', address: '聚屿社区 3 号楼 5 层',
    services: '车规级芯片设计、验证与量产支持',
    advantages: '核心团队来自头部芯片公司，具备完整的车规认证经验，已服务多家主机厂与 Tier1 供应商。',
    description: '车规级芯片设计与验证服务商，社区首批入驻企业。', showcaseStatus: 'published',
    contactUid: 'U1004', contactName: '苏明远',
    members: [
      { uid: 'U1004', name: '苏明远', role: '创始人' },
      { name: '江晚晴', role: '产品负责人', phone: '13900001021', permissions: ['respond_demand', 'space_reserve', 'article_submit'] },
    ],
  },
  {
    id: 'E2004', name: '木白设计工作室', industry: '设计', size: '5-9 人',
    foundedAt: '2016-03', website: 'https://mubai.example.com', address: '聚屿社区 2 号楼 201',
    services: '品牌设计、空间设计与施工监理',
    advantages: '深耕本地创业社区，作品覆盖多个公共空间与社区品牌，交付口碑稳定。',
    description: '品牌与空间设计工作室，社区多个公共空间的设计方。', showcaseStatus: 'published',
    contactUid: 'U1006', contactName: '林晚',
    members: [
      { uid: 'U1006', name: '林晚', role: '总经理' },
      { name: '周予安', role: '设计总监' },
    ],
  },
  {
    id: 'E2002', name: '云径数据', industry: '数据服务', size: '20-49 人',
    foundedAt: '2018-09', website: 'https://yunjing.example.com', address: '软件园 B 座 12 层',
    services: '数据中台建设与小程序联合研发',
    advantages: '数据工程团队 20+，具备多行业数据中台交付经验，支持联合研发与长期运维。',
    description: '合作企业，数据中台与小程序联合研发伙伴。', showcaseStatus: 'none',
    contactUid: 'U1014', contactName: '周慕深',
    members: [{ uid: 'U1014', name: '周慕深', role: '联合创始人' }],
  },
]

/* [MOCK-ONLY] 企业退驻/注销申请（缺口 §7.1-16：真实后端走管理端审核） */
export const enterpriseExitApplications: Record<string, { status: 'pending'; reason?: string; at: string }> = {}

/* [MOCK-ONLY] 企业成员邀请记录（缺口 §7.1-17：真实后端为邀请记录 + 站内信/短信，接受后写入成员） */
export const enterpriseInvitations: EnterpriseInvitation[] = []

/* [MOCK-ONLY] v35 负责人转移请求（需目标成员接受后生效） */
export const enterpriseTransferRequests: EnterpriseTransferRequest[] = []

/* [MOCK-ONLY] v35 举报记录（聚合到 Mock 运营队列，接入期接管理端举报处理） */
export const reports: (ReportPayload & { id: string; uid: string; at: string; status: 'pending' })[] = []

/* [MOCK-ONLY] v37 收藏（按用户） */
export const favoritesByUid: Record<string, FavoriteItem[]> = {}

/* [MOCK-ONLY] v37 到货提醒订阅（goods id 列表） */
export const restockSubscriptions: Record<string, string[]> = {}

/* [MOCK-ONLY] v37 Mock 埋点计数（漏斗观察，DevTools 可见） */
export const analyticsCounters: Record<string, number> = {}

/* ---------- v38：地址 / 通知偏好 / 屏蔽 / 账号申请 / 活动反馈 ---------- */
export const addressesByUid: Record<string, AddressItem[]> = {
  U1001: [
    { id: 'AD1001', name: '陈屿', phone: '13800000001', address: '上海市杨浦区大学路 88 号 3 号楼 501', isDefault: true },
  ],
  U1004: [
    { id: 'AD1002', name: '苏明远', phone: '13800000002', address: '上海市浦东新区张江路 100 号 芯启半导体', isDefault: true },
  ],
}

/** 屏蔽名单（v38 [MOCK-ONLY]） */
export const blockedByUid: Record<string, string[]> = {}

/** 账号申请（注销 / 数据导出；v38 [MOCK-ONLY]） */
/* ===== v42 新状态（内存态，不参与快照持久化） ===== */
export const demandMessagesByDemand: Record<string, import('@/types').DemandMessage[]> = {}
export const projectTasksByProject: Record<string, import('@/types').ProjectTask[]> = {}
export const projectFilesByProject: Record<string, import('@/types').ProjectFileItem[]> = {}
export const projectMessagesByProject: Record<string, import('@/types').ProjectMessage[]> = {}
export const enterpriseResponsesByEnterprise: Record<string, { id: string; demandId: string; demandTitle: string; at: string }[]> = {}

export const accountRequestsByUid: Record<string, { deletion?: { reason?: string; at: string; cancelableUntil?: string }; export?: { at: string } }> = {}

/** 活动反馈（按 uid + eventId；v38 [MOCK-ONLY]） */
export const eventFeedbackByUid: Record<string, MyEventFeedback[]> = {}

/* ---------- v38：文章点赞与评论 [MOCK-ONLY] ---------- */

export const articleLikesByUid: Record<string, string[]> = {
  U1001: ['A1002'],
  U1004: ['A1001', 'SU1001'],
}

export const articleComments: ArticleComment[] = [
  { id: 'CM1001', articleId: 'A1001', uid: 'U1004', authorName: '苏明远', content: '指南很清晰，入驻流程按这个走一遍就通了。', at: '2026-09-06 11:20' },
  { id: 'CM1002', articleId: 'A1002', uid: 'U1001', authorName: '陈屿', content: '社区项目的三种路径总结得很到位，期待更多案例复盘。', at: '2026-09-02 09:10' },
]

/** [MOCK-ONLY] 记录一次埋点事件（接入期为真实埋点 SDK / 数据平台上报） */
export function trackMockEvent(name: string): void {
  analyticsCounters[name] = (analyticsCounters[name] ?? 0) + 1
}

/** 审核模拟器保留的原始申请载荷，不暴露给客户端 API。 */
export const applicationPayloadById: Record<string, { uid: string; payload: import('@/types').ApplicationCreatePayload }> = {}
export const articlePayloadById: Record<string, { uid: string; payload: import('@/types').ArticleCreatePayload }> = {}

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

/* ---------- 申请表单 schema [MOCK-ONLY]（缺口 §7.1-14：接入期由后端按类型下发自定义字段） ---------- */

const industryOptions = dicts.industry.map((d) => ({ label: d.label, value: d.label }))

export const applicationFormSchemas: Partial<Record<ApplicationType, ApplicationFormSchema>> = {
  settle: {
    type: 'settle',
    title: '企业入驻申请',
    subtitle: '提交资料并通过审核后，成为「社区企业」并获得办公空间',
    submitLabel: '提交入驻申请',
    tips: ['企业入驻需在社区拥有办公空间（工位或独立办公室）', '请准备营业执照；审核约 3 个工作日，结果站内信通知'],
    fields: [
      { key: 'companyName', label: '企业名称', type: 'text', required: true, placeholder: '与营业执照一致', maxlength: 60 },
      { key: 'creditCode', label: '统一社会信用代码', type: 'text', required: true, placeholder: '18 位统一社会信用代码', maxlength: 18 },
      { key: 'industry', label: '所属行业', type: 'select', required: true, options: industryOptions },
      { key: 'companySize', label: '团队规模', type: 'select', required: true, options: [
        { label: '1-9 人', value: '1-9 人' },
        { label: '10-49 人', value: '10-49 人' },
        { label: '50-99 人', value: '50-99 人' },
        { label: '100 人以上', value: '100 人以上' },
      ] },
      { key: 'officeNeeds', label: '办公空间需求', type: 'select', required: true, help: '企业入驻需在社区拥有办公空间', options: [
        { label: '1-2 个工位', value: '1-2 个工位' },
        { label: '3-6 个工位', value: '3-6 个工位' },
        { label: '独立办公室', value: '独立办公室' },
        { label: '其他（在简介中说明）', value: '其他' },
      ] },
      { key: 'settleDate', label: '预计入驻时间', type: 'date', required: true },
      { key: 'contactName', label: '联系人', type: 'text', required: true, maxlength: 20 },
      { key: 'contactPhone', label: '联系电话', type: 'text', required: true, placeholder: '11 位手机号', maxlength: 11 },
      { key: 'intro', label: '企业简介与主营业务', type: 'textarea', required: true, maxlength: 500, placeholder: '简要介绍业务方向、核心产品与入驻诉求…' },
      { key: 'businessLicense', label: '营业执照', type: 'upload', required: true, accept: 'image/*,application/pdf', help: '支持 JPG/PNG/PDF，单个文件 ≤10MB' },
      { key: 'extraFiles', label: '其他补充材料', type: 'upload', accept: 'image/*,application/pdf', multiple: true, maxCount: 3, help: '选填，最多 3 个文件' },
    ],
  },
  cooperation: {
    type: 'cooperation',
    title: '合作伙伴申请',
    subtitle: '无需入驻办公，审核通过后成为「合作企业」',
    submitLabel: '提交合作申请',
    tips: ['适合投资机构、服务机构、高校院所等', '审核通过后开通企业名片申请与项目对接'],
    fields: [
      { key: 'orgName', label: '机构名称', type: 'text', required: true, maxlength: 60 },
      { key: 'orgType', label: '机构类型', type: 'select', required: true, options: [
        { label: '企业', value: '企业' },
        { label: '投资机构', value: '投资机构' },
        { label: '高校院所', value: '高校院所' },
        { label: '服务机构', value: '服务机构' },
        { label: '其他', value: '其他' },
      ] },
      { key: 'coopField', label: '合作领域与方式', type: 'textarea', required: true, maxlength: 300, placeholder: '希望在哪些领域、以什么方式与社区及社区企业合作…' },
      { key: 'resources', label: '可提供的资源', type: 'textarea', maxlength: 200, placeholder: '选填：资金、渠道、服务能力等' },
      { key: 'contactName', label: '联系人', type: 'text', required: true, maxlength: 20 },
      { key: 'contactPhone', label: '联系电话', type: 'text', required: true, maxlength: 11 },
      { key: 'attachments', label: '资质或案例材料', type: 'upload', accept: 'image/*,application/pdf', multiple: true, maxCount: 3, help: '选填，最多 3 个文件' },
    ],
  },
  individual: {
    type: 'individual',
    title: '人才登记',
    subtitle: '登记个人专长，审核通过后成为「社区个体」',
    submitLabel: '提交人才登记',
    tips: ['审核通过后进入社区人才库，可被社区企业按需检索与对接', '登记即代表同意社区向入驻企业展示你的专长信息'],
    fields: [
      { key: 'realName', label: '真实姓名', type: 'text', required: true, maxlength: 20 },
      { key: 'skills', label: '擅长领域', type: 'text', required: true, placeholder: '如：产品设计 / 前端开发 / 法务财税', maxlength: 40 },
      { key: 'years', label: '从业年限', type: 'number', required: true, placeholder: '如：5' },
      { key: 'intro', label: '个人简介', type: 'textarea', required: true, maxlength: 300, placeholder: '介绍你的经验、代表项目与可提供的帮助…' },
      { key: 'contactPhone', label: '联系电话', type: 'text', required: true, maxlength: 11 },
      { key: 'portfolio', label: '作品集或简历', type: 'upload', accept: 'image/*,application/pdf', multiple: true, maxCount: 2, help: '选填，最多 2 个文件' },
    ],
  },
  identity: {
    type: 'identity',
    title: '身份绑定',
    subtitle: '加入社区生态：绑定社区个体或社区企业身份',
    submitLabel: '提交身份绑定',
    tips: ['社区个体：面向个人专长展示', '社区企业：需填写要绑定并已在社区入驻的企业名称'],
    fields: [
      { key: 'identityType', label: '要绑定的身份', type: 'select', required: true, options: [
        { label: '社区个体', value: 'community_individual' },
        { label: '社区企业', value: 'community_enterprise' },
      ] },
      { key: 'orgName', label: '社区企业名称', type: 'text', maxlength: 60, help: '选择社区企业身份时填写' },
      { key: 'industry', label: '所属行业', type: 'select', options: industryOptions },
      { key: 'contactName', label: '联系人', type: 'text', required: true, maxlength: 20 },
      { key: 'contactPhone', label: '联系电话', type: 'text', required: true, maxlength: 11 },
      { key: 'certifications', label: '相关材料', type: 'upload', accept: 'image/*,application/pdf', multiple: true, maxCount: 3, help: '选填，最多 3 个文件' },
    ],
  },
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

/** 企业经验（社区企业身份维度；身份隔离：企业经验与个人经验互不相通） */
export const enterpriseExperienceByEid: Record<string, ExperienceProfile> = {
  E2001: {
    identityLabel: '社区企业', level: 3, levelName: '同行先锋', nextLevelExp: 1800,
    records: [
      { id: 'EX6101', delta: +200, balance: 680, reason: '联合立项：车规芯片验证项目', at: '2026-08-26 15:00' },
      { id: 'EX6042', delta: +80, balance: 480, reason: '承办社区技术分享会', at: '2026-08-08 14:00' },
      { id: 'EX6001', delta: +400, balance: 400, reason: '首次入驻社区企业', at: '2026-05-20 10:00' },
    ],
  },
  E2004: {
    identityLabel: '社区企业', level: 2, levelName: '启航伙伴', nextLevelExp: 800,
    records: [
      { id: 'EX7008', delta: +120, balance: 260, reason: '社区公共空间设计合作', at: '2026-08-12 11:00' },
      { id: 'EX7001', delta: +140, balance: 140, reason: '首次入驻社区企业', at: '2026-06-18 10:00' },
    ],
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

/** 统一时间戳：YYYY-MM-DD HH:mm（与后端契约一致） */
export function nowStamp(): string {
  return formatMockStamp()
}

/** 未读数（供 devtools 与壳角标） */
export function unreadCount(uid: string): number {
  return (noticesByUid[uid] ?? []).filter((n) => !n.read).length
}

/** [MOCK-ONLY] 通知触发点（与未来后端触发点一一对应） */
export function pushNotice(uid: string, notice: Omit<UserNotice, 'id' | 'read' | 'at'>): void {
  const at = nowStamp()
  ;(noticesByUid[uid] ??= []).unshift({ id: nextMockId('UN'), at, read: false, ...notice })
}

/** [MOCK-ONLY] 积分/经验入账（写流水 + 更新余额，对应后端 PointsEngineService） */
export function grantPoints(uid: string, delta: number, reason: string, source: string): void {
  const account = accountByUid(uid)
  if (!account) return
  const records = (pointsRecordsByUid[uid] ??= [])
  const balance = (records[0]?.balance ?? account.points) + delta
  const at = nowStamp()
  records.unshift({ id: nextMockId('PT'), delta, balance, reason, source, at })
  account.points = balance
  pushNotice(uid, { type: 'points', title: `积分${delta >= 0 ? '到账' : '变动'} ${delta >= 0 ? '+' : ''}${delta}`, content: `${reason}，当前积分 ${balance}。`, link: '/me/points' })
}

/** [MOCK-ONLY] 社区个体经验入账；基础账号或企业身份不混入个人经验。 */
export function grantExperience(uid: string, delta: number, reason: string): void {
  const account = accountByUid(uid)
  const identity = account?.identities.find((item) => item.type === 'community_individual')
  if (!identity) return
  const profile = (experienceByUid[uid] ??= {
    identityLabel: '社区个体', level: 1, levelName: '初来乍到', nextLevelExp: 100, records: [],
  })
  const balance = (profile.records[0]?.balance ?? identity.experience ?? 0) + delta
  profile.records.unshift({ id: nextMockId('EX'), delta, balance, reason, at: nowStamp() })
  identity.experience = balance
}

/** [MOCK-ONLY] 社区企业经验按企业隔离。 */
export function grantEnterpriseExperience(enterpriseId: string, delta: number, reason: string): void {
  const profile = (enterpriseExperienceByEid[enterpriseId] ??= {
    identityLabel: '社区企业', level: 1, levelName: '初来乍到', nextLevelExp: 100, records: [],
  })
  const balance = (profile.records[0]?.balance ?? 0) + delta
  profile.records.unshift({ id: nextMockId('EX'), delta, balance, reason, at: nowStamp() })
}

/* ---------- 首页聚合卡片 ---------- */

/* [MOCK-ONLY] v40 运营公告（后台公告发布后下发；接入期接 /api/app/announcements） */
export const announcements: HomeAnnouncement[] = [
  { id: 'AN1001', title: '第二批社区企业招募启动，9 月 30 日截止', content: '第二批社区企业招募已启动：入驻可享共享会议室优先预约、需求广场发布与路演优先报名等权益。请在「企业合作」入口提交入驻申请，运营将于 3 个工作日内审核。', at: '2026-09-12 09:00', pinned: true },
  { id: 'AN1002', title: '9 月 26 日年度路演日观众报名中', content: '聚屿社区年度路演日将于 9 月 26 日 13:30 在聚屿路演厅举行，十个社区项目登台路演，投资人现场点评。活动页可报名。', at: '2026-09-10 10:00' },
  { id: 'AN1003', title: '共享会议室 A 隔音改造期间使用提示', content: '共享会议室 A 将于 9 月下旬进行隔音改造，施工期间预约可能受影响，请优先使用会议室 B 或咖啡区活动位。', at: '2026-09-08 15:00' },
]

export const homeBanners: HomeBanner[] = [
  { id: 'BN1', title: '第二批社区企业招募启动', subtitle: '申请入驻，共享工位与创业资源', link: '/intros/enterprise' },
  { id: 'BN2', title: '年度路演日报名中', subtitle: '9 月 26 日，聚屿路演厅', link: '/events' },
  { id: 'BN3', title: '积分商城上新', subtitle: '会议室优先预约卡等你兑换', link: '/mall' },
]

/* 首页活动卡从活动列表派生，保证与活动详情的时间/报名数一致 */
export const homeEvents: HomeEventCard[] = events
  .filter((e) => e.status === 'published')
  .slice(0, 3)
  .map((e) => ({
    id: e.id,
    title: e.title,
    type: e.typeLabel,
    startTime: e.startTime,
    location: e.location,
    enrolled: e.approvedCount,
    capacity: e.capacity,
  }))

export const homeDemands: HomeDemandCard[] = [
  { id: 'D4001', title: '社区品牌 IP 形象共创', categoryLabel: '设计', publisherName: '陈屿', publisherIdentity: 'community_individual', deliverBy: '2026-09-25', responseCount: 2 },
  { id: 'D4004', title: '共享会议室隔音改造咨询', categoryLabel: '供应链', publisherName: '木白设计工作室', publisherIdentity: 'community_enterprise', deliverBy: '2026-09-28', responseCount: 1 },
  { id: 'D4005', title: '季度财税合规咨询', categoryLabel: '法务财务', publisherName: '苏明远', publisherIdentity: 'community_enterprise', deliverBy: '2026-10-02', responseCount: 1 },
]

export const homeArticles: HomeArticleCard[] = [
  { id: 'A1001', title: '入驻指南：三步加入聚屿社区', columnLabel: '社区动态', publishedAt: '2026-09-05 10:00', views: 321 },
  { id: 'A1002', title: '路演日观察：社区项目的三种成长路径', columnLabel: '深度报道', publishedAt: '2026-09-01 15:00', views: 208 },
  { id: 'SU1001', title: '我在岛上的一年：从 lone wolf 到共建者', columnLabel: '岛民故事', publishedAt: '2026-08-20 09:00', views: 156 },
]

/* ---------- 社区运营内容 [MOCK-ONLY]（社区服务：政策与指引） ---------- */

export const communityPolicies: CommunityPolicy[] = [
  {
    id: 'PL1',
    category: '入驻指南',
    title: '企业合作流程与权益',
    summary: '企业合作分「企业入驻」与「合作伙伴」两种，按需选择并提交对应申请。',
    content: '企业合作分两种方式：1）企业入驻——需在社区拥有办公空间（工位或办公室），审核通过后成为「社区企业」，可享受共享会议室优先预约、需求广场发布、路演活动优先报名等权益；2）合作伙伴——无需入驻办公，以项目与资源合作方式参与社区共建，审核通过后成为「合作企业」，可申请企业名片并优先对接社区企业资源。两种方式均从首页「企业合作」入口了解差异并提交申请，社区运营 3 个工作日内审核。',
    updatedAt: '2026-09-13',
    version: 'v3.1',
    effectiveAt: '2026-09-15',
    publisher: '聚屿社区运营组',
  },
  {
    id: 'PL2',
    category: '入驻指南',
    title: '人才登记说明',
    summary: '登记真实姓名、专长与简介，审核通过后成为「社区个体」。',
    content: '人才登记面向设计师、开发者、顾问等自由职业者与专业人才。从首页「人才登记」入口提交真实姓名、擅长领域、从业年限与个人简介（可附作品集/简历），社区运营 3 个工作日内审核；通过后授予「社区个体」身份与经验等级，进入社区人才库，可被社区企业按需检索、响应需求或参与项目协作。',
    updatedAt: '2026-09-13',
  },
  {
    id: 'PL3',
    category: '空间政策',
    title: '公共空间使用规范',
    summary: '会议室/路演厅需线上预约，按需使用、超时释放、保持整洁。',
    content: '社区公共空间（会议室、路演厅、咖啡区活动位）通过「空间预约」线上预订。每次预约最长 4 小时；如需变更请提前取消，否则按爽约累计；连续两次爽约将暂停预约权限一周。使用期间请保持设备与场地整洁，离场前关闭灯光与设备。',
    updatedAt: '2026-07-20',
    version: 'v2.0',
    effectiveAt: '2026-08-01',
    publisher: '聚屿社区运营组',
  },
  {
    id: 'PL4',
    category: '活动规范',
    title: '活动发起与报名规则',
    summary: '活动由社区运营统一发布，报名即到、如需取消请提前 24 小时。',
    content: '社区活动（沙龙 / 培训 / 路演 / 工作坊）由运营按社区节奏统一策划发布。报名后可在线取消；活动开始前 24 小时内不可取消，无故缺席将影响后续报名优先级。部分活动仅对入驻企业与社区个体开放，报名时请留意可报名范围。',
    updatedAt: '2026-07-20',
  },
  {
    id: 'PL5',
    category: '积分规则',
    title: '积分获取与使用',
    summary: '参与响应、活动报名、投稿采纳均可获得积分，可兑换商城好礼。',
    content: '积分是社区内的通用激励：响应需求被采纳、参与活动并被核销、投稿内容被采纳等行为均可获得积分（详见商城页「积分规则」）。积分可在积分商城兑换会议室优先预约卡、代金券等。积分仅限本人使用，不可转让。',
    updatedAt: '2026-07-18',
  },
  {
    id: 'PL6',
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
  { uid: 'U1004', name: '苏明远', role: '技术开发', intro: '全栈工程师，专注小程序与数据中台方向。', skills: ['Vue', 'Node.js', '小程序'] },
  { uid: 'U3001', name: '顾之遥', role: '法务财税', intro: '执业律师，专注创业公司法务与财税合规咨询。', skills: ['公司法务', '财税合规', '合同'] },
  { uid: 'U3002', name: '许星河', role: '市场运营', intro: '本地生活与内容增长操盘手，帮助多个品牌冷启动。', skills: ['市场推广', '内容运营', '增长'] },
  { uid: 'U3003', name: '赵一鸣', role: '供应链', intro: '供应链与采购管理 8 年，熟悉制造与跨境电商。', skills: ['供应链', '采购', '跨境'] },
  { uid: 'U3004', name: '沈知微', role: '品牌设计', intro: '品牌与插画方向，多个社区活动的视觉主设计。', skills: ['品牌设计', '插画', 'UI'] },
]
/* ---------- 个人名片 [MOCK-ONLY]（缺口 §7.1-16：社区个体名片自助编辑，简历式分段） ---------- */

export type IndividualShowcase = Omit<MyIndividualCard, 'avatar' | 'level' | 'levelName'>

export const individualShowcases: Record<string, IndividualShowcase> = {
  U1001: {
    displayName: '陈屿',
    age: '29',
    politicalStatus: '共青团员',
    intro: '5 年 SaaS 产品设计经验，擅长从 0 到 1 的体验设计。',
    industryExperience: '深耕 B 端 SaaS 与社区产品设计，主导过多个产品的体验重构与设计系统建设。',
    skills: ['产品设计', '用户研究', '原型'],
    education: [{ school: '浙江大学', major: '工业设计', degree: '本科', period: '2014 - 2018' }],
    work: [
      { company: '某 SaaS 科技公司', title: '高级产品设计师', period: '2021 - 至今', description: '负责核心产品体验设计，搭建组件库与设计规范。' },
    ],
    projects: [
      { name: '聚屿社区品牌 IP 共创', role: '设计主理', period: '2026', description: '主导社区品牌 IP 与 VI 体系设计。' },
    ],
    honors: [{ name: '红点设计概念奖', date: '2023' }],
    socials: [{ label: 'GitHub', url: 'https://github.com/chenyu-demo' }],
    customLinks: [{ label: '个人作品集', url: 'https://portfolio.example.com/chenyu' }],
  },
}

/* ---------- 需求/报名自增 ID ---------- */

export function nextDemandId(): string {
  return nextMockId('D')
}
export function nextEnrollmentId(): string {
  return nextMockId('EE')
}

export function nextInvitationId(): string {
  return nextMockId('EI')
}

type PersistedMockData = {
  appConfig: AppConfig
  accounts: MockAccount[]
  demands: Demand[]
  responsesByUid: typeof responsesByUid
  events: CommunityEvent[]
  enrollmentsByUid: typeof enrollmentsByUid
  goods: Goods[]
  ordersByUid: typeof ordersByUid
  reservationsByUid: typeof reservationsByUid
  articles: Article[]
  myArticlesByUid: typeof myArticlesByUid
  enterprises: EnterpriseRecord[]
  enterpriseExitApplications: typeof enterpriseExitApplications
  enterpriseInvitations: EnterpriseInvitation[]
  enterpriseTransferRequests: EnterpriseTransferRequest[]
  reports: typeof reports
  favoritesByUid: typeof favoritesByUid
  restockSubscriptions: typeof restockSubscriptions
  analyticsCounters: typeof analyticsCounters
  addressesByUid: typeof addressesByUid
  blockedByUid: typeof blockedByUid
  accountRequestsByUid: typeof accountRequestsByUid
  eventFeedbackByUid: typeof eventFeedbackByUid
  articleLikesByUid: typeof articleLikesByUid
  articleComments: ArticleComment[]
  projectsByUid: typeof projectsByUid
  applicationsByUid: typeof applicationsByUid
  applicationPayloadById: typeof applicationPayloadById
  articlePayloadById: typeof articlePayloadById
  experienceByUid: typeof experienceByUid
  enterpriseExperienceByEid: typeof enterpriseExperienceByEid
  pointsRecordsByUid: typeof pointsRecordsByUid
  noticesByUid: typeof noticesByUid
  talentMembers: TalentMember[]
  individualShowcases: typeof individualShowcases
}

function replaceArray<T>(target: T[], source?: T[]): void {
  if (Array.isArray(source)) target.splice(0, target.length, ...source)
}

function replaceRecord<T extends object>(target: T, source?: T): void {
  if (!source || typeof source !== 'object') return
  for (const key of Object.keys(target)) delete (target as Record<string, unknown>)[key]
  Object.assign(target, source)
}

const persisted = readStoredMockData<Partial<PersistedMockData>>()
if (persisted) {
  if (persisted.appConfig) Object.assign(appConfig, persisted.appConfig)
  replaceArray(accounts, persisted.accounts)
  replaceArray(demands, persisted.demands)
  replaceRecord(responsesByUid, persisted.responsesByUid)
  replaceArray(events, persisted.events)
  replaceRecord(enrollmentsByUid, persisted.enrollmentsByUid)
  replaceArray(goods, persisted.goods)
  replaceRecord(ordersByUid, persisted.ordersByUid)
  replaceRecord(reservationsByUid, persisted.reservationsByUid)
  replaceArray(articles, persisted.articles)
  replaceRecord(myArticlesByUid, persisted.myArticlesByUid)
  replaceArray(enterprises, persisted.enterprises)
  replaceRecord(enterpriseExitApplications, persisted.enterpriseExitApplications)
  replaceArray(enterpriseInvitations, persisted.enterpriseInvitations)
  replaceArray(enterpriseTransferRequests, persisted.enterpriseTransferRequests)
  replaceArray(reports, persisted.reports)
  replaceRecord(favoritesByUid, persisted.favoritesByUid)
  replaceRecord(restockSubscriptions, persisted.restockSubscriptions)
  replaceRecord(analyticsCounters, persisted.analyticsCounters)
  replaceRecord(addressesByUid, persisted.addressesByUid)
  replaceRecord(blockedByUid, persisted.blockedByUid)
  replaceRecord(accountRequestsByUid, persisted.accountRequestsByUid)
  replaceRecord(eventFeedbackByUid, persisted.eventFeedbackByUid)
  replaceRecord(articleLikesByUid, persisted.articleLikesByUid)
  replaceArray(articleComments, persisted.articleComments)
  replaceRecord(projectsByUid, persisted.projectsByUid)
  replaceRecord(applicationsByUid, persisted.applicationsByUid)
  replaceRecord(applicationPayloadById, persisted.applicationPayloadById)
  replaceRecord(articlePayloadById, persisted.articlePayloadById)
  replaceRecord(experienceByUid, persisted.experienceByUid)
  replaceRecord(enterpriseExperienceByEid, persisted.enterpriseExperienceByEid)
  replaceRecord(pointsRecordsByUid, persisted.pointsRecordsByUid)
  replaceRecord(noticesByUid, persisted.noticesByUid)
  replaceArray(talentMembers, persisted.talentMembers)
  replaceRecord(individualShowcases, persisted.individualShowcases)
}

registerMockStateExporter((): PersistedMockData => ({
  appConfig, accounts, demands, responsesByUid, events, enrollmentsByUid, goods, ordersByUid,
  reservationsByUid, articles, myArticlesByUid, enterprises, enterpriseExitApplications,
  enterpriseInvitations, enterpriseTransferRequests, reports,
  favoritesByUid, restockSubscriptions, analyticsCounters,
  addressesByUid, blockedByUid, accountRequestsByUid, eventFeedbackByUid,
  articleLikesByUid, articleComments,
  projectsByUid, applicationsByUid, applicationPayloadById, articlePayloadById,
  experienceByUid, enterpriseExperienceByEid, pointsRecordsByUid, noticesByUid, talentMembers,
  individualShowcases,
}))
