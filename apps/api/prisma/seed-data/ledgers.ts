import type { ExperienceRecord, PointsRecord } from '@/types'

/* 经验值/积分流水账本 — 命名前缀 EX8001+（经验值）/ PT9001+（积分）
 * 经验值：归属社区企业（targetType=enterprise）或社区个体身份（targetType=individual）
 * 积分：归属用户（挂靠个人用户身份，人人可有）
 * balance 为该笔变动后的余额，与企业/用户当前余额保持一致 */

export const experienceRecords: ExperienceRecord[] = [
  /* E2001 星澜智能科技（当前 3200） */
  { id: 'EX8001', targetType: 'enterprise', targetId: 'E2001', delta: 1500, balance: 1500, reason: '「社区知识库共建」立项经验', at: '2025-12-10 14:20', source: 'rule', operator: '系统' },
  { id: 'EX8002', targetType: 'enterprise', targetId: 'E2001', delta: 800, balance: 2300, reason: '年度活跃企业奖励', at: '2026-03-15 10:00', source: 'manual', operator: '社区管理员' },
  { id: 'EX8003', targetType: 'enterprise', targetId: 'E2001', delta: -200, balance: 2100, reason: '共享会议室超时使用扣减', at: '2026-06-01 09:30', source: 'manual', operator: '社区管理员' },
  { id: 'EX8004', targetType: 'enterprise', targetId: 'E2001', delta: 700, balance: 2800, reason: '「聚屿小程序共研计划」启动经验', at: '2026-07-15 16:00', source: 'rule', operator: '系统' },
  { id: 'EX8005', targetType: 'enterprise', targetId: 'E2001', delta: 400, balance: 3200, reason: '主办「第 12 期创业夜话」分享', at: '2026-09-05 19:00', source: 'manual', operator: '社区管理员' },
  /* E2002 芯启半导体（当前 4800） */
  { id: 'EX8006', targetType: 'enterprise', targetId: 'E2002', delta: 2000, balance: 2000, reason: '「半导体供应链对接专项」经验', at: '2025-10-20 11:00', source: 'manual', operator: '社区管理员' },
  { id: 'EX8007', targetType: 'enterprise', targetId: 'E2002', delta: 1200, balance: 3200, reason: '年度贡献企业奖励', at: '2026-01-15 15:30', source: 'manual', operator: '社区管理员' },
  { id: 'EX8008', targetType: 'enterprise', targetId: 'E2002', delta: -300, balance: 2900, reason: '设备共享档期违约扣减', at: '2026-05-30 10:15', source: 'manual', operator: '社区管理员' },
  { id: 'EX8009', targetType: 'enterprise', targetId: 'E2002', delta: 1900, balance: 4800, reason: '供应链专项结项奖励', at: '2026-09-01 14:00', source: 'rule', operator: '系统' },
  /* E2003 拾光文创（当前 100） */
  { id: 'EX8010', targetType: 'enterprise', targetId: 'E2003', delta: 100, balance: 100, reason: '提交入驻申请', at: '2026-09-06 10:18', source: 'rule', operator: '系统' },
  /* E2004 云径网络（当前 2100） */
  { id: 'EX8011', targetType: 'enterprise', targetId: 'E2004', delta: 1000, balance: 1000, reason: '「社区知识库共建」发起经验', at: '2026-02-10 09:00', source: 'manual', operator: '社区管理员' },
  { id: 'EX8012', targetType: 'enterprise', targetId: 'E2004', delta: 600, balance: 1600, reason: '开源组件库共建贡献', at: '2026-06-20 17:40', source: 'manual', operator: '社区管理员' },
  { id: 'EX8013', targetType: 'enterprise', targetId: 'E2004', delta: 500, balance: 2100, reason: '导师计划筹备经验', at: '2026-08-15 11:20', source: 'manual', operator: '社区管理员' },
  /* E2005 沧岚新材料（当前 1200） */
  { id: 'EX8014', targetType: 'enterprise', targetId: 'E2005', delta: 600, balance: 600, reason: '入驻奖励', at: '2026-03-01 10:00', source: 'rule', operator: '系统' },
  { id: 'EX8015', targetType: 'enterprise', targetId: 'E2005', delta: 600, balance: 1200, reason: '检测设备共享协作', at: '2026-07-20 15:10', source: 'manual', operator: '社区管理员' },
  /* E2006 逐浪出行（当前 2400） */
  { id: 'EX8016', targetType: 'enterprise', targetId: 'E2006', delta: 800, balance: 800, reason: '入驻奖励', at: '2026-04-28 09:30', source: 'rule', operator: '系统' },
  { id: 'EX8017', targetType: 'enterprise', targetId: 'E2006', delta: 1000, balance: 1800, reason: '「智慧园区访客系统」立项经验', at: '2026-07-10 14:45', source: 'rule', operator: '系统' },
  { id: 'EX8018', targetType: 'enterprise', targetId: 'E2006', delta: 600, balance: 2400, reason: '试点进度奖励', at: '2026-09-03 13:40', source: 'manual', operator: '社区管理员' },
  /* E2007 木白设计工作室（当前 1500） */
  { id: 'EX8019', targetType: 'enterprise', targetId: 'E2007', delta: 500, balance: 500, reason: '入驻奖励', at: '2026-05-16 10:00', source: 'rule', operator: '系统' },
  { id: 'EX8020', targetType: 'enterprise', targetId: 'E2007', delta: 600, balance: 1100, reason: '联名周边设计定稿', at: '2026-08-20 16:30', source: 'manual', operator: '社区管理员' },
  { id: 'EX8021', targetType: 'enterprise', targetId: 'E2007', delta: 400, balance: 1500, reason: '设计思维工作坊主办', at: '2026-09-18 17:30', source: 'manual', operator: '社区管理员' },
  /* E2008 深空航天科技（当前 5100） */
  { id: 'EX8022', targetType: 'enterprise', targetId: 'E2008', delta: 1800, balance: 1800, reason: '年度路演最佳企业', at: '2025-11-05 18:00', source: 'manual', operator: '社区管理员' },
  { id: 'EX8023', targetType: 'enterprise', targetId: 'E2008', delta: 1500, balance: 3300, reason: '检测设备开放共享', at: '2026-03-20 11:00', source: 'manual', operator: '社区管理员' },
  { id: 'EX8024', targetType: 'enterprise', targetId: 'E2008', delta: 800, balance: 4100, reason: '硬件创业者圆桌主办', at: '2026-08-30 21:00', source: 'manual', operator: '社区管理员' },
  { id: 'EX8025', targetType: 'enterprise', targetId: 'E2008', delta: 1000, balance: 5100, reason: '路演厅预约协作奖励', at: '2026-09-06 11:30', source: 'manual', operator: '社区管理员' },
  /* E2009 青柠健康（当前 600） */
  { id: 'EX8026', targetType: 'enterprise', targetId: 'E2009', delta: 300, balance: 300, reason: '入驻奖励', at: '2026-08-05 10:00', source: 'rule', operator: '系统' },
  { id: 'EX8027', targetType: 'enterprise', targetId: 'E2009', delta: 300, balance: 600, reason: '需求发布活跃奖励', at: '2026-09-02 14:00', source: 'manual', operator: '社区管理员' },
  /* 社区个体：U1005 顾北辰（当前 1500） */
  { id: 'EX8028', targetType: 'individual', targetId: 'U1005', delta: 600, balance: 600, reason: '响应「SaaS 控制台 UI 设计外包」', at: '2026-09-02 17:44', source: 'manual', operator: '社区管理员' },
  { id: 'EX8029', targetType: 'individual', targetId: 'U1005', delta: 500, balance: 1100, reason: '设计协作贡献', at: '2026-08-15 19:20', source: 'manual', operator: '社区管理员' },
  { id: 'EX8030', targetType: 'individual', targetId: 'U1005', delta: 400, balance: 1500, reason: '参与「跨企业 AI 路演季」物料设计', at: '2026-09-06 08:50', source: 'manual', operator: '社区管理员' },
  /* 社区个体：U1002 林晚舟（当前 800） */
  { id: 'EX8031', targetType: 'individual', targetId: 'U1002', delta: 400, balance: 400, reason: '开源组件库共建', at: '2026-06-20 17:40', source: 'manual', operator: '社区管理员' },
  { id: 'EX8032', targetType: 'individual', targetId: 'U1002', delta: 400, balance: 800, reason: '里程碑评审通过奖励', at: '2026-09-01 11:26', source: 'rule', operator: '系统' },
  /* 社区个体：U1006 沈嘉禾（当前 200） */
  { id: 'EX8033', targetType: 'individual', targetId: 'U1006', delta: 200, balance: 200, reason: '提交入驻申请', at: '2026-09-06 10:18', source: 'rule', operator: '系统' },
  /* 社区个体：U1012 秦朗（当前 2600） */
  { id: 'EX8034', targetType: 'individual', targetId: 'U1012', delta: 800, balance: 800, reason: '入驻分享嘉宾', at: '2026-03-08 15:00', source: 'rule', operator: '系统' },
  { id: 'EX8035', targetType: 'individual', targetId: 'U1012', delta: 1000, balance: 1800, reason: '新材料趋势分享会主办', at: '2026-05-20 16:00', source: 'manual', operator: '社区管理员' },
  { id: 'EX8036', targetType: 'individual', targetId: 'U1012', delta: -200, balance: 1600, reason: '路演厅设备使用超时扣减', at: '2026-09-05 17:00', source: 'manual', operator: '社区管理员' },
  { id: 'EX8037', targetType: 'individual', targetId: 'U1012', delta: 1000, balance: 2600, reason: '年度路演嘉宾奖励', at: '2026-09-06 09:00', source: 'manual', operator: '社区管理员' },
  /* 社区个体：U1014 方致远（当前 100） */
  { id: 'EX8038', targetType: 'individual', targetId: 'U1014', delta: 200, balance: 200, reason: '活动参与奖励', at: '2026-08-01 20:00', source: 'manual', operator: '社区管理员' },
  { id: 'EX8039', targetType: 'individual', targetId: 'U1014', delta: -100, balance: 100, reason: '社区规范违规扣减', at: '2026-08-12 22:10', source: 'manual', operator: '社区管理员' },
]

export const pointsRecords: PointsRecord[] = [
  /* U1001 陈屿（当前 2860） */
  { id: 'PT9001', userId: 'U1001', delta: 1000, balance: 1000, reason: '需求「社区小程序」立项积分', at: '2026-05-20 10:00', source: 'rule', operator: '系统' },
  { id: 'PT9002', userId: 'U1001', delta: 860, balance: 1860, reason: '项目里程碑达成奖励', at: '2026-08-25 14:11', source: 'rule', operator: '系统' },
  { id: 'PT9003', userId: 'U1001', delta: 1000, balance: 2860, reason: '年度活跃成员奖励', at: '2026-09-05 19:30', source: 'manual', operator: '社区管理员' },
  /* U1002 林晚舟（当前 1950） */
  { id: 'PT9004', userId: 'U1002', delta: 600, balance: 600, reason: '组件库共建积分', at: '2026-06-20 17:40', source: 'manual', operator: '社区管理员' },
  { id: 'PT9005', userId: 'U1002', delta: 650, balance: 1250, reason: '里程碑评审通过', at: '2026-08-30 09:40', source: 'rule', operator: '系统' },
  { id: 'PT9006', userId: 'U1002', delta: -300, balance: 950, reason: '兑换「会议室优先预约卡」', at: '2026-08-25 09:40', source: 'redemption', operator: '系统' },
  { id: 'PT9007', userId: 'U1002', delta: 1000, balance: 1950, reason: '知识库共建奖励', at: '2026-09-01 11:26', source: 'manual', operator: '社区管理员' },
  /* U1005 顾北辰（当前 600） */
  { id: 'PT9008', userId: 'U1005', delta: 400, balance: 400, reason: '响应需求奖励', at: '2026-09-02 17:44', source: 'manual', operator: '社区管理员' },
  { id: 'PT9009', userId: 'U1005', delta: 380, balance: 780, reason: '设计协作积分', at: '2026-08-15 19:20', source: 'manual', operator: '社区管理员' },
  { id: 'PT9010', userId: 'U1005', delta: 200, balance: 980, reason: '活动签到积分', at: '2026-08-30 19:03', source: 'rule', operator: '系统' },
  /* U1012 秦朗（当前 3020） */
  { id: 'PT9011', userId: 'U1012', delta: 1200, balance: 1200, reason: '路演嘉宾积分', at: '2026-03-08 15:00', source: 'manual', operator: '社区管理员' },
  { id: 'PT9012', userId: 'U1012', delta: 1000, balance: 2200, reason: '分享会主办积分', at: '2026-05-20 16:00', source: 'manual', operator: '社区管理员' },
  { id: 'PT9013', userId: 'U1012', delta: -180, balance: 2020, reason: '积分商城兑换礼品', at: '2026-07-11 12:00', source: 'redemption', operator: '系统' },
  { id: 'PT9014', userId: 'U1012', delta: 1000, balance: 3020, reason: '年度贡献奖励', at: '2026-09-06 09:00', source: 'manual', operator: '社区管理员' },
  /* U1014 方致远（当前 320） */
  { id: 'PT9015', userId: 'U1014', delta: 400, balance: 400, reason: '活动参与积分', at: '2026-08-01 20:00', source: 'manual', operator: '社区管理员' },
  { id: 'PT9016', userId: 'U1014', delta: -80, balance: 320, reason: '违规扣减积分', at: '2026-08-12 22:10', source: 'manual', operator: '社区管理员' },
  /* 积分商城兑换扣减流水（与 mock/mall.ts 兑换订单一一对应）
   * RO2003 → U1005 兑换周边礼包 -380，余额 980→600（末笔） */
  { id: 'PT9017', userId: 'U1005', delta: -380, balance: 600, reason: '兑换「社区文创周边礼包」', at: '2026-09-07 15:40', source: 'redemption', operator: '系统' },
  /* RO2004 → U1001 兑换咖啡月卡 -150，余额 2860→2710（末笔） */
  { id: 'PT9018', userId: 'U1001', delta: -150, balance: 2710, reason: '兑换「精品咖啡月卡」', at: '2026-09-06 20:15', source: 'redemption', operator: '系统' },
  /* RO2005 → U1002 兑换路演彩排时长券 -260，余额 1950→1690（末笔） */
  { id: 'PT9019', userId: 'U1002', delta: -260, balance: 1690, reason: '兑换「路演彩排时长券」', at: '2026-09-06 11:05', source: 'redemption', operator: '系统' },
  /* RO2006 → U1014 兑换后取消，-120 后 +120 退回，余额 320 不变（末笔 PT9021） */
  { id: 'PT9020', userId: 'U1014', delta: -120, balance: 200, reason: '兑换「精品咖啡券」', at: '2026-09-02 10:00', source: 'redemption', operator: '系统' },
  { id: 'PT9021', userId: 'U1014', delta: 120, balance: 320, reason: '订单取消退回积分（RO2006）', at: '2026-09-02 18:30', source: 'manual', operator: '社区管理员' },
  /* U1006 沈嘉禾（当前 0）— 暂无流水 */
]
