import type { Lease, Workstation, WorkstationArea } from '@/types'

/* 办公位管理数据 — 命名前缀：工位 WS1001+ / 租约 LS2001+ / 工位区域 WA1001+
 * 工位分配与企业入驻记录（applications 入驻申请、users identities）保持一致：
 *   B-201 芯启半导体（AP3001 入驻 2025-03-20，独立办公室）
 *   B-202 星澜智能科技（入驻 2025-03-12，独立办公室）
 *   B-203 逐浪出行（入驻 2025-04-28，独立办公室）
 *   B-204 深空航天科技（入驻 2025-03-08，独立办公室）
 *   A-01~04 云径网络（入驻 2025-03-11，开放工位）
 *   A-05~06 木白设计工作室（AP3006 入驻 2025-05-16，开放工位）
 *   A-07~08 沧岚新材料（入驻 2025-07-23，开放工位）
 *   拾光文创（E2003）入驻审批通过后正式入驻，暂未分配工位（未创建租约）
 * 租约状态：active=生效中（原始），到期临期/已到期由读取时派生（simulateLeaseStatus）
 * 区域：WorkstationArea 为「区域规划」数据源，工位.area 存区域名称（改名时由 API 层级联刷新） */

export const workstationAreas: WorkstationArea[] = [
  { id: 'WA1001', name: 'A 区 · 开放工位', type: 'open', description: '岛屿中心 3F 东侧，12 个开放式工位，适合 1-3 人初创团队', createdAt: '2025-03-01' },
  { id: 'WA1002', name: 'B 区 · 独立办公室', type: 'office', description: '岛屿中心 3F 南侧，4 间独立办公室，适合 5 人以上团队整间租用', createdAt: '2025-03-01' },
  { id: 'WA1003', name: 'C 区 · 半开放工位', type: 'semi', description: '岛屿中心 3F 西侧，4 个半开放卡位，带矮隔断，适合双人协作', createdAt: '2025-06-15' },
]

export const workstations: Workstation[] = [
  /* A 区 · 开放工位（A-01 ~ A-12） */
  { id: 'WS1001', seatNo: 'A-01', area: 'A 区 · 开放工位', type: 'open', capacity: 1, status: 'assigned', enterpriseId: 'E2004', enterpriseName: '云径网络', leaseId: 'LS2003' },
  { id: 'WS1002', seatNo: 'A-02', area: 'A 区 · 开放工位', type: 'open', capacity: 1, status: 'assigned', enterpriseId: 'E2004', enterpriseName: '云径网络', leaseId: 'LS2003' },
  { id: 'WS1003', seatNo: 'A-03', area: 'A 区 · 开放工位', type: 'open', capacity: 1, status: 'assigned', enterpriseId: 'E2004', enterpriseName: '云径网络', leaseId: 'LS2003' },
  { id: 'WS1004', seatNo: 'A-04', area: 'A 区 · 开放工位', type: 'open', capacity: 1, status: 'assigned', enterpriseId: 'E2004', enterpriseName: '云径网络', leaseId: 'LS2003' },
  { id: 'WS1005', seatNo: 'A-05', area: 'A 区 · 开放工位', type: 'open', capacity: 1, status: 'assigned', enterpriseId: 'E2007', enterpriseName: '木白设计工作室', leaseId: 'LS2006' },
  { id: 'WS1006', seatNo: 'A-06', area: 'A 区 · 开放工位', type: 'open', capacity: 1, status: 'assigned', enterpriseId: 'E2007', enterpriseName: '木白设计工作室', leaseId: 'LS2006' },
  { id: 'WS1007', seatNo: 'A-07', area: 'A 区 · 开放工位', type: 'open', capacity: 1, status: 'assigned', enterpriseId: 'E2005', enterpriseName: '沧岚新材料', leaseId: 'LS2007' },
  { id: 'WS1008', seatNo: 'A-08', area: 'A 区 · 开放工位', type: 'open', capacity: 1, status: 'assigned', enterpriseId: 'E2005', enterpriseName: '沧岚新材料', leaseId: 'LS2007' },
  { id: 'WS1009', seatNo: 'A-09', area: 'A 区 · 开放工位', type: 'open', capacity: 1, status: 'idle', defaultMonthlyRent: 600, note: '临窗景观位，光线充足，适合长驻开发' },
  { id: 'WS1010', seatNo: 'A-10', area: 'A 区 · 开放工位', type: 'open', capacity: 1, status: 'idle', defaultMonthlyRent: 600 },
  { id: 'WS1011', seatNo: 'A-11', area: 'A 区 · 开放工位', type: 'open', capacity: 1, status: 'idle', defaultMonthlyRent: 600 },
  { id: 'WS1012', seatNo: 'A-12', area: 'A 区 · 开放工位', type: 'open', capacity: 1, status: 'idle', defaultMonthlyRent: 600 },
  /* B 区 · 独立办公室（B-201 ~ B-204） */
  { id: 'WS1013', seatNo: 'B-201', area: 'B 区 · 独立办公室', type: 'office', capacity: 12, status: 'assigned', enterpriseId: 'E2002', enterpriseName: '芯启半导体', leaseId: 'LS2001', defaultMonthlyRent: 3000, areaSqm: 120 },
  { id: 'WS1014', seatNo: 'B-202', area: 'B 区 · 独立办公室', type: 'office', capacity: 10, status: 'assigned', enterpriseId: 'E2001', enterpriseName: '星澜智能科技', leaseId: 'LS2002', defaultMonthlyRent: 2800, areaSqm: 110 },
  { id: 'WS1015', seatNo: 'B-203', area: 'B 区 · 独立办公室', type: 'office', capacity: 8, status: 'assigned', enterpriseId: 'E2006', enterpriseName: '逐浪出行', leaseId: 'LS2005', defaultMonthlyRent: 2500, areaSqm: 95 },
  { id: 'WS1016', seatNo: 'B-204', area: 'B 区 · 独立办公室', type: 'office', capacity: 10, status: 'assigned', enterpriseId: 'E2008', enterpriseName: '深空航天科技', leaseId: 'LS2004', defaultMonthlyRent: 2800, areaSqm: 105 },
  /* C 区 · 半开放工位（C-301 ~ C-304） */
  { id: 'WS1017', seatNo: 'C-301', area: 'C 区 · 半开放工位', type: 'semi', capacity: 2, status: 'idle', defaultMonthlyRent: 900 },
  { id: 'WS1018', seatNo: 'C-302', area: 'C 区 · 半开放工位', type: 'semi', capacity: 2, status: 'idle', defaultMonthlyRent: 900 },
  { id: 'WS1019', seatNo: 'C-303', area: 'C 区 · 半开放工位', type: 'semi', capacity: 2, status: 'idle' },
  { id: 'WS1020', seatNo: 'C-304', area: 'C 区 · 半开放工位', type: 'semi', capacity: 2, status: 'maintenance', note: '座椅损坏维修中，预计 9 月 12 日恢复' },
]

export const leases: Lease[] = [
  {
    id: 'LS2001',
    enterpriseId: 'E2002',
    enterpriseName: '芯启半导体',
    workstationIds: ['WS1013'],
    workstationLabels: ['B-201'],
    startDate: '2025-03-20',
    endDate: '2027-03-19',
    status: 'active',
    monthlyRent: 18000,
    contactName: '周慕深',
    contactPhone: '13801210004',
  },
  {
    id: 'LS2002',
    enterpriseId: 'E2001',
    enterpriseName: '星澜智能科技',
    workstationIds: ['WS1014'],
    workstationLabels: ['B-202'],
    startDate: '2025-03-12',
    endDate: '2027-03-11',
    status: 'active',
    monthlyRent: 16000,
    contactName: '陈屿',
    contactPhone: '13801210001',
  },
  {
    id: 'LS2003',
    enterpriseId: 'E2004',
    enterpriseName: '云径网络',
    workstationIds: ['WS1001', 'WS1002', 'WS1003', 'WS1004'],
    workstationLabels: ['A-01', 'A-02', 'A-03', 'A-04'],
    startDate: '2025-03-11',
    endDate: '2026-09-10',
    status: 'active',
    monthlyRent: 3200,
    contactName: '陆则铭',
    contactPhone: '13801210008',
  },
  {
    id: 'LS2004',
    enterpriseId: 'E2008',
    enterpriseName: '深空航天科技',
    workstationIds: ['WS1016'],
    workstationLabels: ['B-204'],
    startDate: '2025-03-08',
    endDate: '2027-03-07',
    status: 'active',
    monthlyRent: 17000,
    contactName: '秦朗',
    contactPhone: '13801210012',
  },
  {
    id: 'LS2005',
    enterpriseId: 'E2006',
    enterpriseName: '逐浪出行',
    workstationIds: ['WS1015'],
    workstationLabels: ['B-203'],
    startDate: '2025-04-28',
    endDate: '2027-04-27',
    status: 'active',
    monthlyRent: 14000,
    contactName: '程一诺',
    contactPhone: '13801210010',
  },
  {
    id: 'LS2006',
    enterpriseId: 'E2007',
    enterpriseName: '木白设计工作室',
    workstationIds: ['WS1005', 'WS1006'],
    workstationLabels: ['A-05', 'A-06'],
    startDate: '2025-05-16',
    endDate: '2026-11-15',
    status: 'active',
    monthlyRent: 1600,
    contactName: '孟繁星',
    contactPhone: '13801210011',
  },
  {
    id: 'LS2007',
    enterpriseId: 'E2005',
    enterpriseName: '沧岚新材料',
    workstationIds: ['WS1007', 'WS1008'],
    workstationLabels: ['A-07', 'A-08'],
    startDate: '2025-07-23',
    endDate: '2026-07-22',
    status: 'active',
    monthlyRent: 1600,
    contactName: '白若溪',
    contactPhone: '13801210009',
  },
  {
    id: 'LS2008',
    enterpriseId: 'E2010',
    enterpriseName: '鹿岛文化',
    workstationIds: ['WS1017', 'WS1018'],
    workstationLabels: ['C-301', 'C-302'],
    startDate: '2025-10-01',
    endDate: '2026-06-30',
    status: 'terminated',
    monthlyRent: 1200,
    contactName: '叶知秋',
    contactPhone: '13901219001',
    terminatedAt: '2026-06-28 16:00',
  },
]
